const express = require('express');
const store = require('../db');
const engine = require('../engine');
const { HttpError } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const SELECT_ITEMS = `
  SELECT w.*, r.overall_score, r.grade, r.created_at AS report_created_at
  FROM watchlist w
  LEFT JOIN reports r ON r.id = w.last_report_id
  WHERE w.user_id = ?`;

function toItem(row) {
  return {
    id: row.id,
    name: row.name,
    productType: row.product_type,
    identifier: row.identifier,
    notes: row.notes,
    createdAt: row.created_at,
    lastReport: row.last_report_id
      ? { id: row.last_report_id, overallScore: row.overall_score, grade: row.grade, createdAt: row.report_created_at }
      : null,
  };
}

function parseBody(body = {}, partial = false) {
  const out = {};
  const errors = {};
  if (!partial || body.name !== undefined) {
    out.name = String(body.name || '').trim();
    if (out.name.length < 2 || out.name.length > 120) errors.name = 'Name must be 2–120 characters';
  }
  if (!partial || body.productType !== undefined) {
    out.productType = body.productType;
    if (!engine.productTypes.includes(out.productType)) errors.productType = 'Choose loan, insurance or upi';
  }
  if (body.identifier !== undefined) out.identifier = String(body.identifier || '').trim().slice(0, 200) || null;
  if (body.notes !== undefined) out.notes = String(body.notes || '').trim().slice(0, 1000) || null;
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return out;
}

function loadItem(id, userId) {
  const item = store.db.prepare(`${SELECT_ITEMS} AND w.id = ?`).get(userId, id);
  if (!item) throw new HttpError(404, 'Watchlist item not found');
  return item;
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}

router.get('/', (req, res) => {
  const rows = store.db.prepare(`${SELECT_ITEMS} ORDER BY w.created_at DESC, w.id DESC`).all(req.userId);
  res.json({ items: rows.map(toItem) });
});

router.post('/', (req, res) => {
  const data = parseBody(req.body);
  try {
    const { lastInsertRowid } = store.db
      .prepare('INSERT INTO watchlist (user_id, name, product_type, identifier, notes) VALUES (?, ?, ?, ?, ?)')
      .run(req.userId, data.name, data.productType, data.identifier ?? null, data.notes ?? null);
    res.status(201).json({ item: toItem(loadItem(lastInsertRowid, req.userId)) });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new HttpError(409, 'This entity is already on your watchlist');
    throw err;
  }
});

router.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  loadItem(id, req.userId);
  const data = parseBody(req.body, true);
  const columns = { name: 'name', productType: 'product_type', identifier: 'identifier', notes: 'notes' };
  const sets = Object.keys(data).map((k) => `${columns[k]} = @${k}`);
  if (sets.length) {
    try {
      store.db.prepare(`UPDATE watchlist SET ${sets.join(', ')} WHERE id = @id`).run({ ...data, id });
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new HttpError(409, 'This entity is already on your watchlist');
      throw err;
    }
  }
  res.json({ item: toItem(loadItem(id, req.userId)) });
});

router.get('/:id/reports', (req, res) => {
  const item = loadItem(parseId(req.params.id), req.userId);
  const rows = store.db
    .prepare(
      `SELECT id, title, overall_score, grade, created_at FROM reports
       WHERE user_id = ? AND product_type = ? AND (title = ? COLLATE NOCASE OR id = ?)
       ORDER BY created_at DESC, id DESC LIMIT 50`,
    )
    .all(req.userId, item.product_type, item.name, item.last_report_id || 0);
  res.json({
    item: toItem(item),
    history: rows.map((r) => ({ id: r.id, title: r.title, overallScore: r.overall_score, grade: r.grade, createdAt: r.created_at })),
  });
});

router.delete('/:id', (req, res) => {
  const { changes } = store.db
    .prepare('DELETE FROM watchlist WHERE id = ? AND user_id = ?')
    .run(parseId(req.params.id), req.userId);
  if (!changes) throw new HttpError(404, 'Watchlist item not found');
  res.status(204).end();
});

module.exports = router;
