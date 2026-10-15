// READ-ONLY check after the F-063 C migration: every live card's scores equal its score_cells rows.
// SELECT only; never a write.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function all(table, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select('*');
    for (const k of order) q = q.order(k);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
const cards = await all('game_scores', ['matchup_id']);
const cells = await all('score_cells', ['matchup_id', 'player_id', 'hole']);
const byM = new Map();
for (const c of cells) { if (!byM.has(c.matchup_id)) byM.set(c.matchup_id, []); byM.get(c.matchup_id).push(c); }
let mismatched = [], matched = 0, expected = 0;
for (const card of cards) {
  const want = new Map((Array.isArray(card.data) ? card.data : []).filter((e) => typeof e.grossScore === 'number').map((e) => [`${e.playerId}|${e.hole}`, e.grossScore]));
  expected += want.size;
  const got = (byM.get(card.matchup_id) ?? []).filter((c) => c.gross_score !== null);
  const ok = got.length === want.size && got.every((g) => want.get(`${g.player_id}|${g.hole}`) === g.gross_score);
  ok ? matched++ : mismatched.push(card.matchup_id);
}
const audit = await sb.from('score_audit').select('id', { count: 'exact', head: true });
console.log(JSON.stringify({ cards: cards.length, matchedCards: matched, mismatchedCards: mismatched, expectedCells: expected, liveCells: cells.length, tombstones: cells.filter((c) => c.gross_score === null).length, scoreAuditRows: audit.count }));
