// The side-collection shape and its legacy normalizer (F-006, N-sides half).
//
// The whole safety argument for widening `subTeams: {a, b}` to N sides rests on two claims:
//   1. a legacy game READS as the same two sides, with the same ids, so nothing downstream moves
//   2. an ordinary two-side game WRITES the legacy shape, so it never leaves the pinned path
// Both are tested here rather than trusted, because every existing 2v2 game depends on them.

import { describe, expect, it } from 'vitest';
import {
  defaultSideLabel, fromLegacySubTeams, nextSideId, persistedSides, sideMembers,
  settleRoundRobin, sideOfPlayer, sidesOfGame, toLegacySubTeams, type GameSide,
} from '@/lib/game-modes/sides';
import { buildGameModeContext } from '@/lib/game-modes/context';
import { getGameMode } from '@/lib/game-modes';
import type { IndividualResult } from '@/lib/game-modes/types';
import type { PoolGame } from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import { makeGame, parScores, scoresFor, singleMatchup, TEST_PARS } from './fixtures';

describe('reading a legacy two-side game', () => {
  it('widens {a,b} while keeping the ids literally', () => {
    const sides = sidesOfGame({ subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] } });
    expect(sides).toEqual([
      { id: 'a', playerIds: ['p1', 'p2'] },
      { id: 'b', playerIds: ['p3', 'p4'] },
    ]);
  });

  // The load-bearing detail: 'a' and 'b' are preserved verbatim, which is what lets
  // TeamLegLine.winner ('a' | 'b' today) stay valid when its type widens to string.
  it('gives side A the id "a" and side B the id "b", in that order', () => {
    const sides = sidesOfGame({ subTeams: { a: ['x'], b: ['y'] } });
    expect(sides.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('prefers the N-side field when a game has both', () => {
    const sides = sidesOfGame({
      sides: [{ id: 'a', playerIds: ['p1'] }, { id: 'b', playerIds: ['p2'] }, { id: 'c', playerIds: ['p3'] }],
      subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] },
    });
    expect(sides).toHaveLength(3);
  });

  it('returns no sides for a game that has neither field', () => {
    // Seeding a default is a UI decision (defaultSubTeams), deliberately not this function's.
    expect(sidesOfGame({})).toEqual([]);
  });

  it('treats an empty sides array as absent, falling back to the legacy field', () => {
    expect(sidesOfGame({ sides: [], subTeams: { a: ['p1'], b: ['p2'] } })).toHaveLength(2);
  });

  it('preserves member ORDER within a side', () => {
    // Order must not be silently normalized: F-012 was a bug about member order mattering,
    // and the fix was to stop order affecting the MONEY — not to start rewriting the data.
    const sides = sidesOfGame({ subTeams: { a: ['p2', 'p1'], b: ['p4', 'p3'] } });
    expect(sides[0].playerIds).toEqual(['p2', 'p1']);
  });
});

describe('writing a side collection', () => {
  it('an ordinary two-side game saves the LEGACY way, with no new field', () => {
    // This is the claim that keeps every new 2v2 game on the snapshot-pinned path.
    const out = persistedSides([
      { id: 'a', playerIds: ['p1', 'p2'] },
      { id: 'b', playerIds: ['p3', 'p4'] },
    ]);
    expect(out).toEqual({ subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] } });
    expect(out.sides).toBeUndefined();
  });

  it('three sides opt IN to the new field', () => {
    const three: GameSide[] = [
      { id: 'a', playerIds: ['p1', 'p2'] },
      { id: 'b', playerIds: ['p3', 'p4'] },
      { id: 'c', playerIds: ['p5', 'p6'] },
    ];
    const out = persistedSides(three);
    expect(out.sides).toEqual(three);
    // And subTeams is ABSENT, not a lossy first-two-sides copy: a half-truth would make an
    // older client drop two players and settle a different game silently.
    expect(out.subTeams).toBeUndefined();
  });

  it('two sides with CUSTOM names opt in too, since the legacy shape cannot hold a name', () => {
    const out = persistedSides([
      { id: 'a', name: 'The Hogs', playerIds: ['p1', 'p2'] },
      { id: 'b', playerIds: ['p3', 'p4'] },
    ]);
    expect(out.sides).toHaveLength(2);
    expect(out.subTeams).toBeUndefined();
  });

  it('non-legacy ids opt in, even at two sides', () => {
    // A game that started with three sides and lost one could hold ['b','c'].
    expect(persistedSides([
      { id: 'b', playerIds: ['p1'] },
      { id: 'c', playerIds: ['p2'] },
    ]).subTeams).toBeUndefined();
  });

  it('round-trips: legacy -> sides -> legacy is the identity', () => {
    // The property that makes the migration safe in both directions.
    for (const subTeams of [
      { a: ['p1', 'p2'], b: ['p3', 'p4'] },
      { a: ['p2'], b: ['p1', 'p3', 'p4'] },   // uneven
      { a: [], b: ['p1'] },                    // empty side (mid-edit in the UI)
    ]) {
      expect(toLegacySubTeams(fromLegacySubTeams(subTeams))).toEqual(subTeams);
      expect(persistedSides(sidesOfGame({ subTeams }))).toEqual({ subTeams });
    }
  });

  it('toLegacySubTeams refuses anything it cannot express', () => {
    expect(toLegacySubTeams([{ id: 'a', playerIds: [] }])).toBeNull();
    expect(toLegacySubTeams([
      { id: 'a', playerIds: [] }, { id: 'b', playerIds: [] }, { id: 'c', playerIds: [] },
    ])).toBeNull();
    expect(toLegacySubTeams([
      { id: 'a', playerIds: [] }, { id: 'c', playerIds: [] },
    ])).toBeNull();
  });
});

