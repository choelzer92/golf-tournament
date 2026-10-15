import type { Player, CourseSelection, GameScore } from './game-state';
import type { TeamMode } from './formats';
import { supabase } from './supabase';
import { cellsToScores, changedCells, overlayPending, replaceCells, type CellWrite, type ScoreCellRow } from './score-cells';
import { createOutbox } from './score-outbox';
import { gameVisibleTo, type Viewer } from './game-visibility';
import { computePlayerStablefordPoints, computePlayerNetTotal, computeSplitMatchStatuses, computeNassauStatus, computeLiveMatchStatus, recomputeMatchResult, getHoleDataForRound, getPlayerStrokesForHole } from './live-scoring';
import { computeStandingsN, teamsOf } from './tournament-standings';

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
  playerTeeOverrides?: Record<string, number>;
  formatSettings?: Record<string, string | number | boolean>;
  splitFormat?: SplitFormatConfig;
  bonuses: RoundBonus[];
  matchups: RoundMatchup[];
  status: 'pending' | 'in-progress' | 'completed';
  order: number;
}

export type DisplayMode = 'points-race' | 'ryder-cup';

export interface TeamNassauConfig {
  frontAmount: number;
  backAmount: number;
  overallAmount: number;
  method: 'best-net';
  allowance: number; // percentage of full course handicap (default 75 for best-1-of-4 stroke play)
}

export interface SkinsConfig {
  antePerRound: number;
  carryover: boolean;
  crossRound: boolean;
  basis: 'net-to-par';
  allowance: number; // percentage of full course handicap (default 75 for best-1-of-4 stroke play)
}

export interface TournamentMoneyGames {
  teamNassau?: TeamNassauConfig;
  skins?: SkinsConfig;
  // A SPLIT round (§5.cs Q3) is 18 holes whose tournament points change format at the turn; the
  // money games on it are 18-hole bets. '18' (absent = this): the 18-hole course handicap on the
  // card's 18-hole stroke index — the standard. 'per-nine': each nine on its own 9-hole rating, as
  // the tournament's front and back matches are. Craig 2026-10-12: option 1, "but if they want to
  // play by 9 hole ratings, that should be chooseable".
  splitRoundHandicap?: '18' | 'per-nine';
}

export interface SideGameTeam {
  id: string;
  name: string;
  playerIds: string[];
  linkedMatchupId: string | null;
}

export interface SideGameNassauConfig {
  entryPerTeam: number;
  payoutSplit?: number[];
}

export interface SideGame {
  id: string;
  name: string;
  linkedRoundId: string;
  course: CourseSelection | null;
  teams: SideGameTeam[];
  players: Player[];
  ownMatchupId: string;
  nassauConfig: SideGameNassauConfig;
  handicapAllowance: number;
  strokeMethod: 'full' | 'off-the-low';
  status: 'active' | 'completed';
}

export interface HypeMatchup {
  playerA: string;
  handicapA: string;
  playerB: string;
  handicapB: string;
  callout: string;
}

export interface HypeRoundSection {
  title: string;
  points: string;
  lines: string[];
}

export interface HypeRound {
  title: string;
  subtitle: string;
  description: string[];
  detail?: string;
  intensity?: string[];
  sections?: HypeRoundSection[];
  bonuses?: string[];
}

export interface HypeContent {
  tagline: string;
  intro: string[];
  rounds: HypeRound[];
  matchups: HypeMatchup[];
  closer: { title: string; lines: string[] };
  finalWords: string[];
}

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
  moneyGames?: TournamentMoneyGames;
  sideGames?: SideGame[];
  hypeContent?: HypeContent;
  recapEnabled?: boolean;
  sourceGroupId?: string;   // the saved group this event was created FROM (exact stats/ledger link; absent = made outside a group). See lib/stats-ledger.ts
  // Event spine slice 1 (§5.bu, writers first §5.be): who made it, and when. Written on NEW
  // tournaments only; a legacy row has neither and stays visible to everyone (§4 option A).
  createdByGhin?: number;
  createdAt?: string;
}

