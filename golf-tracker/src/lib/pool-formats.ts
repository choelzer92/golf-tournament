// Format Library — reuse a game's format across new games. A "format" is a
// roster_groups row tagged `defaults.kind === 'format'` (usually with no players),
// so it rides the existing groups table + GHIN scoping with NO migration. These
// are thin helpers over roster-groups.ts; the group cache/hydration is shared.
import type { PoolGame, PoolPotSplit } from './pool-game';
import type { GroupDefaults, RosterGroup } from './roster-groups';
import { getGroups, getViewableGroups, upsertGroup, getGroupById, setGroupOwner } from './roster-groups';
import { getCreatorGhin } from './pool-identity';
import { getGameMode } from './game-modes';
import { sidesOfGame, type GameSide } from './game-modes/sides';
import type { StructureShape } from './game-structure';

// A group's attached formats (resolved to the RosterGroup format rows), in the
// order they were attached. Skips ids that no longer resolve to a format.
export function getGroupFormats(group: RosterGroup): RosterGroup[] {
  const ids = group.defaults?.formatIds ?? [];
  return ids.map((id) => getFormatById(id)).filter((f): f is RosterGroup => !!f);
}

// Attach/detach a Format Library entry to a group. Persists via upsertGroup,
// which preserves the group's other defaults and its owner.
export async function attachFormatToGroup(group: RosterGroup, formatId: string): Promise<RosterGroup> {
  const existing = group.defaults?.formatIds ?? [];
  if (existing.includes(formatId)) return group;
  return upsertGroup({ ...group, defaults: { ...(group.defaults ?? {}), formatIds: [...existing, formatId] } });
}

export async function detachFormatFromGroup(group: RosterGroup, formatId: string): Promise<RosterGroup> {
  const existing = group.defaults?.formatIds ?? [];
  return upsertGroup({ ...group, defaults: { ...(group.defaults ?? {}), formatIds: existing.filter((id) => id !== formatId) } });
}

// Format Library entries (kind === 'format'), scoped/sorted by getGroups().
export function getFormats(): RosterGroup[] {
  return getGroups().filter((g) => g.defaults?.kind === 'format');
}

// True player groups only (everything that is NOT a format) — so GroupsManager
// keeps showing only player groups once formats share the table.
export function getPlayerGroups(): RosterGroup[] {
  return getGroups().filter((g) => g.defaults?.kind !== 'format');
}

// Player groups the viewer owns or is a member of (§5.cj): the hub and stats list these.
export function getViewablePlayerGroups(): RosterGroup[] {
  return getViewableGroups().filter((g) => g.defaults?.kind !== 'format');
}

export function getFormatById(id: string): RosterGroup | null {
  const g = getGroupById(id);
  return g && g.defaults?.kind === 'format' ? g : null;
}

// Extract a game's full format into a GroupDefaults (everything reusable; NOT the
// players or course, which are chosen fresh per game).
export function formatFromGame(game: PoolGame): GroupDefaults {
  return {
    kind: 'format',
    gameMode: game.gameMode,
    modeSettings: game.modeSettings,
    subTeams: game.subTeams,
    // N sides, or absent for an ordinary two-side game (F-006). Without this, saving a
    // three-side game to the library and starting from it would silently give back two sides —
    // the same class of drop that made teamFormat/teamScoreBasis necessary here.
    sides: game.sides,
    moneyMode: game.moneyMode,
    junkValues: game.junkValues,
    customBonuses: game.customBonuses,
    entryPerPlayer: game.entryPerPlayer,
    ballSelection: game.ballSelection,
    // The generalized format (F-006), or absent for an ordinary stroke game. Without these
    // two, saving "scramble, most Stableford points wins" to the library and starting a game
    // from it would silently give back a stroke game with the legacy ball selection.
    teamFormat: game.teamFormat,
    teamScoreBasis: game.teamScoreBasis,
    handicapAllowance: game.handicapAllowance,
    strokeMethod: game.strokeMethod,
    handicapBasis: game.handicapBasis,
    matchConfig: game.matchConfig,
  };
}

