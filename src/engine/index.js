const { validateInput } = require('./validate');

const products = {
  loan: require('./rules/loan'),
  insurance: require('./rules/insurance'),
  upi: require('./rules/upi'),
};

const ENGINE_VERSION = '1.0.0';
const DIMENSIONS = ['trust', 'transparency', 'risk', 'complexity'];

// Trust and transparency are "higher is better"; risk and complexity are "higher is worse".
const WEIGHTS = { trust: 0.3, transparency: 0.25, risk: 0.3, complexity: 0.15 };

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, positive: 4 };

// A single critical finding caps the overall score so it can never grade above D.
const CRITICAL_CAP = 39;

const GRADES = [
  { min: 85, grade: 'A', verdict: 'Low risk', summary: 'No significant concerns found.' },
  { min: 70, grade: 'B', verdict: 'Moderate risk', summary: 'Generally sound, with a few points worth checking.' },
  { min: 55, grade: 'C', verdict: 'Proceed with caution', summary: 'Several issues need to be clarified before you commit.' },
  { min: 40, grade: 'D', verdict: 'High risk', summary: 'Serious problems found; consider alternatives.' },
  { min: 0, grade: 'E', verdict: 'Avoid', summary: 'Strong indicators of fraud or unfair terms.' },
];

class EngineValidationError extends Error {
  constructor(errors) {
    super('Validation failed');
    this.status = 400;
    this.details = errors;
  }
}

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

function gradeFor(score) {
  return GRADES.find((g) => score >= g.min);
}

function getProduct(type) {
  const product = products[type];
  if (!product) {
    const err = new Error(`Unknown product type "${type}". Use one of: ${Object.keys(products).join(', ')}`);
    err.status = 400;
    throw err;
  }
  return product;
}

function evaluate(type, rawInput) {
  const product = getProduct(type);
  const { value: input, errors } = validateInput(product.fields, rawInput);
  if (Object.keys(errors).length) throw new EngineValidationError(errors);

  const metrics = product.derive(input);
  const scores = { ...product.baseline };
  const findings = [];

  for (const rule of product.rules) {
    if (!rule.when(input, metrics)) continue;
    for (const [dim, delta] of Object.entries(rule.impact)) scores[dim] += delta;
    findings.push({
      id: rule.id,
      severity: rule.severity,
      title: rule.title,
      detail: typeof rule.detail === 'function' ? rule.detail(input, metrics) : rule.detail,
      recommendation: rule.recommendation || null,
      impact: rule.impact,
    });
  }

  for (const d of DIMENSIONS) scores[d] = clamp(scores[d]);
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  let overall = clamp(
    WEIGHTS.trust * scores.trust +
      WEIGHTS.transparency * scores.transparency +
      WEIGHTS.risk * (100 - scores.risk) +
      WEIGHTS.complexity * (100 - scores.complexity),
  );
  const hasCritical = findings.some((f) => f.severity === 'critical');
  if (hasCritical) overall = Math.min(overall, CRITICAL_CAP);

  const { grade, verdict, summary } = gradeFor(overall);
  const counts = findings.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] || 0) + 1 }), {});

  return {
    productType: type,
    title: input[product.titleField],
    input,
    scores,
    overallScore: overall,
    grade,
    verdict,
    summary,
    findings,
    findingCounts: counts,
    metrics,
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
  };
}

// Field and metric definitions for the frontend, so forms are rendered from the
// same schema the server validates against.
function describe() {
  return {
    engineVersion: ENGINE_VERSION,
    weights: WEIGHTS,
    grades: GRADES,
    products: Object.values(products).map((p) => ({
      type: p.type,
      label: p.label,
      titleField: p.titleField,
      fields: p.fields,
      metricLabels: p.metricLabels,
      ruleCount: p.rules.length,
      rules: p.rules.map((r) => ({ id: r.id, severity: r.severity, title: r.title })),
    })),
  };
}

// Quick look at a UPI ID on its own (no transaction context), used by the landing page.
// Runs only the rules that depend purely on the ID so it never over-claims.
const UPI_ID_RULES = ['UPI_BAIT_HANDLE', 'UPI_UNKNOWN_PSP'];

function inspectUpiId(raw) {
  const upi = products.upi;
  const upiId = String(raw || '').trim();
  if (!upi.VPA_RE.test(upiId)) return { upiId, valid: false, findings: [] };

  const metrics = upi.derive({ upiId });
  const findings = upi.rules
    .filter((r) => UPI_ID_RULES.includes(r.id) && r.when({}, metrics))
    .map((r) => ({
      id: r.id,
      severity: r.severity,
      title: r.title,
      detail: typeof r.detail === 'function' ? r.detail({}, metrics) : r.detail,
      recommendation: r.recommendation || null,
    }));
  return { upiId, valid: true, ...metrics, findings };
}

module.exports = { evaluate, describe, inspectUpiId, EngineValidationError, ENGINE_VERSION, productTypes: Object.keys(products) };
