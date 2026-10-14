// §5.dl: strokes off the low match the GHIN app in STROKE play and in MATCH play.
//
// Craig read these off the GHIN app on 2026-10-14, Spring Creek 3 Stars (CR 71.2, slope 141, par 72),
// a 6.8 and a 7.0 each against a 3.3 (`.claude/plans/stroke-vs-match-play.md` §7):
//
//   allowance   6.8: stroke / match   7.0: stroke / match
//   100%        5 / 4                 5 / 5
//   95%         4 / 4                 5 / 4
//   90%, 85%    4 / 4                 4 / 4
//   75%         4 / 3                 4 / 3
//
// Every cell fits one pair of rules, and no other: STROKE play rounds each Playing Handicap
// (Course Handicap × allowance), then subtracts the rounded low; MATCH play subtracts the unrounded
// low, then rounds once. These are the GHIN app's own numbers, an independent oracle (§5.z); 80% is
// the rule's prediction (3 / 3 and 3 / 4), not read off the app.
import { describe, expect, it } from 'vitest';
import { buildHcapMap, type PoolGame } from '@/lib/pool-game';
import { getPlayerStrokesForHole } from '@/lib/live-scoring';
import type { RoundMatchup, Tournament, TournamentRound } from '@/lib/tournament-state';
import { allEighteen, makeCourse, makeGame, makePlayer, makeTeam, makeTee } from './fixtures';

const THREE_STARS = makeCourse({
  teeSets: [makeTee({
    ratings: [
      { type: 'Total', courseRating: 71.2, slopeRating: 141 },
      { type: 'Front', courseRating: 35.5, slopeRating: 138 },
      { type: 'Back', courseRating: 35.7, slopeRating: 143 },
    ],
  })],
});

// [allowance, 6.8 stroke, 6.8 match, 7.0 stroke, 7.0 match]
const GHIN: [number, number, number, number, number][] = [
  [100, 5, 4, 5, 5],
  [95, 4, 4, 5, 4],
  [90, 4, 4, 4, 4],
  [85, 4, 4, 4, 4],
  [80, 3, 3, 3, 4],
  [75, 4, 3, 4, 3],
];

type Shape = (index: number, allowance: number) => PoolGame;

const stroke = (i: number) => (row: (typeof GHIN)[number]) => (i === 6.8 ? row[1] : row[3]);
const match = (i: number) => (row: (typeof GHIN)[number]) => (i === 6.8 ? row[2] : row[4]);

// Every game shape that plays a head-to-head match, and every one that doesn't.
const pool = (extra: Partial<PoolGame>): Shape => (index, allowance) => makeGame({
  strokeMethod: 'off-the-low', handicapAllowance: allowance, course: THREE_STARS,
  players: [makePlayer(1, index), makePlayer(2, 3.3)], ...extra,
});
const twoTeams = { teams: [makeTeam(1, ['p1']), makeTeam(2, ['p2'])] };
const sides = { sides: [{ id: 'a', playerIds: ['p1'] }, { id: 'b', playerIds: ['p2'] }] };
const team = (settings: Record<string, string | number | boolean>): Partial<PoolGame> => ({
  gameMode: 'team-2v2', ...sides,
  modeSettings: { format: 'best-ball', scoring: 'stroke', moneyModel: 'legs', junkEnabled: false, ...settings },
});

const MATCH_PLAY: [string, Shape][] = [
  ['classic 2-team match, hole by hole', pool({ ...twoTeams, moneyMode: 'match', matchConfig: { legDollars: { front: 5, back: 5, overall: 5 }, junkPerPoint: 0, scoring: 'holes' } })],
  ['team game, compare by match', pool(team({ result: 'match' }))],
  ['team game, the "result" default (match)', pool(team({}))],
];
const STROKE_PLAY: [string, Shape][] = [
  ['classic pool (pot)', pool({})],
  ['classic 2-team match, stroke play', pool({ ...twoTeams, moneyMode: 'match', matchConfig: { legDollars: { front: 5, back: 5, overall: 5 }, junkPerPoint: 0, scoring: 'stroke' } })],
  ['team game, compare by total', pool(team({ result: 'total' }))],
  ['skins (an individual game)', pool({ gameMode: 'skins', modeSettings: {} })],
];