// B1 Run it back (§5.cm): what a rerun carries BEYOND the format — last time's field, course,
// structure, pairings and tee sheet — as pre-fills the organizer walks and can change. The format
// is the part copied for sure; players and course are the parts most likely to change. Score keys
// (matchupId) and tee times are NOT carried: the wizard issues fresh ones, so a rerun can never
// open on the old game's scores. Handicaps are re-read from the roster (today's index) by the
// wizard, never frozen here.
export interface RerunPlan {
  name: string;
  defaults: GroupDefaults;
  shape: StructureShape;
  players: PoolGame['players'];
  course: PoolGame['course'];
  /** Last time's tee groups (for an aligned game these ARE the teams). */
  teeGroups: { name: string; playerIds: string[]; captainId?: string }[];
  /** Last time's sides when teams shared foursomes; absent otherwise. */
  sides?: GameSide[];
  holesPlaying: '18' | 'front9' | 'back9';
  nineHandicapBasis: '18' | '9';
  positionSplitText: string;
  /** Last time's pot split (fractions) and the team count it was set for — carried only when
   *  the new game has the same number of teams (§5.cm); otherwise the standard fills it. */
  potSplit: PoolPotSplit;
  teamCount: number;
  hideHoles: boolean;
  sourceGroupId?: string;
  lockedGroups: string[][];
  useCaptains?: boolean;
  balanceExcludeCaptains?: boolean;
  teamBuild?: PoolGame['teamBuild'];
}

export function rerunPlanFromGame(game: PoolGame): RerunPlan {
  const n = game.players.length;
  const category = getGameMode(game.gameMode)?.category;
  const sides = category === 'team-within-group' ? sidesOfGame(game) : [];
  const shape: StructureShape = category === 'individual'
    ? { kind: 'solo', teamSizes: Array.from({ length: n }, () => 1) }
    : sides.length >= 2
      ? { kind: 'teams', teamSizes: sides.map((s) => s.playerIds.length) }
      : { kind: 'teams', teamSizes: game.teams.map((t) => t.playerIds.length) };
  return {
    name: game.name,
    defaults: formatFromGame(game),
    shape,
    players: game.players,
    course: game.course,
    teeGroups: game.teams.map((t) => ({
      name: t.name, playerIds: [...t.playerIds], ...(t.captainId ? { captainId: t.captainId } : {}),
    })),
    sides: sides.length >= 2 ? sides : undefined,
    holesPlaying: game.holesPlaying ?? '18',
    nineHandicapBasis: game.nineHandicapBasis ?? '18',
    positionSplitText: (game.positionSplit?.length ? game.positionSplit : [100]).join(', '),
    potSplit: { ...game.potSplit },
    teamCount: game.teams.length,
    hideHoles: !!game.hideHolesUntilAllFinish,
    sourceGroupId: game.sourceGroupId,
    lockedGroups: game.lockedGroups ?? [],
    useCaptains: game.useCaptains,
    balanceExcludeCaptains: game.balanceExcludeCaptains,
    teamBuild: game.teamBuild,
  };
}

// Save a format. `shared` stores it with owner_ghin = null (visible to all pool
// users, like a base group); otherwise it's scoped to the current organizer.
export async function saveFormat(
  name: string,
  defaults: GroupDefaults,
  opts?: { shared?: boolean; id?: string },
): Promise<RosterGroup> {
  return upsertGroup({
    id: opts?.id ?? crypto.randomUUID(),
    name: name.trim() || 'Format',
    ownerGhin: opts?.shared ? null : getCreatorGhin(),
    playerIds: [],
    defaults: { ...defaults, kind: 'format' },
  });
}

// Spin off a copy of an existing format under a new name (a variant to tweak).
export async function duplicateFormat(id: string, newName: string): Promise<RosterGroup | null> {
  const src = getFormatById(id);
  if (!src) return null;
  return saveFormat(newName, { ...(src.defaults ?? {}), kind: 'format' });
}

// Flip a format between personal (owner = current GHIN) and shared (owner = null).
// Uses setGroupOwner because upsertGroup intentionally preserves an existing row's
// owner (so it can't change ownership).
export async function setFormatShared(id: string, shared: boolean): Promise<RosterGroup | null> {
  if (!getFormatById(id)) return null;
  return setGroupOwner(id, shared ? null : getCreatorGhin());
}
