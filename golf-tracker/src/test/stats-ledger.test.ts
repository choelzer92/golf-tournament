// Tests for the viewer-scoped money rules (DECISIONS.md §5h).
//
// The rule Craig set: money is PRIVATE TO THE GROUP that played for it. Inside a group
// you see every member's won/lost from that group's games; you may NOT see their results
// from another group. A viewer's OWN money crosses groups, because it's theirs.
//
// Pure functions over in-memory ledgers — no Supabase, no network.

import { describe, expect, it } from 'vitest';
import {
  ledgersForGroup,
  myGameHistory,
  myMoney,
  rollupByPlayer,
  settleUp,
  type GameLedger,
} from '@/lib/stats-ledger';
import type { RosterGroup } from '@/lib/roster-groups';

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
