import { api, requireUser, getSchema } from '../api.js';
import { renderHeader } from '../layout.js';
import { renderReport } from '../report-view.js';
import { $, esc, inr, toast, confirmDialog } from '../ui.js';

const id = new URLSearchParams(location.search).get('id');

await requireUser();
renderHeader();

function inputValue(field, value) {
  if (value === undefined || value === null || value === '') return '<span class="muted">—</span>';
  if (field.type === 'boolean') return value ? 'Yes' : 'No';
  if (field.type === 'select') return esc(field.options.find((o) => o.value === value)?.label ?? value);
  if (field.type === 'number') return `<span class="mono">${field.label.includes('₹') ? inr(value) : esc(value)}</span>`;
  return esc(value);
}

try {
  if (!id) throw new Error('No report selected.');
  const [data, schema] = await Promise.all([api(`/reports/${encodeURIComponent(id)}`), getSchema()]);
  const product = schema.products.find((p) => p.type === data.productType);
  document.title = `${data.title} · verifi`;

  renderReport($('#report'), data.report, product, { createdAt: data.createdAt });
  $('#rerun-btn').href = `/analyze.html?type=${data.productType}&from=${data.id}`;

  $('#inputs-card').innerHTML = `
    <div class="panel-head"><h3>Inputs</h3></div>
    <div class="table-wrap"><table class="table kv"><tbody>
      ${product.fields.map((f) => `<tr><td>${esc(f.label)}</td><td>${inputValue(f, data.report.input[f.key])}</td></tr>`).join('')}
    </tbody></table></div>`;
} catch (err) {
  $('#report').innerHTML = `<div class="panel empty"><h3>Report unavailable</h3><p>${esc(err.message)}</p><a class="btn btn-ghost btn-sm" href="/reports.html">Back to reports</a></div>`;
  $('#inputs-card').classList.add('hidden');
  ['#rerun-btn', '#print-btn', '#delete-btn'].forEach((s) => $(s).classList.add('hidden'));
}

$('#print-btn').addEventListener('click', () => window.print());

$('#delete-btn').addEventListener('click', async () => {
  const ok = await confirmDialog({ title: 'Delete this report?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true });
  if (!ok) return;
  try {
    await api(`/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
    location.href = '/reports.html';
  } catch (err) {
    toast(err.message, 'error');
  }
});
