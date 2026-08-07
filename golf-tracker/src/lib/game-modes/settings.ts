import type { FormatSetting } from '../formats';
import type { SettingsBag, SettingValue, PlayerStanding, NassauLegLine, GameModeContext, JunkLine } from './types';
import { settleNassau } from './types';

// Read a setting value with the descriptor's default as fallback. Centralizes
// the "stored value or norm default" logic every mode + the editor needs.
export function settingValue(schema: FormatSetting[], bag: SettingsBag, key: string): SettingValue {
  if (key in bag && bag[key] !== undefined && bag[key] !== '') return bag[key];
  const def = schema.find((s) => s.key === key);
  return def ? def.defaultValue : '';
}

export function numberSetting(schema: FormatSetting[], bag: SettingsBag, key: string): number {
  const v = settingValue(schema, bag, key);
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

export function boolSetting(schema: FormatSetting[], bag: SettingsBag, key: string): boolean {
  const v = settingValue(schema, bag, key);
  return v === true || v === 'true';
}

export function stringSetting(schema: FormatSetting[], bag: SettingsBag, key: string): string {
  return String(settingValue(schema, bag, key));
}

// Parse a comma/space-separated point vector like "5,3,1" or "5 3 1" into
// numbers, dropping blanks/NaN. Empty input returns [].
export function parseVector(raw: string): number[] {
  return raw
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map((x) => parseFloat(x))
    .filter((n) => !isNaN(n));
}

// Full defaults bag for a descriptor's settings — used when creating a game so
// modeSettings starts populated with the norm values (editable thereafter).
export function defaultSettings(schema: FormatSetting[]): SettingsBag {
  const bag: SettingsBag = {};
  for (const s of schema) bag[s.key] = s.defaultValue;
  return bag;
}

// --- Shared Nassau-pot money settings ---------------------------------------
// Reused across every individual game so "buy-in, split front/back/total" is
// configured identically everywhere. Games spread NASSAU_SETTINGS into their
// SETTINGS after their existing money settings. Inert unless the game's money
// model routes to settleNassau. Amounts are PER PLAYER and independent per
// segment (e.g. 5 / 5 / 20 to make the Total the big prize); everyone antes the
// sum of the segments in play. Total-only ignores the front/back amounts.
// Every Nassau field is gated on moneyModel = 'nassau', so games that offer the
// Nassau option only surface these once it's chosen. Front/Back additionally
// require the 3-way split. `moneyModel` is the shared key each game uses for its
// money select — games that expose Nassau MUST use that key for consistency.
export const NASSAU_SETTINGS: FormatSetting[] = [
  {
    key: 'nassauSplit', label: 'Nassau split', type: 'select',
    options: [
      { value: 'three', label: 'Front / Back / Total (3-way)' },
      { value: 'total', label: 'Total only' },
    ],
    defaultValue: 'three',
    hint: 'Contest three segments (front 9 / back 9 / total) or a single total pot.',
    showIf: { key: 'moneyModel', in: ['nassau'] },
  },
  {
    key: 'nassauFront', label: 'Front 9 ($ / player)', type: 'number', defaultValue: 10,
    hint: '3-way only. Everyone antes this for the front-9 pot; low/high leader takes it.',
    showIf: [{ key: 'moneyModel', in: ['nassau'] }, { key: 'nassauSplit', in: ['three'] }],
  },
  {
    key: 'nassauBack', label: 'Back 9 ($ / player)', type: 'number', defaultValue: 10,
    hint: '3-way only. Ante for the back-9 pot.',
    showIf: [{ key: 'moneyModel', in: ['nassau'] }, { key: 'nassauSplit', in: ['three'] }],
  },
  {
    key: 'nassauTotal', label: 'Total ($ / player)', type: 'number', defaultValue: 10,
    hint: 'Ante for the 18-hole total pot. Used in both split modes.',
    showIf: { key: 'moneyModel', in: ['nassau'] },
  },
];

// Settle a game via the Nassau pot when its money model selected it. Returns the
// segment leg lines (for IndividualResult.nassauLegs) and mutates moneyNet; pass
// the game's own SETTINGS + bag so the amounts read through the same defaults.
// `higherIsBetter` false for lower-is-better games (Low Total). Total-only zeros
// the front/back amounts so only the total pot is contested.
export function settleNassauFromSettings(
  schema: FormatSetting[],
  bag: SettingsBag,
  standings: PlayerStanding[],
  higherIsBetter = true,
): NassauLegLine[] {
  const totalOnly = stringSetting(schema, bag, 'nassauSplit') === 'total';
  const amounts = {
    front: totalOnly ? 0 : numberSetting(schema, bag, 'nassauFront'),
    back: totalOnly ? 0 : numberSetting(schema, bag, 'nassauBack'),
    total: numberSetting(schema, bag, 'nassauTotal'),
  };
  return settleNassau(standings, amounts, higherIsBetter);
}

// --- Shared junk / bonus money -----------------------------------------------
// Birdies, eagles, albatrosses (and CTP, entered on the hub) paid as a flat
// dollar BONUS on top of whatever the game's own money model settles. The
// classic pool has always had junk, but it was team-scoped and lived entirely in
// pool-game.ts, so none of the game modes could offer it.
//
// Deliberately dollars-per-item here, not the classic points-then-value: a mode
// game settles in dollars directly (no pot to divide), so an intermediate point
// scale would be a unit nobody needs. Group hug is omitted — it's a TEAM idea
// (every player in the foursome at par or better) that doesn't map to an
// individual settlement.
//
// Zero-sum, like every other mode money model: each earner collects their bonus
// from the rest of the group, so the table always sums to zero. Set every value
// to 0 (the default) and the whole layer is inert — existing games are unchanged.
export const JUNK_SETTINGS: FormatSetting[] = [
  {
    key: 'junkEnabled', label: 'Birdie / eagle bonuses', type: 'toggle', defaultValue: false,
    hint: 'Pay a flat bonus for birdies and better, on top of the game money. Each earner collects from the rest of the group.',
  },
  {
    key: 'junkBirdie', label: 'Birdie ($)', type: 'number', defaultValue: 1,
    hint: 'Per birdie (1 under par), paid by each other player.',
    showIf: { key: 'junkEnabled', in: ['true'] },
  },
  {
    key: 'junkEagle', label: 'Eagle ($)', type: 'number', defaultValue: 2,
    hint: 'Per eagle (2 under). Replaces the birdie bonus on that hole, not added to it.',
    showIf: { key: 'junkEnabled', in: ['true'] },
  },
  {
    key: 'junkAlbatross', label: 'Albatross ($)', type: 'number', defaultValue: 5,
    hint: 'Per double eagle (3+ under).',
    showIf: { key: 'junkEnabled', in: ['true'] },
  },
  {
    key: 'junkBasis', label: 'Bonuses count', type: 'select',
    options: [{ value: 'gross', label: 'Gross score' }, { value: 'net', label: 'Net score' }],
    defaultValue: 'gross',
    hint: 'Gross is the normal way — a birdie is a real birdie. Net counts handicap strokes, so more bonuses get paid.',
    showIf: { key: 'junkEnabled', in: ['true'] },
  },
];

// Count birdies/eagles/albatrosses per player and settle them zero-sum onto
// `standings.moneyNet`. Returns the per-player breakdown, or null when the layer
// is off or every amount is zero (so callers can skip the UI entirely).
//
// Settlement: an earner collects their bonus from EACH other player, so a birdie
// worth $1 in a foursome pays the earner $3 and costs the other three $1 each.
// That keeps it zero-sum and matches how these are actually settled on the card.
export function settleJunkFromSettings(
  schema: FormatSetting[],
  bag: SettingsBag,
  ctx: GameModeContext,
  standings: PlayerStanding[],
): JunkLine[] | null {
  const lines = tallyJunk(schema, bag, ctx);
  if (!lines) return null;

  // Zero-sum: each earner collects from every other player.
  const byId = new Map(lines.map((l) => [l.playerId, l]));
  const n = lines.length;
  if (n > 1) {
    const totalPaidOut = lines.reduce((s, l) => s + l.dollars, 0);
    for (const st of standings) {
      const mine = byId.get(st.playerId)?.dollars ?? 0;
      // Collect `mine` from each of the (n-1) others, and pay each other
      // player's bonus once: mine*(n-1) - (everyone else's total).
      st.moneyNet += mine * (n - 1) - (totalPaidOut - mine);
    }
  }
  return lines;
}

// 2v2 variant: junk is earned by INDIVIDUALS but settled between the two SIDES,
// because a 2v2 game's money is a head-to-head between sides, not a free-for-all
// among four players. Side A's total bonus minus side B's is what changes hands,
// paid per player. Returns the same per-player breakdown for the leaderboard.
//
// Mirrors how the classic pool settles junk in match mode (a differential
// between the two teams), so the two paths agree conceptually.
export function settleJunkForSides(
  schema: FormatSetting[],
  bag: SettingsBag,
  ctx: GameModeContext,
  standings: PlayerStanding[],
  sides: { a: string[]; b: string[] },
): JunkLine[] | null {
  const lines = tallyJunk(schema, bag, ctx);
  if (!lines) return null;
  const sum = (ids: string[]) =>
    ids.reduce((s, id) => s + (lines.find((l) => l.playerId === id)?.dollars ?? 0), 0);
  const diff = sum(sides.a) - sum(sides.b);
  if (diff !== 0) {
    // standings for a 2v2 game are the two SIDES (playerId 'A' / 'B').
    const a = standings.find((s) => s.playerId === 'A');
    const b = standings.find((s) => s.playerId === 'B');
    if (a) a.moneyNet += diff;
    if (b) b.moneyNet -= diff;
  }
  return lines;
}

// Count each player's birdies/eagles/albatrosses and their gross bonus dollars,
// WITHOUT settling. Shared by the individual and 2v2 settlements above; null when
// the layer is off or every amount is zero.
export function tallyJunk(
  schema: FormatSetting[],
  bag: SettingsBag,
  ctx: GameModeContext,
): JunkLine[] | null {
  if (!boolSetting(schema, bag, 'junkEnabled')) return null;
  const amt = {
    birdie: numberSetting(schema, bag, 'junkBirdie'),
    eagle: numberSetting(schema, bag, 'junkEagle'),
    albatross: numberSetting(schema, bag, 'junkAlbatross'),
  };
  if (amt.birdie === 0 && amt.eagle === 0 && amt.albatross === 0) return null;
  const useNet = stringSetting(schema, bag, 'junkBasis') === 'net';

  return ctx.players.map((p) => {
    let birdies = 0, eagles = 0, albatrosses = 0;
    for (const hole of ctx.holes) {
      const score = useNet ? ctx.netOnHole(p.id, hole) : ctx.grossOnHole(p.id, hole);
      if (score === null) continue;
      const diff = score - hole.par;
      if (diff <= -3) albatrosses++;
      else if (diff === -2) eagles++;
      else if (diff === -1) birdies++;
    }
    return {
      playerId: p.id, playerName: p.name, birdies, eagles, albatrosses,
      dollars: birdies * amt.birdie + eagles * amt.eagle + albatrosses * amt.albatross,
    };
  });
}
