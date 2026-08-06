// Club + shot-shape vocabulary — the single source of truth for the solo-round
// shot log. The tap-fallback chips, the voice parser (shot-voice.ts), and the
// per-club distance stats (shot-distance.ts) all read from here so a club is
// spelled/ordered/grouped one way everywhere.

export type ClubId =
  | 'Dr' | '3w' | '5w' | '7w'
  | '2h' | '3h' | '4h' | '5h'
  | '1i' | '2i' | '3i' | '4i' | '5i' | '6i' | '7i' | '8i' | '9i'
  | 'PW' | 'GW' | 'SW' | 'LW'
  | 'Putter';

export type ClubKind = 'wood' | 'hybrid' | 'iron' | 'wedge' | 'putter';

export interface ClubDef {
  id: ClubId;
  label: string;   // short chip label
  kind: ClubKind;
}

// Ordered longest → shortest, grouped by kind. This order drives the tap chips.
export const CLUBS: ClubDef[] = [
  { id: 'Dr', label: 'Driver', kind: 'wood' },
  { id: '3w', label: '3W', kind: 'wood' },
  { id: '5w', label: '5W', kind: 'wood' },
  { id: '7w', label: '7W', kind: 'wood' },
  { id: '2h', label: '2H', kind: 'hybrid' },
  { id: '3h', label: '3H', kind: 'hybrid' },
  { id: '4h', label: '4H', kind: 'hybrid' },
  { id: '5h', label: '5H', kind: 'hybrid' },
  { id: '1i', label: '1i', kind: 'iron' },
  { id: '2i', label: '2i', kind: 'iron' },
  { id: '3i', label: '3i', kind: 'iron' },
  { id: '4i', label: '4i', kind: 'iron' },
  { id: '5i', label: '5i', kind: 'iron' },
  { id: '6i', label: '6i', kind: 'iron' },
  { id: '7i', label: '7i', kind: 'iron' },
  { id: '8i', label: '8i', kind: 'iron' },
  { id: '9i', label: '9i', kind: 'iron' },
  { id: 'PW', label: 'PW', kind: 'wedge' },
  { id: 'GW', label: 'GW', kind: 'wedge' },
  { id: 'SW', label: 'SW', kind: 'wedge' },
  { id: 'LW', label: 'LW', kind: 'wedge' },
  { id: 'Putter', label: 'Putter', kind: 'putter' },
];

const CLUB_BY_ID = new Map<ClubId, ClubDef>(CLUBS.map((c) => [c.id, c]));

export function clubDef(id: ClubId): ClubDef | undefined {
  return CLUB_BY_ID.get(id);
}

export function clubLabel(id: ClubId | undefined): string {
  if (!id) return '';
  return CLUB_BY_ID.get(id)?.label ?? id;
}

// Kinds in display order, for grouping the tap chips into rows.
export const CLUB_KINDS: ClubKind[] = ['wood', 'hybrid', 'iron', 'wedge', 'putter'];

export function clubsOfKind(kind: ClubKind): ClubDef[] {
  return CLUBS.filter((c) => c.kind === kind);
}

// ---------------------------------------------------------------------------
// Shot shape / intent tags
// ---------------------------------------------------------------------------

export type ShapeTag =
  | 'full' | 'soft' | 'hard'
  | 'punch' | 'low' | 'high'
  | 'running' | 'draw' | 'fade'
  | 'chip' | 'pitch' | 'flop' | 'bump';

// Tags a user picks from as chips. `chip`/`pitch`/`flop`/`bump` also flag the
// shot as a short-game shot (kind='chip') in the parser.
export const SHAPES: ShapeTag[] = [
  'full', 'soft', 'hard', 'punch', 'low', 'high', 'running', 'draw', 'fade',
];

export const SHORT_GAME_SHAPES: ShapeTag[] = ['chip', 'pitch', 'flop', 'bump'];

export const SHAPE_LABEL: Record<ShapeTag, string> = {
  full: 'Full', soft: 'Soft', hard: 'Hard', punch: 'Punch', low: 'Low',
  high: 'High', running: 'Running', draw: 'Draw', fade: 'Fade',
  chip: 'Chip', pitch: 'Pitch', flop: 'Flop', bump: 'Bump & run',
};

// ---------------------------------------------------------------------------
// Synonyms for the voice parser. Keys are lowercase phrases that may appear in
// a transcript; values are the canonical club id. Number words are handled
// separately (see shot-voice.ts) so we only need the non-obvious spellings and
// nicknames here.
// ---------------------------------------------------------------------------

export const CLUB_SYNONYMS: Record<string, ClubId> = {
  driver: 'Dr', 'big dog': 'Dr', 'one wood': 'Dr', '1 wood': 'Dr',
  'three wood': '3w', '3 wood': '3w', threewood: '3w', 'fairway wood': '3w',
  'five wood': '5w', '5 wood': '5w',
  'seven wood': '7w', '7 wood': '7w',
  hybrid: '3h', rescue: '3h',
  'pitching wedge': 'PW', pw: 'PW',
  'gap wedge': 'GW', 'approach wedge': 'GW', gap: 'GW', gw: 'GW',
  'sand wedge': 'SW', sand: 'SW', sandy: 'SW', sw: 'SW',
  'lob wedge': 'LW', lob: 'LW', lw: 'LW',
  putter: 'Putter', putt: 'Putter', flatstick: 'Putter',
};

// Shape words → canonical tag (voice). Includes a few natural variants.
export const SHAPE_SYNONYMS: Record<string, ShapeTag> = {
  full: 'full', stock: 'full', normal: 'full', standard: 'full',
  soft: 'soft', smooth: 'soft', easy: 'soft',
  hard: 'hard', hammer: 'hard', crush: 'hard',
  punch: 'punch', punched: 'punch', knockdown: 'punch', 'knock down': 'punch',
  low: 'low',
  high: 'high', lofted: 'high',
  running: 'running', run: 'running', bump: 'bump', 'bump and run': 'bump',
  draw: 'draw', hook: 'draw',
  fade: 'fade', cut: 'fade', slice: 'fade',
  chip: 'chip',
  pitch: 'pitch',
  flop: 'flop',
};
