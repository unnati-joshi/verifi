process.env.NODE_ENV = 'test';
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const store = require('../src/db');

const app = createApp();

async function signUp(email = `u${Date.now()}${Math.random()}@test.dev`) {
  const res = await request(app).post('/api/auth/register').send({ name: 'Test User', email, password: 'secret123' });
  assert.equal(res.status, 201);
  return { token: res.body.token, user: res.body.user, email };
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const upiInput = {
  payeeName: 'Kirana', upiId: 'shop@okaxis', nameMatches: true, firstTimePayee: false,
  amount: 500, transactionType: 'pay', source: 'merchant',
};

test.after(() => store.close());

test('database runs in WAL-capable mode with foreign keys', () => {
  assert.equal(store.db.pragma('foreign_keys', { simple: true }), 1);
  // In-memory databases report "memory"; on disk this is "wal".
  assert.ok(['wal', 'memory'].includes(store.db.pragma('journal_mode', { simple: true })));
});

test('register validates input', async () => {
  const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'bad', password: 'short' });
  assert.equal(res.status, 400);
  assert.ok(res.body.details.name && res.body.details.email && res.body.details.password);
});

test('register, duplicate, login and /me', async () => {
  const { email, token } = await signUp();
  const dup = await request(app).post('/api/auth/register').send({ name: 'X Y', email, password: 'secret123' });
  assert.equal(dup.status, 409);

  const bad = await request(app).post('/api/auth/login').send({ email, password: 'wrongpass1' });
  assert.equal(bad.status, 401);

  const login = await request(app).post('/api/auth/login').send({ email: email.toUpperCase(), password: 'secret123' });
  assert.equal(login.status, 200);
  assert.match(login.headers['set-cookie'][0], /verifi_token=.*HttpOnly/i);

  const me = await request(app).get('/api/auth/me').set(auth(token));
  assert.equal(me.body.user.email, email);
  assert.equal(me.body.user.password_hash, undefined);
});

test('protected routes require a valid JWT', async () => {
  assert.equal((await request(app).get('/api/reports')).status, 401);
  assert.equal((await request(app).get('/api/reports').set(auth('garbage'))).status, 401);
});

test('cookie auth works for browser clients', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ name: 'Cookie User', email: `c${Date.now()}@test.dev`, password: 'secret123' });
  assert.equal((await agent.get('/api/auth/me')).status, 200);
  await agent.post('/api/auth/logout');
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('google oauth reports disabled when unconfigured', async () => {
  const cfg = await request(app).get('/api/auth/config');
  assert.equal(cfg.body.googleEnabled, false);
  assert.equal((await request(app).get('/api/auth/google')).status, 503);
  const cb = await request(app).get('/api/auth/google/callback?code=x&state=y');
  assert.equal(cb.status, 302);
  assert.match(cb.headers.location, /login\.html\?error=/);
});

test('public analyze endpoint returns a report without saving', async () => {
  const res = await request(app).post('/api/engine/analyze/upi').send(upiInput);
  assert.equal(res.status, 200);
  assert.equal(res.body.report.grade, 'A');
  const bad = await request(app).post('/api/engine/analyze/upi').send({});
  assert.equal(bad.status, 400);
  assert.ok(bad.body.details.upiId);
});

test('UPI ID quick check flags bait words and unknown handles', async () => {
  const bad = await request(app).get('/api/engine/upi-id').query({ id: 'kyc.refund@xyzpay' });
  assert.equal(bad.body.valid, true);
  assert.deepEqual(bad.body.findings.map((f) => f.id).sort(), ['UPI_BAIT_HANDLE', 'UPI_UNKNOWN_PSP']);

  const ok = await request(app).get('/api/engine/upi-id').query({ id: 'ramesh@okaxis' });
  assert.equal(ok.body.knownPsp, true);
  assert.equal(ok.body.findings.length, 0);

  const invalid = await request(app).get('/api/engine/upi-id').query({ id: 'not an id' });
  assert.equal(invalid.body.valid, false);
});

test('report CRUD is scoped to the owner', async () => {
  const a = await signUp();
  const b = await signUp();

  const created = await request(app).post('/api/reports').set(auth(a.token)).send({ productType: 'upi', input: upiInput });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const list = await request(app).get('/api/reports?type=upi&q=kir').set(auth(a.token));
  assert.equal(list.body.total, 1);
  assert.equal(list.body.reports[0].grade, 'A');

  const stats = await request(app).get('/api/reports/stats').set(auth(a.token));
  assert.equal(stats.body.total, 1);

  assert.equal((await request(app).get(`/api/reports/${id}`).set(auth(b.token))).status, 404);
  assert.equal((await request(app).delete(`/api/reports/${id}`).set(auth(b.token))).status, 404);

  const one = await request(app).get(`/api/reports/${id}`).set(auth(a.token));
  assert.equal(one.body.report.input.upiId, 'shop@okaxis');

  assert.equal((await request(app).delete(`/api/reports/${id}`).set(auth(a.token))).status, 204);
  assert.equal((await request(app).get(`/api/reports/${id}`).set(auth(a.token))).status, 404);
});

test('server recomputes results instead of trusting the client', async () => {
  const { token } = await signUp();
  const res = await request(app)
    .post('/api/reports')
    .set(auth(token))
    .send({ productType: 'upi', input: { ...upiInput, otpOrPinShared: true }, result: { grade: 'A', overallScore: 100 } });
  assert.notEqual(res.body.report.grade, 'A');
});

test('watchlist CRUD and linking a report', async () => {
  const { token } = await signUp();
  const add = await request(app).post('/api/watchlist').set(auth(token)).send({ name: 'Kirana', productType: 'upi', identifier: 'shop@okaxis' });
  assert.equal(add.status, 201);
  const wid = add.body.item.id;

  const dup = await request(app).post('/api/watchlist').set(auth(token)).send({ name: 'Kirana', productType: 'upi' });
  assert.equal(dup.status, 409);

  const wrongType = await request(app).post('/api/reports').set(auth(token)).send({
    productType: 'loan',
    input: { lenderName: 'x', lenderType: 'bank', principal: 10000, interestRate: 10, tenureMonths: 12 },
    watchlistId: wid,
  });
  assert.equal(wrongType.status, 400);

  await request(app).post('/api/reports').set(auth(token)).send({ productType: 'upi', input: upiInput, watchlistId: wid });
  const list = await request(app).get('/api/watchlist').set(auth(token));
  assert.equal(list.body.items[0].lastReport.grade, 'A');

  const patched = await request(app).patch(`/api/watchlist/${wid}`).set(auth(token)).send({ notes: 'regular shop' });
  assert.equal(patched.body.item.notes, 'regular shop');

  const hist = await request(app).get(`/api/watchlist/${wid}/reports`).set(auth(token));
  assert.equal(hist.body.history.length, 1);

  assert.equal((await request(app).delete(`/api/watchlist/${wid}`).set(auth(token))).status, 204);
});

test('unknown API routes return JSON 404', async () => {
  const res = await request(app).get('/api/nope');
  assert.equal(res.status, 404);
  assert.ok(res.body.error);
});
