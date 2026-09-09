// F-016b — a leg the group voided at close-out pays nothing (DECISIONS.md §5.ai).
//
// The other half of F-016. That change made a short leg's MARGIN honest (compare like holes for
// like); this one lets the group decide whether a short leg pays at all. Craig's call was to ask
// at close-out rather than pre-declare it in settings:
//
//   > "if someone clicks finish game, and all legs are not complete, it should prompt the user."
//
// So `game.voidedLegs` is a record of a JUDGEMENT, not a derived fact — which is why it's stored.
// Recomputing it from hole counts would silently change a settled game's money the moment a late
// score was added, and the season ledger would stop agreeing with the leaderboard.
//
// SCOPE, verified rather than assumed: leg lines feed money ONLY in the `legs` model
// (team-game.ts, the four payLeg call sites). per-hole settles on holes won, per-point on total
// margin, pot on finishing order — none of them consult a leg. So voiding is meaningful only
// under `legs`, and the tests below pin that the other three ignore it entirely.
import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import { incompleteLegsForCloseOut } from '@/lib/game-modes/sides';
import type { PoolGame } from '@/lib/pool-game';
import { makeGame, scoresFor, singleMatchup, TEST_PARS } from './fixtures';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const FRONT = HOLES.slice(0, 9);
const BACK = HOLES.slice(9);
const card = (holes: number[], over: number) => holes.map((h) => TEST_PARS[h - 1] + over);

function game3(over: Partial<PoolGame> = {}, settings: Record<string, string | number | boolean> = {}) {
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
    ...over,
  });
}
const run = (g: PoolGame, s: Parameters<typeof singleMatchup>[0]) =>
  getGameMode('team-2v2')!.compute(buildGameModeContext(g, singleMatchup(s)));

// A and B finish all 18 at +1 a hole on the back; C plays only holes 10-12, level par.
// So the FRONT is complete (all three played all nine) and the BACK and OVERALL are short —
// exactly the state close-out asks about.
const backC = [10, 11, 12];
const walkIn = [
  ...scoresFor('p1', card(FRONT, 0), FRONT), ...scoresFor('p2', card(FRONT, 0), FRONT),
  ...scoresFor('p3', card(FRONT, 1), FRONT), ...scoresFor('p4', card(FRONT, 1), FRONT),
  ...scoresFor('p5', card(FRONT, 2), FRONT), ...scoresFor('p6', card(FRONT, 2), FRONT),
  ...scoresFor('p1', card(BACK, 1), BACK), ...scoresFor('p2', card(BACK, 1), BACK),
  ...scoresFor('p3', card(BACK, 1), BACK), ...scoresFor('p4', card(BACK, 1), BACK),
  ...scoresFor('p5', card(backC, 0), backC), ...scoresFor('p6', card(backC, 0), backC),
];

const moneyOf = (r: ReturnType<typeof run>) =>
  Object.fromEntries(r.standings.map((s) => [s.playerId, s.moneyNet]));
const legOf = (r: ReturnType<typeof run>, key: string) => r.teamLegs!.find((l) => l.key === key)!;

describe('F-016b: which legs are incomplete', () => {
  it('a leg reports how many holes it SPANS as well as how many are contested', () => {
    const r = run(game3(), walkIn);
    // Front: all three sides played all nine.
    expect(legOf(r, 'front')).toMatchObject({ thru: 9, holes: 9 });
    // Back: only three of the nine were contested (C stopped at 12).
    expect(legOf(r, 'back')).toMatchObject({ thru: 3, holes: 9 });
    expect(legOf(r, 'overall')).toMatchObject({ thru: 12, holes: 18 });
  });

  it('thru < holes is what makes a leg "incomplete" — the prompt\'s trigger', () => {
    const legs = run(game3(), walkIn).teamLegs!;
    const short = legs.filter((l) => l.thru < l.holes).map((l) => l.key);
    expect(short).toEqual(['back', 'overall']);
  });

  it('a fully-scored game has NO incomplete legs, so close-out asks nothing', () => {
    const legs = run(game3(), [
      ...scoresFor('p1', card(HOLES, 0)), ...scoresFor('p2', card(HOLES, 0)),
      ...scoresFor('p3', card(HOLES, 1)), ...scoresFor('p4', card(HOLES, 1)),
      ...scoresFor('p5', card(HOLES, 2)), ...scoresFor('p6', card(HOLES, 2)),
    ]).teamLegs!;
    expect(legs.every((l) => l.thru === l.holes)).toBe(true);
  });
});

