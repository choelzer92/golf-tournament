// Fixture builders for the pure-compute tests.
//
// Everything here is plain in-memory data — no Supabase, no network, no browser.
// The point is that constructing a *realistic* PoolGame takes one line, so tests
// read as statements about golf ("side A wins the front") rather than 60 lines of
// object literal.
//
// A synthetic course is used deliberately instead of real GHIN data: par and
// stroke index are then known constants, so expected strokes/nets can be worked
// out by hand and asserted exactly.

import type { CourseSelection, GameScore, Player, TeeSetOption } from '@/lib/game-state';
import type { PoolGame, PoolTeam } from '@/lib/pool-game';
import { DEFAULT_JUNK_VALUES } from '@/lib/pool-game';

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------

// A flat, predictable 18: par 72 (four par 3s, four par 5s, ten par 4s) with
// stroke index == hole number, so "hole N" and "the Nth hardest hole" coincide.
// That makes stroke-allocation assertions trivial to reason about.
export const TEST_PARS: number[] = [
  4, 5, 3, 4, 4, 4, 3, 5, 4,   // front: par 36
  4, 4, 3, 5, 4, 4, 3, 5, 4,   // back:  par 36
];

export function makeTee(overrides: Partial<TeeSetOption> = {}): TeeSetOption {
  const holes = TEST_PARS.map((par, i) => ({
    number: i + 1,
    par,
    yardage: par === 3 ? 165 : par === 5 ? 520 : 400,
    handicap: i + 1,          // stroke index 1..18 == hole number
  }));
  return {
    id: 1,
    name: 'Test Blue',
    gender: 'M',
    totalYardage: 6500,
    totalPar: 72,
    ratings: [
      { type: 'Total', courseRating: 71.0, slopeRating: 113 },
      { type: 'Front', courseRating: 35.5, slopeRating: 113 },
      { type: 'Back', courseRating: 35.5, slopeRating: 113 },
    ],
    holes,
    ...overrides,
  };
}

// Slope 113 and rating == par by default, so Course Handicap == Handicap Index.
// That's the whole reason the numbers in these tests are legible: a 10 index is a
// 10 course handicap, so expected strokes follow directly from the index.
export function makeCourse(overrides: Partial<CourseSelection> = {}): CourseSelection {
  const tee = makeTee({
    ratings: [
      { type: 'Total', courseRating: 72.0, slopeRating: 113 },
      { type: 'Front', courseRating: 36.0, slopeRating: 113 },
      { type: 'Back', courseRating: 36.0, slopeRating: 113 },
    ],
  });
  return {
    courseId: 1,
    courseName: 'Test National',
    city: 'Denver',
    state: 'CO',
    teeSets: [tee],
    selectedTeeId: tee.id,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

// Stable ids ('p1'...) so tests can refer to players without plumbing ids around.
export function makePlayer(n: number, handicapIndex: number, overrides: Partial<Player> = {}): Player {
  return {
    id: `p${n}`,
    name: `Player${n} Last${n}`,
    handicapIndex,
    gender: 'M',
    teeSetId: 1,
    ...overrides,
  };
}

// `indexes` drives both the count and each player's handicap.
export function makePlayers(indexes: number[]): Player[] {
  return indexes.map((idx, i) => makePlayer(i + 1, idx));
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export function makeTeam(n: number, playerIds: string[], overrides: Partial<PoolTeam> = {}): PoolTeam {
  return {
    id: `t${n}`,
    name: `Team ${n}`,
    playerIds,
    matchupId: `m${n}`,
    ...overrides,
  };
}

export interface GameOpts extends Partial<PoolGame> {
  /** Handicap indexes; one player per entry. Default: four players 0/6/12/18. */
  indexes?: number[];
  /** Split players into N teams of 4 (classic pool). Default: one team. */
  teamCount?: number;
}

// Build a PoolGame with sane defaults; override any field.
//
// Defaults chosen so the common case needs no arguments: one foursome, 18 holes,
// slope-113 course (course handicap == index), full handicap, pot mode.
export function makeGame(opts: GameOpts = {}): PoolGame {
  const { indexes = [0, 6, 12, 18], teamCount, ...rest } = opts;
  const players = rest.players ?? makePlayers(indexes);

  let teams = rest.teams;
  if (!teams) {
    if (teamCount && teamCount > 1) {
      const per = Math.ceil(players.length / teamCount);
      teams = Array.from({ length: teamCount }, (_, i) =>
        makeTeam(i + 1, players.slice(i * per, (i + 1) * per).map((p) => p.id)),
      );
    } else {
      teams = [makeTeam(1, players.map((p) => p.id))];
    }
  }

  return {
    id: 'game-1',
    name: 'Test Game',
    createdAt: '2026-08-10T12:00:00.000Z',
    course: makeCourse(),
    ballSelection: '1-net-1-gross',
    moneyMode: 'pot',
    entryPerPlayer: 20,
    handicapAllowance: 100,
    handicapBasis: 'course',
    strokeMethod: 'full',
    potSplit: { front: 0.25, back: 0.25, overall: 0.25, junk: 0.25 },
    positionSplit: [100],
    junkValues: { ...DEFAULT_JUNK_VALUES },
    ctpWinners: {},
    status: 'active',
    ...rest,
    // Last word: `players`/`teams` are derived from `indexes`/`teamCount` above
    // (or taken from rest), so they must not be re-overwritten by the spread.
    players,
    teams,
  };
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

// Score rows for one player. `perHole` may be:
//   - a number      → that gross on every hole played
//   - an array      → gross per hole, aligned to holeNumbers (null/undefined skips)
export function scoresFor(
  playerId: string,
  perHole: number | (number | null | undefined)[],
  holeNumbers: number[] = Array.from({ length: 18 }, (_, i) => i + 1),
): GameScore[] {
  const out: GameScore[] = [];
  holeNumbers.forEach((hole, i) => {
    const gross = typeof perHole === 'number' ? perHole : perHole[i];
    if (gross == null) return;
    out.push({ playerId, hole, grossScore: gross });
  });
  return out;
}

// "Everyone shot par" — the neutral baseline. Deviations from it are what a test
// is usually about, so this keeps the noise out.
export function parScores(
  playerIds: string[],
  holeNumbers: number[] = Array.from({ length: 18 }, (_, i) => i + 1),
): GameScore[] {
  return playerIds.flatMap((pid) =>
    holeNumbers.map((hole) => ({ playerId: pid, hole, grossScore: TEST_PARS[hole - 1] })),
  );
}

// Wrap rows into the matchupId-keyed map that computeGameResult/computePoolResult
// expect. Single-team games use 'm1'.
export function scoreMap(...entries: [string, GameScore[]][]): Map<string, GameScore[]> {
  return new Map(entries);
}

export function singleMatchup(scores: GameScore[], matchupId = 'm1'): Map<string, GameScore[]> {
  return new Map([[matchupId, scores]]);
}

// The hole numbers a game actually plays — handy for building aligned score arrays.
export function frontNine(): number[] { return [1, 2, 3, 4, 5, 6, 7, 8, 9]; }
export function backNine(): number[] { return [10, 11, 12, 13, 14, 15, 16, 17, 18]; }
export function allEighteen(): number[] { return Array.from({ length: 18 }, (_, i) => i + 1); }
