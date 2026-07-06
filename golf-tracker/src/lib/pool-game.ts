import type { Player, GameScore, CourseSelection, TeeSetOption } from './game-state';
import type { TwoBestBallsVariant } from './formats';
import { calcCourseHandicap } from './game-state';
import { getMoneyStrokesOnHole } from './money-games';
import { bestBallTeamHoleScore } from './live-scoring';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PoolTeam {
  id: string;
  name: string;
  playerIds: string[];
  teeTime?: string;   // "HH:MM" — earliest tee time holds CTP by default
  matchupId: string;  // key into game_scores for this foursome's scores
}

export interface PoolJunkValues {
  birdie: number;
  eagle: number;
  albatross: number;
  groupHug: number;
  ctp: number;
}

// Fractions of the total pot allocated to each sub-pot (should sum to 1).
export interface PoolPotSplit {
  front: number;
  back: number;
  overall: number;
  junk: number;
}

export interface PoolGame {
  id: string;
  name: string;
  createdAt: string;
  course: CourseSelection | null;
  players: Player[];
  teams: PoolTeam[];
  ballSelection: TwoBestBallsVariant;         // default '1-net-1-gross'
  entryPerPlayer: number;                      // e.g. 25
  handicapAllowance: number;                   // percent, e.g. 100
  potSplit: PoolPotSplit;                      // default 0.25 each
  positionSplit: number[];                     // e.g. [100] winner-take-all
  junkValues: PoolJunkValues;                  // 1 / 2 / 3 / 1 / 1
  ctpWinners: Record<number, string | null>;  // par-3 holeNumber -> playerId
  status: 'setup' | 'active' | 'completed';
}

export const DEFAULT_JUNK_VALUES: PoolJunkValues = {
  birdie: 1,
  eagle: 2,
  albatross: 3,
  groupHug: 1,
  ctp: 1,
};

export const DEFAULT_POT_SPLIT: PoolPotSplit = {
  front: 0.25,
  back: 0.25,
  overall: 0.25,
  junk: 0.25,
};

export type PoolLegKey = 'front' | 'back' | 'overall' | 'junk';

export interface PoolTeamLegStanding {
  teamId: string;
  teamName: string;
  total: number;   // summed team hole score over scored leg holes
  toPar: number;   // total minus (2 x par) over scored holes — comparable across thru counts
  thru: number;    // leg holes scored
  place: number;
  payout: number;  // gross winnings from this leg's sub-pot
}

export interface PoolLeg {
  leg: PoolLegKey;
  subPot: number;
  complete: boolean;
  standings: PoolTeamLegStanding[];
}

export interface PoolTeamJunk {
  teamId: string;
  teamName: string;
  birdies: number;
  eagles: number;
  albatrosses: number;
  groupHugs: number;
  ctps: number;
  total: number;   // total junk points
}

export interface PoolTeamPayout {
  teamId: string;
  teamName: string;
  playerCount: number;
  front: number;
  back: number;
  overall: number;
  junk: number;
  grossTotal: number;
  entryPaid: number;
  net: number;
  perPersonNet: number;
}

export interface PoolHoleScore {
  holeNumber: number;
  par: number;
  teamScores: Record<string, number | null>;  // team hole score (net + gross)
}

export interface PoolResult {
  pot: number;
  legs: PoolLeg[];               // front, back, overall, junk (in that order)
  junkDetails: PoolTeamJunk[];
  payouts: PoolTeamPayout[];
  holeScores: PoolHoleScore[];
  thruHole: number;
}

interface HoleData {
  number: number;
  par: number;
  handicap: number;
}

// ---------------------------------------------------------------------------
// Handicap / hole helpers (course-based, honoring each player's own tee — this
// is what reconciles mixed men's/women's fields)
// ---------------------------------------------------------------------------

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

