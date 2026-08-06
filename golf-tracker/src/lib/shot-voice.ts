// Voice → structured shot. A LOCAL, offline, free grammar (no API): tokenize
// the transcript and match club words / number words / shape words against the
// vocabulary in clubs.ts. Voice never auto-commits — the parse pre-fills the
// chips and the user confirms with Log, so a misparse is a tap away from fixed.
//
// Examples:
//   "full six iron"        → { club:'6i', shape:['full'], kind:'full' }
//   "low running 5 iron"   → { club:'5i', shape:['low','running'], kind:'full' }
//   "soft pitching wedge"  → { club:'PW', shape:['soft'], kind:'full' }
//   "chip sand wedge"      → { club:'SW', shape:['chip'], kind:'chip' }
//   "putt"                 → { club:'Putter', shape:[], kind:'putt' }

import type { ClubId, ShapeTag, OutcomeTag, MissDirection, StrikeQuality } from './clubs';
import {
  CLUB_SYNONYMS, SHAPE_SYNONYMS, SHORT_GAME_SHAPES,
  OUTCOME_SYNONYMS, OUTCOME_CUES, MISS_DIRECTIONS, STRIKE_QUALITIES,
} from './clubs';

export interface ParsedShot {
  club?: ClubId;
  shape: ShapeTag[];
  kind: 'full' | 'chip' | 'putt';
  targetYds?: number; // aimed distance said at address, e.g. "160 to the pin"
  confidence: 'high' | 'low';
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9,
};

const TEEN_WORDS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
};

// ---------------------------------------------------------------------------
// Conversational normalization. Real on-course speech is not a command line —
// it's "alright caddy, gonna hit a soft 7 here, I'm about 18-0 out". Two things
// have to happen before any matching:
//
//  1. Speech engines render spoken yardages with hyphens: "one eighty" comes
//     back as "18-0" or "1-80". Joining digit-hyphen-digit recovers "180".
//  2. Filler ("gonna hit a", "here", "I'm about") must not block a match, which
//     it doesn't as long as every pattern stays anchored on word boundaries
//     rather than the start of the string.
// ---------------------------------------------------------------------------

export function normalizeTranscript(raw: string): string {
  let t = ` ${raw.toLowerCase()} `;
  // "18-0" / "1-80" / "1-8-0" → "180". Repeat: each pass joins one hyphen.
  for (let i = 0; i < 3; i++) t = t.replace(/(\d)\s*[-–—]\s*(\d)/g, '$1$2');
  // Drop remaining punctuation, collapse whitespace.
  t = t.replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ');
  return ` ${t.trim()} `;
}

// ---------------------------------------------------------------------------
// Wake word. Required in hands-free mode so an open mic can safely AUTO-COMMIT
// without a "log it" suffix: "caddy, soft 7" is addressed to the app, while a
// partner's "nice seven iron" is not. Matched anywhere in the utterance because
// people lead with filler ("alright caddy, ...").
//
// The variants are not sloppiness — short names are exactly what recognizers
// mangle, and a wake word that only works when transcribed perfectly is a wake
// word that fails on the course. Better to accept "cabby" than to drop a shot.
// ---------------------------------------------------------------------------

const WAKE_RE = /\b(caddy|caddie|caddi|cady|cabby|cabbie|catty|candy|katie|kaddy|carty|hey caddy)\b/;

export function hasWakeWord(transcript: string): boolean {
  return WAKE_RE.test(normalizeTranscript(transcript));
}

// Strip the wake word (and common lead-in filler) so the rest parses cleanly.
export function stripWakeWord(transcript: string): string {
  let t = normalizeTranscript(transcript).replace(WAKE_RE, ' ');
  t = t.replace(/\b(alright|all right|okay|ok|hey|so|um|uh|well|now)\b/g, ' ');
  t = t.replace(/\b(i'?m )?(gonna|going to|about to|will|let'?s) (hit|play|try)\b/g, ' ');
  t = t.replace(/\b(hit|play|try)ing\b/g, ' ');
  return t.replace(/\s+/g, ' ');
}

