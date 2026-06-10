import type { Player, GameScore, TeeSetOption } from './game-state';
import type { Tournament, TournamentRound, SkinsConfig, TeamNassauConfig } from './tournament-state';
import { loadGameScores } from './tournament-state';
import { getHoleDataForRound } from './live-scoring';
import { calcCourseHandicap } from './game-state';

export interface NassauLegResult {
  teamATotal: number;
  teamBTotal: number;
  winner: 'A' | 'B' | 'push';
}

export interface RoundNassauResult {
  roundId: string;
  roundName: string;
  front: NassauLegResult;
  back: NassauLegResult;
  overall: NassauLegResult;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
}

export interface SkinHole {
  roundIndex: number;
  holeNumber: number;
  par: number;
  playerScores: { playerId: string; netToPar: number }[];
  winner: string | null;
  carryover: boolean;
}

export interface SkinsResult {
  holes: SkinHole[];
  totalPot: number;
  skinsAwarded: number;
  skinValue: number;
  playerSkins: Map<string, number>;
}

export interface PlayerLedgerEntry {
  playerId: string;
  playerName: string;
  teamId: string;
  roundsPlayed: number;
  nassauResult: number;
  skinsResult: number;
  netResult: number;
  moneyHandicap?: number;
}

export interface MoneyLedger {
  players: PlayerLedgerEntry[];
  totalInPlay: number;
  nassauDetails: RoundNassauResult[];
  skinsDetails: SkinsResult | null;
}

// --- Display name: use last name, disambiguate with first initial when needed ---

export function getPlayerDisplayName(playerId: string, players: Player[]): string {
  const player = players.find((p) => p.id === playerId);
  if (!player) return '?';
  const parts = player.name.split(' ');
  if (parts.length < 2) return player.name;
  const lastName = parts[parts.length - 1];
  const sameLastName = players.filter((p) => {
    const pp = p.name.split(' ');
    return pp[pp.length - 1] === lastName && p.id !== playerId;
  });
  if (sameLastName.length > 0) {
    return `${parts[0][0]}. ${lastName}`;
  }
  return lastName;
}

// --- Money-game stroke calculation: full course handicap * allowance%, NOT off-the-low ---

function getPlayerTee(player: Player, round: TournamentRound): TeeSetOption | null {
  if (!round.course) return null;
  const overrideTeeId = round.playerTeeOverrides?.[player.id];
  const teeSetId = overrideTeeId || player.teeSetId;
  if (teeSetId) {
    return round.course.teeSets.find((t) => t.id === teeSetId)
      || round.course.teeSets.find((t) => t.id === round.defaultTeeId)
      || round.course.teeSets[0] || null;
  }
  return round.course.teeSets.find((t) => t.id === round.defaultTeeId) || round.course.teeSets[0] || null;
}

export function getMoneyGamePlayingHandicap(player: Player, round: TournamentRound, allowance: number): number {
  if (!player.handicapIndex) return 0;

  const playerTee = getPlayerTee(player, round);
  if (!playerTee) {
    // Fallback if no course data: apply allowance to index directly
    return player.handicapIndex * (allowance / 100);
  }

  const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
  if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) {
    return player.handicapIndex * (allowance / 100);
  }

  const courseHcap = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar);
  if (isNaN(courseHcap)) return 0;

  return courseHcap * (allowance / 100);
}

export function getMoneyStrokesOnHole(playingHcap: number, holeHandicap: number, numHoles: number): number {
  const rounded = Math.round(playingHcap);
  if (rounded <= 0) return 0;
  if (rounded >= numHoles * 2) return 2;
  if (rounded > numHoles) {
    return holeHandicap <= rounded - numHoles ? 2 : 1;
  }
  return holeHandicap <= rounded ? 1 : 0;
}

// --- Helpers ---

