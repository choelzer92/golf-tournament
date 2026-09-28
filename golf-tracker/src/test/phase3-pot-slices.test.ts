// Phase 3 step 4 — POT SLICES on the team engine (DECISIONS §5.bq Q-E, confirmed 2026-09-17;
// spec `.claude/plans/phase3-money-convergence.md` §3).
//
// A team-engine pot is anted PER TEAM (§5.ag). Until now it was ONE prize paid down the finishing
// order. Now, like the classic pool, it can be sliced FRONT / BACK / OVERALL / JUNK:
//   • `potFront` / `potBack` / `potOverall` / `potJunk` are SHARES of the pot, scaled to add up
//     (25/25/25/25 and 1/1/1/1 and $20/$20/$20/$20 all mean the same thing). Missing keys read
//     0 / 0 / 100 / 0 — one prize on the overall, exactly today's pot — so nothing saved moves.
//   • Each slice pays its places by `potSplit` ("100" = winner takes the slice, "70,30" the top two),
//     through the classic pool's `distributePot`: ties SPLIT the summed places, no carry, no push.
//   • The JUNK slice ranks junk POINTS (step 1's vocabulary), and only exists when junk is on and
//     `junkPayout` is 'pot' — under a buy-in pot the junk pot IS that slice, so the separately-anted
//     `junkPot` is ignored (and hidden). Per-point junk still settles beside the pot.
//   • A 9-hole game has one leg: the front and back shares fold into the overall.
//   • A slice nobody has started (the back nine at the turn) splits evenly among the teams in the
//     pot — every ante comes back on that slice, so a mid-round board never shows phantom losses
//     (the classic pool's F-011 rule).
//
// Written BEFORE the engine change (§5.z). Today's engine ignores the slice keys and pays the whole
// pot on the overall, so every case but COMPAT fails first.

import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import type { IndividualResult } from '@/lib/game-modes/types';
import type { GameSide } from '@/lib/game-modes/sides';
import type { PoolGame } from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import { backNine, frontNine, makeGame, scoresFor, singleMatchup, TEST_PARS } from './fixtures';

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
const abcd = (r: IndividualResult) => ['A', 'B', 'C', 'D'].map((id) => money(r, id));
const abc = (r: IndividualResult) => ['A', 'B', 'C'].map((id) => money(r, id));
const sumMoney = (r: IndividualResult) => r.standings.reduce((s, x) => s + x.moneyNet, 0);

type Bag = Record<string, string | number | boolean>;
function sidesGame(spec: string[][], settings: Bag, over: Partial<PoolGame> = {}): PoolGame {
  const sides: GameSide[] = spec.map((playerIds, i) => ({ id: String.fromCharCode(97 + i), playerIds }));
  return makeGame({
    gameMode: 'team-2v2', indexes: spec.flat().map(() => 0), sides,
    modeSettings: {
      format: 'best-ball', scoring: 'stroke', result: 'total',
      moneyModel: 'pot', sideBuyIn: 20, potSplit: '100', junkEnabled: false,
      ...settings,
    },
    ...over,
  });
}
const PAIRS = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6'], ['p7', 'p8']];
const THREE = [['p1'], ['p2'], ['p3']];

/** A card at par except the listed holes, offset by the given strokes (−1 birdie, +1 bogey). */
function card(off: Record<number, number> = {}): number[] {
  return TEST_PARS.map((p, i) => p + (off[i + 1] ?? 0));
}
/** A card `over` strokes off par on every hole. */
const flat = (over: number) => TEST_PARS.map((p) => p + over);

