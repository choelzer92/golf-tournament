import type { Player, CourseSelection, GameScore } from './game-state';
import type { TeamMode } from './formats';
import { supabase } from './supabase';
import { computePlayerStablefordPoints, computePlayerNetTotal, computeSplitMatchStatuses, computeNassauStatus } from './live-scoring';

export type TournamentMode = 'team-event' | 'flight-bracket';

export interface Team {
  id: string;
  name: string;
  playerIds: string[];
}

export interface MatchupResult {
  winningTeamId: string | null;
  pointsTeamA: number;
  pointsTeamB: number;
  summary: string;
}

export interface RoundMatchup {
  id: string;
  groupLabel: string;
  playerIds: string[];
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  gameId: string | null;
  result: MatchupResult | null;
}

export type BonusType =
  | 'match-winner'
  | 'best-individual-stableford'
  | 'best-individual-net'
  | 'junk'
  | 'nassau-front'
  | 'nassau-back'
  | 'nassau-overall'
  | 'custom';

export interface RoundBonus {
  id: string;
  type: BonusType;
  name: string;
  points: number;
  scope: 'per-matchup' | 'per-tournament-round';
  result?: {
    winningTeamId?: string;
    winningPlayerId?: string;
    detail?: string;
    // Per-matchup bonuses: track wins per team for proper point allocation
    teamAWins?: number;
    teamBWins?: number;
    ties?: number;
  };
}

export interface SplitPairing {
  playerIds: [string, string];
}

export interface SplitFormatConfig {
  formatId: string;
  teamMode: TeamMode;
  scoringMethod: 'match-play' | 'stroke-play';
  pointsForWin: number;
  pointsForTie: number;
  pointsForLoss: number;
  handicapAllowance: number;
  strokeMethod: 'full' | 'off-the-low';
  formatSettings?: Record<string, string | number | boolean>;
  pairings?: SplitPairing[];
}

export interface TournamentRound {
  id: string;
  name: string;
  dayLabel: string;
  formatId: string;
  teamMode: TeamMode;
  course: CourseSelection | null;
  holesPlaying: '18' | 'front9' | 'back9';
  groupingMode: 'same-team' | 'cross-team';
  scoringMethod: 'match-play' | 'stroke-play';
  pointsForWin: number;
  pointsForTie: number;
  pointsForLoss: number;
  tournamentPointMode?: 'fixed' | 'margin-based';
  marginDivisor?: number;
  marginBaseline?: number;
  handicapAllowance: number;
  strokeMethod: 'full' | 'off-the-low';
  handicapBasis: 'course' | 'index';
  defaultTeeId: number | null;
  formatSettings?: Record<string, string | number | boolean>;
  splitFormat?: SplitFormatConfig;
  bonuses: RoundBonus[];
  matchups: RoundMatchup[];
  status: 'pending' | 'in-progress' | 'completed';
  order: number;
}

export type DisplayMode = 'points-race' | 'ryder-cup';

export interface Tournament {
  id: string;
  name: string;
  mode: 'team-event';
  source?: 'quick-game' | 'tournament' | 'money-game';
  displayMode?: DisplayMode;
  targetScore?: number;
  players: Player[];
  teams: [Team, Team];
  rounds: TournamentRound[];
  status: 'setup' | 'active' | 'completed';
  moneyConfig?: { nassauFront: number; nassauBack: number; nassauOverall: number; birdieValue: number; eagleValue: number };
}

export interface TournamentListItem {
  id: string;
  name: string;
  status: 'setup' | 'active' | 'completed';
  teamAName: string;
  teamBName: string;
  teamAPoints: number;
  teamBPoints: number;
}

export interface TournamentGameContext {
  tournamentId: string;
  roundId: string;
  matchupId: string;
}

// In-memory cache for synchronous reads
const tournamentCache = new Map<string, Tournament>();
const scoresCache = new Map<string, any>();

