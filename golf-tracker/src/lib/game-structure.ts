// Game structure — the routing layer of the §5.bk collapse (plan: .claude/plans/
// game-structure-collapse-plan.md; Craig's answers: DECISIONS_ARCHIVE §5.bm).
//
// The wizard asks structure ("N teams of K" or everyone for themselves), scoring, teams,
// tee sheet and money in plain words. Nothing here is a screen: this module turns those
// answers into the CONTAINER the app already has — the classic pool (gameMode absent), the
// sides engine ('team-2v2'), or an individual mode — and says, honestly, when no engine can
// carry what was asked. The user never sees a container name (§5.bm Q1: route by
// CAPABILITY, never by preference or as a choice).
//
// Pure by design: no Supabase, no storage, no Date, no randomness. The compute engines
// (`pool-game.ts`, `game-modes/*`) are untouched — they get ROUTED TO. Every routed game is
// proven zero-sum in `src/test/game-structure.test.ts`.

import {
  DEFAULT_MATCH_CONFIG,
  SIDE_SHAPE_OPTS,
  TEE_GROUP_SHAPE_OPTS,
  groupShapesFor,
  groupShapeLabel,
  type PoolGame,
  type PoolMatchConfig,
  type PoolMoneyMode,
} from './pool-game';
import { getGameMode } from './game-modes';
import { persistedSides, sidesOfGame, type GameSide } from './game-modes/sides';
import {
  isOneBall,
  needsTwoScores,
  persistedTeamScoring,
  type ScoreBasis,
  type TeamFormat,
} from './game-modes/team-scoring';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** 'solo' = everyone for themselves (an individual mode); 'teams' = N teams of K. */
export type StructureKind = 'solo' | 'teams';

/** The shape the user picked: team sizes in order. A solo game is n teams of one. */
export interface StructureShape {
  kind: StructureKind;
  teamSizes: number[];
}

/** One row on the structure step. */
export interface StructureOption extends StructureShape {
  /** Stable id for a radio/select value: 'solo', 'teams:4+4', 'teams:3+3+2'. */
  id: string;
  /** "Two teams of 4", "Four pairs", "Everyone for themselves", "3 + 3 + 2". */
  label: string;
  /** One line under the label. */
  detail: string;
  /** Equal team sizes. Uneven shapes sit under "Other split…" (§5.bm Q3). */
  even: boolean;
  /** The fit-based pre-selection (§5.bk): 8+ → teams that are tee groups; 4–7 → two teams; 2–3 → solo. */
  recommended: boolean;
  /** Shown in the main list: every even shape plus the recommendation (which is uneven for 5 or 7).
   *  The rest sit under "Other split…" — the recommendation must never hide behind a reveal. */
  primary: boolean;
}

/** Which machinery a game runs on. Never shown to the user. */
export type Container = 'individual' | 'classic' | 'sides';

/** The structure a SAVED game has, derived — never stored (§5.ac). */
export interface Structure extends StructureShape {
  teamCount: number;
  /** Uniform team size, or null when uneven. */
  teamSize: number | null;
  /** Every tee group is exactly one team (today's classic pool). */
  aligned: boolean;
  /** Every team walks in one tee group (aligned implies this; the 2v2 in one foursome has it too). */
  teamsTogether: boolean;
  container: Container;
}

/** Container-neutral money vocabulary (plan §3.4, one label each on the money step). */
export type MoneyModel = 'pot' | 'legs' | 'per-hole' | 'per-point';

export const MONEY_MODEL_LABELS: Record<MoneyModel, string> = {
  pot: 'Pot — everyone buys in, best team(s) paid',
  legs: 'Head-to-head — fixed $ per front / back / overall',
  'per-hole': '$ per hole won',
  'per-point': '$ per point of margin',
};

export type CompareBy = 'total' | 'match';

/** Container-neutral scoring: how a team's hole score forms, what it's expressed as, how teams are compared. */
export interface NeutralScoring {
  format: TeamFormat;
  basis: ScoreBasis;
  compareBy: CompareBy;
}

