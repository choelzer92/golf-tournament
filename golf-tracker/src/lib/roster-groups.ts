import { supabase } from './supabase';
import type { PoolJunkValues, PoolMoneyMode, PoolMatchConfig } from './pool-game';
import type { TwoBestBallsVariant } from './formats';

// A saved group = an organizer's "home base": a named set of roster player IDs
// PLUS the default game settings to prefill when starting a game from it. The
// player list points at roster `players` rows (by id) so a player stays a single
// entry across groups and games.
export interface GroupDefaults {
  moneyMode?: PoolMoneyMode;
  junkValues?: PoolJunkValues;
  entryPerPlayer?: number;
  positionSplitText?: string;
  matchConfig?: PoolMatchConfig;
  handicapAllowance?: number;
  strokeMethod?: 'full' | 'off-the-low';
  ballSelection?: TwoBestBallsVariant;
}

export interface RosterGroup {
  id: string;
  name: string;
  ownerGhin: number | null;   // null = shared base group; else scoped to that organizer
  playerIds: string[];
  defaults: GroupDefaults | null;
}

interface GroupRow {
  id: string;
  name: string;
  owner_ghin: number | null;
  player_ids: string[] | null;
  defaults: GroupDefaults | null;
}

const groupCache = new Map<string, RosterGroup>();

// Per-organizer visibility, mirroring roster.ts: the cache holds every group, but
// the list is filtered to what the viewer may see (shared base + their own; the
// app owner sees all).
let viewerGhin: number | null = null;
let viewerIsOwner = false;

export function setGroupViewer(ghin: number | null, isOwner: boolean): void {
  viewerGhin = ghin;
  viewerIsOwner = isOwner;
}

function isVisibleToViewer(g: RosterGroup): boolean {
  if (viewerIsOwner) return true;
  if (g.ownerGhin == null) return true;
  return g.ownerGhin === viewerGhin;
}

function rowToGroup(row: GroupRow): RosterGroup {
  return {
    id: row.id,
    name: row.name,
    ownerGhin: row.owner_ghin ?? null,
    playerIds: row.player_ids ?? [],
    defaults: row.defaults ?? null,
  };
}

// Load every group into the cache (small — one row per named group). Pass the
// current viewer so the displayed list is scoped to them.
export async function hydrateGroups(opts?: { viewerGhin?: number | null; isOwner?: boolean }): Promise<RosterGroup[]> {
  if (opts) setGroupViewer(opts.viewerGhin ?? null, !!opts.isOwner);
  const { data, error } = await supabase.from('roster_groups').select('*');
  // If the table doesn't exist yet (migration not applied), fail soft to empty.
  if (error) return getGroups();
  if (data) {
    groupCache.clear();
    for (const row of data as GroupRow[]) groupCache.set(row.id, rowToGroup(row));
  }
  return getGroups();
}

// The groups the current viewer may see (base + their own; owner sees all).
export function getGroups(): RosterGroup[] {
  return Array.from(groupCache.values()).filter(isVisibleToViewer).sort((a, b) => a.name.localeCompare(b.name));
}

export function getGroupById(id: string): RosterGroup | null {
  return groupCache.get(id) ?? null;
}

// Find a group by (case-insensitive) name within the viewer's scope — used to
// avoid re-seeding a group that already exists.
export function findGroupByName(name: string, ownerGhin: number | null): RosterGroup | null {
  const q = name.trim().toLowerCase();
  for (const g of groupCache.values()) {
    if (g.name.trim().toLowerCase() === q && (g.ownerGhin ?? null) === ownerGhin) return g;
  }
  return null;
}

// Upsert a group. Ownership follows the roster rule: an existing group keeps its
// owner; a new group made by the app owner is a shared base group (null), while a
// scoped organizer's new group is tagged to them (unless an explicit owner given).
export async function upsertGroup(group: RosterGroup): Promise<RosterGroup> {
  const existing = groupCache.get(group.id) || null;
  const ownerGhin: number | null = existing
    ? existing.ownerGhin ?? null
    : group.ownerGhin !== undefined
      ? group.ownerGhin
      : (viewerIsOwner ? null : viewerGhin);
  const merged: RosterGroup = { ...group, ownerGhin };
  groupCache.set(merged.id, merged);

  const row = {
    id: merged.id,
    name: merged.name,
    owner_ghin: merged.ownerGhin,
    player_ids: merged.playerIds,
    defaults: merged.defaults,
    updated_at: new Date().toISOString(),
  };
  await supabase.from('roster_groups').upsert(row);
  return merged;
}

export async function renameGroup(id: string, name: string): Promise<void> {
  const g = groupCache.get(id);
  if (!g) return;
  await upsertGroup({ ...g, name });
}

export async function setGroupMembers(id: string, playerIds: string[]): Promise<void> {
  const g = groupCache.get(id);
  if (!g) return;
  await upsertGroup({ ...g, playerIds });
}

// Add/remove a single player without clobbering the rest of the list.
export async function addGroupMember(id: string, playerId: string): Promise<void> {
  const g = groupCache.get(id);
  if (!g || g.playerIds.includes(playerId)) return;
  await setGroupMembers(id, [...g.playerIds, playerId]);
}

export async function removeGroupMember(id: string, playerId: string): Promise<void> {
  const g = groupCache.get(id);
  if (!g) return;
  await setGroupMembers(id, g.playerIds.filter((p) => p !== playerId));
}

export async function deleteGroup(id: string): Promise<void> {
  groupCache.delete(id);
  await supabase.from('roster_groups').delete().eq('id', id);
}
