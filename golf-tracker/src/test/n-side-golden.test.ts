// GOLDEN pins for the N-SIDE engine, taken BEFORE the F-016 / F-017 money changes.
//
// WHY THIS FILE EXISTS
// `two-side-golden.test.ts` pinned the two-side engines before they were widened to N. That
// file's job was "existing games settle identically". This file's job is different: two money
// rules are about to change on purpose (FINDINGS.md F-016 and F-017, DECISIONS.md §5.ai and
// §5.aj), and a deliberate change is indistinguishable from a regression unless the current
// output is written down first.
//
// So these snapshots are NOT a statement that today's numbers are right. Two of them are known
// to be wrong. They exist so that when the fixes land, the diff shows EXACTLY which cases moved
// — and every case that should NOT have moved is proved to have stayed put.
//
// WHAT MUST NOT MOVE when F-016 / F-017 land:
//   - every case where all sides are thru the same number of holes (the overwhelming majority)
//   - every TWO-side case, in every money model            <- held here and in two-side-golden
//   - pot mode at any side count                            <- distributePot, not payLeg
//   - the classic N-foursome pool                           <- computePoolResult, not payLeg
//   - Wolf                                                  <- a 2-side consumer of this engine
//
// WHAT SHOULD MOVE, and only this:
//   - F-016: legs/per-point/per-hole where sides have played UNEQUAL hole counts
//   - F-017: legs where two or more sides TIE a leg with a third side behind
//
// The cases below are labelled so that intent is legible in the snapshot diff. Anything moving
// outside a case labelled `F-016` or `F-017` is a regression, full stop.
//
// MUTATION-PROVED per DECISIONS.md §5.z. All 59 passed on the first run, which §5.z says to
// distrust rather than report, so five one-line bugs were re-introduced to prove the pins can
// see them:
//
//   | mutation                                              | cases failed |
//   |-------------------------------------------------------|--------------|
//   | MUT1  leg winner collects ONE leg, not per-opponent    | 11           |
//   | MUT2  per-point money ranked on raw totals             |  2           |
//   | MUT3  sides ranked on raw totals (the §5.af bug)       |  8           |
//   | MUT4  ball count hard-coded to 2 per side              |  5  <- see below
//   | MUT5  legs pay side A regardless of who won            |  2           |
//
// MUT4 SURVIVED THE FIRST DRAFT — all 54 tests passed with the bug in. Every uneven-size case
// played BEST BALL, where exactly one ball counts whatever the side size is; `ballsPerHole`
// only varies for `combined` (team-scoring.ts:60). So the file looked thorough and was blind to
// a bug that punishes a big side for its size. The COMBINED-at-3/2/1 block and its oracle were
// added for exactly that, and now catch it. This is the §5.z lesson arriving on schedule: a
// green suite is evidence of nothing until you have watched it fail.
//
// MUT2 failing only twice is CORRECT, not weak coverage: at equal thru counts `toPar` and
// `totals` differ by a constant that cancels in pairwise subtraction, so only the unequal-thru
// cases can move — and they do. That is the same arithmetic that makes F-016 safe for completed
// games.
//
// A snapshot proves "unchanged", never "correct", so the independent oracles matter more here
// than the snapshots do.

import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import type { IndividualResult } from '@/lib/game-modes/types';
import type { GameSide } from '@/lib/game-modes/sides';
import { computePoolResult, type PoolGame } from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import {
  allEighteen, makeGame, makeTeam, scoreMap, scoresFor, singleMatchup, TEST_PARS,
} from './fixtures';

// --- helpers ---------------------------------------------------------------

function run(game: PoolGame, scores: GameScore[]): IndividualResult {
  const mode = getGameMode(game.gameMode);
  if (!mode) throw new Error(`no such mode: ${game.gameMode}`);
  return mode.compute(buildGameModeContext(game, singleMatchup(scores)));
}

