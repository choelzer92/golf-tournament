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
// SETTINGS after their existing money settings, then call maybeSettleNassau.
// The Nassau ante/split only take effect when a game's money model selects it
// (games expose that via their own 'moneyModel'/'moneyModel'-style select), so
// these three are inert unless the game routes to settleNassau.
export const NASSAU_SETTINGS: FormatSetting[] = [
  {
    key: 'nassauAnte', label: 'Nassau ante ($ / player)', type: 'number', defaultValue: 10,
    hint: 'Used when money = Nassau pot. Everyone antes this; the pool is split by segment.',
  },
  {
    key: 'nassauSplit', label: 'Nassau split', type: 'select',
    options: [
      { value: 'three', label: 'Front / Back / Total (3-way)' },
      { value: 'total', label: 'Total only' },
    ],
    defaultValue: 'three',
    hint: 'Split the ante pool into three equal pots (front 9 / back 9 / total) or a single total pot.',
  },
];

// Settle a game via the Nassau pot when its money model selected it. Returns the
// segment leg lines (for IndividualResult.nassauLegs) and mutates moneyNet; pass
// the game's own SETTINGS + bag so the ante/split read through the same defaults.
// `higherIsBetter` false for lower-is-better games (Low Total).
export function settleNassauFromSettings(
  schema: FormatSetting[],
  bag: SettingsBag,
  standings: PlayerStanding[],
  higherIsBetter = true,
): NassauLegLine[] {
  const ante = numberSetting(schema, bag, 'nassauAnte');
  const split = stringSetting(schema, bag, 'nassauSplit') === 'total' ? 'total' : 'three';
  return settleNassau(standings, ante, split, higherIsBetter);
}
