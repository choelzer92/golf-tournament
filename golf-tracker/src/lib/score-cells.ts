// PER-CELL SCORES (F-063 option C, DECISIONS §5.ce / §5.dn). Pure: no I/O, no clock.
//
// A score is stored as ONE ROW per (matchup, player, hole) in `score_cells`, not as a whole card
// in one `game_scores` blob. A save sends only the cells it changed, so two phones can no longer
// erase each other's taps by each writing the whole card (the race opt A only mitigated).
//
// THE CONFLICT RULE (§5.dn, Craig: "A"): when two phones change the SAME cell, the later TAP wins,
// by the phone's tap time, even if it reaches the server second (a dead spot). A correction made
// on the course is never undone by an old tap catching up. The SQL RPC `upsert_score_cells`
// applies exactly `resolveCellWrite`; the sandbox backend calls this function, so both agree.
//
// A cleared cell is a TOMBSTONE (gross NULL), never a DELETE: realtime can't filter deletes by
// matchup, and a tombstone also carries its tap time, so a stale tap can't resurrect it.
//
// The rest of the app still reads `GameScore[]` per matchup: `cellsToScores` builds it at the
// storage boundary, so the compute layer and ~25 readers are untouched.

import type { GameScore } from './game-state';

/** One cell written by a client. `grossScore` null = cleared. `tappedAt` = ISO time of the tap. */
export interface CellWrite {
  matchupId: string;
  playerId: string;
  hole: number;
  grossScore: number | null;
  tappedAt: string;
}

/** A `score_cells` row as the database stores it. */
export interface ScoreCellRow {
  matchup_id: string;
  player_id: string;
  hole: number;
  gross_score: number | null;
  tapped_at: string;
  updated_at?: string;
}

export function cellKey(c: { matchupId: string; playerId: string; hole: number }): string {
  return `${c.matchupId}|${c.playerId}|${c.hole}`;
}

const cardKey = (s: { playerId: string; hole: number }) => `${s.playerId}_${s.hole}`;

/**
 * Should `incoming` replace what's stored? Yes when nothing is stored, or when the incoming tap is
 * not OLDER than the stored one (§5.dn A; an exact tie takes the incoming, so a resend is harmless).
 * `audit` is set when the visible score actually changes, for `score_audit`.
 */
export function resolveCellWrite(
  stored: { grossScore: number | null; tappedAt: string } | null,
  incoming: { grossScore: number | null; tappedAt: string },
): { apply: boolean; audit: { oldScore: number | null; newScore: number | null } | null } {
  if (stored && Date.parse(stored.tappedAt) > Date.parse(incoming.tappedAt)) return { apply: false, audit: null };
  const oldScore = stored?.grossScore ?? null;
  const changed = oldScore !== incoming.grossScore;
  return { apply: true, audit: changed ? { oldScore, newScore: incoming.grossScore } : null };
}

/** One matchup's rows as the card the app reads (cleared cells dropped), in hole then player order. */
export function cellsToScores(rows: Pick<ScoreCellRow, 'player_id' | 'hole' | 'gross_score'>[]): GameScore[] {
  return rows
    .filter((r) => r.gross_score !== null && r.gross_score !== undefined)
    .map((r) => ({ playerId: r.player_id, hole: r.hole, grossScore: r.gross_score as number }))
    .sort((a, b) => a.hole - b.hole || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
}

/**
 * The cells a save must send: every score in `next` that is new or different from `baseline` (what
 * the server last had). Never a clear: the card never clears a score (score-merge.ts), and deriving
 * clears from ABSENCE would erase a cell another phone added that this one hasn't received yet.
 * `ownedPlayerIds` (tournament split scoring) limits the save to the players this phone scores.
 */
export function changedCells(
  matchupId: string, baseline: GameScore[], next: GameScore[], tappedAt: string, ownedPlayerIds?: string[],
): CellWrite[] {
  const before = new Map(baseline.map((s) => [cardKey(s), s.grossScore]));
  const owned = ownedPlayerIds && ownedPlayerIds.length > 0 ? new Set(ownedPlayerIds) : null;
  const out: CellWrite[] = [];
  const seen = new Set<string>();
  for (const s of next) {
    const k = cardKey(s);
    if (seen.has(k) || (owned && !owned.has(s.playerId))) continue;
    seen.add(k);
    if (before.get(k) !== s.grossScore) {
      out.push({ matchupId, playerId: s.playerId, hole: s.hole, grossScore: s.grossScore, tappedAt });
    }
  }
  return out;
}

/**
 * A deliberate REPLACE of a card (a rebalance emptying a group, a reshape moving a player, a
 * tournament reset): the changed cells plus a tombstone for every cell `known` holds that `next`
 * doesn't. Only for callers that mean "this card is now exactly this".
 */
export function replaceCells(matchupId: string, known: GameScore[], next: GameScore[], tappedAt: string): CellWrite[] {
  const keep = new Set(next.map(cardKey));
  const cleared = new Set<string>();
  const tombstones: CellWrite[] = [];
  for (const s of known) {
    const k = cardKey(s);
    if (keep.has(k) || cleared.has(k)) continue;
    cleared.add(k);
    tombstones.push({ matchupId, playerId: s.playerId, hole: s.hole, grossScore: null, tappedAt });
  }
  return [...changedCells(matchupId, known, next, tappedAt), ...tombstones];
}

/** The card with pending (not yet acknowledged) writes laid over it, so a queued tap never vanishes. */
export function overlayPending(scores: GameScore[], pending: CellWrite[]): GameScore[] {
  if (pending.length === 0) return scores;
  const by = new Map(scores.map((s) => [cardKey(s), s]));
  for (const p of pending) {
    if (p.grossScore === null) by.delete(cardKey(p));
    else by.set(cardKey(p), { playerId: p.playerId, hole: p.hole, grossScore: p.grossScore });
  }
  return [...by.values()].sort((a, b) => a.hole - b.hole || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
}
