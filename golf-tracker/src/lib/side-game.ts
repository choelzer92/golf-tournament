import type { Player, GameScore, CourseSelection, TeeSetOption } from './game-state';
import type { SideGame, SideGameTeam } from './tournament-state';
import { calcCourseHandicap } from './game-state';
import { getMoneyStrokesOnHole } from './money-games';

interface HoleData {
  number: number;
  par: number;
  handicap: number;
}

export interface SideGameHoleResult {
  holeNumber: number;
  par: number;
  teamBestNets: Record<string, number | null>;
  teamPoints: Record<string, number>;
}

export interface SideGameNassauLeg {
  leg: 'front' | 'back' | 'overall';
  rankings: { teamId: string; teamName: string; points: number; place: number; payout: number }[];
}

export interface SideGamePayoutEntry {
  teamId: string;
  teamName: string;
  front: number;
  back: number;
  overall: number;
  total: number;
}

export interface SideGameResult {
  holes: SideGameHoleResult[];
  nassauLegs: SideGameNassauLeg[];
  payouts: SideGamePayoutEntry[];
  thruHole: number;
}

function getHoleData(course: CourseSelection | null): HoleData[] {
  if (!course) return [];
  const tee = course.teeSets.find((t) => t.id === course.selectedTeeId) || course.teeSets[0];
  if (!tee) return [];
  return tee.holes.sort((a, b) => a.number - b.number).map((h) => ({
    number: h.number,
    par: h.par,
    handicap: h.handicap,
  }));
}

function getPlayerTee(player: Player, course: CourseSelection | null): TeeSetOption | null {
  if (!course) return null;
  if (player.teeSetId) {
    return course.teeSets.find((t) => t.id === player.teeSetId)
      || course.teeSets.find((t) => t.id === course.selectedTeeId)
      || course.teeSets[0] || null;
  }
  return course.teeSets.find((t) => t.id === course.selectedTeeId) || course.teeSets[0] || null;
}

function getPlayingHandicap(player: Player, course: CourseSelection | null, allowance: number): number {
  if (!player.handicapIndex) return 0;
  const tee = getPlayerTee(player, course);
  if (!tee) return player.handicapIndex * (allowance / 100);
  const totalRating = tee.ratings?.find((r) => r.type === 'Total');
  if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) {
    return player.handicapIndex * (allowance / 100);
  }
  const courseHcap = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, tee.totalPar);
  if (isNaN(courseHcap)) return 0;
  return courseHcap * (allowance / 100);
}

function computeLegPayout(rankings: { teamId: string; teamName: string; points: number }[], entryPerTeam: number, payoutSplit?: number[]): SideGameNassauLeg['rankings'] {
  const sorted = [...rankings].sort((a, b) => b.points - a.points);
  const numTeams = sorted.length;
  const pot = numTeams * entryPerTeam;

  // Default split: winner-take-all [100]
  const split = payoutSplit && payoutSplit.length > 0 ? payoutSplit : [100];

  // Convert split %s to net payouts per position (payout - entry = net)
  const positions: number[] = [];
  for (let i = 0; i < numTeams; i++) {
    const pct = i < split.length ? split[i] : 0;
    positions[i] = (pot * pct / 100) - entryPerTeam;
  }

  // Assign places
  const result: SideGameNassauLeg['rankings'] = [];
  let place = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].points < sorted[i - 1].points) {
      place = i + 1;
    }
    result.push({ ...sorted[i], place, payout: 0 });
  }

  // Split tied positions: tied teams share the sum of positions they span
  let i = 0;
  while (i < result.length) {
    let j = i;
    while (j < result.length && result[j].place === result[i].place) j++;
    const tiedCount = j - i;
    const poolSum = positions.slice(i, j).reduce((s, v) => s + v, 0);
    const splitPayout = poolSum / tiedCount;
    for (let k = i; k < j; k++) {
      result[k].payout = splitPayout;
    }
    i = j;
  }

  return result;
}

