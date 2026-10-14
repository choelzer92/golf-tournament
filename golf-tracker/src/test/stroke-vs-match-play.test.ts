// Beta #6 (§5.ce): stroke play vs match play handicap strokes — a CHARACTERIZATION, not a fix.
// Craig 2026-10-01: "stroke and match play are calculated very slightly differently, and very
// occasionally can produce different stroke totals." Findings and options:
// .claude/plans/stroke-vs-match-play.md. No math changed; this pins what the engine does TODAY
// and enumerates where the candidate rules disagree, so any later change is a visible diff.
//
// The three rules compared (pct = allowance / 100; CH = Course Handicap):
//   strokePlay(ch)          = round(ch × pct)                        Rule 6.2, each player in full
//   roundEach(ch, low)      = round(ch × pct) − round(low × pct)      Appendix C (2020 reading):
//                                                                       Playing Handicaps, then off the low
//   diffFirst(ch, low)      = round((round(ch) − round(low)) × pct)    2024 team match play reading (F-102 h):
//                                                                       the allowance on the CH DIFFERENCE
// Our engine: 'full' = strokePlay, 'off-the-low' = roundEach (pool buildHcapMap and the
// tournament engine alike). diffFirst is NOT implemented anywhere (§5.bx 4: not adopted).
//
// fixtures: Course Handicap == Handicap Index (unrounded) and stroke index == hole number.

import { describe, expect, it } from 'vitest';
import { buildHcapMap } from '@/lib/pool-game';
import { getMoneyStrokesOnHole } from '@/lib/money-games';
import { getPlayerStrokesForHole } from '@/lib/live-scoring';
import type { RoundMatchup, Tournament, TournamentRound } from '@/lib/tournament-state';
import { allEighteen, makeCourse, makeGame, makePlayer } from './fixtures';

const r = Math.round; // round-half-up; a plus half goes toward zero (Rule 5.1c / Appendix C), §5.bx

const strokePlay = (ch: number, pct: number) => r(ch * (pct / 100));
const roundEach = (ch: number, low: number, pct: number) => strokePlay(ch, pct) - strokePlay(low, pct);
const diffFirst = (ch: number, low: number, pct: number) => r((r(ch) - r(low)) * (pct / 100));

/** Engine playing handicaps (whole strokes) for a field of Course Handicaps. */
function engine(chs: number[], pct: number, method: 'full' | 'off-the-low'): number[] {
  const game = makeGame({ indexes: chs, handicapAllowance: pct, strokeMethod: method });
  const map = buildHcapMap(game);
  return game.players.map((p) => r(map.get(p.id)!));
}

/** Tournament engine (live-scoring) total strokes per player, one matchup, off the low. */
function tournamentTotals(chs: number[], pct: number): number[] {
  const players = chs.map((ch, i) => makePlayer(i + 1, ch));
  const ids = players.map((p) => p.id);
  const half = Math.ceil(ids.length / 2);
  const matchup = { id: 'mu1', gameId: 'g1', teamAPlayerIds: ids.slice(0, half), teamBPlayerIds: ids.slice(half) } as unknown as RoundMatchup;
  const round = {
    id: 'r1', name: 'R1', dayLabel: 'Day 1', formatId: 'singles', teamMode: 'individual',
    course: makeCourse(), holesPlaying: '18', groupingMode: 'cross-team', scoringMethod: 'match-play',
    pointsForWin: 1, pointsForTie: 0.5, pointsForLoss: 0, handicapAllowance: pct, strokeMethod: 'off-the-low',
    handicapBasis: 'course', defaultTeeId: null, bonuses: [], matchups: [matchup], status: 'in-progress', order: 0,
  } as unknown as TournamentRound;
  const t = { players } as unknown as Tournament;
  return ids.map((pid) => allEighteen().map((h) => getPlayerStrokesForHole(pid, h, h, matchup, round, t)).reduce((a, b) => a + b, 0));
}

const PCTS = [85, 90, 95, 100];
// Integer Course Handicaps, plus players included (−5 = "+5"), as GHIN displays them.
const LOWS = Array.from({ length: 42 }, (_, i) => i - 5);   // −5 … 36
const HIGHS = Array.from({ length: 46 }, (_, i) => i - 5);  // −5 … 40
const intPairs = LOWS.flatMap((a) => HIGHS.filter((b) => b >= a).map((b) => [a, b] as const));
// Unrounded Course Handicaps (what the engine actually holds), fractions that straddle .5.
const FRACS = [-2.5, -1.6, 0.4, 3.6, 4.5, 5.5, 9.4, 10.6, 12.5, 15.4, 18.5, 22.6, 27.5, 33.4];
const fracPairs = FRACS.flatMap((a) => FRACS.filter((b) => b >= a).map((b) => [a, b] as const));

describe('our engine today (characterization)', () => {
  it("'full' gives every player round(CH × allowance) — stroke play, Rule 6.2", () => {
    for (const pct of PCTS) {
      for (const [a, b] of [...intPairs, ...fracPairs]) {
        expect(engine([a, b], pct, 'full')).toEqual([strokePlay(a, pct), strokePlay(b, pct)]);
      }
    }
  });

  it("'off-the-low' = round each Playing Handicap, THEN subtract the low (2 players)", () => {
    for (const pct of PCTS) {
      for (const [a, b] of [...intPairs, ...fracPairs]) {
        expect(engine([a, b], pct, 'off-the-low')).toEqual([0, roundEach(b, a, pct)]);
      }
    }
  });

  it('so in our engine stroke play and match play ALWAYS give the same relative stroke total', () => {
    // B's edge over A: full (B − A) == off-the-low (B − A), every allowance, every pair.
    for (const pct of PCTS) {
      for (const [a, b] of [...intPairs, ...fracPairs]) {
        const [fa, fb] = engine([a, b], pct, 'full');
        const [la, lb] = engine([a, b], pct, 'off-the-low');
        expect(fb - fa).toBe(lb - la);
      }
    }
  });

  it('the tournament engine agrees with the pool off the low (four-ball goldens)', () => {
    for (const [chs, pct] of [[[3, 8, 14, 19], 90], [[5, 16], 90], [[-4, 16, 7, 26], 90], [[-5, 6], 95]] as const) {
      expect(tournamentTotals([...chs], pct)).toEqual(engine([...chs], pct, 'off-the-low'));
    }
  });
});

