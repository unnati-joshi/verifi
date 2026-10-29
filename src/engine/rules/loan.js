// Loan rules. Thresholds reflect RBI guidance for retail/digital lending in India
// (Key Fact Statement mandate, no foreclosure charges on floating-rate loans to
// individuals, no fees collected before disbursal, restricted app permissions).

const fields = [
  { key: 'lenderName', label: 'Lender name', type: 'text', required: true, maxLength: 120, group: 'Lender' },
  {
    key: 'lenderType', label: 'Lender type', type: 'select', required: true, group: 'Lender',
    options: [
      { value: 'bank', label: 'Scheduled bank' },
      { value: 'nbfc', label: 'NBFC' },
      { value: 'digital_app', label: 'Digital lending app' },
      { value: 'p2p', label: 'P2P platform' },
      { value: 'unregistered', label: 'Informal / unknown' },
    ],
  },
  { key: 'rbiRegistered', label: 'Registered with / regulated by RBI', type: 'boolean', default: false, group: 'Lender' },
  { key: 'principal', label: 'Loan amount (₹)', type: 'number', required: true, min: 1000, max: 1e9, group: 'Terms' },
  { key: 'interestRate', label: 'Advertised interest rate (% p.a.)', type: 'number', required: true, min: 0, max: 200, group: 'Terms' },
  { key: 'tenureMonths', label: 'Tenure (months)', type: 'number', required: true, min: 1, max: 360, group: 'Terms' },
  {
    key: 'rateType', label: 'Rate type', type: 'select', default: 'fixed', group: 'Terms',
    options: [{ value: 'fixed', label: 'Fixed' }, { value: 'floating', label: 'Floating' }],
  },
  { key: 'processingFeePct', label: 'Processing fee (% of loan)', type: 'number', default: 0, min: 0, max: 50, group: 'Charges' },
  { key: 'prepaymentPenaltyPct', label: 'Prepayment / foreclosure charge (%)', type: 'number', default: 0, min: 0, max: 20, group: 'Charges' },
  { key: 'latePenaltyMonthlyPct', label: 'Late payment penalty (% per month)', type: 'number', default: 0, min: 0, max: 50, group: 'Charges' },
  { key: 'bundledInsurance', label: 'Insurance or add-ons bundled into the loan', type: 'boolean', default: false, group: 'Charges' },
  { key: 'kfsProvided', label: 'Key Fact Statement (KFS) provided', type: 'boolean', default: false, group: 'Disclosure' },
  { key: 'aprDisclosed', label: 'APR (all-in annual cost) disclosed', type: 'boolean', default: false, group: 'Disclosure' },
  { key: 'upfrontFeeBeforeDisbursal', label: 'Asked to pay a fee before the loan is disbursed', type: 'boolean', default: false, group: 'Red flags' },
  { key: 'intrusivePermissions', label: 'App wants contacts / photos / call-log access', type: 'boolean', default: false, group: 'Red flags' },
  { key: 'monthlyIncome', label: 'Your monthly income (₹, optional)', type: 'number', min: 0, max: 1e9, group: 'Affordability' },
];

function emi(principal, annualRatePct, months) {
  const r = annualRatePct / 1200;
  if (r === 0) return principal / months;
  const f = (1 + r) ** months;
  return (principal * r * f) / (f - 1);
}

// Solves for the annual rate at which the cash actually received (principal minus
// processing fee) equals the present value of the EMIs — i.e. the real cost of borrowing.
function effectiveApr(principal, emiAmount, months, feePct) {
  const received = principal * (1 - feePct / 100);
  const pv = (r) => (r === 0 ? emiAmount * months : (emiAmount * (1 - (1 + r) ** -months)) / r);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > received) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 1200;
}

function derive(i) {
  const monthlyEmi = emi(i.principal, i.interestRate, i.tenureMonths);
  const totalPayable = monthlyEmi * i.tenureMonths;
  const apr = effectiveApr(i.principal, monthlyEmi, i.tenureMonths, i.processingFeePct);
  return {
    emi: Math.round(monthlyEmi),
    totalInterest: Math.round(totalPayable - i.principal),
    processingFee: Math.round((i.principal * i.processingFeePct) / 100),
    totalCost: Math.round(totalPayable - i.principal + (i.principal * i.processingFeePct) / 100),
    effectiveApr: Number(apr.toFixed(2)),
    emiToIncomePct: i.monthlyIncome ? Number(((monthlyEmi / i.monthlyIncome) * 100).toFixed(1)) : null,
  };
}