// Full course handicap x allowance, off the player's own tee (par/rating/slope).
export function getPoolPlayingHandicap(player: Player, course: CourseSelection | null, allowance: number): number {
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

export function getPar3Holes(course: CourseSelection | null): number[] {
  return getHoleData(course).filter((h) => h.par === 3).map((h) => h.number);
}

// ---------------------------------------------------------------------------
// Pot distribution — winner-take-all by default, ties split the pooled amount
// evenly. Distributes GROSS dollars (each team already paid entry into the pot).
// ---------------------------------------------------------------------------

export function distributePot(
  ranked: { teamId: string; metric: number }[], // pre-sorted best-first
  pot: number,
  positionSplit: number[]
): Record<string, number> {
  const n = ranked.length;
  const payout: Record<string, number> = {};
  if (n === 0 || pot <= 0) return payout;

  const split = positionSplit && positionSplit.length > 0 ? positionSplit : [100];

  // Dollar amount for each finishing position (index 0 = 1st place).
  const positions: number[] = [];
  for (let i = 0; i < n; i++) {
    const pct = i < split.length ? split[i] : 0;
    positions[i] = (pot * pct) / 100;
  }

  // Assign 1-based places; equal metric = tied place.
  const places: number[] = [];
  let place = 1;
  for (let i = 0; i < n; i++) {
    if (i > 0 && ranked[i].metric !== ranked[i - 1].metric) place = i + 1;
    places[i] = place;
  }

  // Tied teams share the sum of the positions they span.
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && places[j] === places[i]) j++;
    const tiedCount = j - i;
    const poolSum = positions.slice(i, j).reduce((s, v) => s + v, 0);
    const each = poolSum / tiedCount;
    for (let k = i; k < j; k++) payout[ranked[k].teamId] = each;
    i = j;
  }

  return payout;
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

function teamHoleScore(
  team: PoolTeam,
  hole: HoleData,
  scores: GameScore[],
  hcapMap: Map<string, number>,
  numHoles: number,
  variant: TwoBestBallsVariant
): number | null {
  const playerScores: { gross: number; net: number }[] = [];
  for (const pid of team.playerIds) {
    const sc = scores.find((s) => s.playerId === pid && s.hole === hole.number);
    if (!sc) continue;
    const hcap = hcapMap.get(pid) ?? 0;
    const strokes = getMoneyStrokesOnHole(hcap, hole.handicap, numHoles);
    playerScores.push({ gross: sc.grossScore, net: sc.grossScore - strokes });
  }
  return bestBallTeamHoleScore(playerScores, variant);
}

function buildLeg(
  legKey: Exclude<PoolLegKey, 'junk'>,
  legHoles: HoleData[],
  teams: PoolTeam[],
  holeScoresByTeam: Map<string, Map<number, number | null>>,
  subPot: number,
  positionSplit: number[]
): PoolLeg {
  const standings: PoolTeamLegStanding[] = teams.map((team) => {
    const perHole = holeScoresByTeam.get(team.id)!;
    let total = 0;
    let toPar = 0;
    let thru = 0;
    for (const hole of legHoles) {
      const s = perHole.get(hole.number);
      if (s === null || s === undefined) continue;
      total += s;
      toPar += s - hole.par * 2; // two balls contribute (best net + best gross)
      thru++;
    }
    return { teamId: team.id, teamName: team.name, total, toPar, thru, place: 0, payout: 0 };
  });

  const complete = standings.every((s) => s.thru === legHoles.length) && legHoles.length > 0;

  // Rank by toPar ascending (lower is better). Teams with no holes sink to the bottom.
  const ranked = [...standings].sort((a, b) => {
    if (a.thru === 0 && b.thru === 0) return 0;
    if (a.thru === 0) return 1;
    if (b.thru === 0) return -1;
    return a.toPar - b.toPar;
  });

  const eligible = ranked.filter((s) => s.thru > 0);
  const payouts = distributePot(
    eligible.map((s) => ({ teamId: s.teamId, metric: s.toPar })),
    subPot,
    positionSplit
  );

  let place = 1;
  for (let i = 0; i < ranked.length; i++) {
    if (ranked[i].thru === 0) { ranked[i].place = 0; continue; }
    if (i > 0 && ranked[i - 1].thru > 0 && ranked[i].toPar !== ranked[i - 1].toPar) place = i + 1;
    ranked[i].place = place;
    ranked[i].payout = payouts[ranked[i].teamId] ?? 0;
  }

  return { leg: legKey, subPot, complete, standings: ranked };
}

