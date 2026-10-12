// S2 Q3 (§5.cs, Craig 2026-10-12: "this should be fool proof and exact. we need to fix this"):
// the tournament MONEY LEDGER must give the same strokes as the round's SCORING, on every round
// shape and both handicap bases. It used the 18-hole course handicap on nines and split rounds —
// about double the strokes (a CH 10 got 10 strokes over 9 holes, and 18 on a split round).
//
// Fixture course: slope 113, rating == par, so an 18-hole CH == index and a nine's CH == index / 2
// (9-hole index, Front/Back ratings 36 / 113). SI == hole number. Full handicap, 100%, so scoring's
// strokes and the ledger's (its own allowance, never off the low) must agree hole for hole.
//
// Written BEFORE the fix (§5.z): the nine and split cases fail on the old ledger.

import { describe, expect, it, vi } from 'vitest';
import type { GameScore, Player } from '@/lib/game-state';
import type { RoundMatchup, Tournament, TournamentRound } from '@/lib/tournament-state';
import { makeCourse, makePlayer, TEST_PARS } from './fixtures';

const scores = new Map<string, GameScore[]>();
vi.mock('@/lib/tournament-state', async (orig) => ({
  ...(await orig<typeof import('@/lib/tournament-state')>()),
  loadGameScores: (id: string) => scores.get(id) ?? null,
}));

const { computeRoundPlayerDetails } = await import('@/lib/money-games');
const { getPlayerStrokesForHole, getHoleDataForRound } = await import('@/lib/live-scoring');

type Shape = '18' | 'front9' | 'back9' | 'split';

function build(shape: Shape, basis: 'course' | 'index', indexes = [10, 20], perNine = false) {
  const players: Player[] = indexes.map((ix, i) => makePlayer(i + 1, ix));
  const course = makeCourse();
  const matchup: RoundMatchup = {
    id: 'm1', groupLabel: 'Group 1', playerIds: players.map((p) => p.id),
    teamAPlayerIds: [players[0].id], teamBPlayerIds: [players[1].id], gameId: null, result: null,
  };
  const round = {
    id: 'r1', name: 'Round 1', dayLabel: 'Day 1', formatId: 'best-ball', teamMode: 'best-ball',
    course, holesPlaying: shape === 'split' ? '18' : shape, groupingMode: 'cross-team', scoringMethod: 'match-play',
    pointsForWin: 1, pointsForTie: 0.5, pointsForLoss: 0,
    handicapAllowance: 100, strokeMethod: 'full', handicapBasis: basis, defaultTeeId: course.teeSets[0].id,
    bonuses: [], matchups: [matchup], status: 'in-progress',
    ...(shape === 'split' ? { splitFormat: {
      formatId: 'singles', teamMode: 'best-ball', scoringMethod: 'match-play',
      pointsForWin: 1, pointsForTie: 0.5, pointsForLoss: 0, handicapAllowance: 100, strokeMethod: 'full',
    } } : {}),
  } as unknown as TournamentRound;
  const tournament = {
    id: 't1', name: 'T', mode: 'team-event', players,
    teams: [{ id: 'A', name: 'A', playerIds: [players[0].id] }, { id: 'B', name: 'B', playerIds: [players[1].id] }],
    rounds: [round], status: 'active',
    ...(perNine ? { moneyGames: { splitRoundHandicap: 'per-nine' } } : {}),
  } as unknown as Tournament;
  // Score every hole of the round (a split round plays all 18).
  const holes = shape === 'split' ? getHoleDataForRound({ ...round, splitFormat: undefined } as TournamentRound) : getHoleDataForRound(round);
  scores.set('m1', players.flatMap((p) => holes.map((h) => ({ playerId: p.id, hole: h.number, grossScore: TEST_PARS[h.number - 1] }))));
  return { round, tournament, matchup, players, holes };
}

function ledgerStrokes(shape: Shape, basis: 'course' | 'index', indexes?: number[], perNine = false) {
  const b = build(shape, basis, indexes, perNine);
  const d = computeRoundPlayerDetails(b.round, b.tournament, 100)!;
  return { b, byPlayer: d.players.map((p) => p.holes.map((h) => h.strokes)) };
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);


describe('§5.cs Q3 — the ledger gives the strokes the round is scored on', () => {
  it('hand numbers: CH 10 gets 10 on 18 and 5 on a nine', () => {
    expect(sum(ledgerStrokes('18', 'course').byPlayer[0])).toBe(10);
    expect(sum(ledgerStrokes('front9', 'course').byPlayer[0])).toBe(5);
    expect(sum(ledgerStrokes('back9', 'course').byPlayer[0])).toBe(5);
  });

  // Craig 2026-10-12: a split round's money games are 18-hole bets by default — the 18-hole course
  // handicap on the CARD's stroke index (SI == hole here, so CH 10 → holes 1–10) — with per-nine
  // 9-hole ratings as a choice (5 on the front's top 5, 5 on the back's).
  it('split round, default: the 18-hole handicap on the card — CH 10 strokes holes 1–10', () => {
    const s18 = ledgerStrokes('split', 'course').byPlayer[0];
    expect(s18).toEqual(Array.from({ length: 18 }, (_, i) => (i < 10 ? 1 : 0)));
  });

  it('split round, per-nine chosen: 5 + 5 on each nine’s 9-hole rating', () => {
    const p9 = ledgerStrokes('split', 'course', undefined, true).byPlayer[0];
    expect([sum(p9.slice(0, 9)), sum(p9.slice(9))]).toEqual([5, 5]);
  });

  for (const basis of ['course', 'index'] as const) {
    for (const indexes of [[10, 20], [0, 26], [-2, 7.4]]) {
      it(`split / ${basis} / ${indexes.join(', ')}: default == the same players on a plain 18-hole round`, () => {
        expect(ledgerStrokes('split', basis, indexes).byPlayer).toEqual(ledgerStrokes('18', basis, indexes).byPlayer);
      });
      it(`split / ${basis} / ${indexes.join(', ')}: per-nine == scoring, hole for hole`, () => {
        const { b, byPlayer } = ledgerStrokes('split', basis, indexes, true);
        // Scoring plays each nine re-ranked 1–9 — the holes the per-nine ledger plays too.
        const nineHoles = getHoleDataForRound(b.round);
        b.players.forEach((p, i) => {
          const scoring = nineHoles.map((h) => getPlayerStrokesForHole(p.id, h.handicap, h.number, b.matchup, b.round, b.tournament));
          expect(byPlayer[i], `${p.id}`).toEqual(scoring);
        });
      });
    }
  }

  for (const shape of ['18', 'front9', 'back9'] as Shape[]) {
    for (const basis of ['course', 'index'] as const) {
      // 26 rather than 36: the allocator caps at 2 strokes a hole (F-108), which hid the bug at 36 on a nine.
      for (const indexes of [[10, 20], [0, 26], [-2, 7.4]]) {
        it(`${shape} / ${basis} / indexes ${indexes.join(', ')}: ledger == scoring, hole for hole`, () => {
          const { b, byPlayer } = ledgerStrokes(shape, basis, indexes);
          b.players.forEach((p, i) => {
            const scoring = b.holes.map((h) => getPlayerStrokesForHole(p.id, h.handicap, h.number, b.matchup, b.round, b.tournament));
            expect(byPlayer[i], `${p.id}`).toEqual(scoring);
          });
        });
      }
    }
  }
});
