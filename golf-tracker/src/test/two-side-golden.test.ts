// GOLDEN pins for the TWO-SIDE engines, taken before widening them to N sides (F-006 step 1).
//
// WHY THIS FILE EXISTS
// `team-game.ts` (2v2 within one foursome) and `wolf.ts` (Wolf side vs field side) are both
// hard-wired to exactly two sides. Generalizing them to N is a change to the money engine's
// hot path, so every result they produce TODAY has to be pinned first — existing games must
// settle identically afterwards, and "identically" has to mean concrete numbers, not
// invariants that a rewrite could satisfy while paying the wrong side.
//
// TWO KINDS OF ASSERTION, DELIBERATELY
//   1. Snapshots of the WHOLE IndividualResult shape. Broad: money, place, leg winners, leg
//      status strings and side names all move visibly if anything drifts. A rewrite cannot
//      quietly change one field.
//   2. INDEPENDENT ORACLES that recompute the expected answer from raw gross scores, with no
//      reference to the engine's own derived fields.
//
// (2) exists because of DECISIONS.md §5.z: an 860-case sweep passed 804/804 first run, and
// re-introducing four known bugs showed THREE survived — every surviving assertion had read a
// value the code under test produced. A snapshot has the same weakness in a different form: it
// proves "unchanged", never "correct". If a rewrite is wrong in the same way the current code
// is wrong, only the oracle catches it.
//
// PROVED IT CAN FAIL. All 61 cases passed on the first run, which §5.z says to distrust rather
// than report. Five one-line mutations, each a real bug from this finding's history:
//
//   | mutation                                             | cases failed |
//   |------------------------------------------------------|--------------|
//   | points ranked lower-is-better (§5.z bug #1)           | 13 (12 snap) |
//   | legs money ignores WHICH side won the leg             | 10 (9 snap)  |
//   | junk settled by field average, not differential       | 2            |
//   | Wolf lone/blind multiplier dropped                    | 6 (5 snap)   |
//   | combined collapses to best-ball                       | 6 (6 snap)   |
//
// The junk mutation is the one worth naming: FINDINGS.md F-006 recommended field-average
// settlement for N sides in writing, and it silently HALVES every existing 2v2 game's junk
// money. See DECISIONS.md §5.ad — Craig chose collect-from-every-other-side instead, which
// reduces to today's numbers exactly. That mutation reproduces the rejected formula, so this
// file now guards against re-introducing it.
//
// One fixture bug the mutation run also exposed: 12 of the 48 matrix cells (every alternate-shot
// one) were an exact 75-75 net dead heat, snapshotting $0/$0 and pinning nothing about ranking.
// Fixed, and there's now an explicit assertion that every cell pays somebody.

import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import type { IndividualResult, PlayerStanding } from '@/lib/game-modes/types';
import type { PoolGame } from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import { allEighteen, backNine, makeGame, scoresFor, singleMatchup, TEST_PARS } from './fixtures';

// --- helpers ---------------------------------------------------------------

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

// The full result, normalized for snapshotting. Everything a golfer could see or be paid.
function shapeOf(r: IndividualResult) {
  return {
    metricLabel: r.metricLabel,
    thruHole: r.thruHole,
    moneyModel: r.moneyModel,
    sideNames: r.sideNames,
    standings: r.standings.map((s) => ({
      id: s.playerId, name: s.playerName, points: s.points,
      money: s.moneyNet, thru: s.thru, place: s.place,
      // First six holes only: enough to pin the per-hole rule without a wall of nulls.
      perHole: s.perHole.slice(0, 6),
    })),
    teamLegs: r.teamLegs?.map((l) => ({
      key: l.key, label: l.label, status: l.status, winner: l.winner, thru: l.thru,
    })),
    junkLines: r.junkLines?.map((j) => ({
      id: j.playerId, birdies: j.birdies, eagles: j.eagles,
      albatrosses: j.albatrosses, dollars: j.dollars,
    })),
  };
}

// A mixed field so handicap strokes actually bite, and distinct deterministic scores per
// player so no two sides accidentally tie (a tie hides a ranking bug — that's how the
// points-ranked-backwards bug survived its first test).
const MIXED_2V2 = [4, 11, 7, 19];
const spread = (ids: string[], holes = allEighteen()) =>
  ids.flatMap((id, i) => scoresFor(id, holes.map((h) => TEST_PARS[h - 1] + ((h + i) % 4)), holes));

