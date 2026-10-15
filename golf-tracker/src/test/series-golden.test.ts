// Goldens for the Series (an "Event" on screen): DECISIONS.md §5.cr, §5.cu, §5.cv.
//
// The claims pinned here:
//   - TOTAL is the sum of each FINISHED round's net per player, and nothing else;
//   - a live round is PROJECTED: it shows, but never enters TOTAL or the settle-up;
//   - a round's member is a GAME: two rounds on one date are two columns, each counted once;
//   - a player who sits a round out just has no entry for it;
//   - the event is zero-sum and the settle-up clears every TOTAL;
//   - play order is SET-UP order (seq), movable (§5.dc). A date is optional and only heads
//     consecutive rounds that share it. It is never the order the games were saved.

import { describe, expect, it } from 'vitest';
import {
  groupBySeries,
  nestEvents,
  moveRound,
  nextRoundStamp,
  seriesGames,
  seriesStandings,
  seriesSummaries,
  type SeriesRoundInput,
  type SeriesStamp,
} from '@/lib/series';
import { gameRollups, perPlayerNets } from '@/lib/stats-ledger';
import { makeGame, makePlayer, makeTeam, scoresFor, singleMatchup, scoreMap, TEST_PARS } from './fixtures';

const n = (playerId: string, net: number) => ({ playerId, playerName: playerId.toUpperCase(), net });

// A long weekend, deliberately listed OUT of play order:
//   Fri R1, Sat R2 (morning), Sat R3 (afternoon, Dave sits out), Sun R4 live, Sun R5 not started.
function weekend(): SeriesRoundInput[] {
  return [
    { gameId: 'sat-pm', gameName: 'Sat PM', date: '2026-10-17', seq: 3, status: 'completed',
      nets: [n('craig', -15), n('jym', 10), n('ed', 5)] },
    { gameId: 'sun', gameName: 'Sun', date: '2026-10-18', seq: 4, status: 'active',
      nets: [n('craig', 8), n('jym', -8), n('dave', 4), n('ed', -4)] },
    { gameId: 'fri', gameName: 'Fri', date: '2026-10-16', seq: 1, status: 'completed',
      nets: [n('craig', 20), n('jym', -20), n('dave', 10), n('ed', -10)] },
    { gameId: 'sun-2', gameName: 'Sun shootout', date: '2026-10-18', seq: 5, status: 'setup', nets: [] },
    { gameId: 'sat-am', gameName: 'Sat AM', date: '2026-10-17', seq: 2, status: 'completed',
      nets: [n('craig', -5), n('jym', 5), n('dave', -30), n('ed', 30)] },
  ];
}