// The normalizer is only useful if the COMPUTE CONTEXT sees the same sides a game stored.
// buildGameModeContext is where the read boundary actually is.
describe('the compute context reads both storage shapes', () => {
  it('a legacy 2v2 game arrives as two sides with ids a and b', () => {
    const game = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0],
      subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] },
    });
    const ctx = buildGameModeContext(game, singleMatchup(parScores(['p1', 'p2', 'p3', 'p4'])));
    expect(ctx.sides?.map((s) => s.id)).toEqual(['a', 'b']);
    expect(ctx.sides?.[0].playerIds).toEqual(['p1', 'p2']);
    // The legacy view stays populated for consumers not yet migrated.
    expect(ctx.subTeams).toEqual({ a: ['p1', 'p2'], b: ['p3', 'p4'] });
  });

  it('a THREE-side game arrives with all three, and subTeams holds only the first two', () => {
    const game = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0, 0, 0],
      sides: [
        { id: 'a', playerIds: ['p1', 'p2'] },
        { id: 'b', playerIds: ['p3', 'p4'] },
        { id: 'c', playerIds: ['p5', 'p6'] },
      ],
    });
    const ctx = buildGameModeContext(game, singleMatchup(parScores(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])));
    expect(ctx.sides).toHaveLength(3);
    expect(ctx.sides?.[2].playerIds).toEqual(['p5', 'p6']);
    // Documented, not accidental: the legacy view is incomplete for 3+ sides. Any consumer
    // still reading subTeams sees two sides, which is why the engine must read `sides`.
    expect(ctx.subTeams).toEqual({ a: ['p1', 'p2'], b: ['p3', 'p4'] });
  });

  it('a game with NO stored sides gets a balanced default, as two sides', () => {
    const game = makeGame({ gameMode: 'team-2v2', indexes: [4, 11, 7, 19] });
    const ctx = buildGameModeContext(game, singleMatchup(parScores(['p1', 'p2', 'p3', 'p4'])));
    expect(ctx.sides).toHaveLength(2);
    // Every player is placed exactly once.
    const placed = ctx.sides!.flatMap((s) => s.playerIds).sort();
    expect(placed).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});

describe('side lookups', () => {
  const sides: GameSide[] = [
    { id: 'a', playerIds: ['p1', 'p2'] },
    { id: 'b', playerIds: ['p3'] },
    { id: 'c', playerIds: ['p4', 'p5'] },
  ];

  it('finds a side\'s members, and returns empty for an unknown id', () => {
    expect(sideMembers(sides, 'c')).toEqual(['p4', 'p5']);
    expect(sideMembers(sides, 'zz')).toEqual([]);
  });

  it('finds which side a player is on', () => {
    expect(sideOfPlayer(sides, 'p4')?.id).toBe('c');
    expect(sideOfPlayer(sides, 'nobody')).toBeNull();
  });
});

