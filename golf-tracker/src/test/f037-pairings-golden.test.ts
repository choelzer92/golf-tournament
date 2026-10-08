// F-037 / Team → Match (§5.cn, §5.co) — T0 goldens: pin TODAY's field-wide numbers first.
//
// The worked example from `.claude/plans/f037-opt-b.md` §5, hand-derived (not read back from the
// engine). Eight scratch players in two foursomes, four pairs, best ball, net strokes, Compare by
// Total:
//   Group 1 (m1): a = p1+p2, b = p3+p4.   Group 2 (m2): c = p5+p6, d = p7+p8.
//   Everyone pars except p1 birdies 1 and 2; p3 birdies 10; p5 birdies 3; p7 birdies 11, 12, 13.
//   Best ball to par (front / back / overall): a −2/0/−2, b 0/−1/−1, c −1/0/−1, d 0/−3/−3.
//
// Today the four pairs compete FIELD-WIDE (every pair against every other). Matches (T1+) must
// leave these numbers exactly where they are whenever `matchSize` is absent — this file is the
// compatibility wall the roll-up is built against.

import { describe, expect, it } from 'vitest';
import { computeGameResult } from '@/lib/game-modes/result';
import type { GameSide } from '@/lib/game-modes/sides';
import type { GameScore } from '@/lib/game-state';
import { makeGame, makeTeam, scoresFor, TEST_PARS } from './fixtures';

const G1 = ['p1', 'p2', 'p3', 'p4'];
const G2 = ['p5', 'p6', 'p7', 'p8'];
const SIDES: GameSide[] = [
  { id: 'a', playerIds: ['p1', 'p2'] },
  { id: 'b', playerIds: ['p3', 'p4'] },
  { id: 'c', playerIds: ['p5', 'p6'] },
  { id: 'd', playerIds: ['p7', 'p8'] },
];
const BIRDIES: Record<string, number[]> = { p1: [1, 2], p3: [10], p5: [3], p7: [11, 12, 13] };

function card(id: string, holes: number[]): GameScore[] {
  const birdies = BIRDIES[id] ?? [];
  return scoresFor(id, holes.map((h) => TEST_PARS[h - 1] - (birdies.includes(h) ? 1 : 0)), holes);
}

const ALL = Array.from({ length: 18 }, (_, i) => i + 1);
const FRONT = ALL.slice(0, 9);

function scores(g2Holes: number[] = ALL) {
  return new Map<string, GameScore[]>([
    ['m1', G1.flatMap((id) => card(id, ALL))],
    ['m2', G2.flatMap((id) => card(id, g2Holes))],
  ]);
}

function pairsGame(settings: Record<string, string | number | boolean>) {
  return makeGame({
    gameMode: 'team-2v2',
    indexes: [0, 0, 0, 0, 0, 0, 0, 0],
    teams: [makeTeam(1, G1), makeTeam(2, G2)],
    sides: SIDES,
    modeSettings: {
      format: 'best-ball', scoring: 'stroke', result: 'total', junkEnabled: false,
      legFront: 10, legBack: 10, legOverall: 10, dollarsPerPoint: 1,
      sideBuyIn: 20, potSplit: '100',
      ...settings,
    },
  });
}

function money(settings: Record<string, string | number | boolean>, g2Holes?: number[]) {
  const r = computeGameResult(pairsGame(settings), scores(g2Holes));
  if (r.kind !== 'individual') throw new Error('expected the team engine');
  const out = Object.fromEntries(r.standings.map((s) => [s.playerId.toLowerCase(), s.moneyNet]));
  expect(r.standings.reduce((s, x) => s + x.moneyNet, 0), 'zero-sum').toBe(0);
  return out;
}

describe('F-037 T0 — four pairs across two foursomes settle FIELD-WIDE today', () => {
  it('legs, winner-takes: front a, back d, overall d → a +10, b −30, c −30, d +50', () => {
    expect(money({ moneyModel: 'legs' })).toEqual({ a: 10, b: -30, c: -30, d: 50 });
  });

  it('per-point $1, pay-each: a +1, b −3, c −3, d +5', () => {
    expect(money({ moneyModel: 'per-point' })).toEqual({ a: 1, b: -3, c: -3, d: 5 });
  });

  it('pot $20 per team, all to overall: d takes $80 → d +60, a/b/c −20', () => {
    expect(money({ moneyModel: 'pot' })).toEqual({ a: -20, b: -20, c: -20, d: 60 });
  });

  it('mid-round (Group 2 thru 9), legs: only 1–9 contested → a +60, b/c/d −20', () => {
    expect(money({ moneyModel: 'legs' }, FRONT)).toEqual({ a: 60, b: -20, c: -20, d: -20 });
  });

  it('locality: 9s for d on 18 MOVE Group 1\'s money today (field-wide), which matches will stop', () => {
    const base = money({ moneyModel: 'per-point' });
    const s = scores();
    // Both of d's players make 9 on 18, so d's best ball there is 9 — a Group 2-only change.
    s.set('m2', s.get('m2')!.map((x) =>
      ((x.playerId === 'p7' || x.playerId === 'p8') && x.hole === 18 ? { ...x, grossScore: 9 } : x)));
    const r = computeGameResult(pairsGame({ moneyModel: 'per-point' }), s);
    if (r.kind !== 'individual') throw new Error('expected the team engine');
    const a = r.standings.find((x) => x.playerId.toLowerCase() === 'a')!.moneyNet;
    expect(a).not.toBe(base.a);
  });
});
