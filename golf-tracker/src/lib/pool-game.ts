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
  captainId?: string; // the team's captain (a saved role, shown across the app)
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
  lockedGroups?: string[][];                    // player-id groups kept on the same team through auto-balance
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

// --- Captains --------------------------------------------------------------
//
// Each team gets a CAPTAIN: by default the lowest course handicaps in the field
// (one per team), which then anchor an even balance around them. Captaincy is a
// saved role (PoolTeam.captainId) shown across the app and freely reassignable.

// A tee's difficulty, for breaking captain ties: higher Total course rating
// first, then longer yardage. When two players share the same (rounded) course
// handicap, the one off the harder/longer tee is the stronger player — a tougher
// tee inflates course handicap, so matching the same number from a harder tee
// means a lower index — and earns the captaincy.
function teeDifficulty(tee: TeeSetOption | null): { rating: number; yardage: number } {
  if (!tee) return { rating: 0, yardage: 0 };
  const total = tee.ratings?.find((r) => r.type === 'Total');
  return { rating: total?.courseRating ?? 0, yardage: tee.totalYardage ?? 0 };
}

export interface CaptainRankEntry {
  playerId: string;
  courseHandicap: number; // rounded, off their own tee (allowance applied) — the number shown elsewhere
  eligible: boolean;      // has a handicap index; no-index players are never auto-picked as captain
}

// Rank the field for captaincy, BEST (lowest course handicap) first. Order:
// eligible-before-ineligible, then lowest rounded course handicap, then harder
// tee (rating, yardage), then the finer unrounded handicap, then name. Uses the
// SAME allowance-adjusted course handicap shown on the build page so the picked
// captains match the numbers the organizer sees.
export function rankPlayersForCaptain(
  players: Player[],
  course: CourseSelection | null,
  allowance: number
): CaptainRankEntry[] {
  const rows = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    precise: getPoolPlayingHandicap(p, course, allowance),
    diff: teeDifficulty(getPlayerTee(p, course)),
    eligible: p.handicapIndex != null,
  }));
  rows.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    const ra = Math.round(a.precise), rb = Math.round(b.precise);
    if (ra !== rb) return ra - rb;
    if (a.diff.rating !== b.diff.rating) return b.diff.rating - a.diff.rating;
    if (a.diff.yardage !== b.diff.yardage) return b.diff.yardage - a.diff.yardage;
    if (a.precise !== b.precise) return a.precise - b.precise;
    return a.name.localeCompare(b.name);
  });
  return rows.map((r) => ({ playerId: r.playerId, courseHandicap: Math.round(r.precise), eligible: r.eligible }));
}

// Auto-pick captains: the `numTeams` lowest course handicaps, one per team. No
// two captains may come from the same pairing lock (locked players must anchor
// different teams), and no-index players are skipped. Returns up to numTeams
// player ids, best first.
export function pickCaptains(
  players: Player[],
  course: CourseSelection | null,
  allowance: number,
  numTeams: number,
  locks: string[][] = []
): string[] {
  const ranked = rankPlayersForCaptain(players, course, allowance).filter((r) => r.eligible);
  const lockOf = new Map<string, number>();
  locks.forEach((g, i) => g.forEach((id) => lockOf.set(id, i)));
  const captains: string[] = [];
  const usedLocks = new Set<number>();
  for (const r of ranked) {
    if (captains.length >= numTeams) break;
    const li = lockOf.get(r.playerId);
    if (li !== undefined) {
      if (usedLocks.has(li)) continue; // a lock-mate already captains a team
      usedLocks.add(li);
    }
    captains.push(r.playerId);
  }
  return captains;
}

// A balancing "unit": one or more players that must share a team (a lock is a
// multi-player unit; a free player is a size-1 unit). `h` is the unit's combined
// handicap, `size` how many team seats it consumes.
interface BalanceUnit { ids: string[]; h: number; size: number }

