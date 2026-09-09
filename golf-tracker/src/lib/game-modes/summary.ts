// WHAT DID I JUST CHOOSE? — the one-line summary of an applied game format (F-021, §5.ax).
//
// A saved format answers ~15 questions in one tap, and step 1 used to re-ask every one of them: 21
// controls, 15 labels, 1900px of scroll, every value already correct. §5.e asked for the opposite
// back in August — "a saved setup turns questions into CONFIRMATIONS (summary line + [Change])" —
// and this is the string that makes that possible.
//
// WHAT GOES IN, and why it's a short list (§5.ax part 2). Only the things that move MONEY: the game,
// its format, the stakes, and the handicap rule. Not tee difficulty, not bonus values. Too little
// and the summary is untrustworthy ("did it really set off-the-low?"); too much and it's the form
// again with worse layout.
//
// Pure and separately tested rather than assembled inline in JSX, because it makes a CLAIM the user
// will act on — §5.ar is the reminder that a round-robin deal labelled "balanced" passed every
// structural test while being 8 strokes out. A summary that omits or misstates the stakes is the
// same class of bug: plausible, on screen, and wrong.

import type { GameModeDescriptor, SettingsBag } from './types';

/** How strokes are handed out, in the words the wizard uses. */
export interface HandicapSummaryInput {
  /** Percentage of handicap in play (100 = full). */
  allowance: number;
  /** 'off-the-low' means the best player plays to scratch and everyone else the difference. */
  strokeMethod: 'full' | 'off-the-low';
  /** Course handicap (slope-adjusted) vs raw index — how many strokes change hands. */
  handicapBasis: 'course' | 'index';
}

const num = (settings: SettingsBag, key: string, fallback: number): number => {
  const v = settings[key];
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isNaN(n) ? fallback : n;
};

const str = (settings: SettingsBag, key: string, fallback: string): string => {
  const v = settings[key];
  return v === undefined || v === null || v === '' ? fallback : String(v);
};

/**
 * The GAME half: what's being played, in plain words.
 *
 * e.g. "Sides · best ball", "Skins", "Wolf". A side game's format is included because best-ball vs
 * scramble is the difference between two completely different rounds; an individual game has no
 * equivalent knob worth a word here.
 */
export function gameSummary(mode: GameModeDescriptor | undefined, settings: SettingsBag): string {
  if (!mode) return 'Team pool';
  if (mode.category !== 'team-within-group') return mode.name;

  // Strip the "/ Match" half of the mode name here — the format and the money line say more about
  // what the round IS than the registry label does.
  const base = 'Sides';
  const fmt = str(settings, 'format', 'best-ball');
  const label: Record<string, string> = {
    'best-ball': 'best ball',
    combined: 'combined',
    scramble: 'scramble',
    'alternate-shot': 'alternate shot',
  };
  const scoring = str(settings, 'scoring', 'stroke');
  const parts = [base, label[fmt] ?? fmt];
  // Stableford changes what a hole score even IS, so it earns a word. Plain strokes is the default
  // and saying so would be noise.
  if (scoring === 'stableford') parts.push('Stableford');
  return parts.join(' · ');
}

/**
 * The MONEY half: the stakes, as a golfer would say them.
 *
 * Returns null when there is nothing to say (no money configured), so the caller omits the segment
 * rather than printing "$0".
 */
export function stakesSummary(mode: GameModeDescriptor | undefined, settings: SettingsBag, entryPerPlayer: number): string | null {
  // A classic pool antes per player; there is no mode settings bag to read.
  if (!mode) return entryPerPlayer > 0 ? `$${entryPerPlayer}/player pot` : null;

  // Read the mode's OWN money key first, and only fall back to a `moneyModel` switch.
  //
  // The first draft defaulted `moneyModel` to 'per-point' for an individual mode, which meant skins
  // fell into the per-point branch and reported "$1 a point" for a game settled in skins — a
  // plausible sentence about the wrong currency, which is exactly the failure this file exists to
  // prevent. Only trust a money model the settings actually name.
  const skin = num(settings, 'dollarsPerSkin', 0);
  if (skin > 0) return `$${skin} a skin`;

  const model = settings.moneyModel === undefined || settings.moneyModel === ''
    ? (mode.category === 'team-within-group' ? 'legs' : '')
    : String(settings.moneyModel);
  switch (model) {
    case 'legs': {
      // Fallbacks MUST match the mode's defaultValue for each key (team-game.ts SETTINGS),
      // or a format that leaves a field unset gets a summary claiming a stake the engine
      // won't pay. legOverall's default is 10, not the 10/10/20 shape Nassau habit suggests.
      const f = num(settings, 'legFront', 10);
      const b = num(settings, 'legBack', 10);
      const o = num(settings, 'legOverall', 10);
      if (f === 0 && b === 0 && o === 0) return null;
      return `$${f} / $${b} / $${o} front·back·overall`;
    }
    case 'per-hole': {
      const d = num(settings, 'dollarsPerHole', 2);
      return d > 0 ? `$${d} a hole` : null;
    }
    case 'per-point': {
      const d = num(settings, 'dollarsPerPoint', 1);
      return d > 0 ? `$${d} a point` : null;
    }
    case 'pot': {
      const buyIn = num(settings, 'sideBuyIn', entryPerPlayer);
      return buyIn > 0 ? `$${buyIn} buy-in pot` : null;
    }
    case 'nassau': {
      return 'Nassau pot';
    }
    default: {
      // An individual mode with no named money model: report a per-point stake only if one is
      // actually set, never a default. Silence is better than a confident wrong number.
      const point = num(settings, 'dollarsPerPoint', 0);
      return point > 0 ? `$${point} a point` : null;
    }
  }
}

/**
 * The HANDICAP half: who gets strokes, and how many change hands.
 *
 * "off the low" is the phrase the wizard itself uses for the best player playing to scratch. The
 * index basis is called out only when it's the NON-default, because a summary that states every
 * default is a summary nobody reads.
 */
export function handicapSummary(h: HandicapSummaryInput): string {
  const parts: string[] = [];
  parts.push(h.strokeMethod === 'off-the-low' ? 'off the low' : 'full handicap');
  if (h.allowance !== 100) parts.push(`${h.allowance}%`);
  if (h.handicapBasis === 'index') parts.push('index basis');
  return parts.join(' · ');
}

/**
 * The whole thing, as one line: game · stakes · handicaps.
 *
 * Segments that have nothing to say are dropped, so a game with no money configured reads
 * "Sides · best ball · off the low" rather than carrying an empty gap.
 */
export function formatSummaryLine(
  mode: GameModeDescriptor | undefined,
  settings: SettingsBag,
  entryPerPlayer: number,
  handicaps: HandicapSummaryInput,
): string {
  return [
    gameSummary(mode, settings),
    stakesSummary(mode, settings, entryPerPlayer),
    handicapSummary(handicaps),
  ].filter(Boolean).join(' · ');
}