// Longest synonym phrases first so "pitching wedge" beats a bare "wedge", and
// "bump and run" beats "bump". Precomputed once.
const CLUB_PHRASES = Object.keys(CLUB_SYNONYMS).sort((a, b) => b.length - a.length);
const SHAPE_PHRASES = Object.keys(SHAPE_SYNONYMS).sort((a, b) => b.length - a.length);

// A digit or number-word followed by iron/i → that iron. Handles "6 iron",
// "six iron", "6i", "6-iron".
function matchIron(text: string): ClubId | undefined {
  const m = text.match(/\b([1-9])\s*[-]?\s*(?:iron|i)\b/);
  if (m) return `${m[1]}i` as ClubId;
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    const re = new RegExp(`\\b${word}\\s*[-]?\\s*(?:iron|i)\\b`);
    if (re.test(text)) return `${n}i` as ClubId;
  }
  return undefined;
}

// A BARE club number — "soft 7 here", "hit a 9". Golfers routinely drop the word
// "iron", so requiring it loses real shots.
//
// Only single digits 1-9 qualify, and only when the number isn't part of a
// yardage. A stated distance is 2-3 digits ("180 out"), so a lone digit is
// unambiguous — that's why matchTargetYds requires >= 30 and this requires < 10.
// Run AFTER the explicit patterns so "7 wood" is never read as a 7-iron.
//
// The trailing \b in the lookahead is essential: the single-letter forms (i/w/h)
// would otherwise match the FIRST LETTER of the next word, so "soft 7 here" read
// the "h" of "here" as "hybrid" and rejected a perfectly good club.
const CLUB_SUFFIX = String.raw`(?:iron\b|i\b|wood\b|w\b|hybrid\b|h\b|putt)`;

function matchBareNumberClub(text: string): ClubId | undefined {
  // Reject if the digit is adjacent to a club-type word — those are handled by
  // the specific matchers and must not be caught here.
  const m = text.match(new RegExp(`\\b([1-9])\\b(?!\\s*[-]?\\s*${CLUB_SUFFIX})`));
  if (m) return `${m[1]}i` as ClubId;
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    const re = new RegExp(`\\b${word}\\b(?!\\s*[-]?\\s*${CLUB_SUFFIX})`);
    if (re.test(text)) return `${n}i` as ClubId;
  }
  return undefined;
}

// A digit/number-word + wood/hybrid → that club id.
function matchNumbered(text: string, suffix: 'wood' | 'hybrid', out: (n: number) => ClubId): ClubId | undefined {
  const shortMap = suffix === 'wood' ? 'w' : 'h';
  const m = text.match(new RegExp(`\\b([1-9])\\s*[-]?\\s*(?:${suffix}|${shortMap})\\b`));
  if (m) return out(Number(m[1]));
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    const re = new RegExp(`\\b${word}\\s*[-]?\\s*${suffix}\\b`);
    if (re.test(text)) return out(n);
  }
  return undefined;
}

export function parseShot(transcript: string): ParsedShot {
  // Normalize + drop the wake word and lead-in filler, so a conversational
  // "alright caddy, gonna hit a soft 7 here" parses the same as "soft 7 iron".
  const text = stripWakeWord(transcript);

  // --- shape tags ---
  const shape: ShapeTag[] = [];
  for (const phrase of SHAPE_PHRASES) {
    if (text.includes(` ${phrase} `)) {
      const tag = SHAPE_SYNONYMS[phrase];
      if (!shape.includes(tag)) shape.push(tag);
    }
  }

  // --- club ---
  let club: ClubId | undefined;
  // Numbered irons/woods/hybrids first (most specific).
  club = matchIron(text)
    ?? matchNumbered(text, 'wood', (n) => (n === 1 ? 'Dr' : (`${n}w` as ClubId)))
    ?? matchNumbered(text, 'hybrid', (n) => `${n}h` as ClubId);
  // Then named clubs / nicknames.
  if (!club) {
    for (const phrase of CLUB_PHRASES) {
      if (text.includes(` ${phrase} `)) {
        club = CLUB_SYNONYMS[phrase];
        break;
      }
    }
  }

  // --- target distance (approach) ---
  // A 2-3 digit yardage said at address, e.g. "160 to the pin", "90 yards",
  // "about 180 out". This is the AIMED distance only — it is never used as the
  // shot's distance, which is always measured GPS-to-GPS (see shot-distance.ts).
  // Single digits are club numbers, so require >= 30 to avoid eating "7 iron".
  const targetYds = matchTargetYds(text);

  // Bare club number ("soft 7") — last resort, once the explicit club patterns
  // and the yardage have been consumed, so it can't steal a digit from either.
  if (!club) {
    const bareText = targetYds != null
      ? text.replace(new RegExp(`\\b${targetYds}\\b`, 'g'), ' ')
      : text;
    club = matchBareNumberClub(bareText);
  }

  // --- kind ---
  let kind: ParsedShot['kind'] = 'full';
  if (club === 'Putter' || (/\bputt(s|ed|ing)?\b/.test(text) && !club)) {
    kind = 'putt';
    club = 'Putter';
  } else if (shape.some((s) => SHORT_GAME_SHAPES.includes(s))) {
    kind = 'chip';
  }

  const confidence: ParsedShot['confidence'] = kind === 'putt' || club ? 'high' : 'low';
  return { club, shape, kind, targetYds, confidence };
}