// Core balancer: distribute UNITS across `numTeams` so combined team handicaps
// are as even as possible, respecting each team's seat capacity and keeping each
// unit's players together. Greedy LPT seed -> 2-swap local improvement -> exact
// branch-and-bound (seeded so any early exit is still >= as good; symmetry-
// pruned; 800ms budget). Returns player-id groups per team. The plain, the
// locked, and the captain balancers all run through here, so locking a pair that
// was already together costs nothing — the exact search finds the same optimum.
//
// `initialSums`/`initialSeats` pre-load each team with handicap load and seats
// already committed to it (a seeded captain and any lock-mates riding along) —
// those players are NOT among `units`; only the free units are distributed here,
// and they fill the remaining seats around the fixed seeds.
function balanceUnitsIntoTeams(
  units: BalanceUnit[],
  numTeams: number,
  deadline: number,
  initialSums?: number[],
  initialSeats?: number[],
): string[][] {
  const nt = Math.max(1, numTeams);
  const seed = (arr?: number[]) => Array.from({ length: nt }, (_, i) => arr?.[i] ?? 0);
  const initSums = seed(initialSums);
  const initSeats = seed(initialSeats);

  const seededSeats = initSeats.reduce((s, v) => s + v, 0);
  const totalSeats = units.reduce((s, u) => s + u.size, 0) + seededSeats;
  const base = Math.floor(totalSeats / nt);
  const extra = totalSeats % nt;
  // Even target sizes, but never below what a team is already seeded with (an
  // oversized captain lock could otherwise exceed its share and be infeasible).
  const caps = Array.from({ length: nt }, (_, i) => Math.max(base + (i < extra ? 1 : 0), initSeats[i]));

  // Heaviest unit first (LPT). Ties broken by larger size first so bulky locks
  // are placed while teams still have room.
  const sorted = [...units].sort((a, b) => (b.h - a.h) || (b.size - a.size));
  const h = sorted.map((u) => u.h);
  const sz = sorted.map((u) => u.size);
  const n = sorted.length;
  // Total includes seeded load so the B&B average bound reflects final team sums.
  const total = h.reduce((s, v) => s + v, 0) + initSums.reduce((s, v) => s + v, 0);
  const spreadOf = (sums: number[]) => Math.max(...sums) - Math.min(...sums);

  // 1) Greedy LPT: each unit onto the least-loaded team that still has seats.
  // Teams start pre-loaded with their seeded captain/lock load and seats.
  const buckets: number[][] = Array.from({ length: nt }, () => []);
  const sums = [...initSums];
  const seats = [...initSeats];
  for (let idx = 0; idx < n; idx++) {
    let best = -1;
    for (let t = 0; t < nt; t++) {
      if (seats[t] + sz[idx] > caps[t]) continue;
      if (best === -1 || sums[t] < sums[best]) best = t;
    }
    if (best === -1) { // no exact-fit team (uneven lock sizes) — least-loaded overall
      for (let t = 0; t < nt; t++) if (best === -1 || sums[t] < sums[best]) best = t;
    }
    buckets[best].push(idx);
    sums[best] += h[idx];
    seats[best] += sz[idx];
  }

  // 2) 2-swap local improvement — only swaps that keep both teams within seats.
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 300) {
    improved = false;
    for (let a = 0; a < nt && !improved; a++) {
      for (let b = a + 1; b < nt && !improved; b++) {
        for (let i = 0; i < buckets[a].length && !improved; i++) {
          for (let j = 0; j < buckets[b].length; j++) {
            const ua = buckets[a][i], ub = buckets[b][j];
            if (seats[a] - sz[ua] + sz[ub] > caps[a]) continue;
            if (seats[b] - sz[ub] + sz[ua] > caps[b]) continue;
            const before = spreadOf(sums);
            sums[a] += h[ub] - h[ua];
            sums[b] += h[ua] - h[ub];
            if (spreadOf(sums) < before - 1e-9) {
              buckets[a][i] = ub; buckets[b][j] = ua;
              seats[a] += sz[ub] - sz[ua]; seats[b] += sz[ua] - sz[ub];
              improved = true;
              break;
            }
            sums[a] -= h[ub] - h[ua];
            sums[b] -= h[ua] - h[ub];
          }
        }
      }
    }
  }

  // 3) Exact branch-and-bound, seeded with the swap result.
  let bestSpread = spreadOf(sums);
  let bestAssign = buckets.map((b) => [...b]);
  const avg = total / nt;
  const curSums = [...initSums];
  const curSeats = [...initSeats];
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
      if (curSeats[t] + sz[i] > caps[t]) continue;
      const key = `${curSums[t]}:${curSeats[t]}`;
      if (seen.has(key)) continue; // symmetry prune: identical (load, seats) teams
      seen.add(key);
      curSums[t] += h[i]; curSeats[t] += sz[i]; curTeams[t].push(i);
      rec(i + 1);
      curTeams[t].pop(); curSums[t] -= h[i]; curSeats[t] -= sz[i];
    }
  }
  rec(0);

  return bestAssign.map((idxs) => idxs.flatMap((idx) => sorted[idx].ids));
}

