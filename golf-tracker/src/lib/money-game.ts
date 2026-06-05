import type { GameScore } from './game-state';
import type { Tournament, RoundMatchup, TournamentRound } from './tournament-state';

export interface MoneyConfig {
  nassauFront: number;
  nassauBack: number;
  nassauOverall: number;
  birdieValue: number;
  eagleValue: number;
}

export const DEFAULT_MONEY_CONFIG: MoneyConfig = {
  nassauFront: 10,
  nassauBack: 10,
  nassauOverall: 10,
  birdieValue: 5,
  eagleValue: 10,
};

export interface MoneyResult {
  teamATotal: number;
  teamBTotal: number;
  perPlayerA: number;
  perPlayerB: number;
  breakdown: MoneyBreakdownLine[];
}

export interface MoneyBreakdownLine {
  label: string;
  teamAWins: boolean | null;
  amount: number;
}

export function computeMoneyResult(
  round: TournamentRound,
  tournament: Tournament,
  allScores: Map<string, GameScore[]>,
  config: MoneyConfig
): MoneyResult {
  const breakdown: MoneyBreakdownLine[] = [];
  let teamATotal = 0;
  let teamBTotal = 0;

  // Nassau: determined by the nassau bonus results on the round
  for (const bonus of round.bonuses) {
    if (!bonus.result) continue;

    if (bonus.type === 'nassau-front') {
      const amount = config.nassauFront;
      if (bonus.result.winningTeamId === tournament.teams[0].id) {
        teamATotal += amount;
        teamBTotal -= amount;
        breakdown.push({ label: `Front 9`, teamAWins: true, amount });
      } else if (bonus.result.winningTeamId === tournament.teams[1].id) {
        teamBTotal += amount;
        teamATotal -= amount;
        breakdown.push({ label: `Front 9`, teamAWins: false, amount });
      } else {
        breakdown.push({ label: `Front 9 (push)`, teamAWins: null, amount: 0 });
      }
    }

    if (bonus.type === 'nassau-back') {
      const amount = config.nassauBack;
      if (bonus.result.winningTeamId === tournament.teams[0].id) {
        teamATotal += amount;
        teamBTotal -= amount;
        breakdown.push({ label: `Back 9`, teamAWins: true, amount });
      } else if (bonus.result.winningTeamId === tournament.teams[1].id) {
        teamBTotal += amount;
        teamATotal -= amount;
        breakdown.push({ label: `Back 9`, teamAWins: false, amount });
      } else {
        breakdown.push({ label: `Back 9 (push)`, teamAWins: null, amount: 0 });
      }
    }

    if (bonus.type === 'nassau-overall') {
      const amount = config.nassauOverall;
      if (bonus.result.winningTeamId === tournament.teams[0].id) {
        teamATotal += amount;
        teamBTotal -= amount;
        breakdown.push({ label: `Overall`, teamAWins: true, amount });
      } else if (bonus.result.winningTeamId === tournament.teams[1].id) {
        teamBTotal += amount;
        teamATotal -= amount;
        breakdown.push({ label: `Overall`, teamAWins: false, amount });
      } else {
        breakdown.push({ label: `Overall (push)`, teamAWins: null, amount: 0 });
      }
    }
  }

  // Birdie/Eagle differential
  let totalBirdiesA = 0;
  let totalBirdiesB = 0;
  let totalEaglesA = 0;
  let totalEaglesB = 0;

  const tee = round.course?.teeSets.find((t) => t.id === (round.defaultTeeId || round.course?.teeSets[0]?.id)) || round.course?.teeSets[0];
  const holes = (tee?.holes || []).sort((a, b) => a.number - b.number);

  for (const matchup of round.matchups) {
    const scores = allScores.get(matchup.id);
    if (!scores) continue;

    const teamAIds = new Set(matchup.teamAPlayerIds);
    const teamBIds = new Set(matchup.teamBPlayerIds);

    for (const hole of holes) {
      for (const score of scores) {
        if (score.hole !== hole.number) continue;
        const diff = score.grossScore - hole.par;
        if (teamAIds.has(score.playerId)) {
          if (diff === -1) totalBirdiesA++;
          else if (diff <= -2) totalEaglesA++;
        } else if (teamBIds.has(score.playerId)) {
          if (diff === -1) totalBirdiesB++;
          else if (diff <= -2) totalEaglesB++;
        }
      }
    }
  }

  const birdieDiff = totalBirdiesA - totalBirdiesB;
  if (birdieDiff !== 0) {
    const amount = Math.abs(birdieDiff) * config.birdieValue;
    if (birdieDiff > 0) {
      teamATotal += amount;
      teamBTotal -= amount;
      breakdown.push({ label: `Birdies (+${birdieDiff})`, teamAWins: true, amount });
    } else {
      teamBTotal += amount;
      teamATotal -= amount;
      breakdown.push({ label: `Birdies (+${Math.abs(birdieDiff)})`, teamAWins: false, amount });
    }
  } else {
    breakdown.push({ label: `Birdies (tied ${totalBirdiesA}-${totalBirdiesB})`, teamAWins: null, amount: 0 });
  }

  const eagleDiff = totalEaglesA - totalEaglesB;
  if (eagleDiff !== 0) {
    const amount = Math.abs(eagleDiff) * config.eagleValue;
    if (eagleDiff > 0) {
      teamATotal += amount;
      teamBTotal -= amount;
      breakdown.push({ label: `Eagles (+${eagleDiff})`, teamAWins: true, amount });
    } else {
      teamBTotal += amount;
      teamATotal -= amount;
      breakdown.push({ label: `Eagles (+${Math.abs(eagleDiff)})`, teamAWins: false, amount });
    }
  } else if (totalEaglesA > 0 || totalEaglesB > 0) {
    breakdown.push({ label: `Eagles (tied ${totalEaglesA}-${totalEaglesB})`, teamAWins: null, amount: 0 });
  }

  const teamACount = tournament.teams[0].playerIds.length || 4;
  const teamBCount = tournament.teams[1].playerIds.length || 4;

  return {
    teamATotal,
    teamBTotal,
    perPlayerA: teamATotal > 0 ? teamATotal : teamATotal,
    perPlayerB: teamBTotal > 0 ? teamBTotal : teamBTotal,
    breakdown,
  };
}