function getPlayersInRound(round: TournamentRound): Set<string> {
  const playerIds = new Set<string>();
  for (const matchup of round.matchups) {
    for (const id of matchup.playerIds) {
      playerIds.add(id);
    }
  }
  return playerIds;
}

function getTeamPlayersInRound(round: TournamentRound, teamPlayerIds: string[]): string[] {
  const inRound = getPlayersInRound(round);
  return teamPlayerIds.filter((id) => inRound.has(id));
}

function getAllScoresForRound(round: TournamentRound): GameScore[] {
  const allScores: GameScore[] = [];
  for (const matchup of round.matchups) {
    const scores = loadGameScores(matchup.id);
    if (scores) allScores.push(...scores);
  }
  return allScores;
}

function getPlayerNetOnHole(
  playerId: string,
  holeNumber: number,
  holeHandicap: number,
  playingHcap: number,
  numHoles: number,
  scores: GameScore[]
): number | null {
  const score = scores.find((s) => s.playerId === playerId && s.hole === holeNumber);
  if (!score) return null;
  const strokes = getMoneyStrokesOnHole(playingHcap, holeHandicap, numHoles);
  return score.grossScore - strokes;
}

// --- Team Nassau ---

export function computeTeamNassau(
  round: TournamentRound,
  tournament: Tournament,
  config: TeamNassauConfig
): RoundNassauResult | null {
  const holes = getHoleDataForRound(round);
  if (holes.length === 0) return null;

  const teamAPlayerIds = getTeamPlayersInRound(round, tournament.teams[0].playerIds);
  const teamBPlayerIds = getTeamPlayersInRound(round, tournament.teams[1].playerIds);
  if (teamAPlayerIds.length === 0 || teamBPlayerIds.length === 0) return null;

  const allScores = getAllScoresForRound(round);
  if (allScores.length === 0) return null;

  const allowance = config.allowance;
  const numHoles = holes.length;

  // Pre-compute playing handicaps for all players
  const hcapMap = new Map<string, number>();
  for (const pid of [...teamAPlayerIds, ...teamBPlayerIds]) {
    const player = tournament.players.find((p) => p.id === pid);
    if (player) {
      hcapMap.set(pid, getMoneyGamePlayingHandicap(player, round, allowance));
    }
  }

  const frontHoles = holes.filter((h) => h.number <= 9);
  const backHoles = holes.filter((h) => h.number > 9);

  function computeLegTotal(legHoles: typeof holes, teamIds: string[]): number {
    let total = 0;
    for (const hole of legHoles) {
      let bestNet: number | null = null;
      for (const playerId of teamIds) {
        const hcap = hcapMap.get(playerId) ?? 0;
        const net = getPlayerNetOnHole(playerId, hole.number, hole.handicap, hcap, numHoles, allScores);
        if (net !== null && (bestNet === null || net < bestNet)) {
          bestNet = net;
        }
      }
      if (bestNet !== null) total += bestNet;
    }
    return total;
  }

  const frontA = computeLegTotal(frontHoles, teamAPlayerIds);
  const frontB = computeLegTotal(frontHoles, teamBPlayerIds);
  const backA = computeLegTotal(backHoles, teamAPlayerIds);
  const backB = computeLegTotal(backHoles, teamBPlayerIds);
  const overallA = frontA + backA;
  const overallB = frontB + backB;

  function legResult(a: number, b: number): NassauLegResult {
    return {
      teamATotal: a,
      teamBTotal: b,
      winner: a < b ? 'A' : b < a ? 'B' : 'push',
    };
  }

  return {
    roundId: round.id,
    roundName: round.dayLabel || round.name,
    front: legResult(frontA, frontB),
    back: legResult(backA, backB),
    overall: legResult(overallA, overallB),
    teamAPlayerIds,
    teamBPlayerIds,
  };
}

// --- Per-hole best net scorecard data ---

