import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
const [dir] = process.argv.slice(2);
const mig = (f) => readFileSync(join('supabase/migrations', f), 'utf8');
const rows = JSON.parse(readFileSync(join(dir, 'game_scores.json'), 'utf8'));
const list = Array.isArray(rows) ? rows : rows.rows ?? rows.data;
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE PUBLICATION supabase_realtime;`);
await db.exec(mig('20260604000000_initial_schema.sql'));
await db.exec(mig('20260730000000_score_audit.sql'));
for (const r of list) await db.query('INSERT INTO game_scores (matchup_id, data, updated_at) VALUES ($1,$2,$3)', [r.matchup_id, JSON.stringify(r.data), r.updated_at]);
await db.exec(mig('20261014000000_score_cells.sql'));
// Expected cells: unique (player, hole) with a numeric gross, per card.
let expected = 0, oddCards = 0;
for (const r of list) {
  if (!Array.isArray(r.data)) { oddCards++; continue; }
  const keys = new Set(r.data.filter((e) => e && e.playerId && e.hole != null && typeof e.grossScore === 'number').map((e) => `${e.playerId}|${e.hole}`));
  expected += keys.size;
}
const n = (await db.query('SELECT count(*)::int AS n FROM score_cells')).rows[0].n;
// Every card read back from cells equals its original (set of unique cells).
let mismatched = 0;
for (const r of list) {
  if (!Array.isArray(r.data)) continue;
  const want = new Map(); for (const e of r.data) if (e && typeof e.grossScore === 'number') want.set(`${e.playerId}|${e.hole}`, e.grossScore);
  const got = (await db.query('SELECT player_id, hole, gross_score FROM score_cells WHERE matchup_id=$1', [r.matchup_id])).rows;
  const ok = got.length === want.size && got.every((g) => want.has(`${g.player_id}|${g.hole}`));
  if (!ok) mismatched++;
}
const dupCards = list.filter((r) => Array.isArray(r.data) && new Set(r.data.map((e) => `${e.playerId}|${e.hole}`)).size !== r.data.length).length;
const audit = (await db.query('SELECT count(*)::int AS n FROM score_audit')).rows[0].n;
console.log(JSON.stringify({ cards: list.length, oddCards, dupCards, expectedCells: expected, cells: n, mismatchedCards: mismatched, auditRowsWritten: audit }));
