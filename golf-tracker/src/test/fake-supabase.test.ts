// F-070: the sandbox fake answers the score-history query the leaderboard makes
// (`fetchScoreAudit`: select … .in() .order() .limit() on the append-only score_audit).
// Before, `.in` did not exist (an unhandled rejection in every e2e run that opened the
// history), and a select on score_audit read the keyed map, not the log it inserts into.

import { describe, it, expect } from 'vitest';
import { createFakeSupabase, createFakeStore } from './fake-supabase';

// The fake's builder is a bare thenable typed `unknown`; read its `data` like the app does.
const dataOf = async (q: unknown) => (await (q as Promise<{ data: unknown }>)).data;

const row = (matchup_id: string, hole: number, changed_at: string) =>
  ({ matchup_id, player_id: 'p1', hole, old_score: null, new_score: 4, changed_at });

describe('F-070: fake-supabase select filters on the append-only audit log', () => {
  it('in() + order(desc) + limit() over inserted rows', async () => {
    const db = createFakeSupabase(createFakeStore());
    await db.from('score_audit').insert([
      row('m1', 1, '2026-09-27T10:00:00Z'),
      row('m2', 2, '2026-09-27T10:05:00Z'),
      row('m3', 3, '2026-09-27T10:10:00Z'),     // not in the game
      row('m1', 4, '2026-09-27T10:15:00Z'),
    ]);
    const data = await dataOf(db.from('score_audit').select('*')
      .in('matchup_id', ['m1', 'm2']).order('changed_at', { ascending: false }).limit(2));
    expect((data as { hole: number }[]).map((r) => r.hole)).toEqual([4, 2]);
  });

  it('an insert without changed_at gets the column default, as the migration declares', async () => {
    const db = createFakeSupabase(createFakeStore());
    await db.from('score_audit').insert([{ matchup_id: 'm1', player_id: 'p1', hole: 1, old_score: null, new_score: 5 }]);
    const data = await dataOf(db.from('score_audit').select('*').in('matchup_id', ['m1']));
    expect(typeof (data as { changed_at: unknown }[])[0].changed_at).toBe('string');
  });

  it('keyed tables still filter by eq() and ignore the append log', async () => {
    const db = createFakeSupabase(createFakeStore());
    await db.from('pool_games').upsert([{ id: 'g1', data: {} }, { id: 'g2', data: {} }]);
    const data = await dataOf(db.from('pool_games').select('id').in('id', ['g2']));
    expect((data as { id: string }[]).map((r) => r.id)).toEqual(['g2']);
  });
});
