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
}

interface RosterRow {
  id: string;
  ghin_number: number | null;
  name: string;
  handicap_index: number | null;
  gender: string | null;
  default_tee_name: string | null;
  hcap_updated_at: string | null;
}

const rosterCache = new Map<string, RosterPlayer>();

function rowToPlayer(row: RosterRow): RosterPlayer {
  return {
    id: row.id,
    ghinNumber: row.ghin_number,
    name: row.name,
    handicapIndex: row.handicap_index,
    gender: row.gender === 'F' ? 'F' : row.gender === 'M' ? 'M' : null,
    defaultTeeName: row.default_tee_name ?? null,
    hcapUpdatedAt: row.hcap_updated_at ?? null,
  };
}

// Load the whole roster into the cache (it's small — every player who has ever played).
export async function hydrateRoster(): Promise<RosterPlayer[]> {
  const { data } = await supabase.from('players').select('id, ghin_number, name, handicap_index, gender, default_tee_name, hcap_updated_at');
  if (data) {
    rosterCache.clear();
    for (const row of data as RosterRow[]) {
      rosterCache.set(row.id, rowToPlayer(row));
    }
  }
  return getRoster();
}

export function getRoster(): RosterPlayer[] {
  return Array.from(rosterCache.values()).sort((a, b) => a.name.localeCompare(b.name));
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
  const merged: RosterPlayer = { ...player, id: existing?.id || player.id, defaultTeeName, hcapUpdatedAt };
  rosterCache.set(merged.id, merged);

  supabase.from('players').upsert({
    id: merged.id,
    ghin_number: merged.ghinNumber,
    name: merged.name,
    handicap_index: merged.handicapIndex,
    gender: merged.gender,
    default_tee_name: merged.defaultTeeName,
    hcap_updated_at: merged.hcapUpdatedAt,
    updated_at: new Date().toISOString(),
  }).then();

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

// The oldest "last refreshed" time among roster players with a GHIN number
// (null if none have ever been refreshed). Used to decide staleness (>24h).
export function getOldestHcapRefresh(): string | null {
  let oldest: string | null = null;
  for (const p of rosterCache.values()) {
    if (p.ghinNumber == null) continue;
    if (!p.hcapUpdatedAt) return null; // an unrefreshed player => treat as stale
    if (oldest === null || p.hcapUpdatedAt < oldest) oldest = p.hcapUpdatedAt;
  }
  return oldest;
}
