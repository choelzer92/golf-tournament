export interface GameFormat {
  id: string;
  name: string;
  description: string;
  teamMode: 'individual' | 'teams';
  playersMin: number;
  playersMax: number;
  defaultHandicapAllowance: number;
  scoringType: 'hole-by-hole' | 'total';
  settings?: FormatSetting[];
}

export interface FormatSetting {
  key: string;
  label: string;
  type: 'toggle' | 'select' | 'number';
  options?: { value: string; label: string }[];
  defaultValue: string | number | boolean;
}

export const FORMATS: GameFormat[] = [
  {
    id: 'match-play',
    name: 'Match Play',
    description: '1v1 hole-by-hole. Win the hole, win the point.',
    teamMode: 'individual',
    playersMin: 2,
    playersMax: 2,
    defaultHandicapAllowance: 100,
    scoringType: 'hole-by-hole',
    settings: [
      {
        key: 'presses',
        label: 'Auto-press when 2 down',
        type: 'toggle',
        defaultValue: false,
      },
    ],
  },
  {
    id: 'best-ball',
    name: 'Best Ball (2v2)',
    description: 'Teams of 2. Best net score on each hole counts.',
    teamMode: 'teams',
    playersMin: 4,
    playersMax: 4,
    defaultHandicapAllowance: 90,
    scoringType: 'hole-by-hole',
  },
  {
    id: 'skins',
    name: 'Skins',
    description: 'Win the hole outright to win the skin. Ties carry over.',
    teamMode: 'individual',
    playersMin: 2,
    playersMax: 8,
    defaultHandicapAllowance: 100,
    scoringType: 'hole-by-hole',
    settings: [
      {
        key: 'carryover',
        label: 'Carryovers',
        type: 'toggle',
        defaultValue: true,
      },
      {
        key: 'skinValue',
        label: 'Skin value',
        type: 'number',
        defaultValue: 1,
      },
    ],
  },
  {
    id: 'stableford',
    name: 'Stableford',
    description: 'Points per hole based on net score. Higher is better.',
    teamMode: 'individual',
    playersMin: 2,
    playersMax: 8,
    defaultHandicapAllowance: 100,
    scoringType: 'hole-by-hole',
  },
  {
    id: 'nassau',
    name: 'Nassau',
    description: 'Three bets in one: front 9, back 9, and overall.',
    teamMode: 'individual',
    playersMin: 2,
    playersMax: 4,
    defaultHandicapAllowance: 100,
    scoringType: 'hole-by-hole',
    settings: [
      {
        key: 'presses',
        label: 'Auto-press when 2 down',
        type: 'toggle',
        defaultValue: false,
      },
    ],
  },
  {
    id: 'stroke-play',
    name: 'Stroke Play',
    description: 'Total strokes win. Simple as it gets.',
    teamMode: 'individual',
    playersMin: 2,
    playersMax: 8,
    defaultHandicapAllowance: 100,
    scoringType: 'total',
  },
];
