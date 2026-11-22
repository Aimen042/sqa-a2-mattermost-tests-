// Summarises a Playwright JSON report into a CSV you can paste into the report.
// Usage: node scripts/summarize.mjs [runName]      (default: full)
// Output: reports/<run>/summary.csv  + pass/fail/blocked counts in the console.
import fs from 'fs';
import path from 'path';

const run = process.argv[2] ?? process.env.RUN_NAME ?? 'full';
const file = path.join('reports', run, 'results.json');
if (!fs.existsSync(file)) { console.error(`Not found: ${file}. Run the tests first.`); process.exit(1); }
const report = JSON.parse(fs.readFileSync(file, 'utf-8'));

const rows = [];
function walk(suite) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const r = t.results?.[t.results.length - 1] ?? {};
      const seen = new Set();
      const ann = [...(t.annotations ?? []), ...(r.annotations ?? [])].filter((a) => {
        const k = `${a.type}|${a.description}`;
        return seen.has(k) ? false : (seen.add(k), true);
      });
      const get = (type) => ann.filter((a) => a.type === type).map((a) => a.description).join(' | ');
      const id = (spec.title.match(/^(TC-[A-C]\d+|NFR-\d+|E2E-\d+)/) ?? [])[1] ?? '';
      let status = r.status ?? 'unknown';
      if (status === 'skipped') status = 'blocked';
      if (status === 'timedOut' || status === 'interrupted') status = 'failed';
      const error = (r.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0];
      rows.push({ id, title: spec.title.replace(/\s@\S+/g, ''), requirement: get('requirement'), owner: get('owner'), technique: get('technique'), inputs: get('inputs'), actual: get('actual') || error, status, duration_ms: r.duration ?? '' });
    }
  }
  for (const s of suite.suites ?? []) walk(s);
}
for (const s of report.suites ?? []) walk(s);

if (rows.length === 0) {
  console.log('No tests ran. Errors reported by Playwright:');
  for (const e of report.errors ?? []) console.log('  ' + (e.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 6).join('\n  '));
}
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const header = ['id', 'title', 'requirement', 'owner', 'technique', 'inputs', 'actual', 'status', 'duration_ms'];
const csv = [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n');
fs.writeFileSync(path.join('reports', run, 'summary.csv'), csv);

const count = (s) => rows.filter((r) => r.status === s).length;
console.table(rows.map(({ id, status, duration_ms, actual }) => ({ id, status, duration_ms, actual: actual.slice(0, 90) })));
console.log(`Run "${run}": total ${rows.length} | passed ${count('passed')} | failed ${count('failed')} | blocked ${count('blocked')}`);
console.log(`Written: reports/${run}/summary.csv`);