/** Everything the router reads. The wizard fills this from its steps; tests fill it by hand. */
export interface StructureDraft {
  structure: StructureShape;
  /** Individual mode id when `structure.kind === 'solo'` (skins, quota, …). */
  soloMode?: string;
  /** Team scoring when `structure.kind === 'teams'`. */
  scoring?: NeutralScoring;
  /** Tee-sheet facts, derived by `teeSheetFacts` — never asked (§5.bm Q2). */
  aligned: boolean;
  teamsTogether: boolean;
  moneyModel: MoneyModel;
  /** Pot only: split across front / back / overall (the classic quarters) instead of one prize. */
  potLegs?: boolean;
  /** Which bonuses the game plays. `junk` = birdie/eagle differential (both engines); CTP and
   *  manual bonuses exist only in the classic pool. */
  bonuses?: { junk?: boolean; ctp?: boolean; custom?: boolean };
  captains?: boolean;
  hideHolesUntilAllFinish?: boolean;
}

export type Route =
  | { container: 'individual'; gameMode: string }
  | { container: 'classic'; gameMode: undefined; moneyMode: PoolMoneyMode }
  | { container: 'sides'; gameMode: 'team-2v2'; moneyModel: MoneyModel }
  | { container: 'unexpressible'; reason: string };

// ---------------------------------------------------------------------------
// Step 2: "How do you want to compete?"
// ---------------------------------------------------------------------------

const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const word = (n: number): string => WORDS[n] ?? String(n);

function isSolo(shape: number[]): boolean {
  return shape.every((s) => s === 1);
}

function isEven(shape: number[]): boolean {
  return shape.every((s) => s === shape[0]);
}

export function structureOptionId(shape: StructureShape): string {
  return shape.kind === 'solo' ? 'solo' : `teams:${shape.teamSizes.join('+')}`;
}

/** The fit-based default (§5.bk): what most fields of this size are actually playing. */
export function recommendedStructure(n: number): StructureShape | null {
  if (n < 2) return null;
  if (n <= 3) return { kind: 'solo', teamSizes: Array.from({ length: n }, () => 1) };
  if (n <= 7) {
    const two = groupShapesFor(n, SIDE_SHAPE_OPTS).find((s) => s.length === 2);
    return two ? { kind: 'teams', teamSizes: two } : null;
  }
  // 8+: teams that ARE tee groups — the best tee-sheet shape (4+4, 3+3+3, 4+3+3, …).
  const tee = groupShapesFor(n, TEE_GROUP_SHAPE_OPTS)[0];
  return tee ? { kind: 'teams', teamSizes: tee } : null;
}

function labelFor(shape: StructureShape, n: number): { label: string; detail: string } {
  const sizes = shape.teamSizes;
  if (shape.kind === 'solo') {
    return { label: 'Everyone for themselves', detail: `${n} players, no partners` };
  }
  const count = sizes.length;
  if (!isEven(sizes)) {
    return { label: `${word(count)} teams, ${groupShapeLabel(sizes)}`, detail: 'Uneven teams — handicaps still apply per player' };
  }
  const size = sizes[0];
  if (size === 1) return { label: '1 v 1', detail: 'Two players head-to-head' };
  if (size === 2) {
    return { label: count === 2 ? 'Two pairs' : `${word(count)} pairs`, detail: count === 2 ? '2 v 2 — one foursome' : 'Partners share a cart' };
  }
  const label = `${word(count)} teams of ${size}`;
  const detail = size === 4 ? 'Each team plays as its own foursome — the classic pool' : 'Partners share a foursome';
  return { label, detail };
}

/**
 * Every structure a field of `n` can play, even shapes first, uneven after (for "Other
 * split…"), the §5.bk recommendation flagged. Built on the same `groupShapesFor` that powers
 * the F-020 side-shape chooser, so it never invents a split the rest of the app can't hold.
 * Two players also get "1 v 1" (sides of one — the existing singles Nassau).
 */
