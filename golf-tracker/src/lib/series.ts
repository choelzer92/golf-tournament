// A Series: several ordinary games played as one EVENT (DECISIONS.md §5.cr, §5.cu, §5.cv).
//
// On screen it's an "Event"; in code it's a Series. There's no series table: each game
// carries a `series` stamp inside its own data blob, and an event is simply the set of
// games that share `series.id`. Creating an event creates its first round.
//
// The member is a ROUND (one game), never "a day": a day can hold two rounds (36 holes),
// and one round can carry two games (§5.cp). Each counts once. Rounds are ordered by
// their play date, then by `seq` (the order they were added) within a date.
//
// Money: each round settles on its own engine, unchanged. The event's TOTAL is the sum
// of each FINISHED round's per-player net (the F-068 split, stats-ledger perPlayerNets).
// A live round is shown separately as PROJECTED and never enters TOTAL or the settle-up
// (§5.cv Q5). A live round with no score yet is NOT STARTED, like a setup one (§5.cw a). A player who sits a round out simply has no net in it.
//
// Pure: no persistence, no clock. The caller supplies each round's nets.

import { settleUp, type PlayerRollup, type SettlementTransfer } from './stats-ledger';

export type SeriesRollup = 'money' | 'points';

/** Stamped on every game that belongs to an event. */
export interface SeriesStamp {
  id: string;
  name: string;
  rollup: SeriesRollup;   // 'points' (Ryder Cup) is reserved; only 'money' is computed today
  seq: number;            // 1-based order the round was added; tiebreak within a date
  date: string;           // the round's PLAY date, YYYY-MM-DD (a round can be set up a day ahead)
}

/** The minimum of a game this module reads. PoolGame satisfies it. */
export interface SeriesGameLike {
  id: string;
  name: string;
  status: 'setup' | 'active' | 'completed';
  series?: SeriesStamp;
}

/** One round's money, as the caller computed it (perPlayerNets). */
export interface SeriesRoundInput {
  gameId: string;
  gameName: string;
  date: string;
  seq: number;
  status: 'setup' | 'active' | 'completed';
  /** Any score posted yet? A live round with none is NOT STARTED (§5.cw a): a round set up a
   *  day ahead saves as active. Absent = assume scored. */
  scored?: boolean;
  nets: { playerId: string; playerName: string; net: number }[];
}

export type SeriesRoundState = 'final' | 'projected' | 'upcoming';

export interface SeriesRound {
  gameId: string;
  gameName: string;
  date: string;
  label: string;          // "R1", "R2", … in play order
  state: SeriesRoundState;
}

export interface SeriesRow {
  playerId: string;
  playerName: string;
  /** gameId → this player's net in that round; absent = didn't play it. */
  byRound: Record<string, number>;
  total: number;          // finished rounds only: real money
  projected: number;      // total + live rounds "if it ended now"
  roundsPlayed: number;   // finished rounds this player was in
}

export interface SeriesStandings {
  rounds: SeriesRound[];
  /** Rounds grouped under their date, in order, for the column headers. */
  dates: { date: string; gameIds: string[] }[];
  rows: SeriesRow[];      // richest TOTAL first; projected breaks ties
  /** Who pays whom for the whole event, on TOTAL (finished rounds only). */
  settle: SettlementTransfer[];
  hasProjected: boolean;  // any live round with money on it
}

const byPlayOrder = (a: { date: string; seq: number }, b: { date: string; seq: number }) =>
  a.date.localeCompare(b.date) || a.seq - b.seq;

/** The games in one event, in play order. Games without the stamp are never members. */
export function seriesGames<G extends SeriesGameLike>(games: G[], seriesId: string): G[] {
  return games
    .filter((g) => g.series?.id === seriesId)
    .sort((a, b) => byPlayOrder(a.series!, b.series!));
}

/** Every event among these games: id → its rounds in play order. */
export function groupBySeries<G extends SeriesGameLike>(games: G[]): Map<string, G[]> {
  const out = new Map<string, G[]>();
  for (const g of games) {
    if (!g.series) continue;
    out.set(g.series.id, [...(out.get(g.series.id) ?? []), g]);
  }
  for (const [id, list] of out) out.set(id, list.sort((a, b) => byPlayOrder(a.series!, b.series!)));
  return out;
}

