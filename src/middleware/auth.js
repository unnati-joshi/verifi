const jwt = require('jsonwebtoken');
const config = require('../config');
const { HttpError } = require('./errors');

const COOKIE_NAME = 'verifi_token';

function signToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: 'verifi',
  });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.isProd });
}

// Accepts either "Authorization: Bearer <jwt>" (API clients) or the httpOnly cookie (browser).
function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.[COOKIE_NAME];
  if (!token) return next(new HttpError(401, 'Authentication required'));

  try {
    const payload = jwt.verify(token, config.jwt.secret, { issuer: 'verifi' });
    req.userId = Number(payload.sub);
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

module.exports = { COOKIE_NAME, signToken, setAuthCookie, clearAuthCookie, requireAuth };