export function structureOptionsFor(n: number): StructureOption[] {
  if (n < 2) return [];
  const rec = recommendedStructure(n);
  const recId = rec ? structureOptionId(rec) : null;
  const out: StructureOption[] = [];
  const push = (shape: StructureShape) => {
    const id = structureOptionId(shape);
    if (out.some((o) => o.id === id)) return;
    const { label, detail } = labelFor(shape, n);
    const even = isEven(shape.teamSizes);
    out.push({ ...shape, id, label, detail, even, recommended: id === recId, primary: even || id === recId });
  };
  for (const sizes of groupShapesFor(n, SIDE_SHAPE_OPTS)) {
    if (isSolo(sizes)) {
      if (n === 2) push({ kind: 'teams', teamSizes: [1, 1] });
      push({ kind: 'solo', teamSizes: sizes });
    } else {
      push({ kind: 'teams', teamSizes: sizes });
    }
  }
  // Stable partition: primary shapes keep groupShapesFor's fewest-teams-first order; the rest follow.
  return [...out.filter((o) => o.primary), ...out.filter((o) => !o.primary)];
}

/** The team sizes as a plain shape: [4, 4] → teams p1..p4, p5..p8 (ids don't matter for the facts). */
function shapeTeams(sizes: number[]): string[][] {
  let n = 0;
  return sizes.map((k) => Array.from({ length: k }, () => `#${++n}`));
}

/**
 * What the DEFAULT tee sheet (§5.bm Q2: partners together) implies for a shape, before any
 * players exist: two teams of 4 are aligned; four pairs share foursomes; 3 + 2 are two groups.
 * The wizard uses this to pick the teams step and the router's inputs until real groups exist.
 */
export function defaultTeeSheetFacts(sizes: number[]): { aligned: boolean; teamsTogether: boolean } {
  const teams = shapeTeams(sizes);
  return teeSheetFacts(teams, proposeTeeGroups(teams));
}

/**
 * The structure a SAVED format / group default implies for a field of `n` (plan §4.3). Formats
 * hold no players, so the shape is derived: an individual mode → solo; a sides game → its saved
 * side count (sizes when they still add up to `n`, else the balanced shape with that many
 * teams); a classic pool → teams that are tee groups, or the §5.bk default under eight.
 */
export function structureForDefaults(
  d: { gameMode?: string; sides?: GameSide[]; subTeams?: { a: string[]; b: string[] } },
  n: number,
): StructureShape | null {
  if (n < 2) return null;
  const category = getGameMode(d.gameMode)?.category;
  if (category === 'individual') return { kind: 'solo', teamSizes: Array.from({ length: n }, () => 1) };
  if (category === 'team-within-group') {
    const saved = sidesOfGame({ sides: d.sides, subTeams: d.subTeams }).map((s) => s.playerIds.length);
    if (saved.length >= 2 && saved.reduce((s, k) => s + k, 0) === n) return { kind: 'teams', teamSizes: saved };
    const same = groupShapesFor(n, SIDE_SHAPE_OPTS).find((s) => s.length === Math.max(2, saved.length));
    if (same) return { kind: 'teams', teamSizes: same };
    return recommendedStructure(n);
  }
  if (n >= 8) {
    const tee = groupShapesFor(n, TEE_GROUP_SHAPE_OPTS)[0];
    if (tee) return { kind: 'teams', teamSizes: tee };
  }
  const two = groupShapesFor(n, SIDE_SHAPE_OPTS).find((s) => s.length === 2);
  return two ? { kind: 'teams', teamSizes: two } : recommendedStructure(n);
}

// ---------------------------------------------------------------------------
// Tee sheet (§5.bm Q2: partners walk together, never asked)
// ---------------------------------------------------------------------------

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

/** The two facts the router needs about who walks with whom. */
export function teeSheetFacts(teams: string[][], groups: string[][]): { aligned: boolean; teamsTogether: boolean } {
  const teamsTogether = teams.every((t) => groups.some((g) => t.every((id) => g.includes(id))));
  const aligned = teamsTogether
    && teams.length === groups.length
    && groups.every((g) => teams.some((t) => sameSet(t, g)));
  return { aligned, teamsTogether };
}

