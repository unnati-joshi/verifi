import { api, requireUser } from '../api.js';
import { renderHeader } from '../layout.js';
import { $, esc, typeTag, gradeChip, timeAgo, toast, confirmDialog, setLoading, showFieldErrors } from '../ui.js';

const form = $('#watch-form');
const addCard = $('#add-card');

await requireUser();
renderHeader();

function toggleForm(show) {
  addCard.classList.toggle('hidden', !show);
  if (show) {
    form.reset();
    showFieldErrors(form, {});
    $('#w-name').focus();
  }
}

async function load() {
  try {
    const { items } = await api('/watchlist');
    $('#watch-table').innerHTML = items.length
      ? `<table class="table">
          <thead><tr><th>Name</th><th>Product</th><th>Latest</th><th>Notes</th><th></th></tr></thead>
          <tbody>${items
            .map(
              (w) => `
            <tr>
              <td class="name"><strong>${esc(w.name)}</strong>${w.identifier ? `<div class="small muted mono">${esc(w.identifier)}</div>` : ''}</td>
              <td>${typeTag(w.productType)}</td>
              <td>${
                w.lastReport
                  ? `<a class="row" href="/report.html?id=${w.lastReport.id}" style="flex-wrap:nowrap;text-decoration:none">${gradeChip(w.lastReport.grade)}<span class="mono">${w.lastReport.overallScore}</span><span class="small muted">${timeAgo(w.lastReport.createdAt)}</span></a>`
                  : '<span class="small muted">Not checked yet</span>'
              }</td>
              <td class="small muted" style="max-width:260px">${esc(w.notes || '')}</td>
              <td class="end">
                <a class="btn btn-ghost btn-sm" href="/analyze.html?type=${w.productType}&watch=${w.id}">Check</a>
                <button class="btn-link danger" data-del="${w.id}" data-name="${esc(w.name)}">Remove</button>
              </td>
            </tr>`,
            )
            .join('')}</tbody></table>`
      : `<div class="empty"><h3>Nothing on your watchlist</h3><p>Add a lender, insurer or UPI ID to keep its latest grade in one place.</p></div>`;
  } catch (err) {
    toast(err.message, 'error');
  }
}

$('#add-btn').addEventListener('click', () => toggleForm(addCard.classList.contains('hidden')));
$('#w-cancel').addEventListener('click', () => toggleForm(false));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#w-save');
  setLoading(btn, true);
  try {
    await api('/watchlist', {
      method: 'POST',
      body: {
        name: form.name.value,
        productType: form.productType.value,
        identifier: form.identifier.value,
        notes: form.notes.value,
      },
    });
    toast('Added to watchlist');
    toggleForm(false);
    load();
  } catch (err) {
    showFieldErrors(form, err.details);
    if (!err.details) toast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
});

$('#watch-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  const ok = await confirmDialog({ title: 'Remove from watchlist?', message: `“${btn.dataset.name}” will be removed. Saved reports are kept.`, confirmText: 'Remove', danger: true });
  if (!ok) return;
  try {
    await api(`/watchlist/${btn.dataset.del}`, { method: 'DELETE' });
    toast('Removed');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
});

load();
