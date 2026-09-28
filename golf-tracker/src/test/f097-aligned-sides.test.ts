// F-097 — an ALIGNED team game on margin money must settle the teams on screen, not an invented split.
//
// The wizard's aligned flow (two teams of 4, 3 + 3 + 2, 3 + 2) builds its teams with the foursome
// builder and the teams ARE the tee sheet. Routed to the team engine (margin money — $ per hole,
// $ per point, or 3+-team legs) such a game used to save `sides: []`, and `sidesForCompute` fell
// back to `defaultSubTeams`: a handicap-balanced TWO-side split of the whole field. The hub said
// "3 + 3 + 2 · $/point" while the money settled "Player2 & Player4" vs "Player1 & Player3".
//
// Fix (FINDINGS F-097 option C, Craig 2026-09-18): the wizard passes the tee groups as the sides
// (captains included — e2e pins that), AND the engine backstops: with no stored sides and two or
// more tee groups, the tee groups are the sides. A one-group 2v2 with no sides keeps the default
// split it always had (one-group goldens pin that).
//
// Written BEFORE the fix (§5.z): the backstop cases fail on today's code.

import { describe, expect, it } from 'vitest';
import { sidesForCompute } from '@/lib/game-modes/context';
import { computeGameResult } from '@/lib/game-modes/result';
import type { GameScore } from '@/lib/game-state';
import { makeGame, makeTeam, scoresFor, TEST_PARS } from './fixtures';

const GROUPS = [['p1', 'p2', 'p3'], ['p4', 'p5', 'p6'], ['p7', 'p8']];

function alignedGame(over: Record<string, unknown> = {}) {
  return makeGame({
    gameMode: 'team-2v2', indexes: [0, 0, 0, 0, 0, 0, 0, 0],
    teams: GROUPS.map((ids, i) => makeTeam(i + 1, ids, { captainId: ids[0] })),
    sides: [],                                     // exactly what the wizard used to save
    modeSettings: { format: 'best-ball', scoring: 'stroke', result: 'total', moneyModel: 'per-point', dollarsPerPoint: 1, junkEnabled: false },
    ...over,
  });
}

describe('F-097 — the tee groups are the sides when a team game across foursomes stores none', () => {
  it('sidesForCompute returns one side per tee group, captains carried', () => {
    const sides = sidesForCompute(alignedGame());
    expect(sides.map((s) => s.playerIds)).toEqual(GROUPS);
    expect(sides.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(sides.map((s) => s.captainId)).toEqual(['p1', 'p4', 'p7']);
  });

  it('the result has THREE standings, one per team on the tee sheet, and settles round robin on them', () => {
    // Group 1 par, group 2 one over a hole, group 3 two over: A +32, B −2 (…), C −30? Let the
    // engine say; what matters is three standings named for the groups and zero-sum money.
    const scores = new Map<string, GameScore[]>(GROUPS.map((ids, i) =>
      [`m${i + 1}`, ids.flatMap((id) => scoresFor(id, TEST_PARS.map((p) => p + i)))]));
    const r = computeGameResult(alignedGame(), scores);
    if (r.kind !== 'individual') throw new Error('expected the team engine');
    expect(r.standings).toHaveLength(3);
    expect(r.standings.map((s) => s.playerId).sort()).toEqual(['A', 'B', 'C']);
    // All scratch, best ball: A par, B +18, C +36 → pairwise $1/pt round robin: A +54, B 0, C −54.
    expect(r.standings.map((s) => [s.playerId, s.moneyNet])).toEqual([['A', 54], ['B', 0], ['C', -54]]);
    expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBe(0);
  });

  it('COMPAT: one tee group and no sides keeps the default two-side split', () => {
    const one = makeGame({
      gameMode: 'team-2v2', indexes: [0, 6, 12, 18], sides: [],
      modeSettings: { format: 'best-ball', scoring: 'stableford', result: 'match', moneyModel: 'legs' },
    });
    expect(sidesForCompute(one)).toHaveLength(2);
  });
});
