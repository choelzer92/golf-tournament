// Phase 3 step 2 — CTP, group hug and hand-tracked bonuses are JUNK POINTS on every engine
// (DECISIONS §5.bq Q1, Craig: "yes, exactly the same, if junk is included, bonuses can count as junk
// points, and payment can vary based on the money settings").
//
// Written BEFORE the engine change (§5.z). Today's team and individual junk layer counts only
// birdies/eagles/albatrosses and never reads `ctpWinners`, `bonusMarks` or a side's all-par holes,
// so every "pays" case fails first. The compatibility case must hold before and after: a saved team
// game that happens to carry `ctpWinners` (the F-090 editor used to render on legacy team games) pays
// nothing for them until the game SAYS closest-to-pin is worth points (`junkCtp` defaults to 0).

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
/** A card at par except the listed holes, each `off` strokes from par (−1 birdie, +1 bogey). */
const card = (off: Record<number, number> = {}) => TEST_PARS.map((p, i) => p + (off[i + 1] ?? 0));

const PAIRS = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6'], ['p7', 'p8']];
function sidesGame(pairs: string[][], settings: Record<string, string | number | boolean>, extra: Partial<PoolGame> = {}): PoolGame {
  const sides: GameSide[] = pairs.map((playerIds, i) => ({ id: String.fromCharCode(97 + i), playerIds }));
  return makeGame({
    gameMode: 'team-2v2', indexes: pairs.flat().map(() => 0), sides,
    modeSettings: {
      format: 'best-ball', scoring: 'stroke', result: 'total',
      moneyModel: 'legs', legFront: 0, legBack: 0, legOverall: 0,
      junkEnabled: true, junkBasis: 'gross', junkBirdie: 1, junkEagle: 2, junkAlbatross: 5,
      junkPayout: 'per-point', junkPerPoint: 1,
      ...settings,
    },
    ...extra,
  });
}
// Spec Example 1: A two birdies + CTP on 7 = 3 pts · B one birdie = 1 · C 0 · D eagle = 2.
const EXAMPLE_1_CARDS = [
  ...scoresFor('p1', card({ 1: -1, 4: -1 })), ...scoresFor('p2', card()),
  ...scoresFor('p3', card({ 1: -1 })),        ...scoresFor('p4', card()),
  ...scoresFor('p5', card()),                 ...scoresFor('p6', card()),
  ...scoresFor('p7', card({ 2: -2 })),        ...scoresFor('p8', card()),
];

