// F-063 C: the REAL migration SQL, run on a real Postgres (PGlite: Postgres compiled to WASM, in this
// process; no Docker, no network, nowhere near the live database).
//
// The sandbox backend only MIRRORS upsert_score_cells' rule. This file runs the actual migration file
// and pins what live will do: the backfill, the conflict rule (§5.dn), the server-side audit, the blob
// kept current for rollback, and an OLD bundle's whole-card saves still working in the gap before the
// new app is deployed, edits and resets included.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';

const MIGRATIONS = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8');

let db: PGlite;

/** A database at today's live schema (the tables score cells touch), optionally with cards in it. */
async function freshDb(cards: { matchup: string; data: unknown; updatedAt?: string }[] = []) {
  db = new PGlite();
  // What Supabase provides and the migrations assume.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE PUBLICATION supabase_realtime;`);
  await db.exec(sql('20260604000000_initial_schema.sql'));
  await db.exec(sql('20260730000000_score_audit.sql'));
  for (const c of cards) {
    await db.query(`INSERT INTO game_scores (matchup_id, data, updated_at) VALUES ($1, $2, $3)`,
      [c.matchup, JSON.stringify(c.data), c.updatedAt ?? '2026-10-10T12:00:00Z']);
  }
  await db.exec(sql('20261014000000_score_cells.sql'));
}

const cells = async (m = 'm1') => (await db.query<{ player_id: string; hole: number; gross_score: number | null }>(
  `SELECT player_id, hole, gross_score FROM score_cells WHERE matchup_id = $1 ORDER BY hole, player_id`, [m])).rows
  .map((r) => [r.player_id, r.hole, r.gross_score]);
const blob = async (m = 'm1') => (await db.query<{ data: { playerId: string; hole: number; grossScore: number }[] }>(
  `SELECT data FROM game_scores WHERE matchup_id = $1`, [m])).rows[0]?.data
  .map((s) => [s.playerId, s.hole, s.grossScore]);
const audit = async () => (await db.query<{ player_id: string; hole: number; old_score: number | null; new_score: number | null }>(
  `SELECT player_id, hole, old_score, new_score FROM score_audit ORDER BY id`)).rows
  .map((r) => [r.player_id, r.hole, r.old_score, r.new_score]);
const T = (min: number) => new Date(Date.UTC(2026, 9, 14, 9, min)).toISOString();
const tap = (playerId: string, hole: number, grossScore: number | null, min: number, matchupId = 'm1') =>
  ({ matchupId, playerId, hole, grossScore, tappedAt: T(min) });
const rpc = (cellsIn: unknown[]) => db.query(`SELECT upsert_score_cells($1::jsonb)`, [JSON.stringify(cellsIn)]);
/** An OLD bundle's save: the whole card written to game_scores, as every phone does today. */
const oldSave = (data: unknown[], m = 'm1') => db.query(
  `INSERT INTO game_scores (matchup_id, data, updated_at) VALUES ($1, $2, NOW())
   ON CONFLICT (matchup_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`, [m, JSON.stringify(data)]);

describe('the migration on a real Postgres', () => {
  beforeEach(async () => {
    await freshDb([
      { matchup: 'm1', data: [{ playerId: 'p1', hole: 1, grossScore: 5 }, { playerId: 'p2', hole: 1, grossScore: 4 }] },
      { matchup: 'm2', data: [] },
    ]);
  }, 30_000);

  it('backfills every existing card into cells, with no audit rows', async () => {
    expect(await cells()).toEqual([['p1', 1, 5], ['p2', 1, 4]]);
    expect(await cells('m2')).toEqual([]);
    expect(await audit()).toEqual([]);
  });

  it('new app: the later TAP wins (§5.dn), the audit is written server-side, the blob stays current', async () => {
    await rpc([tap('p1', 1, 4, 3)]);                 // phone B corrects 5 → 4 at 9:03
    await rpc([tap('p1', 1, 6, 2)]);                 // phone A's 6 from 9:02 arrives late: ignored
    await rpc([tap('p1', 2, 3, 4)]);
    expect(await cells()).toEqual([['p1', 1, 4], ['p2', 1, 4], ['p1', 2, 3]]);
    expect(await audit()).toEqual([['p1', 1, 5, 4], ['p1', 2, null, 3]]);
    expect(await blob()).toEqual([['p1', 1, 4], ['p2', 1, 4], ['p1', 2, 3]]);
  });

  it('new app: resending a batch changes nothing and audits nothing', async () => {
    await rpc([tap('p1', 2, 3, 4)]);
    await rpc([tap('p1', 2, 3, 4)]);
    expect(await audit()).toEqual([['p1', 2, null, 3]]);
  });

  it('new app: a clear is a tombstone; an older tap can\'t bring the score back', async () => {
    await rpc([tap('p1', 1, null, 5)]);
    await rpc([tap('p1', 1, 7, 4)]);
    expect(await cells()).toEqual([['p1', 1, null], ['p2', 1, 4]]);
    expect(await blob()).toEqual([['p2', 1, 4]]);
  });

  it('OLD app in the gap: a correction survives (the bug found before running it)', async () => {
    await oldSave([{ playerId: 'p1', hole: 1, grossScore: 4 }, { playerId: 'p2', hole: 1, grossScore: 4 }, { playerId: 'p1', hole: 2, grossScore: 3 }]);
    expect(await cells()).toEqual([['p1', 1, 4], ['p2', 1, 4], ['p1', 2, 3]]);
    expect(await blob()).toEqual([['p1', 1, 4], ['p2', 1, 4], ['p1', 2, 3]]);
  });

  it('OLD app in the gap: a reset to an empty card clears the cells, as today', async () => {
    await oldSave([]);
    expect(await cells()).toEqual([['p1', 1, null], ['p2', 1, null]]);
    expect(await blob()).toEqual([]);
  });

  it('OLD app and new app on one card: each sees the other, and nothing loops', async () => {
    await oldSave([{ playerId: 'p1', hole: 1, grossScore: 5 }, { playerId: 'p2', hole: 1, grossScore: 4 }, { playerId: 'p2', hole: 2, grossScore: 5 }]);
    await rpc([tap('p1', 2, 4, 30)]);
    expect(await cells()).toEqual([['p1', 1, 5], ['p2', 1, 4], ['p1', 2, 4], ['p2', 2, 5]]);
    // The old app reads the blob: it has the new app's tap too.
    expect(await blob()).toEqual([['p1', 1, 5], ['p2', 1, 4], ['p1', 2, 4], ['p2', 2, 5]]);
  });

  it('a card that lists one cell twice backfills one cell', async () => {
    await freshDb([{ matchup: 'm9', data: [{ playerId: 'p1', hole: 1, grossScore: 5 }, { playerId: 'p1', hole: 1, grossScore: 6 }] }]);
    expect(await cells('m9')).toHaveLength(1);
  }, 30_000);
});
