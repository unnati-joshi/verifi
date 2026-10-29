const config = require('./config');
const store = require('./db');
const { createApp } = require('./app');

store.db; // open the database and apply the schema before accepting traffic

const server = createApp().listen(config.port, process.env.HOST || '0.0.0.0', () => {
  console.log(`verifi running at ${config.appUrl} (${config.env})`);
  console.log(`Google OAuth: ${config.google.enabled ? 'enabled' : 'disabled — set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET'}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  // Force exit if open connections keep the server alive.
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
