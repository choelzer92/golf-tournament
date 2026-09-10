// Tests for the viewer-scoped money rules (DECISIONS.md §5h).
//
// The rule Craig set: money is PRIVATE TO THE GROUP that played for it. Inside a group
// you see every member's won/lost from that group's games; you may NOT see their results
// from another group. A viewer's OWN money crosses groups, because it's theirs.
//
// Pure functions over in-memory ledgers — no Supabase, no network.

import { describe, expect, it } from 'vitest';
import {
  gameRollups,
  ledgersForGroup,
  myGameHistory,
  myMoney,
  rollupByPlayer,
  settleUp,
  type GameLedger,
} from '@/lib/stats-ledger';
import type { RosterGroup } from '@/lib/roster-groups';
import { makeGame, scoresFor, singleMatchup, TEST_PARS } from './fixtures';

// --- fixtures ---------------------------------------------------------------

function net(gameId: string, playerId: string, amount: number, playedAt: string) {
  return {
    gameId, gameName: gameId, gameKind: 'pool' as const,
    playedAt, playerId, playerName: playerId.toUpperCase(), net: amount,
  };
}

/** Craig + Jym play a Warriors game; Craig + Dave play a Tuesday game. */
function ledgers(): GameLedger[] {
  return [
    {
      gameId: 'w1', gameName: 'Warriors Week 1', gameKind: 'pool',
      playedAt: '2026-06-06', playerIds: ['craig', 'jym'], hasMoney: true, groupId: 'g-war',
      playerNets: [net('w1', 'craig', 20, '2026-06-06'), net('w1', 'jym', -20, '2026-06-06')],
    },
    {
      gameId: 't1', gameName: 'Tuesday Skins', gameKind: 'pool',
      playedAt: '2026-07-07', playerIds: ['craig', 'dave'], hasMoney: true, groupId: 'g-tue',
      playerNets: [net('t1', 'craig', -5, '2026-07-07'), net('t1', 'dave', 5, '2026-07-07')],
    },
    {
      gameId: 'x1', gameName: 'Random Saturday', gameKind: 'pool',
      playedAt: '2026-07-18', playerIds: ['craig', 'zed'], hasMoney: true,
      playerNets: [net('x1', 'craig', 7, '2026-07-18'), net('x1', 'zed', -7, '2026-07-18')],
    },
  ];
}

const warriors: RosterGroup = { id: 'g-war', name: 'Weekend Warriors', ownerGhin: 1, playerIds: ['craig', 'jym'], defaults: null };
const tuesday: RosterGroup = { id: 'g-tue', name: 'Tuesday Crew', ownerGhin: 1, playerIds: ['craig', 'dave'], defaults: null };

// --- the privacy rule -------------------------------------------------------

describe('money is private to the group that played for it', () => {
  it("a group's view contains ONLY that group's games", () => {
    const inWarriors = ledgersForGroup(ledgers(), warriors);
    expect(inWarriors.map((l) => l.gameId)).toEqual(['w1']);

    const inTuesday = ledgersForGroup(ledgers(), tuesday);
    expect(inTuesday.map((l) => l.gameId)).toEqual(['t1']);
  });

  it("a Warriors view never exposes Jym's or Dave's Tuesday money", () => {
    const rollups = rollupByPlayer(ledgersForGroup(ledgers(), warriors));
    const names = rollups.map((r) => r.playerId);
    expect(names).toContain('craig');
    expect(names).toContain('jym');
    // Dave plays Tuesday only — he must not appear in a Warriors rollup at all.
    expect(names).not.toContain('dave');
  });

  it('field-wide money inside a group is still zero-sum and settles', () => {
    const inWarriors = ledgersForGroup(ledgers(), warriors);
    const rollups = rollupByPlayer(inWarriors);
    expect(rollups.reduce((s, r) => s + r.net, 0)).toBeCloseTo(0, 6);
    const transfers = settleUp(rollups);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({ fromPlayerId: 'jym', toPlayerId: 'craig', amount: 20 });
  });
});

// --- "just me" crosses groups ----------------------------------------------

describe("a viewer's own money crosses groups", () => {
  it('totals across every group and breaks it down', () => {
    const mine = myMoney(ledgers(), 'craig', 'Craig', [warriors, tuesday]);
    // 20 (Warriors) − 5 (Tuesday) + 7 (untagged) = 22
    expect(mine.net).toBeCloseTo(22, 6);
    expect(mine.gamesPlayed).toBe(3);

    const byGroup = Object.fromEntries(mine.byGroup.map((g) => [g.groupId, g.net]));
    expect(byGroup['g-war']).toBeCloseTo(20, 6);
    expect(byGroup['g-tue']).toBeCloseTo(-5, 6);
  });

  it('the parts always sum to the total (no game silently dropped)', () => {
    const mine = myMoney(ledgers(), 'craig', 'Craig', [warriors, tuesday]);
    const parts = mine.byGroup.reduce((s, g) => s + g.net, 0) + mine.ungroupedNet;
    expect(parts).toBeCloseTo(mine.net, 6);
    // The untagged Saturday lands in ungrouped rather than vanishing.
    expect(mine.ungroupedNet).toBeCloseTo(7, 6);
    expect(mine.ungroupedGames).toBe(1);
  });

  it('orders groups by biggest swing, not just biggest win', () => {
    // A big LOSS must surface as prominently as a big win.
    const heavy: GameLedger[] = [
      ...ledgers(),
      {
        gameId: 't2', gameName: 'Tuesday Blowout', gameKind: 'pool',
        playedAt: '2026-07-14', playerIds: ['craig', 'dave'], hasMoney: true, groupId: 'g-tue',
        playerNets: [net('t2', 'craig', -80, '2026-07-14'), net('t2', 'dave', 80, '2026-07-14')],
      },
    ];
    const mine = myMoney(heavy, 'craig', 'Craig', [warriors, tuesday]);
    expect(mine.byGroup[0].groupId).toBe('g-tue');   // −85 outranks +20
  });

  it('a viewer who has played nothing gets a clean zero, not a crash', () => {
    const mine = myMoney(ledgers(), 'nobody', 'Nobody', [warriors, tuesday]);
    expect(mine.net).toBe(0);
    expect(mine.gamesPlayed).toBe(0);
    expect(mine.byGroup).toEqual([]);
  });
});

