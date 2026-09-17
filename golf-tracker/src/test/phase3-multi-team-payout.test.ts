// Phase 3 step 3 — with THREE OR MORE teams, how the losers pay is a chosen setting
// (DECISIONS §5.bq Q2–Q4; defaults and the tie rule settled in §5.br, 2026-09-17).
//
//   `legsPayout`   — 'winner-takes' (DEFAULT, §5.br: "$10 per leg" never costs more than $10) |
//                    'pay-each' (every pair of teams settles its own bet — §5.ae/§5.aj's words).
//   `pointsPayout` — 'pay-each' (DEFAULT — today's round robin, §5.ae) | 'winner-takes'.
//   Winner-takes tie at the top: the loser pays ONCE and the tied winners SPLIT it (§5.br).
//   `carryover`    — $ per hole only: a tied hole's money rolls onto the next outright winner
//                    (Q-F, skins-style); a carry left after the last hole is dead (Q-G). Default OFF.
//   $ per hole is otherwise IDENTICAL under both modes (an outright win already collects from every
//   other team), so it gets no payout select.
//
// Written BEFORE the engine change (§5.z). Today's engine knows one legs rule (leaders collect from
// everyone behind, a loser pays EACH tied leader) and one $/point rule (round robin), and no carry.
// Cases marked COMPAT must pass before AND after; everything else fails first.

import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import type { IndividualResult } from '@/lib/game-modes/types';
import type { GameSide } from '@/lib/game-modes/sides';
import type { PoolGame } from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import { allEighteen, makeGame, scoresFor, singleMatchup, TEST_PARS } from './fixtures';

function run(game: PoolGame, scores: GameScore[]): IndividualResult {
  const mode = getGameMode(game.gameMode);
  if (!mode) throw new Error(`no such mode: ${game.gameMode}`);
  return mode.compute(buildGameModeContext(game, singleMatchup(scores)));
}
const money = (r: IndividualResult, id: string) => {
  const s = r.standings.find((x) => x.playerId === id);
  if (!s) throw new Error(`no standing for ${id}`);
  return s.moneyNet;
};
const abc = (r: IndividualResult) => [money(r, 'A'), money(r, 'B'), money(r, 'C')];
const sumMoney = (r: IndividualResult) => r.standings.reduce((s, x) => s + x.moneyNet, 0);

/** Three scratch singles a/b/c (a "team" of one each), stroke play, compared on the 18-hole total. */
const THREE = [['p1'], ['p2'], ['p3']];
const TWO = [['p1'], ['p2']];
function gameN(spec: string[][], settings: Record<string, string | number | boolean>): PoolGame {
  const sides: GameSide[] = spec.map((playerIds, i) => ({ id: String.fromCharCode(97 + i), playerIds }));
  return makeGame({
    gameMode: 'team-2v2', indexes: spec.flat().map(() => 0), sides,
    modeSettings: {
      format: 'best-ball', scoring: 'stroke', result: 'total',
      moneyModel: 'legs', legFront: 10, legBack: 0, legOverall: 0,
      dollarsPerHole: 2, dollarsPerPoint: 1, junkEnabled: false,
      ...settings,
    },
  });
}
/** A card `over` strokes off par on every hole. */
const flat = (over: number) => TEST_PARS.map((p) => p + over);
/** Cards from a per-hole plan: `plan[h]` = which side ids are LOW on hole h (others +1). */
function planned(plan: (('a' | 'b' | 'c')[] | 'all')[]): GameScore[] {
  const ids = { a: 'p1', b: 'p2', c: 'p3' } as const;
  const cards: Record<string, number[]> = { p1: [], p2: [], p3: [] };
  plan.forEach((low, i) => {
    const par = TEST_PARS[i];
    (['a', 'b', 'c'] as const).forEach((s) => {
      cards[ids[s]].push(low === 'all' || low.includes(s) ? par : par + 1);
    });
  });
  return Object.entries(cards).flatMap(([id, card]) => scoresFor(id, card, allEighteen()));
}
/** 15 holes where a, b, c each win 5 outright — nets to zero for everyone. */
const CYCLE_15: ('a' | 'b' | 'c')[][] = Array.from({ length: 15 }, (_, i) => [(['a', 'b', 'c'] as const)[i % 3]]);

// A beat B beat C, a stroke a hole apart, so every leg has distinct places.
const A_B_C = [...scoresFor('p1', flat(0)), ...scoresFor('p2', flat(1)), ...scoresFor('p3', flat(2))];
const A_B_TIE_C = [...scoresFor('p1', flat(0)), ...scoresFor('p2', flat(0)), ...scoresFor('p3', flat(1))];
const A_THEN_B_C_TIE = [...scoresFor('p1', flat(0)), ...scoresFor('p2', flat(1)), ...scoresFor('p3', flat(1))];

