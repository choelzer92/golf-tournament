// Format Library — reuse a game's format across new games. A "format" is a
// roster_groups row tagged `defaults.kind === 'format'` (usually with no players),
// so it rides the existing groups table + GHIN scoping with NO migration. These
// are thin helpers over roster-groups.ts; the group cache/hydration is shared.
import type { PoolGame } from './pool-game';
import type { GroupDefaults, RosterGroup } from './roster-groups';
import { getGroups, upsertGroup, getGroupById, setGroupOwner } from './roster-groups';
import { getCreatorGhin } from './pool-identity';

// Format Library entries (kind === 'format'), scoped/sorted by getGroups().
export function getFormats(): RosterGroup[] {
  return getGroups().filter((g) => g.defaults?.kind === 'format');
}

// True player groups only (everything that is NOT a format) — so GroupsManager
// keeps showing only player groups once formats share the table.
export function getPlayerGroups(): RosterGroup[] {
  return getGroups().filter((g) => g.defaults?.kind !== 'format');
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
    moneyMode: game.moneyMode,
    junkValues: game.junkValues,
    entryPerPlayer: game.entryPerPlayer,
    ballSelection: game.ballSelection,
    handicapAllowance: game.handicapAllowance,
    strokeMethod: game.strokeMethod,
    handicapBasis: game.handicapBasis,
    matchConfig: game.matchConfig,
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
