import { api, getMe, getSchema } from '../api.js';
import { renderHeader } from '../layout.js';
import { renderReport } from '../report-view.js';
import { $, esc, setLoading, showFieldErrors, toast } from '../ui.js';

const params = new URLSearchParams(location.search);
const form = $('#analyze-form');
const [schema, user] = await Promise.all([getSchema(), getMe()]);
renderHeader();

let current = schema.products.find((p) => p.type === params.get('type')) || schema.products[0];
let lastRun = null; // { productType, input } of the most recent successful check
let watchItems = [];
const NOUNS = { loan: 'loan', insurance: 'policy', upi: 'payment' };

function inputHtml(f) {
  const id = `f-${f.key}`;
  let control;
  if (f.type === 'select') {
    control = `<select class="input" id="${id}" name="${f.key}">
      ${f.default === undefined ? '<option value="">Select</option>' : ''}
      ${f.options.map((o) => `<option value="${esc(o.value)}"${o.value === f.default ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>`;
  } else {
    const attrs = f.type === 'number'
      ? `type="number" inputmode="decimal" step="any"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}`
      : `type="text"${f.maxLength ? ` maxlength="${f.maxLength}"` : ''}`;
    control = `<input class="input" id="${id}" name="${f.key}" ${attrs} value="${f.default !== undefined ? esc(f.default) : ''}">`;
  }
  // Labels like "Your monthly income (₹, optional)" carry their own hint; strip it into the badge.
  const label = esc(f.label.replace(/,?\s*optional\)/, ')').replace(/\s*\(\)$/, ''));
  const opt = !f.required && /optional/.test(f.label) ? '<span class="req">optional</span>' : '';
  return `<div class="field"><label for="${id}">${label}${opt}</label>${control}<span class="error"></span></div>`;
}

function checkHtml(f) {
  return `<label class="check${f.group === 'Red flags' ? ' flag' : ''}"><input type="checkbox" name="${f.key}"${f.default ? ' checked' : ''}><span>${esc(f.label)}</span></label>`;
}

function renderForm() {
  const groups = new Map();
  for (const f of current.fields) {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group).push(f);
  }
  $('#form-fields').innerHTML = [...groups]
    .map(([name, fields]) => {
      const inputs = fields.filter((f) => f.type !== 'boolean');
      const checks = fields.filter((f) => f.type === 'boolean');
      return `<fieldset class="form-section">
        <legend class="label">${esc(name)}</legend>
        <div class="form-grid">
          ${inputs.map(inputHtml).join('')}
          ${checks.length ? `<div class="checks">${checks.map(checkHtml).join('')}</div>` : ''}
        </div>
      </fieldset>`;
    })
    .join('');
}

function renderTabs() {
  $('#type-tabs').innerHTML = schema.products
    .map((p) => `<button type="button" role="tab" data-type="${p.type}" aria-selected="${p.type === current.type}">${esc(p.label)}</button>`)
    .join('');
}

function fillForm(values) {
  for (const f of current.fields) {
    const el = form.elements[f.key];
    if (!el || values[f.key] === undefined) continue;
    if (f.type === 'boolean') el.checked = Boolean(values[f.key]);
    else el.value = values[f.key];
  }
}

function readForm() {
  const out = {};
  for (const f of current.fields) {
    const el = form.elements[f.key];
    if (f.type === 'boolean') out[f.key] = el.checked;
    else if (el.value.trim() !== '') out[f.key] = f.type === 'number' ? Number(el.value) : el.value.trim();
  }
  return out;
}

function resetResult() {
  lastRun = null;
  $('#save-bar').classList.add('hidden');
  $('#result').innerHTML = `
    <div class="placeholder">
      <h3>No result yet</h3>
      <p>Run the check to see the scores, grade and findings for this ${NOUNS[current.type]}.</p>
    </div>`;
}

function renderWatchSelect() {
  const sel = $('#watch-select');
  const items = watchItems.filter((w) => w.productType === current.type);
  sel.innerHTML = `<option value="">Not linked to watchlist</option>${items.map((w) => `<option value="${w.id}">Link to ${esc(w.name)}</option>`).join('')}`;
  sel.classList.toggle('hidden', !items.length);
  if (params.get('watch')) sel.value = params.get('watch');
}

function switchType(type, { keepWatch = false } = {}) {
  current = schema.products.find((p) => p.type === type);
  const url = new URL(location.href);
  url.searchParams.set('type', type);
  url.searchParams.delete('from');
  if (!keepWatch) {
    url.searchParams.delete('watch');
    params.delete('watch');
  }
  history.replaceState(null, '', url);
  renderTabs();
  renderForm();
  renderWatchSelect();
  resetResult();
}

$('#type-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-type]');
  if (btn && btn.dataset.type !== current.type) switchType(btn.dataset.type);
});

form.addEventListener('reset', (e) => {
  e.preventDefault();
  renderForm();
  resetResult();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = readForm();
  const btn = $('#run-btn');
  setLoading(btn, true, 'Checking');
  try {
    const { report } = await api(`/engine/analyze/${current.type}`, { method: 'POST', body: input });
    showFieldErrors(form, {});
    lastRun = { productType: current.type, input };
    renderReport($('#result'), report, current);
    $('#save-bar').classList.remove('hidden');
    $('#save-btn').classList.toggle('hidden', !user);
    $('#anon-note').classList.toggle('hidden', Boolean(user));
    if (window.innerWidth < 1000) $('#result').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showFieldErrors(form, err.details);
    toast(err.details ? 'Some fields need attention.' : err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
});

$('#save-btn').addEventListener('click', async () => {
  if (!lastRun) return;
  const btn = $('#save-btn');
  const watchlistId = $('#watch-select').value ? Number($('#watch-select').value) : undefined;
  setLoading(btn, true, 'Saving');
  try {
    const { id } = await api('/reports', { method: 'POST', body: { ...lastRun, watchlistId } });
    location.href = `/report.html?id=${id}`;
  } catch (err) {
    toast(err.message, 'error');
    setLoading(btn, false);
  }
});

renderTabs();
renderForm();
resetResult();
if (user) watchItems = (await api('/watchlist').catch(() => ({ items: [] }))).items;
renderWatchSelect();

// Prefill from an existing report ("Edit and re-run") or a watchlist entry.
if (params.get('from') && user) {
  try {
    const { report } = await api(`/reports/${encodeURIComponent(params.get('from'))}`);
    if (report.productType !== current.type) switchType(report.productType);
    fillForm(report.input);
  } catch (err) {
    toast(err.message, 'error');
  }
} else if (params.get('watch')) {
  const item = watchItems.find((w) => String(w.id) === params.get('watch'));
  if (item) {
    if (item.productType !== current.type) switchType(item.productType, { keepWatch: true });
    fillForm({ [current.titleField]: item.name, ...(item.productType === 'upi' && item.identifier ? { upiId: item.identifier } : {}) });
  }
}

// Arriving from the landing page's UPI ID quick check.
if (current.type === 'upi' && params.get('upiId')) fillForm({ upiId: params.get('upiId') });
