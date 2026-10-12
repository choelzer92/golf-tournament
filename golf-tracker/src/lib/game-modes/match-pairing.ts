// Who meets whom in a head-to-head team game (F-037, §5.co), read from the tee sheet. A LEAF module
// (no pool-game import), so the stroke map in pool-game.ts can take the low per match (T4) without
// an import cycle. The engine and the wizard reach it through matches.ts.

import type { SettingsBag } from './types';

export interface MatchUnit { teamId: string; playerIds: string[] }
export interface Match { id: string; units: [MatchUnit, MatchUnit] }

/** Players a side in each match; 0 = matches off (absent, '0', or junk). */
export function matchSizeOf(settings: SettingsBag): number {
  const n = parseFloat(String(settings.matchSize ?? 0));
  return isNaN(n) ? 0 : Math.max(0, Math.floor(n));
}

/**
 * The matches a game's tee sheet holds at `size` players a side. Inside a foursome holding two
 * teams, each team's players there are cut into units of `size` and paired in tee-sheet order (A's
 * first unit v B's first). A tee group holding ONE team makes units for a match ACROSS groups
 * (foursome v foursome), paired with the other team's in order — two teams only.
 *
 * A shape that can't be paired is a PROBLEM, worded for the organizer: it must never be stored
 * (§5.ac, Craig 2026-10-09 — "should not be possible"), so every surface that changes teams, tee
 * groups or the match size asks `matchShapeProblem` first.
 */
export function pairMatches(
  teams: { id: string; playerIds: string[] }[], teeGroups: string[][], size: number,
): { matches: Match[] } | { problem: string } {
  if (!(size >= 1)) return { problem: 'Head-to-head matches are off.' };
  const teamIdx = new Map<string, number>();
  teams.forEach((t, i) => t.playerIds.forEach((id) => teamIdx.set(id, i)));
  const each = size === 1 ? 'one player' : `${size} players`;

  const pairs: [MatchUnit, MatchUnit][] = [];
  const across = new Map<number, MatchUnit[]>();
  for (const [g, group] of teeGroups.entries()) {
    const byTeam = new Map<number, string[]>();
    for (const id of group) {
      const t = teamIdx.get(id);
      if (t === undefined) return { problem: `Everyone in Group ${g + 1} needs a team.` };
      byTeam.set(t, [...(byTeam.get(t) ?? []), id]);
    }
    const unitsOf = (t: number): MatchUnit[] | null => {
      const ids = byTeam.get(t)!;
      if (ids.length % size !== 0) return null;
      return Array.from({ length: ids.length / size }, (_, k) => ({ teamId: teams[t].id, playerIds: ids.slice(k * size, (k + 1) * size) }));
    };
    const present = [...byTeam.keys()].sort((x, y) => x - y);
    if (present.length === 1) {
      const u = unitsOf(present[0]);
      if (!u) return { problem: `Group ${g + 1} can't be split into matches of ${each} a side.` };
      across.set(present[0], [...(across.get(present[0]) ?? []), ...u]);
    } else if (present.length === 2) {
      const ua = unitsOf(present[0]);
      const ub = unitsOf(present[1]);
      if (!ua || !ub || ua.length !== ub.length) {
        return { problem: `Group ${g + 1} needs the same number of players from each team, ${each} a match.` };
      }
      ua.forEach((u, k) => pairs.push([u, ub[k]]));
    } else {
      return { problem: `Group ${g + 1} has players from ${present.length} teams; a match is between two.` };
    }
  }
  if (across.size > 0) {
    const keys = [...across.keys()].sort((x, y) => x - y);
    const [ua, ub] = [across.get(keys[0])!, across.get(keys[1] ?? -1) ?? []];
    if (keys.length !== 2 || ua.length !== ub.length) {
      return { problem: 'Groups holding one team need a group from the other team to play.' };
    }
    ua.forEach((u, k) => pairs.push([u, ub[k]]));
  }
  if (pairs.length === 0) return { problem: 'No matches to play.' };
  return { matches: pairs.map((units, i) => ({ id: `M${i + 1}`, units })) };
}

export function matchesOf(teams: { id: string; playerIds: string[] }[], teeGroups: string[][], size: number): Match[] | null {
  const r = pairMatches(teams, teeGroups, size);
  return 'matches' in r ? r.matches : null;
}

