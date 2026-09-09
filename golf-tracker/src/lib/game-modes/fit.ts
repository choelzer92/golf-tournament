// DOES THIS GAME FIT THIS FIELD? — F-020, DECISIONS.md §5.ao.
//
// Every mode declares `playersMin`/`playersMax`. The app used those numbers ONLY to refuse, and
// only at the review step, five steps after the game was picked: "Wolf is played in a single group
// of 4–4 players — you have 5. Go back to Field." It held the constraint and spent it on a
// rejection. §5.ao: when the app knows a rule the user doesn't, the default use of it is guidance.
//
// WHAT THE RANGE IS MEASURED AGAINST (Craig, 2026-08-26). F-019 made "per group" ambiguous: a side
// game can now tee off in two groups, so "4–8" could mean 4–8 in the game or 4–8 per tee slot.
// **The whole field.** Wolf's "4 only" means four players in the game, however they walk. This is
// the simpler thing to say, and it's the only reading available at the moment of choosing, since
// the game is picked before the tee sheet exists.
//
// Lives in game-modes rather than next to groupShapesFor in pool-game.ts because it reads a
// GameModeDescriptor, and pool-game imports game-modes (not the other way round).
//
// Pure — no React, no I/O — so the rule is unit-tested once instead of asserted through the DOM.

import type { GameModeDescriptor } from './types';

/** How a mode relates to a field of a given size. */
export type FitVerdict =
  /** No field yet — say nothing. The picker comes BEFORE the field on a first pass. */
  | { kind: 'unknown' }
  | { kind: 'fits' }
  /** Too few players. `need` is how many more would make it playable. */
  | { kind: 'too-few'; need: number }
  /** Too many. `over` is how many would have to sit out. */
  | { kind: 'too-many'; over: number };

/**
 * Whether `mode` can be played by `playerCount`.
 *
 * `playerCount` of 0 is 'unknown', not 'too-few': an empty field means the organizer hasn't got
 * there yet, and annotating every game with a red cross before they've added anyone would be
 * noise at exactly the wrong moment. A mode with no descriptor (the classic pool) always fits —
 * it scales to any number of foursomes.
 */
export function fitForMode(mode: GameModeDescriptor | undefined, playerCount: number): FitVerdict {
  if (!mode) return { kind: 'fits' };            // classic pool: any field
  if (playerCount <= 0) return { kind: 'unknown' };
  if (playerCount < mode.playersMin) return { kind: 'too-few', need: mode.playersMin - playerCount };
  if (playerCount > mode.playersMax) return { kind: 'too-many', over: playerCount - mode.playersMax };
  return { kind: 'fits' };
}

/** True when this mode is playable by this field. Convenience for `fitForMode(...).kind === 'fits'`. */
export function modeFits(mode: GameModeDescriptor | undefined, playerCount: number): boolean {
  return fitForMode(mode, playerCount).kind === 'fits';
}

/**
 * The mode's player range as a sentence, for the picker's description line.
 *
 * Says what the mode NEEDS, without claiming how the field walks — the old copy said "Played
 * within a single group of 4–8", which F-019 falsified for side games (8 players are two tee
 * times, not one group). An exact requirement reads as "Exactly 4 players." rather than "4–4".
 */
export function playerRangeSentence(mode: GameModeDescriptor): string {
  if (mode.playersMin === mode.playersMax) return `Exactly ${mode.playersMin} players.`;
  return `For ${mode.playersMin}–${mode.playersMax} players.`;
}

/**
 * A short badge for the picker: what this game says about the field you actually have.
 *
 * Returns null when there's nothing useful to say (no field yet), so the caller renders nothing
 * rather than an empty chip.
 */
export function fitBadge(mode: GameModeDescriptor | undefined, playerCount: number): string | null {
  const fit = fitForMode(mode, playerCount);
  switch (fit.kind) {
    case 'unknown': return null;
    case 'fits': return `✓ ${playerCount} players`;
    case 'too-few':
    case 'too-many': {
      // A mode with a FIXED requirement states the number, not the delta. "Wolf — 1 too many" was
      // the first draft and reads as though dropping a player is the fix; Wolf needs exactly four,
      // so at five the useful thing to say is "needs exactly 4". The screenshot showed this — the
      // arithmetic was right and the sentence was wrong.
      if (mode!.playersMin === mode!.playersMax) return `needs exactly ${mode!.playersMin}`;
      // A RANGE has a real direction, so name the gap: actionable in a way "doesn't fit" isn't.
      return fit.kind === 'too-few' ? `needs ${fit.need} more` : `${fit.over} too many`;
    }
  }
}

/**
 * The full explanation for a game that can't be played by this field, or null when it can.
 *
 * Deliberately does NOT say "go back to Field" — the point of F-020 is that the constraint is
 * stated where the choice is made, so there's nowhere to go back to.
 */
export function fitExplanation(mode: GameModeDescriptor | undefined, playerCount: number): string | null {
  const fit = fitForMode(mode, playerCount);
  if (fit.kind === 'fits' || fit.kind === 'unknown') return null;
  const range = mode!.playersMin === mode!.playersMax
    ? `exactly ${mode!.playersMin}`
    : `${mode!.playersMin}–${mode!.playersMax}`;
  return `${mode!.name} needs ${range} players — you have ${playerCount}.`;
}
