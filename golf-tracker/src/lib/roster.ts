import { supabase } from './supabase';
import { parseGhinIndex } from './game-state';

// A saved, reusable player. Grows every match so players are entered once and
// found by name thereafter. `id` is the app-generated UUID reused across games.
export interface RosterPlayer {
  id: string;
  ghinNumber: number | null;
  name: string;
  handicapIndex: number | null;
  gender: 'M' | 'F' | null;
  defaultTeeName: string | null;  // remembered tee (by name) from last game
  hcapUpdatedAt?: string | null;  // ISO time the index was last pulled from GHIN
  ownerGhin?: number | null;      // organizer who owns this entry; null = shared "base" roster
}

interface RosterRow {
  id: string;
  ghin_number: number | null;
  name: string;
  handicap_index: number | null;
  gender: string | null;
  default_tee_name: string | null;
  hcap_updated_at: string | null;
  owner_ghin?: number | null;
}

const rosterCache = new Map<string, RosterPlayer>();

// Per-organizer visibility. The cache holds EVERY player (so GHIN uniqueness +
// dedupe keep working across organizers), but the roster is DISPLAYED filtered
// to what the current viewer may see: the shared base roster (ownerGhin null)
// plus their own scoped players. The app owner sees everyone's. Call
// setRosterViewer (or pass opts to hydrateRoster) once identity is known.
let viewerGhin: number | null = null;
let viewerIsOwner = false;

export function setRosterViewer(ghin: number | null, isOwner: boolean): void {
  viewerGhin = ghin;
  viewerIsOwner = isOwner;
}

function isVisibleToViewer(p: RosterPlayer): boolean {
  if (viewerIsOwner) return true;          // owner (admin) sees every roster entry
  if (p.ownerGhin == null) return true;    // shared base roster — visible to all
  return p.ownerGhin === viewerGhin;       // the viewer's own scoped players
}

function rowToPlayer(row: RosterRow): RosterPlayer {
  return {
    id: row.id,
    ghinNumber: row.ghin_number,
    name: row.name,
    handicapIndex: row.handicap_index,
    gender: row.gender === 'F' ? 'F' : row.gender === 'M' ? 'M' : null,
    defaultTeeName: row.default_tee_name ?? null,
    hcapUpdatedAt: row.hcap_updated_at ?? null,
    ownerGhin: row.owner_ghin ?? null,
  };
}

// Load the whole roster into the cache (it's small — every player who has ever
// played). Pass the current viewer so the displayed roster is scoped to them.
export async function hydrateRoster(opts?: { viewerGhin?: number | null; isOwner?: boolean }): Promise<RosterPlayer[]> {
  if (opts) setRosterViewer(opts.viewerGhin ?? null, !!opts.isOwner);
  // select('*') is resilient to the owner_ghin column not existing yet (before
  // the scoping migration is applied): unknown columns simply aren't returned.
  const { data } = await supabase.from('players').select('*');
  if (data) {
    rosterCache.clear();
    for (const row of data as RosterRow[]) {
      rosterCache.set(row.id, rowToPlayer(row));
    }
  }
  return getRoster();
}

// The roster the current viewer may see (base + their own; owner sees all).
export function getRoster(): RosterPlayer[] {
  return Array.from(rosterCache.values()).filter(isVisibleToViewer).sort((a, b) => a.name.localeCompare(b.name));
}

// Instant client-side name filter over the cached roster.
export function searchRoster(query: string): RosterPlayer[] {
  const q = query.trim().toLowerCase();
  if (!q) return getRoster();
  return getRoster().filter((p) => p.name.toLowerCase().includes(q));
}

export function getRosterPlayerByGhin(ghinNumber: number): RosterPlayer | null {
  for (const p of rosterCache.values()) {
    if (p.ghinNumber === ghinNumber) return p;
  }
  return null;
}

// Upsert a player into the roster. If a player with the same GHIN already exists,
// reuse its id so the same person stays a single roster entry across games.
export async function upsertRosterPlayer(player: RosterPlayer): Promise<RosterPlayer> {
  const existing = player.ghinNumber != null ? getRosterPlayerByGhin(player.ghinNumber) : rosterCache.get(player.id) || null;
  // Preserve previously remembered fields when this call doesn't supply them
  // (e.g. a tee edit shouldn't wipe the handicap-refresh time, and vice versa).
  const defaultTeeName = player.defaultTeeName ?? existing?.defaultTeeName ?? null;
  const hcapUpdatedAt = player.hcapUpdatedAt ?? existing?.hcapUpdatedAt ?? null;
  // Ownership: preserve an existing entry's owner (an update must never reassign
  // it); for a brand-new entry, the app owner's adds go to the shared BASE roster
  // (null, visible to all) while a scoped organizer's adds are tagged to them.
  const ownerGhin: number | null = existing
    ? existing.ownerGhin ?? null
    : player.ownerGhin !== undefined
      ? player.ownerGhin
      : (viewerIsOwner ? null : viewerGhin);
  const merged: RosterPlayer = { ...player, id: existing?.id || player.id, defaultTeeName, hcapUpdatedAt, ownerGhin };
  rosterCache.set(merged.id, merged);

  const row = {
    id: merged.id,
    ghin_number: merged.ghinNumber,
    name: merged.name,
    handicap_index: merged.handicapIndex,
    gender: merged.gender,
    default_tee_name: merged.defaultTeeName,
    hcap_updated_at: merged.hcapUpdatedAt,
    owner_ghin: merged.ownerGhin,
    updated_at: new Date().toISOString(),
  };
  // Resilient write: if the owner_ghin column isn't present yet (scoping
  // migration not applied), retry without it so the save still persists —
  // scoping simply activates once the column exists. Decouples deploy ordering.
  (async () => {
    const { error } = await supabase.from('players').upsert(row);
    if (error && /owner_ghin/i.test(error.message)) {
      const { owner_ghin: _omit, ...rest } = row;
      await supabase.from('players').upsert(rest);
    }
  })();

  return merged;
}

// Re-pull the current handicap index from GHIN for every roster player that has a
// GHIN number. Returns how many players' index actually CHANGED. Stamps every
// successfully-checked player with the refresh time (even if unchanged) so
// staleness reflects "last checked". Failures per-player are skipped silently.
export async function refreshRosterHandicaps(token: string): Promise<number> {
  let changed = 0;
  const now = new Date().toISOString();
  const withGhin = getRoster().filter((p) => p.ghinNumber != null);
  for (const player of withGhin) {
    try {
      const res = await fetch('/api/ghin/golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ghin_number: player.ghinNumber }),
      });
      if (!res.ok) continue;
      const { golfer } = await res.json();
      const hi = parseGhinIndex(golfer?.handicap_index ?? golfer?.hi_value);
      if (hi === null) continue;
      if (hi !== player.handicapIndex) changed++;
      await upsertRosterPlayer({ ...player, handicapIndex: hi, hcapUpdatedAt: now });
    } catch {
      // network hiccup — skip this player, keep going
    }
  }
  return changed;
}

// The oldest "last refreshed" time among the VISIBLE roster's players with a
// GHIN number (null if none have ever been refreshed). Used to decide staleness
// (>24h). Scoped to what the viewer sees so it matches refreshRosterHandicaps.
export function getOldestHcapRefresh(): string | null {
  let oldest: string | null = null;
  for (const p of getRoster()) {
    if (p.ghinNumber == null) continue;
    if (!p.hcapUpdatedAt) return null; // an unrefreshed player => treat as stale
    if (oldest === null || p.hcapUpdatedAt < oldest) oldest = p.hcapUpdatedAt;
  }
  return oldest;
}
