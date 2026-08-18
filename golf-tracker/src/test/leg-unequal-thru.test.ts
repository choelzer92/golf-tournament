// F-016 — EVIDENCE for a live money bug in the leg settlement. NOT a contract.
//
// These tests DOCUMENT current behaviour so the defect is reproducible on demand; they
// deliberately do not assert the desired output, because the fix is Craig's call (three
// options in FINDINGS.md F-016). Only zero-sum is asserted — it holds today, which is
// exactly why the rest of the suite is green while the money points at the wrong side.
//
// The 3-side sandbox leaderboard reads "Back 9 · 3 of 9 holes · Craig & Jym by 6".
// `legThru` counts CONTESTED holes (every side posted), but `legToPar` accumulates on
// every hole a side played — so the leg margin compares one side's 9 holes against
// another's 3, and `payLeg` pays whoever that comparison names.
//
// DECISIONS.md §5.af fixed exactly this for the STANDINGS (rank on to-par, show thru).
// The LEG lines never got the same treatment. Predates the N-sides branch: the two-side
// control below fails the same way on `main`.
//
// When an option is chosen, replace the console.log probes with real assertions.
import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import { makeGame, scoresFor, singleMatchup, TEST_PARS } from './fixtures';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const FRONT = HOLES.slice(0, 9);

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

// Cards, per hole, relative to par.
const card = (holes: number[], over: number) => holes.map((h) => TEST_PARS[h - 1] + over);

describe('PROBE: does a side that played FEWER back-nine holes win the back leg?', () => {
  // A and B play all 18. A is +1 per hole on the back (so +9 over the back nine).
  // C plays only holes 10-12 and is LEVEL par on them (+0 over 3 holes).
  //
  // Over the holes each actually played: A is +9 on 9 holes, C is 0 on 3 holes.
  // A comparison that ignores hole counts makes C the back-nine winner on 3 holes.
  it('C plays 3 back holes at level par; A plays 9 at +1', () => {
    const backC = [10, 11, 12];
    const scores = [
      // front: everyone level, so the front leg is a dead heat and isolates the back.
      ...scoresFor('p1', card(FRONT, 0), FRONT), ...scoresFor('p2', card(FRONT, 0), FRONT),
      ...scoresFor('p3', card(FRONT, 0), FRONT), ...scoresFor('p4', card(FRONT, 0), FRONT),
      ...scoresFor('p5', card(FRONT, 0), FRONT), ...scoresFor('p6', card(FRONT, 0), FRONT),
      // back: A and B all nine (+1 a hole), C only three (level).
      ...scoresFor('p1', card(HOLES.slice(9), 1), HOLES.slice(9)),
      ...scoresFor('p2', card(HOLES.slice(9), 1), HOLES.slice(9)),
      ...scoresFor('p3', card(HOLES.slice(9), 1), HOLES.slice(9)),
      ...scoresFor('p4', card(HOLES.slice(9), 1), HOLES.slice(9)),
      ...scoresFor('p5', card(backC, 0), backC), ...scoresFor('p6', card(backC, 0), backC),
    ];
    const r = run(game3(), scores);
    const legs = r.teamLegs!;
    const back = legs.find((l) => l.key === 'back')!;
    const money = Object.fromEntries(r.standings.map((s) => [s.playerId, s.moneyNet]));

    console.log('legs:', JSON.stringify(legs.map((l) => [l.label, l.status, l.winner, `thru ${l.thru}`])));
    console.log('thru per side:', JSON.stringify(r.standings.map((s) => [s.playerId, s.thru])));
    console.log('money:', JSON.stringify(money));
    console.log(`BACK LEG says "${back.status}" over ${back.thru} contested holes; winner = ${back.winner}`);

    // Zero-sum must hold regardless.
    expect(r.standings.reduce((t, s) => t + s.moneyNet, 0)).toBeCloseTo(0, 6);

    // THE QUESTION: did the side that played 3 holes take the 9-hole leg and its money?
    if (back.winner === 'c') {
      console.log('*** C WON THE BACK NINE HAVING PLAYED 3 OF ITS 9 HOLES ***');
      console.log(`*** and collected $${money.C} while A and B paid ***`);
    }
  });

  // Same shape, but framed as "who is paid for NOT playing": C walks in after 12 while
  // losing badly on the holes it did play. Does it still escape the leg?
  it('control — C plays 3 back holes BADLY (+3 a hole)', () => {
    const backC = [10, 11, 12];
    const scores = [
      ...scoresFor('p1', card(FRONT, 0), FRONT), ...scoresFor('p2', card(FRONT, 0), FRONT),
      ...scoresFor('p3', card(FRONT, 0), FRONT), ...scoresFor('p4', card(FRONT, 0), FRONT),
      ...scoresFor('p5', card(FRONT, 0), FRONT), ...scoresFor('p6', card(FRONT, 0), FRONT),
      ...scoresFor('p1', card(HOLES.slice(9), 1), HOLES.slice(9)),
      ...scoresFor('p2', card(HOLES.slice(9), 1), HOLES.slice(9)),
      ...scoresFor('p3', card(HOLES.slice(9), 1), HOLES.slice(9)),
      ...scoresFor('p4', card(HOLES.slice(9), 1), HOLES.slice(9)),
      ...scoresFor('p5', card(backC, 3), backC), ...scoresFor('p6', card(backC, 3), backC),
    ];
    const r = run(game3(), scores);
    const back = r.teamLegs!.find((l) => l.key === 'back')!;
    console.log(`bad-C back leg: "${back.status}" winner=${back.winner} thru=${back.thru}`);
    console.log('bad-C money:', JSON.stringify(r.standings.map((s) => [s.playerId, s.moneyNet])));
    expect(r.standings.reduce((t, s) => t + s.moneyNet, 0)).toBeCloseTo(0, 6);
  });

  // And the two-side case, to confirm this is an N-side regression rather than pre-existing.
  it('TWO sides: does the same unequal-thru comparison happen?', () => {
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
      ...scoresFor('p1', card(HOLES.slice(9), 1), HOLES.slice(9)),
      ...scoresFor('p2', card(HOLES.slice(9), 1), HOLES.slice(9)),
      ...scoresFor('p3', card(backB, 0), backB), ...scoresFor('p4', card(backB, 0), backB),
    ])));
    const back = r.teamLegs!.find((l) => l.key === 'back')!;
    console.log(`TWO-side back leg: "${back.status}" winner=${back.winner} thru=${back.thru}`);
    console.log('TWO-side money:', JSON.stringify(r.standings.map((s) => [s.playerId, s.moneyNet])));

    // ASSERTED, because this is the load-bearing claim in F-016: the bug is NOT an N-sides
    // regression. Side B played 3 of the back nine, side A played all 9 — and B takes the leg.
    // Two sides is the shape every existing game has, and `main` behaves identically here.
    // After F-016 this must flip to a contested-holes comparison, so this assertion changes
    // deliberately and its diff is the proof the fix reached the two-side path too.
    expect(back.thru).toBe(3);
    expect(back.winner).toBe('b');
    expect(r.standings.find((s) => s.playerId === 'B')!.moneyNet).toBeGreaterThan(0);
    expect(r.standings.reduce((t, s) => t + s.moneyNet, 0)).toBeCloseTo(0, 6);
  });
});