// Q-E — Example 3 in the spec. Four scratch pairs, best ball. Front: A wins. Back: B and C tie.
// Overall: A wins. Junk: A 3 (two birdies + closest-to-pin on 7), B 1, C 0, D 2 (an eagle).
// Both partners bogey where a pair must give strokes back, or the partner's par would mask it.
const Q_E_CARDS: GameScore[] = [
  ...scoresFor('p1', card({ 1: -1, 4: -1, 10: 1 })), ...scoresFor('p2', card({ 10: 1 })),      // A: F −2 · B +1 · O −1
  ...scoresFor('p3', card({ 5: -1, 6: 1 })),          ...scoresFor('p4', card({ 6: 1 })),       // B: F 0 · B 0 · O 0
  ...scoresFor('p5', card()),                          ...scoresFor('p6', card()),              // C: F 0 · B 0 · O 0
  ...scoresFor('p7', card({ 13: -2, 14: 1, 15: 1, 16: 1 })), ...scoresFor('p8', card({ 14: 1, 15: 1, 16: 1 })), // D: F 0 · B +1 · O +1
];
const Q_E_SETTINGS: Bag = {
  potFront: 25, potBack: 25, potOverall: 25, potJunk: 25,
  junkEnabled: true, junkBirdie: 1, junkEagle: 2, junkAlbatross: 5, junkCtp: 1, junkBasis: 'gross',
  junkPayout: 'pot',
};

