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
// Shot OUTCOME — what actually happened, as opposed to `ShapeTag` above, which
// is what you were TRYING to do.
//
// Keeping these apart is the whole point. A tag list that mixes them can't
// answer "is my fade working?", because `fade` would mean both "I aimed a fade"
// and "I sliced it". With intent and outcome separate, intended-fade + straight
// outcome is a countable event, and a fade success rate becomes a real stat.
//
// Two independent axes, both optional:
//   direction — where it finished relative to target (left/right/short/long)
//   strike    — quality of contact (flushed/thin/fat/topped/chunked)
// A shot can have one, both, or neither. GPS can't observe either (two points
// define a straight line), so this is the only way these ever get recorded.
// ---------------------------------------------------------------------------

export type MissDirection =
  | 'straight' | 'left' | 'right'
  | 'short' | 'long'
  | 'shortLeft' | 'shortRight' | 'longLeft' | 'longRight';

export type StrikeQuality =
  | 'flushed' | 'solid' | 'thin' | 'fat' | 'topped' | 'chunked'
  | 'toe' | 'heel' | 'shanked' | 'blocked' | 'duffed';

export type OutcomeTag = MissDirection | StrikeQuality;

export const MISS_DIRECTIONS: MissDirection[] = [
  'straight', 'left', 'right', 'short', 'long',
  'shortLeft', 'shortRight', 'longLeft', 'longRight',
];

export const STRIKE_QUALITIES: StrikeQuality[] = [
  'flushed', 'solid', 'thin', 'fat', 'topped', 'chunked',
  'toe', 'heel', 'shanked', 'blocked', 'duffed',
];

export const OUTCOME_LABEL: Record<OutcomeTag, string> = {
  straight: 'Straight', left: 'Left', right: 'Right', short: 'Short', long: 'Long',
  shortLeft: 'Short left', shortRight: 'Short right',
  longLeft: 'Long left', longRight: 'Long right',
  flushed: 'Flushed', solid: 'Solid', thin: 'Thin', fat: 'Fat',
  topped: 'Topped', chunked: 'Chunked', toe: 'Off the toe', heel: 'Off the heel',
  shanked: 'Shank', blocked: 'Blocked', duffed: 'Duffed',
};

// A mis-strike makes a shot's distance meaningless as a measure of how far you
// hit that club — a thinned 7-iron is not a 7-iron sample. These are excluded
// from the stock per-club average (still recorded, and still worth counting as a
// tendency). `flushed`/`solid` are good contact and stay in.
export const MISHIT_STRIKES: StrikeQuality[] = [
  'thin', 'fat', 'topped', 'chunked', 'toe', 'heel', 'shanked', 'duffed',
];

// Voice synonyms → outcome tag. Ordered longest-first at use site so
// "short left" beats a bare "left". Golfers have a lot of words for this.
export const OUTCOME_SYNONYMS: Record<string, OutcomeTag> = {
  // --- combined direction (must be matched before the bare words) ---
  'short left': 'shortLeft', 'left and short': 'shortLeft',
  'short right': 'shortRight', 'right and short': 'shortRight',
  'long left': 'longLeft', 'left and long': 'longLeft',
  'long right': 'longRight', 'right and long': 'longRight',

  // --- direction ---
  straight: 'straight', 'dead straight': 'straight', 'right at it': 'straight',
  'on line': 'straight', 'stiffed it': 'straight', flag: 'straight',
  left: 'left', pulled: 'left', pull: 'left', hooked: 'left', 'drew it': 'left',
  right: 'right', pushed: 'right', push: 'right', sliced: 'right',
  'cut it': 'right', 'faded it': 'right', 'leaked right': 'right',
  short: 'short', 'came up short': 'short', 'left it short': 'short',
  'in the front': 'short', 'not enough': 'short',
  long: 'long', 'too much': 'long', 'over the green': 'long',
  'flew it': 'long', 'went long': 'long', 'airmailed': 'long',

  // --- strike quality ---
  flushed: 'flushed', flush: 'flushed', 'pured it': 'flushed', pured: 'flushed',
  striped: 'flushed', 'nutted it': 'flushed', 'crushed it': 'flushed',
  solid: 'solid', 'well struck': 'solid', 'caught it clean': 'solid',
  thin: 'thin', thinned: 'thin', 'thinned it': 'thin', bladed: 'thin',
  'caught it thin': 'thin', skinny: 'thin',
  fat: 'fat', fatted: 'fat', 'fatted it': 'fat', 'hit it fat': 'fat',
  'behind it': 'fat', 'caught it fat': 'fat', heavy: 'fat',
  topped: 'topped', 'topped it': 'topped', 'top it': 'topped',
  chunked: 'chunked', 'chunked it': 'chunked', chunk: 'chunked',
  'took a divot first': 'chunked',
  toe: 'toe', 'off the toe': 'toe', toed: 'toe',
  heel: 'heel', 'off the heel': 'heel', heeled: 'heel',
  shanked: 'shanked', shank: 'shanked', 'hosel rocket': 'shanked',
  blocked: 'blocked', 'block it': 'blocked',
  duffed: 'duffed', duff: 'duffed', 'chili dipped': 'duffed', 'chili dip': 'duffed',
};

// Words that signal the utterance is reporting an OUTCOME rather than an intent
// ("I missed it left", "that was thin"). Used to disambiguate a bare direction
// word from a shape word — see parseOutcome in shot-voice.ts.
export const OUTCOME_CUES = [
  'missed', 'miss', 'mis hit', 'mishit', 'that was', 'thats', "that's",
  'ended up', 'finished', 'went', 'came up', 'caught it', 'hit it',
  'i was', 'it was', 'left it', 'pulled', 'pushed', 'blocked',
];

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
