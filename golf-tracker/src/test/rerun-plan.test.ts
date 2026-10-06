// B1 Run it back (§5.cm): what a rerun carries. The FORMAT always; last time's field, course,
// shape and pairings as pre-fills. Never the old score keys (matchupId) — a rerun that kept
// them would open on the previous game's scores.

import { describe, expect, it } from 'vitest';
import { rerunPlanFromGame } from '@/lib/pool-formats';
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
