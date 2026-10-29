import { api, requireUser } from '../api.js';
import { renderHeader } from '../layout.js';
import { $, esc, typeTag, gradeChip, fmtDate, toast, confirmDialog } from '../ui.js';

const PAGE_SIZE = 15;
const FILTERS = ['q', 'type', 'grade'];
const form = $('#filters');
let offset = 0;
let debounce;

await requireUser();
renderHeader();

const params = new URLSearchParams(location.search);
for (const k of FILTERS) if (params.get(k)) form.elements[k].value = params.get(k);

async function load() {
  const q = new URLSearchParams({ limit: PAGE_SIZE, offset });
  for (const k of FILTERS) if (form.elements[k].value) q.set(k, form.elements[k].value);
  const filtered = FILTERS.some((k) => form.elements[k].value);

  try {
    const { reports, total } = await api(`/reports?${q}`);
    $('#count-label').textContent = filtered
      ? `${total} report${total === 1 ? '' : 's'} match.`
      : `${total} saved report${total === 1 ? '' : 's'}.`;

    $('#table').innerHTML = reports.length
      ? `<table class="table">
          <thead><tr><th>Grade</th><th>Name</th><th>Product</th><th class="end">Score</th><th>Saved</th><th></th></tr></thead>
          <tbody>${reports
            .map(
              (r) => `
            <tr>
              <td style="width:60px">${gradeChip(r.grade)}</td>
              <td class="name"><a href="/report.html?id=${r.id}">${esc(r.title)}</a></td>
              <td>${typeTag(r.productType)}</td>
              <td class="num end">${r.overallScore}</td>
              <td class="small muted">${fmtDate(r.createdAt)}</td>
              <td class="end"><button class="btn-link danger" data-del="${r.id}" data-title="${esc(r.title)}">Delete</button></td>
            </tr>`,
            )
            .join('')}</tbody></table>`
      : filtered
        ? '<div class="empty"><p>No reports match these filters.</p></div>'
        : `<div class="empty"><h3>No reports yet</h3><p>Run a check and save it to see it here.</p><a class="btn btn-primary btn-sm" href="/analyze.html">New check</a></div>`;

    const pages = Math.ceil(total / PAGE_SIZE);
    const page = Math.floor(offset / PAGE_SIZE) + 1;
    $('#pager').innerHTML = pages > 1
      ? `<span class="small muted mono">${page} / ${pages}</span>
         <button class="btn btn-ghost btn-sm" data-page="-1"${page === 1 ? ' disabled' : ''}>Previous</button>
         <button class="btn btn-ghost btn-sm" data-page="1"${page === pages ? ' disabled' : ''}>Next</button>`
      : '';
  } catch (err) {
    toast(err.message, 'error');
  }
}

form.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    offset = 0;
    load();
  }, 250);
});
form.addEventListener('submit', (e) => e.preventDefault());

$('#pager').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-page]');
  if (!btn) return;
  offset = Math.max(0, offset + Number(btn.dataset.page) * PAGE_SIZE);
  load();
});

$('#table').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  const ok = await confirmDialog({ title: 'Delete this report?', message: `“${btn.dataset.title}” will be removed permanently.`, confirmText: 'Delete', danger: true });
  if (!ok) return;
  try {
    await api(`/reports/${btn.dataset.del}`, { method: 'DELETE' });
    toast('Report deleted');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
});

load();
