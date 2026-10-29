const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config');
const store = require('./db');
const { notFound, errorHandler } = require('./middleware/errors');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Needed behind a reverse proxy (Render, Railway, Nginx) for secure cookies and rate limiting by client IP.
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com'],
          styleSrcAttr: ["'unsafe-inline'"],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https://lh3.googleusercontent.com'],
          connectSrc: ["'self'"],
          formAction: ["'self'", 'https://accounts.google.com'],
        },
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    store.db.prepare('SELECT 1').get();
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/engine', require('./routes/engine'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/watchlist', require('./routes/watchlist'));
  app.use('/api', notFound);

  app.use(
    express.static(PUBLIC_DIR, {
      extensions: ['html'],
      maxAge: config.isProd ? '1h' : 0,
      setHeaders(res, filePath) {
        // HTML must revalidate so deploys show up immediately; assets can be cached briefly.
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) return res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
    next();
  });
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