// DECISIONS.md §5.ae. The numbers in the first test are Craig's own worked example.
describe('round-robin settlement', () => {
  // $1 per stroke of margin, lower is better.
  const perStroke = (sides: number[]) =>
    settleRoundRobin(sides, (v) => v, (mine, theirs) => theirs - mine);

  it('the last side owes everyone ahead; the 2nd owes only the 1st', () => {
    // Three sides at 70 / 74 / 80 — the example Craig described.
    expect(perStroke([70, 74, 80])).toEqual([14, 2, -16]);
    // B finishing 2nd is still UP, because it lost to one side and beat another. An
    // outright-winner-takes-all rule would have paid B nothing.
    expect(perStroke([70, 74, 80])[1]).toBeGreaterThan(0);
  });

  it('reduces to today\'s head-to-head margin at exactly two sides', () => {
    // The property that keeps every existing 2v2 game settling unchanged.
    expect(perStroke([70, 74])).toEqual([4, -4]);
    expect(perStroke([74, 70])).toEqual([-4, 4]);
  });

  it('is zero-sum at every side count', () => {
    for (const sides of [[70, 74], [70, 74, 80], [70, 71, 72, 73], [68, 74, 74, 80, 90, 71]]) {
      const out = perStroke(sides);
      expect(out.reduce((s, x) => s + x, 0)).toBeCloseTo(0, 6);
    }
  });

  it('a pairwise tie pushes, without affecting the other pairings', () => {
    // A and B tie at 70, C is 6 worse. A/B push against each other, both collect from C.
    expect(perStroke([70, 70, 76])).toEqual([6, 6, -12]);
    // Everyone ties: nobody pays.
    expect(perStroke([72, 72, 72])).toEqual([0, 0, 0]);
  });

  it('skips an unscored side entirely — it neither pays nor collects', () => {
    const out = settleRoundRobin([70, null, 80], (v) => v, (mine, theirs) => theirs - mine);
    expect(out).toEqual([10, 0, -10]);
    expect(out.reduce((s, x) => s + x, 0)).toBe(0);
  });

  it('works for a win/lose/push settle function too (per-hole money)', () => {
    // $2 a hole: A 4, B 5, C 6. A beats both; B loses to A but beats C.
    const perHole = settleRoundRobin(
      [4, 5, 6], (v) => v,
      (mine, theirs) => (mine < theirs ? 2 : mine > theirs ? -2 : 0),
    );
    expect(perHole).toEqual([4, 0, -4]);
    expect(perHole.reduce((s, x) => s + x, 0)).toBe(0);
  });

  it('higher-is-better works by inverting the settle function (Stableford)', () => {
    // Points: more is better. A 42, B 36, C 30.
    const perPoint = settleRoundRobin(
      [42, 36, 30], (v) => v, (mine, theirs) => mine - theirs,
    );
    expect(perPoint).toEqual([18, 0, -18]);
    expect(perPoint.reduce((s, x) => s + x, 0)).toBe(0);
  });
});

describe('new side ids', () => {
  it('continues the a/b lettering', () => {
    expect(nextSideId([])).toBe('a');
    expect(nextSideId([{ id: 'a', playerIds: [] }])).toBe('b');
    expect(nextSideId([{ id: 'a', playerIds: [] }, { id: 'b', playerIds: [] }])).toBe('c');
  });

  it('fills a GAP rather than always appending', () => {
    // Deleting the middle side of three must not make the next one collide with 'c'.
    expect(nextSideId([{ id: 'a', playerIds: [] }, { id: 'c', playerIds: [] }])).toBe('b');
  });

  it('never collides, even past the alphabet', () => {
    const many = Array.from({ length: 26 }, (_, i) => ({
      id: String.fromCharCode(97 + i), playerIds: [],
    }));
    const next = nextSideId(many);
    expect(many.some((s) => s.id === next)).toBe(false);
  });

  it('labels a side with no name and no players', () => {
    expect(defaultSideLabel('a')).toBe('Side A');
    expect(defaultSideLabel('c')).toBe('Side C');
  });
});

// ---------------------------------------------------------------------------
// THREE OR MORE SIDES - the capability this whole exercise was for
// ---------------------------------------------------------------------------
//
// Craig, asked whether more than two sides in one group mattered: "yes, eventually i do think
// that would be an important feature" (DECISIONS.md 5.g). Money settles pairwise round-robin
// per 5.ae, and ranking is on score to par so unequal thru counts are honest.

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

function run3(game: PoolGame, scores: GameScore[]): IndividualResult {
  return getGameMode('team-2v2')!.compute(buildGameModeContext(game, singleMatchup(scores)));
}

