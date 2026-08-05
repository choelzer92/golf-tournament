import type { FormatSetting } from '../formats';
import type { SettingsBag, SettingValue, PlayerStanding, NassauLegLine } from './types';
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
