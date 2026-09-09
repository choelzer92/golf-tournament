// `fitForMode` and friends — F-020's rule for "does this game fit this field?"
//
// Tested here rather than through the DOM because it IS the rule: the picker, the review step and
// anything else that wants to say "needs 1 more" must all agree, and §5.ar is the reminder that a
// claim in a label deserves an assertion of its own.
//
// The range is measured against the WHOLE FIELD (Craig, 2026-08-26) — see fit.ts for why.

import { describe, expect, it } from 'vitest';
import { GAME_MODES, getGameMode } from '@/lib/game-modes';
import { fitForMode, modeFits, playerRangeSentence, fitBadge, fitExplanation } from '@/lib/game-modes/fit';

const wolf = getGameMode('wolf')!;          // exactly 4
const skins = getGameMode('skins')!;        // 2–4
const sides = getGameMode('team-2v2')!;     // 2–8 (2 = a singles match)
const nines = getGameMode('nines')!;        // 3–4

describe('fitForMode', () => {
  it('an empty field is UNKNOWN, not a failure', () => {
    // The picker comes BEFORE the field in the wizard, so on a first pass there is nothing to
    // judge. Marking every game with a red cross before anyone has been added would be noise at
    // exactly the wrong moment — and it's the bug this case exists to prevent.
    expect(fitForMode(wolf, 0)).toEqual({ kind: 'unknown' });
    expect(fitForMode(sides, 0)).toEqual({ kind: 'unknown' });
    // Negative is nonsense input, and must behave like "no field" rather than throwing.
    expect(fitForMode(wolf, -2)).toEqual({ kind: 'unknown' });
  });

  it('the classic pool (no descriptor) always fits — it scales to any field', () => {
    expect(fitForMode(undefined, 5)).toEqual({ kind: 'fits' });
    expect(fitForMode(undefined, 61)).toEqual({ kind: 'fits' });
    expect(fitForMode(undefined, 0)).toEqual({ kind: 'fits' });
  });

  it('names the GAP, not just the failure', () => {
    // "needs 1 more" is actionable; "too few" isn't.
    expect(fitForMode(wolf, 3)).toEqual({ kind: 'too-few', need: 1 });
    // Sides now starts at TWO (a singles match, 2026-08-27), so one player is the too-few case.
    expect(fitForMode(sides, 1)).toEqual({ kind: 'too-few', need: 1 });
    expect(fitForMode(wolf, 5)).toEqual({ kind: 'too-many', over: 1 });
    expect(fitForMode(skins, 8)).toEqual({ kind: 'too-many', over: 4 });
  });

  it('both ends of every mode range are INCLUSIVE', () => {
    // Off-by-one at a boundary would refuse a legal game, which is the failure mode F-020 is
    // about — so assert the boundary for every registered mode rather than a sample.
    for (const m of GAME_MODES) {
      expect(fitForMode(m, m.playersMin).kind).toBe('fits');
      expect(fitForMode(m, m.playersMax).kind).toBe('fits');
      expect(fitForMode(m, m.playersMin - 1).kind).not.toBe('fits');
      expect(fitForMode(m, m.playersMax + 1).kind).not.toBe('fits');
    }
  });

  // THE CASE THE DECISION IS ABOUT. Eight players who tee off as two foursomes are still eight
  // players, so Wolf (4 only) does NOT fit them even though each group would be a legal foursome.
  // If this ever flips, §5.ao/the fit.ts note is what needs revisiting first.
  it('measures the WHOLE FIELD, not the biggest playing group', () => {
    expect(fitForMode(wolf, 8).kind).toBe('too-many');
    expect(fitForMode(nines, 8).kind).toBe('too-many');
    // And a side game's 2–8 is 2–8 in the game, so eight fits however they walk.
    expect(fitForMode(sides, 8).kind).toBe('fits');
    expect(fitForMode(sides, 9).kind).toBe('too-many');
  });

  it('modeFits agrees with fitForMode', () => {
    for (const m of GAME_MODES) {
      for (let n = 0; n <= 12; n++) {
        expect(modeFits(m, n)).toBe(fitForMode(m, n).kind === 'fits');
      }
    }
  });
});

describe('playerRangeSentence', () => {
  // The string F-019 falsified said "Played within a single group of 4–8". A side game can now be
  // eight players across two tee times, so nothing here may claim how the field walks.
  it('never claims the field plays as one group', () => {
    for (const m of GAME_MODES) {
      const s = playerRangeSentence(m);
      expect(s).not.toMatch(/single group/i);
      expect(s).not.toMatch(/foursome/i);
    }
  });

  it('reads naturally for an exact requirement', () => {
    // "4–4" is how a machine says it.
    expect(playerRangeSentence(wolf)).toBe('Exactly 4 players.');
    expect(playerRangeSentence(sides)).toBe('For 2–8 players.');
    expect(playerRangeSentence(skins)).toBe('For 2–4 players.');
  });
});

describe('fitBadge', () => {
  it('says nothing when there is no field', () => {
    expect(fitBadge(wolf, 0)).toBeNull();
  });

  it('confirms a fit, and names the gap for a RANGE', () => {
    expect(fitBadge(sides, 6)).toBe('✓ 6 players');
    expect(fitBadge(sides, 1)).toBe('needs 1 more');
    expect(fitBadge(sides, 10)).toBe('2 too many');
    // A 1v1 FITS: the range starts at two so a singles match is offered, not refused.
    expect(fitBadge(sides, 2)).toBe('✓ 2 players');
  });

  // CAUGHT BY A SCREENSHOT. The first draft rendered "Wolf — 1 too many" at five players, which
  // reads as though dropping one is the fix — but Wolf needs exactly four, so from three the fix
  // is adding one and from five it's removing one, and "1 too many" only happens to be right in
  // one direction. A fixed requirement should state the requirement.
  it('a FIXED requirement states the number, not the delta', () => {
    expect(fitBadge(wolf, 3)).toBe('needs exactly 4');
    expect(fitBadge(wolf, 5)).toBe('needs exactly 4');
    expect(fitBadge(wolf, 8)).toBe('needs exactly 4');
    expect(fitBadge(wolf, 4)).toBe('✓ 4 players');
  });
});

describe('fitExplanation', () => {
  it('is null when the game is playable, or when there is no field yet', () => {
    expect(fitExplanation(sides, 6)).toBeNull();
    expect(fitExplanation(wolf, 4)).toBeNull();
    expect(fitExplanation(wolf, 0)).toBeNull();
    expect(fitExplanation(undefined, 5)).toBeNull();
  });

  it('states the requirement and the actual count', () => {
    expect(fitExplanation(wolf, 5)).toBe('Wolf needs exactly 4 players — you have 5.');
    expect(fitExplanation(skins, 5)).toContain('2–4 players');
    expect(fitExplanation(skins, 5)).toContain('you have 5');
  });

  // The old copy ended "Go back to Field to adjust." F-020's whole point is that the constraint
  // is stated where the choice is made, so by the review step there is nowhere to go back to.
  it('does not send the organizer back a step', () => {
    for (const m of GAME_MODES) {
      const msg = fitExplanation(m, m.playersMax + 3);
      expect(msg).not.toMatch(/go back/i);
    }
  });
});
