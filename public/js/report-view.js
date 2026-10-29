import { esc, inr, typeTag, gradeChip, fmtDate } from './ui.js';

const DIMENSIONS = [
  { key: 'trust', label: 'Trust', higherIsBetter: true, hint: 'Is the provider legitimate and accountable?' },
  { key: 'transparency', label: 'Transparency', higherIsBetter: true, hint: 'Are costs and terms disclosed clearly?' },
  { key: 'risk', label: 'Risk', higherIsBetter: false, hint: 'How likely is financial harm?' },
  { key: 'complexity', label: 'Complexity', higherIsBetter: false, hint: 'How hard is the product to understand?' },
];
const IMPACT_LABELS = { trust: 'trust', transparency: 'transparency', risk: 'risk', complexity: 'complexity' };

function level(value, higherIsBetter) {
  const goodness = higherIsBetter ? value : 100 - value;
  if (goodness >= 75) return 'good';
  if (goodness >= 55) return 'ok';
  if (goodness >= 35) return 'warn';
  return 'bad';
}

function formatMetric(value, kind) {
  switch (kind) {
    case 'inr': return inr(value);
    case 'pct': return `${value}%`;
    case 'x': return `${value}×`;
    case 'bool': return value ? 'Yes' : 'No';
    default: return esc(value);
  }
}

function findingHtml(f) {
  // Show each rule's effect on the scores, coloured by whether it helped or hurt.
  const effects = Object.entries(f.impact || {})
    .map(([dim, delta]) => {
      const good = dim === 'trust' || dim === 'transparency' ? delta > 0 : delta < 0;
      return `<span class="${good ? 'up' : 'down'}">${IMPACT_LABELS[dim]} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}</span>`;
    })
    .join('');
  return `
    <div class="finding">
      <div><span class="sev sev-${esc(f.severity)}">${f.severity === 'positive' ? 'strength' : esc(f.severity)}</span></div>
      <div>
        <h4>${esc(f.title)}</h4>
        <p>${esc(f.detail)}</p>
        ${f.recommendation ? `<div class="todo">${esc(f.recommendation)}</div>` : ''}
        <div class="foot"><span>${esc(f.id)}</span>${effects}</div>
      </div>
    </div>`;
}

export function renderReport(container, report, product, { createdAt } = {}) {
  const metricLabels = product?.metricLabels || {};
  const metrics = Object.entries(metricLabels)
    .filter(([k]) => report.metrics[k] !== undefined && report.metrics[k] !== null)
    .map(([k, [label, kind]]) => `<div class="metric"><div class="label">${esc(label)}</div><div class="v">${formatMetric(report.metrics[k], kind)}</div></div>`)
    .join('');

  const issues = report.findings.filter((f) => f.severity !== 'positive');
  const strengths = report.findings.filter((f) => f.severity === 'positive');
  const counts = report.findingCounts || {};
  const countHtml = ['critical', 'high', 'medium', 'low']
    .filter((s) => counts[s])
    .map((s) => `<span class="sev sev-${s}">${counts[s]} ${s}</span>`)
    .join('');

  container.innerHTML = `
    <div class="stack">
      <section class="panel">
        <div class="report-head">
          <div class="score-block">
            <span class="label">Safety score</span>
            <div class="big">${report.overallScore}<small>/100</small></div>
          </div>
          <div class="report-meta">
            <div class="row">${typeTag(report.productType)}<span class="small muted mono">${createdAt ? `saved ${fmtDate(createdAt)}` : 'not saved'} · engine ${esc(report.engineVersion)}</span></div>
            <h2>${esc(report.title)}</h2>
            <div class="verdict">${gradeChip(report.grade)}<div><strong>${esc(report.verdict)}</strong><span>${esc(report.summary)}</span></div></div>
            <div class="counts">${countHtml || '<span class="sev sev-positive">No issues flagged</span>'}</div>
          </div>
        </div>
        <div class="scale" aria-hidden="true">
          <div class="track"><div class="bands"><span></span><span></span><span></span><span></span><span></span></div><div class="pin" data-left="${report.overallScore}%"></div></div>
          <div class="ticks"><span>E 0</span><span>D 40</span><span>C 55</span><span>B 70</span><span>A 85</span></div>
        </div>
        <div class="dims">
          ${DIMENSIONS.map((d) => {
            const v = report.scores[d.key];
            return `
              <div class="dim lvl-${level(v, d.higherIsBetter)}" title="${esc(d.hint)}">
                <span class="label">${d.label}</span>
                <div class="v">${v}</div>
                <div class="dir">${d.higherIsBetter ? 'higher is better' : 'lower is better'}</div>
                <div class="bar"><span data-width="${v}%"></span></div>
              </div>`;
          }).join('')}
        </div>
      </section>

      ${metrics ? `<section class="panel"><div class="panel-head"><h3>Key numbers</h3></div><div class="metrics">${metrics}</div></section>` : ''}

      <section class="panel">
        <div class="panel-head"><h3>Findings</h3><span class="small muted mono">${issues.length} flagged</span></div>
        ${issues.length ? issues.map(findingHtml).join('') : '<div class="empty"><p>No rules were triggered by these inputs.</p></div>'}
      </section>

      ${strengths.length ? `<section class="panel"><div class="panel-head"><h3>In its favour</h3></div>${strengths.map(findingHtml).join('')}</section>` : ''}
    </div>`;

  // Set final positions on the next frame so the CSS transitions run.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      container.querySelectorAll('[data-left]').forEach((el) => (el.style.left = el.dataset.left));
      container.querySelectorAll('[data-width]').forEach((el) => (el.style.width = el.dataset.width));
    }),
  );
}