describe('Phase 3 step 2 — bonuses are junk points on the team engine', () => {
  it('Example 1: closest-to-pin adds a point to the winner\'s team (A +6, B −2, C −6, D +2)', () => {
    const g = sidesGame(PAIRS, { junkCtp: 1 }, { ctpWinners: { 7: 'p1' } });
    const r = run(g, EXAMPLE_1_CARDS);
    // Points A 3 · B 1 · C 0 · D 2, total 6. Round robin at $1: mine×3 − (6 − mine).
    expect(money(r, 'A')).toBe(6);
    expect(money(r, 'B')).toBe(-2);
    expect(money(r, 'C')).toBe(-6);
    expect(money(r, 'D')).toBe(2);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
    const p1 = r.junkLines?.find((l) => l.playerId === 'p1');
    expect(p1?.ctps).toBe(1);
    expect(p1?.points).toBe(3);
  });

  it('closest-to-pin counts only on a par 3 and only for the hole\'s named winner', () => {
    // Hole 1 is a par 4: a "winner" recorded there is ignored. Hole 12 is a par 3: counts.
    const g = sidesGame(PAIRS.slice(0, 2), { junkCtp: 2 }, { ctpWinners: { 1: 'p3', 12: 'p3' } });
    const r = run(g, [...['p1', 'p2', 'p3', 'p4'].flatMap((id) => scoresFor(id, card()))]);
    expect(r.junkLines?.find((l) => l.playerId === 'p3')?.ctps).toBe(1);
    expect(money(r, 'B')).toBe(2);
    expect(money(r, 'A')).toBe(-2);
  });

  it('Example 2: a hand-tracked "Sandie" worth 2 points on a Team A player pays A +2, B −2', () => {
    const g = sidesGame(PAIRS.slice(0, 2), {}, {
      customBonuses: [{ id: 'sandie', label: 'Sandie', points: 2 }],
      bonusMarks: { 4: { p1: ['sandie'] } },
    });
    const r = run(g, [...['p1', 'p2', 'p3', 'p4'].flatMap((id) => scoresFor(id, card()))]);
    expect(money(r, 'A')).toBe(2);
    expect(money(r, 'B')).toBe(-2);
    const p1 = r.junkLines?.find((l) => l.playerId === 'p1');
    expect(p1?.custom).toBe(2);
    expect(p1?.points).toBe(2);
  });

  it('group hug: every member of the side at par or better on a hole earns the side a point', () => {
    // A: both par everywhere → 18 all-par holes. B: p3 bogeys every hole → none.
    const g = sidesGame(PAIRS.slice(0, 2), { junkGroupHug: 1 });
    const r = run(g, [
      ...scoresFor('p1', card()), ...scoresFor('p2', card()),
      ...scoresFor('p3', TEST_PARS.map((p) => p + 1)), ...scoresFor('p4', card()),
    ]);
    expect(money(r, 'A')).toBe(18);
    expect(money(r, 'B')).toBe(-18);
    expect(r.junkSides?.find((s) => s.id === 'a')?.groupHugs).toBe(18);
    expect(r.junkSides?.find((s) => s.id === 'b')?.groupHugs).toBe(0);
  });

  it('group hug counts a hole only when EVERY member has scored it', () => {
    // p2 has scored nothing: side A can't have an all-par hole yet.
    const g = sidesGame(PAIRS.slice(0, 2), { junkGroupHug: 1 });
    const r = run(g, [
      ...scoresFor('p1', card()),
      ...scoresFor('p3', card()), ...scoresFor('p4', card()),
    ]);
    expect(r.junkSides?.find((s) => s.id === 'a')?.groupHugs).toBe(0);
    expect(r.junkSides?.find((s) => s.id === 'b')?.groupHugs).toBe(18);
  });

  it('bonus points feed the junk POT like any other point', () => {
    // A leads on birdies 2–1 but B takes the CTP worth 2 → B 3 pts to A 2: B takes the $20 pot.
    const g = sidesGame(PAIRS.slice(0, 2), { junkCtp: 2, junkPayout: 'pot', junkPot: 20 }, { ctpWinners: { 3: 'p3' } });
    const r = run(g, [
      ...scoresFor('p1', card({ 1: -1, 4: -1 })), ...scoresFor('p2', card()),
      ...scoresFor('p3', card({ 1: -1 })), ...scoresFor('p4', card()),
    ]);
    expect(money(r, 'B')).toBe(10);
    expect(money(r, 'A')).toBe(-10);
  });

  // COMPATIBILITY — must hold before and after.
  it('a saved team game carrying ctpWinners pays nothing for them until junkCtp says so', () => {
    const g = sidesGame(PAIRS, {}, { ctpWinners: { 7: 'p1' } });
    const r = run(g, EXAMPLE_1_CARDS);
    // Points A 2 · B 1 · C 0 · D 2, total 5 → step 1's numbers.
    expect(money(r, 'A')).toBe(3);
    expect(money(r, 'B')).toBe(-1);
    expect(money(r, 'C')).toBe(-5);
    expect(money(r, 'D')).toBe(3);
  });
});

describe('Phase 3 step 2 — bonuses are junk points on an individual mode', () => {
  it('closest-to-pin pays the winner from the rest of the group', () => {
    const game = makeGame({
      gameMode: 'low-total', indexes: [0, 0, 0, 0],
      ctpWinners: { 3: 'p1' },
      modeSettings: {
        scoreBasis: 'gross', moneyModel: 'per-stroke', dollarsPerStroke: 0,
        junkEnabled: true, junkBirdie: 1, junkEagle: 2, junkAlbatross: 5, junkBasis: 'gross',
        junkCtp: 1, junkPayout: 'per-point', junkPerPoint: 1,
      },
    });
    const r = run(game, ['p1', 'p2', 'p3', 'p4'].flatMap((id) => scoresFor(id, card())));
    expect(money(r, 'p1')).toBe(3);
    expect(money(r, 'p2')).toBe(-1);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });

  it('hand-tracked bonuses pay the player who earned them', () => {
    const game = makeGame({
      gameMode: 'low-total', indexes: [0, 0, 0, 0],
      customBonuses: [{ id: 'greenie', label: 'Greenie', points: 1 }],
      bonusMarks: { 3: { p2: ['greenie'] }, 7: { p2: ['greenie'] } },
      modeSettings: {
        scoreBasis: 'gross', moneyModel: 'per-stroke', dollarsPerStroke: 0,
        junkEnabled: true, junkBirdie: 1, junkEagle: 2, junkAlbatross: 5, junkBasis: 'gross',
        junkPayout: 'per-point', junkPerPoint: 1,
      },
    });
    const r = run(game, ['p1', 'p2', 'p3', 'p4'].flatMap((id) => scoresFor(id, card())));
    expect(money(r, 'p2')).toBe(6);
    expect(money(r, 'p1')).toBe(-2);
    expect(r.junkLines?.find((l) => l.playerId === 'p2')?.custom).toBe(2);
  });
});
