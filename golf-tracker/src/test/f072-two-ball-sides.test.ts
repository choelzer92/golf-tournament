// F-072: the two-ball formats (two best net, two best gross, best net + best gross) on the SIDES
// engine (`team-game.ts`), scored through the shared `teamValueOnHole` that the classic pool
// already uses.
//
// WHY THIS FILE EXISTS
// Craig, on the scoring step greying "Best net + best gross" for pairs: "why would best net and
// best gross not be possible with twosomes? technically it would, right?" It would — a pair has
// two balls. The sides engine had hand-rolled best-ball / combined / one-ball only, and any
// other `format` silently scored as best ball (F-069). These are the goldens pinned BEFORE the
// engine was rerouted (§5.z), and they are INDEPENDENT ORACLES: every expected number below is
// hand arithmetic from the raw gross scores and TEST_PARS, never read back from the engine.
//
// THE FIXTURE, chosen so the three formats DISAGREE about who wins:
//
//   side A   p1  index 0    gross par      →  net par
//            p2  index 36   gross par + 2  →  net par       (2 strokes on every hole)
//   side B   p3  index 0    gross par      →  net par
//            p4  index 0    gross par + 1  →  net par + 1
//
//   best ball          A par         B par         dead heat — pays nobody
//   two best net       A 2·par       B 2·par + 1   A wins every hole by 1
//   two best gross     A 2·par + 2   B 2·par + 1   B wins every hole by 1
//   best net + gross   A 2·par       B 2·par + 1   A wins every hole by 1
//
// So the OLD behaviour (everything is best ball) settles $0 in every cell, and a rewrite that
// got net/gross backwards pays the wrong side. Under Stableford the per-ball points are
// 2+2=4 / 2+1=3 (two best net), 2+0=2 / 2+1=3 (two best gross), 4 / 3 (net + gross).
//
// Extra members on 3- and 4-player sides post worse cards (par+4, par+5) so "two best" has
// something to leave out; the hand values above must not move when they join.
//
// PROVED IT CAN FAIL (§5.z): written against the OLD engine, all 164 cases failed (every cell a
// $0 dead heat). Mutations after the reroute, each a one-liner, run 2026-09-16:
//
//   | mutation                                             | cases failed |
//   |------------------------------------------------------|--------------|
//   | `teamValueOnHole` fed `format: 'best-ball'`          | 164 / 164    |
//   | two-best-gross sorting NETS instead of grosses       | 27 (every two-best-gross stroke cell) |
//   | net-and-gross letting ONE player supply both halves  | 27 (every net-and-gross stroke cell)  |

import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import type { IndividualResult, PlayerStanding } from '@/lib/game-modes/types';
import type { GameSide } from '@/lib/game-modes/sides';
import type { PoolGame } from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import { allEighteen, makeGame, scoresFor, singleMatchup, TEST_PARS } from './fixtures';

const HOLES = allEighteen();
const flat = (over: number, holes: number[] = HOLES) => holes.map((h) => TEST_PARS[h - 1] + over);

function run(game: PoolGame, scores: GameScore[]): IndividualResult {
  const mode = getGameMode(game.gameMode);
  if (!mode) throw new Error(`no such mode: ${game.gameMode}`);
  return mode.compute(buildGameModeContext(game, singleMatchup(scores)));
}
const standing = (r: IndividualResult, id: string): PlayerStanding => {
  const s = r.standings.find((x) => x.playerId === id);
  if (!s) throw new Error(`no standing for ${id}`);
  return s;
};
const sideValues = (r: IndividualResult, id: string): (number | null)[] => {
  const s = r.sideBreakdown?.find((x) => x.id === id);
  if (!s) throw new Error(`no side breakdown for ${id}`);
  return s.values;
};
const sumMoney = (r: IndividualResult) => r.standings.reduce((s, x) => s + x.moneyNet, 0);

type TwoBall = 'two-best-net' | 'two-best-gross' | 'net-and-gross';
const TWO_BALL: TwoBall[] = ['two-best-net', 'two-best-gross', 'net-and-gross'];
const MONEY_MODELS = ['legs', 'per-hole', 'per-point', 'pot'] as const;

/** Money each model hands the winner when one side takes every hole and every leg by 1. */
const SWEEP_MONEY: Record<(typeof MONEY_MODELS)[number], number> = {
  legs: 10 + 10 + 20,   // front, back, overall
  'per-hole': 18 * 2,   // 18 holes × $2
  'per-point': 18 * 1,  // 18-stroke (or 18-point) margin × $1
  pot: 20,              // two sides × $20 buy-in, winner takes the other's ante
};

/** A two-side game, `size` players a side, built to the table in the header. */
function twoSides(size: 2 | 3 | 4, settings: Record<string, string | number | boolean>) {
  // Players are numbered p1.. in `indexes` order; A gets the odd slots, B the even, so extras
  // interleave and the ids stay easy to read.
  const a = ['p1', 'p2'], b = ['p3', 'p4'];
  const indexes = [0, 36, 0, 0];
  const scores: GameScore[] = [
    ...scoresFor('p1', flat(0)), ...scoresFor('p2', flat(2)),
    ...scoresFor('p3', flat(0)), ...scoresFor('p4', flat(1)),
  ];
  let next = 5;
  for (let extra = 2; extra < size; extra++) {
    const idA = `p${next++}`, idB = `p${next++}`;
    a.push(idA); b.push(idB);
    indexes.push(0, 0);
    scores.push(...scoresFor(idA, flat(2 + extra)), ...scoresFor(idB, flat(2 + extra)));
  }
  const sides: GameSide[] = [{ id: 'a', playerIds: a }, { id: 'b', playerIds: b }];
  const game = makeGame({
    gameMode: 'team-2v2', indexes, sides,
    modeSettings: {
      scoring: 'stroke', result: 'total',
      dollarsPerHole: 2, dollarsPerPoint: 1,
      legFront: 10, legBack: 10, legOverall: 20,
      sideBuyIn: 20, potSplit: '100',
      ...settings,
    },
  });
  return { game, scores };
}