// The full result, normalized. Same shape as two-side-golden's `shapeOf`, plus the N-side
// fields that file couldn't have (sideLabels, sideBreakdown) — those drive the leaderboard and
// the scorecard, so a change there is user-visible and must show in a diff.
function shapeOf(r: IndividualResult) {
  return {
    metricLabel: r.metricLabel,
    thruHole: r.thruHole,
    moneyModel: r.moneyModel,
    sideLabels: r.sideLabels,
    standings: r.standings.map((s) => ({
      id: s.playerId, points: s.points, toPar: s.toPar,
      money: s.moneyNet, thru: s.thru, place: s.place,
    })),
    teamLegs: r.teamLegs?.map((l) => ({
      key: l.key, label: l.label, status: l.status, winner: l.winner, thru: l.thru,
    })),
    sideBreakdown: r.sideBreakdown?.map((b) => ({
      id: b.id, name: b.name, total: b.total, status: b.status,
    })),
    junkLines: r.junkLines?.map((j) => ({ id: j.playerId, dollars: j.dollars })),
  };
}

const HOLES = allEighteen();
const par = (holes: number[] = HOLES) => holes.map((h) => TEST_PARS[h - 1]);
/** A card `over` strokes worse than par on every hole. */
const flat = (over: number, holes: number[] = HOLES) =>
  holes.map((h) => TEST_PARS[h - 1] + over);

/** Build an N-side game. Sides are named by position: a, b, c, … */
function gameN(
  sideSpec: string[][],
  settings: Record<string, string | number | boolean>,
  indexes?: number[],
): PoolGame {
  const ids = sideSpec.flat();
  const sides: GameSide[] = sideSpec.map((playerIds, i) => ({
    id: String.fromCharCode(97 + i), playerIds,
  }));
  return makeGame({
    gameMode: 'team-2v2',
    // Scratch by default so net == gross and every number is derivable by hand.
    indexes: indexes ?? ids.map(() => 0),
    sides,
    modeSettings: {
      format: 'best-ball', scoring: 'stroke', result: 'total',
      dollarsPerHole: 2, dollarsPerPoint: 1,
      legFront: 10, legBack: 10, legOverall: 20,
      sideBuyIn: 20, potSplit: '100',
      ...settings,
    },
  });
}

const MONEY_MODELS = ['legs', 'per-hole', 'per-point', 'pot'] as const;
const sumMoney = (r: IndividualResult) => r.standings.reduce((s, x) => s + x.moneyNet, 0);

// ---------------------------------------------------------------------------
// 1. The side-count x money-model matrix, all sides thru 18
//
// This is the block that MUST NOT MOVE. Every side plays every hole, so F-016 (contested
// holes) is a no-op by construction, and the sides are deliberately separated so no leg ties
// and F-017 is a no-op too.
// ---------------------------------------------------------------------------

describe('GOLDEN: N sides x money model, all sides complete (MUST NOT MOVE)', () => {
  // Sides separated by a clear stroke per side, so there are no ties anywhere.
  const specFor = (n: number) =>
    Array.from({ length: n }, (_, i) => [`p${i * 2 + 1}`, `p${i * 2 + 2}`]);
  const scoresFor_ = (n: number) =>
    Array.from({ length: n }, (_, i) => i).flatMap((i) => {
      const card = flat(i);          // side A level, B +1/hole, C +2/hole, …
      return [...scoresFor(`p${i * 2 + 1}`, card), ...scoresFor(`p${i * 2 + 2}`, card)];
    });

  for (const n of [2, 3, 4, 5, 6]) {
    for (const moneyModel of MONEY_MODELS) {
      it(`${n} sides / ${moneyModel}`, () => {
        const r = run(gameN(specFor(n), { moneyModel }), scoresFor_(n));
        expect(shapeOf(r)).toMatchSnapshot();
        expect(sumMoney(r)).toBeCloseTo(0, 6);
        // Somebody must be paid, or the case pins nothing about ranking.
        expect(r.standings.some((s) => s.moneyNet > 0)).toBe(true);
      });
    }
  }

  // ORACLE, independent of the engine's derived fields: with sides separated by one stroke per
  // hole, side i's 18-hole total is 18*i over par, so the round-robin per-point settlement is
  // computable straight from the fixture. Catches a rewrite that is wrong the same way the
  // current code is wrong — which a snapshot cannot.
  it('ORACLE: per-point round-robin matches hand arithmetic at 3 sides', () => {
    const r = run(gameN(specFor(3), { moneyModel: 'per-point', dollarsPerPoint: 1 }), scoresFor_(3));
    // toPar: A 0, B +18, C +36. Lower is better, $1/stroke, each pair settled separately.
    //   A: (18-0) + (36-0)   = +54
    //   B: (0-18) + (36-18)  =   0
    //   C: (0-36) + (18-36)  = -54
    const m = Object.fromEntries(r.standings.map((s) => [s.playerId, s.moneyNet]));
    expect(m).toEqual({ A: 54, B: 0, C: -54 });
  });
});