describe('Phase 3 step 4 — pot slices on the team engine', () => {
  it('Q-E: 4 pairs × $20, four $20 slices; A wins front + overall + junk, B/C tie the back → A +40, B −10, C −10, D −20', () => {
    const r = run(sidesGame(PAIRS, Q_E_SETTINGS, { ctpWinners: { 7: 'p1' } }), Q_E_CARDS);
    expect(abcd(r)).toEqual([40, -10, -10, -20]);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
    // The board can show every slice: what it was worth and who took it.
    const slices = r.potSlices ?? [];
    expect(slices.map((s) => s.key)).toEqual(['front', 'back', 'overall', 'junk']);
    expect(slices.map((s) => s.dollars)).toEqual([20, 20, 20, 20]);
    expect(slices.find((s) => s.key === 'back')?.payouts).toEqual({ b: 10, c: 10 });
    expect(slices.find((s) => s.key === 'junk')?.payouts).toEqual({ a: 20 });
  });

  it('COMPAT: a saved pot with no slice keys is one prize on the overall — 3 × $20 at 70/30 → A +22, B −2, C −20', () => {
    const cards = [...scoresFor('p1', flat(0)), ...scoresFor('p2', flat(1)), ...scoresFor('p3', flat(2))];
    const r = run(sidesGame(THREE, { potSplit: '70,30' }), cards);
    expect(abc(r)).toEqual([22, -2, -20]);
    // …and the single overall slice is all there is to show.
    expect((r.potSlices ?? []).map((s) => [s.key, s.dollars])).toEqual([['overall', 60]]);
  });

  it('shares are scaled to the pot: 1 / 1 / 2 pays the same as 25 / 25 / 50, and $20 / $20 / $40 too', () => {
    // A takes the front, B the back AND the overall: front 15, back 15, overall 30 of the $60 pot.
    // (Today's one-prize pot hands B all $60 — A −20 — so this cannot pass by coincidence.)
    const cards = [
      ...scoresFor('p1', card({ 1: -1, 10: 1, 11: 1 })),   // A: F −1 · B +2 · O +1
      ...scoresFor('p2', card({ 10: -1 })),                // B: F 0 · B −1 · O −1
      ...scoresFor('p3', flat(1)),                         // C: last everywhere
    ];
    const expected = [15 - 20, 15 + 30 - 20, -20];   // A −5, B +25, C −20
    for (const shares of [{ potFront: 1, potBack: 1, potOverall: 2 }, { potFront: 25, potBack: 25, potOverall: 50 }, { potFront: 20, potBack: 20, potOverall: 40 }]) {
      const r = run(sidesGame(THREE, shares), cards);
      expect(abc(r)).toEqual(expected);
      expect(sumMoney(r)).toBeCloseTo(0, 6);
    }
  });

  it('a 9-hole game has one leg: front and back shares fold into the overall', () => {
    const nine = sidesGame(THREE, { potFront: 25, potBack: 25, potOverall: 50 }, { holesPlaying: 'front9' });
    const cards = [
      ...scoresFor('p1', flat(0).slice(0, 9), frontNine()),
      ...scoresFor('p2', flat(1).slice(0, 9), frontNine()),
      ...scoresFor('p3', flat(2).slice(0, 9), frontNine()),
    ];
    const r = run(nine, cards);
    expect(abc(r)).toEqual([40, -20, -20]);
    expect((r.potSlices ?? []).map((s) => s.dollars)).toEqual([60]);
  });

  it('under a buy-in pot the junk slice IS the junk pot: a stated junkPot is ignored', () => {
    // Same Q-E game with a wild junkPot — the money must not move.
    const r = run(sidesGame(PAIRS, { ...Q_E_SETTINGS, junkPot: 999 }, { ctpWinners: { 7: 'p1' } }), Q_E_CARDS);
    expect(abcd(r)).toEqual([40, -10, -10, -20]);
  });

  it('junk paid PER POINT rides beside the pot; the junk share is then not a slice', () => {
    // Q-E cards, junk at $1 a point round robin (A 3, B 1, C 0, D 2 → A +6, B −2, C −6, D +2, §5.ad),
    // and the $80 pot over three slices at 25/25/25 → $26.67 each.
    const r = run(sidesGame(PAIRS, { ...Q_E_SETTINGS, junkPayout: 'per-point', junkPerPoint: 1 }, { ctpWinners: { 7: 'p1' } }), Q_E_CARDS);
    const third = 80 / 3;
    const pot = [third * 2 - 20, third / 2 - 20, third / 2 - 20, -20];
    const junk = [6, -2, -6, 2];
    abcd(r).forEach((m, i) => expect(m).toBeCloseTo(pot[i] + junk[i], 6));
    expect((r.potSlices ?? []).map((s) => s.key)).toEqual(['front', 'back', 'overall']);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });

  it('a slice nobody has started splits evenly — at the turn the back nine costs no one anything', () => {
    const cards = [...scoresFor('p1', flat(0).slice(0, 9), frontNine()), ...scoresFor('p2', flat(1).slice(0, 9), frontNine()), ...scoresFor('p3', flat(2).slice(0, 9), frontNine())];
    const r = run(sidesGame(THREE, { potFront: 25, potBack: 25, potOverall: 50 }), cards);
    // Front $15 → A. Back $15 → split 5 / 5 / 5. Overall $30 → A (leading thru 9).
    expect(abc(r)).toEqual([15 + 5 + 30 - 20, 5 - 20, 5 - 20]);
    expect(r.potSlices?.find((s) => s.key === 'back')?.payouts).toEqual({ a: 5, b: 5, c: 5 });
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });

  it('a team that has not started is not in the pot (§5.af) — every slice is over the teams that have', () => {
    const cards = [...scoresFor('p1', flat(0)), ...scoresFor('p2', flat(1))];
    const r = run(sidesGame(THREE, { potFront: 25, potBack: 25, potOverall: 50 }), cards);
    // $40 pot: A takes all three slices; C never anted.
    expect(abc(r)).toEqual([20, -20, 0]);
  });

  it('places paid apply per slice: 70/30 on the overall with a tie for first splits 1st + 2nd money', () => {
    const cards = [...scoresFor('p1', flat(0)), ...scoresFor('p2', flat(0)), ...scoresFor('p3', flat(1))];
    // Shares all overall (the default) so this isolates the places rule on a $60 pot: A and B each
    // get (42 + 18) / 2 = 30.
    const r = run(sidesGame(THREE, { potSplit: '70,30' }), cards);
    expect(abc(r)).toEqual([10, 10, -20]);
  });

  it('an all-zero share set is treated as one prize on the overall (no division by zero)', () => {
    const cards = [...scoresFor('p1', flat(0)), ...scoresFor('p2', flat(1)), ...scoresFor('p3', flat(2))];
    const r = run(sidesGame(THREE, { potFront: 0, potBack: 0, potOverall: 0 }), cards);
    expect(abc(r)).toEqual([40, -20, -20]);
  });

  it('the back nine can be played alone: back9 folds the shares onto the one leg played', () => {
    const nine = sidesGame(THREE, { potFront: 25, potBack: 25, potOverall: 50 }, { holesPlaying: 'back9' });
    const cards = [
      ...scoresFor('p1', flat(0).slice(9), backNine()),
      ...scoresFor('p2', flat(1).slice(9), backNine()),
      ...scoresFor('p3', flat(2).slice(9), backNine()),
    ];
    expect(abc(run(nine, cards))).toEqual([40, -20, -20]);
  });
});
