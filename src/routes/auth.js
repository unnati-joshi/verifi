const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const store = require('../db');
const { HttpError } = require('../middleware/errors');
const { signToken, setAuthCookie, clearAuthCookie, requireAuth } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STATE_COOKIE = 'verifi_oauth_state';
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatar_url,
    hasPassword: Boolean(u.password_hash),
    googleLinked: Boolean(u.google_id),
    createdAt: u.created_at,
  };
}

function issueSession(res, user, status = 200) {
  const token = signToken(user);
  setAuthCookie(res, token);
  res.status(status).json({ token, user: publicUser(user) });
}

router.get('/config', (_req, res) => {
  res.json({ googleEnabled: config.google.enabled });
});

router.post('/register', authLimiter, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const errors = {};
  if (name.length < 2 || name.length > 80) errors.name = 'Name must be 2–80 characters';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
  if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Password must contain letters and numbers';
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);

  const { db } = store;
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const hash = await bcrypt.hash(password, 12);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
    .run(email, name, hash);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
  issueSession(res, user, 201);
});

router.post('/login', authLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw new HttpError(400, 'Email and password are required');

  const user = store.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && !user.password_hash) throw new HttpError(401, 'This account uses Google sign-in');
  // Compare even when the user is missing so response timing doesn't reveal which emails exist.
  const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password');
  issueSession(res, user);
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  const user = store.db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: publicUser(user) });
});

// ---------- Google OAuth 2.0 (authorization code flow) ----------

router.get('/google', (_req, res) => {
  if (!config.google.enabled) throw new HttpError(503, 'Google sign-in is not configured on this server');

  // Random state bound to an httpOnly cookie protects the callback against CSRF.
  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  const fail = (reason) => res.redirect(`/login.html?error=${encodeURIComponent(reason)}`);
  const expected = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE);

  if (req.query.error) return fail('Google sign-in was cancelled');
  if (!config.google.enabled) return fail('Google sign-in is not configured');
  if (!req.query.code || !expected || req.query.state !== expected) return fail('Invalid OAuth state, please try again');

  let profile;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
    const { access_token: accessToken } = await tokenRes.json();

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!infoRes.ok) throw new Error(`userinfo failed: ${infoRes.status}`);
    profile = await infoRes.json();
  } catch (err) {
    console.error('[oauth]', err.message);
    return fail('Could not complete Google sign-in');
  }

  if (!profile.email || !profile.email_verified) return fail('Your Google email is not verified');

  const { db } = store;
  const email = profile.email.toLowerCase();
  let user =
    db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.sub) ||
    db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (user) {
    // Link Google to an existing email/password account on first Google login.
    db.prepare('UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?').run(
      profile.sub,
      profile.picture || null,
      user.id,
    );
  } else {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (email, name, google_id, avatar_url) VALUES (?, ?, ?, ?)')
      .run(email, profile.name || email.split('@')[0], profile.sub, profile.picture || null);
    user = { id: lastInsertRowid };
  }
  user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);

  setAuthCookie(res, signToken(user));
  res.redirect('/dashboard.html');
});

module.exports = router;