// Pull an approach yardage (30-350) from a transcript. Prefer a number next to
// a distance word ("160 yards", "to the pin"); otherwise take any lone 2-3
// digit number in range. Returns undefined if none — most short shots have no
// stated target.
function matchTargetYds(text: string): number | undefined {
  const inRange = (n: number) => (n >= 30 && n <= 350 ? n : undefined);
  // "160 yards" / "160 yard"
  const yd = text.match(/\b(\d{2,3})\s*(?:yards?|yd)\b/);
  if (yd) { const n = inRange(Number(yd[1])); if (n) return n; }
  // "160 to the pin/green/flag/hole"
  const toPin = text.match(/\b(\d{2,3})\s*(?:to (?:the )?)?(?:pin|green|flag|hole)\b/);
  if (toPin) { const n = inRange(Number(toPin[1])); if (n) return n; }
  // any lone 2-3 digit number
  const bare = text.match(/\b(\d{2,3})\b/);
  if (bare) return inRange(Number(bare[1]));
  return undefined;
}

// ---------------------------------------------------------------------------
// Voice COMMANDS — the hands-free layer. Logging a shot by voice still needs a
// way to say "commit it" and "move on", or you're back to tapping buttons with
// a glove on. Commands are matched BEFORE shot parsing so "next hole" can never
// be mistaken for a club.
//
// Deliberately requires an explicit verbal commit ("log it") rather than
// auto-committing every parse: in hands-free mode the mic hears your playing
// partners, the cart radio, and you talking to yourself. Auto-commit would
// invent phantom shots that are worse than no data, because they corrupt the
// per-club averages this whole feature exists to produce.
// ---------------------------------------------------------------------------

export type CommandType =
  | 'log'        // commit the current draft as a shot
  | 'nextHole'
  | 'prevHole'
  | 'undo'       // delete the last shot on this hole
  | 'setPutts'   // "two putts"
  | 'goToHole'   // "go to hole seven"
  | 'holeScore'  // "I made a five" / "that's a par" — closes out the hole
  | 'cancel';    // clear the draft

export interface ParsedCommand {
  type: CommandType;
  value?: number;        // putts, hole number, or gross score
  relativeToPar?: number; // for holeScore said as par/bogey/birdie
  proximityFeet?: number; // "made a 5 from 20 feet" — first-putt length
}

// The score you made on the hole, said once when you hole out. This is the
// hands-free alternative to counting putts aloud: strokes you announced are
// known, so putts = score - shots, and the announced score stays authoritative
// for the scorecard even if a shot went unlogged.
const SCORE_WORDS: Record<string, number> = {
  ...NUMBER_WORDS, ...TEEN_WORDS,
};

// Relative-to-par names — resolved against the hole's actual par by the caller.
const PAR_RELATIVE: Record<string, number> = {
  'double eagle': -3, albatross: -3,
  eagle: -2,
  birdie: -1, birdy: -1,
  par: 0,
  bogey: 1, bogie: 1, boegey: 1,
  'double bogey': 2, 'double bogie': 2, double: 2,
  'triple bogey': 3, 'triple bogie': 3, triple: 3,
  'quadruple bogey': 4, snowman: 4,
};