// Balance players into `numTeams` groups with the most-even combined handicap.
// Returns player IDs grouped per team. `hcapOf` supplies each player's handicap.
export function balanceTeamsByHandicap(
  players: Player[],
  numTeams: number,
  hcapOf: (p: Player) => number
): string[][] {
  const units: BalanceUnit[] = players.map((p) => ({ ids: [p.id], h: hcapOf(p), size: 1 }));
  return balanceUnitsIntoTeams(units, numTeams, Date.now() + 800);
}

// Balance into `numTeams` even-handicap groups while honoring PAIRING LOCKS:
// every set of player IDs in `locks` must land on the same team. Players not in
// any lock are free. Runs the SAME exact solver as balanceTeamsByHandicap — a
// lock is just an indivisible multi-seat unit — so locking a pair that would
// already have been together produces the same optimal balance (no needless
// reshuffle), and locks that do cost balance are still solved optimally within
// that constraint.
export function balanceTeamsWithLocks(
  players: Player[],
  numTeams: number,
  hcapOf: (p: Player) => number,
  locks: string[][]
): string[][] {
  const nt = Math.max(1, numTeams);
  const byId = new Map(players.map((p) => [p.id, p]));

  // Build units. A lock with >=2 present members is one indivisible unit;
  // everyone else is a size-1 unit. Guard against a player id appearing in
  // multiple locks (first wins) or a lock naming an absent player.
  const claimed = new Set<string>();
  const units: BalanceUnit[] = [];
  for (const group of locks) {
    const ids = group.filter((id) => byId.has(id) && !claimed.has(id));
    if (ids.length < 2) continue; // a 1-member "lock" is just a free player
    ids.forEach((id) => claimed.add(id));
    units.push({ ids, h: ids.reduce((s, id) => s + hcapOf(byId.get(id)!), 0), size: ids.length });
  }
  for (const p of players) {
    if (claimed.has(p.id)) continue;
    units.push({ ids: [p.id], h: hcapOf(p), size: 1 });
  }

  return balanceUnitsIntoTeams(units, nt, Date.now() + 800);
}