function computeJunk(
  game: PoolGame,
  holes: HoleData[],
  scoresByMatchup: Map<string, GameScore[]>
): PoolTeamJunk[] {
  const par3ByHole = new Map(holes.map((h) => [h.number, h.par === 3]));
  const v = game.junkValues;

  // Which team holds each CTP hole (via the winning playerId).
  const ctpTeamByHole = new Map<number, string>();
  for (const [holeStr, playerId] of Object.entries(game.ctpWinners || {})) {
    if (!playerId) continue;
    const holeNum = Number(holeStr);
    if (!par3ByHole.get(holeNum)) continue;
    const team = game.teams.find((t) => t.playerIds.includes(playerId));
    if (team) ctpTeamByHole.set(holeNum, team.id);
  }

  return game.teams.map((team) => {
    const scores = scoresByMatchup.get(team.matchupId) || [];
    let birdies = 0, eagles = 0, albatrosses = 0, groupHugs = 0, ctps = 0;

    for (const hole of holes) {
      let scoredCount = 0;
      let allParOrBetter = true;
      for (const pid of team.playerIds) {
        const sc = scores.find((s) => s.playerId === pid && s.hole === hole.number);
        if (!sc) continue;
        scoredCount++;
        const diff = sc.grossScore - hole.par;
        if (diff <= -3) albatrosses++;
        else if (diff === -2) eagles++;
        else if (diff === -1) birdies++;
        if (diff > 0) allParOrBetter = false;
      }
      if (allParOrBetter && scoredCount === team.playerIds.length && scoredCount > 0) groupHugs++;
    }

    for (const teamId of ctpTeamByHole.values()) {
      if (teamId === team.id) ctps++;
    }

    const total =
      birdies * v.birdie +
      eagles * v.eagle +
      albatrosses * v.albatross +
      groupHugs * v.groupHug +
      ctps * v.ctp;

    return { teamId: team.id, teamName: team.name, birdies, eagles, albatrosses, groupHugs, ctps, total };
  });
}

