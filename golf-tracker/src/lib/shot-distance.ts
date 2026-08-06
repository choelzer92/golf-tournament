// Distance engine for the solo round. A shot's distance is DERIVED, never
// stored: it's the great-circle distance from where you hit the shot (this
// shot's GPS) to where the ball came to rest — which is where you took the
// NEXT shot. So the last GPS shot on a hole (ball holed, or followed only by
// putts/chips-to-the-hole) has no measurable distance.
//
// Honest framing for the UI: a phone GPS fix is ~3-5m, so any single shot's
// number is approximate. The value is the AGGREGATE mean over many shots, which
// tightens as samples accumulate. We drop shots whose fix was too coarse
// (accuracy worse than ACCURACY_LIMIT_M) from the aggregate so noise doesn't
// pollute per-club averages.

import type { ClubId } from './clubs';
import type { HoleLog, Shot, SoloRound, GpsPoint } from './solo-round';

const EARTH_RADIUS_M = 6_371_000;
const M_TO_YARDS = 1.09361;

// Reject a GPS fix worse than this (meters) from distance aggregates.
export const ACCURACY_LIMIT_M = 10;

const toRad = (deg: number) => (deg * Math.PI) / 180;

// Great-circle distance between two GPS points, in yards.
export function haversineYards(a: GpsPoint, b: GpsPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  return meters * M_TO_YARDS;
}

// Per-shot distance for one hole, index-aligned with hole.shots. A shot's
// distance = distance from its own pos to the NEXT shot that has a pos. Shots
// without a pos (putts, GPS-denied) and the final positioned shot yield null.
export function shotDistances(hole: HoleLog): (number | null)[] {
  const shots = hole.shots;
  return shots.map((shot, i) => {
    if (!shot.pos) return null;
    const next = shots.slice(i + 1).find((s) => s.pos);
    if (!next || !next.pos) return null;
    return haversineYards(shot.pos, next.pos);
  });
}

export interface ClubStat {
  club: ClubId;
  n: number;        // samples used (accuracy-filtered)
  meanYds: number;
  stdYds: number;
  minYds: number;
  maxYds: number;
  dropped: number;  // measured shots excluded for coarse GPS
}

// Aggregate measured distances by club across one or more rounds. Only full
// swings with a real (accuracy-passing) distance count; chips and putts don't
// contribute to "how far I hit this club".
export function clubDistanceStats(rounds: SoloRound | SoloRound[]): ClubStat[] {
  const list = Array.isArray(rounds) ? rounds : [rounds];
  const samples = new Map<ClubId, number[]>();
  const dropped = new Map<ClubId, number>();

  for (const round of list) {
    for (const hole of round.holes) {
      const dists = shotDistances(hole);
      hole.shots.forEach((shot: Shot, i) => {
        if (shot.kind !== 'full' || !shot.club) return;
        const d = dists[i];
        if (d == null) return;
        if (!shot.pos || shot.pos.accuracy > ACCURACY_LIMIT_M) {
          dropped.set(shot.club, (dropped.get(shot.club) ?? 0) + 1);
          return;
        }
        const arr = samples.get(shot.club) ?? [];
        arr.push(d);
        samples.set(shot.club, arr);
      });
    }
  }

  const stats: ClubStat[] = [];
  for (const [club, arr] of samples) {
    const n = arr.length;
    const mean = arr.reduce((s, x) => s + x, 0) / n;
    const variance = n > 1 ? arr.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
    stats.push({
      club,
      n,
      meanYds: mean,
      stdYds: Math.sqrt(variance),
      minYds: Math.min(...arr),
      maxYds: Math.max(...arr),
      dropped: dropped.get(club) ?? 0,
    });
    dropped.delete(club);
  }
  // Clubs that had ONLY dropped (coarse-GPS) samples still worth surfacing as 0-n.
  for (const [club, d] of dropped) {
    stats.push({ club, n: 0, meanYds: 0, stdYds: 0, minYds: 0, maxYds: 0, dropped: d });
  }
  return stats;
}

// Strokes taken on a hole = every logged shot plus putts.
export function strokesForHole(hole: HoleLog): number {
  return hole.shots.length + hole.putts;
}

// Whether the player has logged anything on a hole yet.
export function holeStarted(hole: HoleLog): boolean {
  return hole.shots.length > 0 || hole.putts > 0;
}

// Total strokes across the round (only holes with something logged).
export function roundScore(round: SoloRound): number {
  return round.holes.reduce((s, h) => s + strokesForHole(h), 0);
}

// Strokes relative to par over the holes actually started.
export function roundToPar(round: SoloRound): number {
  return round.holes.reduce(
    (s, h) => (holeStarted(h) ? s + strokesForHole(h) - h.par : s),
    0,
  );
}
