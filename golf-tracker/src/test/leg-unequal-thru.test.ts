// F-016 — a leg is compared over CONTESTED holes only (DECISIONS.md §5.ai, option A).
//
// THE BUG THIS FILE PINS. `legToPar` accumulated on every hole a side individually played, while
// `legThru` counted only holes every side had posted. So a leg's margin could pit one side's 9
// holes against another's 3, and `payLeg` pays whoever that comparison names. The 3-side sandbox
// board read "Back 9 · 3 of 9 holes · Craig & Jym by 6" — six *what*, over three holes?
//
// Predates the N-sides branch: the two-side case at the bottom failed identically on `main`, so
// this was never an N-sides regression. §5.af fixed this class of bug for the STANDINGS (rank on
// to-par, show thru); the leg lines never got the same treatment.
//
// WHAT THE FIX DOES, AND DELIBERATELY DOES NOT DO.
// The margin is now like-for-like: every side's leg figure covers exactly the same holes. What
// it does NOT do is decide whether a short leg should pay at all — a side that played 3 of the
// back 9 and was better on those 3 still wins the back-nine leg here. That is Craig's call, made
// at close-out rather than pre-declared in settings (§5.ai, F-016b):
//
//   > "if someone clicks finish game, and all legs are not complete, it should prompt the user."
//
// So the two halves compose: this file makes the COMPARISON honest, and the close-out prompt lets
// the group decide whether an incomplete leg pays on the holes played or pays nothing.
import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import { makeGame, scoresFor, singleMatchup, TEST_PARS } from './fixtures';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const FRONT = HOLES.slice(0, 9);
const BACK = HOLES.slice(9);

function game3(settings: Record<string, string | number | boolean> = {}) {
  return makeGame({
    gameMode: 'team-2v2', indexes: [0, 0, 0, 0, 0, 0],
    sides: [
      { id: 'a', playerIds: ['p1', 'p2'] },
      { id: 'b', playerIds: ['p3', 'p4'] },
      { id: 'c', playerIds: ['p5', 'p6'] },
    ],
    modeSettings: {
      format: 'best-ball', scoring: 'stroke', result: 'total',
      moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 20,
      ...settings,
    },
  });
}
const run = (g: ReturnType<typeof game3>, s: Parameters<typeof singleMatchup>[0]) =>
  getGameMode('team-2v2')!.compute(buildGameModeContext(g, singleMatchup(s)));

/** Cards, per hole, relative to par. */
const card = (holes: number[], over: number) => holes.map((h) => TEST_PARS[h - 1] + over);