export function computePoolResult(
  game: PoolGame,
  scoresByMatchup: Map<string, GameScore[]>
): PoolResult {
  const holes = getHoleData(game.course);
  const pot = game.players.length * game.entryPerPlayer;

  if (holes.length === 0) {
    return { pot, legs: [], junkDetails: [], payouts: [], holeScores: [], thruHole: 0 };
  }
  const numHoles = holes.length;

  // Pre-compute each player's playing handicap off their own tee.
  const hcapMap = new Map<string, number>();
  for (const player of game.players) {
    hcapMap.set(player.id, getPoolPlayingHandicap(player, game.course, game.handicapAllowance));
  }

  // Per-team, per-hole team score (best net + best gross).
  const holeScoresByTeam = new Map<string, Map<number, number | null>>();
  for (const team of game.teams) {
    const scores = scoresByMatchup.get(team.matchupId) || [];
    const perHole = new Map<number, number | null>();
    for (const hole of holes) {
      perHole.set(hole.number, teamHoleScore(team, hole, scores, hcapMap, numHoles, game.ballSelection));
    }
    holeScoresByTeam.set(team.id, perHole);
  }

  // Per-hole grid data + thru tracking.
  const holeScores: PoolHoleScore[] = [];
  let thruHole = 0;
  for (const hole of holes) {
    const teamScores: Record<string, number | null> = {};
    let anyScored = false;
    for (const team of game.teams) {
      const s = holeScoresByTeam.get(team.id)!.get(hole.number) ?? null;
      teamScores[team.id] = s;
      if (s !== null) anyScored = true;
    }
    if (anyScored) thruHole = hole.number;
    holeScores.push({ holeNumber: hole.number, par: hole.par, teamScores });
  }

  const frontHoles = holes.filter((h) => h.number <= 9);
  const backHoles = holes.filter((h) => h.number > 9);

  const front = buildLeg('front', frontHoles, game.teams, holeScoresByTeam, pot * game.potSplit.front, game.positionSplit);
  const back = buildLeg('back', backHoles, game.teams, holeScoresByTeam, pot * game.potSplit.back, game.positionSplit);
  const overall = buildLeg('overall', holes, game.teams, holeScoresByTeam, pot * game.potSplit.overall, game.positionSplit);

  // Junk leg — ranked by most points (higher is better).
  const junkDetails = computeJunk(game, holes, scoresByMatchup);
  const junkSubPot = pot * game.potSplit.junk;
  const junkRanked = [...junkDetails].sort((a, b) => b.total - a.total);
  const junkHasPoints = junkRanked.some((j) => j.total > 0);
  const junkPayouts = distributePot(
    junkHasPoints ? junkRanked.map((j) => ({ teamId: j.teamId, metric: -j.total })) : [],
    junkSubPot,
    game.positionSplit
  );
  const junkStandings: PoolTeamLegStanding[] = [];
  let junkPlace = 1;
  for (let idx = 0; idx < junkRanked.length; idx++) {
    const j = junkRanked[idx];
    if (idx > 0 && junkRanked[idx - 1].total !== j.total) junkPlace = idx + 1;
    junkStandings.push({
      teamId: j.teamId,
      teamName: j.teamName,
      total: j.total,
      toPar: j.total,
      thru: thruHole,
      place: junkHasPoints ? junkPlace : 0,
      payout: junkPayouts[j.teamId] ?? 0,
    });
  }
  const junkLeg: PoolLeg = { leg: 'junk', subPot: junkSubPot, complete: thruHole === numHoles, standings: junkStandings };

  const legs: PoolLeg[] = [front, back, overall, junkLeg];

  // Aggregate per-team payouts.
  const payoutFor = (leg: PoolLeg, teamId: string) => leg.standings.find((s) => s.teamId === teamId)?.payout ?? 0;
  const payouts: PoolTeamPayout[] = game.teams.map((team) => {
    const f = payoutFor(front, team.id);
    const b = payoutFor(back, team.id);
    const o = payoutFor(overall, team.id);
    const j = payoutFor(junkLeg, team.id);
    const grossTotal = f + b + o + j;
    const playerCount = team.playerIds.length || 1;
    const entryPaid = playerCount * game.entryPerPlayer;
    const net = grossTotal - entryPaid;
    return {
      teamId: team.id,
      teamName: team.name,
      playerCount,
      front: f,
      back: b,
      overall: o,
      junk: j,
      grossTotal,
      entryPaid,
      net,
      perPersonNet: net / playerCount,
    };
  });
  payouts.sort((a, b) => b.net - a.net);

  return { pot, legs, junkDetails, payouts, holeScores, thruHole };
}

// ---------------------------------------------------------------------------
// Per-player scorecard detail (for the expandable team rows on the leaderboard)
// ---------------------------------------------------------------------------

export interface PoolPlayerHoleScore {
  holeNumber: number;
  par: number;
  gross: number | null;
  strokes: number;
  net: number | null;
}

export interface PoolPlayerDetail {
  playerId: string;
  playerName: string;
  playingHcap: number;
  holes: PoolPlayerHoleScore[];
  grossTotal: number | null;
  netTotal: number | null;
}

export interface PoolTeamDetail {
  teamId: string;
  teamName: string;
  players: PoolPlayerDetail[];
}