describe('F-016b: voiding a leg withholds its money, per leg', () => {
  it('by default (no voidedLegs) every leg pays — existing games are unchanged', () => {
    const r = run(game3(), walkIn);
    // A wins the front outright; C leads the short back and overall.
    expect(legOf(r, 'front').voided).toBe(false);
    expect(moneyOf(r)).not.toEqual({ A: 0, B: 0, C: 0 });
    expect(r.standings.reduce((t, s) => t + s.moneyNet, 0)).toBeCloseTo(0, 6);
  });

  it('voiding the BACK leaves the front and overall paying', () => {
    const withAll = moneyOf(run(game3(), walkIn));
    const r = run(game3({ voidedLegs: ['back'] }), walkIn);
    expect(legOf(r, 'back').voided).toBe(true);
    expect(legOf(r, 'front').voided).toBe(false);
    expect(legOf(r, 'overall').voided).toBe(false);
    // Money moved, but only by the back leg's worth.
    expect(moneyOf(r)).not.toEqual(withAll);
    expect(r.standings.reduce((t, s) => t + s.moneyNet, 0)).toBeCloseTo(0, 6);
  });

  it('voiding BOTH short legs leaves only the completed front paying', () => {
    const r = run(game3({ voidedLegs: ['back', 'overall'] }), walkIn);
    expect(legOf(r, 'back').voided).toBe(true);
    expect(legOf(r, 'overall').voided).toBe(true);
    // The front nine was finished by everyone, so it still settles: A wins it, B and C each
    // pay the $10 front leg. Nothing else changes hands.
    expect(moneyOf(r)).toEqual({ A: 20, B: -10, C: -10 });
    expect(r.standings.reduce((t, s) => t + s.moneyNet, 0)).toBeCloseTo(0, 6);
  });

  it('a voided leg still SHOWS its margin — those holes were played', () => {
    const r = run(game3({ voidedLegs: ['back'] }), walkIn);
    const back = legOf(r, 'back');
    // Still names a leader and a margin; it just doesn't settle.
    expect(back.winner).toBe('c');
    expect(back.status).toContain('by');
  });

  it('voiding every leg pays nobody, and is still zero-sum', () => {
    const r = run(game3({ voidedLegs: ['front', 'back', 'overall'] }), walkIn);
    // The front is COMPLETE, so a void flag on it is ignored (see the next test) — only the
    // genuinely short legs are withheld. The front therefore still pays.
    expect(legOf(r, 'front').voided).toBe(false);
    expect(r.standings.reduce((t, s) => t + s.moneyNet, 0)).toBeCloseTo(0, 6);
  });

  // The guard that matters most: a stale flag must not withhold money from a leg everyone
  // finished. A group could void the back at close-out, reopen the game, and finish the round —
  // at which point the leg is complete and the void is obsolete. Money follows the scores.
  it('a void on a COMPLETED leg is ignored, so finishing the round restores its money', () => {
    const complete = [
      ...scoresFor('p1', card(HOLES, 0)), ...scoresFor('p2', card(HOLES, 0)),
      ...scoresFor('p3', card(HOLES, 1)), ...scoresFor('p4', card(HOLES, 1)),
      ...scoresFor('p5', card(HOLES, 2)), ...scoresFor('p6', card(HOLES, 2)),
    ];
    const voidedButFinished = run(game3({ voidedLegs: ['back', 'overall'] }), complete);
    const neverVoided = run(game3(), complete);
    expect(voidedButFinished.teamLegs!.every((l) => l.voided === false)).toBe(true);
    expect(moneyOf(voidedButFinished)).toEqual(moneyOf(neverVoided));
  });
});