export function saveTournament(tournament: Tournament) {
  tournamentCache.set(tournament.id, tournament);
  supabase.from('tournaments').upsert({
    id: tournament.id,
    data: tournament,
    updated_at: new Date().toISOString(),
  }).then();
}

export function saveGameScores(matchupId: string, scores: any) {
  scoresCache.set(matchupId, scores);
  supabase.from('game_scores').upsert({
    matchup_id: matchupId,
    data: scores,
    updated_at: new Date().toISOString(),
  }).then();
}

export function loadGameScores(matchupId: string): any | null {
  return scoresCache.get(matchupId) || null;
}

export function loadTournament(id: string): Tournament | null {
  return tournamentCache.get(id) || null;
}

export function getTournamentList(): TournamentListItem[] {
  const list: TournamentListItem[] = [];
  for (const t of tournamentCache.values()) {
    const standings = computeStandings(t);
    list.push({
      id: t.id,
      name: t.name,
      status: t.status,
      teamAName: t.teams[0].name,
      teamBName: t.teams[1].name,
      teamAPoints: standings.teamAPoints,
      teamBPoints: standings.teamBPoints,
    });
  }
  return list;
}

// Fetch all tournaments from Supabase into cache
export async function hydrateTournaments(): Promise<void> {
  const { data } = await supabase.from('tournaments').select('id, data');
  if (data) {
    for (const row of data) {
      tournamentCache.set(row.id, row.data as Tournament);
    }
  }
}

// Fetch a single tournament from Supabase into cache
export async function fetchTournament(id: string): Promise<Tournament | null> {
  const cached = tournamentCache.get(id);
  if (cached) return cached;
  const { data } = await supabase.from('tournaments').select('data').eq('id', id).single();
  if (data) {
    const t = data.data as Tournament;
    tournamentCache.set(id, t);
    return t;
  }
  return null;
}

// Fetch scores for a matchup from Supabase into cache
export async function fetchGameScores(matchupId: string): Promise<any | null> {
  const cached = scoresCache.get(matchupId);
  if (cached) return cached;
  const { data } = await supabase.from('game_scores').select('data').eq('matchup_id', matchupId).single();
  if (data) {
    scoresCache.set(matchupId, data.data);
    return data.data;
  }
  return null;
}

// Subscribe to realtime score changes for a matchup
let scoreChannelCounter = 0;
export function subscribeToScores(matchupId: string, onUpdate: (scores: any) => void) {
  const channelName = `scores:${matchupId}:${++scoreChannelCounter}`;
  return supabase
    .channel(channelName)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'game_scores',
      filter: `matchup_id=eq.${matchupId}`,
    }, (payload) => {
      const scores = (payload.new as any)?.data;
      if (scores) {
        scoresCache.set(matchupId, scores);
        onUpdate(scores);
      }
    })
    .subscribe();
}

