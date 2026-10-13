// F-113 (P1 money): the wizard saved a classic head-to-head game WITHOUT `matchConfig.scoring`,
// so "Hole by hole (match play)" settled every leg on stroke totals. These scores make the two
// answers disagree, so the payout shows which rule the saved game is played under.
//
// Two best net, scratch, $10 front / $10 back / $20 overall per player:
//   hole 1, 2: one Team 2 player birdies → Team 2 wins the hole by 1 (team −1 vs 0)
//   hole 3:    two Team 1 players eagle   → Team 1 wins the hole by 4 (team −4 vs 0)
//   every other hole: all par → halved.
// Front: Team 2 wins MORE HOLES (2 to 1); Team 1 has the LOWER TOTAL (−4 to −2). Back: all square.

import { describe, expect, it } from 'vitest';
import { computePoolResult, type PoolMatchConfig } from '@/lib/pool-game';
import { makeGame, scoresFor, TEST_PARS } from './fixtures';

const par = (h: number) => TEST_PARS[h - 1];
const holes = Array.from({ length: 18 }, (_, i) => i + 1);
const round = (id: string, delta: Record<number, number>) => scoresFor(id, holes.map((h) => par(h) + (delta[h] ?? 0)));

const scores = new Map([
  ['m1', [round('p1', { 3: -2 }), round('p2', { 3: -2 }), round('p3', {}), round('p4', {})].flat()],
  ['m2', [round('p5', { 1: -1 }), round('p6', { 2: -1 }), round('p7', {}), round('p8', {})].flat()],
]);

function play(matchConfig: PoolMatchConfig) {
  const game = makeGame({ teamCount: 2, indexes: Array(8).fill(0), teamFormat: 'two-best-net', moneyMode: 'match', matchConfig });
  const r = computePoolResult(game, scores);
  const pp = (id: string) => r.payouts.find((p) => p.teamId === id)!.perPersonNet;
  expect(r.payouts.reduce((s, p) => s + p.net, 0)).toBeCloseTo(0, 6);
  return { t1: pp('t1'), t2: pp('t2') };
}

const dollars = { legDollars: { front: 10, back: 10, overall: 20 }, junkPerPoint: 0 };

describe('F-113: the scoring choice decides the money, so the saved game must carry it', () => {
  it('hole by hole: Team 2 won more holes, so it takes front + overall ($30 each)', () => {
    expect(play({ ...dollars, scoring: 'holes', pointsPerHole: { win: 1, tie: 0.5, loss: 0 } })).toEqual({ t1: -30, t2: 30 });
  });

  it('what the bug saved (no scoring field) plays STROKE totals: the money flips to Team 1', () => {
    expect(play({ ...dollars })).toEqual({ t1: 30, t2: -30 });
    expect(play({ ...dollars, scoring: 'stroke' })).toEqual({ t1: 30, t2: -30 });
  });
});