// ---------------------------------------------------------------------------
// 1. 2v2: the whole option matrix
// ---------------------------------------------------------------------------

describe('GOLDEN: 2v2 across every format x scoring x result x money model', () => {
  const FORMATS = ['best-ball', 'combined', 'scramble', 'alternate-shot'] as const;
  const SCORINGS = ['stroke', 'stableford'] as const;
  const RESULTS = ['match', 'total'] as const;
  const MONEY = ['per-hole', 'per-point', 'legs'] as const;

  function game2v2(settings: Record<string, string | number>, extra: Partial<PoolGame> = {}) {
    return makeGame({
      gameMode: 'team-2v2', indexes: MIXED_2V2,
      subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] },
      modeSettings: {
        moneyModel: 'legs', dollarsPerHole: 2, dollarsPerPoint: 1,
        legFront: 10, legBack: 10, legOverall: 20, altShotAllowance: 50,
        ...settings,
      },
      ...extra,
    });
  }

  // One-ball formats share a ball, so every member of a side holds the SAME gross — which is
  // the only well-formed input for them (DECISIONS.md §5.ac). Feeding them per-player spreads
  // would pin a state the app now refuses to create.
  function scoresForFormat(format: string, holes = allEighteen()): GameScore[] {
    if (format !== 'scramble' && format !== 'alternate-shot') return spread(['p1', 'p2', 'p3', 'p4'], holes);
    // Side A gross 78, side B gross 81. Deliberately NOT a tie under either one-ball format:
    // the first draft made them 75 net apiece under alternate shot, so all 12 alt-shot cells
    // paid $0 and could not have caught a ranking bug — the failure mode this file's header
    // warns about. Side A now bogeys two fewer holes, which separates them on both.
    const sideA = holes.map((h) => TEST_PARS[h - 1] + (h % 5 === 0 ? 1 : 0));
    const sideB = holes.map((h) => TEST_PARS[h - 1] + (h % 2 === 0 ? 1 : 0));
    return [
      ...scoresFor('p1', sideA, holes), ...scoresFor('p2', sideA, holes),
      ...scoresFor('p3', sideB, holes), ...scoresFor('p4', sideB, holes),
    ];
  }

  for (const format of FORMATS) {
    for (const scoring of SCORINGS) {
      for (const result of RESULTS) {
        for (const moneyModel of MONEY) {
          it(`${format} / ${scoring} / ${result} / ${moneyModel}`, () => {
            const r = run(game2v2({ format, scoring, result, moneyModel }), scoresForFormat(format));
            expect(shapeOf(r)).toMatchSnapshot();
            // Zero-sum holds for every cell of the matrix, snapshot or not.
            expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
            // And every cell must actually PAY someone. A tied fixture snapshots $0/$0, which
            // pins nothing about ranking — a rewrite that paid the wrong side would still
            // match. 12 of these 48 cells were exactly that until the fixture was fixed.
            expect(standing(r, 'A').moneyNet, `${format}/${scoring}/${result}/${moneyModel} is a dead heat — the fixture pins nothing`).not.toBe(0);
          });
        }
      }
    }
  }

  it('a nine collapses to one leg, on both handicap bases', () => {
    for (const basis of ['18', '9'] as const) {
      const g = game2v2(
        { format: 'best-ball', scoring: 'stableford', result: 'match', moneyModel: 'legs' },
        { holesPlaying: 'back9', nineHandicapBasis: basis },
      );
      const r = run(g, spread(['p1', 'p2', 'p3', 'p4'], backNine()));
      expect({ basis, shape: shapeOf(r) }).toMatchSnapshot();
    }
  });

  it('junk settles between the two sides, at the current dollars', () => {
    const g = game2v2({
      format: 'best-ball', scoring: 'stroke', result: 'match', moneyModel: 'per-hole',
      dollarsPerHole: 0, junkEnabled: 1 as unknown as number,
      junkBirdie: 2, junkEagle: 5, junkAlbatross: 10, junkBasis: 'gross',
    });
    // Written as booleans in the bag the app uses; the schema reads 'true' or true.
    g.modeSettings!.junkEnabled = true;
    // p1 (side A) two birdies + an eagle; p3 (side B) one birdie.
    const p1 = TEST_PARS.slice(); p1[0] -= 1; p1[3] -= 1; p1[7] -= 2;
    const p3 = TEST_PARS.slice(); p3[0] -= 1;
    const r = run(g, [
      ...scoresFor('p1', p1), ...scoresFor('p2', TEST_PARS),
      ...scoresFor('p3', p3), ...scoresFor('p4', TEST_PARS),
    ]);
    expect(shapeOf(r)).toMatchSnapshot();
    // THE NUMBER THAT MUST NOT MOVE (DECISIONS.md §5.ad). Side A earned 2x$2 + $5 = $9,
    // side B $2. Today's rule is a straight differential: A collects $9 - $2 = $7.
    // The N-side generalization is "collect from every other side", which at two sides
    // reduces to exactly this. Field-average would pay $3.50 and silently rewrite history.
    expect(standing(r, 'A').moneyNet).toBe(7);
    expect(standing(r, 'B').moneyNet).toBe(-7);
  });

  it('an unscored side, and a part-scored round, are stable', () => {
    // Side B has posted nothing: no leg can be decided, so no money changes hands.
    const g = game2v2({ format: 'best-ball', scoring: 'stroke', result: 'total', moneyModel: 'legs' });
    const r = run(g, spread(['p1', 'p2'], [1, 2, 3, 4, 5]));
    expect(shapeOf(r)).toMatchSnapshot();
    expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// 2. 2v2: independent oracles (NOT snapshots)
// ---------------------------------------------------------------------------
//
// These recompute the answer from raw gross scores and hand-derived handicap strokes. The
// fixture course has slope 113 and rating == par, so Course Handicap == Handicap Index, and
// stroke index == hole number (verified in fixtures.test.ts). So a player with index N gets
// exactly one stroke on holes 1..N — derivable without asking the engine anything.

describe('ORACLE: 2v2 money follows from the raw scores', () => {
  // Scratch players, so net == gross and the oracle needs no stroke table at all. The point
  // here is the SETTLEMENT rule, not the handicap math (pinned separately above).
  function scratch(settings: Record<string, string | number>) {
    return makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0],
      subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] },
      modeSettings: {
        legFront: 10, legBack: 10, legOverall: 20,
        dollarsPerHole: 2, dollarsPerPoint: 1, ...settings,
      },
    });
  }

  it('per-hole money = $ x (holes won - holes lost), counted by hand', () => {
    // Side A birdies holes 1-5 and 10-12 (8 wins); side B birdies 15-16 (2 wins); rest halved.
    const aWins = new Set([1, 2, 3, 4, 5, 10, 11, 12]);
    const bWins = new Set([15, 16]);
    const aCard = allEighteen().map((h) => TEST_PARS[h - 1] - (aWins.has(h) ? 1 : 0));
    const bCard = allEighteen().map((h) => TEST_PARS[h - 1] - (bWins.has(h) ? 1 : 0));
    const r = run(
      scratch({ format: 'best-ball', scoring: 'stroke', result: 'match', moneyModel: 'per-hole' }),
      [
        ...scoresFor('p1', aCard), ...scoresFor('p2', aCard),
        ...scoresFor('p3', bCard), ...scoresFor('p4', bCard),
      ],
    );
    // Oracle: recount from the cards, never from r.standings.
    let won = 0, lost = 0;
    for (const h of allEighteen()) {
      const a = aCard[h - 1], b = bCard[h - 1];
      if (a < b) won++; else if (b < a) lost++;
    }
    expect(won).toBe(8);
    expect(lost).toBe(2);
    expect(standing(r, 'A').moneyNet).toBe((won - lost) * 2);
    expect(standing(r, 'B').moneyNet).toBe(-((won - lost) * 2));
  });

  it('legs money = the sum of the legs A actually won, decided from raw totals', () => {
    // Side A better on the front, side B better on the back, A better overall.
    const aCard = allEighteen().map((h) => TEST_PARS[h - 1] + (h <= 9 ? 0 : 2));
    const bCard = allEighteen().map((h) => TEST_PARS[h - 1] + (h <= 9 ? 3 : 0));
    const r = run(
      scratch({ format: 'best-ball', scoring: 'stroke', result: 'total', moneyModel: 'legs' }),
      [
        ...scoresFor('p1', aCard), ...scoresFor('p2', aCard),
        ...scoresFor('p3', bCard), ...scoresFor('p4', bCard),
      ],
    );
    // Oracle: sum each nine from the cards and decide each leg independently.
    const sum = (card: number[], from: number, to: number) =>
      allEighteen().filter((h) => h >= from && h <= to).reduce((s, h) => s + card[h - 1], 0);
    const front = Math.sign(sum(bCard, 1, 9) - sum(aCard, 1, 9));      // +1 => A wins
    const back = Math.sign(sum(bCard, 10, 18) - sum(aCard, 10, 18));
    const overall = Math.sign(sum(bCard, 1, 18) - sum(aCard, 1, 18));
    expect([front, back, overall]).toEqual([1, -1, 1]);  // A, B, A
    expect(standing(r, 'A').moneyNet).toBe(front * 10 + back * 10 + overall * 20);
  });

  // §5.z's bug #1: points ranked lower-is-better paid the LOSING side. The oracle here decides
  // the winner from a hand-counted Stableford tally, so it cannot agree with a backwards engine.
  it('under Stableford the side with MORE points is paid', () => {
    // Side A birdies six holes; side B pars everything. Scratch, so points come off gross.
    const aBirdies = new Set([1, 2, 3, 4, 5, 6]);
    const aCard = allEighteen().map((h) => TEST_PARS[h - 1] - (aBirdies.has(h) ? 1 : 0));
    const bCard = allEighteen().map((h) => TEST_PARS[h - 1]);
    const r = run(
      scratch({ format: 'best-ball', scoring: 'stableford', result: 'total', moneyModel: 'per-point' }),
      [
        ...scoresFor('p1', aCard), ...scoresFor('p2', aCard),
        ...scoresFor('p3', bCard), ...scoresFor('p4', bCard),
      ],
    );
    // Oracle: standard scale, par = 2, birdie = 3. A = 12 pars + 6 birdies, B = 18 pars.
    const ptsFor = (card: number[]) =>
      allEighteen().reduce((s, h) => s + (card[h - 1] === TEST_PARS[h - 1] ? 2 : 3), 0);
    const aPts = ptsFor(aCard), bPts = ptsFor(bCard);
    expect(aPts).toBe(42);
    expect(bPts).toBe(36);
    expect(aPts).toBeGreaterThan(bPts);
    // More points must mean MORE money — sign, not just magnitude.
    expect(standing(r, 'A').moneyNet).toBe(aPts - bPts);
    expect(standing(r, 'A').moneyNet).toBeGreaterThan(0);
    expect(standing(r, 'A').place).toBe(1);
  });

  // Handicap strokes DO bite here, so the oracle builds its own stroke table.
  it('best-ball nets each side off its own low ball, with hand-derived strokes', () => {
    const g = makeGame({
      gameMode: 'team-2v2', indexes: [4, 11, 7, 19],
      subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] },
      modeSettings: { format: 'best-ball', scoring: 'stroke', result: 'total', moneyModel: 'per-point', dollarsPerPoint: 1 },
    });
    const cards: Record<string, number[]> = {
      p1: allEighteen().map((h) => TEST_PARS[h - 1] + 1),
      p2: allEighteen().map((h) => TEST_PARS[h - 1] + 2),
      p3: allEighteen().map((h) => TEST_PARS[h - 1] + 1),
      p4: allEighteen().map((h) => TEST_PARS[h - 1] + 3),
    };
    const r = run(g, Object.entries(cards).flatMap(([id, c]) => scoresFor(id, c)));

    // Oracle: index N gives one stroke on holes 1..N (SI == hole number on this course).
    const idx: Record<string, number> = { p1: 4, p2: 11, p3: 7, p4: 19 };
    const strokes = (id: string, hole: number) =>
      (hole <= idx[id] ? 1 : 0) + (idx[id] >= 18 + hole ? 1 : 0);
    const net = (id: string, hole: number) => cards[id][hole - 1] - strokes(id, hole);
    const sideTotal = (ids: string[]) =>
      allEighteen().reduce((s, h) => s + Math.min(...ids.map((id) => net(id, h))), 0);

    const aTotal = sideTotal(['p1', 'p2']);
    const bTotal = sideTotal(['p3', 'p4']);
    expect(standing(r, 'A').points).toBe(aTotal);
    expect(standing(r, 'B').points).toBe(bTotal);
    // Lower total wins under strokes; money is the margin.
    expect(standing(r, 'A').moneyNet).toBe(bTotal - aTotal);
    expect(standing(r, aTotal < bTotal ? 'A' : 'B').place).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Wolf: the OTHER two-side consumer, which must not move at all
