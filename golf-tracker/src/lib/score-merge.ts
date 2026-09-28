// Per-cell reconciliation of a tee group's scores (F-063 option A, approved §5.bm Q4).
//
// A pool game keeps one `game_scores` row per tee group, written whole, last write wins.
// That is safe with one scorer per group (§5l). When a second phone helps, each phone's
// whole-row write erases the cells the other entered. This module is the client-side
// mitigation: reconcile cell by cell so two phones CONVERGE instead of flip-flopping.
//
//   - A cell this device changed and the server has not yet echoed back ("dirty") keeps
//     its local value — a stale remote row must not undo a tap.
//   - Every other cell takes the remote value when the server has one.
//   - A local cell the server lacks is KEPT (never lose a score, §5.ap). A deliberate clear
//     on another phone therefore does not propagate; scores are never cleared from the
//     card today, so nothing relies on that.
//   - A dirty cell is CONFIRMED (no longer dirty) when the remote value equals ours.
//
// This is not the fix — option C (per-cell rows) is. It turns silent divergence into
// eventual convergence in the common case; the race where one phone's whole-row write
// drops cells it has not yet received still exists. Pure: no I/O, no time.

import type { GameScore } from './game-state';

export function scoreCellKey(playerId: string, hole: number): string {
  return `${playerId}_${hole}`;
}

export interface CellMerge {
  merged: GameScore[];
  /** False when `merged` is cell-for-cell identical to `local` — callers skip the state update. */
  changed: boolean;
  /** Dirty cells the remote row now agrees with; the caller clears them from its dirty set. */
  confirmed: string[];
}

export function mergeScoreCells(
  local: GameScore[],
  remote: GameScore[],
  dirty: ReadonlySet<string>,
): CellMerge {
  const localBy = new Map<string, GameScore>();
  for (const s of local) localBy.set(scoreCellKey(s.playerId, s.hole), s);
  const remoteBy = new Map<string, GameScore>();
  for (const s of remote) remoteBy.set(scoreCellKey(s.playerId, s.hole), s);

  const merged: GameScore[] = [];
  const confirmed: string[] = [];
  let changed = false;

  // Local order first so the array is stable for React keys; new remote cells append.
  for (const [key, mine] of localBy) {
    const theirs = remoteBy.get(key);
    if (dirty.has(key)) {
      if (theirs && theirs.grossScore === mine.grossScore) confirmed.push(key);
      merged.push(mine);
    } else if (theirs) {
      if (theirs.grossScore !== mine.grossScore) changed = true;
      merged.push(theirs.grossScore === mine.grossScore ? mine : { ...theirs });
    } else {
      merged.push(mine);
    }
  }
  for (const [key, theirs] of remoteBy) {
    if (localBy.has(key)) continue;
    merged.push({ ...theirs });
    changed = true;
  }
  return { merged, changed, confirmed };
}
