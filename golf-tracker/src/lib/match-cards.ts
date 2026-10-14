import type { Player, CourseSelection } from '@/lib/game-state';
import {
  balanceTeamsWithLocks,
  balanceTeamsWithCaptains,
  pickCaptains,
  getPoolPlayingHandicap,
  sortPlayerIdsByHcap,
  orderPlayerIdsWithCaptain,
} from '@/lib/pool-game';

// The match cards (§5.de, on the teams step since §5.dg) and the teams step's own buttons share one
// deal and one swap, so the cards always show what the teams step builds. Pure: no storage,
// no randomness.

export interface DealOptions {
  /** Null when no course is chosen: every Handicap Index stands in. */
  course: CourseSelection | null;
  allowance: number;
  basis: 'course' | 'index';
  nine: 'front9' | 'back9' | null;
  /** Build around captains (the lowest handicaps anchor a team each). */
  captains: boolean;
  /** Pinned captains by team slot; empty slots are auto-picked. */
  captainByTeam?: (string | undefined)[];
  excludeCaptains: boolean;
  locks: string[][];
}

export interface DealtTeam { playerIds: string[]; captainId?: string }

/** "Even them out": the field balanced into `numTeams` teams, each listed low → high (captain first). */
export function dealBalancedTeams(players: Player[], numTeams: number, o: DealOptions): DealtTeam[] {
  const hcapOf = (p: Player) => (o.course ? getPoolPlayingHandicap(p, o.course, o.allowance, o.basis, o.nine) : (p.handicapIndex ?? 0));
  if (!o.captains) {
    return balanceTeamsWithLocks(players, numTeams, hcapOf, o.locks).map((ids) => ({
      playerIds: sortPlayerIdsByHcap(ids, players, o.course, o.allowance, o.basis),
    }));
  }
  const pinned = Array.from({ length: numTeams }, (_, i) => o.captainByTeam?.[i] || undefined);
  const captainByTeam = pinned.some(Boolean)
    ? pinned
    : (() => {
      const picks = pickCaptains(players, o.course, o.allowance, numTeams, o.locks, o.basis);
      return Array.from({ length: numTeams }, (_, i) => picks[i] || undefined);
    })();
  return balanceTeamsWithCaptains(players, numTeams, hcapOf, captainByTeam, o.locks, o.excludeCaptains).map((ids, i) => {
    const captainId = captainByTeam[i] && ids.includes(captainByTeam[i]!)
      ? captainByTeam[i]
      : sortPlayerIdsByHcap(ids, players, o.course, o.allowance, o.basis)[0];
    return { playerIds: orderPlayerIdsWithCaptain(ids, captainId, players, o.course, o.allowance, o.basis), captainId };
  });
}

/**
 * Tap-to-swap (§5.de): players `a` and `b` trade places in every list at once (money teams, tee
 * groups, stored singles). Positions are kept, so a tee group's match order (which IS its pairing)
 * stays valid, and each team keeps its size. A team whose captain was swapped out gets
 * `captainFor(newIds)`.
 */
export function swapPlayers<T extends { playerIds: string[]; singles?: string[][]; captainId?: string }>(
  lists: T[], a: string, b: string, captainFor?: (ids: string[]) => string | undefined,
): T[] {
  if (a === b) return lists;
  const swap = (id: string) => (id === a ? b : id === b ? a : id);
  return lists.map((t) => {
    if (!t.playerIds.includes(a) && !t.playerIds.includes(b)) return t;
    const playerIds = t.playerIds.map(swap);
    const next: T = { ...t, playerIds };
    if (t.singles) next.singles = t.singles.map((pair) => pair.map(swap));
    if (t.captainId && !playerIds.includes(t.captainId)) next.captainId = captainFor?.(playerIds);
    return next;
  });
}