const PAR_PHRASES = Object.keys(PAR_RELATIVE).sort((a, b) => b.length - a.length);

// "I made a 5" / "took a six" / "that's a bogey" / "made 5 from 20 feet".
// Requires an explicit made/took/shot/shot-a verb or a par-relative word, so
// ordinary number talk ("I'm 5 over for the round") doesn't close out a hole.
function matchHoleScore(text: string): ParsedCommand | undefined {
  const prox = text.match(/\bfrom\s*(\d{1,3})\s*(?:feet|foot|ft)\b/);
  const proximityFeet = prox ? Number(prox[1]) : undefined;

  // Par-relative first — "made a bogey" is unambiguous.
  for (const phrase of PAR_PHRASES) {
    if (text.includes(` ${phrase} `)) {
      return { type: 'holeScore', relativeToPar: PAR_RELATIVE[phrase], proximityFeet };
    }
  }

  const VERB = String.raw`(?:made|make|took|take|shot|had|carded|scored|wrote down|put me down for)`;
  const digit = text.match(new RegExp(`\\b${VERB}\\s*(?:a|an|it)?\\s*(\\d{1,2})\\b`));
  if (digit) {
    const n = Number(digit[1]);
    if (n >= 1 && n <= 15) return { type: 'holeScore', value: n, proximityFeet };
  }
  for (const [word, n] of Object.entries(SCORE_WORDS)) {
    if (new RegExp(`\\b${VERB}\\s*(?:a|an|it)?\\s*${word}\\b`).test(text)) {
      return { type: 'holeScore', value: n, proximityFeet };
    }
  }
  return undefined;
}