export interface HoleBestNet {
  holeNumber: number;
  par: number;
  teamABestNet: number | null;
  teamBBestNet: number | null;
  winner: 'A' | 'B' | 'tie' | null;
}

export interface RoundBestNets {
  holes: HoleBestNet[];
  frontTotalA: number;
  frontTotalB: number;
  backTotalA: number;
  backTotalB: number;
  overallTotalA: number;
  overallTotalB: number;
  frontParThru: number;
  backParThru: number;
  overallParThru: number;
}

export function computeRoundBestNets(
  round: TournamentRound,
  tournament: Tournament,
  allowance: number
): RoundBestNets | null {
  const holes = getHoleDataForRound(round);
  if (holes.length === 0) return null;

  const teamAPlayerIds = getTeamPlayersInRound(round, tournament.teams[0].playerIds);
  const teamBPlayerIds = getTeamPlayersInRound(round, tournament.teams[1].playerIds);
  if (teamAPlayerIds.length === 0 || teamBPlayerIds.length === 0) return null;

  const allScores = getAllScoresForRound(round);
  if (allScores.length === 0) return null;

  const numHoles = holes.length;

  const hcapMap = new Map<string, number>();
  for (const pid of [...teamAPlayerIds, ...teamBPlayerIds]) {
    const player = tournament.players.find((p) => p.id === pid);
    if (player) {
      hcapMap.set(pid, getMoneyGamePlayingHandicap(player, round, allowance));
    }
  }

  const result: HoleBestNet[] = [];
  let frontTotalA = 0, frontTotalB = 0, backTotalA = 0, backTotalB = 0;
  let frontParThru = 0, backParThru = 0;

  for (const hole of holes) {
    let bestA: number | null = null;
    let bestB: number | null = null;

    for (const pid of teamAPlayerIds) {
      const hcap = hcapMap.get(pid) ?? 0;
      const net = getPlayerNetOnHole(pid, hole.number, hole.handicap, hcap, numHoles, allScores);
      if (net !== null && (bestA === null || net < bestA)) bestA = net;
    }

    for (const pid of teamBPlayerIds) {
      const hcap = hcapMap.get(pid) ?? 0;
      const net = getPlayerNetOnHole(pid, hole.number, hole.handicap, hcap, numHoles, allScores);
      if (net !== null && (bestB === null || net < bestB)) bestB = net;
    }

    let winner: 'A' | 'B' | 'tie' | null = null;
    if (bestA !== null && bestB !== null) {
      winner = bestA < bestB ? 'A' : bestB < bestA ? 'B' : 'tie';
    }

    const hasScore = bestA !== null || bestB !== null;
    if (bestA !== null) {
      if (hole.number <= 9) frontTotalA += bestA;
      else backTotalA += bestA;
    }
    if (bestB !== null) {
      if (hole.number <= 9) frontTotalB += bestB;
      else backTotalB += bestB;
    }
    if (hasScore) {
      if (hole.number <= 9) frontParThru += hole.par;
      else backParThru += hole.par;
    }

    result.push({ holeNumber: hole.number, par: hole.par, teamABestNet: bestA, teamBBestNet: bestB, winner });
  }

  return {
    holes: result,
    frontTotalA, frontTotalB,
    backTotalA, backTotalB,
    overallTotalA: frontTotalA + backTotalA,
    overallTotalB: frontTotalB + backTotalB,
    frontParThru,
    backParThru,
    overallParThru: frontParThru + backParThru,
  };
}

// --- Individual Skins ---

