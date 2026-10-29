// UPI payment rules. Encodes NPCI's core safety rules (a PIN is only ever needed to
// send money, never to receive it) and well-known UPI fraud patterns.

const KNOWN_HANDLES = new Set([
  'okaxis', 'oksbi', 'okhdfcbank', 'okicici', 'ybl', 'ibl', 'axl', 'paytm', 'pthdfc', 'ptsbi', 'ptyes', 'ptaxis',
  'apl', 'yapl', 'upi', 'sbi', 'icici', 'hdfcbank', 'axisbank', 'kotak', 'pnb', 'barodampay', 'yesbank',
  'idfcbank', 'indus', 'federal', 'aubank', 'rbl', 'freecharge', 'jupiteraxis', 'waaxis', 'wahdfcbank',
  'waicici', 'wasbi', 'fbl', 'kbl', 'boi', 'cnrb', 'unionbank', 'mahb', 'idbi', 'airtel', 'jio',
]);

const BAIT_WORDS = ['refund', 'support', 'helpdesk', 'customercare', 'care', 'kyc', 'reward', 'cashback', 'lottery', 'prize', 'lucky', 'claim', 'gift', 'bonus', 'verify', 'official'];

const VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

const fields = [
  { key: 'payeeName', label: 'Payee name', type: 'text', required: true, maxLength: 120, group: 'Payee' },
  {
    key: 'upiId', label: 'Payee UPI ID', type: 'text', required: true, maxLength: 320, group: 'Payee',
    pattern: VPA_RE.source, patternMessage: 'UPI ID must look like name@bank',
  },
  { key: 'nameMatches', label: 'Name shown in the UPI app matches who you expect', type: 'boolean', default: false, group: 'Payee' },
  { key: 'firstTimePayee', label: 'First time paying this UPI ID', type: 'boolean', default: true, group: 'Payee' },
  { key: 'amount', label: 'Amount (₹)', type: 'number', required: true, min: 1, max: 1e7, group: 'Transaction' },
  {
    key: 'transactionType', label: 'Transaction type', type: 'select', required: true, group: 'Transaction',
    options: [
      { value: 'pay', label: 'I am sending money' },
      { value: 'collect_request', label: 'I received a collect / payment request' },
      { value: 'qr_scan', label: 'Scanning a QR code' },
      { value: 'autopay_mandate', label: 'Approving an AutoPay mandate' },
    ],
  },
  {
    key: 'source', label: 'How did this payment come up?', type: 'select', required: true, group: 'Transaction',
    options: [
      { value: 'known_contact', label: 'Someone I know personally' },
      { value: 'merchant', label: 'Shop / merchant I am buying from' },
      { value: 'marketplace_buyer', label: 'Buyer on OLX / marketplace' },
      { value: 'social_media', label: 'Social media / messaging app' },
      { value: 'unsolicited', label: 'Unexpected call, SMS or email' },
    ],
  },
  { key: 'expectingToReceive', label: 'I was told this will help me RECEIVE money', type: 'boolean', default: false, group: 'Red flags' },
  { key: 'urgencyPressure', label: 'Being rushed or threatened (account block, police, penalty)', type: 'boolean', default: false, group: 'Red flags' },
  { key: 'screenShareRequested', label: 'Asked to install a screen-sharing app (AnyDesk, TeamViewer…)', type: 'boolean', default: false, group: 'Red flags' },
  { key: 'linkFromStranger', label: 'Payment link or QR came from a stranger', type: 'boolean', default: false, group: 'Red flags' },
  { key: 'otpOrPinShared', label: 'Asked to share OTP / UPI PIN with someone', type: 'boolean', default: false, group: 'Red flags' },
];

function parseVpa(vpa) {
  const [handle = '', psp = ''] = String(vpa).toLowerCase().split('@');
  const normalised = handle.replace(/[.\-_]/g, '');
  return {
    handle,
    psp,
    knownPsp: KNOWN_HANDLES.has(psp),
    baitWords: BAIT_WORDS.filter((w) => normalised.includes(w)),
    looksLikePhone: /^\d{10}$/.test(handle),
  };
}

function derive(i) {
  const vpa = parseVpa(i.upiId);
  return {
    psp: vpa.psp,
    knownPsp: vpa.knownPsp,
    baitWords: vpa.baitWords,
    phoneBasedId: vpa.looksLikePhone,
  };
}

