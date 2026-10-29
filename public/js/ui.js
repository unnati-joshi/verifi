export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const inr = (n) => inrFmt.format(n);

// SQLite stores UTC as "YYYY-MM-DD HH:MM:SS" without a zone marker.
function parseDate(s) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${String(s).replace(' ', 'T')}Z`);
}
export function fmtDate(s) {
  return parseDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function timeAgo(s) {
  const secs = Math.round((Date.now() - parseDate(s)) / 1000);
  if (secs < 60) return 'just now';
  const units = [[60, 'min'], [24, 'hr'], [30, 'day'], [12, 'month'], [Infinity, 'year']];
  let v = Math.floor(secs / 60);
  for (const [div, name] of units) {
    if (v < div) return `${v} ${name}${v === 1 || name === 'min' || name === 'hr' ? '' : 's'} ago`;
    v = Math.floor(v / div);
  }
  return fmtDate(s);
}

export const TYPE_LABELS = { loan: 'Loan', insurance: 'Insurance', upi: 'UPI' };
export const typeTag = (t) => `<span class="tag">${esc(TYPE_LABELS[t] || t)}</span>`;
export const gradeChip = (g) => `<span class="grade grade-${esc(g)}" title="Grade ${esc(g)}">${esc(g)}</span>`;

export const MARK = `<svg class="mark" viewBox="0 0 28 21" aria-hidden="true">
  <rect class="b" x="0" y="11" width="4" height="10" rx="1.5"/><rect class="b" x="6" y="15" width="4" height="6" rx="1.5"/>
  <rect class="b" x="12" y="18" width="4" height="3" rx="1.5"/><rect class="b" x="18" y="8" width="4" height="13" rx="1.5"/>
  <rect class="a" x="24" y="0" width="4" height="21" rx="1.5"/></svg>`;

export const ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
};

// ---------- Theme ----------
export function currentTheme() {
  const set = document.documentElement.getAttribute('data-theme');
  if (set) return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function mountThemeToggle(btn) {
  const paint = () => {
    const dark = currentTheme() === 'dark';
    btn.innerHTML = dark ? ICONS.sun : ICONS.moon;
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    btn.title = btn.getAttribute('aria-label');
  };
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('verifi-theme', next);
    } catch {
      /* storage unavailable; theme still applies for this page */
    }
    paint();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);
  paint();
}

// ---------- Feedback ----------
export function toast(message, type = 'info') {
  let host = $('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    document.body.append(host);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  host.append(t);
  setTimeout(() => t.remove(), 3800);
}

export function confirmDialog({ title, message, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <h3 id="dlg-title">${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="actions">
          <button class="btn btn-ghost" data-act="cancel">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(confirmText)}</button>
        </div>
      </div>`;
    const close = (val) => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => e.key === 'Escape' && close(false);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) close(false);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) close(act === 'ok');
    });
    document.addEventListener('keydown', onKey);
    document.body.append(wrap);
    $('[data-act="cancel"]', wrap).focus();
  });
}

export function setLoading(btn, loading, label) {
  if (loading) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${label ? esc(label) : ''}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

export function showFieldErrors(form, details = {}) {
  $$('.field', form).forEach((f) => {
    f.classList.remove('invalid');
    const e = $('.error', f);
    if (e) e.textContent = '';
  });
  for (const [key, msg] of Object.entries(details || {})) {
    const field = form.elements[key]?.closest?.('.field');
    if (!field) continue;
    field.classList.add('invalid');
    const e = $('.error', field);
    if (e) e.textContent = msg;
  }
  $('.field.invalid .input', form)?.focus();
}