export function computeSkins(
  tournament: Tournament,
  config: SkinsConfig
): SkinsResult | null {
  const allHoles: SkinHole[] = [];
  const playerRoundCount = new Map<string, number>();

  for (let ri = 0; ri < tournament.rounds.length; ri++) {
    const round = tournament.rounds[ri];
    const holes = getHoleDataForRound(round);
    if (holes.length === 0) continue;

    const allScores = getAllScoresForRound(round);
    if (allScores.length === 0) continue;

    const playersInRound = getPlayersInRound(round);
    const numHoles = holes.length;
    const allowance = config.allowance;

    // Pre-compute playing handicaps
    const hcapMap = new Map<string, number>();
    for (const pid of playersInRound) {
      playerRoundCount.set(pid, (playerRoundCount.get(pid) || 0) + 1);
      const player = tournament.players.find((p) => p.id === pid);
      if (player) {
        hcapMap.set(pid, getMoneyGamePlayingHandicap(player, round, allowance));
      }
    }

    for (const hole of holes) {
      const playerScores: { playerId: string; netToPar: number }[] = [];

      for (const pid of playersInRound) {
        const hcap = hcapMap.get(pid) ?? 0;
        const net = getPlayerNetOnHole(pid, hole.number, hole.handicap, hcap, numHoles, allScores);
        if (net !== null) {
          playerScores.push({ playerId: pid, netToPar: net - hole.par });
        }
      }

      allHoles.push({
        roundIndex: ri,
        holeNumber: hole.number,
        par: hole.par,
        playerScores,
        winner: null,
        carryover: false,
      });
    }
  }

  if (allHoles.length === 0) return null;

  // Determine winners with carryover
  for (const hole of allHoles) {
    if (hole.playerScores.length === 0) {
      hole.carryover = true;
      continue;
    }

    const minScore = Math.min(...hole.playerScores.map((s) => s.netToPar));
    const winners = hole.playerScores.filter((s) => s.netToPar === minScore);

    if (winners.length === 1) {
      hole.winner = winners[0].playerId;
      hole.carryover = false;
    } else {
      hole.winner = null;
      hole.carryover = config.carryover;
    }
  }

  // Count skins per player
  const playerSkins = new Map<string, number>();
  let skinsAwarded = 0;

  if (config.carryover) {
    let pendingSkins = 0;
    for (const hole of allHoles) {
      pendingSkins++;
      if (hole.winner) {
        playerSkins.set(hole.winner, (playerSkins.get(hole.winner) || 0) + pendingSkins);
        skinsAwarded += pendingSkins;
        pendingSkins = 0;
      }
    }
  } else {
    for (const hole of allHoles) {
      if (hole.winner) {
        playerSkins.set(hole.winner, (playerSkins.get(hole.winner) || 0) + 1);
        skinsAwarded++;
      }
    }
  }

  // Compute pot
  let totalPot = 0;
  for (const [, rounds] of playerRoundCount) {
    totalPot += rounds * config.antePerRound;
  }

  const skinValue = skinsAwarded > 0 ? totalPot / skinsAwarded : 0;

  return {
    holes: allHoles,
    totalPot,
    skinsAwarded,
    skinValue,
    playerSkins,
  };
}

// --- Full Ledger ---

