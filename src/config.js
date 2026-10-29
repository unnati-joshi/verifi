const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const env = process.env.NODE_ENV || 'development';
const port = Number(process.env.PORT) || 3000;
const trustProxy = process.env.TRUST_PROXY;

const config = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  port,
  appUrl: (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  // Hop count (e.g. 1) or a subnet list understood by Express.
  trustProxy: trustProxy === undefined ? 1 : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'verifi.db'),
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },
};

config.google.enabled = Boolean(config.google.clientId && config.google.clientSecret);
config.google.redirectUri = `${config.appUrl}/api/auth/google/callback`;

if (config.isProd) {
  if (config.jwt.secret.startsWith('dev-only') || config.jwt.secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production');
  }
  if (!process.env.APP_URL) console.warn('[config] APP_URL is not set; OAuth redirects will point at localhost');
}

module.exports = config;