const rules = [
  {
    id: 'UPI_PIN_TO_RECEIVE',
    severity: 'critical',
    title: 'PIN requested to “receive” money',
    when: (i) => i.expectingToReceive && i.transactionType !== 'pay',
    impact: { trust: -45, risk: +45 },
    detail: 'Entering your UPI PIN always sends money out of your account. No one needs your PIN or a scan to pay you.',
    recommendation: 'Decline the request immediately. Call 1930 or report on cybercrime.gov.in if money was lost.',
  },
  {
    id: 'UPI_CREDENTIAL_SHARE',
    severity: 'critical',
    title: 'Asked to share OTP or UPI PIN',
    when: (i) => i.otpOrPinShared,
    impact: { trust: -40, risk: +40 },
    detail: 'Banks, NPCI and UPI apps never ask for your PIN or OTP.',
    recommendation: 'Do not share. If already shared, call your bank to block UPI right away.',
  },
  {
    id: 'UPI_SCREEN_SHARE',
    severity: 'critical',
    title: 'Screen-sharing app requested',
    when: (i) => i.screenShareRequested,
    impact: { trust: -35, risk: +35 },
    detail: 'Remote-access apps let a fraudster watch your PIN and take over your phone.',
    recommendation: 'Uninstall the app and change your UPI PIN.',
  },
  {
    id: 'UPI_UNSOLICITED_COLLECT',
    severity: 'high',
    title: 'Unexpected collect request',
    when: (i) => i.transactionType === 'collect_request' && !['known_contact', 'merchant'].includes(i.source),
    impact: { risk: +25, trust: -15 },
    detail: 'Collect requests from strangers are the most common UPI scam vector.',
    recommendation: 'Only approve collect requests for purchases you initiated.',
  },
  {
    id: 'UPI_MARKETPLACE_BUYER',
    severity: 'high',
    title: 'Marketplace “buyer” asking you to pay or scan',
    when: (i) => i.source === 'marketplace_buyer',
    impact: { risk: +20, trust: -10 },
    detail: 'A genuine buyer sends you money — you should never have to scan a QR or approve a request to be paid.',
    recommendation: 'Share only your UPI ID and wait for the credit in your bank app.',
  },
  {
    id: 'UPI_BAIT_HANDLE',
    severity: 'high',
    title: 'Suspicious words in the UPI ID',
    when: (_i, d) => d.baitWords.length > 0,
    impact: { trust: -25, risk: +12 },
    detail: (_i, d) => `The UPI ID contains “${d.baitWords.join('”, “')}”, a pattern used to impersonate support desks or prize schemes.`,
    recommendation: 'Real companies use their verified merchant handles. Verify on the official website.',
  },
  {
    id: 'UPI_UNKNOWN_PSP',
    severity: 'low',
    title: 'Uncommon UPI handle',
    when: (_i, d) => !d.knownPsp,
    impact: { trust: -6, transparency: -6 },
    detail: (_i, d) => `“@${d.psp}” is not one of the widely used bank/PSP handles.`,
    recommendation: 'Double-check the payee name shown before entering your PIN.',
  },
  {
    id: 'UPI_NAME_MISMATCH',
    severity: 'high',
    title: 'Displayed name does not match',
    when: (i) => !i.nameMatches,
    impact: { trust: -20, transparency: -15, risk: +10 },
    detail: 'The name your UPI app shows for this ID is the registered account holder. A mismatch means the money goes to someone else.',
    recommendation: 'Stop and confirm the UPI ID through another channel.',
  },
  {
    id: 'UPI_URGENCY',
    severity: 'high',
    title: 'Pressure or threats',
    when: (i) => i.urgencyPressure,
    impact: { risk: +18, trust: -10 },
    detail: 'Urgency (“your account will be blocked”, “police case”) is designed to stop you from thinking.',
    recommendation: 'Hang up and contact the organisation on its official number.',
  },
  {
    id: 'UPI_STRANGER_LINK',
    severity: 'medium',
    title: 'Link or QR from a stranger',
    when: (i) => i.linkFromStranger,
    impact: { risk: +12, transparency: -8 },
    detail: 'QR codes and payment links can hide a different payee and amount.',
    recommendation: 'Type the UPI ID yourself instead of using shared links.',
  },
  {
    id: 'UPI_UNSOLICITED_SOURCE',
    severity: 'medium',
    title: 'Payment came from an unexpected contact',
    when: (i) => i.source === 'unsolicited' || i.source === 'social_media',
    impact: { risk: +12, trust: -8 },
    detail: 'You did not initiate this payment.',
    recommendation: 'Verify independently before paying anyone who reached out first.',
  },
  {
    id: 'UPI_LARGE_NEW_PAYEE',
    severity: 'medium',
    title: 'Large amount to a new payee',
    when: (i) => i.firstTimePayee && i.amount >= 10000,
    impact: { risk: +12 },
    detail: (i) => `₹${i.amount.toLocaleString('en-IN')} to an ID you have never paid before.`,
    recommendation: 'Send ₹1 first to confirm the payee, then send the rest.',
  },
  {
    id: 'UPI_OVER_LIMIT',
    severity: 'medium',
    title: 'Above the standard ₹1 lakh UPI limit',
    when: (i) => i.amount > 100000,
    impact: { complexity: +15, risk: +8 },
    detail: 'Most person-to-person UPI payments are capped at ₹1,00,000 per day; higher limits apply only to specific categories.',
    recommendation: 'For large amounts, a bank transfer (NEFT/RTGS) gives a better audit trail.',
  },
  {
    id: 'UPI_AUTOPAY',
    severity: 'low',
    title: 'Recurring AutoPay mandate',
    when: (i) => i.transactionType === 'autopay_mandate',
    impact: { complexity: +15, risk: +5 },
    detail: 'A mandate lets the merchant debit you repeatedly until it is cancelled.',
    recommendation: 'Check the max amount and frequency, and revoke unused mandates in your UPI app.',
  },
  {
    id: 'UPI_TRUSTED_CONTEXT',
    severity: 'positive',
    title: 'Known payee with verified name',
    when: (i) => i.nameMatches && ['known_contact', 'merchant'].includes(i.source) && i.transactionType === 'pay',
    impact: { trust: +5 },
    detail: 'You initiated this payment and the payee name checks out.',
  },
];

module.exports = {
  type: 'upi',
  label: 'UPI payment',
  titleField: 'payeeName',
  fields,
  derive,
  rules,
  baseline: { trust: 85, transparency: 85, risk: 10, complexity: 10 },
  metricLabels: {
    psp: ['UPI handle', 'text'],
    knownPsp: ['Recognised handle', 'bool'],
    phoneBasedId: ['Phone-number ID', 'bool'],
  },
  parseVpa,
  VPA_RE,
};