export function computeMoneyLedger(tournament: Tournament): MoneyLedger | null {
  const mg = tournament.moneyGames;
  if (!mg) return null;

  const nassauDetails: RoundNassauResult[] = [];
  const nassauConfig = mg.teamNassau;
  const skinsConfig = mg.skins;

  const playerNassau = new Map<string, number>();
  const playerRoundsPlayed = new Map<string, number>();
  const playerHcaps = new Map<string, number>();

  // Compute nassau per round
  if (nassauConfig) {
    for (const round of tournament.rounds) {
      const result = computeTeamNassau(round, tournament, nassauConfig);
      if (!result) continue;
      nassauDetails.push(result);

      for (const pid of [...result.teamAPlayerIds, ...result.teamBPlayerIds]) {
        playerRoundsPlayed.set(pid, (playerRoundsPlayed.get(pid) || 0) + 1);
        if (!playerHcaps.has(pid)) {
          const player = tournament.players.find((p) => p.id === pid);
          if (player) playerHcaps.set(pid, getMoneyGamePlayingHandicap(player, round, nassauConfig.allowance));
        }
      }

      const legs: { winner: 'A' | 'B' | 'push'; amount: number }[] = [
        { winner: result.front.winner, amount: nassauConfig.frontAmount },
        { winner: result.back.winner, amount: nassauConfig.backAmount },
        { winner: result.overall.winner, amount: nassauConfig.overallAmount },
      ];

      for (const leg of legs) {
        if (leg.winner === 'push') continue;
        const winTeamIds = leg.winner === 'A' ? result.teamAPlayerIds : result.teamBPlayerIds;
        const loseTeamIds = leg.winner === 'A' ? result.teamBPlayerIds : result.teamAPlayerIds;
        for (const pid of winTeamIds) {
          playerNassau.set(pid, (playerNassau.get(pid) || 0) + leg.amount);
        }
        for (const pid of loseTeamIds) {
          playerNassau.set(pid, (playerNassau.get(pid) || 0) - leg.amount);
        }
      }
    }
  }

  // Compute skins
  let skinsDetails: SkinsResult | null = null;
  const playerSkinsResult = new Map<string, number>();

  if (skinsConfig) {
    skinsDetails = computeSkins(tournament, skinsConfig);
    if (skinsDetails) {
      const roundsPerPlayer = new Map<string, number>();
      for (const round of tournament.rounds) {
        const inRound = getPlayersInRound(round);
        for (const pid of inRound) {
          roundsPerPlayer.set(pid, (roundsPerPlayer.get(pid) || 0) + 1);
          if (!playerHcaps.has(pid)) {
            const player = tournament.players.find((p) => p.id === pid);
            if (player) playerHcaps.set(pid, getMoneyGamePlayingHandicap(player, round, skinsConfig.allowance));
          }
        }
      }

      const allPlayerIds = new Set<string>();
      for (const round of tournament.rounds) {
        for (const matchup of round.matchups) {
          for (const pid of matchup.playerIds) allPlayerIds.add(pid);
        }
      }

      for (const pid of allPlayerIds) {
        const rounds = roundsPerPlayer.get(pid) || 0;
        const ante = rounds * skinsConfig.antePerRound;
        const skinsWon = skinsDetails.playerSkins.get(pid) || 0;
        const winnings = skinsWon * skinsDetails.skinValue;
        playerSkinsResult.set(pid, winnings - ante);

        if (!playerRoundsPlayed.has(pid)) {
          playerRoundsPlayed.set(pid, rounds);
        }
      }
    }
  }

  // Build ledger entries
  const players: PlayerLedgerEntry[] = [];
  const allPlayerIds = new Set<string>();
  for (const round of tournament.rounds) {
    for (const matchup of round.matchups) {
      for (const pid of matchup.playerIds) allPlayerIds.add(pid);
    }
  }

  for (const pid of allPlayerIds) {
    const player = tournament.players.find((p) => p.id === pid);
    if (!player) continue;

    const teamId = tournament.teams[0].playerIds.includes(pid)
      ? tournament.teams[0].id
      : tournament.teams[1].id;

    const nassauResult = playerNassau.get(pid) || 0;
    const skinsResult = playerSkinsResult.get(pid) || 0;

    players.push({
      playerId: pid,
      playerName: player.name,
      teamId,
      roundsPlayed: playerRoundsPlayed.get(pid) || 0,
      nassauResult,
      skinsResult,
      netResult: nassauResult + skinsResult,
      moneyHandicap: playerHcaps.get(pid),
    });
  }

  players.sort((a, b) => b.netResult - a.netResult);

  const totalInPlay = players
    .filter((p) => p.netResult > 0)
    .reduce((sum, p) => sum + p.netResult, 0);

  return { players, totalInPlay, nassauDetails, skinsDetails };
}

// --- Per-round player detail grid ---

export interface PlayerHoleDetail {
  holeNumber: number;
  par: number;
  gross: number | null;
  strokes: number;
  net: number | null;
  isBestNet: boolean;
}

