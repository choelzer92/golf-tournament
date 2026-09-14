import type { CourseSelection, Player } from '@/lib/game-state';
import { type PoolTeam, sortPlayerIdsByHcap, groupShapesFor, dealBalancedIntoShape, TEE_GROUP_SHAPE_OPTS } from '@/lib/pool-game';

export function getToken() {
  return sessionStorage.getItem('ghin_token');
}

// Pot legs entered in DOLLARS (front/back/overall/junk), held as strings so the
// inputs stay editable. Auto-filled from the team-count table but overridable.
export interface PotDollars {
  front: string;
  back: string;
  overall: string;
  junk: string;
}

export function legDollarsToStrings(d: { front: number; back: number; overall: number; junk: number }): PotDollars {
  return { front: String(d.front), back: String(d.back), overall: String(d.overall), junk: String(d.junk) };
}

// F-045: junk's dollars fold into OVERALL when the game plays no bonuses —
// string-field twin of pool-game's foldJunkIntoOverall, total preserved.
export function foldJunkStrings(d: PotDollars): PotDollars {
  const j = parseFloat(d.junk) || 0;
  const o = parseFloat(d.overall) || 0;
  return { ...d, overall: String(o + j), junk: '0' };
}

export function potDollarsTotal(d: PotDollars): number {
  return (parseFloat(d.front) || 0) + (parseFloat(d.back) || 0) + (parseFloat(d.overall) || 0) + (parseFloat(d.junk) || 0);
}

export function proposePlayingGroups(
  players: Player[],
  course: CourseSelection | null,
  allowance: number,
  basis: 'course' | 'index',
): PoolTeam[] {
  const shape = groupShapesFor(players.length, TEE_GROUP_SHAPE_OPTS)[0];
  const ids = sortPlayerIdsByHcap(players.map((p) => p.id), players, course, allowance, basis);
  // No shape fits (1 player, or a count the tee rules can't express): keep everyone together
  // rather than invent a split. The step isn't shown in that case anyway.
  if (!shape) {
    return [{ id: crypto.randomUUID(), name: 'Group', playerIds: ids, matchupId: crypto.randomUUID(), teeTime: '' }];
  }
  // Snake-deal so each group gets a spread of handicaps — the same "even them out" intent as the
  // pool's balance, without the optimizer. See dealBalancedIntoShape for why it must snake rather
  // than go round-robin (round-robin gave group 1 every odd-ranked player: 32 vs 40 at eight).
  return dealBalancedIntoShape(ids, shape).map((playerIds, i) => ({
    id: crypto.randomUUID(),
    name: `Group ${i + 1}`,
    playerIds,
    matchupId: crypto.randomUUID(),
    teeTime: '',
  }));
}

// Visual "who's playing from where" step: players grouped by their assigned tee,
// tap a player to move them to a different (same-gender) tee. Purely for setting/
// reviewing tees before forming teams — tees remain editable in the Teams step too.