describe('§5.dl: the GHIN app\'s strokes, every allowance, every pool shape', () => {
  for (const row of GHIN) {
    for (const index of [6.8, 7.0]) {
      for (const [name, shape] of MATCH_PLAY) {
        it(`${row[0]}% match play, ${index} v 3.3 gets ${match(index)(row)}: ${name}`, () => {
          const m = buildHcapMap(shape(index, row[0]));
          expect([m.get('p1'), m.get('p2')]).toEqual([match(index)(row), 0]);
        });
      }
      for (const [name, shape] of STROKE_PLAY) {
        it(`${row[0]}% stroke play, ${index} v 3.3 gets ${stroke(index)(row)}: ${name}`, () => {
          const m = buildHcapMap(shape(index, row[0]));
          expect([m.get('p1'), m.get('p2')]).toEqual([stroke(index)(row), 0]);
        });
      }
    }
  }
});

describe('§5.dl: a four-ball match takes the low of the four, unrounded', () => {
  // 6.8 / 7.0 v 3.3 / 10.0 on the same tees: Course Handicaps 7.685 / 7.935 / 3.318 / 11.678. At 75%
  // the Playing Handicaps are 5.764 / 5.951 / 2.489 / 8.758: match play subtracts 2.489 and rounds
  // (3.28 → 3, 3.46 → 3, 6.27 → 6); stroke play rounds each first (6, 6, 2, 9 → 4, 4, 7).
  // That 3.3's 2.489 rounding DOWN is what splits the two rules at 75%.
  const fourBall = (allowance: number, counting: string) => makeGame({
    gameMode: 'team-2v2', strokeMethod: 'off-the-low', handicapAllowance: allowance, course: THREE_STARS,
    players: [makePlayer(1, 6.8), makePlayer(2, 7.0), makePlayer(3, 3.3), makePlayer(4, 10.0)],
    teams: [makeTeam(1, ['p1', 'p2', 'p3', 'p4'])],
    sides: [{ id: 'x', playerIds: ['p1', 'p2'] }, { id: 'y', playerIds: ['p3', 'p4'] }],
    modeSettings: { format: 'best-ball', scoring: 'stroke', result: 'match', moneyModel: 'legs', junkEnabled: false, matchSize: 2, matchCounting: counting },
  });
  const ids = ['p1', 'p2', 'p3', 'p4'];
  const cases: [number, number[], number[]][] = [
    [100, [5, 5, 0, 9], [4, 5, 0, 8]],
    [90, [4, 4, 0, 8], [4, 4, 0, 8]],
    [75, [4, 4, 0, 7], [3, 3, 0, 6]],
  ];
  for (const [pct, strokePlay, matchPlay] of cases) {
    it(`${pct}%: match points / holes → ${matchPlay.join(' / ')}; net strokes → ${strokePlay.join(' / ')}`, () => {
      for (const counting of ['points', 'holes']) {
        const m = buildHcapMap(fourBall(pct, counting));
        expect(ids.map((id) => m.get(id))).toEqual(matchPlay);
      }
      const m = buildHcapMap(fourBall(pct, 'strokes'));
      expect(ids.map((id) => m.get(id))).toEqual(strokePlay);
    });
  }
});

describe('§5.dl: the tournament engine, match play v stroke play', () => {
  const total = (index: number, allowance: number, scoringMethod: 'match-play' | 'stroke-play') => {
    const players = [makePlayer(1, index), makePlayer(2, 3.3)];
    const matchup = { id: 'mu1', gameId: 'g1', teamAPlayerIds: ['p1'], teamBPlayerIds: ['p2'] } as unknown as RoundMatchup;
    const round = {
      id: 'r1', name: 'R1', dayLabel: 'Day 1', formatId: 'singles', teamMode: 'individual',
      course: THREE_STARS, holesPlaying: '18', groupingMode: 'cross-team', scoringMethod,
      pointsForWin: 1, pointsForTie: 0.5, pointsForLoss: 0, handicapAllowance: allowance, strokeMethod: 'off-the-low',
      handicapBasis: 'course', defaultTeeId: null, bonuses: [], matchups: [matchup], status: 'in-progress', order: 0,
    } as unknown as TournamentRound;
    return allEighteen()
      .map((h) => getPlayerStrokesForHole('p1', h, h, matchup, round, { players } as unknown as Tournament))
      .reduce((a, b) => a + b, 0);
  };
  for (const row of GHIN) {
    for (const index of [6.8, 7.0]) {
      it(`${row[0]}%, ${index} v 3.3: match play ${match(index)(row)}, stroke play ${stroke(index)(row)}`, () => {
        expect(total(index, row[0], 'match-play')).toBe(match(index)(row));
        expect(total(index, row[0], 'stroke-play')).toBe(stroke(index)(row));
      });
    }
  }
});