/**
 * The default tee sheet: whole teams packed into a REAL tee shape (`groupShapesFor` with the
 * tee rules — never a group of one, never a fivesome), best shape first. For 2 + 2 + 1 that is
 * 3 + 2 with the single riding along with a pair, not 4 + 1. A team that fits no shape whole
 * (5+) is split along the best tee shape — nothing else ever separates partners. The groups
 * step lets the organizer drag players afterwards; `teeSheetFacts` re-derives what the router
 * needs.
 */
export function proposeTeeGroups(teams: string[][], maxGroup = 4): string[][] {
  const n = teams.reduce((s, t) => s + t.length, 0);
  if (n === 0) return [];
  const opts = { ...TEE_GROUP_SHAPE_OPTS, max: maxGroup };
  for (const shape of groupShapesFor(n, opts)) {
    const packed = packTeamsIntoShape(teams, shape);
    if (packed) return packed;
  }
  // No tee shape holds every team whole: pack first-fit and split what must be split.
  const groups: string[][] = [];
  for (const team of teams) {
    const chunks = team.length <= maxGroup
      ? [team]
      : splitAlong(team, groupShapesFor(team.length, opts)[0] ?? [team.length]);
    for (const chunk of chunks) {
      const room = groups.find((g) => g.length + chunk.length <= maxGroup);
      if (room) room.push(...chunk);
      else groups.push([...chunk]);
    }
  }
  return groups;
}

/**
 * Whole teams packed into ONE given tee shape (F-071: the groups step's shape buttons keep
 * partners together). First-fit in TEAM order, so team 1 and team 2 share the first tee time —
 * the order the organizer built them is the order they go off. Null when some team fits no
 * slot whole; the caller decides what to do then (proposeTeeGroups tries the next shape, the
 * groups step falls back to a balanced deal).
 */
export function packTeamsIntoShape(teams: string[][], shape: number[]): string[][] | null {
  const groups: string[][] = shape.map(() => []);
  for (const team of teams) {
    const slot = shape.findIndex((cap, g) => cap - groups[g].length >= team.length);
    if (slot < 0) return null;
    groups[slot].push(...team);
  }
  return groups.filter((g) => g.length > 0);
}

function splitAlong(ids: string[], shape: number[]): string[][] {
  const out: string[][] = [];
  let i = 0;
  for (const size of shape) { out.push(ids.slice(i, i + size)); i += size; }
  return out;
}

// ---------------------------------------------------------------------------
// structureOf — the one vocabulary source for a saved game (F-061)
// ---------------------------------------------------------------------------

export function structureOf(game: PoolGame): Structure {
  const category = getGameMode(game.gameMode)?.category;
  const groups = game.teams.map((t) => t.playerIds);
  let kind: StructureKind = 'teams';
  let teams: string[][];
  let container: Container;
  if (category === 'individual') {
    kind = 'solo';
    teams = game.players.map((p) => [p.id]);
    container = 'individual';
  } else if (category === 'team-within-group') {
    teams = sidesOfGame(game).map((s) => s.playerIds);
    container = 'sides';
  } else {
    teams = groups;
    container = 'classic';
  }
  const teamSizes = teams.map((t) => t.length);
  const facts = teeSheetFacts(teams, groups);
  return {
    kind,
    teamSizes,
    teamCount: teams.length,
    teamSize: teamSizes.length > 0 && isEven(teamSizes) ? teamSizes[0] : null,
    ...facts,
    container,
  };
}

/** "2 teams of 4", "4 pairs", "3 + 3 + 2", "1 v 1", "8 players". Phase 2 threads this through the label sites. */
export function structureLabel(s: StructureShape): string {
  if (s.kind === 'solo') return `${s.teamSizes.length} players`;
  if (!isEven(s.teamSizes)) return groupShapeLabel(s.teamSizes);
  const n = s.teamSizes.length;
  const k = s.teamSizes[0];
  if (k === 1) return n === 2 ? '1 v 1' : `${n} singles`;
  if (k === 2) return `${n} pairs`;
  return `${n} teams of ${k}`;
}

// ---------------------------------------------------------------------------
// routeContainer — plan §3.3 under §5.bm Q1 (capability routing)
// ---------------------------------------------------------------------------