// ---------------------------------------------------------------------------
// 2. TWO sides specifically — the case that must be untouched by both changes
// ---------------------------------------------------------------------------

describe('GOLDEN: two sides are unaffected by either change (MUST NOT MOVE)', () => {
  const two = [['p1', 'p2'], ['p3', 'p4']];

  for (const moneyModel of MONEY_MODELS) {
    it(`two sides / ${moneyModel} / A wins outright`, () => {
      const r = run(gameN(two, { moneyModel }), [
        ...scoresFor('p1', par()), ...scoresFor('p2', par()),
        ...scoresFor('p3', flat(1)), ...scoresFor('p4', flat(1)),
      ]);
      expect(shapeOf(r)).toMatchSnapshot();
      expect(sumMoney(r)).toBeCloseTo(0, 6);
    });
  }

  // A two-side TIE pushes and pays nobody. F-017 changes the 3+ side tie rule; this must stay
  // exactly as it is, and it's the case most at risk from a careless payLeg rewrite.
  it('two sides TIED pays nobody, in every money model', () => {
    for (const moneyModel of MONEY_MODELS) {
      const r = run(gameN(two, { moneyModel }), [
        ...scoresFor('p1', par()), ...scoresFor('p2', par()),
        ...scoresFor('p3', par()), ...scoresFor('p4', par()),
      ]);
      // Pot is the one exception: a tie SPLITS the pot, so both sides get their ante back.
      expect(r.standings.every((s) => s.moneyNet === 0), `${moneyModel} tie must push`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. F-016 — UNEQUAL hole counts. THESE SNAPSHOTS SHOULD MOVE.
//
// Every case here is labelled F-016 so the diff is self-explaining. The current numbers are
// the BUG being fixed: a side is paid for holes it never played.
// ---------------------------------------------------------------------------

describe('F-016 (SHOULD MOVE): sides thru unequal hole counts', () => {
  const three = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']];
  const twelve = HOLES.slice(0, 12);
  const backThree = [10, 11, 12];

  // The headline case, straight from the sandbox screenshot: A and B finish, C walks in at 12.
  // C is WORSE per hole but has played fewer holes.
  function walkIn(): GameScore[] {
    return [
      ...scoresFor('p1', par()), ...scoresFor('p2', par()),
      ...scoresFor('p3', flat(1)), ...scoresFor('p4', flat(1)),
      ...scoresFor('p5', flat(2, twelve), twelve), ...scoresFor('p6', flat(2, twelve), twelve),
    ];
  }

  for (const moneyModel of MONEY_MODELS) {
    it(`F-016: C walks in after 12 / ${moneyModel}`, () => {
      const r = run(gameN(three, { moneyModel }), walkIn());
      expect(shapeOf(r)).toMatchSnapshot();
      // Zero-sum holds today AND must hold after the fix — it's the invariant, not the answer.
      expect(sumMoney(r)).toBeCloseTo(0, 6);
    });
  }

  // The reproduction from the F-016 probe, kept as a pin: C plays 3 of the back 9 at level par
  // while A and B play all nine at +1, so C "wins" a nine it barely played.
  it('F-016: C plays 3 back holes level; A and B play 9 at +1', () => {
    const r = run(gameN(three, { moneyModel: 'legs' }), [
      // front: everyone level, isolating the back nine
      ...scoresFor('p1', par(HOLES.slice(0, 9)), HOLES.slice(0, 9)),
      ...scoresFor('p2', par(HOLES.slice(0, 9)), HOLES.slice(0, 9)),
      ...scoresFor('p3', par(HOLES.slice(0, 9)), HOLES.slice(0, 9)),
      ...scoresFor('p4', par(HOLES.slice(0, 9)), HOLES.slice(0, 9)),
      ...scoresFor('p5', par(HOLES.slice(0, 9)), HOLES.slice(0, 9)),
      ...scoresFor('p6', par(HOLES.slice(0, 9)), HOLES.slice(0, 9)),
      // back: A and B all nine at +1, C only three holes at level
      ...scoresFor('p1', flat(1, HOLES.slice(9)), HOLES.slice(9)),
      ...scoresFor('p2', flat(1, HOLES.slice(9)), HOLES.slice(9)),
      ...scoresFor('p3', flat(1, HOLES.slice(9)), HOLES.slice(9)),
      ...scoresFor('p4', flat(1, HOLES.slice(9)), HOLES.slice(9)),
      ...scoresFor('p5', par(backThree), backThree),
      ...scoresFor('p6', par(backThree), backThree),
    ]);
    expect(shapeOf(r)).toMatchSnapshot();
    expect(sumMoney(r)).toBeCloseTo(0, 6);
    // TODAY: the back leg is won by 'c' on 3 of its 9 holes, and c collects. Documented, not
    // endorsed — after F-016 the leg is judged over contested holes only.
    const back = r.teamLegs?.find((l) => l.key === 'back');
    expect(back?.thru).toBe(3);
  });

  // A side that has not started AT ALL is already handled (§5.af) — it neither pays nor
  // collects. Pinned here so F-016 doesn't regress it while changing the adjacent rule.
  it('a side that has not started neither pays nor collects (MUST NOT MOVE)', () => {
    const r = run(gameN(three, { moneyModel: 'legs' }), [
      ...scoresFor('p1', par()), ...scoresFor('p2', par()),
      ...scoresFor('p3', flat(1)), ...scoresFor('p4', flat(1)),
      // p5/p6 have no scores at all
    ]);
    expect(shapeOf(r)).toMatchSnapshot();
    expect(sumMoney(r)).toBeCloseTo(0, 6);
    const c = r.standings.find((s) => s.playerId === 'C')!;
    expect(c.thru).toBe(0);
    expect(c.moneyNet).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. F-017 — TIED legs with a side behind. THESE SNAPSHOTS SHOULD MOVE (legs only).
// ---------------------------------------------------------------------------

describe('F-017 (SHOULD MOVE, legs only): top sides tie with a third behind', () => {
  const three = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']];
  // A and B level par on every hole; C is +1 on every hole. Every leg ties at the top.
  const tieAtTop = () => [
    ...scoresFor('p1', par()), ...scoresFor('p2', par()),
    ...scoresFor('p3', par()), ...scoresFor('p4', par()),
    ...scoresFor('p5', flat(1)), ...scoresFor('p6', flat(1)),
  ];

  it('F-017: legs — A and B tie, C is 18 over (TODAY: C pays nothing)', () => {
    const r = run(gameN(three, { moneyModel: 'legs' }), tieAtTop());
    expect(shapeOf(r)).toMatchSnapshot();
    expect(sumMoney(r)).toBeCloseTo(0, 6);
    // Documented current behaviour: nobody pays, because no leg has a single winner.
    expect(r.standings.every((s) => s.moneyNet === 0)).toBe(true);
  });

  // The same cards under per-point and pot, which ALREADY charge C. These are the reference the
  // F-017 fix makes `legs` consistent with, so they must not move.
  for (const moneyModel of ['per-point', 'pot'] as const) {
    it(`${moneyModel} already charges the side behind (MUST NOT MOVE)`, () => {
      const r = run(gameN(three, { moneyModel }), tieAtTop());
      expect(shapeOf(r)).toMatchSnapshot();
      expect(sumMoney(r)).toBeCloseTo(0, 6);
      const c = r.standings.find((s) => s.playerId === 'C')!;
      expect(c.moneyNet, `${moneyModel} must charge the last side`).toBeLessThan(0);
    });
  }

  // `per-hole` pays nothing here, and that is CORRECT rather than a second instance of F-017.
  //
  // Worth writing down, because I asserted the opposite first and this pin caught it: per-hole
  // money counts holes won OUTRIGHT. A and B tie every single hole, so no side wins any hole
  // and `won` is 0 for all three — there is nothing to charge C for. F-017 is specifically
  // about `legs`, where a fixed prize exists and is voided by the tie; per-hole has no prize
  // to void. So per-hole must stay at $0 after the fix too.
  it('per-hole pays nothing on a hole-by-hole tie, by construction (MUST NOT MOVE)', () => {
    const r = run(gameN(three, { moneyModel: 'per-hole' }), tieAtTop());
    expect(shapeOf(r)).toMatchSnapshot();
    expect(r.standings.every((s) => s.moneyNet === 0)).toBe(true);
    // The reason: nobody won a hole outright.
    expect(r.teamLegs?.every((l) => l.winner === null)).toBe(true);
  });

  // Contrast, to prove the case above isn't hiding a defect: separate the sides on individual
  // HOLES and per-hole immediately charges the side behind.
  it('per-hole DOES charge a side that loses holes outright (MUST NOT MOVE)', () => {
    const r = run(gameN(three, { moneyModel: 'per-hole', result: 'match', dollarsPerHole: 2 }), [
      ...scoresFor('p1', par()), ...scoresFor('p2', par()),
      ...scoresFor('p3', flat(1)), ...scoresFor('p4', flat(1)),
      ...scoresFor('p5', flat(2)), ...scoresFor('p6', flat(2)),
    ]);
    expect(shapeOf(r)).toMatchSnapshot();
    expect(sumMoney(r)).toBeCloseTo(0, 6);
    expect(r.standings.find((s) => s.playerId === 'C')!.moneyNet).toBeLessThan(0);
  });

  // A THREE-way dead heat pays nobody under every model, before and after F-017. There is no
  // side "behind", so there is nothing to collect.
  it('a three-way dead heat pays nobody (MUST NOT MOVE)', () => {
    for (const moneyModel of MONEY_MODELS) {
      const r = run(gameN(three, { moneyModel }), [
        ...scoresFor('p1', par()), ...scoresFor('p2', par()),
        ...scoresFor('p3', par()), ...scoresFor('p4', par()),
        ...scoresFor('p5', par()), ...scoresFor('p6', par()),
      ]);
      expect(r.standings.every((s) => s.moneyNet === 0), `${moneyModel} dead heat`).toBe(true);
    }
  });

  // A clear winner at three sides: the winner collects the leg from EACH other side. F-017
  // changes only the TIE case, so this must be byte-identical afterwards — and it's the
  // behaviour the chosen tie rule generalizes (§5.aj).
  it('a clear leg winner collects from each side behind (MUST NOT MOVE)', () => {
    const r = run(gameN(three, { moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 20 }), [
      ...scoresFor('p1', par()), ...scoresFor('p2', par()),
      ...scoresFor('p3', flat(1)), ...scoresFor('p4', flat(1)),
      ...scoresFor('p5', flat(2)), ...scoresFor('p6', flat(2)),
    ]);
    expect(shapeOf(r)).toMatchSnapshot();
    // A wins all three legs; each of B and C pays 10+10+20.
    const m = Object.fromEntries(r.standings.map((s) => [s.playerId, s.moneyNet]));
    expect(m).toEqual({ A: 80, B: -40, C: -40 });
  });
});

// ---------------------------------------------------------------------------
// 5. Blast radius — the engines F-016/F-017 must not reach at all
// ---------------------------------------------------------------------------

describe('BLAST RADIUS: neither change may touch these (MUST NOT MOVE)', () => {
  // Craig asked directly whether F-017 could affect his pot pools. `payLeg` lives in the
  // `legs` branch of team-game.ts; the classic pool is a different function entirely.
  it('the classic N-foursome pool (computePoolResult)', () => {
    const g = makeGame({
      indexes: [0, 0, 0, 0, 0, 0, 0, 0],
      entryPerPlayer: 25,
      positionSplit: [70, 30],
      teams: [
        makeTeam(1, ['p1', 'p2'], { matchupId: 'm1' }),
        makeTeam(2, ['p3', 'p4'], { matchupId: 'm2' }),
        makeTeam(3, ['p5', 'p6'], { matchupId: 'm3' }),
        makeTeam(4, ['p7', 'p8'], { matchupId: 'm4' }),
      ],
    });
    const r = computePoolResult(g, scoreMap(
      ['m1', [...scoresFor('p1', flat(-1)), ...scoresFor('p2', flat(-1))]],
      ['m2', [...scoresFor('p3', par()), ...scoresFor('p4', par())]],
      ['m3', [...scoresFor('p5', flat(1)), ...scoresFor('p6', flat(1))]],
      ['m4', [...scoresFor('p7', flat(2)), ...scoresFor('p8', flat(2))]],
    ));
    expect({
      pot: r.pot,
      payouts: r.payouts.map((p) => ({
        id: p.teamId, front: p.front, back: p.back, overall: p.overall,
        junk: p.junk, net: p.net, perPerson: p.perPersonNet,
      })),
    }).toMatchSnapshot();
    // The pool's own zero-sum: every dollar in is a dollar out.
    expect(r.payouts.reduce((s, p) => s + p.net, 0)).toBeCloseTo(0, 6);
  });

  // Wolf builds a Wolf-side and a field-side, so it is a two-side consumer of this same engine
  // and must keep working unchanged (the constraint F-006 recorded).
  it('Wolf, a 2-side consumer of the same engine', () => {
    const g = makeGame({
      gameMode: 'wolf', indexes: [5, 11, 8, 14],
      wolfOrder: ['p1', 'p2', 'p3', 'p4'],
      wolfDecisions: {
        1: { wolfId: 'p1', mode: 'partner', partnerId: 'p3' },
        2: { wolfId: 'p2', mode: 'lone', partnerId: null },
        3: { wolfId: 'p3', mode: 'blind', partnerId: null },
        4: { wolfId: 'p4', mode: 'partner', partnerId: 'p1' },
      },
      modeSettings: {
        scoreBasis: 'net', basePoints: 1, loneMultiplier: 2, blindMultiplier: 3,
        moneyModel: 'per-point', dollarsPerPoint: 2,
      },
    });
    const four = [1, 2, 3, 4];
    const r = run(g, [
      ...scoresFor('p1', flat(-1, four), four), ...scoresFor('p2', par(four), four),
      ...scoresFor('p3', flat(1, four), four), ...scoresFor('p4', par(four), four),
    ]);
    expect(shapeOf(r)).toMatchSnapshot();
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// 6. Uneven side SIZES — orthogonal to both changes, pinned because §5.ag's
//    per-side ante and the per-side ball count are easy to disturb.
// ---------------------------------------------------------------------------

describe('GOLDEN: uneven side sizes 3/2/1 (MUST NOT MOVE)', () => {
  const uneven = [['p1', 'p2', 'p3'], ['p4', 'p5'], ['p6']];

  for (const moneyModel of MONEY_MODELS) {
    it(`3/2/1 sides / ${moneyModel}`, () => {
      const r = run(gameN(uneven, { moneyModel }), [
        ...scoresFor('p1', par()), ...scoresFor('p2', flat(1)), ...scoresFor('p3', flat(2)),
        ...scoresFor('p4', flat(1)), ...scoresFor('p5', flat(2)),
        ...scoresFor('p6', flat(2)),
      ]);
      expect(shapeOf(r)).toMatchSnapshot();
      expect(sumMoney(r)).toBeCloseTo(0, 6);
    });
  }

  // COMBINED at uneven sizes is the case that actually depends on a side's ball count, and it
  // was MISSING from the first draft of this file — mutation MUT4 (hard-coding 2 balls per side)
  // survived all 54 tests because every uneven-size case above played BEST BALL, where exactly
  // one ball counts whatever the side size is. `ballsPerHole` only varies for `combined`
  // (team-scoring.ts:60), so that is the only format where the bug is observable.
  //
  // This is precisely the §5.z failure mode: a green suite that looks thorough and cannot see
  // the thing it was written to protect. A trio playing combined contributes three balls, so its
  // "even" baseline is 3x par — get that wrong and a big side is punished for its size.
  for (const moneyModel of MONEY_MODELS) {
    it(`COMBINED at 3/2/1 sides / ${moneyModel}`, () => {
      const r = run(gameN(uneven, { format: 'combined', moneyModel }), [
        ...scoresFor('p1', par()), ...scoresFor('p2', flat(1)), ...scoresFor('p3', flat(2)),
        ...scoresFor('p4', flat(1)), ...scoresFor('p5', flat(2)),
        ...scoresFor('p6', flat(2)),
      ]);
      expect(shapeOf(r)).toMatchSnapshot();
      expect(sumMoney(r)).toBeCloseTo(0, 6);
    });
  }

  // ORACLE for the same rule, independent of the engine's derived fields. Under combined every
  // ball counts, so a side's expected-par baseline scales with its size: the trio's is 3x par
  // (216 on a par-72), the pair's 2x (144), the solo's 1x (72). Written as an explicit
  // to-par assertion so a wrong ball count fails here even if a snapshot were regenerated.
  it('ORACLE: combined scales the even baseline with SIDE SIZE, not a fixed 2', () => {
    const r = run(gameN(uneven, { format: 'combined', moneyModel: 'per-point' }), [
      // Side A (trio): level, +1/hole, +2/hole  -> 72 + 90 + 108 = 270 vs baseline 216 = +54
      ...scoresFor('p1', par()), ...scoresFor('p2', flat(1)), ...scoresFor('p3', flat(2)),
      // Side B (pair): +1/hole, +2/hole        -> 90 + 108 = 198 vs baseline 144 = +54
      ...scoresFor('p4', flat(1)), ...scoresFor('p5', flat(2)),
      // Side C (solo): +2/hole                 -> 108 vs baseline 72 = +36
      ...scoresFor('p6', flat(2)),
    ]);
    const toPar = Object.fromEntries(r.standings.map((s) => [s.playerId, s.toPar]));
    expect(toPar).toEqual({ A: 54, B: 54, C: 36 });
    // C is best on that basis, so C must rank first — the solo player is NOT penalised for
    // being one ball, which is the whole point of scaling the baseline.
    expect(r.standings.find((s) => s.playerId === 'C')!.place).toBe(1);
  });

  // §5.ag: the pot ante is PER SIDE regardless of size, so a solo player and a trio have the
  // same stake. At $20 a side the pot is $60, not $120.
  it('ORACLE: the pot ante is per SIDE, not per player', () => {
    const r = run(gameN(uneven, { moneyModel: 'pot', sideBuyIn: 20, potSplit: '100' }), [
      ...scoresFor('p1', par()), ...scoresFor('p2', flat(1)), ...scoresFor('p3', flat(2)),
      ...scoresFor('p4', flat(1)), ...scoresFor('p5', flat(2)),
      ...scoresFor('p6', flat(2)),
    ]);
    const winner = r.standings.find((s) => s.place === 1)!;
    // Three sides x $20 = $60 pot; winner takes all, so nets $60 - own $20 ante = $40.
    expect(winner.moneyNet).toBe(40);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// 7. Stableford — the other scoring basis, where "better" inverts
// ---------------------------------------------------------------------------

describe('GOLDEN: N sides under Stableford + match (MUST NOT MOVE)', () => {
  const three = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']];

  for (const result of ['match', 'total'] as const) {
    for (const moneyModel of MONEY_MODELS) {
      it(`stableford / ${result} / ${moneyModel}`, () => {
        const r = run(gameN(three, { scoring: 'stableford', result, moneyModel }), [
          ...scoresFor('p1', flat(-1)), ...scoresFor('p2', par()),
          ...scoresFor('p3', par()), ...scoresFor('p4', flat(1)),
          ...scoresFor('p5', flat(1)), ...scoresFor('p6', flat(2)),
        ]);
        expect(shapeOf(r)).toMatchSnapshot();
        expect(sumMoney(r)).toBeCloseTo(0, 6);
        // Higher points must win under Stableford — the bug §5.z's mutation #1 reproduced.
        const best = r.standings.reduce((b, s) => (s.points > b.points ? s : b), r.standings[0]);
        expect(best.place).toBe(1);
      });
    }
  }
});
