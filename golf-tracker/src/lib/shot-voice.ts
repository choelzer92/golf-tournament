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

import type { ClubId, ShapeTag } from './clubs';
import { CLUB_SYNONYMS, SHAPE_SYNONYMS, SHORT_GAME_SHAPES } from './clubs';

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
  const text = ` ${transcript.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ')} `;

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
  // A 2-3 digit yardage said at address, e.g. "160 to the pin", "90 yards".
  // Single digits are club numbers, so require >= 30 to avoid eating "7 iron".
  const targetYds = matchTargetYds(text);

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