/** Plain-words reason for a greyed money option. Exported so the money step and the tests share one string source. */
export const UNEXPRESSIBLE = {
  noSoloMode: 'Pick a game for everyone-for-themselves.',
  noScoring: 'Pick how the teams are scored.',
  oneBallApart: 'Scramble and alternate shot play one ball per team, so partners must walk together.',
  sidesFieldCap: (max: number) => `Teams that share foursomes top out at ${max} players for now.`,
  needAligned: (needs: string) => `${needs} need each team in its own foursome.`,
  needTwoTeams: (needs: string) => `${needs} can't ride on head-to-head legs with more than two teams yet.`,
  needPotOrLegs: (needs: string) => `${needs} can't ride on $ per hole or $ per point yet.`,
  needTeams: (needs: string) => `${needs} need teams of two or more.`,
} as const;

const SIDES_MAX_PLAYERS = 8;   // team-2v2's playersMax; read here so the reason string is honest

function classicOnlyNeeds(draft: StructureDraft): string[] {
  const needs: string[] = [];
  if (draft.bonuses?.ctp) needs.push('Closest-to-pin');
  if (draft.bonuses?.custom) needs.push('Manual bonuses');
  if (draft.captains) needs.push('Captains');
  if (draft.hideHolesUntilAllFinish) needs.push('Hiding holes until every group finishes');
  if (draft.moneyModel === 'pot' && draft.potLegs) needs.push('Front / back / overall pot splits');
  return needs;
}

function joinNeeds(needs: string[]): string {
  if (needs.length === 1) return needs[0];
  return `${needs.slice(0, -1).join(', ')} and ${needs[needs.length - 1].charAt(0).toLowerCase()}${needs[needs.length - 1].slice(1)}`;
}

/**
 * Which engine carries EVERYTHING the draft asks for.
 *
 *   solo                                  → the individual mode
 *   teams, classic can hold it all        → classic pool (pot, or 2-team head-to-head 'match')
 *   teams, sides can hold it all          → sides engine ('team-2v2', any N, pairwise)
 *   needs something only classic has AND
 *   something only sides has              → unexpressible, with the reason the money step shows
 *
 * Classic can serve: every team is its own tee group, and the money is a pot or a
 * two-team head-to-head. Sides can serve: at most 8 players, EVERY team format (F-072 routed
 * its hole scoring through the pool's `teamValueOnHole`), no CTP / manual bonuses / captains /
 * hidden holes. When both can (aligned two teams on fixed legs, or an aligned pot), classic
 * wins — it carries more.
 *
 * A two-ball format needs two cards on every team, so a team of one refuses it in BOTH
 * containers — the guard is here, not in `classicOnlyNeeds`, because it's about the golf.
 */
export function routeContainer(draft: StructureDraft): Route {
  const { structure } = draft;
  if (structure.kind === 'solo') {
    return draft.soloMode
      ? { container: 'individual', gameMode: draft.soloMode }
      : { container: 'unexpressible', reason: UNEXPRESSIBLE.noSoloMode };
  }
  if (!draft.scoring) return { container: 'unexpressible', reason: UNEXPRESSIBLE.noScoring };

  const sizes = structure.teamSizes;
  const teamCount = sizes.length;
  const players = sizes.reduce((s, k) => s + k, 0);
  const singles = sizes.every((k) => k === 1);

  if (isOneBall(draft.scoring.format) && !draft.teamsTogether) {
    return { container: 'unexpressible', reason: UNEXPRESSIBLE.oneBallApart };
  }
  if (needsTwoScores(draft.scoring.format) && sizes.some((k) => k < 2)) {
    return { container: 'unexpressible', reason: UNEXPRESSIBLE.needTeams('Two-ball formats') };
  }

  const needs = classicOnlyNeeds(draft);
  const classicCan = !singles && draft.aligned
    && (draft.moneyModel === 'pot' || (draft.moneyModel === 'legs' && teamCount === 2));

  if (needs.length > 0 && !classicCan) {
    const what = joinNeeds(needs);
    if (singles) return { container: 'unexpressible', reason: UNEXPRESSIBLE.needTeams(what) };
    if (!draft.aligned) return { container: 'unexpressible', reason: UNEXPRESSIBLE.needAligned(what) };
    if (draft.moneyModel === 'legs') return { container: 'unexpressible', reason: UNEXPRESSIBLE.needTwoTeams(what) };
    return { container: 'unexpressible', reason: UNEXPRESSIBLE.needPotOrLegs(what) };
  }
  if (classicCan) {
    return { container: 'classic', gameMode: undefined, moneyMode: draft.moneyModel === 'legs' ? 'match' : 'pot' };
  }
  if (players > SIDES_MAX_PLAYERS) {
    return { container: 'unexpressible', reason: UNEXPRESSIBLE.sidesFieldCap(SIDES_MAX_PLAYERS) };
  }
  return { container: 'sides', gameMode: 'team-2v2', moneyModel: draft.moneyModel };
}

