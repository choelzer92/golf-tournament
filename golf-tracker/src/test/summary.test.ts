// The applied-format summary line (F-021, §5.ax).
//
// Tested separately from the screen because it makes a CLAIM the user acts on. §5.ar is the standing
// reminder: a round-robin deal labelled "balanced by handicap" passed every structural test while
// being 8 strokes out. A summary that silently omits or misstates the stakes is the same class of
// bug — plausible, on screen, and wrong — and the whole point of F-021 is that the user reads THIS
// instead of the 15 fields, so it has to be right on its own.
//
// MUTATION-PROVED per DECISIONS.md §5.z:
//
//   | mutation                                          | cases failed |
//   |---------------------------------------------------|--------------|
//   | S1  drop a leg from the Nassau line               |  3           |
//   | S2  always print the allowance, even at 100%      |  5           |
//   | S3  print "$0" instead of returning null          |  2           |
//   | S4  silently drop an unknown format               |  1           |
//
// And it caught a real bug on the first run: skins reported "$1 a point", because the first draft
// defaulted `moneyModel` to 'per-point' for individual modes and skins never reached its own branch.
// A confident sentence about the wrong currency — the exact class of defect this file guards.

import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import {
  gameSummary, stakesSummary, handicapSummary, formatSummaryLine,
} from '@/lib/game-modes/summary';

const sides = getGameMode('team-2v2')!;
const skins = getGameMode('skins')!;
const wolf = getGameMode('wolf')!;

const FULL = { allowance: 100, strokeMethod: 'full' as const, handicapBasis: 'course' as const };
const OFF_LOW = { allowance: 100, strokeMethod: 'off-the-low' as const, handicapBasis: 'course' as const };

describe('gameSummary', () => {
  it('names a side game by its FORMAT, which is what changes the round', () => {
    // Best ball vs scramble are two completely different games; the registry name alone
    // ("Sides / Match") says neither.
    expect(gameSummary(sides, { format: 'best-ball' })).toBe('Sides · best ball');
    expect(gameSummary(sides, { format: 'scramble' })).toBe('Sides · scramble');
    expect(gameSummary(sides, { format: 'alternate-shot' })).toBe('Sides · alternate shot');
    expect(gameSummary(sides, { format: 'combined' })).toBe('Sides · combined');
  });

  it('calls out Stableford, because it changes what a hole score IS', () => {
    expect(gameSummary(sides, { format: 'best-ball', scoring: 'stableford' }))
      .toBe('Sides · best ball · Stableford');
    // Plain strokes is the default — saying so would be noise.
    expect(gameSummary(sides, { format: 'best-ball', scoring: 'stroke' })).toBe('Sides · best ball');
  });

  it('an individual game is just its name', () => {
    expect(gameSummary(skins, {})).toBe('Skins');
    expect(gameSummary(wolf, {})).toBe('Wolf');
  });

  it('no mode is the classic team pool', () => {
    expect(gameSummary(undefined, {})).toBe('Team pool');
  });

  it('falls back to the raw value for an unknown format rather than dropping it', () => {
    // A format saved by a newer client must not silently vanish from the summary.
    expect(gameSummary(sides, { format: 'six-six-six' })).toBe('Sides · six-six-six');
  });
});

