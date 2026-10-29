import { api, getSchema } from '../api.js';
import { renderHeader } from '../layout.js';
import { $, $$, esc } from '../ui.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

renderHeader().then((user) => {
  if (!user) return;
  const cta = $('#hero-cta');
  cta.textContent = 'Go to your overview';
  cta.href = '/dashboard.html';
});

// ---------- Headline: split into words so each can rise in turn ----------
const title = $('#hero-title');
title.innerHTML = title.textContent
  .split(' ')
  .map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`)
  .join(' ');

// ---------- Scroll reveal ----------
const revealer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      revealer.unobserve(e.target);
    }
  },
  { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
);
$$('.reveal').forEach((el) => revealer.observe(el));
$$('.defs > div').forEach((el, i) => el.style.setProperty('--i', i));

// ---------- Count-up numbers ----------
function countUp(el, target) {
  if (reduceMotion) {
    el.textContent = target;
    return;
  }
  const start = performance.now();
  const dur = 1100;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = Math.round(target * (1 - (1 - t) ** 3));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------- Scoring formula, typed out ----------
async function typeFormula(lines) {
  const pre = $('#spec-formula');
  if (reduceMotion) {
    pre.innerHTML = lines.join('\n');
    return;
  }
  await sleep(700);
  // Lines contain markup; type the visible text and swap in the marked-up line when done.
  for (let i = 0; i < lines.length; i++) {
    const plain = lines[i].replace(/<[^>]+>/g, '');
    const done = lines.slice(0, i).join('\n') + (i ? '\n' : '');
    for (let c = 1; c <= plain.length; c += 2) {
      pre.innerHTML = `${done}${esc(plain.slice(0, c))}<span class="caret"></span>`;
      await sleep(14);
    }
  }
  pre.innerHTML = `${lines.join('\n')}<span class="caret"></span>`;
}

async function revealBands() {
  const rows = $$('#spec-bands tr');
  for (const row of rows) {
    if (!reduceMotion) await sleep(110);
    row.classList.remove('pending');
  }
}

// ---------- Rule ticker ----------
function buildMarquee(products) {
  const byProduct = products.map((p) =>
    p.rules
      .filter((r) => r.severity !== 'positive')
      .map((r) => `<span><span class="sev sev-${r.severity}"></span>${esc(r.title)}<span class="tag">${esc(p.type)}</span></span>`),
  );
  // Interleave products so neighbouring items vary, then repeat once for a seamless loop.
  const mixed = [];
  for (let i = 0; i < Math.max(...byProduct.map((l) => l.length)); i++) {
    for (const list of byProduct) if (list[i]) mixed.push(list[i]);
  }
  $('#marquee').innerHTML = mixed.join('') + mixed.join('');
}

// ---------- Score playground (same formula as the engine) ----------
function initPlayground(schema) {
  const w = schema.weights;
  const grades = schema.grades;
  const sliders = $$('#playground input[type="range"]');
  const crit = $('#play-critical');
  const scoreEl = $('#play-score');
  const gradeEl = $('#play-grade');
  let lastGrade = gradeEl.textContent;

  const update = () => {
    const v = Object.fromEntries(sliders.map((s) => [s.dataset.dim, Number(s.value)]));
    sliders.forEach((s) => {
      s.style.setProperty('--p', `${s.value}%`);
      s.nextElementSibling.textContent = s.value;
    });
    let score = Math.round(w.trust * v.trust + w.transparency * v.transparency + w.risk * (100 - v.risk) + w.complexity * (100 - v.complexity));
    if (crit.checked) score = Math.min(score, 39);
    const g = grades.find((x) => score >= x.min);

    scoreEl.textContent = score;
    $('#play-pin').style.left = `${score}%`;
    gradeEl.textContent = g.grade;
    gradeEl.className = `grade grade-${g.grade}`;
    $('#play-verdict').textContent = g.verdict;
    if (g.grade !== lastGrade && !reduceMotion) {
      gradeEl.classList.remove('bump');
      void gradeEl.offsetWidth; // restart the animation
      gradeEl.classList.add('bump');
    }
    lastGrade = g.grade;
  };
  sliders.forEach((s) => s.addEventListener('input', update));
  crit.addEventListener('change', update);
  update();
}

// ---------- UPI ID quick check ----------
function initUpiTry() {
  const input = $('#try-upi');
  const out = $('#try-result');
  let timer;
  let seq = 0;

  const idle = () => {
    out.innerHTML = '<div class="idle">Results appear as you type. Nothing you enter here is stored.</div>';
  };

  async function check(value) {
    const mine = ++seq;
    let res;
    try {
      res = await api(`/engine/upi-id?id=${encodeURIComponent(value)}`);
    } catch {
      return;
    }
    if (mine !== seq) return; // a newer keystroke already started another check

    if (!res.valid) {
      out.innerHTML = `<div class="idle">Keep typing — a UPI ID looks like <span class="mono">name@bank</span>.</div>`;
      return;
    }
    const lines = res.findings.length
      ? res.findings
          .map((f, i) => `<div class="line" style="--i:${i}"><div><span class="sev sev-${f.severity}">${esc(f.severity)}</span></div><div><h4>${esc(f.title)}</h4><p>${esc(f.detail)}</p></div></div>`)
          .join('')
      : `<div class="line"><div><span class="sev sev-positive">clear</span></div><div><h4>Nothing suspicious in the ID itself</h4><p>“@${esc(res.psp)}” is a recognised handle and the name has no bait words. Still check the name your UPI app shows before paying.</p></div></div>`;
    const full = `/analyze.html?type=upi&upiId=${encodeURIComponent(res.upiId)}`;
    out.innerHTML = `${lines}<div class="more"><span>This looked at the ID only.</span><a href="${full}">Run the full UPI check →</a></div>`;
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const value = input.value.trim();
    if (!value) {
      seq++;
      idle();
      return;
    }
    timer = setTimeout(() => check(value), 220);
  });
  idle();
}

initUpiTry();

// ---------- Everything driven by the live engine schema ----------
getSchema()
  .then((schema) => {
    const w = schema.weights;
    const pct = (n) => n.toFixed(2);
    $('#spec-version').textContent = `v${schema.engineVersion}`;
    $('#spec-bands').innerHTML = schema.grades
      .map((g, i) => `<tr class="pending"><td><span class="grade grade-${g.grade}">${g.grade}</span></td><td>${i === schema.grades.length - 1 ? `&lt; ${schema.grades[i - 1].min}` : `≥ ${g.min}`}</td><td>${esc(g.verdict)}</td></tr>`)
      .join('');
    typeFormula([
      `<span class="k">safety</span> = ${pct(w.trust)} × trust`,
      `       + ${pct(w.transparency)} × transparency`,
      `       + ${pct(w.risk)} × (100 − risk)`,
      `       + ${pct(w.complexity)} × (100 − complexity)`,
      '',
      '<span class="c"># any critical finding caps safety at 39</span>',
    ]).then(revealBands);

    const totalRules = schema.products.reduce((n, p) => n + p.ruleCount, 0);
    const counts = { rules: totalRules, products: schema.products.length, scores: Object.keys(w).length };
    setTimeout(() => $$('[data-count]').forEach((el) => countUp(el, counts[el.dataset.count])), reduceMotion ? 0 : 650);

    buildMarquee(schema.products);

    let n = 0;
    $('#catalogue').innerHTML = schema.products
      .map(
        (p) => `
        <div>
          <div class="cat-head"><h3>${esc(p.label)}</h3><span class="label">${p.ruleCount} rules</span></div>
          <ul>${p.rules.map((r) => `<li style="--i:${n++ % 20}"><span class="sev sev-${r.severity}" title="${r.severity}"></span>${esc(r.title)}</li>`).join('')}</ul>
        </div>`,
      )
      .join('');

    initPlayground(schema);
  })
  .catch(() => {
    $('#catalogue').classList.add('hidden');
    $('.marquee').classList.add('hidden');
  });
