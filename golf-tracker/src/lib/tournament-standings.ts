// Event spine slice 1 (§5.bu, .claude/plans/event-spine.md §3): tournament points standings,
// N-way. Pure — no Supabase, storage, clock or randomness. `computeStandings` in
// tournament-state.ts is the 2-team wrapper the pages still call.
//
// The stored tournament is still two teams (`teams: [Team, Team]`, results as
// pointsTeamA/pointsTeamB). `teamsOf` is the seam: when N-way tournament writes land (S3),
// only it and the A/B reads below learn the new shape; callers already speak team ids.

import type { Team, Tournament } from './tournament-state';

/** The tournament's teams, in order. Today always two; callers must not assume it. */
export function teamsOf(tournament: Tournament): Team[] {
  return [...tournament.teams];
}

export interface StandingsN {
  /** Points per team id, every team present (0 when it has none). */
  points: Map<string, number>;
  roundResults: { roundId: string; points: Map<string, number> }[];
}

export function computeStandingsN(tournament: Tournament): StandingsN {
  const teams = teamsOf(tournament);
  const ids = teams.map((t) => t.id);
  const zero = () => new Map(ids.map((id) => [id, 0]));
  const add = (m: Map<string, number>, id: string | undefined, pts: number) => {
    if (id !== undefined && m.has(id)) m.set(id, m.get(id)! + pts);
  };
  // The stored A/B sides of a matchup or a per-matchup tally.
  const [sideA, sideB] = [ids[0], ids[1]];

  const points = zero();
  const roundResults: StandingsN['roundResults'] = [];

  for (const round of tournament.rounds) {
    const r = zero();
    for (const matchup of round.matchups) {
      if (matchup.result) {
        add(r, sideA, matchup.result.pointsTeamA);
        add(r, sideB, matchup.result.pointsTeamB);
      }
    }
    for (const bonus of round.bonuses || []) {
      if (!bonus.result) continue;
      const { winningTeamId } = bonus.result;
      if (bonus.scope === 'per-matchup' && (bonus.result.teamAWins != null || bonus.result.teamBWins != null)) {
        const aWins = bonus.result.teamAWins || 0;
        const bWins = bonus.result.teamBWins || 0;
        const ties = bonus.result.ties || 0;
        // A tie in a matchup halves between that matchup's two sides.
        add(r, sideA, aWins * bonus.points + ties * bonus.points * 0.5);
        add(r, sideB, bWins * bonus.points + ties * bonus.points * 0.5);
      } else if (winningTeamId !== undefined && winningTeamId !== null) {
        // A winner that is no team of this tournament scores nobody (as before).
        add(r, winningTeamId, bonus.points);
      } else {
        // Tied: split the points across every team.
        for (const id of ids) add(r, id, bonus.points / ids.length);
      }
    }
    for (const id of ids) points.set(id, points.get(id)! + r.get(id)!);
    roundResults.push({ roundId: round.id, points: r });
  }

  return { points, roundResults };
}
