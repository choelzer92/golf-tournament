import type { Player, GameScore, TeeSetOption } from './game-state';
import type { TournamentRound, RoundMatchup, Tournament, SplitPairing } from './tournament-state';
import { calcCourseHandicap } from './game-state';
import type { TeamMode } from './formats';

interface HoleData {
  number: number;
  par: number;
  handicap: number;
}

export interface LiveMatchStatus {
  holesWonA: number;
  holesWonB: number;
  holesTied: number;
  thru: number;
}

export function getHoleDataForRound(round: TournamentRound): HoleData[] {
  if (!round.course) return [];
  const tee = round.course.teeSets.find((t) => t.id === round.defaultTeeId) || round.course.teeSets[0];
  if (!tee) return [];
  const allHoles = tee.holes.sort((a, b) => a.number - b.number);
  if (round.holesPlaying === 'front9') return allHoles.filter((h) => h.number <= 9);
  if (round.holesPlaying === 'back9') return allHoles.filter((h) => h.number > 9);
  return allHoles;
}

function getPlayerTee(player: Player, round: TournamentRound): TeeSetOption | null {
  if (!round.course) return null;
  if (player.teeSetId) {
    return round.course.teeSets.find((t) => t.id === player.teeSetId) || round.course.teeSets.find((t) => t.id === round.defaultTeeId) || round.course.teeSets[0] || null;
  }
  return round.course.teeSets.find((t) => t.id === round.defaultTeeId) || round.course.teeSets[0] || null;
}

function getPlayerEffectiveHcap(player: Player, round: TournamentRound, holes: HoleData[], holeNumber?: number): number {
  if (!player.handicapIndex) return 0;
  const allowance = getActiveAllowance(round, holeNumber);
  const is9 = round.holesPlaying === 'front9' || round.holesPlaying === 'back9' || !!round.splitFormat;

  if (round.handicapBasis === 'index') {
    const index = is9 ? player.handicapIndex / 2 : player.handicapIndex;
    return Math.round(index * (allowance / 100));
  }

  const playerTee = getPlayerTee(player, round);
  if (!playerTee) return 0;

  if (is9) {
    const ratingType = round.splitFormat
      ? ((holeNumber ? holeNumber > 9 : false) ? 'Back' : 'Front')
      : (round.holesPlaying === 'front9' ? 'Front' : 'Back');
    const rating = playerTee.ratings?.find((r) => r.type === ratingType);

    if (rating && rating.slopeRating && rating.courseRating) {
      const par = (playerTee.holes || [])
        .filter((h) => ratingType === 'Front' ? h.number <= 9 : h.number > 9)
        .reduce((sum, h) => sum + h.par, 0) || Math.round(playerTee.totalPar / 2);
      const result = calcCourseHandicap(player.handicapIndex / 2, rating.slopeRating, rating.courseRating, par)
        * (allowance / 100);
      return isNaN(result) ? 0 : Math.round(result);
    }

    const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
    if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) return 0;
    const full = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar)
      * (allowance / 100);
    return isNaN(full) ? 0 : Math.round(full / 2);
  }

  const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
  if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) return 0;
  const result = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar)
    * (allowance / 100);
  return isNaN(result) ? 0 : Math.round(result);
}

function getActiveAllowance(round: TournamentRound, holeNumber?: number): number {
  if (round.splitFormat && holeNumber && holeNumber > 9) {
    return round.splitFormat.handicapAllowance ?? 100;
  }
  return round.handicapAllowance ?? 100;
}

function getActiveStrokeMethod(round: TournamentRound, holeNumber?: number): 'full' | 'off-the-low' {
  if (round.splitFormat && holeNumber && holeNumber > 9) {
    return round.splitFormat.strokeMethod ?? 'off-the-low';
  }
  return round.strokeMethod ?? 'off-the-low';
}