// Subscribe to realtime tournament changes
export function subscribeToTournament(id: string, onUpdate: (tournament: Tournament) => void) {
  return supabase
    .channel(`tournament:${id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tournaments',
      filter: `id=eq.${id}`,
    }, (payload) => {
      const tournament = (payload.new as any)?.data as Tournament;
      if (tournament) {
        tournamentCache.set(id, tournament);
        onUpdate(tournament);
      }
    })
    .subscribe();
}

export function exportTournament(id: string): string | null {
  const tournament = loadTournament(id);
  if (!tournament) return null;

  const matchupIds = tournament.rounds.flatMap((r) => r.matchups.map((m) => m.id));
  const scores: Record<string, any> = {};
  for (const mid of matchupIds) {
    const s = scoresCache.get(mid);
    if (s) scores[mid] = s;
  }

  return JSON.stringify({ tournament, scores, exportedAt: new Date().toISOString() }, null, 2);
}

export function importTournament(json: string): Tournament | null {
  try {
    const data = JSON.parse(json);
    const tournament: Tournament = data.tournament;
    if (!tournament || !tournament.id) return null;

    saveTournament(tournament);

    if (data.scores) {
      for (const [matchupId, scoreData] of Object.entries(data.scores)) {
        saveGameScores(matchupId, scoreData as any);
      }
    }

    return tournament;
  } catch {
    return null;
  }
}

export interface JunkDetail {
  birdies: number;
  eagles: number;
  albatrosses: number;
  groupHugs: number;
  total: number;
}

export interface BonusComputationResult {
  winningTeamId: string | null;
  winningPlayerId?: string;
  detail: string;
}

export function computeJunkForMatchup(
  scores: GameScore[],
  matchup: RoundMatchup,
  tournament: Tournament,
  course: CourseSelection | null
): { teamA: JunkDetail; teamB: JunkDetail } {
  const teamAIds = new Set(matchup.teamAPlayerIds);
  const teamBIds = new Set(matchup.teamBPlayerIds);
  const tee = course?.teeSets.find((t) => t.id === course.selectedTeeId) || course?.teeSets[0];
  const holes = tee?.holes.sort((a, b) => a.number - b.number) || [];

  const teamA: JunkDetail = { birdies: 0, eagles: 0, albatrosses: 0, groupHugs: 0, total: 0 };
  const teamB: JunkDetail = { birdies: 0, eagles: 0, albatrosses: 0, groupHugs: 0, total: 0 };

  for (const hole of holes) {
    const par = hole.par;
    let teamAAllParOrBetter = true;
    let teamACount = 0;
    let teamBAllParOrBetter = true;
    let teamBCount = 0;

    for (const score of scores) {
      if (score.hole !== hole.number) continue;
      const diff = score.grossScore - par;
      const isTeamA = teamAIds.has(score.playerId);
      const isTeamB = teamBIds.has(score.playerId);

      if (isTeamA) {
        teamACount++;
        if (diff <= -3) teamA.albatrosses++;
        else if (diff === -2) teamA.eagles++;
        else if (diff === -1) teamA.birdies++;
        if (diff > 0) teamAAllParOrBetter = false;
      } else if (isTeamB) {
        teamBCount++;
        if (diff <= -3) teamB.albatrosses++;
        else if (diff === -2) teamB.eagles++;
        else if (diff === -1) teamB.birdies++;
        if (diff > 0) teamBAllParOrBetter = false;
      }
    }

    if (teamAAllParOrBetter && teamACount === matchup.teamAPlayerIds.length && teamACount > 0) {
      teamA.groupHugs++;
    }
    if (teamBAllParOrBetter && teamBCount === matchup.teamBPlayerIds.length && teamBCount > 0) {
      teamB.groupHugs++;
    }
  }

  teamA.total = teamA.birdies + teamA.eagles * 2 + teamA.albatrosses * 3 + teamA.groupHugs;
  teamB.total = teamB.birdies + teamB.eagles * 2 + teamB.albatrosses * 3 + teamB.groupHugs;
  return { teamA, teamB };
}

function formatJunkDetail(d: JunkDetail): string {
  const parts: string[] = [];
  if (d.birdies > 0) parts.push(`${d.birdies} birdie${d.birdies !== 1 ? 's' : ''}`);
  if (d.eagles > 0) parts.push(`${d.eagles} eagle${d.eagles !== 1 ? 's' : ''}`);
  if (d.albatrosses > 0) parts.push(`${d.albatrosses} albatross`);
  if (d.groupHugs > 0) parts.push(`${d.groupHugs} group hug${d.groupHugs !== 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(', ') : 'none';
}

export function computeBonuses(
  round: TournamentRound,
  tournament: Tournament
): RoundBonus[] {
  const updatedBonuses = [...round.bonuses];

  for (let i = 0; i < updatedBonuses.length; i++) {
    const bonus = updatedBonuses[i];
    if (bonus.result) continue;

    if (bonus.type === 'match-winner' && bonus.scope === 'per-matchup') {
      const allDone = round.matchups.every((m) => m.result !== null);
      if (!allDone) continue;

      let aWins = 0;
      let bWins = 0;
      let ties = 0;
      const details: string[] = [];

      for (const matchup of round.matchups) {
        if (!matchup.result) continue;
        const scores: GameScore[] | null = loadGameScores(matchup.id);

        // Split format with individual pairings: count each sub-match
        if (round.splitFormat && round.splitFormat.teamMode === 'individual' && round.splitFormat.pairings && round.splitFormat.pairings.length > 0 && scores) {
          const splitStatuses = computeSplitMatchStatuses(scores, matchup, round, tournament);
          if (splitStatuses) {
            for (const sm of splitStatuses) {
              if (sm.status.thru === 0) continue;
              const pts = sm.type === 'team'
                ? { win: round.pointsForWin, tie: round.pointsForTie }
                : { win: round.splitFormat.pointsForWin ?? round.pointsForWin, tie: round.splitFormat.pointsForTie ?? round.pointsForTie };
              const ptsA = sm.status.holesWonA * pts.win + sm.status.holesTied * pts.tie;
              const ptsB = sm.status.holesWonB * pts.win + sm.status.holesTied * pts.tie;
              if (ptsA > ptsB) aWins++;
              else if (ptsB > ptsA) bWins++;
              else ties++;
              const diff = sm.status.holesWonA - sm.status.holesWonB;
              const winner = ptsA > ptsB ? tournament.teams[0].name
                : ptsB > ptsA ? tournament.teams[1].name : 'Tied';
              details.push(`${sm.label}: ${winner}`);
            }
            continue;
          }
        }

        // Standard: one matchup = one winner
        if (matchup.result.winningTeamId === 'team-a') aWins++;
        else if (matchup.result.winningTeamId === 'team-b') bWins++;
        else ties++;
        const label = matchup.result.winningTeamId === 'team-a' ? tournament.teams[0].name
          : matchup.result.winningTeamId === 'team-b' ? tournament.teams[1].name : 'Tied';
        details.push(`${matchup.groupLabel}: ${label}`);
      }

      updatedBonuses[i] = { ...bonus, result: { winningTeamId: undefined, teamAWins: aWins, teamBWins: bWins, ties, detail: details.join(' · ') } };
    }

    if (bonus.type === 'junk') {
      const allDone = round.matchups.every((m) => m.result !== null);
      if (!allDone) continue;

      let totalA = 0;
      let totalB = 0;
      const details: string[] = [];

      if (bonus.scope === 'per-tournament-round') {
        for (const matchup of round.matchups) {
          const scores = loadGameScores(matchup.id);
          if (!scores) continue;
          const junk = computeJunkForMatchup(scores, matchup, tournament, round.course);
          totalA += junk.teamA.total;
          totalB += junk.teamB.total;
        }
        details.push(`${tournament.teams[0].name}: ${totalA} pts`);
        details.push(`${tournament.teams[1].name}: ${totalB} pts`);
      } else {
        for (const matchup of round.matchups) {
          const scores = loadGameScores(matchup.id);
          if (!scores) continue;
          const junk = computeJunkForMatchup(scores, matchup, tournament, round.course);
          totalA += junk.teamA.total;
          totalB += junk.teamB.total;
        }
        details.push(`${tournament.teams[0].name}: ${totalA}`);
        details.push(`${tournament.teams[1].name}: ${totalB}`);
      }

      let winningTeamId: string | undefined;
      if (totalA > totalB) winningTeamId = tournament.teams[0].id;
      else if (totalB > totalA) winningTeamId = tournament.teams[1].id;

      updatedBonuses[i] = {
        ...bonus,
        result: { winningTeamId, detail: details.join(' · ') },
      };
    }

    if (bonus.type === 'best-individual-net') {
      const allDone = round.matchups.every((m) => m.result !== null);
      if (!allDone) continue;

      if (bonus.scope === 'per-matchup') {
        let teamAWins = 0;
        let teamBWins = 0;
        let ties = 0;
        const winners: string[] = [];
        for (const matchup of round.matchups) {
          let bestNet = Infinity;
          const topPlayers: { playerId: string; net: number }[] = [];
          const scores: GameScore[] | null = loadGameScores(matchup.id);
          if (!scores) continue;
          for (const playerId of matchup.playerIds) {
            const netTotal = computePlayerNetTotal(scores, playerId, matchup, round, tournament);
            if (netTotal === null) continue;
            if (netTotal < bestNet) { bestNet = netTotal; topPlayers.length = 0; topPlayers.push({ playerId, net: netTotal }); }
            else if (netTotal === bestNet) { topPlayers.push({ playerId, net: netTotal }); }
          }
          if (topPlayers.length === 0) continue;
          const aWinners = topPlayers.filter((p) => tournament.teams[0].playerIds.includes(p.playerId));
          const bWinners = topPlayers.filter((p) => tournament.teams[1].playerIds.includes(p.playerId));
          if (aWinners.length > 0 && bWinners.length === 0) { teamAWins++; winners.push(`${tournament.players.find((p) => p.id === aWinners[0].playerId)?.name?.split(' ')[0]} (${bestNet})`); }
          else if (bWinners.length > 0 && aWinners.length === 0) { teamBWins++; winners.push(`${tournament.players.find((p) => p.id === bWinners[0].playerId)?.name?.split(' ')[0]} (${bestNet})`); }
          else { ties++; winners.push(`Tied (${bestNet})`); }
        }
        updatedBonuses[i] = { ...bonus, result: { winningTeamId: undefined, teamAWins, teamBWins, ties, detail: winners.join(' · ') } };
      } else {
        let bestNet = Infinity;
        let bestId: string | null = null;
        for (const matchup of round.matchups) {
          const scores: GameScore[] | null = loadGameScores(matchup.id);
          if (!scores) continue;
          for (const playerId of matchup.playerIds) {
            const netTotal = computePlayerNetTotal(scores, playerId, matchup, round, tournament);
            if (netTotal !== null && netTotal < bestNet) { bestNet = netTotal; bestId = playerId; }
          }
        }
        if (bestId) {
          const player = tournament.players.find((p) => p.id === bestId);
          const teamId = tournament.teams[0].playerIds.includes(bestId)
            ? tournament.teams[0].id : tournament.teams[1].id;
          const teamName = tournament.teams[0].playerIds.includes(bestId)
            ? tournament.teams[0].name : tournament.teams[1].name;
          updatedBonuses[i] = {
            ...bonus,
            result: { winningTeamId: teamId, winningPlayerId: bestId, detail: `${player?.name || 'Unknown'} (${bestNet}) — ${teamName}` },
          };
        }
      }
    }

    if (bonus.type === 'nassau-front' || bonus.type === 'nassau-back' || bonus.type === 'nassau-overall') {
      const allDone = round.matchups.every((m) => m.result !== null);
      if (!allDone) continue;

      const label = bonus.type === 'nassau-front' ? 'Front 9' : bonus.type === 'nassau-back' ? 'Back 9' : 'Overall';

      if (round.scoringMethod === 'match-play') {
        if (bonus.scope === 'per-matchup') {
          let teamAWins = 0;
          let teamBWins = 0;
          let ties = 0;
          const details: string[] = [];

          for (const matchup of round.matchups) {
            const scores: GameScore[] | null = loadGameScores(matchup.id);
            if (!scores) continue;
            const nassau = computeNassauStatus(scores, matchup, round, tournament);
            if (!nassau) continue;
            const bucket = bonus.type === 'nassau-front' ? nassau.front
              : bonus.type === 'nassau-back' ? nassau.back : nassau.overall;
            if (bucket.thru === 0) continue;
            if (bucket.holesWonA > bucket.holesWonB) { teamAWins++; details.push(`${matchup.groupLabel}: ${tournament.teams[0].name}`); }
            else if (bucket.holesWonB > bucket.holesWonA) { teamBWins++; details.push(`${matchup.groupLabel}: ${tournament.teams[1].name}`); }
            else { ties++; details.push(`${matchup.groupLabel}: Tied`); }
          }

          updatedBonuses[i] = { ...bonus, result: { winningTeamId: undefined, teamAWins, teamBWins, ties, detail: `${label}: ${details.join(' · ')}` } };
        } else {
          let totalWonA = 0;
          let totalWonB = 0;

          for (const matchup of round.matchups) {
            const scores: GameScore[] | null = loadGameScores(matchup.id);
            if (!scores) continue;
            const nassau = computeNassauStatus(scores, matchup, round, tournament);
            if (!nassau) continue;
            const bucket = bonus.type === 'nassau-front' ? nassau.front
              : bonus.type === 'nassau-back' ? nassau.back : nassau.overall;
            totalWonA += bucket.holesWonA;
            totalWonB += bucket.holesWonB;
          }

          let winningTeamId: string | undefined;
          if (totalWonA > totalWonB) winningTeamId = tournament.teams[0].id;
          else if (totalWonB > totalWonA) winningTeamId = tournament.teams[1].id;

          updatedBonuses[i] = {
            ...bonus,
            result: { winningTeamId, detail: `${label}: ${totalWonA}W—${totalWonB}W` },
          };
        }
      } else {
        const tee = round.course?.teeSets.find((t) => t.id === (round.defaultTeeId || round.course?.teeSets[0]?.id)) || round.course?.teeSets[0];
        const allHoles = (tee?.holes || []).sort((a, b) => a.number - b.number);
        const targetHoles = bonus.type === 'nassau-front'
          ? allHoles.filter((h) => h.number <= 9)
          : bonus.type === 'nassau-back'
          ? allHoles.filter((h) => h.number > 9)
          : allHoles;

        let totalNetA = 0;
        let totalNetB = 0;
        let countA = 0;
        let countB = 0;

        for (const matchup of round.matchups) {
          const scores: GameScore[] | null = loadGameScores(matchup.id);
          if (!scores) continue;

          for (const hole of targetHoles) {
            for (const playerId of matchup.teamAPlayerIds) {
              const sc = scores.find((s) => s.playerId === playerId && s.hole === hole.number);
              if (sc) { totalNetA += sc.grossScore; countA++; }
            }
            for (const playerId of matchup.teamBPlayerIds) {
              const sc = scores.find((s) => s.playerId === playerId && s.hole === hole.number);
              if (sc) { totalNetB += sc.grossScore; countB++; }
            }
          }
        }

        if (countA === 0 && countB === 0) continue;

        let winningTeamId: string | undefined;
        if (totalNetA < totalNetB) winningTeamId = tournament.teams[0].id;
        else if (totalNetB < totalNetA) winningTeamId = tournament.teams[1].id;

        updatedBonuses[i] = {
          ...bonus,
          result: {
            winningTeamId,
            detail: `${label}: ${tournament.teams[0].name} ${totalNetA} — ${tournament.teams[1].name} ${totalNetB}`,
          },
        };
      }
    }

    if (bonus.type === 'best-individual-stableford') {
      const allDone = round.matchups.every((m) => m.result !== null);
      if (!allDone) continue;

      if (bonus.scope === 'per-matchup') {
        let teamAWins = 0;
        let teamBWins = 0;
        let ties = 0;
        const winners: string[] = [];
        for (const matchup of round.matchups) {
          const scores: GameScore[] | null = loadGameScores(matchup.id);
          if (!scores) continue;
          let best = -Infinity;
          const topPlayers: { playerId: string; points: number }[] = [];
          for (const playerId of matchup.playerIds) {
            const total = computePlayerStablefordPoints(scores, playerId, matchup, round, tournament);
            if (total > best) { best = total; topPlayers.length = 0; topPlayers.push({ playerId, points: total }); }
            else if (total === best && total > 0) { topPlayers.push({ playerId, points: total }); }
          }
          if (topPlayers.length === 0) continue;
          const aWinners = topPlayers.filter((p) => tournament.teams[0].playerIds.includes(p.playerId));
          const bWinners = topPlayers.filter((p) => tournament.teams[1].playerIds.includes(p.playerId));
          if (aWinners.length > 0 && bWinners.length === 0) { teamAWins++; winners.push(`${tournament.players.find((p) => p.id === aWinners[0].playerId)?.name?.split(' ')[0]} (${best})`); }
          else if (bWinners.length > 0 && aWinners.length === 0) { teamBWins++; winners.push(`${tournament.players.find((p) => p.id === bWinners[0].playerId)?.name?.split(' ')[0]} (${best})`); }
          else { ties++; winners.push(`Tied (${best})`); }
        }
        updatedBonuses[i] = { ...bonus, result: { winningTeamId: undefined, teamAWins, teamBWins, ties, detail: winners.join(' · ') } };
      } else {
        let best = -Infinity;
        let bestId: string | null = null;
        for (const matchup of round.matchups) {
          const scores: GameScore[] | null = loadGameScores(matchup.id);
          if (!scores) continue;
          for (const playerId of matchup.playerIds) {
            const total = computePlayerStablefordPoints(scores, playerId, matchup, round, tournament);
            if (total > best) { best = total; bestId = playerId; }
          }
        }
        if (bestId) {
          const player = tournament.players.find((p) => p.id === bestId);
          const teamId = tournament.teams[0].playerIds.includes(bestId)
            ? tournament.teams[0].id : tournament.teams[1].id;
          const teamName = tournament.teams[0].playerIds.includes(bestId)
            ? tournament.teams[0].name : tournament.teams[1].name;
          updatedBonuses[i] = {
            ...bonus,
            result: { winningTeamId: teamId, winningPlayerId: bestId, detail: `${player?.name || 'Unknown'} (${best} pts) — ${teamName}` },
          };
        }
      }
    }
  }

  return updatedBonuses;
}

export function computeStandings(tournament: Tournament) {
  let teamAPoints = 0;
  let teamBPoints = 0;
  const roundResults: { roundId: string; teamAPoints: number; teamBPoints: number }[] = [];

  for (const round of tournament.rounds) {
    let roundA = 0;
    let roundB = 0;
    for (const matchup of round.matchups) {
      if (matchup.result) {
        roundA += matchup.result.pointsTeamA;
        roundB += matchup.result.pointsTeamB;
      }
    }
    for (const bonus of round.bonuses || []) {
      if (!bonus.result) continue;
      if (bonus.scope === 'per-matchup' && (bonus.result.teamAWins != null || bonus.result.teamBWins != null)) {
        const aWins = bonus.result.teamAWins || 0;
        const bWins = bonus.result.teamBWins || 0;
        const ties = bonus.result.ties || 0;
        roundA += aWins * bonus.points + ties * bonus.points * 0.5;
        roundB += bWins * bonus.points + ties * bonus.points * 0.5;
      } else if (bonus.result.winningTeamId === tournament.teams[0].id) {
        roundA += bonus.points;
      } else if (bonus.result.winningTeamId === tournament.teams[1].id) {
        roundB += bonus.points;
      } else if (bonus.result.winningTeamId === undefined || bonus.result.winningTeamId === null) {
        // Tied — split the points
        roundA += bonus.points * 0.5;
        roundB += bonus.points * 0.5;
      }
    }
    teamAPoints += roundA;
    teamBPoints += roundB;
    roundResults.push({ roundId: round.id, teamAPoints: roundA, teamBPoints: roundB });
  }

  return { teamAPoints, teamBPoints, roundResults };
}
