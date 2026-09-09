#!/usr/bin/env node
// Read-only backup: dumps every table to timestamped JSON and reports sizes.
//
// WHY: RLS is `FOR ALL USING (true)` on every table (deliberately deferred — see
// DECISIONS.md §5c), which means any buggy code path can wipe or corrupt real
// games. The nearer-term risk to real data is our own bugs, not an attacker. This
// is insurance against that.
//
// It also tells you what your Supabase plan needs to cover: row counts and payload
// size per table.
//
// SAFETY: this script only ever SELECTs. There is no insert/update/delete/upsert
// anywhere in it, and it refuses to run if it can't find credentials — it will
// never silently export nothing and look successful.
//
// Usage:
//   node scripts/export-backup.mjs              # -> backups/<timestamp>/
//   node scripts/export-backup.mjs --out /path  # custom destination

import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TABLES = [
  'pool_games',
  'tournaments',
  'game_scores',
  'players',
  'roster_groups',
  'score_audit',
  'solo_rounds',
  'course_scorecards',
];

// Read .env.local ourselves — this runs outside Next, so nothing injects it.
function loadEnv() {
  const envPath = '.env.local';
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('REFUSING TO RUN: no Supabase credentials found.');
  console.error('Expected NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  console.error('in .env.local or the environment. Exiting without writing anything.');
  process.exit(1);
}

const outFlag = process.argv.indexOf('--out');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = outFlag > -1 ? process.argv[outFlag + 1] : join('backups', stamp);

const supabase = createClient(url, key);

const fmtBytes = (n) =>
  n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${(n / 1e3).toFixed(1)} KB` : `${n} B`;

console.log(`Exporting from ${url.replace(/https:\/\/([a-z0-9]{4})[a-z0-9]*/, 'https://$1…')}`);
console.log(`Destination: ${outDir}\n`);

mkdirSync(outDir, { recursive: true });

let totalRows = 0;
let totalBytes = 0;
const summary = [];

for (const table of TABLES) {
  // SELECT only. Never any mutation.
  const { data, error } = await supabase.from(table).select('*');

  if (error) {
    // A missing table isn't fatal (course_scorecards may not exist on older DBs).
    console.log(`  ${table.padEnd(20)} — skipped (${error.message})`);
    summary.push({ table, rows: null, bytes: 0, error: error.message });
    continue;
  }

  const json = JSON.stringify(data, null, 2);
  writeFileSync(join(outDir, `${table}.json`), json, 'utf8');
  totalRows += data.length;
  totalBytes += Buffer.byteLength(json);
  summary.push({ table, rows: data.length, bytes: Buffer.byteLength(json) });
  console.log(`  ${table.padEnd(20)} ${String(data.length).padStart(6)} rows  ${fmtBytes(Buffer.byteLength(json)).padStart(9)}`);
}

writeFileSync(
  join(outDir, '_manifest.json'),
  JSON.stringify({ exportedAt: new Date().toISOString(), tables: summary }, null, 2),
  'utf8',
);

console.log(`\nTotal: ${totalRows} rows, ${fmtBytes(totalBytes)}`);
console.log(`Written to ${outDir}`);

// A tiny bit of plan guidance, since size is the thing that decides it.
if (totalBytes < 5e6) {
  console.log('\nData is small (well under any free-tier storage limit).');
  console.log('For a Free project the real risk is the 7-day inactivity PAUSE,');
  console.log('not storage — check Settings > Billing in the Supabase dashboard.');
}