/** Hand values per hole, straight from the header table. */
const HAND = {
  stroke: {
    'two-best-net':   { a: (par: number) => 2 * par,     b: (par: number) => 2 * par + 1, winner: 'A' },
    'two-best-gross': { a: (par: number) => 2 * par + 2, b: (par: number) => 2 * par + 1, winner: 'B' },
    'net-and-gross':  { a: (par: number) => 2 * par,     b: (par: number) => 2 * par + 1, winner: 'A' },
  },
  stableford: {
    'two-best-net':   { a: () => 4, b: () => 3, winner: 'A' },
    'two-best-gross': { a: () => 2, b: () => 3, winner: 'B' },
    'net-and-gross':  { a: () => 4, b: () => 3, winner: 'A' },
  },
} as const;

describe('F-072: two-ball formats score on the sides engine', () => {
  for (const size of [2, 3, 4] as const) {
    for (const format of TWO_BALL) {
      for (const scoring of ['stroke', 'stableford'] as const) {
        const hand = HAND[scoring][format];
        it(`${size}-a-side / ${format} / ${scoring}: every hole value is the hand value`, () => {
          const { game, scores } = twoSides(size, { format, scoring, moneyModel: 'per-point' });
          const r = run(game, scores);
          expect(sideValues(r, 'a')).toEqual(HOLES.map((h) => hand.a(TEST_PARS[h - 1])));
          expect(sideValues(r, 'b')).toEqual(HOLES.map((h) => hand.b(TEST_PARS[h - 1])));
          expect(standing(r, hand.winner).place).toBe(1);
        });

        for (const moneyModel of MONEY_MODELS) {
          for (const result of ['total', 'match'] as const) {
            it(`${size}-a-side / ${format} / ${scoring} / ${result} / ${moneyModel}: winner collects the sweep, zero-sum`, () => {
              const { game, scores } = twoSides(size, { format, scoring, result, moneyModel });
              const r = run(game, scores);
              const loser = hand.winner === 'A' ? 'B' : 'A';
              // per-point under match counts holes won (18) at $1; every other cell is in the table.
              const expected = moneyModel === 'per-point' && result === 'match' ? 18 : SWEEP_MONEY[moneyModel];
              expect(standing(r, hand.winner).moneyNet).toBeCloseTo(expected, 6);
              expect(standing(r, loser).moneyNet).toBeCloseTo(-expected, 6);
              expect(sumMoney(r)).toBeCloseTo(0, 6);
            });
          }
        }
      }
    }
  }

  it('a two-ball side has NO hole score until two members have posted', () => {
    const { game } = twoSides(2, { format: 'two-best-net', moneyModel: 'per-hole' });
    // Only p1 (side A) and p3 + p4 (side B) have played hole 1.
    const r = run(game, [
      ...scoresFor('p1', flat(0, [1]), [1]),
      ...scoresFor('p3', flat(0, [1]), [1]), ...scoresFor('p4', flat(1, [1]), [1]),
    ]);
    expect(sideValues(r, 'a')[0]).toBeNull();
    expect(sideValues(r, 'b')[0]).toBe(2 * TEST_PARS[0] + 1);
    expect(standing(r, 'A').thru).toBe(0);
    expect(standing(r, 'B').thru).toBe(1);
    // An uncontested hole pays nothing.
    expect(sumMoney(r)).toBe(0);
    expect(standing(r, 'B').moneyNet).toBe(0);
  });

  it('three pairs on two best net rank A, B, C by hand arithmetic and settle zero-sum', () => {
    // C: p5 par+1 and p6 par+2, both scratch → 2·par + 3, behind B's 2·par + 1.
    const sides: GameSide[] = [
      { id: 'a', playerIds: ['p1', 'p2'] }, { id: 'b', playerIds: ['p3', 'p4'] }, { id: 'c', playerIds: ['p5', 'p6'] },
    ];
    const game = makeGame({
      gameMode: 'team-2v2', indexes: [0, 36, 0, 0, 0, 0], sides,
      modeSettings: {
        format: 'two-best-net', scoring: 'stroke', result: 'total', moneyModel: 'legs',
        legFront: 10, legBack: 10, legOverall: 20,
      },
    });
    const r = run(game, [
      ...scoresFor('p1', flat(0)), ...scoresFor('p2', flat(2)),
      ...scoresFor('p3', flat(0)), ...scoresFor('p4', flat(1)),
      ...scoresFor('p5', flat(1)), ...scoresFor('p6', flat(2)),
    ]);
    expect(sideValues(r, 'c')).toEqual(HOLES.map((h) => 2 * TEST_PARS[h - 1] + 3));
    expect([standing(r, 'A').place, standing(r, 'B').place, standing(r, 'C').place]).toEqual([1, 2, 3]);
    // Fixed legs at N sides (§5.aj): the leg WINNER collects each leg from every side behind it,
    // and the sides behind owe nothing to each other. A takes 40 from B and 40 from C.
    expect(standing(r, 'A').moneyNet).toBe(80);
    expect(standing(r, 'B').moneyNet).toBe(-40);
    expect(standing(r, 'C').moneyNet).toBe(-40);
    expect(sumMoney(r)).toBe(0);
  });
});
