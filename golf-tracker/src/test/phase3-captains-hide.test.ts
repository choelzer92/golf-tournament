// Phase 3 steps 5–6 — the last two classic-only capabilities reach the team engine, and the router's
// classic-only list empties (spec `.claude/plans/phase3-money-convergence.md` §4–§5; DECISIONS §5.bq Q5).
//
//   Step 5  Captains ride on the side itself (`GameSide.captainId`), so the teams step's captain
//           choice for shared-foursome teams survives into the saved game. Hiding holes until every
//           group finishes is a presentation flag the team leaderboard already honours through
//           `filterConcealedScores` — pinned here so it can't quietly stop.
//   Step 6  `classicOnlyNeeds` is gone: no money option is ever greyed for an ENGINE reason. What the
//           router still refuses is golf, or the team engine's field cap: a two-ball format on a team
//           of one, one-ball formats with partners apart, and fields above 8 players that classic
//           can't hold (margin money, 3+-team legs).
//
// Written BEFORE the change (§5.z): the captain cases fail on today's code (`persistedSides` folds a
// captained pair into the legacy shape and drops the role); the hide-holes and routing cases are
// pins of behaviour that already holds and must keep holding.

import { describe, expect, it } from 'vitest';
import { persistedSides, sidesOfGame, type GameSide } from '@/lib/game-modes/sides';
import { computeGameResult } from '@/lib/game-modes/result';
import { filterConcealedScores } from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import {
  moneyModelsFor, proposeTeeGroups, routeContainer, teeSheetFacts, UNEXPRESSIBLE, type StructureDraft,
} from '@/lib/game-structure';
import { makeGame, makeTeam, scoresFor, TEST_PARS } from './fixtures';

// --- Step 5: captains on sides -------------------------------------------------------------------

describe('Phase 3 step 5 — a captain rides on the side', () => {
  it('two captained pairs persist as `sides`, never the legacy shape (which has no room for a captain)', () => {
    const pairs: GameSide[] = [
      { id: 'a', playerIds: ['p1', 'p2'], captainId: 'p1' },
      { id: 'b', playerIds: ['p3', 'p4'], captainId: 'p4' },
    ];
    const out = persistedSides(pairs);
    expect(out.subTeams).toBeUndefined();
    expect(out.sides).toEqual(pairs);
    // …and read back with the role intact.
    expect(sidesOfGame(out).map((s) => s.captainId)).toEqual(['p1', 'p4']);
  });

  it('COMPAT: two plain pairs still save the old way (the golden-snapshot path)', () => {
    const out = persistedSides([{ id: 'a', playerIds: ['p1', 'p2'] }, { id: 'b', playerIds: ['p3', 'p4'] }]);
    expect(out).toEqual({ subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] } });
  });
});

// --- Step 5: hide holes until every group finishes, on the team leaderboard ------------------------

describe('Phase 3 step 5 — hide holes until all groups finish, on a team game across two foursomes', () => {
  const sides: GameSide[] = [
    { id: 'a', playerIds: ['p1', 'p2'] }, { id: 'b', playerIds: ['p3', 'p4'] },
    { id: 'c', playerIds: ['p5', 'p6'] }, { id: 'd', playerIds: ['p7', 'p8'] },
  ];
  const teams = [makeTeam(1, ['p1', 'p2', 'p3', 'p4']), makeTeam(2, ['p5', 'p6', 'p7', 'p8'])];
  const par = TEST_PARS;
  // Group 1 has finished; group 2 is thru 12.
  const scores = new Map<string, GameScore[]>([
    ['m1', ['p1', 'p2', 'p3', 'p4'].flatMap((id) => scoresFor(id, par))],
    ['m2', ['p5', 'p6', 'p7', 'p8'].flatMap((id) => scoresFor(id, par.slice(0, 12), Array.from({ length: 12 }, (_, i) => i + 1)))],
  ]);
  const game = (hide: boolean) => makeGame({
    gameMode: 'team-2v2', indexes: [0, 0, 0, 0, 0, 0, 0, 0], sides, teams,
    modeSettings: { format: 'best-ball', scoring: 'stroke', result: 'total', moneyModel: 'legs', junkEnabled: false },
    hideHolesUntilAllFinish: hide,
  });

  it('with the flag ON the board stops at the last hole every group has finished', () => {
    const r = computeGameResult(game(true), filterConcealedScores(game(true), scores));
    expect(r.kind).toBe('individual');
    if (r.kind !== 'individual') return;
    expect(r.thruHole).toBe(12);
    expect(r.standings.map((s) => s.thru)).toEqual([12, 12, 12, 12]);
  });

  it('with the flag OFF the finished group shows all 18', () => {
    const r = computeGameResult(game(false), filterConcealedScores(game(false), scores));
    if (r.kind !== 'individual') throw new Error('expected the team engine');
    expect(r.thruHole).toBe(18);
    expect(r.standings.find((s) => s.playerId === 'A')?.thru).toBe(18);
  });
});

