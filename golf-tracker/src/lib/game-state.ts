export interface Player {
  id: string;
  name: string;
  handicapIndex: number | null;
  gender?: 'M' | 'F';
  ghinNumber?: number;
  teeSetId?: number;
  courseHandicap?: number;
  team?: 'A' | 'B';
}

export interface CourseSelection {
  courseId: number;
  courseName: string;
  city: string;
  state: string;
  teeSets: TeeSetOption[];
  selectedTeeId: number | null;
}

export interface TeeSetOption {
  id: number;
  name: string;
  gender?: 'M' | 'F';
  totalYardage: number;
  totalPar: number;
  ratings: {
    type: 'Front' | 'Back' | 'Total';
    courseRating: number;
    slopeRating: number;
  }[];
  holes: {
    number: number;
    par: number;
    yardage: number;
    handicap: number;
  }[];
}

export type StrokeMethod = 'full' | 'off-the-low';
export type HandicapBasis = 'course' | 'index';
export type { TeamMode } from './formats';

export interface SplitPairing {
  playerIds: [string, string];
}

export interface SplitFormatSetup {
  formatId: string;
  teamMode: import('./formats').TeamMode;
  scoringMethod: 'match-play' | 'stroke-play';
  pointsForWin?: number;
  pointsForTie?: number;
  pointsForLoss?: number;
  handicapAllowance: number;
  strokeMethod: StrokeMethod;
  formatSettings?: Record<string, string | number | boolean>;
  pairings?: SplitPairing[];
}

export interface GameSetup {
  formatId: string;
  teamMode: import('./formats').TeamMode;
  course: CourseSelection | null;
  players: Player[];
  handicapAllowance: number;
  holesPlaying: '18' | 'front9' | 'back9';
  strokeMethod: StrokeMethod;
  handicapBasis: HandicapBasis;
  formatSettings: Record<string, string | number | boolean>;
  splitFormat?: SplitFormatSetup;
  scoringTeam?: 'A' | 'B';
  matchupId?: string;
  // Pool games: fixed off-the-low baseline (the field-low playing handicap),
  // so a foursome's scorecard matches the pool leaderboard instead of computing
  // "the low" from just the 4 players on screen.
  offTheLowBaseline?: number;
}

export interface GameScore {
  playerId: string;
  hole: number;
  grossScore: number;
}

export interface GameState {
  setup: GameSetup;
  scores: GameScore[];
  currentHole: number;
  status: 'setup' | 'playing' | 'finished';
}

// The Handicap Index a nine-hole Course Handicap starts from. WHS 2024 Rule 6.1b: "(Handicap
// Index ÷ 2 (rounded to the nearest tenth))" (F-102 i, §5.bx). Worked in whole tenths, because
// 7.3 / 2 × 10 is 36.4999… in floating point and would round the wrong way. A half-tenth rounds
// up the number line, which on the plus side is toward zero (Rule 5.1c): 7.3 → 3.7, +7.3 → +3.6.
export function nineHoleIndex(handicapIndex: number): number {
  return Math.round(Math.round(handicapIndex * 10) / 2) / 10;
}

export function calcCourseHandicap(
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number
): number {
  return handicapIndex * (slopeRating / 113) + (courseRating - par);
}

// Apply a handicap allowance the way the USGA/GHIN default does (Rules of
// Handicapping 6.2): the allowance multiplies the UNROUNDED Course Handicap, and
// the result is rounded ONCE at the end — by the caller, when it needs an
// integer. Playing Handicap = round(CH × allowance), not round(round(CH) ×
// allowance).
//
// HISTORY — this order has flipped twice, both times to match the GHIN app
// (§5.ba: the app is the reference implementation, not our reading of the
// rules). Commit 3e8ace1 (2026-08-07) switched TO round-first off a Spring
// Creek off-the-low case; Craig's 2026-09-09 Spring Creek head-to-head report
// (7.6 vs 2.7 index, 90% → GHIN shows 6 strokes, round-first gives 5) plus the
// USGA's own guidance flipped it back to unrounded-first (F-022). If a future
// GHIN mismatch appears, capture app screenshots for BOTH a head-to-head
// difference and an off-the-low field before touching this again.
//
// The order matters. round(CH × allowance) and round(round(CH)) × allowance
// diverge whenever the fraction straddles the rounding boundary differently in
// the two orders. This lives here, next to calcCourseHandicap, because EVERY
// scoring path (pool, tournament live scoring, money games, side games, the
// quick-game play page) must apply the allowance identically or the same player
// gets different strokes on different screens.
//
// NOTE: this is only for the 'course' handicap basis. The 'index' basis
// deliberately skips the slope/rating conversion — applying this there would
// change what the organizer asked for.
export function applyAllowance(courseHandicap: number, allowancePercent: number): number {
  return courseHandicap * (allowancePercent / 100);
}

// Parse a GHIN handicap index into a number with the correct sign. GHIN sends
// "plus" handicaps (better than scratch) as a "+"-prefixed string like "+0.4",
// which must become NEGATIVE (-0.4) — a plus golfer ADDS strokes. parseFloat
// alone treats "+0.4" as +0.4, silently dropping the sign (an ~1-stroke error).
// Non-numeric values (e.g. "NH" = no handicap) return null.
export function parseGhinIndex(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const isPlus = s.startsWith('+');
  const n = parseFloat(isPlus ? s.slice(1) : s);
  if (isNaN(n)) return null;
  // WHS: a Handicap Index never exceeds 54.0 (Craig 2026-10-12, §5.ct). A higher entry is capped
  // there, and the index box says so, so a typo is visible rather than silently played.
  return isPlus ? -n : Math.min(n, MAX_HANDICAP_INDEX);
}

/** The highest Handicap Index the World Handicap System issues. */
export const MAX_HANDICAP_INDEX = 54;

// The inverse, for display: a plus index is stored negative (see parseGhinIndex) but golfers
// and GHIN write it "+2.1". Everything else prints as it always has.
/** Any handicap (course, playing, a team's combined) as golfers write it: a plus handicap is
 *  "+N", never "-N" (§5.bx). `digits` fixes the decimals; a value that rounds to 0 shows "0". */
export function formatHandicap(n: number, digits?: number): string {
  const s = digits === undefined ? String(Math.abs(n)) : Math.abs(n).toFixed(digits);
  return n < 0 && Number(s) !== 0 ? `+${s}` : s;
}

export function formatHandicapIndex(index: number | null | undefined, empty = '—'): string {
  if (index === null || index === undefined || Number.isNaN(index)) return empty;
  return index < 0 ? `+${-index}` : String(index);
}