function getActiveTeamMode(round: TournamentRound, holeNumber?: number): TeamMode {
  if (round.splitFormat && holeNumber && holeNumber > 9) {
    return round.splitFormat.teamMode;
  }
  return round.teamMode;
}

function getPlayingHandicap(player: Player, round: TournamentRound, holes: HoleData[], allMatchupPlayers: Player[], holeNumber?: number): number {
  const hcap = getPlayerEffectiveHcap(player, round, holes, holeNumber);
  if (getActiveStrokeMethod(round, holeNumber) === 'full') return hcap;

  // Off the low: subtract the lowest in the matchup
  const allHcaps = allMatchupPlayers.map((p) => getPlayerEffectiveHcap(p, round, holes, holeNumber));
  const lowest = Math.min(...allHcaps);
  return hcap - lowest;
}

function getPlayerStrokesOnHole(player: Player, holeHandicap: number, round: TournamentRound, holes: HoleData[], allMatchupPlayers: Player[], holeNumber?: number): number {
  const playingHcap = getPlayingHandicap(player, round, holes, allMatchupPlayers, holeNumber);
  const numHoles = round.splitFormat ? 9 : holes.length;

  if (playingHcap === 0) return 0;

  if (playingHcap < 0) {
    const absHcap = Math.abs(playingHcap);
    if (absHcap >= numHoles * 2) return -2;
    if (absHcap > numHoles) {
      if (holeHandicap <= absHcap - numHoles) return -2;
      return -1;
    }
    if (holeHandicap <= absHcap) return -1;
    return 0;
  }

  if (playingHcap >= numHoles * 2) return 2;
  if (playingHcap > numHoles) {
    if (holeHandicap <= playingHcap - numHoles) return 2;
    return 1;
  }
  if (holeHandicap <= playingHcap) return 1;
  return 0;
}

function getPlayerRawCourseHandicap(player: Player, round: TournamentRound): number {
  if (!player.handicapIndex) return 0;
  const is9 = round.holesPlaying === 'front9' || round.holesPlaying === 'back9';

  if (round.handicapBasis === 'index') {
    return is9 ? Math.round(player.handicapIndex / 2) : Math.round(player.handicapIndex);
  }

  const playerTee = getPlayerTee(player, round);
  if (!playerTee) return 0;

  if (is9) {
    const ratingType = round.holesPlaying === 'front9' ? 'Front' : 'Back';
    const rating = playerTee.ratings?.find((r) => r.type === ratingType);
    if (rating && rating.slopeRating && rating.courseRating) {
      const par = (playerTee.holes || [])
        .filter((h) => ratingType === 'Front' ? h.number <= 9 : h.number > 9)
        .reduce((sum, h) => sum + h.par, 0) || Math.round(playerTee.totalPar / 2);
      const result = calcCourseHandicap(player.handicapIndex / 2, rating.slopeRating, rating.courseRating, par);
      return isNaN(result) ? 0 : Math.round(result);
    }
    const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
    if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) return 0;
    const full = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar);
    return isNaN(full) ? 0 : Math.round(full / 2);
  }

  const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
  if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) return 0;
  const result = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar);
  return isNaN(result) ? 0 : Math.round(result);
}

function getTeamHandicapForFormat(teamPlayers: Player[], round: TournamentRound, teamMode: TeamMode): number {
  if (teamMode === 'scramble') {
    const courseHandicaps = teamPlayers
      .map((p) => getPlayerRawCourseHandicap(p, round))
      .sort((a, b) => a - b);

    const allowance = round.handicapAllowance ?? -1;
    if (allowance >= 0) {
      const sum = courseHandicaps.reduce((s, h) => s + h, 0);
      return Math.round(sum * (allowance / 100));
    }

    const multipliers = courseHandicaps.length === 2 ? [0.35, 0.15]
      : courseHandicaps.length === 3 ? [0.20, 0.15, 0.10]
      : [0.20, 0.15, 0.10, 0.05];

    return Math.round(courseHandicaps.reduce((sum, hcap, i) => sum + hcap * (multipliers[i] || 0), 0));
  }
  if (teamMode === 'alternate-shot') {
    const courseHandicaps = teamPlayers
      .map((p) => getPlayerRawCourseHandicap(p, round))
      .sort((a, b) => a - b);

    const allowance = (round.handicapAllowance ?? 50) / 100;
    if (courseHandicaps.length < 2) return Math.round((courseHandicaps[0] || 0) * allowance);
    const combined = courseHandicaps[0] * 0.6 + courseHandicaps[1] * 0.4;
    return Math.round(combined * allowance);
  }
  return 0;
}

