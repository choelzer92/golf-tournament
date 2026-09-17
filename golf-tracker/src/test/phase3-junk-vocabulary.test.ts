// Phase 3 step 1 — ONE junk vocabulary on every engine (DECISIONS §5.bq, Q-A confirmed 2026-09-17).
//
// Junk is counted in POINTS (birdie 1, eagle 2, albatross 5 by default) and paid one of two ways:
//   • `junkPayout: 'per-point'` — every point is worth `junkPerPoint` dollars; each earner collects
//     from every other player / side (the §5.ad round robin, unchanged in shape).
//   • `junkPayout: 'pot'`       — a stated `junkPot` is anted equally by everyone in play and goes to
//     whoever has the MOST points; ties split it (the Warriors' rule, on any engine).
//
// Written BEFORE the engine change (§5.z). On today's code the team and individual layers treat
// `junkBirdie` as DOLLARS and know neither `junkPerPoint` nor `junkPayout`, so every "pays" case
// below fails first. The compatibility case must pass before AND after: a saved game with only the
// old keys reads as points at $1/pt, which is arithmetically what it always paid.

import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import type { IndividualResult } from '@/lib/game-modes/types';
import type { GameSide } from '@/lib/game-modes/sides';
import type { PoolGame } from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import { makeGame, scoresFor, singleMatchup, TEST_PARS } from './fixtures';

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
const sumMoney = (r: IndividualResult) => r.standings.reduce((s, x) => s + x.moneyNet, 0);

/** A card at par except the listed holes, each `under` strokes below par (1 = birdie, 2 = eagle). */
function card(under: Record<number, number> = {}): number[] {
  return TEST_PARS.map((p, i) => p - (under[i + 1] ?? 0));
}

/** Four scratch pairs a/b/c/d = (p1,p2) (p3,p4) (p5,p6) (p7,p8), legs at $0 so ONLY junk pays. */
function fourPairs(junk: Record<string, string | number | boolean>): PoolGame {
  const spec = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6'], ['p7', 'p8']];
  const sides: GameSide[] = spec.map((playerIds, i) => ({ id: String.fromCharCode(97 + i), playerIds }));
  return makeGame({
    gameMode: 'team-2v2', indexes: [0, 0, 0, 0, 0, 0, 0, 0], sides,
    modeSettings: {
      format: 'best-ball', scoring: 'stroke', result: 'total',
      moneyModel: 'legs', legFront: 0, legBack: 0, legOverall: 0,
      junkEnabled: true, junkBasis: 'gross', ...junk,
    },
  });
}
// Example 1 minus the CTP (step 2): A two birdies = 2 pts · B one birdie = 1 · C none · D eagle = 2.
// Hole 2 is a par 5 in TEST_PARS, so a 3 there is the eagle.
const FOUR_PAIR_CARDS = [
  ...scoresFor('p1', card({ 1: 1, 4: 1 })), ...scoresFor('p2', card()),
  ...scoresFor('p3', card({ 1: 1 })),       ...scoresFor('p4', card()),
  ...scoresFor('p5', card()),               ...scoresFor('p6', card()),
  ...scoresFor('p7', card({ 2: 2 })),       ...scoresFor('p8', card()),
];