describe('where roundEach (ours) and diffFirst (2024 team-match reading) disagree', () => {
  const disagreements = (pct: number) => intPairs.filter(([a, b]) => roundEach(b, a, pct) !== diffFirst(b, a, pct));

  it('never at 100% with whole Course Handicaps (singles match play: the two readings coincide)', () => {
    expect(disagreements(100)).toHaveLength(0);
  });

  it('about a quarter of integer pairs at 85% / 90% / 95%, always by exactly one stroke', () => {
    expect(intPairs).toHaveLength(1071);
    expect(disagreements(85)).toHaveLength(271);
    expect(disagreements(90)).toHaveLength(275);
    expect(disagreements(95)).toHaveLength(240);
    for (const pct of [85, 90, 95]) {
      for (const [a, b] of disagreements(pct)) expect(Math.abs(roundEach(b, a, pct) - diffFirst(b, a, pct))).toBe(1);
    }
  });

  it('no systematic bias: either reading can be the one giving the extra stroke', () => {
    // [diffFirst gives one MORE than ours, diffFirst gives one FEWER] per allowance.
    const split = (pct: number) => {
      const s = disagreements(pct).map(([a, b]) => Math.sign(diffFirst(b, a, pct) - roundEach(b, a, pct)));
      return [s.filter((x) => x > 0).length, s.filter((x) => x < 0).length];
    };
    expect(split(85)).toEqual([166, 105]);
    expect(split(90)).toEqual([175, 100]);
    expect(split(95)).toEqual([165, 75]);
  });

  it('with UNROUNDED CHs even 100% can disagree if the difference is taken first (F-102 g, already settled)', () => {
    // round(15.4) − round(4.5) = 10 (ours, the Rules) vs round(15.4 − 4.5) = 11.
    expect(engine([4.5, 15.4], 100, 'off-the-low')).toEqual([0, 10]);
    expect(r(15.4 - 4.5)).toBe(11);
  });
});

describe('goldens (worked examples in the plan doc)', () => {
  it('G1 CH 5 v 16, four-ball 90%: stroke play 5 & 14; ours off the low 9; diffFirst 10', () => {
    expect(engine([5, 16], 90, 'full')).toEqual([5, 14]);
    expect(engine([5, 16], 90, 'off-the-low')).toEqual([0, 9]);
    expect(diffFirst(16, 5, 90)).toBe(10);
  });

  it('G2 CH 10 v 13 at 85%: stroke play 9 & 11; ours 2; diffFirst 3', () => {
    expect(engine([10, 13], 85, 'full')).toEqual([9, 11]);
    expect(engine([10, 13], 85, 'off-the-low')).toEqual([0, 2]);
    expect(diffFirst(13, 10, 85)).toBe(3);
  });

  it('G3 four-ball CH 3, 8, 14, 19 at 90%: ours 0/4/10/14; diffFirst 0/5/10/14', () => {
    expect(engine([3, 8, 14, 19], 90, 'off-the-low')).toEqual([0, 4, 10, 14]);
    expect([3, 8, 14, 19].map((ch) => diffFirst(ch, 3, 90))).toEqual([0, 5, 10, 14]);
  });

  it('G4 Appendix C/3 +4, 16, 7, 26 at 90%: both readings give 0/18/10/27 (the example cannot tell them apart)', () => {
    expect(engine([-4, 16, 7, 26], 90, 'off-the-low')).toEqual([0, 18, 10, 27]);
    expect([-4, 16, 7, 26].map((ch) => diffFirst(ch, -4, 90))).toEqual([0, 18, 10, 27]);
  });

  it('G5 CH +5 v 6 at 95%: ours 11, diffFirst 10', () => {
    expect(engine([-5, 6], 95, 'off-the-low')).toEqual([0, 11]);
    expect(diffFirst(6, -5, 95)).toBe(10);
  });
});

describe('same total, different HOLES: full handicap vs off the low', () => {
  // Relative strokes per hole (B's strokes − A's), stroke index == hole number.
  const relative = (chs: [number, number], method: 'full' | 'off-the-low') => {
    const [ha, hb] = engine(chs, 100, method);
    return allEighteen().map((si) => getMoneyStrokesOnHole(hb, si, 18) - getMoneyStrokesOnHole(ha, si, 18));
  };
  const holesWith = (v: number[]) => v.map((x, i) => (x > 0 ? i + 1 : 0)).filter(Boolean);

  it('G6 CH 5 v 15: full gives B the edge on SI 6–15; off the low on SI 1–10 (10 either way)', () => {
    expect(holesWith(relative([5, 15], 'full'))).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(holesWith(relative([5, 15], 'off-the-low'))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('G7 CH +2 v 10: full = SI 1–10 plus the give-backs on 17–18; off the low = SI 1–12', () => {
    expect(holesWith(relative([-2, 10], 'full'))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17, 18]);
    expect(holesWith(relative([-2, 10], 'off-the-low'))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});