function getTeamStrokesOnHole(teamPlayers: Player[], holeHandicap: number, round: TournamentRound, holes: HoleData[], teamMode: TeamMode): number {
  const teamHcap = getTeamHandicapForFormat(teamPlayers, round, teamMode);
  if (teamHcap <= 0) return 0;

  const numHoles = holes.length;
  if (teamHcap >= numHoles * 2) return 2;
  if (teamHcap > numHoles) {
    if (holeHandicap <= teamHcap - numHoles) return 2;
    return 1;
  }
  if (holeHandicap <= teamHcap) return 1;
  return 0;
}

function getScore(scores: GameScore[], playerId: string, holeNumber: number): number | null {
  const s = scores.find((sc) => sc.playerId === playerId && sc.hole === holeNumber);
  return s ? s.grossScore : null;
}

function getTeamNetForHole(
  teamPlayers: Player[],
  hole: HoleData,
  scores: GameScore[],
  round: TournamentRound,
  holes: HoleData[],
  allMatchupPlayers: Player[]
): number | null {
  const teamMode = getActiveTeamMode(round, hole.number);

  if (teamMode === 'scramble') {
    const firstWithScore = teamPlayers.find((p) => getScore(scores, p.id, hole.number) !== null);
    if (!firstWithScore) return null;
    const gross = getScore(scores, firstWithScore.id, hole.number)!;
    const strokes = getTeamStrokesOnHole(teamPlayers, hole.handicap, round, holes, teamMode);
    return gross - strokes;
  }

  if (teamMode === 'alternate-shot') {
    const firstWithScore = teamPlayers.find((p) => getScore(scores, p.id, hole.number) !== null);
    if (!firstWithScore) return null;
    const gross = getScore(scores, firstWithScore.id, hole.number)!;
    const strokes = getPlayerStrokesOnHole(firstWithScore, hole.handicap, round, holes, allMatchupPlayers, hole.number);
    return gross - strokes;
  }

  if (teamMode === 'combined') {
    let total = 0;
    let anyScored = false;
    for (const p of teamPlayers) {
      const gross = getScore(scores, p.id, hole.number);
      if (gross === null) continue;
      anyScored = true;
      const strokes = getPlayerStrokesOnHole(p, hole.handicap, round, holes, allMatchupPlayers, hole.number);
      total += gross - strokes;
    }
    return anyScored ? total : null;
  }

  if (teamMode === 'two-best-balls') {
    const activeSettings = (round.splitFormat && hole.number > 9)
      ? round.splitFormat.formatSettings
      : round.formatSettings;
    const variant = (activeSettings?.ballSelection as string) || '1-net-1-gross';
    const playerScores: { gross: number; net: number }[] = [];
    for (const p of teamPlayers) {
      const gross = getScore(scores, p.id, hole.number);
      if (gross === null) continue;
      const strokes = getPlayerStrokesOnHole(p, hole.handicap, round, holes, allMatchupPlayers, hole.number);
      playerScores.push({ gross, net: gross - strokes });
    }
    if (playerScores.length < 2) return null;

    if (variant === '2-best-net') {
      const sorted = [...playerScores].sort((a, b) => a.net - b.net);
      return sorted[0].net + sorted[1].net;
    }
    if (variant === '2-best-gross') {
      const sorted = [...playerScores].sort((a, b) => a.gross - b.gross);
      return sorted[0].gross + sorted[1].gross;
    }
    // 1-net-1-gross: best net from one player + best gross from a different player
    let bestTotal = Infinity;
    for (let i = 0; i < playerScores.length; i++) {
      for (let j = 0; j < playerScores.length; j++) {
        if (i === j) continue;
        const total = playerScores[i].net + playerScores[j].gross;
        if (total < bestTotal) bestTotal = total;
      }
    }
    return bestTotal;
  }

  // best-ball (default)
  let best: number | null = null;
  for (const p of teamPlayers) {
    const gross = getScore(scores, p.id, hole.number);
    if (gross === null) continue;
    const strokes = getPlayerStrokesOnHole(p, hole.handicap, round, holes, allMatchupPlayers, hole.number);
    const net = gross - strokes;
    if (best === null || net < best) best = net;
  }
  return best;
}

