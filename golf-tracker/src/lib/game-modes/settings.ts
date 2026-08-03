import type { FormatSetting } from '../formats';
import type { SettingsBag, SettingValue } from './types';

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
