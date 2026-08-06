// Solo round — the data spine for the golf trainer (Layer 1). A single player
// walks the course and logs each shot (club + shape + GPS). Shot-to-shot GPS
// deltas yield real per-club distances (see shot-distance.ts).
//
// Persistence mirrors pool-game.ts: an in-memory cache + a JSONB blob in the
// `solo_rounds` table. There is NO realtime (a solo round has one author) and
// NO per-hole side table — the whole round, shots included, lives in the blob.
//
// Because a round is logged on-course where signal is unreliable, the active
// round is ALSO written to localStorage synchronously (see saveRoundLocal /
// loadRoundLocal) so a dead cell signal never loses shots; Supabase catches up
// when the network returns.

import { supabase } from './supabase';
import type { CourseSelection } from './game-state';
import type { ClubId, ShapeTag } from './clubs';

export type ShotKind = 'full' | 'chip' | 'putt';
export type ProxBucket = '0-5' | '6-10' | '11-15' | '16-20' | '20+';

export interface GpsPoint {
  lat: number;
  lng: number;
  accuracy: number; // meters (from the Geolocation API)
  ts: number;       // epoch ms when captured
}

export interface Shot {
  id: string;
  kind: ShotKind;
  club?: ClubId;          // absent for putts (implicit Putter)
  shape: ShapeTag[];
  pos?: GpsPoint;         // hit location; absent for putts or GPS-denied
  targetYds?: number;     // aimed distance, said at address ("160 to the pin")
  proximityFeet?: number; // how close you ended up — said when you walk up
  proximity?: ProxBucket; // bucket derived from proximityFeet (kept for display/stats)
  raw?: string;           // original voice transcript, for later re-parse
  // distance is DERIVED (this shot's pos → next shot's pos), never stored.
}

export interface HoleLog {
  hole: number;
  par: number;
  shots: Shot[];
  putts: number;
}

export interface SoloRound {
  id: string;
  createdByGhin?: number;
  playerName?: string;
  handicapIndex?: number | null;
  course: CourseSelection; // selectedTeeId is the tee played
  teeSetId: number;
  holesPlaying: '18' | 'front9' | 'back9';
  startedAt: string;       // ISO
  status: 'playing' | 'finished';
  holes: HoleLog[];
  voiceLog?: VoiceLogEntry[]; // raw transcripts for offline grammar tuning
  updatedAt: string;       // ISO — used to reconcile local vs server
}

export const PROX_BUCKETS: ProxBucket[] = ['0-5', '6-10', '11-15', '16-20', '20+'];

// Map an exact proximity in feet to its display bucket.
export function feetToBucket(feet: number): ProxBucket {
  if (feet <= 5) return '0-5';
  if (feet <= 10) return '6-10';
  if (feet <= 15) return '11-15';
  if (feet <= 20) return '16-20';
  return '20+';
}

// One captured voice utterance + what the local parser made of it. Stored on the
// round so the transcripts can be exported and analyzed offline to tune the
// free, local grammar (no runtime AI). See shot-voice.ts.
export interface VoiceLogEntry {
  ts: string;            // ISO
  hole: number;
  transcript: string;
  parsed: string;        // compact JSON of the ParsedShot result
}

const VOICE_LOG_CAP = 500; // keep the blob bounded

export function appendVoiceLog(round: SoloRound, entry: VoiceLogEntry): SoloRound {
  const log = [...(round.voiceLog ?? []), entry].slice(-VOICE_LOG_CAP);
  return { ...round, voiceLog: log };
}

// Which hole numbers a round covers, given holesPlaying.
export function roundHoleNumbers(holesPlaying: SoloRound['holesPlaying']): number[] {
  if (holesPlaying === 'front9') return [1, 2, 3, 4, 5, 6, 7, 8, 9];
  if (holesPlaying === 'back9') return [10, 11, 12, 13, 14, 15, 16, 17, 18];
  return Array.from({ length: 18 }, (_, i) => i + 1);
}