function netToStablefordPoints(net: number, par: number): number {
  const diff = net - par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

function getTeamStablefordForHole(
  teamPlayers: Player[],
  hole: HoleData,
  scores: GameScore[],
  round: TournamentRound,
  holes: HoleData[],
  allMatchupPlayers: Player[]
): number | null {
  const teamMode = getActiveTeamMode(round, hole.number);

  if (teamMode === 'combined') {
    let total = 0;
    let anyScored = false;
    for (const p of teamPlayers) {
      const gross = getScore(scores, p.id, hole.number);
      if (gross === null) continue;
      anyScored = true;
      const strokes = getPlayerStrokesOnHole(p, hole.handicap, round, holes, allMatchupPlayers, hole.number);
      total += netToStablefordPoints(gross - strokes, hole.par);
    }
    return anyScored ? total : null;
  }

  // For best-ball/scramble/alternate-shot: get the team net and convert
  const net = getTeamNetForHole(teamPlayers, hole, scores, round, holes, allMatchupPlayers);
  if (net === null) return null;
  return netToStablefordPoints(net, hole.par);
}

export function computeLiveMatchStatus(
  scores: GameScore[],
  matchup: RoundMatchup,
  round: TournamentRound,
  tournament: Tournament
): LiveMatchStatus | null {
  const holes = getHoleDataForRound(round);
  if (holes.length === 0) return null;

  const teamAPlayers = tournament.players.filter((p) => matchup.teamAPlayerIds.includes(p.id));
  const teamBPlayers = tournament.players.filter((p) => matchup.teamBPlayerIds.includes(p.id));
  const allMatchupPlayers = [...teamAPlayers, ...teamBPlayers];
  const isStableford = round.formatId === 'stableford';

  let holesWonA = 0;
  let holesWonB = 0;
  let holesTied = 0;
  let holesPlayed = 0;

  for (const hole of holes) {
    if (isStableford) {
      const ptsA = getTeamStablefordForHole(teamAPlayers, hole, scores, round, holes, allMatchupPlayers);
      const ptsB = getTeamStablefordForHole(teamBPlayers, hole, scores, round, holes, allMatchupPlayers);
      if (ptsA === null || ptsB === null) continue;
      holesPlayed++;
      if (ptsA > ptsB) holesWonA++;
      else if (ptsB > ptsA) holesWonB++;
      else holesTied++;
    } else {
      const netA = getTeamNetForHole(teamAPlayers, hole, scores, round, holes, allMatchupPlayers);
      const netB = getTeamNetForHole(teamBPlayers, hole, scores, round, holes, allMatchupPlayers);
      if (netA === null || netB === null) continue;
      holesPlayed++;
      if (netA < netB) holesWonA++;
      else if (netB < netA) holesWonB++;
      else holesTied++;
    }
  }

  return { holesWonA, holesWonB, holesTied, thru: holesPlayed };
}

export interface NassauStatus {
  front: { holesWonA: number; holesWonB: number; holesTied: number; thru: number };
  back: { holesWonA: number; holesWonB: number; holesTied: number; thru: number };
  overall: { holesWonA: number; holesWonB: number; holesTied: number; thru: number };
}

export function computeNassauStatus(
  scores: GameScore[],
  matchup: RoundMatchup,
  round: TournamentRound,
  tournament: Tournament
): NassauStatus | null {
  const holes = getHoleDataForRound(round);
  if (holes.length === 0) return null;

  const teamAPlayers = tournament.players.filter((p) => matchup.teamAPlayerIds.includes(p.id));
  const teamBPlayers = tournament.players.filter((p) => matchup.teamBPlayerIds.includes(p.id));
  const allMatchupPlayers = [...teamAPlayers, ...teamBPlayers];

  const front = { holesWonA: 0, holesWonB: 0, holesTied: 0, thru: 0 };
  const back = { holesWonA: 0, holesWonB: 0, holesTied: 0, thru: 0 };

  for (const hole of holes) {
    const netA = getTeamNetForHole(teamAPlayers, hole, scores, round, holes, allMatchupPlayers);
    const netB = getTeamNetForHole(teamBPlayers, hole, scores, round, holes, allMatchupPlayers);
    if (netA === null || netB === null) continue;

    const bucket = hole.number <= 9 ? front : back;
    bucket.thru++;
    if (netA < netB) bucket.holesWonA++;
    else if (netB < netA) bucket.holesWonB++;
    else bucket.holesTied++;
  }

  return {
    front,
    back,
    overall: {
      holesWonA: front.holesWonA + back.holesWonA,
      holesWonB: front.holesWonB + back.holesWonB,
      holesTied: front.holesTied + back.holesTied,
      thru: front.thru + back.thru,
    },
  };
}

export interface SplitMatchup {
  type: 'team' | 'individual';
  label: string;
  holes: 'front' | 'back';
  playerA: Player;
  playerB: Player;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  status: LiveMatchStatus;
}

export function computeSplitMatchStatuses(
  scores: GameScore[],
  matchup: RoundMatchup,
  round: TournamentRound,
  tournament: Tournament
): SplitMatchup[] | null {
  if (!round.splitFormat || round.splitFormat.teamMode !== 'individual') return null;

  const holes = getHoleDataForRound(round);
  if (holes.length === 0) return null;

  const frontHoles = holes.filter((h) => h.number <= 9);
  const backHoles = holes.filter((h) => h.number > 9);

  const teamAPlayers = tournament.players.filter((p) => matchup.teamAPlayerIds.includes(p.id));
  const teamBPlayers = tournament.players.filter((p) => matchup.teamBPlayerIds.includes(p.id));
  const allMatchupPlayers = [...teamAPlayers, ...teamBPlayers];

  const results: SplitMatchup[] = [];

  // Front 9: team match using front 9 team mode
  let frontWonA = 0, frontWonB = 0, frontTied = 0, frontPlayed = 0;
  for (const hole of frontHoles) {
    const netA = getTeamNetForHole(teamAPlayers, hole, scores, round, holes, allMatchupPlayers);
    const netB = getTeamNetForHole(teamBPlayers, hole, scores, round, holes, allMatchupPlayers);
    if (netA === null || netB === null) continue;
    frontPlayed++;
    if (netA < netB) frontWonA++;
    else if (netB < netA) frontWonB++;
    else frontTied++;
  }
  results.push({
    type: 'team',
    label: 'Front 9 (Team)',
    holes: 'front',
    playerA: teamAPlayers[0],
    playerB: teamBPlayers[0],
    teamAPlayerIds: matchup.teamAPlayerIds,
    teamBPlayerIds: matchup.teamBPlayerIds,
    status: { holesWonA: frontWonA, holesWonB: frontWonB, holesTied: frontTied, thru: frontPlayed },
  });

  // Back 9: individual 1v1 pairings
  const pairings = round.splitFormat.pairings || [];
  for (const pairing of pairings) {
    const playerA = allMatchupPlayers.find((p) => p.id === pairing.playerIds[0] && matchup.teamAPlayerIds.includes(p.id))
      || allMatchupPlayers.find((p) => p.id === pairing.playerIds[1] && matchup.teamAPlayerIds.includes(p.id));
    const playerB = allMatchupPlayers.find((p) => p.id === pairing.playerIds[0] && matchup.teamBPlayerIds.includes(p.id))
      || allMatchupPlayers.find((p) => p.id === pairing.playerIds[1] && matchup.teamBPlayerIds.includes(p.id));

    if (!playerA || !playerB) continue;

    const pairPlayers = [playerA, playerB];
    let wonA = 0, wonB = 0, tied = 0, played = 0;
    for (const hole of backHoles) {
      const netA = getIndividualNetForHole(playerA, hole, scores, round, holes, pairPlayers);
      const netB = getIndividualNetForHole(playerB, hole, scores, round, holes, pairPlayers);
      if (netA === null || netB === null) continue;
      played++;
      if (netA < netB) wonA++;
      else if (netB < netA) wonB++;
      else tied++;
    }

    results.push({
      type: 'individual',
      label: `${playerA.name.split(' ')[0]} vs ${playerB.name.split(' ')[0]}`,
      holes: 'back',
      playerA,
      playerB,
      teamAPlayerIds: [playerA.id],
      teamBPlayerIds: [playerB.id],
      status: { holesWonA: wonA, holesWonB: wonB, holesTied: tied, thru: played },
    });
  }

  return results;
}

function getIndividualNetForHole(
  player: Player,
  hole: HoleData,
  scores: GameScore[],
  round: TournamentRound,
  holes: HoleData[],
  pairPlayers: Player[]
): number | null {
  const gross = getScore(scores, player.id, hole.number);
  if (gross === null) return null;
  const strokes = getPlayerStrokesOnHole(player, hole.handicap, round, holes, pairPlayers, hole.number);
  return gross - strokes;
}

export type HoleWinner = 'A' | 'B' | 'tie' | null;

export function computeHoleWinners(
  scores: GameScore[],
  matchup: RoundMatchup,
  round: TournamentRound,
  tournament: Tournament
): Map<number, HoleWinner> {
  const holes = getHoleDataForRound(round);
  const result = new Map<number, HoleWinner>();
  if (holes.length === 0) return result;

  const teamAPlayers = tournament.players.filter((p) => matchup.teamAPlayerIds.includes(p.id));
  const teamBPlayers = tournament.players.filter((p) => matchup.teamBPlayerIds.includes(p.id));
  const allMatchupPlayers = [...teamAPlayers, ...teamBPlayers];

  for (const hole of holes) {
    const netA = getTeamNetForHole(teamAPlayers, hole, scores, round, holes, allMatchupPlayers);
    const netB = getTeamNetForHole(teamBPlayers, hole, scores, round, holes, allMatchupPlayers);
    if (netA === null || netB === null) {
      result.set(hole.number, null);
    } else if (netA < netB) {
      result.set(hole.number, 'A');
    } else if (netB < netA) {
      result.set(hole.number, 'B');
    } else {
      result.set(hole.number, 'tie');
    }
  }
  return result;
}

export function recomputeMatchResult(
  scores: GameScore[],
  matchup: RoundMatchup,
  round: TournamentRound,
  tournament: Tournament
): { winningTeamId: string | null; pointsTeamA: number; pointsTeamB: number; summary: string } | null {
  // Split format with individual pairings: compute front 9 as team, back 9 per pairing
  const splitStatuses = computeSplitMatchStatuses(scores, matchup, round, tournament);
  if (splitStatuses) {
    let pointsTeamA = 0;
    let pointsTeamB = 0;
    const summaries: string[] = [];

    for (const sm of splitStatuses) {
      if (sm.status.thru === 0) continue;
      const pts = sm.type === 'team'
        ? { win: round.pointsForWin, tie: round.pointsForTie }
        : { win: round.splitFormat?.pointsForWin ?? round.pointsForWin, tie: round.splitFormat?.pointsForTie ?? round.pointsForTie };
      const a = sm.status.holesWonA * pts.win + sm.status.holesTied * pts.tie;
      const b = sm.status.holesWonB * pts.win + sm.status.holesTied * pts.tie;
      pointsTeamA += a;
      pointsTeamB += b;
      const diff = sm.status.holesWonA - sm.status.holesWonB;
      const statusText = diff === 0 ? 'AS' : diff > 0 ? `A ${diff}UP` : `B ${Math.abs(diff)}UP`;
      summaries.push(`${sm.label}: ${statusText}`);
    }

    if (pointsTeamA === 0 && pointsTeamB === 0) return null;
    const winningTeamId = pointsTeamA > pointsTeamB ? 'team-a'
      : pointsTeamB > pointsTeamA ? 'team-b' : null;
    return { winningTeamId, pointsTeamA, pointsTeamB, summary: summaries.join(' · ') };
  }

  const status = computeLiveMatchStatus(scores, matchup, round, tournament);
  if (!status || status.thru === 0) return null;

  if (round.scoringMethod === 'match-play') {
    const pointsTeamA = status.holesWonA * round.pointsForWin + status.holesTied * round.pointsForTie;
    const pointsTeamB = status.holesWonB * round.pointsForWin + status.holesTied * round.pointsForTie;
    const winningTeamId = pointsTeamA > pointsTeamB ? 'team-a'
      : pointsTeamB > pointsTeamA ? 'team-b' : null;
    const tieNote = status.holesTied > 0 ? ` · ${status.holesTied} tied` : '';
    return {
      winningTeamId,
      pointsTeamA,
      pointsTeamB,
      summary: `${pointsTeamA}–${pointsTeamB} (${status.holesWonA}W-${status.holesWonB}W${tieNote})`,
    };
  }

  // Stroke play: compute total team scores
  const holes = getHoleDataForRound(round);
  const teamAPlayers = tournament.players.filter((p) => matchup.teamAPlayerIds.includes(p.id));
  const teamBPlayers = tournament.players.filter((p) => matchup.teamBPlayerIds.includes(p.id));
  const allMatchupPlayers = [...teamAPlayers, ...teamBPlayers];
  const isStableford = round.formatId === 'stableford';

  if (isStableford) {
    let totalA = 0;
    let totalB = 0;
    for (const hole of holes) {
      const ptsA = getTeamStablefordForHole(teamAPlayers, hole, scores, round, holes, allMatchupPlayers);
      const ptsB = getTeamStablefordForHole(teamBPlayers, hole, scores, round, holes, allMatchupPlayers);
      if (ptsA !== null) totalA += ptsA;
      if (ptsB !== null) totalB += ptsB;
    }
    const winningTeamId = totalA > totalB ? 'team-a' : totalB > totalA ? 'team-b' : null;
    const pointsTeamA = winningTeamId === 'team-a' ? round.pointsForWin : winningTeamId === null ? round.pointsForTie : round.pointsForLoss;
    const pointsTeamB = winningTeamId === 'team-b' ? round.pointsForWin : winningTeamId === null ? round.pointsForTie : round.pointsForLoss;
    return { winningTeamId, pointsTeamA, pointsTeamB, summary: `${totalA} — ${totalB} (stableford pts)` };
  }

  let totalA = 0;
  let totalB = 0;
  for (const hole of holes) {
    const netA = getTeamNetForHole(teamAPlayers, hole, scores, round, holes, allMatchupPlayers);
    const netB = getTeamNetForHole(teamBPlayers, hole, scores, round, holes, allMatchupPlayers);
    if (netA !== null) totalA += netA;
    if (netB !== null) totalB += netB;
  }
  const winningTeamId = totalA < totalB ? 'team-a' : totalB < totalA ? 'team-b' : null;
  const pointsTeamA = winningTeamId === 'team-a' ? round.pointsForWin : winningTeamId === null ? round.pointsForTie : round.pointsForLoss;
  const pointsTeamB = winningTeamId === 'team-b' ? round.pointsForWin : winningTeamId === null ? round.pointsForTie : round.pointsForLoss;
  return { winningTeamId, pointsTeamA, pointsTeamB, summary: `${totalA} — ${totalB} (net)` };
}

export function getPlayerStrokesForHole(
  playerId: string,
  holeHandicap: number,
  holeNumber: number,
  matchup: RoundMatchup,
  round: TournamentRound,
  tournament: Tournament
): number {
  const holes = getHoleDataForRound(round);
  if (holes.length === 0) return 0;

  const allMatchupPlayers = tournament.players.filter((p) =>
    matchup.teamAPlayerIds.includes(p.id) || matchup.teamBPlayerIds.includes(p.id)
  );
  const player = allMatchupPlayers.find((p) => p.id === playerId);
  if (!player) return 0;

  // For back 9 individual pairings, narrow comparison pool to just the paired players
  if (round.splitFormat && round.splitFormat.teamMode === 'individual' && round.splitFormat.pairings && holeNumber > 9) {
    const pairing = round.splitFormat.pairings.find((p) => p.playerIds.includes(playerId));
    if (pairing) {
      const pairPlayers = allMatchupPlayers.filter((p) => pairing.playerIds.includes(p.id));
      return getPlayerStrokesOnHole(player, holeHandicap, round, holes, pairPlayers, holeNumber);
    }
  }

  return getPlayerStrokesOnHole(player, holeHandicap, round, holes, allMatchupPlayers, holeNumber);
}

export function computePlayerStablefordPoints(
  scores: GameScore[],
  playerId: string,
  matchup: RoundMatchup,
  round: TournamentRound,
  tournament: Tournament
): number {
  const holes = getHoleDataForRound(round);
  if (holes.length === 0) return 0;

  const allMatchupPlayers = tournament.players.filter((p) =>
    matchup.teamAPlayerIds.includes(p.id) || matchup.teamBPlayerIds.includes(p.id)
  );
  const player = allMatchupPlayers.find((p) => p.id === playerId);
  if (!player) return 0;

  let total = 0;
  for (const hole of holes) {
    const gross = getScore(scores, playerId, hole.number);
    if (gross === null) continue;
    const strokes = getPlayerStrokesOnHole(player, hole.handicap, round, holes, allMatchupPlayers, hole.number);
    total += netToStablefordPoints(gross - strokes, hole.par);
  }
  return total;
}

export function computePlayerNetTotal(
  scores: GameScore[],
  playerId: string,
  matchup: RoundMatchup,
  round: TournamentRound,
  tournament: Tournament
): number | null {
  const holes = getHoleDataForRound(round);
  if (holes.length === 0) return null;

  const allMatchupPlayers = tournament.players.filter((p) =>
    matchup.teamAPlayerIds.includes(p.id) || matchup.teamBPlayerIds.includes(p.id)
  );
  const player = allMatchupPlayers.find((p) => p.id === playerId);
  if (!player) return null;

  let total = 0;
  let holesScored = 0;
  for (const hole of holes) {
    const gross = getScore(scores, playerId, hole.number);
    if (gross === null) continue;
    holesScored++;
    const strokes = getPlayerStrokesOnHole(player, hole.handicap, round, holes, allMatchupPlayers, hole.number);
    total += gross - strokes;
  }
  return holesScored > 0 ? total : null;
}
