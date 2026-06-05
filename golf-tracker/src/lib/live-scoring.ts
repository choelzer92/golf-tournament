import type { Player, GameScore, TeeSetOption } from './game-state';
import type { TournamentRound, RoundMatchup, Tournament } from './tournament-state';
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

  let holesWonA = 0;
  let holesWonB = 0;
  let holesTied = 0;
  let holesPlayed = 0;

  for (const hole of holes) {
    const netA = getTeamNetForHole(teamAPlayers, hole, scores, round, holes, allMatchupPlayers);
    const netB = getTeamNetForHole(teamBPlayers, hole, scores, round, holes, allMatchupPlayers);

    if (netA === null || netB === null) continue;
    holesPlayed++;

    if (netA < netB) holesWonA++;
    else if (netB < netA) holesWonB++;
    else holesTied++;
  }

  return { holesWonA, holesWonB, holesTied, thru: holesPlayed };
}
