export type TeamMode = 'individual' | 'best-ball' | 'two-best-balls' | 'combined' | 'scramble' | 'alternate-shot';

export type TwoBestBallsVariant = '1-net-1-gross' | '2-best-net' | '2-best-gross';

export interface TeamModeConfig {
  id: TeamMode;
  name: string;
  description: string;
  usgaAllowance: number | 'tiered';
  usgaStrokeMethod: 'full' | 'off-the-low';
  oneBallPerTeam: boolean;
  settings?: TeamModeSetting[];
}

export interface TeamModeSetting {
  key: string;
  label: string;
  type: 'select';
  options: { value: string; label: string }[];
  defaultValue: string;
}

export const TEAM_MODES: TeamModeConfig[] = [
  {
    id: 'individual',
    name: 'Individual (1v1)',
    description: 'Each player plays their own ball. One player per side.',
    usgaAllowance: 100,
    usgaStrokeMethod: 'off-the-low',
    oneBallPerTeam: false,
  },
  {
    id: 'best-ball',
    name: 'Best Ball',
    description: 'Each player plays their own ball. Lowest net score from the team counts.',
    usgaAllowance: 90,
    usgaStrokeMethod: 'off-the-low',
    oneBallPerTeam: false,
  },
  {
    id: 'two-best-balls',
    name: 'Two Best Balls',
    description: 'Each player plays their own ball. Two best scores from the team count.',
    usgaAllowance: 90,
    usgaStrokeMethod: 'off-the-low',
    oneBallPerTeam: false,
    settings: [
      {
        key: 'ballSelection',
        label: 'Ball selection',
        type: 'select',
        options: [
          { value: '1-net-1-gross', label: '1 Net + 1 Gross (different players)' },
          { value: '2-best-net', label: '2 Best Net' },
          { value: '2-best-gross', label: '2 Best Gross' },
        ],
        defaultValue: '1-net-1-gross',
      },
    ],
  },
  {
    id: 'combined',
    name: 'Combined (All Count)',
    description: 'Each player plays their own ball. All scores added together for the team.',
    usgaAllowance: 100,
    usgaStrokeMethod: 'full',
    oneBallPerTeam: false,
  },
  {
    id: 'scramble',
    name: 'Scramble',
    description: 'All hit, pick best shot, repeat. USGA tiered handicap (35/15, 20/15/10, 20/15/10/5).',
    usgaAllowance: 'tiered',
    usgaStrokeMethod: 'full',
    oneBallPerTeam: true,
  },
  {
    id: 'alternate-shot',
    name: 'Alternate Shot (Foursomes)',
    description: 'Partners alternate hitting same ball. USGA 60/40 weighting × 50%.',
    usgaAllowance: 50,
    usgaStrokeMethod: 'full',
    oneBallPerTeam: true,
  },
];

export interface GameFormat {
  id: string;
  name: string;
  description: string;
  scoringType: 'hole-by-hole' | 'total';
  allowedTeamModes: TeamMode[];
  defaultTeamMode: TeamMode;
  playersMin: number;
  playersMax: number;
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
    description: 'Compare team scores hole-by-hole. Win the hole, win the point.',
    scoringType: 'hole-by-hole',
    allowedTeamModes: ['individual', 'best-ball', 'two-best-balls', 'combined'],
    defaultTeamMode: 'best-ball',
    playersMin: 2,
    playersMax: 8,
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
    id: 'nassau',
    name: 'Nassau',
    description: 'Three bets in one: front 9, back 9, and overall.',
    scoringType: 'hole-by-hole',
    allowedTeamModes: ['individual', 'best-ball', 'two-best-balls', 'combined'],
    defaultTeamMode: 'individual',
    playersMin: 2,
    playersMax: 8,
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
    id: 'skins',
    name: 'Skins',
    description: 'Win the hole outright to win the skin. Ties carry over.',
    scoringType: 'hole-by-hole',
    allowedTeamModes: ['individual', 'best-ball'],
    defaultTeamMode: 'individual',
    playersMin: 2,
    playersMax: 8,
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
    id: 'stroke-play',
    name: 'Stroke Play',
    description: 'Total strokes win. Simple as it gets.',
    scoringType: 'total',
    allowedTeamModes: ['individual', 'best-ball', 'two-best-balls', 'combined'],
    defaultTeamMode: 'individual',
    playersMin: 2,
    playersMax: 8,
  },
  {
    id: 'stableford',
    name: 'Stableford',
    description: 'Points per hole based on net score. Higher is better.',
    scoringType: 'hole-by-hole',
    allowedTeamModes: ['individual', 'best-ball', 'two-best-balls', 'combined'],
    defaultTeamMode: 'individual',
    playersMin: 2,
    playersMax: 8,
  },
  {
    id: 'scramble',
    name: 'Scramble',
    description: 'All players hit, pick best shot, repeat from there.',
    scoringType: 'total',
    allowedTeamModes: ['scramble'],
    defaultTeamMode: 'scramble',
    playersMin: 2,
    playersMax: 4,
  },
  {
    id: 'alternate-shot',
    name: 'Alternate Shot (Foursomes)',
    description: 'Partners alternate hitting same ball. Alternate tee shots.',
    scoringType: 'hole-by-hole',
    allowedTeamModes: ['alternate-shot'],
    defaultTeamMode: 'alternate-shot',
    playersMin: 2,
    playersMax: 4,
  },
];

export function getTeamModeConfig(teamMode: TeamMode): TeamModeConfig {
  return TEAM_MODES.find((m) => m.id === teamMode)!;
}

export function getUsgaAllowance(teamMode: TeamMode): number | 'tiered' {
  return getTeamModeConfig(teamMode).usgaAllowance;
}

export function getUsgaStrokeMethod(teamMode: TeamMode): 'full' | 'off-the-low' {
  return getTeamModeConfig(teamMode).usgaStrokeMethod;
}

export function isOneBallFormat(teamMode: TeamMode): boolean {
  return getTeamModeConfig(teamMode).oneBallPerTeam;
}

export function isTeamMode(teamMode: TeamMode): boolean {
  return teamMode !== 'individual';
}