describe('Phase 3 step 1 — junk in points, paid per point or as a junk pot', () => {
  it('team engine: $ per point multiplies the POINTS (2 pts at $5 = $10 collected from each side)', () => {
    const r = run(fourPairs({ junkBirdie: 1, junkEagle: 2, junkAlbatross: 5, junkPayout: 'per-point', junkPerPoint: 5 }), FOUR_PAIR_CARDS);
    // Points A 2 · B 1 · C 0 · D 2, total 5. Round robin: mine×3 − (5 − mine), × $5.
    expect(money(r, 'A')).toBe(15);
    expect(money(r, 'B')).toBe(-5);
    expect(money(r, 'C')).toBe(-25);
    expect(money(r, 'D')).toBe(15);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
    const a = r.junkLines?.find((l) => l.playerId === 'p1');
    expect(a?.points).toBe(2);
    expect(a?.dollars).toBe(10);
  });

  it('team engine: a junk POT goes to the most points, ties split, everyone in play antes equally', () => {
    const r = run(fourPairs({ junkBirdie: 1, junkEagle: 2, junkAlbatross: 5, junkPayout: 'pot', junkPot: 20 }), FOUR_PAIR_CARDS);
    // A and D tie on 2 points → $10 each; every side anted $5.
    expect(money(r, 'A')).toBe(5);
    expect(money(r, 'D')).toBe(5);
    expect(money(r, 'B')).toBe(-5);
    expect(money(r, 'C')).toBe(-5);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });

  it('team engine: a junk pot with ONE leader pays the whole pot to that side', () => {
    // Give D a birdie too, so D has 3 points and leads alone.
    const cards = [...FOUR_PAIR_CARDS.filter((s) => s.playerId !== 'p8'), ...scoresFor('p8', card({ 5: 1 }))];
    const r = run(fourPairs({ junkBirdie: 1, junkEagle: 2, junkAlbatross: 5, junkPayout: 'pot', junkPot: 20 }), cards);
    expect(money(r, 'D')).toBe(15);
    expect(money(r, 'A')).toBe(-5);
    expect(money(r, 'B')).toBe(-5);
    expect(money(r, 'C')).toBe(-5);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });

  it('individual mode: $ per point multiplies the points too', () => {
    const game = makeGame({
      gameMode: 'low-total', indexes: [0, 0, 0, 0],
      modeSettings: {
        scoreBasis: 'gross', moneyModel: 'per-stroke', dollarsPerStroke: 0,
        junkEnabled: true, junkBirdie: 1, junkEagle: 2, junkAlbatross: 5, junkBasis: 'gross',
        junkPayout: 'per-point', junkPerPoint: 5,
      },
    });
    const r = run(game, [
      ...scoresFor('p1', card({ 1: 1 })),
      ...['p2', 'p3', 'p4'].flatMap((id) => scoresFor(id, card())),
    ]);
    expect(money(r, 'p1')).toBe(15);
    expect(money(r, 'p2')).toBe(-5);
    expect(r.junkLines?.find((l) => l.playerId === 'p1')?.dollars).toBe(5);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });

  it('individual mode: a junk pot goes to the most points', () => {
    const game = makeGame({
      gameMode: 'low-total', indexes: [0, 0, 0, 0],
      modeSettings: {
        scoreBasis: 'gross', moneyModel: 'per-stroke', dollarsPerStroke: 0,
        junkEnabled: true, junkBirdie: 1, junkEagle: 2, junkAlbatross: 5, junkBasis: 'gross',
        junkPayout: 'pot', junkPot: 40,
      },
    });
    const r = run(game, [
      ...scoresFor('p1', card({ 1: 1 })),      // 1 pt
      ...scoresFor('p2', card({ 2: 2 })),      // eagle, 2 pts → takes the $40, anted $10
      ...['p3', 'p4'].flatMap((id) => scoresFor(id, card())),
    ]);
    expect(money(r, 'p2')).toBe(30);
    expect(money(r, 'p1')).toBe(-10);
    expect(money(r, 'p3')).toBe(-10);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });

  // COMPATIBILITY — must hold before and after. Every saved team game was written with
  // `junkBirdie: 2, junkEagle: 5, junkAlbatross: 10` meaning DOLLARS; read as points at the
  // default $1/pt those are the same numbers, so its settlement does not move a cent.
  it('a saved game with only the old keys pays exactly what it always paid', () => {
    const r = run(fourPairs({ junkBirdie: 2, junkEagle: 5, junkAlbatross: 10 }), FOUR_PAIR_CARDS);
    // "dollars" A 4 · B 2 · C 0 · D 5, total 11. Round robin at $1: mine×3 − (11 − mine).
    expect(money(r, 'A')).toBe(5);
    expect(money(r, 'B')).toBe(-3);
    expect(money(r, 'C')).toBe(-11);
    expect(money(r, 'D')).toBe(9);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });
});