// ---------------------------------------------------------------------------
// moneyModelsFor — what the money step lists, greyed with the router's own reason
// ---------------------------------------------------------------------------

export interface MoneyModelOption {
  model: MoneyModel;
  label: string;
  route: Route;
  available: boolean;
}

/**
 * The four money models against THIS draft. Availability comes from `routeContainer` itself
 * (one source of truth, no second capability table), so the reason under a greyed option is
 * exactly why the router would refuse it.
 */
export function moneyModelsFor(draft: Omit<StructureDraft, 'moneyModel'>): MoneyModelOption[] {
  return (Object.keys(MONEY_MODEL_LABELS) as MoneyModel[]).map((model) => {
    const route = routeContainer({ ...draft, moneyModel: model });
    return { model, label: MONEY_MODEL_LABELS[model], route, available: route.container !== 'unexpressible' };
  });
}

// ---------------------------------------------------------------------------
// routedFields — the discriminating PoolGame fields a route implies
// ---------------------------------------------------------------------------

/** Sides for the sides engine, ids 'a', 'b', 'c', … so two unnamed sides persist as legacy `subTeams`. */
export function sidesFromTeams(teams: string[][]): GameSide[] {
  return teams.map((playerIds, i) => ({ id: String.fromCharCode(97 + i), playerIds }));
}

/**
 * The fields that make a PoolGame land in its container. Amounts (buy-in, $/leg, split
 * dollars), players, tee groups and everything else stay the wizard's — spread this over them.
 * Classic scoring goes through `persistedTeamScoring` so an ordinary stroke game still takes
 * the legacy path the golden snapshots pin; sides membership goes through `persistedSides` for
 * the same reason.
 */
export function routedFields(
  draft: StructureDraft,
  route: Route,
  teams: string[][],
  modeSettings: Record<string, string | number | boolean> = {},
  /** Sides the organizer already built (ids, custom names) — used instead of minting from `teams`. */
  opts: { sides?: GameSide[] } = {},
): Partial<PoolGame> {
  switch (route.container) {
    case 'individual':
      return { gameMode: route.gameMode, modeSettings };
    case 'classic': {
      const scoring = draft.scoring!;
      const matchConfig: PoolMatchConfig | undefined = route.moneyMode === 'match'
        ? { ...DEFAULT_MATCH_CONFIG, legDollars: { ...DEFAULT_MATCH_CONFIG.legDollars }, scoring: scoring.compareBy === 'match' ? 'holes' : 'stroke' }
        : undefined;
      return {
        gameMode: undefined,
        modeSettings: undefined,
        moneyMode: route.moneyMode,
        matchConfig,
        ...persistedTeamScoring(scoring.format, scoring.basis),
        useCaptains: draft.captains ?? false,
        hideHolesUntilAllFinish: draft.hideHolesUntilAllFinish ?? false,
      };
    }
    case 'sides': {
      const scoring = draft.scoring!;
      return {
        gameMode: 'team-2v2',
        modeSettings: {
          ...modeSettings,
          format: scoring.format,
          scoring: scoring.basis,
          result: scoring.compareBy,
          moneyModel: route.moneyModel,
          junkEnabled: draft.bonuses?.junk ?? false,
        },
        ...persistedSides(opts.sides && opts.sides.length > 0 ? opts.sides : sidesFromTeams(teams)),
      };
    }
    case 'unexpressible':
      return {};
  }
}
