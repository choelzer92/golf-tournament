import { describe, it, expect } from 'vitest';
import { makePlayers, makeCourse } from './fixtures';
import { dealBalancedTeams, swapPlayers } from '@/lib/match-cards';
import { matchSheetProblem, teeGroupsFromMatches } from '@/lib/game-modes/matches';
import { getPoolPlayingHandicap } from '@/lib/pool-game';

// §5.de / §5.dg: the match cards on the teams step. One deal (shared with the teams step's "Even them out")
// and one swap that trades two players everywhere at once.

const EIGHT = makePlayers([2.1, 5.4, 8.8, 11.0, 13.6, 16.2, 19.5, 24.0]);
const indexTotal = (ids: string[], players: typeof EIGHT) => ids.reduce((s, id) => s + players.find((p) => p.id === id)!.handicapIndex!, 0);
const opts = { course: null, allowance: 1, basis: 'course' as const, nine: null, excludeCaptains: true, locks: [] };

describe('dealBalancedTeams', () => {
  it('with no course, balances on Handicap Index and covers the field once', () => {
    const teams = dealBalancedTeams(EIGHT, 2, { ...opts, captains: false });
    expect(teams.map((t) => t.playerIds.length)).toEqual([4, 4]);
    expect(new Set(teams.flatMap((t) => t.playerIds)).size).toBe(8);
    const [a, b] = teams.map((t) => indexTotal(t.playerIds, EIGHT));
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it('with captains, the two lowest indexes anchor a team each and lead their list', () => {
    const teams = dealBalancedTeams(EIGHT, 2, { ...opts, captains: true });
    expect(teams.map((t) => t.captainId).sort()).toEqual(['p1', 'p2']);
    teams.forEach((t) => expect(t.playerIds[0]).toBe(t.captainId));
  });

  it('with a course, balances on the playing handicap instead', () => {
    const course = makeCourse();
    const teams = dealBalancedTeams(EIGHT, 2, { ...opts, course, allowance: 0.85, captains: false });
    const total = (ids: string[]) => ids.reduce((s, id) => s + getPoolPlayingHandicap(EIGHT.find((p) => p.id === id)!, course, 0.85, 'course', null), 0);
    const [a, b] = teams.map((t) => total(t.playerIds));
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });
});

describe('swapPlayers', () => {
  const teams = [
    { id: 'A', playerIds: ['p1', 'p2', 'p3', 'p4'], captainId: 'p1' },
    { id: 'B', playerIds: ['p5', 'p6', 'p7', 'p8'], captainId: 'p5' },
  ];

  it('trades two players across teams, keeping sizes and positions', () => {
    const out = swapPlayers(teams, 'p2', 'p7');
    expect(out[0].playerIds).toEqual(['p1', 'p7', 'p3', 'p4']);
    expect(out[1].playerIds).toEqual(['p5', 'p6', 'p2', 'p8']);
    expect(out[0].captainId).toBe('p1');
  });

  it('a captain swapped out is replaced by captainFor', () => {
    const out = swapPlayers(teams, 'p1', 'p6', (ids) => [...ids].sort()[0]);
    expect(out[0].captainId).toBe('p2');
    expect(out[1].captainId).toBe('p5');
  });

  it('within one team it is only a reorder', () => {
    const out = swapPlayers(teams, 'p1', 'p3');
    expect(out[0].playerIds).toEqual(['p3', 'p2', 'p1', 'p4']);
    expect(out[1]).toBe(teams[1]);
  });

  it('any swap leaves a matches tee sheet pairable, singles included', () => {
    for (const size of [1, 2]) {
      const groups = teeGroupsFromMatches(teams.map((t) => t.playerIds), size)!;
      const ids = teams.flatMap((t) => t.playerIds);
      for (const a of ids) for (const b of ids) {
        const t2 = swapPlayers(teams, a, b);
        const g2 = swapPlayers(groups, a, b);
        expect(matchSheetProblem(t2, g2, size)).toBeNull();
        if (size === 1) g2.forEach((g) => g.singles!.forEach(([x, y]) => {
          const team = (id: string) => t2.find((t) => t.playerIds.includes(id))!.id;
          expect(team(x)).not.toBe(team(y));
        }));
      }
    }
  });
});