// Matched in order — earlier entries win, so put the specific ones first.
//
// These are deliberately NARROW. An earlier, looser draft matched bare "clear"
// and "reset", which fired on ordinary course talk ("clear the trees with a 7
// iron" → cancel) — in hands-free mode the mic hears everything you say, so a
// command word has to be one you'd only use as a command. Same reason "last
// hole" is gone: "last hole was better" is commentary, not navigation.
const COMMAND_PATTERNS: { type: CommandType; re: RegExp }[] = [
  { type: 'undo',     re: /\b(undo|scratch that|delete (?:that|the )?last|remove (?:that|the )?last|never ?mind)\b/ },
  { type: 'cancel',   re: /\b(cancel that|start over|clear the draft|clear that)\b/ },
  { type: 'nextHole', re: /\b(next hole|done(?: with)? (?:this )?hole|hole done)\b/ },
  { type: 'prevHole', re: /\b(previous hole|back a hole|go back a hole)\b/ },
  { type: 'log',      re: /\b(log(?: it| that| the shot)?|save(?: it| that)?|confirm|commit it|got it|that's it|thats it)\b/ },
];

// "two putts" / "2 putts" / "one putt" — also "no putts" for a chip-in.
function matchPutts(text: string): number | undefined {
  if (/\b(no putts|zero putts|chip(?:ped)? in|holed out)\b/.test(text)) return 0;
  const digit = text.match(/\b(\d)\s*putts?\b/);
  if (digit) return Number(digit[1]);
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\s*putts?\\b`).test(text)) return n;
  }
  if (/\b(one|a|1)\s*putt\b/.test(text)) return 1;
  return undefined;
}

// "go to hole 12" / "jump to hole seven" — jump directly.
//
// An explicit go-to verb is REQUIRED. Matching a bare "hole seven" made ordinary
// speech navigate ("I'm on hole seven now" jumped holes), which is the most
// disruptive possible misfire mid-round: it silently moves where your next shots
// get logged. Requiring the verb costs one word and removes the whole class.
const GO_TO = String.raw`(?:go|jump|skip|switch|take me|move) (?:to|back to) (?:the )?hole`;

function matchGoToHole(text: string): number | undefined {
  const digit = text.match(new RegExp(`${GO_TO}\\s*(\\d{1,2})\\b`));
  if (digit) {
    const n = Number(digit[1]);
    if (n >= 1 && n <= 18) return n;
  }
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`${GO_TO}\\s*${word}\\b`).test(text)) return n;
  }
  // Teens spoken as words ("hole fifteen") — only with the go-to verb.
  const TEENS: Record<string, number> = {
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  };
  for (const [word, n] of Object.entries(TEENS)) {
    if (new RegExp(`${GO_TO}\\s*${word}\\b`).test(text)) return n;
  }
  return undefined;
}

// Pull a command out of a transcript, or undefined if it's not a command.
// Value-carrying commands are checked first; the score check precedes putts so
// "made a 5" isn't read as a putt count.
export function parseCommand(transcript: string): ParsedCommand | undefined {
  const text = stripWakeWord(transcript);

  const score = matchHoleScore(text);
  if (score) return score;

  const putts = matchPutts(text);
  if (putts !== undefined) return { type: 'setPutts', value: putts };

  const hole = matchGoToHole(text);
  if (hole !== undefined) return { type: 'goToHole', value: hole };

  for (const { type, re } of COMMAND_PATTERNS) {
    if (re.test(text)) return { type };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Outcome parsing — "I missed it left", "thinned it", "short right", "flushed
// it". Said either right after the shot or on the way to the next one, so it
// attaches to the LAST logged shot rather than the draft.
//
// Direction and strike are separate axes and both optional: "thinned it left"
// yields both, "flushed it" only a strike, "short" only a direction.
// ---------------------------------------------------------------------------

const OUTCOME_PHRASES = Object.keys(OUTCOME_SYNONYMS).sort((a, b) => b.length - a.length);
const DIRECTION_SET = new Set<string>(MISS_DIRECTIONS);
const STRIKE_SET = new Set<string>(STRIKE_QUALITIES);

export interface ParsedOutcome {
  direction?: MissDirection;
  strike?: StrikeQuality;
}

// True when the utterance reads as a report about a shot already hit, rather
// than an announcement of the next one. Requires either an explicit cue
// ("missed", "that was") or a strike word, which is inherently retrospective —
// you can't announce in advance that you're going to thin it.
export function looksLikeOutcome(transcript: string): boolean {
  const text = stripWakeWord(transcript);
  // A club name means it's an announcement of the NEXT shot, not a report.
  const hasClub = parseShot(transcript).club !== undefined;
  if (hasClub) return false;

  const o = parseOutcome(transcript);
  if (!o.direction && !o.strike) return false;

  // With no club in the utterance, a strike or direction word can only be a
  // report — you don't announce in advance that you'll thin it, and "short
  // right" names where a ball ended up. Requiring a cue here lost bare reports
  // like "caddy, short" and "caddy, long left", which are exactly how people
  // actually talk. The wake word already established the utterance was for us.
  const hasCue = OUTCOME_CUES.some((c) => text.includes(` ${c} `));
  return !!(o.strike || o.direction || hasCue);
}

export function parseOutcome(transcript: string): ParsedOutcome {
  const text = stripWakeWord(transcript);
  let direction: MissDirection | undefined;
  let strike: StrikeQuality | undefined;

  for (const phrase of OUTCOME_PHRASES) {
    if (!text.includes(` ${phrase} `)) continue;
    const tag: OutcomeTag = OUTCOME_SYNONYMS[phrase];
    // Longest-first ordering means a combined direction ("short left") is seen
    // before the bare words, so don't let a later bare word overwrite it.
    if (DIRECTION_SET.has(tag) && !direction) direction = tag as MissDirection;
    else if (STRIKE_SET.has(tag) && !strike) strike = tag as StrikeQuality;
  }
  return { direction, strike };
}

// Parse a spoken proximity-to-hole into exact feet, said when you walk up to a
// chip ("about 8 feet", "ten feet", "gimme"/"tap-in" → ~1 ft). Returns feet, or
// undefined if nothing distance-like was heard.
export function parseProximity(transcript: string): number | undefined {
  const text = ` ${transcript.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ')} `;
  if (/\b(gimme|gimmie|tap[\s-]?in|kick[\s-]?in|inches|conceded)\b/.test(text)) return 1;
  // digits: "8 feet", "about 12 ft", or a bare number
  const digit = text.match(/\b(\d{1,3})\s*(?:feet|foot|ft)?\b/);
  if (digit) {
    const n = Number(digit[1]);
    if (n >= 0 && n <= 300) return n;
  }
  // number words: "ten feet", "eight"
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return n;
  }
  return undefined;
}