const rules = [
  {
    id: 'LOAN_UPFRONT_FEE',
    severity: 'critical',
    title: 'Fee demanded before disbursal',
    when: (i) => i.upfrontFeeBeforeDisbursal,
    impact: { trust: -35, risk: +30 },
    detail: 'Regulated lenders deduct charges from the disbursed amount. Asking for money first is the most common loan-fraud pattern.',
    recommendation: 'Do not pay. Report the lender on sachet.rbi.org.in or cybercrime.gov.in.',
  },
  {
    id: 'LOAN_UNREGULATED',
    severity: 'critical',
    title: 'Lender is not RBI-regulated',
    when: (i) => !i.rbiRegistered || i.lenderType === 'unregistered',
    impact: { trust: -30, risk: +20, transparency: -10 },
    detail: 'Without RBI regulation you have no grievance redressal, no fair-practice code and no cap on recovery practices.',
    recommendation: 'Verify the lender (or its partner bank/NBFC) on the RBI website before sharing any documents.',
  },
  {
    id: 'LOAN_INTRUSIVE_PERMISSIONS',
    severity: 'high',
    title: 'App requests contacts / media access',
    when: (i) => i.intrusivePermissions,
    impact: { trust: -15, risk: +15 },
    detail: 'RBI digital-lending rules bar lenders from accessing contacts or media; these permissions are typically used for harassment-based recovery.',
    recommendation: 'Deny the permissions or uninstall the app.',
  },
  {
    id: 'LOAN_RATE_PREDATORY',
    severity: 'high',
    title: 'Interest rate above 36% p.a.',
    when: (i) => i.interestRate > 36,
    impact: { risk: +25, trust: -10 },
    detail: 'Rates this high usually indicate predatory short-term lending.',
    recommendation: 'Compare offers from banks or credit-card EMI options first.',
  },
  {
    id: 'LOAN_RATE_HIGH',
    severity: 'medium',
    title: 'Interest rate above 24% p.a.',
    when: (i) => i.interestRate > 24 && i.interestRate <= 36,
    impact: { risk: +12 },
    detail: 'This is well above typical personal-loan rates from banks.',
    recommendation: 'Negotiate or shop around; your credit score may qualify you for less.',
  },
  {
    id: 'LOAN_HIDDEN_COST',
    severity: 'medium',
    title: 'Fees push the real cost far above the advertised rate',
    when: (i, d) => d.effectiveApr - i.interestRate > 3,
    impact: { transparency: -15, risk: +5 },
    detail: (i, d) => `Advertised ${i.interestRate}% but effective APR after fees is ${d.effectiveApr}%.`,
    recommendation: 'Compare loans on APR, not on the headline interest rate.',
  },
  {
    id: 'LOAN_HIGH_PROCESSING_FEE',
    severity: 'medium',
    title: 'Processing fee above 3%',
    when: (i) => i.processingFeePct > 3,
    impact: { transparency: -8, risk: +5 },
    detail: 'Most banks charge 0.5–2% for personal loans.',
    recommendation: 'Ask for a fee waiver or a lower fee.',
  },
  {
    id: 'LOAN_NO_KFS',
    severity: 'high',
    title: 'No Key Fact Statement',
    when: (i) => !i.kfsProvided,
    impact: { transparency: -25, trust: -5 },
    detail: 'RBI requires lenders to give a KFS with APR, all fees and the repayment schedule before you sign.',
    recommendation: 'Insist on the KFS in writing before accepting the loan.',
  },
  {
    id: 'LOAN_NO_APR',
    severity: 'medium',
    title: 'APR not disclosed',
    when: (i) => !i.aprDisclosed,
    impact: { transparency: -12 },
    detail: 'Without an APR it is hard to compare the true cost against other offers.',
    recommendation: 'Ask the lender for the annual percentage rate including all fees.',
  },
  {
    id: 'LOAN_FLOATING_FORECLOSURE',
    severity: 'high',
    title: 'Foreclosure charge on a floating-rate loan',
    when: (i) => i.rateType === 'floating' && i.prepaymentPenaltyPct > 0,
    impact: { trust: -10, transparency: -10 },
    detail: 'RBI does not allow foreclosure or prepayment charges on floating-rate loans to individual borrowers.',
    recommendation: 'Raise this with the lender’s grievance officer; escalate to the RBI Ombudsman if unresolved.',
  },
  {
    id: 'LOAN_HIGH_PREPAYMENT',
    severity: 'low',
    title: 'Prepayment charge above 4%',
    when: (i) => i.rateType === 'fixed' && i.prepaymentPenaltyPct > 4,
    impact: { complexity: +10, risk: +5 },
    detail: 'High exit charges lock you in even if a cheaper loan becomes available.',
    recommendation: 'Check whether part-prepayments are allowed without charges.',
  },
  {
    id: 'LOAN_FLOATING_RATE',
    severity: 'low',
    title: 'Floating rate',
    when: (i) => i.rateType === 'floating',
    impact: { complexity: +10, risk: +6 },
    detail: 'Your EMI or tenure can rise if the benchmark rate increases.',
    recommendation: 'Ask which benchmark the rate is linked to and how often it resets.',
  },
  {
    id: 'LOAN_LATE_PENALTY',
    severity: 'medium',
    title: 'Steep late-payment penalty',
    when: (i) => i.latePenaltyMonthlyPct > 3,
    impact: { risk: +10, complexity: +5 },
    detail: 'A missed EMI can snowball quickly at this penalty rate.',
    recommendation: 'Set up auto-debit and keep a one-EMI buffer.',
  },
  {
    id: 'LOAN_BUNDLED_ADDONS',
    severity: 'medium',
    title: 'Insurance / add-ons bundled in',
    when: (i) => i.bundledInsurance,
    impact: { complexity: +15, transparency: -8 },
    detail: 'Bundled products inflate the loan amount and are often optional despite being presented as mandatory.',
    recommendation: 'Ask for the add-on to be removed or bought separately.',
  },
  {
    id: 'LOAN_LONG_TENURE',
    severity: 'low',
    title: 'Very long tenure',
    when: (i) => i.tenureMonths > 240,
    impact: { complexity: +8, risk: +4 },
    detail: (_i, d) => `You will pay ₹${d.totalInterest.toLocaleString('en-IN')} in interest over the loan’s life.`,
    recommendation: 'A shorter tenure or periodic prepayments cuts total interest sharply.',
  },
  {
    id: 'LOAN_UNAFFORDABLE',
    severity: 'critical',
    title: 'EMI exceeds 50% of income',
    when: (_i, d) => d.emiToIncomePct !== null && d.emiToIncomePct > 50,
    impact: { risk: +25 },
    detail: (_i, d) => `EMI is ${d.emiToIncomePct}% of monthly income — a high risk of default.`,
    recommendation: 'Borrow less or extend the tenure to bring the EMI under 40% of income.',
  },
  {
    id: 'LOAN_STRETCHED',
    severity: 'high',
    title: 'EMI is 40–50% of income',
    when: (_i, d) => d.emiToIncomePct !== null && d.emiToIncomePct > 40 && d.emiToIncomePct <= 50,
    impact: { risk: +14 },
    detail: (_i, d) => `EMI is ${d.emiToIncomePct}% of monthly income, leaving little room for other expenses.`,
    recommendation: 'Keep total EMIs under 40% of take-home pay.',
  },
  {
    id: 'LOAN_REGULATED_BANK',
    severity: 'positive',
    title: 'Regulated scheduled bank',
    when: (i) => i.lenderType === 'bank' && i.rbiRegistered,
    impact: { trust: +5 },
    detail: 'Banks are covered by the RBI Integrated Ombudsman Scheme.',
  },
  {
    id: 'LOAN_FULL_DISCLOSURE',
    severity: 'positive',
    title: 'KFS and APR both disclosed',
    when: (i) => i.kfsProvided && i.aprDisclosed,
    impact: { transparency: +5 },
    detail: 'You have what you need to compare this loan fairly.',
  },
];

module.exports = {
  type: 'loan',
  label: 'Loan',
  titleField: 'lenderName',
  fields,
  derive,
  rules,
  baseline: { trust: 85, transparency: 85, risk: 15, complexity: 15 },
  metricLabels: {
    emi: ['Monthly EMI', 'inr'],
    totalInterest: ['Total interest', 'inr'],
    processingFee: ['Processing fee', 'inr'],
    totalCost: ['Total cost of credit', 'inr'],
    effectiveApr: ['Effective APR', 'pct'],
    emiToIncomePct: ['EMI / income', 'pct'],
  },
};
