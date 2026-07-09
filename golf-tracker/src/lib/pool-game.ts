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
  strokeMethod?: 'full' | 'off-the-low';       // default 'full'; off-the-low subtracts field-low handicap
  potSplit: PoolPotSplit;                      // default 0.25 each
  positionSplit: number[];                     // e.g. [100] winner-take-all
  junkValues: PoolJunkValues;                  // 1 / 2 / 3 / 1 / 1
  ctpWinners: Record<number, string | null>;  // par-3 holeNumber -> playerId
  status: 'setup' | 'active' | 'completed';
  handicapsRefreshedAt?: string;               // ISO time this game's handicaps were last pulled from GHIN
  createdByGhin?: number;                       // GHIN number of the organizer who created it (for their history)
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

// The organizer's standard pot split, in DOLLARS per leg (front/back/overall/junk),
// keyed by number of teams. Each row sums to teams × $100 (a foursome buys in at
// 4 × $25). 2–5 are his exact historical splits; 6+ extend the 5-team base by
// +$25 to every leg per additional team (verified against his 6-team intuition
// of 175/175/150/100). Everything is editable per game in setup.
export interface PoolLegDollars {
  front: number;
  back: number;
  overall: number;
  junk: number;
}

const POOL_SPLIT_TABLE: Record<number, PoolLegDollars> = {
  2: { front: 70, back: 70, overall: 40, junk: 20 },
  3: { front: 100, back: 100, overall: 60, junk: 40 },
  4: { front: 100, back: 100, overall: 100, junk: 100 },
  5: { front: 150, back: 150, overall: 125, junk: 75 },
};

// Dollar split for N teams: exact table for 2–5, else extend the 5-team base by
// +$25 per leg for each team beyond 5. For 0/1 teams, returns an even split of
// teams×100 so the UI still shows something sensible.
export function poolSplitDollarsForTeams(numTeams: number): PoolLegDollars {
  if (POOL_SPLIT_TABLE[numTeams]) return { ...POOL_SPLIT_TABLE[numTeams] };
  if (numTeams >= 6) {
    const step = numTeams - 5;
    const b = POOL_SPLIT_TABLE[5];
    return { front: b.front + 25 * step, back: b.back + 25 * step, overall: b.overall + 25 * step, junk: b.junk + 25 * step };
  }
  // 0 or 1 team — degenerate; even quarters of teams×100 (min 100).
  const pot = Math.max(1, numTeams) * 100;
  const q = pot / 4;
  return { front: q, back: q, overall: q, junk: q };
}

// Convert dollar legs to pot fractions (what PoolGame stores). Guards against a
// zero total.
export function dollarsToPotSplit(d: PoolLegDollars): PoolPotSplit {
  const total = d.front + d.back + d.overall + d.junk;
  if (total <= 0) return { ...DEFAULT_POT_SPLIT };
  return { front: d.front / total, back: d.back / total, overall: d.overall / total, junk: d.junk / total };
}

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

// Tee options to offer a player in a picker: the tees matching their gender,
// PLUS whatever tee they're currently on even if it's the "wrong" gender. The
// current-tee inclusion matters because an HTML <select> whose value isn't among
// its <option>s silently renders the FIRST option — which made a male stuck on a
// legacy women's tee LOOK like he was on "Championship" on one screen while the
// scorecard showed his real (women's) tee. Including the current tee makes every
// picker show the truth, and gender-filtering the rest stops new mis-assignments.
export function teeOptionsForPlayer(course: CourseSelection | null, player: Player): TeeSetOption[] {
  const tees = course?.teeSets ?? [];
  if (tees.length === 0) return [];
  const g: 'M' | 'F' = player.gender === 'F' ? 'F' : 'M';
  const sameGender = tees.filter((t) => (t.gender ?? 'M') === g);
  const base = sameGender.length > 0 ? sameGender : tees;
  const current = tees.find((t) => t.id === player.teeSetId);
  if (current && !base.some((t) => t.id === current.id)) return [current, ...base];
  return base;
}

// True when a player is sitting on a tee that doesn't match their gender — a
// legacy mis-assignment that silently corrupts their handicap (men's/women's
// tees can share a name yet differ in rating and hole stroke-index). Surfaced
// in the UI so the organizer can spot and correct it.
export function playerTeeGenderMismatch(course: CourseSelection | null, player: Player): boolean {
  const tee = course?.teeSets.find((t) => t.id === player.teeSetId);
  if (!tee || !tee.gender) return false;
  const g: 'M' | 'F' = player.gender === 'F' ? 'F' : 'M';
  return tee.gender !== g;
}

