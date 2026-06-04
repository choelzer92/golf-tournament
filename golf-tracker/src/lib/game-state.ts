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
  return Math.round(handicapIndex * (slopeRating / 113) + (courseRating - par));
}
