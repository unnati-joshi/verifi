const express = require('express');
const store = require('../db');
const engine = require('../engine');
const { HttpError } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function toSummary(row) {
  return {
    id: row.id,
    productType: row.product_type,
    title: row.title,
    overallScore: row.overall_score,
    grade: row.grade,
    createdAt: row.created_at,
  };
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}

router.get('/', (req, res) => {
  const { db } = store;
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const where = ['user_id = @userId'];
  const params = { userId: req.userId, limit, offset };

  if (req.query.type) {
    if (!engine.productTypes.includes(req.query.type)) throw new HttpError(400, 'Invalid type filter');
    where.push('product_type = @type');
    params.type = req.query.type;
  }
  if (req.query.q) {
    where.push("title LIKE @q ESCAPE '\\'");
    params.q = `%${String(req.query.q).replace(/[\\%_]/g, '\\$&')}%`;
  }
  if (req.query.grade) {
    where.push('grade = @grade');
    params.grade = String(req.query.grade).toUpperCase();
  }

  const clause = where.join(' AND ');
  const rows = db
    .prepare(`SELECT * FROM reports WHERE ${clause} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`)
    .all(params);
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM reports WHERE ${clause}`).get(params);

  res.json({ reports: rows.map(toSummary), total, limit, offset });
});

router.get('/stats', (req, res) => {
  const { db } = store;
  const totals = db
    .prepare('SELECT COUNT(*) AS count, ROUND(AVG(overall_score)) AS avgScore FROM reports WHERE user_id = ?')
    .get(req.userId);
  const byType = db
    .prepare('SELECT product_type AS type, COUNT(*) AS count, ROUND(AVG(overall_score)) AS avgScore FROM reports WHERE user_id = ? GROUP BY product_type')
    .all(req.userId);
  const byGrade = db
    .prepare('SELECT grade, COUNT(*) AS count FROM reports WHERE user_id = ? GROUP BY grade ORDER BY grade')
    .all(req.userId);
  const recent = db
    .prepare('SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 5')
    .all(req.userId)
    .map(toSummary);
  const { watchCount } = db.prepare('SELECT COUNT(*) AS watchCount FROM watchlist WHERE user_id = ?').get(req.userId);

  res.json({ total: totals.count, avgScore: totals.avgScore, byType, byGrade, recent, watchCount });
});

router.post('/', (req, res) => {
  const { db } = store;
  const { productType, input, title, watchlistId } = req.body || {};

  // Always recompute server-side; never trust a client-supplied result.
  const report = engine.evaluate(productType, input);
  const reportTitle = String(title || report.title).trim().slice(0, 140) || report.title;

  let watchItem;
  if (watchlistId !== undefined && watchlistId !== null) {
    watchItem = db.prepare('SELECT * FROM watchlist WHERE id = ? AND user_id = ?').get(parseId(watchlistId), req.userId);
    if (!watchItem) throw new HttpError(404, 'Watchlist item not found');
    if (watchItem.product_type !== productType) throw new HttpError(400, 'Watchlist item is for a different product type');
  }

  const save = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO reports (user_id, product_type, title, input_json, result_json, overall_score, grade)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(req.userId, productType, reportTitle, JSON.stringify(report.input), JSON.stringify(report), report.overallScore, report.grade);
    if (watchItem) db.prepare('UPDATE watchlist SET last_report_id = ? WHERE id = ?').run(lastInsertRowid, watchItem.id);
    return lastInsertRowid;
  });

  const id = save();
  res.status(201).json({ id, report: { ...report, title: reportTitle } });
});

router.get('/:id', (req, res) => {
  const row = store.db.prepare('SELECT * FROM reports WHERE id = ? AND user_id = ?').get(parseId(req.params.id), req.userId);
  if (!row) throw new HttpError(404, 'Report not found');
  res.json({ ...toSummary(row), report: { ...JSON.parse(row.result_json), title: row.title } });
});

router.delete('/:id', (req, res) => {
  const { changes } = store.db
    .prepare('DELETE FROM reports WHERE id = ? AND user_id = ?')
    .run(parseId(req.params.id), req.userId);
  if (!changes) throw new HttpError(404, 'Report not found');
  res.status(204).end();
});

module.exports = router;