export function computePoolPlayerDetails(
  game: PoolGame,
  scoresByMatchup: Map<string, GameScore[]>
): PoolTeamDetail[] {
  const holes = getHoleData(game.course);
  if (holes.length === 0) return [];
  const numHoles = holes.length;

  const hcapMap = new Map<string, number>();
  for (const player of game.players) {
    hcapMap.set(player.id, getPoolPlayingHandicap(player, game.course, game.handicapAllowance));
  }

  return game.teams.map((team) => {
    const scores = scoresByMatchup.get(team.matchupId) || [];
    const players: PoolPlayerDetail[] = [];
    for (const pid of team.playerIds) {
      const player = game.players.find((p) => p.id === pid);
      if (!player) continue;
      const playingHcap = hcapMap.get(pid) ?? 0;
      const playerHoles: PoolPlayerHoleScore[] = [];
      let grossTotal: number | null = null;
      let netTotal: number | null = null;
      for (const hole of holes) {
        const strokes = getMoneyStrokesOnHole(playingHcap, hole.handicap, numHoles);
        const sc = scores.find((s) => s.playerId === pid && s.hole === hole.number);
        const gross = sc ? sc.grossScore : null;
        const net = gross !== null ? gross - strokes : null;
        if (gross !== null) { grossTotal = (grossTotal ?? 0) + gross; netTotal = (netTotal ?? 0) + net!; }
        playerHoles.push({ holeNumber: hole.number, par: hole.par, gross, strokes, net });
      }
      players.push({ playerId: pid, playerName: player.name, playingHcap, holes: playerHoles, grossTotal, netTotal });
    }
    return { teamId: team.id, teamName: team.name, players };
  });
}

// ---------------------------------------------------------------------------
// Persistence — mirrors tournament-state.ts (in-memory cache + Supabase).
// Per-foursome scores reuse the existing game_scores table (keyed by matchupId)
// via the helpers in tournament-state.ts, so nothing is duplicated here.
// ---------------------------------------------------------------------------

const poolGameCache = new Map<string, PoolGame>();

export function savePoolGame(game: PoolGame) {
  poolGameCache.set(game.id, game);
  supabase.from('pool_games').upsert({
    id: game.id,
    data: game,
    updated_at: new Date().toISOString(),
  }).then();
}

export function loadPoolGame(id: string): PoolGame | null {
  return poolGameCache.get(id) || null;
}

export async function fetchPoolGame(id: string): Promise<PoolGame | null> {
  const cached = poolGameCache.get(id);
  const { data } = await supabase.from('pool_games').select('data').eq('id', id).single();
  if (data) {
    const game = data.data as PoolGame;
    poolGameCache.set(id, game);
    return game;
  }
  return cached || null;
}

export async function hydratePoolGames(): Promise<void> {
  const { data } = await supabase.from('pool_games').select('id, data');
  if (data) {
    for (const row of data) {
      poolGameCache.set(row.id, row.data as PoolGame);
    }
  }
}

export interface PoolGameListItem {
  id: string;
  name: string;
  status: PoolGame['status'];
  teamCount: number;
  playerCount: number;
  createdAt: string;
}

export function getPoolGameList(): PoolGameListItem[] {
  const list: PoolGameListItem[] = [];
  for (const g of poolGameCache.values()) {
    list.push({
      id: g.id,
      name: g.name,
      status: g.status,
      teamCount: g.teams.length,
      playerCount: g.players.length,
      createdAt: g.createdAt,
    });
  }
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function subscribeToPoolGame(id: string, onUpdate: (game: PoolGame) => void) {
  return supabase
    .channel(`pool_game:${id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'pool_games',
      filter: `id=eq.${id}`,
    }, (payload) => {
      const game = (payload.new as { data?: PoolGame })?.data;
      if (game) {
        poolGameCache.set(id, game);
        onUpdate(game);
      }
    })
    .subscribe();
}