describe('Phase 3 step 3 — fixed legs with three teams', () => {
  it('COMPAT default = winner take all: A +20, B −10, C −10 on a $10 front', () => {
    expect(abc(run(gameN(THREE, {}), A_B_C))).toEqual([20, -10, -10]);
  });

  it('winner take all, tie at the top: the loser pays ONCE and the tied winners split it (A +5, B +5, C −10)', () => {
    const r = run(gameN(THREE, {}), A_B_TIE_C);
    expect(abc(r)).toEqual([5, 5, -10]);
    expect(sumMoney(r)).toBe(0);
  });

  it('COMPAT winner take all, tie at the bottom: both losers pay the winner (A +20, B −10, C −10)', () => {
    expect(abc(run(gameN(THREE, {}), A_THEN_B_C_TIE))).toEqual([20, -10, -10]);
  });

  it('pay each team you lost to: A +20, B 0, C −20', () => {
    const r = run(gameN(THREE, { legsPayout: 'pay-each' }), A_B_C);
    expect(abc(r)).toEqual([20, 0, -20]);
    expect(sumMoney(r)).toBe(0);
  });

  it('pay each team you lost to, tie at the top: C owes both (§5.aj) — A +10, B +10, C −20', () => {
    expect(abc(run(gameN(THREE, { legsPayout: 'pay-each' }), A_B_TIE_C))).toEqual([10, 10, -20]);
  });

  it('pay each team you lost to, tie at the bottom: A +20, B −10, C −10', () => {
    expect(abc(run(gameN(THREE, { legsPayout: 'pay-each' }), A_THEN_B_C_TIE))).toEqual([20, -10, -10]);
  });

  it('COMPAT with TWO teams the setting changes nothing (±$10 either way)', () => {
    const cards = [...scoresFor('p1', flat(0)), ...scoresFor('p2', flat(1))];
    for (const legsPayout of ['pay-each', 'winner-takes']) {
      const r = run(gameN(TWO, { legsPayout }), cards);
      expect([money(r, 'A'), money(r, 'B')]).toEqual([10, -10]);
    }
  });
});

describe('Phase 3 step 3 — $ per hole with three teams', () => {
  // Hole 1: A outright. Hole 2: A and B tie low, C behind. Holes 3–17: a/b/c cycle (nets to 0).
  // Hole 18: everyone level.
  const PLAN: (('a' | 'b' | 'c')[] | 'all')[] = [['a'], ['a', 'b'], ...CYCLE_15, 'all'];

  it('COMPAT default (no carry): only an outright low team is paid, a tied hole is dead — A +4, B −2, C −2', () => {
    const r = run(gameN(THREE, { moneyModel: 'per-hole' }), planned(PLAN));
    expect(abc(r)).toEqual([4, -2, -2]);
    expect(sumMoney(r)).toBe(0);
  });

  it('carry ON: a tied hole rolls onto the next outright winner', () => {
    //   hole 1: A +4, B −2, C −2
    //   hole 2 tied → carries; hole 3 A outright collects 2 holes × $2 from each: A +8, B −4, C −4
    //   holes 4–17: B ×5, C ×5, A ×4 outright — a win collects $4, a loss costs $2:
    //     A 4×4 − 10×2 = −4 · B 5×4 − 9×2 = +2 · C +2
    //   hole 18: all tied → the carry left after the last hole is DEAD (Q-G)
    const r = run(gameN(THREE, { moneyModel: 'per-hole', carryover: true }), planned(PLAN));
    expect(abc(r)).toEqual([4 + 8 - 4, -2 - 4 + 2, -2 - 4 + 2]);
    expect(sumMoney(r)).toBe(0);
  });

  it('carry ON: a carry still standing after the last hole pays nobody', () => {
    const plan: (('a' | 'b' | 'c')[] | 'all')[] = [['a'], ...CYCLE_15, 'all', 'all'];
    const r = run(gameN(THREE, { moneyModel: 'per-hole', carryover: true }), planned(plan));
    expect(abc(r)).toEqual([4, -2, -2]);
  });

  it('carry ON with TWO teams: a halved hole doubles the next one', () => {
    // Hole 1 halved, hole 2 A wins → A collects 2 × $2; the rest of the round is halved.
    const cards = [
      ...scoresFor('p1', TEST_PARS.map((p, i) => (i === 1 ? p - 1 : p))),
      ...scoresFor('p2', flat(0)),
    ];
    const r = run(gameN(TWO, { moneyModel: 'per-hole', carryover: true }), cards);
    // Holes 3–18 are halved too and their carry dies at 18.
    expect([money(r, 'A'), money(r, 'B')]).toEqual([4, -4]);
  });
});

describe('Phase 3 step 3 — $ per point with three teams', () => {
  // Score to par: A even, B +6, C +10 (result 'total', so points = to-par margin).
  const cards = [
    ...scoresFor('p1', flat(0)),
    ...scoresFor('p2', TEST_PARS.map((p, i) => p + (i < 6 ? 1 : 0))),
    ...scoresFor('p3', TEST_PARS.map((p, i) => p + (i < 10 ? 1 : 0))),
  ];
  const tieCards = [
    ...scoresFor('p1', flat(0)), ...scoresFor('p2', flat(0)),
    ...scoresFor('p3', TEST_PARS.map((p, i) => p + (i < 4 ? 1 : 0))),
  ];

  it('COMPAT default = pay each team you lost to: pairwise margins (A +16, B −2, C −14)', () => {
    expect(abc(run(gameN(THREE, { moneyModel: 'per-point' }), cards))).toEqual([16, -2, -14]);
  });

  it('COMPAT pay each, tie at the top: C pays each leader its margin (A +4, B +4, C −8)', () => {
    expect(abc(run(gameN(THREE, { moneyModel: 'per-point' }), tieCards))).toEqual([4, 4, -8]);
  });

  it('winner take all: the leader collects its margin from each team (A +16, B −6, C −10)', () => {
    const r = run(gameN(THREE, { moneyModel: 'per-point', pointsPayout: 'winner-takes' }), cards);
    expect(abc(r)).toEqual([16, -6, -10]);
    expect(sumMoney(r)).toBe(0);
  });

  it('winner take all, tie at the top: the loser pays once, split (A +2, B +2, C −4)', () => {
    expect(abc(run(gameN(THREE, { moneyModel: 'per-point', pointsPayout: 'winner-takes' }), tieCards))).toEqual([2, 2, -4]);
  });
});
