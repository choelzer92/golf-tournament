// The side-collection shape and its legacy normalizer (F-006, N-sides half).
//
// The whole safety argument for widening `subTeams: {a, b}` to N sides rests on two claims:
//   1. a legacy game READS as the same two sides, with the same ids, so nothing downstream moves
//   2. an ordinary two-side game WRITES the legacy shape, so it never leaves the pinned path
// Both are tested here rather than trusted, because every existing 2v2 game depends on them.

import { describe, expect, it } from 'vitest';
import {
  defaultSideLabel, fromLegacySubTeams, nextSideId, persistedSides, sideMembers,
  sideOfPlayer, sidesOfGame, toLegacySubTeams, type GameSide,
} from '@/lib/game-modes/sides';
import { buildGameModeContext } from '@/lib/game-modes/context';
import { makeGame, parScores, singleMatchup } from './fixtures';

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