// A player's stroke index (hole "handicap") for a hole, read from THEIR OWN tee.
// Men's and women's tees often rank hole difficulty differently (e.g. Spring
// Creek differs on 14 of 18 holes), so strokes must be allocated per that
// player's tee, not the shared default tee. Falls back to the passed-in default
// index if the player's tee lacks the hole.
function playerHoleStrokeIndex(player: Player, course: CourseSelection | null, holeNumber: number, fallbackIndex: number): number {
  const tee = getPlayerTee(player, course);
  const h = tee?.holes.find((x) => x.number === holeNumber);
  return h ? h.handicap : fallbackIndex;
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

// Build each player's playing handicap. For 'off-the-low', the lowest playing
// handicap in the whole field is subtracted from everyone (field plays off the
// low). Every team is measured off the same baseline, keeping cross-team
// comparison fair; the low player plays to scratch.
function buildHcapMap(game: PoolGame): Map<string, number> {
  const raw = new Map<string, number>();
  for (const player of game.players) {
    raw.set(player.id, getPoolPlayingHandicap(player, game.course, game.handicapAllowance));
  }
  if (game.strokeMethod !== 'off-the-low' || raw.size === 0) return raw;

  const low = Math.min(...raw.values());
  const adjusted = new Map<string, number>();
  for (const [id, h] of raw) adjusted.set(id, h - low);
  return adjusted;
}

export interface FieldLowInfo {
  playerId: string;
  playerName: string;
  courseHandicap: number;  // their raw course handicap (the baseline everyone plays off)
  applies: boolean;        // true only when strokeMethod is off-the-low
}

// The field's low man — the player with the lowest raw course handicap. Under
// off-the-low, everyone plays their course handicap minus this value.
export function getFieldLow(game: PoolGame): FieldLowInfo | null {
  if (game.players.length === 0) return null;
  let lowId = game.players[0].id;
  let lowH = Infinity;
  for (const p of game.players) {
    const h = getPoolPlayingHandicap(p, game.course, game.handicapAllowance);
    if (h < lowH) { lowH = h; lowId = p.id; }
  }
  const player = game.players.find((p) => p.id === lowId);
  return {
    playerId: lowId,
    playerName: player?.name ?? '?',
    courseHandicap: Math.round(lowH),
    applies: game.strokeMethod === 'off-the-low',
  };
}

export interface DistinctRanking {
  label: string;                    // "Men" / "Women" if gender-clean, else tee names
  strokeIndexByHole: Record<number, number>; // hole number -> stroke index
}

// Collapse the tees a set of players is actually using into DISTINCT hole-ranking
// rows. Men's and women's tees usually differ, but some courses (e.g. Old Trail)
// share a ranking across genders by tee color — so we dedupe by the ranking
// sequence itself, then label by gender when a ranking is single-gender, else by
// the tee names that share it. Avoids a redundant row per tee.
export function distinctRankingsForPlayers(game: PoolGame, playerIds: string[]): DistinctRanking[] {
  const course = game.course;
  if (!course) return [];
  const seen = new Map<string, { tees: TeeSetOption[]; genders: Set<'M' | 'F'> }>();
  const teeIdsUsed = new Set<number>();

  for (const pid of playerIds) {
    const player = game.players.find((p) => p.id === pid);
    if (!player) continue;
    const tee = getPlayerTee(player, course);
    if (!tee || teeIdsUsed.has(tee.id)) continue;
    teeIdsUsed.add(tee.id);
    const holes = [...tee.holes].sort((a, b) => a.number - b.number);
    const key = holes.map((h) => h.handicap).join(',');
    const entry = seen.get(key) || { tees: [], genders: new Set<'M' | 'F'>() };
    entry.tees.push(tee);
    entry.genders.add((player.gender ?? tee.gender ?? 'M') as 'M' | 'F');
    seen.set(key, entry);
  }

  const stripW = (n: string) => n.replace(/\s*\(w\)\s*$/i, '');
  const groups = Array.from(seen.values());

  // A gender label ("Men"/"Women") is only unambiguous if that gender maps to a
  // SINGLE ranking. If two men's tees have different rankings, label both by tee
  // name instead so they're distinguishable.
  const genderRankingCount = { M: 0, F: 0 };
  for (const g of groups) {
    if (g.genders.size === 1) genderRankingCount[g.genders.has('F') ? 'F' : 'M']++;
  }

  return groups.map(({ tees, genders }) => {
    const strokeIndexByHole: Record<number, number> = {};
    for (const h of tees[0].holes) strokeIndexByHole[h.number] = h.handicap;
    const soleGender = genders.size === 1 ? (genders.has('F') ? 'F' : 'M') : null;
    const label = soleGender && genderRankingCount[soleGender] === 1
      ? (soleGender === 'F' ? 'Women' : 'Men')
      : Array.from(new Set(tees.map((t) => stripW(t.name)))).join(' / ');
    return { label, strokeIndexByHole };
  });
}

// Balance players into `numTeams` groups with the most-even combined handicap.
// Greedy LPT seed -> 2-swap local improvement -> exact branch-and-bound (seeded
// so any early exit still returns >= as good; symmetry-pruned; 800ms budget).
// Returns player IDs grouped per team. `hcapOf` supplies each player's handicap.
export function balanceTeamsByHandicap(
  players: Player[],
  numTeams: number,
  hcapOf: (p: Player) => number
): string[][] {
  const nt = Math.max(1, numTeams);
  const base = Math.floor(players.length / nt);
  const extra = players.length % nt;
  const caps = Array.from({ length: nt }, (_, i) => base + (i < extra ? 1 : 0));

  const sorted = [...players].sort((a, b) => hcapOf(b) - hcapOf(a)); // high -> low
  const h = sorted.map((p) => hcapOf(p));
  const n = h.length;
  const total = h.reduce((s, v) => s + v, 0);
  const spreadOf = (sums: number[]) => Math.max(...sums) - Math.min(...sums);

  // 1) Greedy LPT: each player onto the least-loaded team with room.
  const buckets: number[][] = Array.from({ length: nt }, () => []);
  const sums = new Array(nt).fill(0);
  for (let idx = 0; idx < n; idx++) {
    let best = -1;
    for (let t = 0; t < nt; t++) {
      if (buckets[t].length >= caps[t]) continue;
      if (best === -1 || sums[t] < sums[best]) best = t;
    }
    buckets[best].push(idx);
    sums[best] += h[idx];
  }

  // 2) 2-swap local improvement.
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 300) {
    improved = false;
    for (let a = 0; a < nt && !improved; a++) {
      for (let b = a + 1; b < nt && !improved; b++) {
        for (let i = 0; i < buckets[a].length && !improved; i++) {
          for (let j = 0; j < buckets[b].length; j++) {
            const before = spreadOf(sums);
            sums[a] += h[buckets[b][j]] - h[buckets[a][i]];
            sums[b] += h[buckets[a][i]] - h[buckets[b][j]];
            if (spreadOf(sums) < before - 1e-9) {
              const tmp = buckets[a][i]; buckets[a][i] = buckets[b][j]; buckets[b][j] = tmp;
              improved = true;
              break;
            }
            sums[a] -= h[buckets[b][j]] - h[buckets[a][i]];
            sums[b] -= h[buckets[a][i]] - h[buckets[b][j]];
          }
        }
      }
    }
  }

  // 3) Exact branch-and-bound, seeded with the swap result.
  let bestSpread = spreadOf(sums);
  let bestAssign = buckets.map((b) => [...b]);
  const avg = total / nt;
  const deadline = Date.now() + 800;
  const curSums = new Array(nt).fill(0);
  const curCnt = new Array(nt).fill(0);
  const curTeams: number[][] = Array.from({ length: nt }, () => []);
  let bailed = false;

  function rec(i: number) {
    if (bailed || bestSpread === 0) return;
    if (Date.now() > deadline) { bailed = true; return; }
    if (i === n) {
      const sp = Math.max(...curSums) - Math.min(...curSums);
      if (sp < bestSpread) { bestSpread = sp; bestAssign = curTeams.map((t) => [...t]); }
      return;
    }
    if (Math.max(...curSums) - avg >= bestSpread) return;
    const seen = new Set<string>();
    const order = [...Array(nt).keys()].sort((x, y) => curSums[x] - curSums[y]);
    for (const t of order) {
      if (curCnt[t] >= caps[t]) continue;
      const key = `${curSums[t]}:${curCnt[t]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      curSums[t] += h[i]; curCnt[t] += 1; curTeams[t].push(i);
      rec(i + 1);
      curTeams[t].pop(); curSums[t] -= h[i]; curCnt[t] -= 1;
    }
  }
  rec(0);

  return bestAssign.map((idxs) => idxs.map((idx) => sorted[idx].id));
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
  game: PoolGame,
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
    const player = game.players.find((p) => p.id === pid);
    const hcap = hcapMap.get(pid) ?? 0;
    // Allocate strokes using this player's OWN tee's stroke index for the hole.
    const strokeIndex = player ? playerHoleStrokeIndex(player, game.course, hole.number, hole.handicap) : hole.handicap;
    const strokes = getMoneyStrokesOnHole(hcap, strokeIndex, numHoles);
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

  // Pre-compute each player's playing handicap off their own tee (field-low
  // subtracted when strokeMethod is off-the-low).
  const hcapMap = buildHcapMap(game);

  // Per-team, per-hole team score (best net + best gross).
  const holeScoresByTeam = new Map<string, Map<number, number | null>>();
  for (const team of game.teams) {
    const scores = scoresByMatchup.get(team.matchupId) || [];
    const perHole = new Map<number, number | null>();
    for (const hole of holes) {
      perHole.set(hole.number, teamHoleScore(game, team, hole, scores, hcapMap, numHoles, game.ballSelection));
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

  const hcapMap = buildHcapMap(game);

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
        const strokeIndex = playerHoleStrokeIndex(player, game.course, hole.number, hole.handicap);
        const strokes = getMoneyStrokesOnHole(playingHcap, strokeIndex, numHoles);
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
  createdByGhin?: number;
}

// All pool games (newest first). Owner/dashboard view.
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
      createdByGhin: g.createdByGhin,
    });
  }
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Only the games created by a given GHIN number (an organizer's own history).
export function getPoolGameListForGhin(ghinNumber: number): PoolGameListItem[] {
  return getPoolGameList().filter((g) => g.createdByGhin === ghinNumber);
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