export interface PlayerRoundDetail {
  playerId: string;
  playerName: string;
  teamId: string;
  playingHcap: number;
  strokeHoles: number[];
  holes: PlayerHoleDetail[];
}

export interface RoundPlayerDetails {
  roundId: string;
  roundName: string;
  players: PlayerRoundDetail[];
  teamABestNets: (number | null)[];
  teamBBestNets: (number | null)[];
}

export function computeRoundPlayerDetails(
  round: TournamentRound,
  tournament: Tournament,
  allowance: number
): RoundPlayerDetails | null {
  const holes = getHoleDataForRound(round);
  if (holes.length === 0) return null;

  const teamAPlayerIds = getTeamPlayersInRound(round, tournament.teams[0].playerIds);
  const teamBPlayerIds = getTeamPlayersInRound(round, tournament.teams[1].playerIds);
  const allPlayerIds = [...teamAPlayerIds, ...teamBPlayerIds];
  if (allPlayerIds.length === 0) return null;

  const allScores = getAllScoresForRound(round);
  if (allScores.length === 0) return null;

  const numHoles = holes.length;

  const hcapMap = new Map<string, number>();
  for (const pid of allPlayerIds) {
    const player = tournament.players.find((p) => p.id === pid);
    if (player) {
      hcapMap.set(pid, getMoneyGamePlayingHandicap(player, round, allowance));
    }
  }

  // Compute best nets per hole per team
  const teamABestNets: (number | null)[] = [];
  const teamBBestNets: (number | null)[] = [];

  for (const hole of holes) {
    let bestA: number | null = null;
    let bestB: number | null = null;
    for (const pid of teamAPlayerIds) {
      const hcap = hcapMap.get(pid) ?? 0;
      const net = getPlayerNetOnHole(pid, hole.number, hole.handicap, hcap, numHoles, allScores);
      if (net !== null && (bestA === null || net < bestA)) bestA = net;
    }
    for (const pid of teamBPlayerIds) {
      const hcap = hcapMap.get(pid) ?? 0;
      const net = getPlayerNetOnHole(pid, hole.number, hole.handicap, hcap, numHoles, allScores);
      if (net !== null && (bestB === null || net < bestB)) bestB = net;
    }
    teamABestNets.push(bestA);
    teamBBestNets.push(bestB);
  }

  // Build player details
  const players: PlayerRoundDetail[] = [];

  for (const pid of allPlayerIds) {
    const player = tournament.players.find((p) => p.id === pid);
    if (!player) continue;

    const playingHcap = hcapMap.get(pid) ?? 0;
    const teamId = teamAPlayerIds.includes(pid) ? tournament.teams[0].id : tournament.teams[1].id;
    const isTeamA = teamAPlayerIds.includes(pid);

    const strokeHoles: number[] = [];
    const playerHoles: PlayerHoleDetail[] = [];

    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i];
      const strokes = getMoneyStrokesOnHole(playingHcap, hole.handicap, numHoles);
      if (strokes > 0) strokeHoles.push(hole.number);

      const score = allScores.find((s) => s.playerId === pid && s.hole === hole.number);
      const gross = score ? score.grossScore : null;
      const net = gross !== null ? gross - strokes : null;

      const bestNets = isTeamA ? teamABestNets : teamBBestNets;
      const isBestNet = net !== null && bestNets[i] !== null && net === bestNets[i];

      playerHoles.push({ holeNumber: hole.number, par: hole.par, gross, strokes, net, isBestNet });
    }

    players.push({
      playerId: pid,
      playerName: player.name,
      teamId,
      playingHcap,
      strokeHoles,
      holes: playerHoles,
    });
  }

  return {
    roundId: round.id,
    roundName: round.dayLabel || round.name,
    players,
    teamABestNets,
    teamBBestNets,
  };
}