/** The stamp for the next round added to an event. */
export function nextRoundStamp(rounds: SeriesGameLike[], date: string): SeriesStamp {
  const stamps = rounds.map((r) => r.series).filter((s): s is SeriesStamp => !!s);
  if (stamps.length === 0) throw new Error('nextRoundStamp: no rounds in this event');
  const first = stamps[0];
  const seq = Math.max(...stamps.map((s) => s.seq)) + 1;
  // The event's name can be renamed on any round; the latest-added round holds the current one.
  const latest = stamps.reduce((a, b) => (b.seq > a.seq ? b : a));
  return { id: first.id, name: latest.name, rollup: first.rollup, seq, date };
}

/** YYYY-MM-DD plus `days`, calendar-safe (no time zone involved: noon UTC never crosses a date). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Sat Oct 17" for a YYYY-MM-DD: the event's column headers and hints. */
export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** An event as a picker lists it: name, how many rounds, and the date the next one defaults to. */
export interface SeriesSummary {
  id: string;
  name: string;
  roundCount: number;
  lastDate: string;
  nextDate: string;       // the day after the latest round; a 36-hole day changes it by hand
}

export function seriesSummaries(games: SeriesGameLike[]): SeriesSummary[] {
  const out: SeriesSummary[] = [];
  for (const [id, rounds] of groupBySeries(games)) {
    const last = rounds[rounds.length - 1].series!;
    const latest = rounds.reduce((a, b) => (b.series!.seq > a.series!.seq ? b : a)).series!;
    out.push({ id, name: latest.name, roundCount: rounds.length, lastDate: last.date, nextDate: addDays(last.date, 1) });
  }
  return out.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

/** Where a round stands: finished, live with scores, or not started (setup, or live with none). */
export function roundState(r: { status: SeriesRoundInput['status']; scored?: boolean }): SeriesRoundState {
  if (r.status === 'completed') return 'final';
  return r.status === 'active' && r.scored !== false ? 'projected' : 'upcoming';
}

/** The event's money standings. */
export function seriesStandings(inputs: SeriesRoundInput[]): SeriesStandings {
  const ordered = [...inputs].sort(byPlayOrder);

  const rounds: SeriesRound[] = ordered.map((r, i) => ({
    gameId: r.gameId,
    gameName: r.gameName,
    date: r.date,
    label: `R${i + 1}`,
    state: roundState(r),
  }));

  const dates: { date: string; gameIds: string[] }[] = [];
  for (const r of ordered) {
    const last = dates[dates.length - 1];
    if (last && last.date === r.date) last.gameIds.push(r.gameId);
    else dates.push({ date: r.date, gameIds: [r.gameId] });
  }

  const rowsById = new Map<string, SeriesRow>();
  let hasProjected = false;
  for (const r of ordered) {
    // An upcoming round has no money yet. It's a column, but nobody's played it.
    if (roundState(r) === 'upcoming') continue;
    const final = r.status === 'completed';
    for (const n of r.nets) {
      const row = rowsById.get(n.playerId) ?? {
        playerId: n.playerId,
        playerName: n.playerName,
        byRound: {},
        total: 0,
        projected: 0,
        roundsPlayed: 0,
      };
      row.byRound[r.gameId] = (row.byRound[r.gameId] ?? 0) + n.net;
      row.projected += n.net;
      if (final) {
        row.total += n.net;
        row.roundsPlayed += 1;
      } else if (n.net !== 0) {
        hasProjected = true;
      }
      if (n.playerName && n.playerName !== '?') row.playerName = n.playerName;
      rowsById.set(n.playerId, row);
    }
  }

  const rows = Array.from(rowsById.values()).sort(
    (a, b) => b.total - a.total || b.projected - a.projected,
  );
  const settle = settleUp(
    rows.map<PlayerRollup>((r) => ({
      playerId: r.playerId,
      playerName: r.playerName,
      gamesPlayed: r.roundsPlayed,
      net: r.total,
    })),
  );
  return { rounds, dates, rows, settle, hasProjected };
}
