// B1 Run it back (§5.cm): what a rerun carries. The FORMAT always; last time's field, course,
// shape and pairings as pre-fills. Never the old score keys (matchupId) — a rerun that kept
// them would open on the previous game's scores.

import { describe, expect, it } from 'vitest';
import { rerunPlanFromGame } from '@/lib/pool-formats';
import { carriedSplitDollars } from '@/lib/pool-game';
import { makeGame } from './fixtures';

describe('rerunPlanFromGame', () => {
  it('a classic pool of two foursomes: its shape, field, course, tee groups and format', () => {
    const game = makeGame({ indexes: [2, 4, 6, 8, 10, 12, 14, 16], teamCount: 2, positionSplit: [70, 30], hideHolesUntilAllFinish: true });
    game.teams[0].captainId = 'p1';
    const plan = rerunPlanFromGame(game);
    expect(plan.shape).toEqual({ kind: 'teams', teamSizes: [4, 4] });
    expect(plan.players.map((p) => p.id)).toEqual(game.players.map((p) => p.id));
    expect(plan.course).toBe(game.course);
    expect(plan.teeGroups.map((g) => g.playerIds)).toEqual(game.teams.map((t) => t.playerIds));
    expect(plan.teeGroups[0].captainId).toBe('p1');
    expect(plan.positionSplitText).toBe('70, 30');
    expect(plan.hideHoles).toBe(true);
    expect(plan.defaults.moneyMode).toBe('pot');
    expect(plan.defaults.entryPerPlayer).toBe(20);
    expect(plan.sides).toBeUndefined();
  });

  it('never carries a score key or a tee time', () => {
    const game = makeGame({ indexes: [2, 4, 6, 8, 10, 12, 14, 16], teamCount: 2 });
    game.teams[0].teeTime = '08:10';
    const json = JSON.stringify(rerunPlanFromGame(game).teeGroups);
    expect(json).not.toContain('matchupId');
    expect(json).not.toContain('08:10');
  });

  it('an individual mode reruns as everyone for themselves', () => {
    const plan = rerunPlanFromGame(makeGame({ gameMode: 'skins', indexes: [0, 6, 12] }));
    expect(plan.shape).toEqual({ kind: 'solo', teamSizes: [1, 1, 1] });
  });

  it('pairs sharing a foursome rerun with their sides and the shape they make', () => {
    const plan = rerunPlanFromGame(makeGame({
      gameMode: 'team-2v2',
      sides: [{ id: 'a', playerIds: ['p1', 'p4'] }, { id: 'b', playerIds: ['p2', 'p3'] }],
    }));
    expect(plan.shape).toEqual({ kind: 'teams', teamSizes: [2, 2] });
    expect(plan.sides?.map((s) => s.playerIds)).toEqual([['p1', 'p4'], ['p2', 'p3']]);
    expect(plan.teeGroups).toHaveLength(1);
  });

  it('defaults a game saved before nines and placement splits to 18 holes, winner takes all', () => {
    const game = makeGame();
    delete game.holesPlaying;
    const plan = rerunPlanFromGame({ ...game, positionSplit: [] });
    expect(plan.holesPlaying).toBe('18');
    expect(plan.nineHandicapBasis).toBe('18');
    expect(plan.positionSplitText).toBe('100');
  });
});

describe('carriedSplitDollars (Run it back keeps the old pot split, §5.cm)', () => {
  it('carries the split and the team count it was set for', () => {
    const game = makeGame({ indexes: [2, 4, 6, 8, 10, 12, 14, 16], teamCount: 2 });
    game.potSplit = { front: 0.25, back: 0.25, overall: 0.25, junk: 0.25 };
    const plan = rerunPlanFromGame(game);
    expect(plan.potSplit).toEqual(game.potSplit);
    expect(plan.teamCount).toBe(2);
  });

  it('scales the fractions to this pot', () => {
    expect(carriedSplitDollars({ front: 0.25, back: 0.25, overall: 0.25, junk: 0.25 }, 200))
      .toEqual({ front: 50, back: 50, overall: 50, junk: 50 });
    expect(carriedSplitDollars({ front: 0.35, back: 0.35, overall: 0.3, junk: 0 }, 160))
      .toEqual({ front: 56, back: 56, overall: 48, junk: 0 });
  });

  it('always totals the pot exactly — the residue lands on overall', () => {
    for (const pot of [100, 140, 175, 199, 333]) {
      const d = carriedSplitDollars({ front: 1 / 3, back: 1 / 3, overall: 1 / 6, junk: 1 / 6 }, pot);
      expect(Math.round((d.front + d.back + d.overall + d.junk) * 100) / 100).toBe(pot);
    }
  });
});