describe('three sides in one group', () => {
  // Six scratch players, three pairs. Scratch so net == gross and every number below is
  // derivable by hand from the cards.
  function game3(settings: Record<string, string | number | boolean>) {
    return makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0, 0, 0],
      sides: [
        { id: 'a', playerIds: ['p1', 'p2'] },
        { id: 'b', playerIds: ['p3', 'p4'] },
        { id: 'c', playerIds: ['p5', 'p6'] },
      ],
      modeSettings: {
        format: 'best-ball', scoring: 'stroke', result: 'total',
        dollarsPerHole: 2, dollarsPerPoint: 1, legFront: 10, legBack: 10, legOverall: 20,
        ...settings,
      },
    });
  }

  // A card that is `n` holes better (sign -1) or worse (sign +1) than par.
  const cardFor = (n: number, sign: number) =>
    HOLES.map((h) => TEST_PARS[h - 1] + (h <= n ? sign : 0));
  // A is 6 under, B level, C 6 over - three clearly separated sides.
  const scores3 = () => {
    const a = cardFor(6, -1), b = cardFor(0, 0), c = cardFor(6, 1);
    return [
      ...scoresFor('p1', a), ...scoresFor('p2', a),
      ...scoresFor('p3', b), ...scoresFor('p4', b),
      ...scoresFor('p5', c), ...scoresFor('p6', c),
    ];
  };
  const moneyOf = (r: IndividualResult, id: string) =>
    r.standings.find((s) => s.playerId === id)!.moneyNet;

  it('produces three standings, ranked, with all three side labels', () => {
    const r = run3(game3({ moneyModel: 'per-point' }), scores3());
    expect(r.standings).toHaveLength(3);
    expect(r.sideLabels?.map((s) => s.id).sort()).toEqual(['a', 'b', 'c']);
    // Ranked best-first: A (-6), B (level), C (+6).
    expect(r.standings.map((s) => s.playerId)).toEqual(['A', 'B', 'C']);
    expect(r.standings.map((s) => s.place)).toEqual([1, 2, 3]);
  });

  it('settles per-point PAIRWISE: last owes both, 2nd owes only 1st', () => {
    const r = run3(game3({ moneyModel: 'per-point', dollarsPerPoint: 1 }), scores3());
    // toPar: A -6, B 0, C +6.
    //   A: (0-(-6)) + (6-(-6)) = 6 + 12 = +18
    //   B: ((-6)-0) + (6-0)    = -6 + 6 =   0    <- lost to A, beat C
    //   C: ((-6)-6) + (0-6)    = -12 - 6 = -18
    expect(moneyOf(r, 'A')).toBe(18);
    expect(moneyOf(r, 'B')).toBe(0);
    expect(moneyOf(r, 'C')).toBe(-18);
    expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
  });

  it('a middle side can be UP overall, which is the point of pairwise', () => {
    // A -6, B -4, C +10: B loses 2 to A but beats C by 14, so B is net positive.
    const a = cardFor(6, -1), b = cardFor(4, -1), c = cardFor(10, 1);
    const r = run3(game3({ moneyModel: 'per-point', dollarsPerPoint: 1 }), [
      ...scoresFor('p1', a), ...scoresFor('p2', a),
      ...scoresFor('p3', b), ...scoresFor('p4', b),
      ...scoresFor('p5', c), ...scoresFor('p6', c),
    ]);
    expect(moneyOf(r, 'B')).toBe((-6 - -4) + (10 - -4));   // -2 + 14 = +12
    expect(moneyOf(r, 'B')).toBeGreaterThan(0);
    expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
  });

  it('legs money: the winner collects from EVERY other side', () => {
    const r = run3(game3({ moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 20 }), scores3());
    // scores3 puts every birdie/bogey on holes 1-6, so per leg the sides are:
    //   front    A -6, B 0, C +6   -> A wins
    //   back     A  0, B 0, C  0   -> three-way tie, nobody paid
    //   overall  A -6, B 0, C +6   -> A wins
    // Each won leg pays its dollars by EACH of the two other sides:
    //   A: 2 x (10 front + 20 overall) = +$60, and B and C each pay $30.
    // (My first version of this asserted $80 by assuming A also won the back nine. The $60
    // was correct - the back was a dead heat. Check the fixture before the code.)
    expect(moneyOf(r, 'A')).toBe(60);
    expect(moneyOf(r, 'B')).toBe(-30);
    expect(moneyOf(r, 'C')).toBe(-30);
    expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
    // The back nine is genuinely a no-winner leg here.
    expect(r.teamLegs?.find((l) => l.key === 'back')?.winner).toBeNull();
  });

  it('per-hole money is zero-sum and pays the best side', () => {
    const r = run3(game3({ moneyModel: 'per-hole', result: 'match', dollarsPerHole: 2 }), scores3());
    expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
    // A birdied 6 holes outright and never lost one, so A is up and C is down.
    expect(moneyOf(r, 'A')).toBeGreaterThan(0);
    expect(moneyOf(r, 'C')).toBeLessThan(0);
  });

  it('a three-way dead heat pays nobody', () => {
    const par = HOLES.map((h) => TEST_PARS[h - 1]);
    const r = run3(
      game3({ moneyModel: 'legs' }),
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].flatMap((id) => scoresFor(id, par)),
    );
    expect(r.teamLegs?.every((l) => l.winner === null)).toBe(true);
    expect(r.standings.every((s) => s.place === 1)).toBe(true);
    expect(r.standings.every((s) => s.moneyNet === 0)).toBe(true);
  });

  it('names WHO is tied when only two of three sides tie', () => {
    // A and B both level par, C is 6 over. "All square" would be wrong - it isn't.
    const a = cardFor(0, 0), c = cardFor(6, 1);
    const r = run3(game3({ moneyModel: 'legs' }), [
      ...scoresFor('p1', a), ...scoresFor('p2', a),
      ...scoresFor('p3', a), ...scoresFor('p4', a),
      ...scoresFor('p5', c), ...scoresFor('p6', c),
    ]);
    const overall = r.teamLegs!.find((l) => l.key === 'overall')!;
    expect(overall.winner).toBeNull();
    expect(overall.status).toContain('tied');
    expect(overall.status).not.toBe('All square');
    // Two sides jointly first, C third.
    expect(r.standings.filter((s) => s.place === 1)).toHaveLength(2);
  });

  it('junk collects from every other side, and is zero-sum at three', () => {
    const g = game3({
      moneyModel: 'per-point', dollarsPerPoint: 0,
      junkEnabled: true, junkBirdie: 2, junkEagle: 5, junkAlbatross: 10, junkBasis: 'gross',
    });
    // Side A: 3 birdies ($6). Side B: 1 birdie ($2). Side C: nothing ($0).
    const a = TEST_PARS.slice(); a[0] -= 1; a[1] -= 1; a[2] -= 1;
    const b = TEST_PARS.slice(); b[0] -= 1;
    const r = run3(g, [
      ...scoresFor('p1', a), ...scoresFor('p2', TEST_PARS),
      ...scoresFor('p3', b), ...scoresFor('p4', TEST_PARS),
      ...scoresFor('p5', TEST_PARS), ...scoresFor('p6', TEST_PARS),
    ]);
    // 5.ad: own x (N-1) - everyone else's. A: 6x2 - 2 = +10. B: 2x2 - 6 = -2. C: 0 - 8 = -8.
    expect(moneyOf(r, 'A')).toBe(10);
    expect(moneyOf(r, 'B')).toBe(-2);
    expect(moneyOf(r, 'C')).toBe(-8);
    expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
  });

  it('four sides of one player each is zero-sum too', () => {
    const g = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0],
      sides: [
        { id: 'a', playerIds: ['p1'] }, { id: 'b', playerIds: ['p2'] },
        { id: 'c', playerIds: ['p3'] }, { id: 'd', playerIds: ['p4'] },
      ],
      modeSettings: { format: 'best-ball', scoring: 'stableford', result: 'match', moneyModel: 'per-hole', dollarsPerHole: 1 },
    });
    const r = run3(g, ['p1', 'p2', 'p3', 'p4'].flatMap((id, i) =>
      scoresFor(id, HOLES.map((h) => TEST_PARS[h - 1] + ((h + i) % 3)))));
    expect(r.standings).toHaveLength(4);
    expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
  });

  it('an unstarted side among three neither pays nor collects', () => {
    const a = cardFor(6, -1), b = cardFor(0, 0);
    const r = run3(game3({ moneyModel: 'per-point', dollarsPerPoint: 1 }), [
      ...scoresFor('p1', a), ...scoresFor('p2', a),
      ...scoresFor('p3', b), ...scoresFor('p4', b),
      // side C has posted nothing
    ]);
    const c = r.standings.find((s) => s.playerId === 'C')!;
    expect(c.thru).toBe(0);
    expect(c.place).toBe(0);
    expect(c.moneyNet).toBe(0);
    // A still collects from B alone - 6 strokes of to-par margin at $1.
    expect(moneyOf(r, 'A')).toBe(6);
    expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
  });


  // A SWEEP, not a single case. The mutation run showed the explicit-dollar test above was the
  // ONLY thing catching a legs-money bug (paying the winner one unit instead of one per opponent
  // breaks zero-sum at 3+ sides but passes everything else). Zero-sum across every side count x
  // money model x scoring is the invariant that actually guards this.
  it('is zero-sum for every side count x money model x scoring', () => {
    const MONEY = ['per-hole', 'per-point', 'legs'] as const;
    const SCORING = ['stroke', 'stableford'] as const;
    const RESULT = ['match', 'total'] as const;
    for (const sideCount of [2, 3, 4, 5, 6]) {
      // sideCount sides of one player each, up to 6 players.
      const ids = Array.from({ length: sideCount }, (_, i) => `p${i + 1}`);
      for (const moneyModel of MONEY) {
        for (const scoring of SCORING) {
          for (const result of RESULT) {
            const g = makeGame({
              gameMode: 'team-2v2', indexes: ids.map(() => 0),
              sides: ids.map((id, i) => ({ id: String.fromCharCode(97 + i), playerIds: [id] })),
              modeSettings: {
                format: 'best-ball', scoring, result, moneyModel,
                dollarsPerHole: 2, dollarsPerPoint: 1, legFront: 10, legBack: 10, legOverall: 20,
              },
            });
            // Distinct cards so sides separate rather than all tying (a tie pays $0, which
            // satisfies zero-sum trivially and would hide the bug).
            const r = run3(g, ids.flatMap((id, i) =>
              scoresFor(id, HOLES.map((h) => TEST_PARS[h - 1] + ((h + i * 2) % 4) - 1))));
            const label = `${sideCount} sides / ${moneyModel} / ${scoring} / ${result}`;
            const sum = r.standings.reduce((s, x) => s + x.moneyNet, 0);
            expect(sum, `${label} is not zero-sum`).toBeCloseTo(0, 6);
            expect(r.standings, label).toHaveLength(sideCount);
            // No NaN or Infinity anywhere - the failure that renders as "$NaN" on the board
            // rather than crashing.
            for (const st of r.standings) {
              expect(Number.isFinite(st.moneyNet), `${label}: ${st.playerId} money not finite`).toBe(true);
              expect(Number.isFinite(st.points), `${label}: ${st.playerId} points not finite`).toBe(true);
            }
          }
        }
      }
    }
  });

  // Somebody must actually be PAID in a legs game at 3+ sides, or the sweep above passes on a
  // board where no money ever moves.
  it('legs money at 3-6 sides actually pays the leg winners', () => {
    for (const sideCount of [3, 4, 5, 6]) {
      const ids = Array.from({ length: sideCount }, (_, i) => `p${i + 1}`);
      const g = makeGame({
        gameMode: 'team-2v2', indexes: ids.map(() => 0),
        sides: ids.map((id, i) => ({ id: String.fromCharCode(97 + i), playerIds: [id] })),
        modeSettings: {
          format: 'best-ball', scoring: 'stroke', result: 'total', moneyModel: 'legs',
          legFront: 10, legBack: 10, legOverall: 20,
        },
      });
      // Side A birdies everything; everyone else pars. A wins all three legs outright.
      const r = run3(g, ids.flatMap((id, i) =>
        scoresFor(id, HOLES.map((h) => TEST_PARS[h - 1] - (i === 0 ? 1 : 0)))));
      const payers = sideCount - 1;
      expect(r.standings.find((s) => s.playerId === 'A')!.moneyNet,
        `${sideCount} sides: A should collect (10+10+20) from each of ${payers}`).toBe(40 * payers);
      for (const st of r.standings.filter((s) => s.playerId !== 'A')) {
        expect(st.moneyNet, `${sideCount} sides: ${st.playerId} pays one leg set`).toBe(-40);
      }
      expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
    }
  });

  it('an uneven split (3 + 2 + 1) still settles zero-sum', () => {
    const g = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0, 0, 0],
      sides: [
        { id: 'a', playerIds: ['p1', 'p2', 'p3'] },
        { id: 'b', playerIds: ['p4', 'p5'] },
        { id: 'c', playerIds: ['p6'] },
      ],
      modeSettings: { format: 'best-ball', scoring: 'stroke', result: 'total', moneyModel: 'per-point', dollarsPerPoint: 1 },
    });
    const r = run3(g, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].flatMap((id, i) =>
      scoresFor(id, HOLES.map((h) => TEST_PARS[h - 1] + ((h + i) % 3)))));
    expect(r.standings).toHaveLength(3);
    expect(r.standings.reduce((s, x) => s + x.moneyNet, 0)).toBeCloseTo(0, 6);
  });


  // The case that actually pins PER-SIDE ball counts. The test above uses 3-vs-3, where a wrong
  // ball count cancels on both sides and the bug is invisible: hardcoding sideBalls = 1 passed
  // all 164 tests. An UNEVEN combined game does not cancel.
  //
  // Combined means every member's ball counts, so a 3-player side's "even" hole is 3 x par and a
  // 2-player side's is 2 x par. Everyone pars => both sides are level => $0. With one ball
  // assumed for both, side A reads +144 and side B +72, and A pays $72 for playing par golf
  // with an extra player.
  it('COMBINED 3-vs-2 uses each side own ball count (uneven does not cancel)', () => {
    const g = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0, 0],
      sides: [
        { id: 'a', playerIds: ['p1', 'p2', 'p3'] },
        { id: 'b', playerIds: ['p4', 'p5'] },
      ],
      modeSettings: {
        format: 'combined', scoring: 'stroke', result: 'total',
        moneyModel: 'per-point', dollarsPerPoint: 1,
      },
    });
    const par = HOLES.map((h) => TEST_PARS[h - 1]);
    const r = run3(g, ['p1', 'p2', 'p3', 'p4', 'p5'].flatMap((id) => scoresFor(id, par)));
    // Every player pars, so neither side beat expectation: nobody owes anybody.
    expect(moneyOf(r, 'A'), 'a bigger side must not pay for having more balls').toBe(0);
    expect(moneyOf(r, 'B')).toBe(0);
    expect(r.standings.every((s) => s.place === 1)).toBe(true);
    // The raw totals DO differ (3 balls vs 2) - display is honest, ranking is normalized.
    expect(moneyOf(r, 'A')).toBe(0);
    expect(r.standings.find((s) => s.playerId === 'A')!.points)
      .not.toBe(r.standings.find((s) => s.playerId === 'B')!.points);
  });

  // Same idea under Stableford: a par is 2 points PER BALL, so a 3-player combined side expects
  // 6 a hole and a 2-player side 4.
  it('COMBINED 3-vs-2 normalizes Stableford points per ball too', () => {
    const g = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0, 0],
      sides: [
        { id: 'a', playerIds: ['p1', 'p2', 'p3'] },
        { id: 'b', playerIds: ['p4', 'p5'] },
      ],
      modeSettings: {
        format: 'combined', scoring: 'stableford', result: 'total',
        moneyModel: 'per-point', dollarsPerPoint: 1,
      },
    });
    const par = HOLES.map((h) => TEST_PARS[h - 1]);
    const r = run3(g, ['p1', 'p2', 'p3', 'p4', 'p5'].flatMap((id) => scoresFor(id, par)));
    expect(moneyOf(r, 'A')).toBe(0);
    expect(moneyOf(r, 'B')).toBe(0);
  });

  it('COMBINED with uneven sides uses each side own ball count for score to par', () => {
    // A 3-player side playing combined contributes THREE balls, so its "even" is 3x par.
    // Without per-side ball counts the bigger side reads as hugely over par and pays every hole.
    const g = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0, 0, 0],
      sides: [
        { id: 'a', playerIds: ['p1', 'p2', 'p3'] },
        { id: 'b', playerIds: ['p4', 'p5', 'p6'] },
      ],
      modeSettings: { format: 'combined', scoring: 'stroke', result: 'total', moneyModel: 'per-point', dollarsPerPoint: 1 },
    });
    const par = HOLES.map((h) => TEST_PARS[h - 1]);
    const r = run3(g, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].flatMap((id) => scoresFor(id, par)));
    // Every player pars, both sides identical => nobody owes anybody.
    expect(moneyOf(r, 'A')).toBe(0);
    expect(moneyOf(r, 'B')).toBe(0);
    expect(r.standings.every((s) => s.place === 1)).toBe(true);
  });
});