describe('stakesSummary', () => {
  // THE SEGMENT THAT MATTERS MOST. If the summary is wrong about money, the user has replaced 15
  // correct fields with one incorrect sentence — strictly worse than the screen it replaced.
  it('states all three Nassau legs', () => {
    expect(stakesSummary(sides, { moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 20 }, 0))
      .toBe('$10 / $10 / $20 front·back·overall');
    // Uneven legs must show as they are, not be averaged or abbreviated.
    expect(stakesSummary(sides, { moneyModel: 'legs', legFront: 20, legBack: 5, legOverall: 50 }, 0))
      .toBe('$20 / $5 / $50 front·back·overall');
  });

  it('unset leg fields fall back to the ENGINE defaults ($10/$10/$10), not a guessed shape', () => {
    // The first version defaulted legOverall to 20 — Nassau habit — while the engine's
    // defaultValue (team-game.ts SETTINGS) pays 10. A format that never touched the field
    // showed "$20 overall" on the panel and settled $10 at the end of the round: a summary
    // claiming money the engine won't pay, the exact failure this file exists to prevent.
    expect(stakesSummary(sides, { moneyModel: 'legs' }, 0))
      .toBe('$10 / $10 / $10 front·back·overall');
  });

  it('reads string settings as numbers (the wizard stores them as text)', () => {
    expect(stakesSummary(sides, { moneyModel: 'legs', legFront: '10', legBack: '10', legOverall: '20' }, 0))
      .toBe('$10 / $10 / $20 front·back·overall');
  });

  it('covers every money model a side game can use', () => {
    expect(stakesSummary(sides, { moneyModel: 'per-hole', dollarsPerHole: 5 }, 0)).toBe('$5 a hole');
    expect(stakesSummary(sides, { moneyModel: 'per-point', dollarsPerPoint: 2 }, 0)).toBe('$2 a point');
    expect(stakesSummary(sides, { moneyModel: 'pot', sideBuyIn: 20 }, 0)).toBe('$20 buy-in pot');
  });

  it('reads an individual mode’s own money key', () => {
    // `skinValue` is the key skins.ts actually declares — the wizard's default settings bag.
    // (The first draft read only `dollarsPerSkin`, a key no mode sets, so a REAL skins game
    // showed no stakes on the review step; F-026's e2e caught it. Both keys accepted now.)
    expect(stakesSummary(skins, { skinValue: 5, moneyModel: 'per-skin' }, 0)).toBe('$5 a skin');
    expect(stakesSummary(skins, { dollarsPerSkin: 5 }, 0)).toBe('$5 a skin');
    // Under the Nassau pot the skin value is hidden and unpaid — no skin price in the summary.
    expect(stakesSummary(skins, { skinValue: 5, moneyModel: 'nassau' }, 0)).toBe('Nassau pot');
    expect(stakesSummary(wolf, { dollarsPerPoint: 1 }, 0)).toBe('$1 a point');
  });

  it('a classic pool antes per player', () => {
    expect(stakesSummary(undefined, {}, 25)).toBe('$25/player pot');
  });

  // Returning null (not "$0") is what lets the caller DROP the segment, so a game with no money
  // doesn't advertise a stake of nothing.
  it('is null when there is no money to state', () => {
    expect(stakesSummary(sides, { moneyModel: 'legs', legFront: 0, legBack: 0, legOverall: 0 }, 0)).toBeNull();
    expect(stakesSummary(sides, { moneyModel: 'per-hole', dollarsPerHole: 0 }, 0)).toBeNull();
    expect(stakesSummary(undefined, {}, 0)).toBeNull();
    expect(stakesSummary(skins, {}, 0)).toBeNull();
  });
});

describe('handicapSummary', () => {
  it('uses the phrase the wizard itself uses', () => {
    expect(handicapSummary(OFF_LOW)).toBe('off the low');
    expect(handicapSummary(FULL)).toBe('full handicap');
  });

  it('states the allowance only when it is NOT 100%', () => {
    // A summary that repeats every default is a summary nobody reads.
    expect(handicapSummary({ ...OFF_LOW, allowance: 90 })).toBe('off the low · 90%');
    expect(handicapSummary({ ...OFF_LOW, allowance: 100 })).toBe('off the low');
  });

  it('states the index basis only when it is the non-default', () => {
    expect(handicapSummary({ ...FULL, handicapBasis: 'index' })).toBe('full handicap · index basis');
    expect(handicapSummary({ ...FULL, handicapBasis: 'course' })).toBe('full handicap');
  });

  it('combines both non-defaults', () => {
    expect(handicapSummary({ allowance: 85, strokeMethod: 'off-the-low', handicapBasis: 'index' }))
      .toBe('off the low · 85% · index basis');
  });
});

describe('formatSummaryLine', () => {
  // The Weekend Warriors case, end to end — this is the exact string that replaces 15 fields.
  it('reads like the Saturday Nassau fixture', () => {
    expect(formatSummaryLine(
      sides,
      { format: 'best-ball', scoring: 'stroke', result: 'total', moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 20 },
      0,
      OFF_LOW,
    )).toBe('Sides · best ball · $10 / $10 / $20 front·back·overall · off the low');
  });

  it('drops an empty segment instead of leaving a gap', () => {
    const line = formatSummaryLine(sides, { moneyModel: 'legs', legFront: 0, legBack: 0, legOverall: 0 }, 0, FULL);
    expect(line).toBe('Sides · best ball · full handicap');
    expect(line).not.toContain('· ·');
  });

  it('never renders undefined, NaN or $0 for any registered mode on empty settings', () => {
    // Defensive: a format saved by an older client may carry a partial settings bag, and the whole
    // point of this line is that the user trusts it instead of reading the fields.
    for (const m of [undefined, ...[sides, skins, wolf]]) {
      const line = formatSummaryLine(m, {}, 0, FULL);
      expect(line).not.toMatch(/undefined|NaN|\$0\b/);
      expect(line.length).toBeGreaterThan(0);
    }
  });
});
