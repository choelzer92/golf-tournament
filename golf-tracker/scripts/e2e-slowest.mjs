// Lists the slowest e2e tests from the last run (§5.bz). Playwright's json reporter writes
// .claude/e2e-timings.json on every run; `node scripts/e2e-slowest.mjs [N]` prints the top N.
import { readFileSync } from 'node:fs';

const n = Number(process.argv[2] ?? 20);
const report = JSON.parse(readFileSync('.claude/e2e-timings.json', 'utf8'));
const rows = [];
const walk = (suite, file) => {
  const f = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const ms = (t.results ?? []).reduce((a, r) => a + (r.duration ?? 0), 0);
      rows.push({ ms, status: t.results?.at(-1)?.status ?? '?', title: `${f} › ${spec.title}` });
    }
  }
  for (const s of suite.suites ?? []) walk(s, f);
};
for (const s of report.suites ?? []) walk(s);
rows.sort((a, b) => b.ms - a.ms);
const total = rows.reduce((a, r) => a + r.ms, 0);
console.log(`${rows.length} tests, ${(total / 60000).toFixed(1)} test-minutes (wall clock is lower: parallel workers)\n`);
for (const r of rows.slice(0, n)) console.log(`${(r.ms / 1000).toFixed(1).padStart(6)}s  ${r.status.padEnd(7)} ${r.title}`);
