// F-101 c (§5.bw, 2026-09-29): Craig, "teams want to know what the current standings are during the
// round". While teams are on different holes each Front / Back / Overall line also carries a LIVE
// reading: the leader on score to par over the holes each team has played, the way Standings
// ranks. Display only. The contested-hole status, winner and leaders stay, and money reads those.

import { describe, expect, it } from 'vitest';
import { computeGameResult } from '@/lib/game-modes/result';
import type { IndividualResult, TeamLegLine } from '@/lib/game-modes/types';
import type { PoolGame } from '@/lib/pool-game';
import { makeGame, makeTeam, scoresFor, TEST_PARS } from './fixtures';

const holes = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
// p1 birdies every hole it plays; the rest shoot par, so a best-ball side is −1 a hole.
const birdies = (pid: string, n: number, eagleOn?: number) =>
  scoresFor(pid, holes(n).map((h) => TEST_PARS[h - 1] - (h === eagleOn ? 2 : 1)), holes(n));
const pars = (pid: string, n: number) => scoresFor(pid, holes(n).map((h) => TEST_PARS[h - 1]), holes(n));

function game(settings: Record<string, string | number>): PoolGame {
  return makeGame({
    indexes: [0, 0, 0, 0, 0, 0, 0, 0],
    gameMode: 'team-2v2',
    handicapAllowance: 0,
    sides: [
      { id: 'a', name: 'Hogs', playerIds: ['p1', 'p2', 'p3', 'p4'] },
      { id: 'b', name: 'Dawgs', playerIds: ['p5', 'p6', 'p7', 'p8'] },
    ],
    modeSettings: { format: 'best-ball', scoring: 'stroke', result: 'total', moneyModel: 'per-point', dollarsPerPoint: 1, ...settings },
    teams: [makeTeam(1, ['p1', 'p2', 'p3', 'p4']), makeTeam(2, ['p5', 'p6', 'p7', 'p8'])],
  });
}
// Hogs (group 1) are through 18 at −18. Dawgs (group 2) are through 12 at −13 (an eagle on 1).
const staggered = new Map([
  ['m1', [...birdies('p1', 18), ...pars('p2', 18), ...pars('p3', 18), ...pars('p4', 18)]],
  ['m2', [...birdies('p5', 12, 1), ...pars('p6', 12), ...pars('p7', 12), ...pars('p8', 12)]],
]);
const legs = (g: PoolGame, scores = staggered) => {
  const r = computeGameResult(g, scores) as IndividualResult;
  return Object.fromEntries((r.teamLegs ?? []).map((l) => [l.key, l])) as Record<string, TeamLegLine>;
};

describe('F-101 c: live legs while teams are on different holes', () => {
  it('Back and Overall read live, like Standings; the contested line is untouched', () => {
    const l = legs(game({}));
    expect(l.overall.live).toEqual({ leaders: ['a'], names: ['Hogs'], toPar: -18, thru: 18 });
    expect(l.back.live).toEqual({ leaders: ['a'], names: ['Hogs'], toPar: -9, thru: 9 });
    // Contested holes only (what pays): 12 holes each, Dawgs −13 v Hogs −12.
    expect(l.overall).toMatchObject({ status: 'Dawgs by 1', winner: 'b', leaders: ['b'], thru: 12 });
    expect(l.back).toMatchObject({ status: 'Tied', leaders: ['a', 'b'], thru: 3 });
  });

  it('a leg both teams have played the same holes of has no live reading', () => {
    const l = legs(game({}));
    expect(l.front.live).toBeUndefined();
    expect(l.front.status).toBe('Dawgs by 1');
  });

  it('a level or finished round carries no live reading on any leg', () => {
    const done = new Map([
      ['m1', staggered.get('m1')!],
      ['m2', [...birdies('p5', 18, 1), ...pars('p6', 18), ...pars('p7', 18), ...pars('p8', 18)]],
    ]);
    for (const leg of Object.values(legs(game({}), done))) expect('live' in leg).toBe(false);
  });

  it('Stableford reads live too, higher is better', () => {
    const l = legs(game({ scoring: 'stableford' }));
    expect(l.overall.live?.leaders).toEqual(['a']);
    expect(l.overall.live!.toPar).toBeGreaterThan(0);
  });

  it('match play (holes won) has no live reading: a hole has no winner until every team posts it', () => {
    for (const leg of Object.values(legs(game({ result: 'match' })))) expect(leg.live).toBeUndefined();
  });

  it('money is unchanged by the live reading, and zero-sum', () => {
    const g = game({ moneyModel: 'legs', legFront: 5, legBack: 5, legOverall: 10 });
    const r = computeGameResult(g, staggered) as IndividualResult;
    const net = r.standings.reduce((s, x) => s + x.moneyNet, 0);
    expect(Math.abs(net)).toBeLessThan(1e-9);
    // Paid on contested holes: Dawgs take the front (by 1) and the overall (by 1); the back halves.
    const dawgs = r.standings.find((s) => s.playerName === 'Dawgs')!;
    expect(dawgs.moneyNet).toBe(15);
  });
});