export interface TournamentListItem {
  id: string;
  name: string;
  status: 'setup' | 'active' | 'completed';
  teamAName: string;
  teamBName: string;
  teamAPoints: number;
  teamBPoints: number;
  sourceGroupId?: string;   // §5.ck: Home lists games under their group
}

export interface TournamentGameContext {
  tournamentId: string;
  roundId: string;
  matchupId: string;
}

// In-memory cache for synchronous reads
const tournamentCache = new Map<string, Tournament>();
const scoresCache = new Map<string, any>();
// The last snapshot actually PERSISTED (or fetched) per matchup — the audit
// baseline. It must be separate from scoresCache: the play page writes
// scoresCache on every keystroke (via cacheGameScores) but only calls
// saveGameScores on a debounce, so scoresCache already holds the new value by
// save time. Diffing against this persisted baseline captures the real net
// change between server writes.
const lastPersistedScores = new Map<string, GameScore[]>();

export function saveTournament(tournament: Tournament) {
  tournamentCache.set(tournament.id, tournament);
  supabase.from('tournaments').upsert({
    id: tournament.id,
    data: tournament,
    updated_at: new Date().toISOString(),
  }).then();
}

// SCORES ARE PER CELL (F-063 option C, §5.ce / §5.dn). A save sends only the cells it changed, as
// rows of `score_cells`, through the OUTBOX: queued in localStorage first, sent, and dropped only once
// the server acknowledges them. So two phones can't erase each other's taps, and a dead spot, a
// reload or a killed tab loses nothing. The server's `upsert_score_cells` applies the conflict rule
// (the later TAP wins, §5.dn) and writes `score_audit` itself, so the audit can't be dropped either.
// The rest of the app still reads one `GameScore[]` per matchup (`cellsToScores`).
const scoreOutbox = createOutbox({
  storage: typeof localStorage !== 'undefined' ? localStorage : null,
  send: async (cells: CellWrite[]) => {
    const { error } = await supabase.rpc('upsert_score_cells', { p_cells: cells });
    return !error;
  },
  schedule: (fn, ms) => { setTimeout(fn, ms); },
});