// The tee actually played (falls back to the first tee if the id is stale).
export function playedTee(round: SoloRound) {
  const tees = round.course.teeSets;
  return tees.find((t) => String(t.id) === String(round.teeSetId)) ?? tees[0];
}

// Build the empty per-hole logs for a new round from its course + tee + holes.
export function buildEmptyHoles(course: CourseSelection, teeSetId: number, holesPlaying: SoloRound['holesPlaying']): HoleLog[] {
  const tee = course.teeSets.find((t) => String(t.id) === String(teeSetId)) ?? course.teeSets[0];
  const parByHole = new Map<number, number>();
  (tee?.holes ?? []).forEach((h) => parByHole.set(h.number, h.par));
  return roundHoleNumbers(holesPlaying).map((n) => ({
    hole: n,
    par: parByHole.get(n) ?? 4,
    shots: [],
    putts: 0,
  }));
}

// ---------------------------------------------------------------------------
// Supabase persistence — mirrors pool-game.ts (cache + JSONB blob upsert).
// ---------------------------------------------------------------------------

const soloRoundCache = new Map<string, SoloRound>();

export function saveSoloRound(round: SoloRound) {
  soloRoundCache.set(round.id, round);
  supabase.from('solo_rounds').upsert({
    id: round.id,
    data: round,
    updated_at: round.updatedAt,
  }).then();
}

export function loadSoloRound(id: string): SoloRound | null {
  return soloRoundCache.get(id) || null;
}

export async function fetchSoloRound(id: string): Promise<SoloRound | null> {
  const cached = soloRoundCache.get(id);
  const { data } = await supabase.from('solo_rounds').select('data').eq('id', id).single();
  if (data) {
    const round = data.data as SoloRound;
    soloRoundCache.set(id, round);
    return round;
  }
  return cached || null;
}

export async function hydrateSoloRounds(): Promise<void> {
  const { data } = await supabase.from('solo_rounds').select('id, data');
  if (data) {
    for (const row of data) {
      soloRoundCache.set(row.id, row.data as SoloRound);
    }
  }
}

export interface SoloRoundListItem {
  id: string;
  courseName: string;
  status: SoloRound['status'];
  holesPlaying: SoloRound['holesPlaying'];
  startedAt: string;
  shotCount: number;
  createdByGhin?: number;
}

export function getSoloRoundList(): SoloRoundListItem[] {
  const list: SoloRoundListItem[] = [];
  for (const r of soloRoundCache.values()) {
    list.push({
      id: r.id,
      courseName: r.course.courseName,
      status: r.status,
      holesPlaying: r.holesPlaying,
      startedAt: r.startedAt,
      shotCount: r.holes.reduce((s, h) => s + h.shots.length + h.putts, 0),
      createdByGhin: r.createdByGhin,
    });
  }
  return list.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getSoloRoundListForGhin(ghinNumber: number): SoloRoundListItem[] {
  return getSoloRoundList().filter((r) => r.createdByGhin === ghinNumber);
}

// ---------------------------------------------------------------------------
// Local-first storage — synchronous, offline-safe. The active round screen
// writes here on every mutation and debounces the Supabase upsert separately.
// ---------------------------------------------------------------------------

const localKey = (id: string) => `solo_round_${id}`;

export function saveRoundLocal(round: SoloRound) {
  try {
    localStorage.setItem(localKey(round.id), JSON.stringify(round));
  } catch {
    /* storage unavailable (quota / private mode) — Supabase still has it */
  }
}

export function loadRoundLocal(id: string): SoloRound | null {
  try {
    const raw = localStorage.getItem(localKey(id));
    return raw ? (JSON.parse(raw) as SoloRound) : null;
  } catch {
    return null;
  }
}

export function clearRoundLocal(id: string) {
  try {
    localStorage.removeItem(localKey(id));
  } catch {
    /* ignore */
  }
}

// Reconcile a local copy against a server copy: newer updatedAt wins. Used on
// load so a round logged offline isn't clobbered by a stale server blob (and
// vice-versa after syncing on another device).
export function newerRound(a: SoloRound | null, b: SoloRound | null): SoloRound | null {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}
