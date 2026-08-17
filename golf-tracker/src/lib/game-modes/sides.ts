// The SIDE COLLECTION: how a single group's players are split into competing sides.
//
// WHY A NEW SHAPE
// `subTeams: { a: string[]; b: string[] }` can only ever express two sides. Craig, asked
// whether he'd want three pairs from six players, or four players each as their own side:
// "yes, eventually i do think that would be an important feature" (DECISIONS.md §5.g). So the
// collection becomes N sides. See FINDINGS.md F-006.
//
// WHY AN ORDERED ARRAY OF RECORDS, and not the two obvious alternatives:
//
//   `string[][]`            — rejected. Side identity would be the array INDEX, so inserting
//                             or removing a side silently re-labels every side after it, and
//                             `TeamLegLine.winner` would become a number. Index-as-identity is
//                             exactly the bug class that has already cost this finding $150
//                             twice (the order-dependent one-ball payout, F-012 and §5.ac).
//   `Record<string, ...>`   — rejected. No defined iteration order, so the leaderboard's side
//                             ordering would depend on a JS engine detail.
//
// An explicit `id` per side means identity survives reordering, insertion and deletion.
//
// HOW LEGACY GAMES LOAD
// Every saved 2v2 game holds `subTeams: {a, b}`, and there is no migration. `sidesOfGame`
// normalizes at the READ boundary — never inside the engine — and preserves the ids `'a'` and
// `'b'` LITERALLY. That's what makes this cheap rather than a rewrite:
//   - `TeamLegLine.winner: 'a' | 'b'` stays a valid value once the type widens to `string`
//   - the `playerId: 'A' | 'B'` standings rows stay valid
//   - `sideAName` / `sideBName` keep resolving to the right side
//   - every existing game, test and golden snapshot reads identically
//
// And on the WRITE side, `persistedSides` emits the old `{a, b}` shape whenever there are
// exactly two sides — so a game only leaves the snapshot-pinned representation when it's
// playing something that representation cannot express. Same principle as
// `persistedTeamScoring` keeping `ballSelection` populated (F-006 step 4).

/** One side: a stable id, an optional custom name, and its members. */
export interface GameSide {
  /** Stable identity, NOT a position. Legacy two-side games use 'a' and 'b'. */
  id: string;
  /** Custom display name. Absent/blank falls back to naming the side after its players. */
  name?: string;
  playerIds: string[];
}

/** The legacy two-side shape, still what every saved 2v2 game holds. */
export interface LegacySubTeams {
  a: string[];
  b: string[];
}

/** The two ids a legacy game's sides are given, in order. Exported so callers stop hardcoding. */
export const LEGACY_SIDE_IDS = ['a', 'b'] as const;

/**
 * The sides of a saved game, whichever way they were stored.
 *
 * Reading order of precedence: the N-side `sides` field if present, else the legacy
 * `subTeams`, else no sides at all (an empty array — callers decide whether to seed a
 * default, which is a UI concern, not this function's).
 */
export function sidesOfGame(game: {
  sides?: GameSide[];
  subTeams?: LegacySubTeams;
}): GameSide[] {
  if (game.sides && game.sides.length > 0) return game.sides;
  if (game.subTeams) return fromLegacySubTeams(game.subTeams);
  return [];
}

/** Widen the legacy two-side shape, keeping 'a' and 'b' as the ids so nothing downstream moves. */
export function fromLegacySubTeams(subTeams: LegacySubTeams): GameSide[] {
  return [
    { id: 'a', playerIds: subTeams.a },
    { id: 'b', playerIds: subTeams.b },
  ];
}

/**
 * The narrow legacy shape for a side collection, or null when it can't be expressed that way
 * (any count other than two, or ids that aren't 'a'/'b').
 *
 * Null is the signal to persist the N-side field instead — see `persistedSides`.
 */
export function toLegacySubTeams(sides: GameSide[]): LegacySubTeams | null {
  if (sides.length !== 2) return null;
  const a = sides.find((s) => s.id === 'a');
  const b = sides.find((s) => s.id === 'b');
  if (!a || !b) return null;
  // A custom name can't ride in the legacy shape — it lives in modeSettings' sideAName /
  // sideBName there. If a side carries its own `name`, that's the N-side field's job.
  if (a.name || b.name) return null;
  return { a: a.playerIds, b: b.playerIds };
}

/**
 * What to persist for a side collection.
 *
 * An ordinary two-side 2v2 game saves the OLD way (`subTeams`, no `sides`), so it computes
 * down the path the golden snapshots pin and settles exactly as every game before it. Three
 * or more sides — or two sides carrying custom names — opt in to the new field.
 *
 * Pure and exported so the rule is unit-tested rather than living inside a component. Mirrors
 * `persistedTeamScoring`, deliberately: that pattern is what kept "existing games settle
 * identically" true when the pool was generalized.
 */
export function persistedSides(sides: GameSide[]): {
  subTeams?: LegacySubTeams;
  sides?: GameSide[];
} {
  const legacy = toLegacySubTeams(sides);
  if (legacy) return { subTeams: legacy };
  // `subTeams` is deliberately left ABSENT rather than filled with the first two sides: a
  // half-truth would make an older client silently drop players and settle a different game.
  // Absent means an old client shows no sides, which is visibly wrong instead of quietly wrong.
  return { sides };
}

/** A side's members, by id. Empty when the id isn't in the collection. */
export function sideMembers(sides: GameSide[], sideId: string): string[] {
  return sides.find((s) => s.id === sideId)?.playerIds ?? [];
}

/** Which side a player is on, or null when they're on none. */
export function sideOfPlayer(sides: GameSide[], playerId: string): GameSide | null {
  return sides.find((s) => s.playerIds.includes(playerId)) ?? null;
}

/**
 * A fresh side id that doesn't collide with the collection's existing ones.
 *
 * Continues the legacy 'a'/'b' lettering ('c', 'd', …) so a three-side game reads as A/B/C on
 * screen rather than mixing letters with something else. Falls back to 's<n>' past 26 sides,
 * which no golf game will reach but which keeps the function total.
 */
export function nextSideId(sides: GameSide[]): string {
  const taken = new Set(sides.map((s) => s.id));
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(97 + i);   // 'a'..'z'
    if (!taken.has(id)) return id;
  }
  let n = sides.length + 1;
  while (taken.has(`s${n}`)) n++;
  return `s${n}`;
}

/**
 * A side's display label when it has no custom name and no players to name it after.
 * "Side A" / "Side B" / "Side C" — the vocabulary already used for 2v2 (open question 1 in
 * DECISIONS.md settled on "side", reserving "team" for foursomes).
 */
export function defaultSideLabel(sideId: string): string {
  return `Side ${sideId.toUpperCase()}`;
}
