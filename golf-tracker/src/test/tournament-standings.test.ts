// Event spine slice 1 (§5.bu): the tournament's points standings go N-way behind `teamsOf` /
// `computeStandingsN`, and today's `computeStandings` becomes a 2-team wrapper over it.
// GOLDENS FIRST (§5.z): the snapshot below was written from the pre-refactor `computeStandings`,
// so the wrapper has to reproduce it byte-for-byte.

import { describe, expect, it } from 'vitest';
import { computeStandingsN, teamsOf } from '@/lib/tournament-standings';
import { computeStandings, tournamentVisibleTo, type RoundBonus, type RoundMatchup, type Tournament, type TournamentRound } from '@/lib/tournament-state';

const A = 'team-a';
const B = 'team-b';

function matchup(id: string, a: number | null, b = 0): RoundMatchup {
  return {
    id, groupLabel: id, playerIds: [], teamAPlayerIds: [], teamBPlayerIds: [], gameId: null,
    result: a === null ? null : { winningTeamId: a > b ? A : b > a ? B : null, pointsTeamA: a, pointsTeamB: b, summary: '' },
  };
}

function bonus(id: string, points: number, scope: RoundBonus['scope'], result?: RoundBonus['result']): RoundBonus {
  return { id, type: 'custom', name: id, points, scope, ...(result ? { result } : {}) };
}

function round(id: string, matchups: RoundMatchup[], bonuses: RoundBonus[] | undefined = []): TournamentRound {
  return {
    id, name: id, dayLabel: '', formatId: 'best-ball', teamMode: 'best-ball' as TournamentRound['teamMode'], course: null,
    holesPlaying: '18', groupingMode: 'cross-team', scoringMethod: 'match-play', pointsForWin: 1, pointsForTie: 0.5,
    pointsForLoss: 0, handicapAllowance: 100, strokeMethod: 'full', handicapBasis: 'course', defaultTeeId: null,
    bonuses: bonuses as RoundBonus[], matchups, status: 'in-progress', order: 0,
  };
}

function tournament(rounds: TournamentRound[]): Tournament {
  return {
    id: 't', name: 't', mode: 'team-event', players: [], status: 'active', rounds,
    teams: [{ id: A, name: 'Aces', playerIds: [] }, { id: B, name: 'Bogeys', playerIds: [] }],
  };
}

// Every branch of the standings: matchup results (won, halved, not played), per-matchup bonus
// tallies (wins, ties, missing counts), per-round bonuses (A, B, tie by null, tie by absence,
// an id that is neither team, no result yet), a round without a bonuses array, and no rounds.
const CORPUS: Record<string, Tournament> = {
  'no rounds': tournament([]),
  'one round, matchups only': tournament([round('r1', [matchup('m1', 1), matchup('m2', 0, 1), matchup('m3', 0.5, 0.5), matchup('m4', null)])]),
  'ryder cup: per-matchup match winner': tournament([
    round('r1', [matchup('m1', 1), matchup('m2', 0, 1)], [bonus('mw', 1, 'per-matchup', { teamAWins: 2, teamBWins: 1, ties: 1 })]),
  ]),
  'per-matchup with missing tallies': tournament([
    round('r1', [], [bonus('mw', 2, 'per-matchup', { teamBWins: 3 }), bonus('mw2', 1, 'per-matchup', { teamAWins: 0, ties: 2 })]),
  ]),
  'per-round bonuses, every outcome': tournament([
    round('r1', [matchup('m1', 3, 1)], [
      bonus('toA', 2, 'per-tournament-round', { winningTeamId: A }),
      bonus('toB', 3, 'per-tournament-round', { winningTeamId: B }),
      bonus('tieNull', 1, 'per-tournament-round', { winningTeamId: null as unknown as string }),
      bonus('tieAbsent', 4, 'per-tournament-round', { detail: 'tied' }),
      bonus('stranger', 5, 'per-tournament-round', { winningTeamId: 'team-z' }),
      bonus('unplayed', 6, 'per-tournament-round'),
    ]),
  ]),
  'per-matchup scope with only a winning team': tournament([
    round('r1', [], [bonus('pm', 2, 'per-matchup', { winningTeamId: B })]),
  ]),
  'three rounds, one without bonuses': tournament([
    round('r1', [matchup('m1', 1), matchup('m2', 1)], [bonus('j', 1, 'per-tournament-round', { winningTeamId: A })]),
    round('r2', [matchup('m3', 0.5, 0.5)], undefined as unknown as RoundBonus[]),
    round('r3', [matchup('m4', 0, 2), matchup('m5', null)], [bonus('n', 0.5, 'per-tournament-round', {})]),
  ]),
};

