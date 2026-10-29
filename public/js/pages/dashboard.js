import { api, requireUser } from '../api.js';
import { renderHeader } from '../layout.js';
import { $, esc, typeTag, gradeChip, timeAgo, toast } from '../ui.js';

const START = [
  { type: 'loan', title: 'Loan', text: 'Real cost after fees, affordability, RBI digital-lending rules.' },
  { type: 'insurance', title: 'Insurance policy', text: 'Claim record, cover adequacy, exclusions, mis-selling.' },
  { type: 'upi', title: 'UPI payment', text: 'Collect-request scams and other red flags before you enter your PIN.' },
];
const GRADE_VARS = { A: '--good', B: '--fair', C: '--warn', D: '--poor', E: '--bad' };

await requireUser();
renderHeader();

const startList = `<div class="start-list">${START.map(
  (s) => `<a href="/analyze.html?type=${s.type}"><strong>${s.title}</strong><span>${s.text}</span><span class="arrow">→</span></a>`,
).join('')}</div>`;

function firstRun() {
  $('#sub').textContent = 'Nothing checked yet.';
  $('#content').innerHTML = `
    <div class="split">
      <section class="panel">
        <div class="panel-head"><h3>Start with what is in front of you</h3></div>
        ${startList}
      </section>
      <section class="panel panel-body">
        <span class="label">How it works</span>
        <p style="margin-top:12px">Enter the terms you were offered. The engine runs every matching rule and returns four scores, a grade and a list of findings with what to do next.</p>
        <p class="muted small" style="margin:0">Save a report to keep it here. Add a lender, insurer or UPI ID to your watchlist to track it across checks.</p>
      </section>
    </div>`;
}

function render(s) {
  const risky = s.byGrade.filter((g) => g.grade === 'D' || g.grade === 'E').reduce((n, g) => n + g.count, 0);
  const max = Math.max(1, ...s.byGrade.map((g) => g.count));
  $('#sub').textContent = `Last check ${timeAgo(s.recent[0].createdAt)}.`;

  $('#content').innerHTML = `
    <section class="panel stats">
      <div><span class="label">Reports</span><div class="value">${s.total}</div><div class="sub">saved</div></div>
      <div><span class="label">Avg. safety</span><div class="value">${s.avgScore}</div><div class="sub">out of 100</div></div>
      <div><span class="label">Graded D or E</span><div class="value"${risky ? ' style="color:var(--bad)"' : ''}>${risky}</div><div class="sub">high risk or avoid</div></div>
      <div><span class="label">Watchlist</span><div class="value">${s.watchCount}</div><div class="sub"><a href="/watchlist.html">manage</a></div></div>
    </section>

    <div class="split" style="margin-top:20px">
      <section class="panel">
        <div class="panel-head"><h3>Recent reports</h3><a href="/reports.html">All reports</a></div>
        <div class="table-wrap"><table class="table"><tbody>
          ${s.recent
            .map(
              (r) => `<tr>
                <td style="width:44px">${gradeChip(r.grade)}</td>
                <td class="name"><a href="/report.html?id=${r.id}">${esc(r.title)}</a></td>
                <td>${typeTag(r.productType)}</td>
                <td class="num end">${r.overallScore}</td>
                <td class="end small muted">${timeAgo(r.createdAt)}</td>
              </tr>`,
            )
            .join('')}
        </tbody></table></div>
      </section>

      <div class="stack">
        <section class="panel">
          <div class="panel-head"><h3>Grades</h3></div>
          <div class="panel-body dist">
            ${['A', 'B', 'C', 'D', 'E']
              .map((g) => {
                const n = s.byGrade.find((x) => x.grade === g)?.count || 0;
                return `${gradeChip(g)}<div class="track"><span style="width:${(n / max) * 100}%;--c:var(${GRADE_VARS[g]})"></span></div><span class="n">${n}</span>`;
              })
              .join('')}
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h3>New check</h3></div>
          ${startList}
        </section>
      </div>
    </div>`;
}

try {
  const stats = await api('/reports/stats');
  if (stats.total === 0) firstRun();
  else render(stats);
} catch (err) {
  $('#content').innerHTML = '';
  toast(err.message, 'error');
}
