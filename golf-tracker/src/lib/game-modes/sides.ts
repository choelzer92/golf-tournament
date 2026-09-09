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
  modeSettings?: Record<string, string | number | boolean>;
}): GameSide[] {
  const sides = (game.sides && game.sides.length > 0)
    ? game.sides
    : game.subTeams ? fromLegacySubTeams(game.subTeams) : [];
  return hydrateLegacyNames(sides, game.modeSettings);
}

/**
 * Absorb the LEGACY `side<Letter>Name` settings into each side's own `name` (F-014).
 *
 * Side names used to live in the generic settings bag as six static keys, `sideAName`..
 * `sideFName`. They now live on the side itself, because a settings schema is static and
 * cannot express "one field per side that exists" — which is why four always-blank boxes
 * leaked onto three separate surfaces (F-014, F-015).
 *
 * This is the ONE place the old shape is read, so everything downstream sees a single source
 * of truth. Games saved with `sideAName: 'The Hogs'` keep their names with no migration step
 * and no write on read.
 *
 * A side's OWN name always wins, including when it is explicitly `''` — that's how clearing a
 * name in the editor sticks instead of falling back to the legacy value it was migrated from.
 * (The editor also strips the legacy keys when it writes, so this only matters mid-transition.)
 */
export function hydrateLegacyNames(
  sides: GameSide[],
  modeSettings?: Record<string, string | number | boolean>,
): GameSide[] {
  if (!modeSettings) return sides;
  let changed = false;
  const out = sides.map((side, idx) => {
    if (side.name !== undefined) return side;          // own name wins, '' included
    const key = legacySideNameKey(idx);
    const legacy = key ? String(modeSettings[key] ?? '').trim() : '';
    if (!legacy) return side;
    changed = true;
    return { ...side, name: legacy };
  });
  return changed ? out : sides;                        // same array when nothing moved
}

/**
 * The legacy settings key that held the name for the side in position `idx`.
 *
 * Kept only for reading saved games. Nothing writes these any more.
 */
export function legacySideNameKey(idx: number): string | null {
  return idx >= 0 && idx < 6 ? `side${String.fromCharCode(65 + idx)}Name` : null;
}

/** Every legacy side-name key, for stripping them when the new editor writes. */
export const LEGACY_SIDE_NAME_KEYS: string[] =
  Array.from({ length: 6 }, (_, i) => `side${String.fromCharCode(65 + i)}Name`);

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

/**
 * Settings keys for side names that this collection has no side for.
 *
 * The mode declares six (`sideAName`..`sideFName`) because a settings schema is static, but a
 * two-side game must not render four always-blank name boxes — that's four rows of nothing on a
 * phone. The hub hides these.
 */
export function unusedSideNameKeys(sideCount: number): string[] {
  const keys: string[] = [];
  for (let i = sideCount; i < 6; i++) keys.push(`side${String.fromCharCode(65 + i)}Name`);
  return keys;
}

/** A side's members, by id. Empty when the id isn't in the collection. */
export function sideMembers(sides: GameSide[], sideId: string): string[] {
  return sides.find((s) => s.id === sideId)?.playerIds ?? [];
}

/** A leg the close-out prompt needs to ask about: short, and worth money. */
export interface IncompleteLeg {
  key: 'front' | 'back' | 'overall';
  label: string;
  /** Holes every side has posted. */
  thru: number;
  /** Holes the leg spans. */
  holes: number;
  /** What this leg is worth, so the prompt can say what's at stake. */
  dollars: number;
}

/**
 * Which legs are INCOMPLETE and therefore worth asking about at close-out (F-016b).
 *
 * A leg is incomplete when not every side has played all of its holes — `thru < holes` on the
 * engine's own leg lines, so this reads the engine's answer rather than recomputing hole counts
 * and risking a second, disagreeing definition.
 *
 * Returns EMPTY unless the game actually settles per leg. Verified, not assumed: leg lines feed
 * money only in the `legs` model (team-game.ts's four payLeg call sites) — per-hole settles on
 * holes won, per-point on the total margin, pot on finishing order. Asking "should the back nine
 * pay?" in a pot game would be a question with no consequence, which is worse than not asking.
 *
 * Also empty when a leg is worth $0, since voiding it would change nothing.
 *
 * Pure, so the rule is unit-tested rather than living inside the close-out component.
 */
export function incompleteLegsForCloseOut(
  legs: { key: 'front' | 'back' | 'overall'; label: string; thru: number; holes: number }[],
  moneyModel: string,
  legDollars: { front: number; back: number; overall: number },
): IncompleteLeg[] {
  if (moneyModel !== 'legs') return [];
  return legs
    .filter((l) => l.thru < l.holes)
    .map((l) => ({ ...l, dollars: legDollars[l.key] }))
    .filter((l) => l.dollars > 0);
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

// ---------------------------------------------------------------------------
// Round-robin settlement
// ---------------------------------------------------------------------------

/**
 * PAIRWISE settlement across N sides: every side settles against every OTHER side, and its
 * money is the sum of those individual results.
 *
 * Craig's rule (DECISIONS.md §5.ae), in his words: "the losing team would owe all teams ahead
 * of them, and the 2nd team would owe just the one ahead". So with $1 a point and three sides
 * at 70 / 74 / 80 strokes:
 *
 *     A: (74−70) + (80−70) = +$14     last owes both sides ahead of it
 *     B: (70−74) + (80−74) =  +$2     2nd owes 1st, and collects from 3rd
 *     C: (70−80) + (74−80) = −$16
 *
 * Two properties that make this the right generalization, both asserted in sides.test.ts:
 *   - it is ZERO-SUM at every side count, because each pairing contributes +x to one side and
 *     −x to the other
 *   - at exactly two sides it reduces to today's head-to-head margin, so every existing 2v2
 *     game settles unchanged
 *
 * `valueOf` returns the side's comparable figure (a total, a points tally, holes won — whatever
 * the money model is counting), or null when that side has nothing to settle with yet.
 * `settle` returns what the FIRST side collects from the second for that pairing; return 0 for
 * a push. Sides whose value is null are skipped entirely rather than treated as zero, so an
 * unscored side neither pays nor collects.
 */
export function settleRoundRobin<T>(
  sides: T[],
  valueOf: (side: T) => number | null,
  settle: (a: number, b: number) => number,
): number[] {
  const values = sides.map(valueOf);
  return values.map((mine, i) => {
    if (mine === null) return 0;
    let total = 0;
    for (let j = 0; j < values.length; j++) {
      if (i === j) continue;
      const theirs = values[j];
      if (theirs === null) continue;
      total += settle(mine, theirs);
    }
    return total;
  });
}