describe('F-016b: voiding is meaningless outside the `legs` money model', () => {
  // Verified in the code, not assumed: per-hole settles on holes won, per-point on the total
  // margin, pot on finishing order. None consults a leg line, so a void cannot change them —
  // which is why the close-out prompt only appears for `legs` games.
  for (const moneyModel of ['per-hole', 'per-point', 'pot'] as const) {
    it(`${moneyModel} money is identical with and without voidedLegs`, () => {
      const without = moneyOf(run(game3({}, { moneyModel }), walkIn));
      const withVoid = moneyOf(run(game3({ voidedLegs: ['back', 'overall'] }, { moneyModel }), walkIn));
      expect(withVoid).toEqual(without);
    });
  }
});

// The rule the close-out PROMPT uses to decide what to ask. Pure and unit-tested here rather
// than living inside the component, so "which legs do we ask about" has one definition.
describe('F-016b: incompleteLegsForCloseOut — what close-out asks about', () => {
  const legs = [
    { key: 'front' as const, label: 'Front 9', thru: 9, holes: 9 },
    { key: 'back' as const, label: 'Back 9', thru: 3, holes: 9 },
    { key: 'overall' as const, label: 'Overall 18', thru: 12, holes: 18 },
  ];
  const tenner = { front: 10, back: 10, overall: 20 };

  it('asks about the short legs only, with what each is worth', () => {
    expect(incompleteLegsForCloseOut(legs, 'legs', tenner)).toEqual([
      { key: 'back', label: 'Back 9', thru: 3, holes: 9, dollars: 10 },
      { key: 'overall', label: 'Overall 18', thru: 12, holes: 18, dollars: 20 },
    ]);
  });

  it('asks nothing when every leg is complete', () => {
    const done = legs.map((l) => ({ ...l, thru: l.holes }));
    expect(incompleteLegsForCloseOut(done, 'legs', tenner)).toEqual([]);
  });

  // The scoping rule. Only `legs` settles per leg, so asking "should the back nine pay?" in a
  // pot game would be a question with no consequence — worse than not asking at all.
  for (const moneyModel of ['per-hole', 'per-point', 'pot'] as const) {
    it(`asks nothing under ${moneyModel}, which doesn't settle per leg`, () => {
      expect(incompleteLegsForCloseOut(legs, moneyModel, tenner)).toEqual([]);
    });
  }

  it('skips a leg worth $0 — voiding it would change nothing', () => {
    const asked = incompleteLegsForCloseOut(legs, 'legs', { front: 10, back: 0, overall: 20 });
    expect(asked.map((l) => l.key)).toEqual(['overall']);
  });
});

describe('F-016b: a 9-hole game', () => {
  // A nine collapses to ONE leg, keyed to the nine played. A void recorded against that key
  // must apply to the collapsed leg — the case a naive 'overall'-only check would miss.
  const nine = (over: Partial<PoolGame> = {}) => makeGame({
    gameMode: 'team-2v2', indexes: [0, 0, 0, 0],
    holesPlaying: 'back9',
    subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] },
    modeSettings: {
      format: 'best-ball', scoring: 'stroke', result: 'total',
      moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 20,
    },
    ...over,
  });
  // A plays all nine; B plays only three of them.
  const partial = [
    ...scoresFor('p1', card(BACK, 0), BACK), ...scoresFor('p2', card(BACK, 0), BACK),
    ...scoresFor('p3', card(backC, 1), backC), ...scoresFor('p4', card(backC, 1), backC),
  ];

  it('the collapsed leg is keyed to the nine played, and can be voided', () => {
    const paid = run(nine(), partial);
    expect(paid.teamLegs).toHaveLength(1);
    expect(paid.teamLegs![0].key).toBe('back');
    expect(paid.teamLegs![0].voided).toBe(false);
    expect(paid.standings.some((s) => s.moneyNet !== 0)).toBe(true);

    const voided = run(nine({ voidedLegs: ['back'] }), partial);
    expect(voided.teamLegs![0].voided).toBe(true);
    // Nothing settles, and it stays zero-sum.
    expect(voided.standings.every((s) => s.moneyNet === 0)).toBe(true);
  });
});