describe('Event spine slice 1: computeStandings goldens (pinned before the N-way refactor)', () => {
  for (const [name, t] of Object.entries(CORPUS)) {
    it(name, () => {
      expect(computeStandings(t)).toMatchSnapshot();
    });
  }
});

const total = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
// Every point a round hands out: matchup points, per-matchup tallies, and every per-round bonus
// with a result whose winner is a team of the tournament or nobody (a tie).
function pointsAwarded(t: Tournament): number {
  const ids = new Set(t.teams.map((x) => x.id));
  let sum = 0;
  for (const r of t.rounds) {
    for (const m of r.matchups) if (m.result) sum += m.result.pointsTeamA + m.result.pointsTeamB;
    for (const b of r.bonuses || []) {
      const res = b.result;
      if (!res) continue;
      if (b.scope === 'per-matchup' && (res.teamAWins != null || res.teamBWins != null)) sum += ((res.teamAWins || 0) + (res.teamBWins || 0) + (res.ties || 0)) * b.points;
      else if (res.winningTeamId == null || ids.has(res.winningTeamId)) sum += b.points;
    }
  }
  return sum;
}

describe('Event spine slice 1: computeStandingsN', () => {
  it('teamsOf is the tournament\'s teams, in order, as a copy', () => {
    const t = CORPUS['one round, matchups only'];
    expect(teamsOf(t).map((x) => x.id)).toEqual([A, B]);
    expect(teamsOf(t)).not.toBe(t.teams);
  });

  for (const [name, t] of Object.entries(CORPUS)) {
    it(`${name}: agrees with the 2-team view, every team present, points conserved`, () => {
      const n = computeStandingsN(t);
      const old = computeStandings(t);
      expect([...n.points.keys()]).toEqual([A, B]);
      expect(n.points.get(A)).toBe(old.teamAPoints);
      expect(n.points.get(B)).toBe(old.teamBPoints);
      expect(n.roundResults.map((r) => r.roundId)).toEqual(t.rounds.map((r) => r.id));
      n.roundResults.forEach((r, i) => {
        expect(r.points.get(A)).toBe(old.roundResults[i].teamAPoints);
        expect(r.points.get(B)).toBe(old.roundResults[i].teamBPoints);
      });
      // The rounds add up to the total, and the total is exactly what was handed out.
      expect(n.roundResults.reduce((s, r) => s + total(r.points), 0)).toBeCloseTo(total(n.points), 9);
      expect(total(n.points)).toBeCloseTo(pointsAwarded(t), 9);
    });
  }

  it('N teams: a tied per-round bonus splits across every team; a win goes to any team by id', () => {
    const t = tournament([round('r1', [matchup('m1', 1)], [
      bonus('tie', 3, 'per-tournament-round', {}),
      bonus('toC', 2, 'per-tournament-round', { winningTeamId: 'team-c' }),
    ])]);
    // Not a shape the app writes yet (S3): the adapter must still read it.
    (t as { teams: Tournament['teams'] | { id: string; name: string; playerIds: string[] }[] }).teams = [...t.teams, { id: 'team-c', name: 'Cats', playerIds: [] }];
    const n = computeStandingsN(t);
    expect([...n.points.keys()]).toEqual([A, B, 'team-c']);
    expect(n.points.get(A)).toBeCloseTo(2, 9);
    expect(n.points.get(B)).toBeCloseTo(1, 9);
    expect(n.points.get('team-c')).toBeCloseTo(3, 9);
    expect(total(n.points)).toBeCloseTo(pointsAwarded(t), 9);
  });
});

describe('Event spine slice 1: the owner scopes only when present (§5.bu, plan §4 A)', () => {
  it('a legacy owner-less tournament is visible to everyone, signed in or not', () => {
    expect(tournamentVisibleTo({}, 123)).toBe(true);
    expect(tournamentVisibleTo({}, null)).toBe(true);
  });
  it('an owned tournament is visible to its owner, not to someone else', () => {
    expect(tournamentVisibleTo({ createdByGhin: 123 }, 123)).toBe(true);
    expect(tournamentVisibleTo({ createdByGhin: 123 }, 456)).toBe(false);
    expect(tournamentVisibleTo({ createdByGhin: 123 }, null)).toBe(false);
  });
});
