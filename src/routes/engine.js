const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const engine = require('../engine');

const router = express.Router();

router.get('/schema', (_req, res) => {
  res.json(engine.describe());
});

// Public, stateless preview so visitors can try the engine before signing up.
router.post(
  '/analyze/:type',
  rateLimit({ windowMs: 60 * 1000, limit: config.isTest ? 1000 : 30, standardHeaders: 'draft-7', legacyHeaders: false }),
  (req, res) => {
    res.json({ report: engine.evaluate(req.params.type, req.body) });
  },
);

// Lightweight, read-only check of a UPI ID as the visitor types it.
router.get(
  '/upi-id',
  rateLimit({ windowMs: 60 * 1000, limit: config.isTest ? 1000 : 120, standardHeaders: 'draft-7', legacyHeaders: false }),
  (req, res) => {
    res.json(engine.inspectUpiId(String(req.query.id || '').slice(0, 320)));
  },
);

module.exports = router;