describe('F-016: a leg is judged over the holes every side played', () => {
  // A and B play all nine back holes at +1 (so +9 each over the nine).
  // C plays only holes 10-12, level par (so +0 over three).
  //
  // BEFORE: the leg compared +9 against +0 and read "C by 9" — nine strokes of margin that
  // existed only because C had stopped playing.
  // AFTER: over the three holes everyone played, A and B are +3 and C is 0, so it reads "C by 3".
  // The margin is now a real comparison; whether the leg PAYS is F-016b's question.
  const backC = [10, 11, 12];
  const scores = [
    // front: everyone level, so the front leg is a dead heat and the back is isolated
    ...scoresFor('p1', card(FRONT, 0), FRONT), ...scoresFor('p2', card(FRONT, 0), FRONT),
    ...scoresFor('p3', card(FRONT, 0), FRONT), ...scoresFor('p4', card(FRONT, 0), FRONT),
    ...scoresFor('p5', card(FRONT, 0), FRONT), ...scoresFor('p6', card(FRONT, 0), FRONT),
    // back: A and B all nine at +1, C only three at level
    ...scoresFor('p1', card(BACK, 1), BACK), ...scoresFor('p2', card(BACK, 1), BACK),
    ...scoresFor('p3', card(BACK, 1), BACK), ...scoresFor('p4', card(BACK, 1), BACK),
    ...scoresFor('p5', card(backC, 0), backC), ...scoresFor('p6', card(backC, 0), backC),
  ];

  it('the back-nine margin counts the 3 contested holes, not 9 against 3', () => {
    const back = run(game3(), scores).teamLegs!.find((l) => l.key === 'back')!;
    // Three holes contested, and the margin is measured over exactly those three.
    expect(back.thru).toBe(3);
    // A and B are +1 on each of holes 10-12 (= +3); C is level (= 0). C leads by 3, not by 9.
    expect(back.status).toContain('by 3');
    expect(back.status).not.toContain('by 9');
  });

  it('the OVERALL leg does the same, over the 12 holes everyone played', () => {
    const overall = run(game3(), scores).teamLegs!.find((l) => l.key === 'overall')!;
    expect(overall.thru).toBe(12);
    // Front was a dead heat (0 apiece over 9), so the overall margin is the back's 3.
    expect(overall.status).toContain('by 3');
  });

  it('the STANDINGS still show each side its own holes — thru 12, not thru 18', () => {
    // The fix must not "correct" the standings: a tournament board legitimately shows a side
    // its own progress. Only the head-to-head leg comparison needs like-for-like holes.
    const r = run(game3(), scores);
    const byId = Object.fromEntries(r.standings.map((s) => [s.playerId, s]));
    expect(byId.A.thru).toBe(18);
    expect(byId.C.thru).toBe(12);
    // C played 12 holes at level par, so its own to-par is 0 across those 12.
    expect(byId.C.toPar).toBe(0);
    // A played 9 level + 9 at +1.
    expect(byId.A.toPar).toBe(9);
  });

  it('money is still zero-sum', () => {
    for (const moneyModel of ['legs', 'per-hole', 'per-point', 'pot'] as const) {
      const r = run(game3({ moneyModel }), scores);
      expect(r.standings.reduce((t, s) => t + s.moneyNet, 0), moneyModel).toBeCloseTo(0, 6);
    }
  });

  // The complement: a side that quits early AND played badly must not escape. Here C is +3 a
  // hole over its three, so over contested holes A and B (+3) beat C (+9) — C is last, and the
  // leg is a tie between A and B rather than a win for the side that walked in.
  it('a side that walks in playing BADLY does not escape the comparison', () => {
    const r = run(game3(), [
      ...scoresFor('p1', card(FRONT, 0), FRONT), ...scoresFor('p2', card(FRONT, 0), FRONT),
      ...scoresFor('p3', card(FRONT, 0), FRONT), ...scoresFor('p4', card(FRONT, 0), FRONT),
      ...scoresFor('p5', card(FRONT, 0), FRONT), ...scoresFor('p6', card(FRONT, 0), FRONT),
      ...scoresFor('p1', card(BACK, 1), BACK), ...scoresFor('p2', card(BACK, 1), BACK),
      ...scoresFor('p3', card(BACK, 1), BACK), ...scoresFor('p4', card(BACK, 1), BACK),
      ...scoresFor('p5', card(backC, 3), backC), ...scoresFor('p6', card(backC, 3), backC),
    ]);
    const back = r.teamLegs!.find((l) => l.key === 'back')!;
    // C is NOT the winner. (A and B tie at +3 over the three contested holes — the tie case is
    // F-017's subject, not this one.)
    expect(back.winner).not.toBe('c');
    expect(r.standings.reduce((t, s) => t + s.moneyNet, 0)).toBeCloseTo(0, 6);
  });

  // TWO SIDES — the load-bearing claim that this was never an N-sides regression. Every existing
  // game has this shape, and `main` compares raw leg totals, so it fails here identically. The
  // fix has to reach this path too, or the branch would have "fixed" only games nobody plays.
  it('TWO sides get the same like-for-like comparison', () => {
    const g = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0],
      subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] },
      modeSettings: {
        format: 'best-ball', scoring: 'stroke', result: 'total',
        moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 20,
      },
    });
    const backB = [10, 11, 12];
    const r = getGameMode('team-2v2')!.compute(buildGameModeContext(g, singleMatchup([
      ...scoresFor('p1', card(FRONT, 0), FRONT), ...scoresFor('p2', card(FRONT, 0), FRONT),
      ...scoresFor('p3', card(FRONT, 0), FRONT), ...scoresFor('p4', card(FRONT, 0), FRONT),
      ...scoresFor('p1', card(BACK, 1), BACK), ...scoresFor('p2', card(BACK, 1), BACK),
      ...scoresFor('p3', card(backB, 0), backB), ...scoresFor('p4', card(backB, 0), backB),
    ])));
    const back = r.teamLegs!.find((l) => l.key === 'back')!;
    expect(back.thru).toBe(3);
    // Was "by 9" — B's nine-stroke "lead" was six strokes of holes it never played.
    expect(back.status).toContain('by 3');
    expect(r.standings.reduce((t, s) => t + s.moneyNet, 0)).toBeCloseTo(0, 6);
  });
});