describe('Series standings: a long weekend with a 36-hole Saturday', () => {
  const s = seriesStandings(weekend());
  const row = (id: string) => s.rows.find((r) => r.playerId === id)!;

  it('orders rounds by seq, labels them R1… and heads same-day runs with their date', () => {
    expect(s.rounds.map((r) => r.gameId)).toEqual(['fri', 'sat-am', 'sat-pm', 'sun', 'sun-2']);
    expect(s.rounds.map((r) => r.label)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5']);
    expect(s.rounds.map((r) => r.state)).toEqual(['final', 'final', 'final', 'projected', 'upcoming']);
    expect(s.dates).toEqual([
      { date: '2026-10-16', gameIds: ['fri'] },
      { date: '2026-10-17', gameIds: ['sat-am', 'sat-pm'] },
      { date: '2026-10-18', gameIds: ['sun', 'sun-2'] },
    ]);
  });

  it('TOTAL is finished rounds only (hand-checked)', () => {
    // craig 20 − 5 − 15 = 0; jym −20 + 5 + 10 = −5; dave 10 − 30 = −20; ed −10 + 30 + 5 = 25.
    expect(row('craig').total).toBe(0);
    expect(row('jym').total).toBe(-5);
    expect(row('dave').total).toBe(-20);
    expect(row('ed').total).toBe(25);
  });

  it('PROJECTED adds the live round on top', () => {
    expect(row('craig').projected).toBe(8);
    expect(row('jym').projected).toBe(-13);
    expect(row('dave').projected).toBe(-16);
    expect(row('ed').projected).toBe(21);
    expect(s.hasProjected).toBe(true);
  });

  it('a player who sat a round out has no entry for it and one fewer round played', () => {
    expect(row('dave').byRound['sat-pm']).toBeUndefined();
    expect(row('dave').roundsPlayed).toBe(2);
    expect(row('ed').roundsPlayed).toBe(3);
  });

  it('the not-started round has no money anywhere', () => {
    for (const r of s.rows) expect(r.byRound['sun-2']).toBeUndefined();
  });

  it('is zero-sum on both TOTAL and PROJECTED', () => {
    expect(s.rows.reduce((a, r) => a + r.total, 0)).toBeCloseTo(0, 9);
    expect(s.rows.reduce((a, r) => a + r.projected, 0)).toBeCloseTo(0, 9);
  });

  it('rows run richest TOTAL first', () => {
    expect(s.rows.map((r) => r.playerId)).toEqual(['ed', 'craig', 'jym', 'dave']);
  });

  it('the settle-up clears every TOTAL and ignores the live round', () => {
    const owed = new Map(s.rows.map((r) => [r.playerId, 0]));
    for (const t of s.settle) {
      owed.set(t.fromPlayerId, owed.get(t.fromPlayerId)! - t.amount);
      owed.set(t.toPlayerId, owed.get(t.toPlayerId)! + t.amount);
    }
    for (const r of s.rows) expect(owed.get(r.playerId)).toBeCloseTo(r.total, 2);
    // Craig is flat on finished rounds. His live +8 must not make him a payee.
    expect(s.settle.some((t) => t.toPlayerId === 'craig' || t.fromPlayerId === 'craig')).toBe(false);
  });

  it('a game added later runs in set-up order, under its own date header (§5.dc)', () => {
    // §5.cp: a back-nine 3 v 3 added on top of Saturday's round AFTER Sunday was set up. Set-up order
    // puts it last; it's still its own column, counted once. (When "two games on one round" is built,
    // the second game shares its round's slot.)
    const plus = seriesStandings([
      ...weekend(),
      { gameId: 'sat-am-b9', gameName: 'Back-nine 3v3', date: '2026-10-17', seq: 6, status: 'completed',
        nets: [n('craig', 6), n('jym', -6)] },
    ]);
    expect(plus.rounds.map((r) => r.gameId)).toEqual(['fri', 'sat-am', 'sat-pm', 'sun', 'sun-2', 'sat-am-b9']);
    expect(plus.dates[3]).toEqual({ date: '2026-10-17', gameIds: ['sat-am-b9'] });
    expect(plus.rows.find((r) => r.playerId === 'craig')!.total).toBe(6);
  });

  it('seq wins over the date: a round set up first but played later still runs first', () => {
    const s2 = seriesStandings([
      { gameId: 'late', gameName: 'Late', date: '2026-10-20', seq: 1, status: 'completed', nets: [n('a', 5), n('b', -5)] },
      { gameId: 'early', gameName: 'Early', date: '2026-10-10', seq: 2, status: 'completed', nets: [n('a', -1), n('b', 1)] },
    ]);
    expect(s2.rounds.map((r) => r.gameId)).toEqual(['late', 'early']);
  });
});

describe('§5.dc: dates are optional', () => {
  const undated = (gameId: string, seq: number, date?: string): SeriesRoundInput =>
    ({ gameId, gameName: gameId, seq, status: 'completed', nets: [n('a', seq), n('b', -seq)], ...(date ? { date } : {}) });

  it('an event with no dates: set-up order, one header-less run, money unchanged', () => {
    const s = seriesStandings([undated('r2', 2), undated('r1', 1), undated('r3', 3)]);
    expect(s.rounds.map((r) => [r.gameId, r.label])).toEqual([['r1', 'R1'], ['r2', 'R2'], ['r3', 'R3']]);
    expect(s.dates).toEqual([{ date: undefined, gameIds: ['r1', 'r2', 'r3'] }]);
    expect(s.rows.find((r) => r.playerId === 'a')!.total).toBe(6);
    expect(s.rows.reduce((t, r) => t + r.total, 0)).toBe(0);
  });

  it('a date heads only the consecutive rounds that share it', () => {
    const s = seriesStandings([undated('r1', 1), undated('r2', 2, '2026-10-17'), undated('r3', 3, '2026-10-17'), undated('r4', 4)]);
    expect(s.dates).toEqual([
      { date: undefined, gameIds: ['r1'] },
      { date: '2026-10-17', gameIds: ['r2', 'r3'] },
      { date: undefined, gameIds: ['r4'] },
    ]);
  });
});

describe('§5.dc: rounds are movable on the event screen', () => {
  const stamp = (seq: number): SeriesStamp => ({ id: 's-1', name: 'Trip', rollup: 'money', seq });
  const rounds = [
    { id: 'a', name: 'A', status: 'completed' as const, series: stamp(1) },
    { id: 'b', name: 'B', status: 'active' as const, series: stamp(2) },
    { id: 'c', name: 'C', status: 'setup' as const, series: stamp(5) },
  ];

  it('moving a round swaps it with its neighbour and renumbers 1..n', () => {
    expect(moveRound(rounds, 'c', -1)).toEqual([{ gameId: 'a', seq: 1 }, { gameId: 'c', seq: 2 }, { gameId: 'b', seq: 3 }]);
    expect(moveRound(rounds, 'a', 1)).toEqual([{ gameId: 'b', seq: 1 }, { gameId: 'a', seq: 2 }, { gameId: 'c', seq: 3 }]);
  });

  it('the ends do not move past themselves (order unchanged, renumbered)', () => {
    expect(moveRound(rounds, 'a', -1)).toEqual([{ gameId: 'a', seq: 1 }, { gameId: 'b', seq: 2 }, { gameId: 'c', seq: 3 }]);
    expect(moveRound(rounds, 'c', 1)).toEqual([{ gameId: 'a', seq: 1 }, { gameId: 'b', seq: 2 }, { gameId: 'c', seq: 3 }]);
  });

  it('the next round after a move still continues the seq', () => {
    const moved = moveRound(rounds, 'c', -1);
    const after = rounds.map((r) => ({ ...r, series: { ...r.series, seq: moved.find((m) => m.gameId === r.id)!.seq } }));
    expect(nextRoundStamp(after).seq).toBe(4);
  });
});

describe('Series standings over REAL games of different modes and fields', () => {
  // R1: a classic two-team pool of 8. R2: individual Stableford, $2/pt, four of them.
  // R3: the classic pool again with a different draw. Every total must equal the sum
  // of that player's per-round gameRollups. That oracle is the per-game reducer the
  // hub's settle-up already uses, not the series code.
  const eight = [0, 4, 8, 12, 16, 20, 2, 10];
  const players = eight.map((idx, i) => makePlayer(i + 1, idx));
  const ids = players.map((p) => p.id);

  const r1 = makeGame({
    id: 'r1', players, status: 'completed',
    teams: [makeTeam(1, ids.slice(0, 4)), makeTeam(2, ids.slice(4))],
  });
  const r1Scores = scoreMap(
    ['m1', ids.slice(0, 4).flatMap((id) => scoresFor(id, TEST_PARS.map((p) => p)))],
    ['m2', ids.slice(4).flatMap((id) => scoresFor(id, TEST_PARS.map((p) => p + 1)))],
  );

  const four = players.slice(2, 6);
  const r2 = makeGame({
    id: 'r2', players: four, status: 'completed',
    gameMode: 'stableford-ind', entryPerPlayer: 0,
    modeSettings: { scoreBasis: 'net', scale: 'standard', moneyModel: 'per-point', dollarsPerPoint: 2 },
  });
  const r2Scores = singleMatchup(four.flatMap((p, i) => scoresFor(p.id, TEST_PARS.map((par) => par + (i % 3) - 1))));

  const redraw = [ids[0], ids[7], ids[2], ids[5]];
  const r3 = makeGame({
    id: 'r3', players, status: 'completed',
    teams: [makeTeam(1, redraw), makeTeam(2, ids.filter((id) => !redraw.includes(id)))],
  });
  const r3Scores = scoreMap(
    ['m1', redraw.flatMap((id) => scoresFor(id, TEST_PARS.map((p) => p + 1)))],
    ['m2', ids.filter((id) => !redraw.includes(id)).flatMap((id) => scoresFor(id, TEST_PARS.map((p) => p)))],
  );

  const rounds: [typeof r1, Map<string, ReturnType<typeof scoresFor>>, string][] = [
    [r1, r1Scores, '2026-10-16'], [r2, r2Scores, '2026-10-17'], [r3, r3Scores, '2026-10-17'],
  ];
  const inputs: SeriesRoundInput[] = rounds.map(([g, sc, date], i) => ({
    gameId: g.id, gameName: g.name, date, seq: i + 1, status: g.status, nets: perPlayerNets(g, sc),
  }));
  const s = seriesStandings(inputs);

  it('each round really moved money (the scenario is not vacuous)', () => {
    for (const [g, sc] of rounds) expect(gameRollups(g, sc).some((r) => Math.abs(r.net) > 0.01)).toBe(true);
  });

  it("every player's TOTAL equals the sum of their per-round rollups", () => {
    for (const p of players) {
      const oracle = rounds.reduce(
        (sum, [g, sc]) => sum + (gameRollups(g, sc).find((r) => r.playerId === p.id)?.net ?? 0), 0);
      expect(s.rows.find((r) => r.playerId === p.id)!.total).toBeCloseTo(oracle, 6);
    }
  });

  it('the Stableford round only touches its four players', () => {
    const outside = players.filter((p) => !four.includes(p));
    for (const p of outside) expect(s.rows.find((r) => r.playerId === p.id)!.byRound['r2']).toBeUndefined();
  });

  it('is zero-sum and settles', () => {
    expect(s.rows.reduce((a, r) => a + r.total, 0)).toBeCloseTo(0, 6);
    const moved = s.settle.reduce((a, t) => a + t.amount, 0);
    const owedOut = s.rows.filter((r) => r.total < 0).reduce((a, r) => a - r.total, 0);
    expect(moved).toBeCloseTo(owedOut, 1);
  });
});

describe('membership and the next round', () => {
  const stamp = (seq: number, date: string, name = 'Myrtle 2026'): SeriesStamp =>
    ({ id: 's-myrtle', name, rollup: 'money', seq, date });
  const games = [
    { id: 'b', name: 'B', status: 'completed' as const, series: stamp(2, '2026-10-17') },
    { id: 'x', name: 'Not in it', status: 'completed' as const },
    { id: 'a', name: 'A', status: 'completed' as const, series: stamp(1, '2026-10-16') },
    { id: 'o', name: 'Other event', status: 'active' as const,
      series: { id: 's-other', name: 'Other', rollup: 'money' as const, seq: 1, date: '2026-10-01' } },
  ];

  it('an event is exactly the games sharing its id, in play order', () => {
    expect(seriesGames(games, 's-myrtle').map((g) => g.id)).toEqual(['a', 'b']);
    const all = groupBySeries(games);
    expect([...all.keys()].sort()).toEqual(['s-myrtle', 's-other']);
    expect(all.get('s-myrtle')!.map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('the next round continues the seq and keeps the id + rollup', () => {
    const next = nextRoundStamp(seriesGames(games, 's-myrtle'), '2026-10-18');
    expect(next).toEqual({ id: 's-myrtle', name: 'Myrtle 2026', rollup: 'money', seq: 3, date: '2026-10-18' });
  });

  it('a 36-hole day: the next round may share the date', () => {
    expect(nextRoundStamp(seriesGames(games, 's-myrtle'), '2026-10-17').seq).toBe(3);
  });

  it('§5.dc: with no date given, the next round carries none', () => {
    expect(nextRoundStamp(seriesGames(games, 's-myrtle'))).toEqual({ id: 's-myrtle', name: 'Myrtle 2026', rollup: 'money', seq: 3 });
  });

  it('§5.dc: the event picker lists the most recently set-up event first, dates or not', () => {
    const list = seriesSummaries([
      { id: 'o1', name: 'O1', status: 'completed', createdAt: '2026-10-01T10:00:00Z', series: { id: 's-old', name: 'Old', rollup: 'money', seq: 1, date: '2026-12-01' } },
      { id: 'n1', name: 'N1', status: 'active', createdAt: '2026-10-12T10:00:00Z', series: { id: 's-new', name: 'New', rollup: 'money', seq: 1 } },
    ]);
    expect(list.map((e) => [e.id, e.roundCount])).toEqual([['s-new', 1], ['s-old', 1]]);
  });
});

describe('§5.cw a: a live round with no score yet is NOT STARTED', () => {
  const base = weekend().filter((r) => r.gameId !== 'sun-2');

  it('reads upcoming, never projected, and its nets are ignored', () => {
    // A round set up ahead saves as active; nets of all zeros (nobody scored) or stale ones must not show.
    const s = seriesStandings(base.map((r) => (r.gameId === 'sun' ? { ...r, scored: false } : r)));
    expect(s.rounds.find((r) => r.gameId === 'sun')!.state).toBe('upcoming');
    expect(s.hasProjected).toBe(false);
    expect(s.rows.every((r) => r.byRound.sun === undefined && r.projected === r.total)).toBe(true);
  });

  it('scored (or unknown) stays projected', () => {
    for (const scored of [true, undefined]) {
      const s = seriesStandings(base.map((r) => (r.gameId === 'sun' ? { ...r, scored } : r)));
      expect(s.rounds.find((r) => r.gameId === 'sun')!.state).toBe('projected');
      expect(s.hasProjected).toBe(true);
    }
  });
});

describe('§5.cw c: nestEvents folds an event into one row where it first appears', () => {
  it('keeps newest-first order and passes ordinary games through', () => {
    const list = [
      { id: 'r3', s: 'trip' }, { id: 'tues', s: undefined }, { id: 'r1', s: 'trip' },
      { id: 'cup2', s: 'cup' }, { id: 'old', s: undefined },
    ];
    const rows = nestEvents(list, (x) => x.s);
    expect(rows.map((r) => (r.kind === 'item' ? r.item.id : `${r.seriesId}:${r.items.map((i) => i.id).join(',')}`)))
      .toEqual(['trip:r3,r1', 'tues', 'cup:cup2', 'old']);
  });
});
