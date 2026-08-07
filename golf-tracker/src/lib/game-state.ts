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

export function calcCourseHandicap(
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number
): number {
  return handicapIndex * (slopeRating / 113) + (courseRating - par);
}

// Apply a handicap allowance the way the USGA does (Rules of Handicapping 6.1 →
// 6.2): Course Handicap is rounded to a whole number FIRST — that integer is
// what GHIN displays and what a player writes on the card — and the allowance is
// applied to THAT. Callers round the result when they need an integer.
//
// The order matters. round(CH × allowance) and round(CH) × allowance diverge
// whenever the fractional course handicaps in a field round in different
// directions, and under off-the-low that difference shows up as a whole stroke.
// This lives here, next to calcCourseHandicap, because EVERY scoring path (pool,
// tournament live scoring, money games, side games, the quick-game play page)
// must apply the allowance identically or the same player gets different strokes
// on different screens.
//
// NOTE: this is only for the 'course' handicap basis. The 'index' basis
// deliberately skips the slope/rating conversion, so there is no Course Handicap
// to round — applying this there would change what the organizer asked for.
export function applyAllowance(courseHandicap: number, allowancePercent: number): number {
  return Math.round(courseHandicap) * (allowancePercent / 100);
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
  return isPlus ? -n : n;
}
