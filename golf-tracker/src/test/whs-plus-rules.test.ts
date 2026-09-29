// F-102 (§5.bw 6): plus handicaps pinned to the Rules of Handicapping, not to our own engine.
// Craig 2026-09-28: "We need to follow the exact usga ghin precedent here." Every expected value
// below is quoted from the USGA Rules of Handicapping (2020 and 2024 editions), so these goldens
// are an independent oracle (§5.z). A plus handicap is stored NEGATIVE (+4 → −4) and only shown
// with a "+"; that representation is what these tests exercise.
//
// Sources: 2024 Rules of Handicapping (USGA PDF), Rule 3.2 Note 2, Rule 5.1c, Rule 6.2,
// Appendix C (C/3 worked examples), Appendix E.

import { describe, expect, it } from 'vitest';
import { strokesOnHole } from '@/lib/strokes';
import { buildHcapMap } from '@/lib/pool-game';
import { buildGameModeContext } from '@/lib/game-modes/context';
import { getPlayerStrokesForHole } from '@/lib/live-scoring';
import { formatHandicapIndex, parseGhinIndex } from '@/lib/game-state';
import type { RoundMatchup, Tournament, TournamentRound } from '@/lib/tournament-state';
import { allEighteen, makeCourse, makeGame, makePlayer, singleMatchup } from './fixtures';

// fixtures: Course Handicap == Handicap Index and stroke index == hole number.
const holesGivenBack = (strokes: number[]) => strokes.map((s, i) => (s < 0 ? i + 1 : 0)).filter(Boolean);

describe('WHS: which holes a plus handicap gives back on', () => {
  it('Rule 3.2 Note 2: "+3 … will give strokes back … at holes with stroke index 18, 17 and 16"', () => {
    const s = allEighteen().map((h) => strokesOnHole(-3, h, 18));
    expect(holesGivenBack(s)).toEqual([16, 17, 18]);
    expect(s.reduce((a, b) => a + b, 0)).toBe(-3);
  });

  it('Appendix E: on nine holes, give-back starts at stroke index 9', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => strokesOnHole(-2, h, 9));
    expect(holesGivenBack(s)).toEqual([8, 9]);
  });
});

describe('WHS: rounding a plus handicap', () => {
  // Rule 6.2: "rounded to the nearest whole number, with .5 rounded upwards". For a negative
  // value the Rules say which way "up" is: Rule 5.1c "rounding is made upward towards 0", and
  // Appendix C "a player with a plus Playing Handicap moves up towards zero including rounding".
  // So +2.5 plays as +2, while 2.5 plays as 3. JS Math.round does exactly that.
  it('.5 rounds toward zero on the plus side: +2.5 gives 2 back, 2.5 receives 3', () => {
    expect(allEighteen().map((h) => strokesOnHole(-2.5, h, 18)).reduce((a, b) => a + b, 0)).toBe(-2);
    expect(allEighteen().map((h) => strokesOnHole(2.5, h, 18)).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('Appendix C/3: a +4 Course Handicap at 85% is a +3 Playing Handicap, given back on 16–18', () => {
    const game = makeGame({ strokeMethod: 'full', handicapAllowance: 85, indexes: [-4, 10] });
    const ctx = buildGameModeContext(game, singleMatchup([]));
    const s = ctx.holes.map((h) => ctx.strokesOnHole('p1', h));
    expect(holesGivenBack(s)).toEqual([16, 17, 18]);
  });
});

describe('WHS Appendix C/3: off the low with a plus player (90%)', () => {
  // "Course Handicaps of +4, 16, 7 and 26 … Playing Handicaps 0, 18, 10 and 27 … player B
  // receives 18 strokes (90% of the difference in Course Handicaps from Player A)". The plus
  // player's handicap counts in the difference: 16 − (−4) = 20, × 90% = 18.
  const indexes = [-4, 16, 7, 26];
  const expected = [0, 18, 10, 27];

  it('pool engine', () => {
    const game = makeGame({ strokeMethod: 'off-the-low', handicapAllowance: 90, indexes });
    const map = buildHcapMap(game);
    expect(game.players.map((p) => map.get(p.id))).toEqual(expected);
  });

  it('tournament engine (live-scoring)', () => {
    const players = indexes.map((idx, i) => makePlayer(i + 1, idx));
    const matchup = { id: 'mu1', gameId: 'g1', teamAPlayerIds: ['p1', 'p2'], teamBPlayerIds: ['p3', 'p4'] } as unknown as RoundMatchup;
    const round = {
      id: 'r1', name: 'R1', dayLabel: 'Day 1', formatId: 'singles', teamMode: 'individual',
      course: makeCourse(), holesPlaying: '18', groupingMode: 'cross-team', scoringMethod: 'match-play',
      pointsForWin: 1, pointsForTie: 0.5, pointsForLoss: 0, handicapAllowance: 90, strokeMethod: 'off-the-low',
      handicapBasis: 'course', defaultTeeId: null, bonuses: [], matchups: [matchup], status: 'in-progress', order: 0,
    } as unknown as TournamentRound;
    const tournament = { players } as unknown as Tournament;
    const total = (pid: string) => allEighteen()
      .map((h) => getPlayerStrokesForHole(pid, h, h, matchup, round, tournament))
      .reduce((a, b) => a + b, 0);
    expect(players.map((p) => total(p.id))).toEqual(expected);
  });
});

describe('WHS Rule 5.2c: a plus index is written "+", stored negative, and survives a round trip', () => {
  // Craig 2026-09-28: −2 internally is the safeguard; "+" is only how it's written. Every value
  // shown through formatHandicapIndex must read back through parseGhinIndex to the same number,
  // so an edit box pre-filled "+2.1" can never save 2.1.
  it('format → parse is the identity for plus, scratch and positive indexes', () => {
    for (let tenths = -80; tenths <= 540; tenths++) {
      const idx = tenths / 10;
      expect(parseGhinIndex(formatHandicapIndex(idx))).toBe(idx === 0 ? 0 : idx);
    }
  });

  it('"+2.1" is −2.1 and shows as "+2.1"; a hand-typed "-2.1" is taken as the same plus index', () => {
    expect(parseGhinIndex('+2.1')).toBe(-2.1);
    expect(formatHandicapIndex(-2.1)).toBe('+2.1');
    expect(parseGhinIndex('-2.1')).toBe(-2.1);
  });
});
