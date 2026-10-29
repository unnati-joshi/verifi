process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, describe: describeEngine } = require('../src/engine');

const safeLoan = {
  lenderName: 'State Bank Personal Loan', lenderType: 'bank', rbiRegistered: true, principal: 300000,
  interestRate: 11, tenureMonths: 36, processingFeePct: 1, kfsProvided: true, aprDisclosed: true, monthlyIncome: 80000,
};

test('safe bank loan grades A with no issues', () => {
  const r = evaluate('loan', safeLoan);
  assert.equal(r.grade, 'A');
  assert.equal(r.findings.filter((f) => f.severity !== 'positive').length, 0);
  assert.ok(r.metrics.emi > 9000 && r.metrics.emi < 10500);
});

test('effective APR includes processing fee', () => {
  const r = evaluate('loan', { ...safeLoan, processingFeePct: 10 });
  assert.ok(r.metrics.effectiveApr > r.input.interestRate + 3);
  assert.ok(r.findings.some((f) => f.id === 'LOAN_HIDDEN_COST'));
});

test('any critical finding caps the score below grade C', () => {
  const r = evaluate('loan', { ...safeLoan, upfrontFeeBeforeDisbursal: true });
  assert.ok(r.overallScore <= 39);
  assert.ok(['D', 'E'].includes(r.grade));
  assert.equal(r.findings[0].severity, 'critical');
});

test('foreclosure charge on floating-rate loan is flagged', () => {
  const r = evaluate('loan', { ...safeLoan, rateType: 'floating', prepaymentPenaltyPct: 2 });
  assert.ok(r.findings.some((f) => f.id === 'LOAN_FLOATING_FORECLOSURE'));
});

test('EMI over half of income is critical', () => {
  const r = evaluate('loan', { ...safeLoan, monthlyIncome: 15000 });
  assert.ok(r.findings.some((f) => f.id === 'LOAN_UNAFFORDABLE'));
});

test('ULIP mis-selling raises complexity and lowers transparency', () => {
  const r = evaluate('insurance', {
    insurerName: 'X Life', irdaiRegistered: true, claimSettlementRatio: 96, policyType: 'ulip',
    annualPremium: 100000, sumAssured: 500000, policyTermYears: 10, guaranteedReturnsPitched: true,
  });
  const ids = r.findings.map((f) => f.id);
  assert.ok(ids.includes('INS_INVESTMENT_LINKED'));
  assert.ok(ids.includes('INS_GUARANTEED_RETURNS'));
  assert.ok(ids.includes('INS_LOW_COVER_MULTIPLE'));
  assert.ok(r.scores.complexity > 30);
});

test('unregistered insurer is critical', () => {
  const r = evaluate('insurance', {
    insurerName: 'Fly-by-night', policyType: 'health', annualPremium: 10000, sumAssured: 500000, policyTermYears: 1,
  });
  assert.ok(r.findings.some((f) => f.id === 'INS_UNREGISTERED' && f.severity === 'critical'));
});

test('UPI PIN-to-receive scam grades E', () => {
  const r = evaluate('upi', {
    payeeName: 'Refund', upiId: 'refund.support@xyzpay', amount: 5000,
    transactionType: 'collect_request', source: 'unsolicited', expectingToReceive: true,
  });
  assert.equal(r.grade, 'E');
  assert.deepEqual(r.metrics.baitWords, ['refund', 'support']);
});

test('known merchant UPI payment is low risk', () => {
  const r = evaluate('upi', {
    payeeName: 'Kirana', upiId: 'shop@okaxis', nameMatches: true, firstTimePayee: false,
    amount: 500, transactionType: 'pay', source: 'merchant',
  });
  assert.equal(r.grade, 'A');
});

test('validation reports every invalid field', () => {
  assert.throws(
    () => evaluate('upi', { upiId: 'not-a-vpa', amount: -5 }),
    (err) => err.status === 400 && Boolean(err.details.upiId && err.details.amount && err.details.payeeName),
  );
});

test('string inputs from forms are coerced', () => {
  const r = evaluate('loan', { ...safeLoan, principal: '3,00,000', rbiRegistered: 'true', kfsProvided: 'yes' });
  assert.equal(r.input.principal, 300000);
  assert.equal(r.input.rbiRegistered, true);
});

test('unknown product type is rejected', () => {
  assert.throws(() => evaluate('crypto', {}), (err) => err.status === 400);
});

test('scores stay within 0–100', () => {
  const r = evaluate('upi', {
    payeeName: 'x', upiId: 'kyc.reward@abc', amount: 500000, transactionType: 'collect_request', source: 'marketplace_buyer',
    expectingToReceive: true, urgencyPressure: true, screenShareRequested: true, linkFromStranger: true, otpOrPinShared: true,
  });
  for (const v of Object.values(r.scores)) assert.ok(v >= 0 && v <= 100);
});

test('schema describes all products', () => {
  const s = describeEngine();
  assert.deepEqual(s.products.map((p) => p.type), ['loan', 'insurance', 'upi']);
  assert.ok(s.products.every((p) => p.fields.length && p.ruleCount));
});