// --- Step 6: the money step never greys for an engine reason ---------------------------------------

function draftFor(sizes: number[], moneyModel: StructureDraft['moneyModel'], mixed = false): StructureDraft {
  let n = 0;
  const teams = sizes.map((k) => Array.from({ length: k }, () => `p${++n}`));
  const groups = mixed
    ? Array.from({ length: Math.ceil(n / 4) }, (_, g) => teams.flat().filter((_, i) => i % Math.ceil(n / 4) === g))
    : proposeTeeGroups(teams);
  return {
    structure: { kind: 'teams', teamSizes: sizes },
    scoring: { format: 'best-ball', basis: 'stroke', compareBy: 'total' },
    moneyModel,
    ...teeSheetFacts(teams, groups),
    bonuses: { junk: true, ctp: true, custom: true },
  };
}

describe('Phase 3 step 6 — nothing is greyed for an engine reason (fields of 8 or fewer)', () => {
  const SHAPES: number[][] = [[4, 4], [2, 2, 2, 2], [3, 3, 2], [1, 1], [2, 2, 1], [3, 3], [4, 2, 2], [2, 2]];
  for (const sizes of SHAPES) {
    it(`${sizes.join(' + ')} with every bonus on: pot, legs, $/hole and $/point all open`, () => {
      const opts = moneyModelsFor(draftFor(sizes, 'pot'));
      expect(opts.map((o) => o.available)).toEqual([true, true, true, true]);
      for (const o of opts) expect(o.route.container).not.toBe('unexpressible');
    });
  }

  it('partners apart changes the engine, not the availability', () => {
    const opts = moneyModelsFor(draftFor([3, 3], 'legs', true));
    expect(opts.every((o) => o.available && o.route.container === 'sides')).toBe(true);
  });

  it('what is still refused is golf or the field cap, never a missing feature', () => {
    // A team of one has one ball → no two-ball format (both containers).
    const oneBall = { ...draftFor([2, 2, 1], 'legs'), scoring: { format: 'two-best-net' as const, basis: 'stroke' as const, compareBy: 'total' as const } };
    expect(routeContainer(oneBall)).toEqual({ container: 'unexpressible', reason: UNEXPRESSIBLE.needTeams('Two-ball formats') });
    // Twelve players on head-to-head legs: classic holds two teams only, the team engine tops out at 8.
    expect(routeContainer(draftFor([4, 4, 4], 'legs'))).toEqual({ container: 'unexpressible', reason: UNEXPRESSIBLE.sidesFieldCap(8) });
    // …but the same twelve on a pot are the classic pool, bonuses and all.
    expect(routeContainer(draftFor([4, 4, 4], 'pot')).container).toBe('classic');
  });

  it('the reason strings for engine gaps are gone from the vocabulary', () => {
    expect(Object.keys(UNEXPRESSIBLE).sort()).toEqual(['needTeams', 'noScoring', 'noSoloMode', 'oneBallApart', 'sidesFieldCap']);
  });
});