// ---------------------------------------------------------------------------
//
// Wolf builds a Wolf side and a field side per hole (wolf.ts:82-83) — 1v3, or 2v2 with a
// partner. It never persists sides, so it will consume the new normalized collection. Nothing
// about its money may change.

describe('GOLDEN: Wolf (a 2-side consumer of the same idea)', () => {
  const base = {
    basePoints: 1, loneMultiplier: 2, blindMultiplier: 3,
    moneyModel: 'per-point', dollarsPerPoint: 1,
  };

  function wolfGame(settings: Record<string, string | number>, decisions: PoolGame['wolfDecisions']) {
    return makeGame({
      gameMode: 'wolf', indexes: MIXED_2V2,
      modeSettings: { ...base, ...settings },
      wolfDecisions: decisions,
    });
  }

  for (const scoreBasis of ['gross', 'net'] as const) {
    for (const moneyModel of ['per-point', 'nassau'] as const) {
      it(`every call type: ${scoreBasis} / ${moneyModel}`, () => {
        const r = run(
          wolfGame(
            {
              scoreBasis, moneyModel,
              nassauSplit: 'three', nassauFront: 5, nassauBack: 5, nassauTotal: 10,
            },
            {
              1: { wolfId: 'p1', mode: 'partner', partnerId: 'p2' },
              2: { wolfId: 'p2', mode: 'lone', partnerId: null },
              3: { wolfId: 'p3', mode: 'blind', partnerId: null },
              4: { wolfId: 'p4', mode: 'partner', partnerId: 'p1' },
            },
          ),
          spread(['p1', 'p2', 'p3', 'p4']),
        );
        expect({
          shape: shapeOf(r),
          wolfHoles: r.wolfHoles?.slice(0, 6),
          nassauLegs: r.nassauLegs,
        }).toMatchSnapshot();
        expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
      });
    }
  }

  it('a pushed hole pays nobody, and the rotation default is stable', () => {
    // No decisions at all: every hole defaults to the rotating Wolf going lone.
    const r = run(wolfGame({ scoreBasis: 'gross' }, undefined), spread(['p1', 'p2', 'p3', 'p4']));
    expect({ shape: shapeOf(r), wolfHoles: r.wolfHoles?.slice(0, 6) }).toMatchSnapshot();
  });

  // ORACLE: a lone Wolf who wins takes basePoints x loneMultiplier, and the three losers each
  // pay their share. Derived from the multiplier arithmetic, not read back from the engine.
  it('ORACLE: a lone Wolf winning one hole is paid the multiplied points', () => {
    const g = makeGame({
      gameMode: 'wolf', indexes: [0, 0, 0, 0],
      modeSettings: { ...base, scoreBasis: 'gross', basePoints: 1, loneMultiplier: 2 },
      wolfDecisions: { 1: { wolfId: 'p1', mode: 'lone', partnerId: null } },
    });
    // Only hole 1 scored: p1 birdies, everyone else pars.
    const r = run(g, [
      ...scoresFor('p1', [TEST_PARS[0] - 1], [1]),
      ...scoresFor('p2', [TEST_PARS[0]], [1]),
      ...scoresFor('p3', [TEST_PARS[0]], [1]),
      ...scoresFor('p4', [TEST_PARS[0]], [1]),
    ]);
    // Oracle: pot = 1 x 2 = 2 points to the lone winner; nobody else scores. Money is
    // (points - field average) x $1 = (2 - 0.5) = +$1.50 to p1, -$0.50 to each other.
    expect(standing(r, 'p1').points).toBe(2);
    expect(standing(r, 'p2').points).toBe(0);
    expect(standing(r, 'p1').moneyNet).toBeCloseTo(1.5, 6);
    expect(standing(r, 'p2').moneyNet).toBeCloseTo(-0.5, 6);
    expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
  });
});