describe('myGameHistory', () => {
  it('lists a viewer\'s games most recent first', () => {
    const h = myGameHistory(ledgers(), 'craig');
    expect(h.map((n) => n.gameId)).toEqual(['x1', 't1', 'w1']);
    expect(h.map((n) => n.net)).toEqual([7, -5, 20]);
  });

  it('returns only that viewer\'s rows', () => {
    expect(myGameHistory(ledgers(), 'jym').map((n) => n.gameId)).toEqual(['w1']);
  });
});

// ---------------------------------------------------------------------------
// F-032: gameRollups — one game's nets as rollups, so settleUp can run per-game
// ---------------------------------------------------------------------------

describe('F-032: gameRollups + settleUp for one game', () => {
  it('an individual points game settles zero-sum and the transfers cover every debt', () => {
    // Stableford, $2/point, varied scores → distinct nets.
    const game = makeGame({
      indexes: [0, 6, 12, 18],
      gameMode: 'stableford-ind',
      entryPerPlayer: 0,
      modeSettings: { scoreBasis: 'net', scale: 'standard', moneyModel: 'per-point', dollarsPerPoint: 2 },
    });
    const scores = singleMatchup([
      ...scoresFor('p1', TEST_PARS.map((p) => p - 1)),  // birdies everywhere
      ...scoresFor('p2', TEST_PARS.map((p) => p)),
      ...scoresFor('p3', TEST_PARS.map((p) => p + 1)),
      ...scoresFor('p4', TEST_PARS.map((p) => p + 2)),
    ]);

    const rollups = gameRollups(game, scores);
    expect(rollups).toHaveLength(4);
    // The invariant every money surface rests on.
    expect(rollups.reduce((s, r) => s + r.net, 0)).toBeCloseTo(0, 6);

    // Transfers fully settle: each player's transfers-in minus transfers-out equals their net.
    const transfers = settleUp(rollups);
    const settled = new Map(rollups.map((r) => [r.playerId, 0]));
    for (const t of transfers) {
      settled.set(t.fromPlayerId, (settled.get(t.fromPlayerId) ?? 0) - t.amount);
      settled.set(t.toPlayerId, (settled.get(t.toPlayerId) ?? 0) + t.amount);
    }
    for (const r of rollups) {
      expect(settled.get(r.playerId)!).toBeCloseTo(r.net, 2);
    }
  });

  it('a classic pool splits each team net evenly and stays zero-sum', () => {
    const game = makeGame({ indexes: [0, 6, 12, 18, 2, 8, 14, 20], teamCount: 2, entryPerPlayer: 20 });
    const [t1, t2] = game.teams;
    const scores = new Map([
      [t1.matchupId, [
        ...scoresFor('p1', TEST_PARS.map((p) => p - 1)),
        ...scoresFor('p2', TEST_PARS.map((p) => p)),
        ...scoresFor('p3', TEST_PARS.map((p) => p)),
        ...scoresFor('p4', TEST_PARS.map((p) => p + 1)),
      ]],
      [t2.matchupId, [
        ...scoresFor('p5', TEST_PARS.map((p) => p + 1)),
        ...scoresFor('p6', TEST_PARS.map((p) => p + 1)),
        ...scoresFor('p7', TEST_PARS.map((p) => p + 2)),
        ...scoresFor('p8', TEST_PARS.map((p) => p + 2)),
      ]],
    ]);

    const rollups = gameRollups(game, scores);
    expect(rollups).toHaveLength(8);
    expect(rollups.reduce((s, r) => s + r.net, 0)).toBeCloseTo(0, 6);
    // Teammates split evenly — every member of a team has the same net.
    const byTeam = (ids: string[]) => ids.map((id) => rollups.find((r) => r.playerId === id)!.net);
    for (const nets of [byTeam(t1.playerIds), byTeam(t2.playerIds)]) {
      for (const n of nets) expect(n).toBeCloseTo(nets[0], 6);
    }
    // And the split really is PER PERSON: team 1 strictly wins every hole, leg, and
    // junk line, so it takes the whole $160 pot — net +$80, i.e. +$20 a head. A
    // rollup that forgot to divide by team size would read +$80 here and still pass
    // the two checks above (4× a zero-sum, teammate-equal set is both).
    expect(byTeam(t1.playerIds)[0]).toBeCloseTo(20, 6);
  });
});