// Balance into `numTeams` even-handicap groups AROUND FIXED CAPTAINS. Team slot
// `i` is anchored by captain `captainByTeam[i]`; the field is then distributed to
// make combined team handicaps as even as possible with those anchors held in
// place. Any pairing-lock mates of a captain ride along onto that captain's team.
// Remaining locks and players fill the open seats via the SAME optimal solver.
//
// Returns player-id groups per team slot (aligned to `captainByTeam`), each with
// its captain FIRST. Slots with no captain are balanced normally. With every slot
// captainless this degenerates exactly to balanceTeamsWithLocks.
export function balanceTeamsWithCaptains(
  players: Player[],
  numTeams: number,
  hcapOf: (p: Player) => number,
  captainByTeam: (string | undefined)[],
  locks: string[][] = []
): string[][] {
  const nt = Math.max(1, numTeams);
  const byId = new Map(players.map((p) => [p.id, p]));
  const lockByMember = new Map<string, string[]>();
  for (const g of locks) {
    const present = g.filter((id) => byId.has(id));
    for (const id of present) lockByMember.set(id, present);
  }

  const claimed = new Set<string>();
  const initSums = new Array(nt).fill(0);
  const initSeats = new Array(nt).fill(0);
  // Players seeded onto each slot (captain first, then any lock-mates riding along).
  const seeded: string[][] = Array.from({ length: nt }, () => []);

  for (let i = 0; i < nt; i++) {
    const capId = captainByTeam[i];
    if (!capId || !byId.has(capId) || claimed.has(capId)) continue;
    // Captain + any not-yet-claimed lock-mates anchor this slot together.
    const group = [capId, ...(lockByMember.get(capId) ?? []).filter((id) => id !== capId)]
      .filter((id) => !claimed.has(id));
    for (const id of group) {
      claimed.add(id);
      initSums[i] += hcapOf(byId.get(id)!);
      initSeats[i] += 1;
      seeded[i].push(id);
    }
  }

  // Free units: remaining locks as indivisible multi-seat units, everyone else
  // as size-1 units. (A lock whose members were all pulled onto captains' teams
  // simply contributes nothing here.)
  const units: BalanceUnit[] = [];
  const usedLock = new Set<string[]>();
  for (const p of players) {
    if (claimed.has(p.id)) continue;
    const lock = lockByMember.get(p.id);
    if (lock && lock.length >= 2) {
      if (usedLock.has(lock)) continue;
      usedLock.add(lock);
      const ids = lock.filter((id) => !claimed.has(id));
      ids.forEach((id) => claimed.add(id));
      if (ids.length >= 2) { units.push({ ids, h: ids.reduce((s, id) => s + hcapOf(byId.get(id)!), 0), size: ids.length }); continue; }
      // Fell to a single free member — fall through as a size-1 unit.
      if (ids.length === 1) { units.push({ ids, h: hcapOf(byId.get(ids[0])!), size: 1 }); continue; }
      continue;
    }
    claimed.add(p.id);
    units.push({ ids: [p.id], h: hcapOf(p), size: 1 });
  }

  const filled = balanceUnitsIntoTeams(units, nt, Date.now() + 800, initSums, initSeats);
  // Prepend each slot's seeded captain (+ lock-mates) ahead of the free fills.
  return filled.map((ids, i) => [...seeded[i], ...ids]);
}

// --- Fair player swaps -----------------------------------------------------

// The per-player STROKES-THIS-GAME map — the exact same off-the-low-adjusted
// playing handicap the scorecards and foursome cards use. Under 'full' it's the
// raw course handicap; under 'off-the-low' the field low is subtracted from
// everyone. Exposed so the swap tool can display and compare on the SAME number
// the organizer sees on the cards (raw course handicap looked wrong to him in an
// off-the-low game). Swapping players between teams never changes the field low
// (it's over the whole field), so this map is invariant under any swap and can be
// computed once and reused for every simulated arrangement.
export function poolStrokeMap(game: PoolGame): Map<string, number> {
  return buildHcapMap(game);
}

// The spread (max team total − min team total) of combined STROKES-THIS-GAME
// across all teams — the same "even teams" metric the auto-balancer minimizes,
// now expressed in the strokes players actually receive. Takes a precomputed
// stroke map (from poolStrokeMap) so it stays consistent with the cards and so
// simulated swaps reuse one map. Empty teams are ignored so they don't peg the
// spread at the full max.
export function teamHandicapSpread(
  teams: PoolTeam[],
  hcapById: Map<string, number>
): number {
  const totals = teams
    .filter((t) => t.playerIds.length > 0)
    .map((t) => t.playerIds.reduce((s, id) => s + (hcapById.get(id) ?? 0), 0));
  if (totals.length === 0) return 0;
  return Math.max(...totals) - Math.min(...totals);
}