export function computeSideGameResult(
  sideGame: SideGame,
  allScores: Map<string, GameScore[]>
): SideGameResult {
  const holes = getHoleData(sideGame.course);
  if (holes.length === 0) return { holes: [], nassauLegs: [], payouts: [], thruHole: 0 };

  const numHoles = holes.length;

  // Pre-compute playing handicaps
  const hcapMap = new Map<string, number>();
  for (const player of sideGame.players) {
    hcapMap.set(player.id, getPlayingHandicap(player, sideGame.course, sideGame.handicapAllowance));
  }

  // Map each team to its score source
  function getTeamScores(team: SideGameTeam): GameScore[] {
    const matchupId = team.linkedMatchupId || sideGame.ownMatchupId;
    return allScores.get(matchupId) || [];
  }

  // Compute per-hole results
  const holeResults: SideGameHoleResult[] = [];
  let thruHole = 0;

  for (const hole of holes) {
    const teamBestNets: Record<string, number | null> = {};
    const teamPoints: Record<string, number> = {};

    for (const team of sideGame.teams) {
      const scores = getTeamScores(team);
      let bestNet: number | null = null;

      for (const playerId of team.playerIds) {
        const score = scores.find((s) => s.playerId === playerId && s.hole === hole.number);
        if (score) {
          const hcap = hcapMap.get(playerId) ?? 0;
          const strokes = getMoneyStrokesOnHole(hcap, hole.handicap, numHoles);
          const net = score.grossScore - strokes;
          if (bestNet === null || net < bestNet) bestNet = net;
        }
      }

      teamBestNets[team.id] = bestNet;
      teamPoints[team.id] = 0;
    }

    // Round-robin comparison — only award points when ALL teams have completed the hole
    const teamsWithScores = sideGame.teams.filter((t) => teamBestNets[t.id] !== null);
    const allTeamsComplete = teamsWithScores.length === sideGame.teams.length;

    if (teamsWithScores.length > 0) {
      thruHole = hole.number;
    }

    if (allTeamsComplete) {
      for (let i = 0; i < teamsWithScores.length; i++) {
        for (let j = i + 1; j < teamsWithScores.length; j++) {
          const a = teamsWithScores[i];
          const b = teamsWithScores[j];
          const netA = teamBestNets[a.id]!;
          const netB = teamBestNets[b.id]!;
          if (netA < netB) {
            teamPoints[a.id] += 1;
          } else if (netB < netA) {
            teamPoints[b.id] += 1;
          } else {
            teamPoints[a.id] += 0.5;
            teamPoints[b.id] += 0.5;
          }
        }
      }
    }

    holeResults.push({ holeNumber: hole.number, par: hole.par, teamBestNets, teamPoints });
  }

  // Nassau legs
  const frontHoles = holeResults.filter((h) => h.holeNumber <= 9);
  const backHoles = holeResults.filter((h) => h.holeNumber > 9);

  function sumPoints(holeSet: SideGameHoleResult[]): { teamId: string; teamName: string; points: number }[] {
    return sideGame.teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      points: holeSet.reduce((sum, h) => sum + (h.teamPoints[team.id] || 0), 0),
    }));
  }

  const entry = sideGame.nassauConfig.entryPerTeam;
  const split = sideGame.nassauConfig.payoutSplit;
  const nassauLegs: SideGameNassauLeg[] = [
    { leg: 'front', rankings: computeLegPayout(sumPoints(frontHoles), entry, split) },
    { leg: 'back', rankings: computeLegPayout(sumPoints(backHoles), entry, split) },
    { leg: 'overall', rankings: computeLegPayout(sumPoints(holeResults), entry, split) },
  ];

  // Aggregate payouts per team
  const payouts: SideGamePayoutEntry[] = sideGame.teams.map((team) => {
    const front = nassauLegs[0].rankings.find((r) => r.teamId === team.id)?.payout ?? 0;
    const back = nassauLegs[1].rankings.find((r) => r.teamId === team.id)?.payout ?? 0;
    const overall = nassauLegs[2].rankings.find((r) => r.teamId === team.id)?.payout ?? 0;
    return { teamId: team.id, teamName: team.name, front, back, overall, total: front + back + overall };
  });
  payouts.sort((a, b) => b.total - a.total);

  return { holes: holeResults, nassauLegs, payouts, thruHole };
}

// --- Detailed player-level scorecard data ---

export interface PlayerHoleScore {
  holeNumber: number;
  par: number;
  gross: number | null;
  strokes: number;
  net: number | null;
  isBestNet: boolean;
}

export interface SideGamePlayerDetail {
  playerId: string;
  playerName: string;
  teamId: string;
  playingHcap: number;
  holes: PlayerHoleScore[];
}

export interface SideGameTeamDetail {
  teamId: string;
  teamName: string;
  players: SideGamePlayerDetail[];
  bestNets: (number | null)[];
}

export function computeSideGamePlayerDetails(
  sideGame: SideGame,
  allScores: Map<string, GameScore[]>
): SideGameTeamDetail[] {
  const holeData = getHoleData(sideGame.course);
  if (holeData.length === 0) return [];

  const numHoles = holeData.length;

  const hcapMap = new Map<string, number>();
  for (const player of sideGame.players) {
    hcapMap.set(player.id, getPlayingHandicap(player, sideGame.course, sideGame.handicapAllowance));
  }

  const teamDetails: SideGameTeamDetail[] = [];

  for (const team of sideGame.teams) {
    const matchupId = team.linkedMatchupId || sideGame.ownMatchupId;
    const scores = allScores.get(matchupId) || [];

    // Compute best net per hole for this team
    const bestNets: (number | null)[] = [];
    for (const hole of holeData) {
      let best: number | null = null;
      for (const pid of team.playerIds) {
        const sc = scores.find((s) => s.playerId === pid && s.hole === hole.number);
        if (sc) {
          const hcap = hcapMap.get(pid) ?? 0;
          const strokes = getMoneyStrokesOnHole(hcap, hole.handicap, numHoles);
          const net = sc.grossScore - strokes;
          if (best === null || net < best) best = net;
        }
      }
      bestNets.push(best);
    }

    const players: SideGamePlayerDetail[] = [];
    for (const pid of team.playerIds) {
      const player = sideGame.players.find((p) => p.id === pid);
      if (!player) continue;

      const playingHcap = hcapMap.get(pid) ?? 0;
      const playerHoles: PlayerHoleScore[] = [];

      for (let i = 0; i < holeData.length; i++) {
        const hole = holeData[i];
        const strokes = getMoneyStrokesOnHole(playingHcap, hole.handicap, numHoles);
        const sc = scores.find((s) => s.playerId === pid && s.hole === hole.number);
        const gross = sc ? sc.grossScore : null;
        const net = gross !== null ? gross - strokes : null;
        const isBestNet = net !== null && bestNets[i] !== null && net === bestNets[i];

        playerHoles.push({ holeNumber: hole.number, par: hole.par, gross, strokes, net, isBestNet });
      }

      players.push({ playerId: pid, playerName: player.name, teamId: team.id, playingHcap, holes: playerHoles });
    }

    teamDetails.push({ teamId: team.id, teamName: team.name, players, bestNets });
  }

  return teamDetails;
}
