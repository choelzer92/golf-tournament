// F-098 (§5.bv): one stroke allocator for both engines, and plus handicaps that work.
// Craig 2026-09-28: off-the-low sets the plus player to 0 and everyone else gains strokes; on a
// full handicap a player better than scratch GIVES strokes back on the EASIEST holes — the
// reverse of receiving them on the hardest.

import { describe, expect, it } from 'vitest';
import { strokesOnHole } from '@/lib/strokes';
import { getMoneyStrokesOnHole } from '@/lib/money-games';
import { buildHcapMap } from '@/lib/pool-game';
import { GAME_MODES, getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import { computeHoleWinners, getPlayerStrokesForHole } from '@/lib/live-scoring';
import type { RoundMatchup, Tournament, TournamentRound } from '@/lib/tournament-state';
import { allEighteen, makeCourse, makeGame, makePlayer, scoresFor, singleMatchup, TEST_PARS } from './fixtures';

// The allocator exactly as it stood before F-098 (money-games.ts). Every non-plus handicap must
// still get precisely this — the golden for the half of the table that must not move.
function legacy(playingHcap: number, holeHandicap: number, numHoles: number): number {
  const rounded = Math.round(playingHcap);
  if (rounded <= 0) return 0;
  if (rounded >= numHoles * 2) return 2;
  if (rounded > numHoles) return holeHandicap <= rounded - numHoles ? 2 : 1;
  return holeHandicap <= rounded ? 1 : 0;
}

const HCAPS = Array.from({ length: 4 * 45 }, (_, i) => i / 4 - 0.25);   // −0.25 … 44.5, fractions too
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('strokesOnHole: the non-plus half is unchanged', () => {
  it('matches the pre-F-098 allocator for every handicap ≥ −0.25, hole and hole count', () => {
    for (const numHoles of [9, 18]) {
      for (const h of HCAPS) {
        // Past 2 strokes a hole the legacy allocator capped (F-108, §5.ct); that range is pinned by the
        // F-108 cases below. Everything up to the cap is unchanged.
        if (Math.round(h) > 2 * numHoles) continue;
        for (const si of range(numHoles)) {
          expect(strokesOnHole(h, si, numHoles), `hcap ${h} SI ${si}/${numHoles}`).toBe(legacy(h, si, numHoles));
          expect(getMoneyStrokesOnHole(h, si, numHoles)).toBe(legacy(h, si, numHoles));
        }
      }
    }
  });
});

describe('strokesOnHole: a plus handicap gives back on the easiest holes', () => {
  const givesOn = (h: number, numHoles: number) =>
    range(numHoles).filter((si) => strokesOnHole(h, si, numHoles) !== 0).map((si) => [si, strokesOnHole(h, si, numHoles)]);

  it('+1 gives one back on stroke index 18; +2 on 17 and 18', () => {
    expect(givesOn(-1, 18)).toEqual([[18, -1]]);
    expect(givesOn(-2, 18)).toEqual([[17, -1], [18, -1]]);
  });

  it('rounds like everyone else: +0.4 plays scratch, +0.5 gives one back', () => {
    expect(givesOn(-0.4, 18)).toEqual([]);
    expect(givesOn(-0.6, 18)).toEqual([[18, -1]]);
  });

  it('on the USGA 9-hole basis (index re-ranked 1–9), +1 gives back on index 9', () => {
    expect(givesOn(-1, 9)).toEqual([[9, -1]]);
  });

  it('past the hole count, the second give-back also starts at the easiest hole', () => {
    const h = -20;   // 18 + 2
    expect(strokesOnHole(h, 18, 18)).toBe(-2);
    expect(strokesOnHole(h, 17, 18)).toBe(-2);
    expect(strokesOnHole(h, 16, 18)).toBe(-1);
    expect(strokesOnHole(h, 1, 18)).toBe(-1);
  });

  it('is the exact mirror of receiving: the strokes over a round add back to the handicap', () => {
    for (const numHoles of [9, 18]) {
      for (let h = -2 * numHoles; h <= 2 * numHoles; h++) {
        const total = range(numHoles).reduce((s, si) => s + strokesOnHole(h, si, numHoles), 0);
        expect(total, `hcap ${h} over ${numHoles}`).toBe(h);
        for (const si of range(numHoles)) {
          expect(strokesOnHole(-h, si, numHoles)).toBe(-strokesOnHole(h, numHoles + 1 - si, numHoles) || 0);
        }
      }
    }
  });
});

describe('F-098 in the pool engine', () => {
  // fixtures: Course Handicap == Handicap Index and stroke index == hole number.
  it('full handicap: a +2 player adds a stroke on holes 17 and 18 and nowhere else', () => {
    const game = makeGame({ strokeMethod: 'full', indexes: [-2, 10] });
    const ctx = buildGameModeContext(game, singleMatchup([]));
    const holes = ctx.holes.filter((h) => allEighteen().includes(h.number));
    const plus = holes.map((h) => ctx.strokesOnHole('p1', h));
    expect(plus.slice(0, 16).every((s) => s === 0)).toBe(true);
    expect(plus.slice(16)).toEqual([-1, -1]);
    // The 10 receives on the ten hardest, as always.
    expect(holes.map((h) => ctx.strokesOnHole('p2', h)).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('off-the-low: the plus player plays off 0 and everyone else gains the difference', () => {
    const game = makeGame({ strokeMethod: 'off-the-low', indexes: [-2, 10] });
    expect(buildHcapMap(game).get('p1')).toBe(0);
    expect(buildHcapMap(game).get('p2')).toBe(12);
    const ctx = buildGameModeContext(game, singleMatchup([]));
    expect(ctx.holes.every((h) => ctx.strokesOnHole('p1', h) === 0)).toBe(true);
  });

  it('every mode stays zero-sum with a plus player in the field, full handicap', () => {
    for (const m of GAME_MODES) {
      const indexes = [-3, 5, 12, 20, 8, 15, 1, 25].slice(0, Math.max(m.playersMin, Math.min(4, m.playersMax)));
      const game = makeGame({ gameMode: m.id, strokeMethod: 'full', indexes });
      const scores = game.players.flatMap((p, i) => scoresFor(p.id, TEST_PARS.map((par, h) => par + ((i + h) % 3 === 0 ? 1 : 0))));
      const mode = getGameMode(m.id)!;
      const r = mode.compute(buildGameModeContext(game, singleMatchup(scores)));
      const total = r.standings.reduce((s, x) => s + x.moneyNet, 0);
      expect(total, `${m.id} zero-sum with a plus player`).toBeCloseTo(0, 6);
    }
  });
});

describe('F-098 in the tournament engine (live-scoring)', () => {
  const players = [makePlayer(1, -2), makePlayer(2, 10)];
  const matchup = { id: 'mu1', gameId: 'g1', teamAPlayerIds: ['p1'], teamBPlayerIds: ['p2'] } as unknown as RoundMatchup;
  const roundOf = (strokeMethod: 'full' | 'off-the-low') => ({
    id: 'r1', name: 'R1', dayLabel: 'Day 1', formatId: 'singles', teamMode: 'individual',
    course: makeCourse(), holesPlaying: '18', groupingMode: 'cross-team', scoringMethod: 'match-play',
    pointsForWin: 1, pointsForTie: 0.5, pointsForLoss: 0, handicapAllowance: 100, strokeMethod,
    handicapBasis: 'course', defaultTeeId: null, bonuses: [], matchups: [matchup], status: 'in-progress', order: 0,
  }) as unknown as TournamentRound;
  const tournament = { players } as unknown as Tournament;
  const strokes = (pid: string, method: 'full' | 'off-the-low') =>
    allEighteen().map((h) => getPlayerStrokesForHole(pid, h, h, matchup, roundOf(method), tournament));

  it('full handicap: +2 gives back on 17 and 18 (it used to be 1 and 2, the hardest)', () => {
    const s = strokes('p1', 'full');
    expect(s.slice(0, 16).every((x) => x === 0)).toBe(true);
    expect(s.slice(16)).toEqual([-1, -1]);
    expect(strokes('p2', 'full').reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('off-the-low: the plus player plays off 0 and the 10 gets 12', () => {
    expect(strokes('p1', 'off-the-low').every((x) => x === 0)).toBe(true);
    expect(strokes('p2', 'off-the-low').reduce((a, b) => a + b, 0)).toBe(12);
  });
});

// F-102 a: a split round re-ranks each nine's stroke index 1–9 and halves the team handicap per
// nine, so the team allocator must count 9 holes, as the player path already does. Counting 18,
// a plus team's give-back rank (19 − SI) never came round and it played off scratch.
describe('F-102 a: a plus scramble team gives back on each nine of a split round', () => {
  const players = [makePlayer(1, -8), makePlayer(2, -8), makePlayer(3, 0), makePlayer(4, 0)];
  const matchup = { id: 'mu1', gameId: 'g1', teamAPlayerIds: ['p1', 'p2'], teamBPlayerIds: ['p3', 'p4'] } as unknown as RoundMatchup;
  const round = {
    id: 'r1', name: 'R1', dayLabel: 'Day 1', formatId: 'scramble', teamMode: 'scramble',
    course: makeCourse(), holesPlaying: '18', groupingMode: 'cross-team', scoringMethod: 'match-play',
    pointsForWin: 1, pointsForTie: 0.5, pointsForLoss: 0, strokeMethod: 'full',
    handicapBasis: 'index', defaultTeeId: null, bonuses: [], matchups: [matchup], status: 'in-progress', order: 0,
    splitFormat: {
      formatId: 'scramble', teamMode: 'scramble', scoringMethod: 'match-play',
      pointsForWin: 1, pointsForTie: 0.5, pointsForLoss: 0, handicapAllowance: 100, strokeMethod: 'full',
    },
  } as unknown as TournamentRound;
  const tournament = { players } as unknown as Tournament;
  const scores = players.flatMap((p) => scoresFor(p.id, 4));

  it('−8/−8 halve to −4 a nine; 35% + 15% = −2, given back on the two easiest holes of EACH nine', () => {
    const winners = computeHoleWinners(scores, matchup, round, tournament);
    const bWins = allEighteen().filter((h) => winners.get(h) === 'B');
    expect(bWins).toEqual([8, 9, 17, 18]);
    expect(allEighteen().filter((h) => winners.get(h) === 'tie')).toHaveLength(14);
  });

  it('a positive team is unchanged: +8/+8 receives on the two hardest of each nine', () => {
    const pos = { players: [makePlayer(1, 8), makePlayer(2, 8), makePlayer(3, 0), makePlayer(4, 0)] } as unknown as Tournament;
    const winners = computeHoleWinners(scores, matchup, round, pos);
    expect(allEighteen().filter((h) => winners.get(h) === 'A')).toEqual([1, 2, 10, 11]);
  });
});

// F-108 (§5.ct, Craig 2026-10-12): the FULL handicap is allocated — no cap at 2 strokes a hole. A
// playing handicap n over N holes gives floor(n / N) on every hole and one more on the hardest
// n mod N (stroke index 1 first); a plus handicap mirrors it from the easiest. Written before the
// fix (§5.z): every case past 2 × N failed on the capped allocator.
describe('F-108 — no 2-a-hole cap', () => {
  const holes18 = Array.from({ length: 18 }, (_, i) => i + 1);
  const holes9 = holes18.slice(0, 9);
  const card = (n: number, holes: number[]) => holes.map((si) => strokesOnHole(n, si, holes.length));
  const total = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

  it('CH 40 on 18: 3 strokes on SI 1–4, 2 on the rest — 40 in all', () => {
    const c = card(40, holes18);
    expect(c).toEqual(holes18.map((si) => (si <= 4 ? 3 : 2)));
    expect(total(c)).toBe(40);
  });

  it('CH 54 on 18: 3 on every hole; CH 60: 4 on SI 1–6, 3 elsewhere', () => {
    expect(card(54, holes18)).toEqual(holes18.map(() => 3));
    expect(card(60, holes18)).toEqual(holes18.map((si) => (si <= 6 ? 4 : 3)));
  });

  it('a nine: CH 20 gets 3 on its two hardest, 2 on the other seven', () => {
    expect(card(20, holes9)).toEqual(holes9.map((si) => (si <= 2 ? 3 : 2)));
  });

  it('the total always equals the handicap, every value 0–72 on 18 and 0–36 on 9', () => {
    for (let n = 0; n <= 72; n++) expect(total(card(n, holes18)), `18 / ${n}`).toBe(n);
    for (let n = 0; n <= 36; n++) expect(total(card(n, holes9)), `9 / ${n}`).toBe(n);
  });

  it('a plus handicap past the cap mirrors it from the easiest hole', () => {
    const c = card(-40, holes18);
    expect(c).toEqual(holes18.map((si) => (si >= 15 ? -3 : -2)));
    expect(total(c)).toBe(-40);
  });

  it('COMPAT: up to 36 on 18 (18 on 9) nothing moves — the old allocator, case by case', () => {
    const old = (h: number, si: number, n: number) => {
      const r = Math.round(h); if (r === 0) return 0;
      const a = Math.abs(r); const rank = r > 0 ? si : n + 1 - si; const sign = r > 0 ? 1 : -1;
      if (a >= n * 2) return 2 * sign;
      if (a > n) return (rank <= a - n ? 2 : 1) * sign;
      return rank <= a ? sign : 0;
    };
    for (const holes of [holes18, holes9]) {
      for (let n = -2 * holes.length; n <= 2 * holes.length; n++) {
        for (const si of holes) expect(strokesOnHole(n, si, holes.length)).toBe(old(n, si, holes.length));
      }
    }
  });
});