// Drain what an earlier visit left queued, from whichever page the app opens on (this module is
// imported by every scoring surface), and again whenever the phone comes back online or awake.
let outboxStarted = false;
export function startScoreOutbox() {
  if (outboxStarted || typeof window === 'undefined') return;
  outboxStarted = true;
  window.addEventListener('online', () => { void scoreOutbox.drain(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void scoreOutbox.drain();
  });
  void scoreOutbox.drain();
}
startScoreOutbox();

/** Cells tapped on this device that the server hasn't acknowledged yet (all matchups, or one). */
export function pendingScoreCells(matchupId?: string): CellWrite[] {
  return scoreOutbox.pending(matchupId);
}

/**
 * Save a card. Sends every score that is new or changed since the server's last copy; never a
 * clear (the card never clears a score, and a clear read from ABSENCE would erase another phone's
 * tap). `ownedPlayerIds` (tournament split scoring) limits it to the players this phone scores.
 */
export function saveGameScores(matchupId: string, scores: any, ownedPlayerIds?: string[]) {
  const next: GameScore[] = Array.isArray(scores) ? scores : [];
  const baseline = lastPersistedScores.get(matchupId) ?? [];
  const writes = changedCells(matchupId, baseline, next, new Date().toISOString(), ownedPlayerIds);
  scoresCache.set(matchupId, scores);
  lastPersistedScores.set(matchupId, overlayPending(baseline, writes));
  scoreOutbox.push(writes);
}

/**
 * REPLACE a card with exactly `scores` (a rebalance emptying a group, a reshape moving a player, a
 * tournament reset): every cell it knows of that isn't in `scores` is cleared (a tombstone).
 */
export function replaceGameScores(matchupId: string, scores: GameScore[]) {
  const known = [...(lastPersistedScores.get(matchupId) ?? []), ...((scoresCache.get(matchupId) as GameScore[] | undefined) ?? [])];
  const writes = replaceCells(matchupId, known, scores, new Date().toISOString());
  scoresCache.set(matchupId, scores);
  lastPersistedScores.set(matchupId, scores.map((x) => ({ ...x })));
  scoreOutbox.push(writes);
}

export function cacheGameScores(matchupId: string, scores: any) {
  scoresCache.set(matchupId, scores);
}

export interface ScoreAuditEntry {
  matchupId: string;
  playerId: string;
  hole: number;
  oldScore: number | null;
  newScore: number | null;
  changedAt: string;
}

// Read the score-change history for a set of matchups (a pool game's foursomes),
// newest first. Returns [] if the audit table isn't present yet.
export async function fetchScoreAudit(matchupIds: string[]): Promise<ScoreAuditEntry[]> {
  if (matchupIds.length === 0) return [];
  const { data, error } = await supabase
    .from('score_audit')
    .select('matchup_id, player_id, hole, old_score, new_score, changed_at')
    .in('matchup_id', matchupIds)
    .order('changed_at', { ascending: false })
    .limit(1000);
  if (error || !data) return [];
  return data.map((r: {
    matchup_id: string; player_id: string; hole: number; old_score: number | null; new_score: number | null; changed_at: string;
  }) => ({
    matchupId: r.matchup_id,
    playerId: r.player_id,
    hole: r.hole,
    oldScore: r.old_score,
    newScore: r.new_score,
    changedAt: r.changed_at,
  }));
}

export function loadGameScores(matchupId: string): any | null {
  return scoresCache.get(matchupId) || null;
}

export function loadTournament(id: string): Tournament | null {
  return tournamentCache.get(id) || null;
}

export function getTournamentList(filter?: (t: Tournament) => boolean): TournamentListItem[] {
  const list: TournamentListItem[] = [];
  for (const t of tournamentCache.values()) {
    if (filter && !filter(t)) continue;
    const standings = computeStandings(t);
    list.push({
      id: t.id,
      name: t.name,
      status: t.status,
      teamAName: t.teams[0].name,
      teamBName: t.teams[1].name,
      teamAPoints: standings.teamAPoints,
      teamBPoints: standings.teamBPoints,
      sourceGroupId: t.sourceGroupId,
    });
  }
  return list;
}

// The tournaments this viewer may see (§5.cb): the same rule as a pool. A legacy owner-less
// one is visible to its players and the app owner only, no longer to everyone (§5.ci).
export function getTournamentListVisibleTo(v: Viewer): TournamentListItem[] {
  return getTournamentList((t) => gameVisibleTo(t, v));
}

function sanitizeTournament(t: Tournament): Tournament {
  for (const round of t.rounds) {
    for (const bonus of round.bonuses) {
      bonus.name = bonus.name.replace(/â/g, '-').replace(/—/g, '-');
    }
  }
  return t;
}

// Fetch all tournaments from Supabase into cache
export async function hydrateTournaments(): Promise<void> {
  const { data } = await supabase.from('tournaments').select('id, data');
  if (data) {
    for (const row of data) {
      tournamentCache.set(row.id, sanitizeTournament(row.data as Tournament));
    }
  }
}

// Fetch a single tournament from Supabase into cache
export async function fetchTournament(id: string): Promise<Tournament | null> {
  const cached = tournamentCache.get(id);
  if (cached) return cached;
  const { data } = await supabase.from('tournaments').select('data').eq('id', id).single();
  if (data) {
    const t = sanitizeTournament(data.data as Tournament);
    tournamentCache.set(id, t);
    return t;
  }
  return null;
}

// Fetch scores for a matchup from Supabase into cache (always hits network). Reads the per-cell
// rows; a card with none yet falls back to its old `game_scores` blob (DUAL READ, for a card the
// migration's backfill hasn't reached). This device's unacknowledged taps are laid over the
// server's copy, so a queued tap never disappears from the screen.
export async function fetchGameScores(matchupId: string): Promise<any | null> {
  const { data, error } = await supabase.from('score_cells').select('player_id, hole, gross_score').eq('matchup_id', matchupId);
  // No rows, OR the table isn't there yet (a database the migration hasn't reached): read the blob.
  const rows = error || !data ? [] : (data as ScoreCellRow[]);
  let server: GameScore[] | null = cellsToScores(rows);
  if (rows.length === 0) {
    const blob = await supabase.from('game_scores').select('data').eq('matchup_id', matchupId).single();
    server = blob.data ? ((blob.data.data as GameScore[]) ?? []) : null;
  }
  const pending = scoreOutbox.pending(matchupId);
  if (server === null && pending.length === 0) return scoresCache.get(matchupId) || null;
  // The server's copy is the save baseline: the next save sends only what differs from it.
  lastPersistedScores.set(matchupId, (server ?? []).map((s) => ({ ...s })));
  const shown = overlayPending(server ?? [], pending);
  scoresCache.set(matchupId, shown);
  return shown;
}

// Re-fetch scores for given matchup IDs when the page becomes visible again
export function onVisibilityRefetch(matchupIds: string[], onRefreshed?: () => void) {
  function handler() {
    if (document.visibilityState === 'visible') {
      Promise.all(matchupIds.map((id) => fetchGameScores(id))).then(() => {
        onRefreshed?.();
      });
    }
  }
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

// Subscribe to realtime score changes for a matchup.
//
// Self-healing: supabase-js automatically rejoins the channel when the
// WebSocket drops (mobile network handoff, wifi↔cellular, brief signal loss),
// but a plain onUpdate handler only sees changes that arrive AFTER the channel
// is healthy again — anything written during the outage is silently missed
// until something else refetches. So on every (re)SUBSCRIBED — the initial join
// and every automatic rejoin — we pull the current server truth and push it
// through onUpdate. That closes the outage gap the instant realtime revives,
// which is what keeps updates feeling live rather than waiting for a poll tick.
let scoreChannelCounter = 0;
export function subscribeToScores(matchupId: string, onUpdate: (scores: any) => void) {
  const channelName = `scores:${matchupId}:${++scoreChannelCounter}`;
  return supabase
    .channel(channelName)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'score_cells',
      filter: `matchup_id=eq.${matchupId}`,
    }, (payload) => {
      // One CELL changed (F-063 C). Fold it into the server copy (the save baseline, so this
      // device never re-sends another phone's tap as its own), then show it under any taps of
      // ours still waiting in the outbox.
      const row = payload.new as ScoreCellRow | null;
      if (!row || row.matchup_id !== matchupId) return;
      const base = (lastPersistedScores.get(matchupId) ?? []).filter((s) => !(s.playerId === row.player_id && s.hole === row.hole));
      const server = row.gross_score == null ? base : [...base, { playerId: row.player_id, hole: row.hole, grossScore: row.gross_score }];
      lastPersistedScores.set(matchupId, server);
      const shown = overlayPending(server, scoreOutbox.pending(matchupId));
      scoresCache.set(matchupId, shown);
      onUpdate(shown);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // fetchGameScores also refreshes scoresCache + the audit baseline.
        fetchGameScores(matchupId).then((scores) => {
          if (scores) onUpdate(scores);
        });
      }
    });
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
        sanitizeTournament(tournament);
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
        const holeData = getHoleDataForRound(round);
        const targetHoles = bonus.type === 'nassau-front'
          ? holeData.filter((h) => h.number <= 9)
          : bonus.type === 'nassau-back'
          ? holeData.filter((h) => h.number > 9)
          : holeData;

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
              if (sc) {
                const strokes = getPlayerStrokesForHole(playerId, hole.handicap, hole.number, matchup, round, tournament);
                totalNetA += sc.grossScore - strokes;
                countA++;
              }
            }
            for (const playerId of matchup.teamBPlayerIds) {
              const sc = scores.find((s) => s.playerId === playerId && s.hole === hole.number);
              if (sc) {
                const strokes = getPlayerStrokesForHole(playerId, hole.handicap, hole.number, matchup, round, tournament);
                totalNetB += sc.grossScore - strokes;
                countB++;
              }
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

export interface ProjectedBonus {
  bonusId: string;
  bonusName: string;
  points: number;
  scope: 'per-matchup' | 'per-tournament-round';
  projectedTeamAPoints: number;
  projectedTeamBPoints: number;
  detail: string;
}

export function computeProjectedBonuses(
  round: TournamentRound,
  tournament: Tournament
): ProjectedBonus[] {
  const projected: ProjectedBonus[] = [];

  for (const bonus of round.bonuses) {
    if (bonus.result) continue; // already finalized

    if (bonus.type === 'match-winner' && bonus.scope === 'per-matchup') {
      let aWins = 0;
      let bWins = 0;
      let ties = 0;
      const details: string[] = [];

      for (const matchup of round.matchups) {
        if (matchup.result) {
          if (matchup.result.winningTeamId === 'team-a') aWins++;
          else if (matchup.result.winningTeamId === 'team-b') bWins++;
          else ties++;
          continue;
        }
        const scores: GameScore[] | null = loadGameScores(matchup.id);
        if (!scores || scores.length === 0) continue;

        if (round.splitFormat && round.splitFormat.teamMode === 'individual' && round.splitFormat.pairings?.length) {
          const splitStatuses = computeSplitMatchStatuses(scores, matchup, round, tournament);
          if (splitStatuses) {
            let pending = 0;
            for (const sm of splitStatuses) {
              if (sm.status.thru === 0) {
                ties++;
                pending++;
                continue;
              }
              const diff = sm.status.holesWonA - sm.status.holesWonB;
              const teamLabel = sm.type === 'team'
                ? `${matchup.groupLabel} F9`
                : sm.label;
              if (diff > 0) { aWins++; details.push(`${teamLabel}: ${tournament.teams[0].name}`); }
              else if (diff < 0) { bWins++; details.push(`${teamLabel}: ${tournament.teams[1].name}`); }
              else { ties++; details.push(`${teamLabel}: Tied`); }
            }
            if (pending > 0) details.push(`${pending} not started`);
            continue;
          }
        }

        if (round.scoringMethod === 'stroke-play') {
          const result = recomputeMatchResult(scores, matchup, round, tournament);
          if (!result) continue;
          if (result.winningTeamId === 'team-a') { aWins++; details.push(`${matchup.groupLabel}: ${tournament.teams[0].name}`); }
          else if (result.winningTeamId === 'team-b') { bWins++; details.push(`${matchup.groupLabel}: ${tournament.teams[1].name}`); }
          else { ties++; details.push(`${matchup.groupLabel}: Tied`); }
        } else {
          const status = computeLiveMatchStatus(scores, matchup, round, tournament);
          if (!status || status.thru === 0) continue;
          const diff = status.holesWonA - status.holesWonB;
          if (diff > 0) { aWins++; details.push(`${matchup.groupLabel}: ${tournament.teams[0].name}`); }
          else if (diff < 0) { bWins++; details.push(`${matchup.groupLabel}: ${tournament.teams[1].name}`); }
          else { ties++; details.push(`${matchup.groupLabel}: Tied`); }
        }
      }

      if (aWins + bWins + ties === 0) continue;
      projected.push({
        bonusId: bonus.id,
        bonusName: bonus.name,
        points: bonus.points,
        scope: bonus.scope,
        projectedTeamAPoints: aWins * bonus.points + ties * bonus.points * 0.5,
        projectedTeamBPoints: bWins * bonus.points + ties * bonus.points * 0.5,
        detail: details.join(' · '),
      });
    }

    if (bonus.type === 'best-individual-net') {
      const holes = getHoleDataForRound(round);

      if (bonus.scope === 'per-matchup') {
        let teamAWins = 0;
        let teamBWins = 0;
        let ties = 0;
        const details: string[] = [];
        for (const matchup of round.matchups) {
          const scores: GameScore[] | null = loadGameScores(matchup.id);
          if (!scores || scores.length === 0) continue;
          let bestNetToPar = Infinity;
          const topPlayers: { playerId: string; netToPar: number }[] = [];
          for (const playerId of matchup.playerIds) {
            const netTotal = computePlayerNetTotal(scores, playerId, matchup, round, tournament);
            if (netTotal === null) continue;
            const parForPlayed = holes.filter((h) => scores.some((s) => s.playerId === playerId && s.hole === h.number)).reduce((s, h) => s + h.par, 0);
            const netToPar = netTotal - parForPlayed;
            if (netToPar < bestNetToPar) { bestNetToPar = netToPar; topPlayers.length = 0; topPlayers.push({ playerId, netToPar }); }
            else if (netToPar === bestNetToPar) { topPlayers.push({ playerId, netToPar }); }
          }
          if (topPlayers.length === 0) continue;
          const aWinners = topPlayers.filter((p) => tournament.teams[0].playerIds.includes(p.playerId));
          const bWinners = topPlayers.filter((p) => tournament.teams[1].playerIds.includes(p.playerId));
          if (aWinners.length > 0 && bWinners.length === 0) { teamAWins++; details.push(`${tournament.players.find((p) => p.id === aWinners[0].playerId)?.name?.split(' ')[0]} (${bestNetToPar >= 0 ? '+' : ''}${bestNetToPar})`); }
          else if (bWinners.length > 0 && aWinners.length === 0) { teamBWins++; details.push(`${tournament.players.find((p) => p.id === bWinners[0].playerId)?.name?.split(' ')[0]} (${bestNetToPar >= 0 ? '+' : ''}${bestNetToPar})`); }
          else { ties++; details.push(`Tied (${bestNetToPar >= 0 ? '+' : ''}${bestNetToPar})`); }
        }
        if (teamAWins + teamBWins + ties === 0) continue;
        projected.push({
          bonusId: bonus.id, bonusName: bonus.name, points: bonus.points, scope: bonus.scope,
          projectedTeamAPoints: teamAWins * bonus.points + ties * bonus.points * 0.5,
          projectedTeamBPoints: teamBWins * bonus.points + ties * bonus.points * 0.5,
          detail: details.join(' · '),
        });
      } else {
        let bestNetToPar = Infinity;
        let bestId: string | null = null;
        for (const matchup of round.matchups) {
          const scores: GameScore[] | null = loadGameScores(matchup.id);
          if (!scores || scores.length === 0) continue;
          for (const playerId of matchup.playerIds) {
            const netTotal = computePlayerNetTotal(scores, playerId, matchup, round, tournament);
            if (netTotal === null) continue;
            const parForPlayed = holes.filter((h) => scores.some((s) => s.playerId === playerId && s.hole === h.number)).reduce((s, h) => s + h.par, 0);
            const netToPar = netTotal - parForPlayed;
            if (netToPar < bestNetToPar) { bestNetToPar = netToPar; bestId = playerId; }
          }
        }
        if (!bestId) continue;
        const player = tournament.players.find((p) => p.id === bestId);
        const isTeamA = tournament.teams[0].playerIds.includes(bestId);
        const display = bestNetToPar === 0 ? 'E' : bestNetToPar > 0 ? `+${bestNetToPar}` : `${bestNetToPar}`;
        projected.push({
          bonusId: bonus.id, bonusName: bonus.name, points: bonus.points, scope: bonus.scope,
          projectedTeamAPoints: isTeamA ? bonus.points : 0,
          projectedTeamBPoints: isTeamA ? 0 : bonus.points,
          detail: `${player?.name?.split(' ')[0] || '?'} (${display})`,
        });
      }
    }

    if (bonus.type === 'best-individual-stableford') {
      if (bonus.scope === 'per-matchup') {
        let teamAWins = 0;
        let teamBWins = 0;
        let ties = 0;
        const details: string[] = [];
        for (const matchup of round.matchups) {
          const scores: GameScore[] | null = loadGameScores(matchup.id);
          if (!scores || scores.length === 0) continue;
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
          if (aWinners.length > 0 && bWinners.length === 0) { teamAWins++; details.push(`${tournament.players.find((p) => p.id === aWinners[0].playerId)?.name?.split(' ')[0]} (${best})`); }
          else if (bWinners.length > 0 && aWinners.length === 0) { teamBWins++; details.push(`${tournament.players.find((p) => p.id === bWinners[0].playerId)?.name?.split(' ')[0]} (${best})`); }
          else { ties++; details.push(`Tied (${best})`); }
        }
        if (teamAWins + teamBWins + ties === 0) continue;
        projected.push({
          bonusId: bonus.id, bonusName: bonus.name, points: bonus.points, scope: bonus.scope,
          projectedTeamAPoints: teamAWins * bonus.points + ties * bonus.points * 0.5,
          projectedTeamBPoints: teamBWins * bonus.points + ties * bonus.points * 0.5,
          detail: details.join(' · '),
        });
      } else {
        let best = -Infinity;
        let bestId: string | null = null;
        for (const matchup of round.matchups) {
          const scores: GameScore[] | null = loadGameScores(matchup.id);
          if (!scores || scores.length === 0) continue;
          for (const playerId of matchup.playerIds) {
            const total = computePlayerStablefordPoints(scores, playerId, matchup, round, tournament);
            if (total > best) { best = total; bestId = playerId; }
          }
        }
        if (!bestId || best <= 0) continue;
        const player = tournament.players.find((p) => p.id === bestId);
        const isTeamA = tournament.teams[0].playerIds.includes(bestId);
        projected.push({
          bonusId: bonus.id, bonusName: bonus.name, points: bonus.points, scope: bonus.scope,
          projectedTeamAPoints: isTeamA ? bonus.points : 0,
          projectedTeamBPoints: isTeamA ? 0 : bonus.points,
          detail: `${player?.name?.split(' ')[0] || '?'} (${best} pts)`,
        });
      }
    }

    if (bonus.type === 'nassau-front' || bonus.type === 'nassau-back' || bonus.type === 'nassau-overall') {
      const label = bonus.type === 'nassau-front' ? 'Front 9' : bonus.type === 'nassau-back' ? 'Back 9' : 'Overall';

      if (round.scoringMethod === 'match-play') {
        if (bonus.scope === 'per-matchup') {
          let teamAWins = 0;
          let teamBWins = 0;
          let ties = 0;
          for (const matchup of round.matchups) {
            if (!matchup.gameId) continue;
            const scores: GameScore[] | null = loadGameScores(matchup.id);
            if (!scores) continue;
            const nassau = computeNassauStatus(scores, matchup, round, tournament);
            if (!nassau) continue;
            const bucket = bonus.type === 'nassau-front' ? nassau.front
              : bonus.type === 'nassau-back' ? nassau.back : nassau.overall;
            if (bucket.thru === 0) { ties++; continue; }
            if (bucket.holesWonA > bucket.holesWonB) teamAWins++;
            else if (bucket.holesWonB > bucket.holesWonA) teamBWins++;
            else ties++;
          }
          if (teamAWins + teamBWins + ties === 0) continue;
          projected.push({
            bonusId: bonus.id, bonusName: bonus.name, points: bonus.points, scope: bonus.scope,
            projectedTeamAPoints: teamAWins * bonus.points + ties * bonus.points * 0.5,
            projectedTeamBPoints: teamBWins * bonus.points + ties * bonus.points * 0.5,
            detail: label,
          });
        } else {
          let totalWonA = 0;
          let totalWonB = 0;
          let hasActiveMatchup = false;
          for (const matchup of round.matchups) {
            if (!matchup.gameId) continue;
            hasActiveMatchup = true;
            const scores: GameScore[] | null = loadGameScores(matchup.id);
            if (!scores) continue;
            const nassau = computeNassauStatus(scores, matchup, round, tournament);
            if (!nassau) continue;
            const bucket = bonus.type === 'nassau-front' ? nassau.front
              : bonus.type === 'nassau-back' ? nassau.back : nassau.overall;
            totalWonA += bucket.holesWonA;
            totalWonB += bucket.holesWonB;
          }
          if (!hasActiveMatchup) continue;
          const aWins = totalWonA > totalWonB ? 1 : 0;
          const bWins = totalWonB > totalWonA ? 1 : 0;
          const isTie = totalWonA === totalWonB;
          projected.push({
            bonusId: bonus.id, bonusName: bonus.name, points: bonus.points, scope: bonus.scope,
            projectedTeamAPoints: isTie ? bonus.points * 0.5 : aWins * bonus.points,
            projectedTeamBPoints: isTie ? bonus.points * 0.5 : bWins * bonus.points,
            detail: `${label}: ${totalWonA === 0 && totalWonB === 0 ? 'Tied (no holes played)' : `${totalWonA}W—${totalWonB}W`}`,
          });
        }
      } else {
        // stroke-play nassau: compare net totals on target holes
        const holeData = getHoleDataForRound(round);
        const targetHoles = bonus.type === 'nassau-front'
          ? holeData.filter((h) => h.number <= 9)
          : bonus.type === 'nassau-back'
          ? holeData.filter((h) => h.number > 9)
          : holeData;

        let totalNetA = 0;
        let totalNetB = 0;
        let hasAnyScores = false;
        for (const matchup of round.matchups) {
          const scores: GameScore[] | null = loadGameScores(matchup.id);
          if (!scores) continue;
          for (const hole of targetHoles) {
            for (const playerId of matchup.teamAPlayerIds) {
              const sc = scores.find((s) => s.playerId === playerId && s.hole === hole.number);
              if (sc) {
                const strokes = getPlayerStrokesForHole(playerId, hole.handicap, hole.number, matchup, round, tournament);
                totalNetA += sc.grossScore - strokes;
                hasAnyScores = true;
              }
            }
            for (const playerId of matchup.teamBPlayerIds) {
              const sc = scores.find((s) => s.playerId === playerId && s.hole === hole.number);
              if (sc) {
                const strokes = getPlayerStrokesForHole(playerId, hole.handicap, hole.number, matchup, round, tournament);
                totalNetB += sc.grossScore - strokes;
                hasAnyScores = true;
              }
            }
          }
        }
        if (!hasAnyScores) continue;
        const isTie = totalNetA === totalNetB;
        projected.push({
          bonusId: bonus.id, bonusName: bonus.name, points: bonus.points, scope: bonus.scope,
          projectedTeamAPoints: isTie ? bonus.points * 0.5 : totalNetA < totalNetB ? bonus.points : 0,
          projectedTeamBPoints: isTie ? bonus.points * 0.5 : totalNetB < totalNetA ? bonus.points : 0,
          detail: `${label}: ${totalNetA}—${totalNetB}`,
        });
      }
    }

    if (bonus.type === 'junk') {
      let totalA = 0;
      let totalB = 0;
      for (const matchup of round.matchups) {
        const scores: GameScore[] | null = loadGameScores(matchup.id);
        if (!scores || scores.length === 0) continue;
        const junk = computeJunkForMatchup(scores, matchup, tournament, round.course);
        totalA += junk.teamA.total;
        totalB += junk.teamB.total;
      }
      if (totalA + totalB === 0) continue;
      const isTie = totalA === totalB;
      projected.push({
        bonusId: bonus.id, bonusName: bonus.name, points: bonus.points, scope: bonus.scope,
        projectedTeamAPoints: isTie ? bonus.points * 0.5 : totalA > totalB ? bonus.points : 0,
        projectedTeamBPoints: isTie ? bonus.points * 0.5 : totalB > totalA ? bonus.points : 0,
        detail: `Junk: ${totalA}—${totalB}`,
      });
    }
  }

  return projected;
}

// The 2-team view every tournament page reads. Event spine slice 1 (§5.bu): a wrapper over the
// N-way `computeStandingsN`, pinned by src/test/tournament-standings.test.ts goldens.
export function computeStandings(tournament: Tournament) {
  const [a, b] = teamsOf(tournament).map((t) => t.id);
  const n = computeStandingsN(tournament);
  return {
    teamAPoints: n.points.get(a) ?? 0,
    teamBPoints: n.points.get(b) ?? 0,
    roundResults: n.roundResults.map((r) => ({ roundId: r.roundId, teamAPoints: r.points.get(a) ?? 0, teamBPoints: r.points.get(b) ?? 0 })),
  };
}