export interface SwapCandidate {
  playerId: string;        // the player on the OTHER team we'd swap in
  teamId: string;          // that player's current team
  teamName: string;
  resultingSpread: number; // team-total spread AFTER this 1-for-1 swap
  currentSpread: number;   // spread BEFORE any swap (same for every candidate)
  delta: number;           // resultingSpread − currentSpread (negative = fairer)
}

// For a chosen player, rank every 1-for-1 swap partner on the OTHER teams by how
// FAIR the teams would be afterward (resulting handicap spread, lowest first).
// Fairness is measured on each player's STROKES THIS GAME (off-the-low-adjusted,
// off THEIR OWN tee) — the same number shown on the cards — so a swap that moves
// players between tees is judged on real strokes. A 1-for-1 swap never changes
// team sizes, so size stays valid automatically.
export function rankSwapCandidates(
  game: PoolGame,
  playerId: string
): SwapCandidate[] {
  const { teams } = game;
  const fromTeam = teams.find((t) => t.playerIds.includes(playerId));
  if (!fromTeam) return [];

  // One stroke map for the whole field; a swap can't change it (field low is
  // over everyone), so reuse it for the base and every simulated arrangement.
  const hcapById = poolStrokeMap(game);
  const currentSpread = teamHandicapSpread(teams, hcapById);
  const candidates: SwapCandidate[] = [];

  for (const other of teams) {
    if (other.id === fromTeam.id) continue;
    for (const otherPid of other.playerIds) {
      // Simulate the swap: playerId <-> otherPid between the two teams.
      const simulated = teams.map((t) => {
        if (t.id === fromTeam.id) return { ...t, playerIds: t.playerIds.map((id) => (id === playerId ? otherPid : id)) };
        if (t.id === other.id) return { ...t, playerIds: t.playerIds.map((id) => (id === otherPid ? playerId : id)) };
        return t;
      });
      const resultingSpread = teamHandicapSpread(simulated, hcapById);
      candidates.push({
        playerId: otherPid,
        teamId: other.id,
        teamName: other.name,
        resultingSpread,
        currentSpread,
        delta: resultingSpread - currentSpread,
      });
    }
  }

  // Fairest first (lowest resulting spread); stable tiebreak by team name.
  candidates.sort((a, b) => (a.resultingSpread - b.resultingSpread) || a.teamName.localeCompare(b.teamName));
  return candidates;
}

// Order a set of player IDs by playing handicap, LOW to HIGH (the organizer
// wants each foursome listed best-to-worst instead of the snake-draft order).
export function sortPlayerIdsByHcap(
  playerIds: string[],
  players: Player[],
  course: CourseSelection | null,
  allowance: number
): string[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return [...playerIds].sort((a, b) => {
    const pa = byId.get(a), pb = byId.get(b);
    const ha = pa ? getPoolPlayingHandicap(pa, course, allowance) : 0;
    const hb = pb ? getPoolPlayingHandicap(pb, course, allowance) : 0;
    return ha - hb;
  });
}

// Display order for a foursome: the CAPTAIN first (so the (C) row leads), then
// everyone else low->high. Used by every read-only team view so the captain is
// always at the top regardless of their handicap.
export function orderPlayerIdsWithCaptain(
  playerIds: string[],
  captainId: string | undefined,
  players: Player[],
  course: CourseSelection | null,
  allowance: number
): string[] {
  const sorted = sortPlayerIdsByHcap(playerIds, players, course, allowance);
  if (!captainId || !sorted.includes(captainId)) return sorted;
  return [captainId, ...sorted.filter((id) => id !== captainId)];
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
