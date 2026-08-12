// Compute tests for the CLASSIC pool engine — the original real-money game.
//
// This is the other leaderboard axis from game-modes.test.ts: N foursomes
// compared against each other, pot split into front/back/overall/junk sub-pots,
// or head-to-head match mode between exactly two foursomes.
//
// Pure math only: computePoolResult, buildHcapMap, distributePot,
// bestBallTeamHoleScore, filterConcealedScores. No Supabase, no network.

import { describe, expect, it } from 'vitest';
import {
  bestBallTeamHoleScore,
} from '@/lib/live-scoring';
import {
  buildHcapMap,
  computePoolPlayerDetails,
  computePoolResult,
  distributePot,
  filterConcealedScores,
  getFieldLow,
  getGameHoles,
  isPoolGameFullyScored,
  type PoolGame,
} from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import {
  backNine, frontNine, makeGame, makePlayer, parScores, scoresFor, TEST_PARS,
  type GameOpts,
} from './fixtures';

// Two foursomes, all scratch unless overridden.
function twoFoursomes(overrides: GameOpts = {}) {
  return makeGame({ teamCount: 2, indexes: Array(8).fill(0), entryPerPlayer: 25, ...overrides });
}

const team1 = ['p1', 'p2', 'p3', 'p4'];
const team2 = ['p5', 'p6', 'p7', 'p8'];

// Every player on `ids` shoots `offset` relative to par on every hole.
function flatRound(ids: string[], offset: number, holes: number[] = Array.from({ length: 18 }, (_, i) => i + 1)): GameScore[] {
  return ids.flatMap((id) => scoresFor(id, holes.map((h) => TEST_PARS[h - 1] + offset), holes));
}

const netSum = (payouts: { net: number }[]) => payouts.reduce((s, p) => s + p.net, 0);

// ---------------------------------------------------------------------------
// Handicap map — the base every net calculation sits on
// ---------------------------------------------------------------------------

describe('buildHcapMap', () => {
  it('rounds the course handicap when applying the allowance', () => {
    const game = makeGame({
      strokeMethod: 'full',
      players: [makePlayer(1, 10.4), makePlayer(2, 3.6)],
    });
    const m = buildHcapMap(game);
    // applyAllowance() = round(courseHcap) × allowance%, so a fractional index is
    // already whole here even at 100%. (Slope 113 + rating == par → CH == index.)
    expect(m.get('p1')).toBe(10);
    expect(m.get('p2')).toBe(4);
  });

  it('applies the handicap allowance', () => {
    const game = makeGame({ strokeMethod: 'full', handicapAllowance: 90, indexes: [20] });
    expect(buildHcapMap(game).get('p1')).toBeCloseTo(18, 6);
  });

  // REGRESSION (see UI_MODE_AUDIT / off-the-low memory): off-the-low must round
  // EACH course handicap first, THEN subtract the rounded field low — the order
  // GHIN uses. Doing round(raw − rawLow) handed a player one extra stroke when
  // the low man's fraction rounded UP while theirs rounded DOWN.
  describe('off-the-low rounding order', () => {
    it('rounds each handicap before subtracting (matches GHIN)', () => {
      const game = makeGame({
        strokeMethod: 'off-the-low',
        players: [makePlayer(1, 15.4), makePlayer(2, 3.6)],
      });
      const m = buildHcapMap(game);
      // GHIN: round(15.4)=15, round(3.6)=4 → 15 − 4 = 11.
      // The old bug: 15.4 − 3.6 = 11.8 → round → 12 (one stroke too many).
      expect(m.get('p1')).toBe(11);
      expect(m.get('p2')).toBe(0);
    });

    it('puts the low man at scratch', () => {
      const game = makeGame({ strokeMethod: 'off-the-low', indexes: [8, 14, 22, 30] });
      const m = buildHcapMap(game);
      expect(m.get('p1')).toBe(0);
      expect(m.get('p2')).toBe(6);
      expect(m.get('p3')).toBe(14);
      expect(m.get('p4')).toBe(22);
    });

    it('handles a plus handicap as the field low', () => {
      const game = makeGame({ strokeMethod: 'off-the-low', indexes: [-2, 5, 10] });
      const m = buildHcapMap(game);
      expect(m.get('p1')).toBe(0);
      expect(m.get('p2')).toBe(7);   // 5 − (−2)
      expect(m.get('p3')).toBe(12);
    });
  });
});

describe('getFieldLow', () => {
  it('reports the lowest course handicap and whether it applies', () => {
    const off = makeGame({ strokeMethod: 'off-the-low', indexes: [12, 4, 20] });
    expect(getFieldLow(off)).toMatchObject({ playerId: 'p2', courseHandicap: 4, applies: true });

    const full = makeGame({ strokeMethod: 'full', indexes: [12, 4, 20] });
    expect(getFieldLow(full)?.applies).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ball selection — how a foursome's hole score is formed
// ---------------------------------------------------------------------------

describe('bestBallTeamHoleScore', () => {
  const scores = [
    { gross: 5, net: 4 },
    { gross: 4, net: 4 },
    { gross: 6, net: 5 },
    { gross: 7, net: 6 },
  ];

  it('2-best-net adds the two lowest nets', () => {
    expect(bestBallTeamHoleScore(scores, '2-best-net')).toBe(8);   // 4 + 4
  });

  it('2-best-gross adds the two lowest grosses', () => {
    expect(bestBallTeamHoleScore(scores, '2-best-gross')).toBe(9); // 4 + 5
  });

  it('1-net-1-gross uses two DIFFERENT players', () => {
    // Best net 4 (either) + best gross from someone else = 4 + 4 = 8.
    expect(bestBallTeamHoleScore(scores, '1-net-1-gross')).toBe(8);
  });

  it('needs at least two scores', () => {
    expect(bestBallTeamHoleScore([{ gross: 4, net: 4 }], '2-best-net')).toBeNull();
    expect(bestBallTeamHoleScore([], '1-net-1-gross')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pot distribution
// ---------------------------------------------------------------------------

describe('distributePot', () => {
  const ranked = (metrics: number[]) => metrics.map((m, i) => ({ teamId: `t${i + 1}`, metric: m }));

  it('pays winner-take-all by default', () => {
    const out = distributePot(ranked([-4, -2, 0]), 100, [100]);
    expect(out.t1).toBe(100);
    expect(out.t2 ?? 0).toBe(0);
  });

  it('splits by position when configured', () => {
    const out = distributePot(ranked([-4, -2, 0]), 100, [70, 30]);
    expect(out.t1).toBe(70);
    expect(out.t2).toBe(30);
    expect(out.t3 ?? 0).toBe(0);
  });

  it('shares the summed positions among tied teams', () => {
    // Two teams tie for 1st with a 70/30 split → each gets (70+30)/2 = 50.
    const out = distributePot(ranked([-4, -4, 0]), 100, [70, 30]);
    expect(out.t1).toBe(50);
    expect(out.t2).toBe(50);
    expect(out.t3 ?? 0).toBe(0);
  });

  it('pays nothing from an empty pot', () => {
    expect(distributePot(ranked([-4]), 0, [100])).toEqual({});
  });

  it('never pays out more than the pot', () => {
    const out = distributePot(ranked([-4, -4, -4, -4]), 100, [50, 30, 20]);
    const total = Object.values(out).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(100, 6);
  });
});

// ---------------------------------------------------------------------------
// Pot mode — the classic buy-in pool
// ---------------------------------------------------------------------------

describe('computePoolResult — pot mode', () => {
  it('sizes the pot from players × entry', () => {
    const game = twoFoursomes({ entryPerPlayer: 25 });
    const r = computePoolResult(game, new Map([
      ['m1', parScores(team1)],
      ['m2', parScores(team2)],
    ]));
    expect(r.pot).toBe(8 * 25);
  });

  it('splits the pot into four sub-pots per potSplit', () => {
    const game = twoFoursomes({
      entryPerPlayer: 25,
      potSplit: { front: 0.25, back: 0.25, overall: 0.25, junk: 0.25 },
    });
    const r = computePoolResult(game, new Map([
      ['m1', parScores(team1)],
      ['m2', parScores(team2)],
    ]));
    const sub = (k: string) => r.legs.find((l) => l.leg === k)?.subPot ?? 0;
    expect(sub('front')).toBe(50);
    expect(sub('back')).toBe(50);
    expect(sub('overall')).toBe(50);
    // Junk is the remaining quarter (paid out via junkDetails, not a leg standing).
    expect(sub('front') + sub('back') + sub('overall')).toBeCloseTo(150, 6);
  });

  it('pays the better foursome and stays zero-sum', () => {
    const game = twoFoursomes();
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0)],    // par
      ['m2', flatRound(team2, 1)],    // bogey
    ]));
    const t1 = r.payouts.find((p) => p.teamId === 't1')!;
    const t2 = r.payouts.find((p) => p.teamId === 't2')!;
    expect(t1.net).toBeGreaterThan(0);
    expect(t2.net).toBeLessThan(0);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('nets to zero when both foursomes tie', () => {
    const game = twoFoursomes();
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0)],
      ['m2', flatRound(team2, 0)],
    ]));
    for (const p of r.payouts) expect(p.net).toBeCloseTo(0, 6);
  });

  it('reports perPersonNet as the team net divided by its players', () => {
    const game = twoFoursomes();
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0)],
      ['m2', flatRound(team2, 2)],
    ]));
    for (const p of r.payouts) {
      expect(p.perPersonNet).toBeCloseTo(p.net / p.playerCount, 6);
    }
  });

  it('tracks thruHole from the scores present', () => {
    const game = twoFoursomes();
    const six = [1, 2, 3, 4, 5, 6];
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0, six)],
      ['m2', flatRound(team2, 1, six)],
    ]));
    expect(r.thruHole).toBe(6);
  });

  // DOCUMENTS A KNOWN BUG (not the desired behavior) — see UI_MODE_AUDIT.md
  // "mid-round pot payouts are not zero-sum".
  //
  // Mid-round, the back-9 leg has no scores, so its sub-pot goes undistributed
  // while every team's `entryPaid` is already deducted in full. The result is a
  // board that shows more money lost than won — here team 1 is +$50 and team 2 is
  // −$100, a phantom −$50. The FINAL result is correct (all four legs pay out
  // once 18 holes are in), so this is a live-display issue, not a settlement one.
  //
  // The individual-game Nassau model already solves this: an un-started segment
  // splits evenly and returns antes (see settleNassau). Asserting the CURRENT
  // behavior so the fix is a deliberate, visible change to this test.
  it('mid-round: pot legs leave the un-started nine undistributed (known bug)', () => {
    const game = twoFoursomes();
    const six = [1, 2, 3, 4, 5, 6];
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0, six)],
      ['m2', flatRound(team2, 1, six)],
    ]));
    const back = r.legs.find((l) => l.leg === 'back')!;
    expect(back.subPot).toBe(50);
    expect(back.standings.reduce((s, x) => s + x.payout, 0)).toBe(0); // nobody paid
    // ...so the board is short by exactly that un-started sub-pot.
    expect(netSum(r.payouts)).toBeCloseTo(-back.subPot, 6);
  });

  it('IS zero-sum once the full round is in', () => {
    const game = twoFoursomes();
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0)],
      ['m2', flatRound(team2, 1)],
    ]));
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('returns an empty result when no holes exist', () => {
    const game = twoFoursomes({ course: null });
    const r = computePoolResult(game, new Map());
    expect(r.legs).toEqual([]);
    expect(r.payouts).toEqual([]);
    expect(r.thruHole).toBe(0);
  });

  // A nine must not pay the same holes twice (front + overall).
  it('puts the whole non-junk pot on one leg for a nine', () => {
    const game = twoFoursomes({ holesPlaying: 'front9' });
    const nine = frontNine();
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0, nine)],
      ['m2', flatRound(team2, 1, nine)],
    ]));
    const sub = (k: string) => r.legs.find((l) => l.leg === k)?.subPot ?? 0;
    expect(sub('front')).toBe(0);
    expect(sub('back')).toBe(0);
    // Whole pot minus the junk share rides on 'overall'.
    expect(sub('overall')).toBeCloseTo(r.pot * 0.75, 6);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('scales past two foursomes', () => {
    const game = makeGame({ teamCount: 4, indexes: Array(16).fill(0), entryPerPlayer: 20 });
    const ids = (n: number) => game.teams[n].playerIds;
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(ids(0), 0)],
      ['m2', flatRound(ids(1), 1)],
      ['m3', flatRound(ids(2), 2)],
      ['m4', flatRound(ids(3), 3)],
    ]));
    expect(r.pot).toBe(16 * 20);
    expect(r.payouts).toHaveLength(4);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
    // Best foursome wins the overall leg.
    const overall = r.legs.find((l) => l.leg === 'overall')!;
    expect(overall.standings.find((s) => s.place === 1)!.teamId).toBe('t1');
  });
});

// ---------------------------------------------------------------------------
// Junk
// ---------------------------------------------------------------------------

describe('junk', () => {
  it('counts birdies, eagles and albatrosses off GROSS', () => {
    const game = twoFoursomes({
      junkValues: { birdie: 1, eagle: 2, albatross: 3, groupHug: 1, ctp: 1 },
    });
    // p1 makes a birdie on hole 1, an eagle on hole 2 (par 5), an albatross on 13 (par 5).
    const p1 = TEST_PARS.slice();
    p1[0] = TEST_PARS[0] - 1;
    p1[1] = TEST_PARS[1] - 2;
    p1[12] = TEST_PARS[12] - 3;
    const r = computePoolResult(game, new Map([
      ['m1', [...scoresFor('p1', p1), ...flatRound(['p2', 'p3', 'p4'], 0)]],
      ['m2', flatRound(team2, 0)],
    ]));
    const j1 = r.junkDetails.find((j) => j.teamId === 't1')!;
    expect(j1.birdies).toBe(1);
    expect(j1.eagles).toBe(1);
    expect(j1.albatrosses).toBe(1);
  });

  it('awards a group hug when every player is par or better', () => {
    const game = twoFoursomes({
      junkValues: { birdie: 0, eagle: 0, albatross: 0, groupHug: 5, ctp: 0 },
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0)],    // all par → 18 group hugs
      ['m2', flatRound(team2, 1)],    // all bogey → none
    ]));
    const j1 = r.junkDetails.find((j) => j.teamId === 't1')!;
    const j2 = r.junkDetails.find((j) => j.teamId === 't2')!;
    expect(j1.groupHugs).toBe(18);
    expect(j2.groupHugs).toBe(0);
  });

  it('counts a CTP for the winner\'s team', () => {
    // Hole 3 is a par 3 on the fixture course.
    const game = twoFoursomes({
      junkValues: { birdie: 0, eagle: 0, albatross: 0, groupHug: 0, ctp: 4 },
      ctpWinners: { 3: 'p5' },
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0)],
      ['m2', flatRound(team2, 0)],
    ]));
    expect(r.junkDetails.find((j) => j.teamId === 't2')!.ctps).toBe(1);
    expect(r.junkDetails.find((j) => j.teamId === 't1')!.ctps).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// REGRESSION: an unscored junk leg is a TIE, not a void (FINDINGS.md F-007)
// ---------------------------------------------------------------------------

describe('junk leg with nobody scoring (F-007 regression)', () => {
  // The whole compute suite missed this bug because every fixture scored junk. With
  // all bonus values at 0, no team can earn a junk point — every team is tied at
  // zero, which must still pay the junk sub-pot out.
  const noJunkValues = { birdie: 0, eagle: 0, albatross: 0, groupHug: 0, ctp: 0 };

  it('pays out the junk sub-pot when every team is tied at zero', () => {
    const game = twoFoursomes({ junkValues: { ...noJunkValues } });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 1)],
      ['m2', flatRound(team2, 2)],
    ]));
    const junk = r.legs.find((l) => l.leg === 'junk')!;
    expect(junk.subPot).toBeGreaterThan(0);
    // Every dollar of the sub-pot is distributed...
    expect(junk.standings.reduce((s, x) => s + x.payout, 0)).toBeCloseTo(junk.subPot, 6);
    // ...evenly, since it's a dead heat.
    for (const s of junk.standings) {
      expect(s.payout).toBeCloseTo(junk.subPot / junk.standings.length, 6);
      // A paid team must not render as unplaced.
      expect(s.place).toBe(1);
    }
  });

  it('keeps the WHOLE game zero-sum with no junk scored', () => {
    const game = twoFoursomes({ junkValues: { ...noJunkValues } });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 1)],
      ['m2', flatRound(team2, 2)],
    ]));
    // This summed to -$50 before the fix — a quarter of the pot vanished.
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('stays zero-sum with 3 foursomes and a position split', () => {
    const game = makeGame({
      teamCount: 3, indexes: Array(12).fill(0), entryPerPlayer: 25,
      positionSplit: [70, 30], junkValues: { ...noJunkValues },
    });
    const ids = (n: number) => game.teams[n].playerIds;
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(ids(0), 0)],
      ['m2', flatRound(ids(1), 1)],
      ['m3', flatRound(ids(2), 2)],
    ]));
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('still ranks junk normally when someone DOES score it', () => {
    const game = twoFoursomes();   // default junk values
    const p1 = TEST_PARS.slice();
    p1[0] -= 1;                    // one birdie for team 1
    const r = computePoolResult(game, new Map([
      ['m1', [...scoresFor('p1', p1), ...flatRound(['p2', 'p3', 'p4'], 0)]],
      ['m2', flatRound(team2, 0)],
    ]));
    const junk = r.legs.find((l) => l.leg === 'junk')!;
    const winner = junk.standings.find((s) => s.place === 1)!;
    expect(winner.teamId).toBe('t1');
    expect(winner.payout).toBeCloseTo(junk.subPot, 6);   // winner-take-all
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// Match mode — head-to-head between exactly two foursomes
// ---------------------------------------------------------------------------

describe('computePoolResult — match mode', () => {
  const matchGame = (overrides: Partial<PoolGame> = {}) => twoFoursomes({
    moneyMode: 'match',
    matchConfig: {
      legDollars: { front: 10, back: 10, overall: 20 },
      junkPerPoint: 0,
      scoring: 'stroke',
      pointsPerHole: { win: 1, tie: 0.5, loss: 0 },
    },
    ...overrides,
  });

  it('has no pot', () => {
    const r = computePoolResult(matchGame(), new Map([
      ['m1', flatRound(team1, 0)],
      ['m2', flatRound(team2, 0)],
    ]));
    expect(r.pot).toBe(0);
  });

  it('pays fixed dollars per leg, per player, to the winner', () => {
    const r = computePoolResult(matchGame(), new Map([
      ['m1', flatRound(team1, 0)],    // wins front, back and overall
      ['m2', flatRound(team2, 1)],
    ]));
    const t1 = r.payouts.find((p) => p.teamId === 't1')!;
    // 10 + 10 + 20 = $40 per player, × 4 players = $160 team net.
    expect(t1.perPersonNet).toBe(40);
    expect(t1.net).toBe(160);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('pays nothing on a tied leg', () => {
    const r = computePoolResult(matchGame(), new Map([
      ['m1', flatRound(team1, 0)],
      ['m2', flatRound(team2, 0)],
    ]));
    for (const p of r.payouts) expect(p.perPersonNet).toBe(0);
  });

  it('settles junk as a differential', () => {
    const game = matchGame({
      matchConfig: {
        legDollars: { front: 0, back: 0, overall: 0 },
        junkPerPoint: 5,
        scoring: 'stroke',
        pointsPerHole: { win: 1, tie: 0.5, loss: 0 },
      },
      junkValues: { birdie: 1, eagle: 0, albatross: 0, groupHug: 0, ctp: 0 },
    });
    // Team 1 makes two more birdies than team 2 → 2 × $5 = $10 per player.
    const p1 = TEST_PARS.slice();
    p1[0] -= 1;
    p1[3] -= 1;
    const r = computePoolResult(game, new Map([
      ['m1', [...scoresFor('p1', p1), ...flatRound(['p2', 'p3', 'p4'], 0)]],
      ['m2', flatRound(team2, 0)],
    ]));
    const t1 = r.payouts.find((p) => p.teamId === 't1')!;
    expect(t1.junk).toBe(10);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('splits a nine into one leg only', () => {
    const game = matchGame({ holesPlaying: 'back9' });
    const nine = backNine();
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0, nine)],
      ['m2', flatRound(team2, 1, nine)],
    ]));
    const t1 = r.payouts.find((p) => p.teamId === 't1')!;
    // Only the overall leg pays on a nine ($20), not front+overall ($30).
    expect(t1.perPersonNet).toBe(20);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('pays nothing when the field is not exactly two foursomes', () => {
    const game = makeGame({
      teamCount: 3, indexes: Array(12).fill(0), moneyMode: 'match',
      matchConfig: {
        legDollars: { front: 10, back: 10, overall: 20 },
        junkPerPoint: 5, scoring: 'stroke',
        pointsPerHole: { win: 1, tie: 0.5, loss: 0 },
      },
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(game.teams[0].playerIds, 0)],
      ['m2', flatRound(game.teams[1].playerIds, 1)],
      ['m3', flatRound(game.teams[2].playerIds, 2)],
    ]));
    // Head-to-head is undefined for 3 teams — everyone flat, nothing invented.
    for (const p of r.payouts) expect(p.net).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Anti-sandbagging concealment
// ---------------------------------------------------------------------------

describe('filterConcealedScores', () => {
  it('passes everything through when the flag is off', () => {
    const game = twoFoursomes({ hideHolesUntilAllFinish: false });
    const map = new Map([['m1', flatRound(team1, 0, [1])], ['m2', []]]);
    expect(filterConcealedScores(game, map)).toBe(map);
  });

  it('hides holes not yet completed by EVERY foursome', () => {
    const game = twoFoursomes({ hideHolesUntilAllFinish: true });
    // Team 1 finished holes 1-3; team 2 only hole 1.
    const map = new Map([
      ['m1', flatRound(team1, 0, [1, 2, 3])],
      ['m2', flatRound(team2, 0, [1])],
    ]);
    const filtered = filterConcealedScores(game, map);
    expect(new Set(filtered.get('m1')!.map((s) => s.hole))).toEqual(new Set([1]));
    expect(new Set(filtered.get('m2')!.map((s) => s.hole))).toEqual(new Set([1]));
  });

  it('does not reveal a hole a team only partly finished', () => {
    const game = twoFoursomes({ hideHolesUntilAllFinish: true });
    const map = new Map([
      ['m1', flatRound(team1, 0, [1])],
      // Only 3 of 4 players on team 2 posted hole 1.
      ['m2', flatRound(['p5', 'p6', 'p7'], 0, [1])],
    ]);
    const filtered = filterConcealedScores(game, map);
    expect(filtered.get('m1')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Completion gate (drives status:'completed' → the stats & money ledger)
// ---------------------------------------------------------------------------

describe('isPoolGameFullyScored', () => {
  const game = twoFoursomes();

  it('is false with no scores', () => {
    expect(isPoolGameFullyScored(game, new Map())).toBe(false);
  });

  it('is false when only one foursome has finished', () => {
    const map = new Map([['m1', flatRound(team1, 0)]]);
    expect(isPoolGameFullyScored(game, map)).toBe(false);
  });

  it('is false when a single hole is missing', () => {
    const partial = flatRound(team1, 0).filter((s) => !(s.playerId === 'p4' && s.hole === 18));
    const map = new Map([['m1', partial], ['m2', flatRound(team2, 0)]]);
    expect(isPoolGameFullyScored(game, map)).toBe(false);
  });

  it('is true when every player in every foursome is scored on every hole', () => {
    const map = new Map([['m1', flatRound(team1, 0)], ['m2', flatRound(team2, 0)]]);
    expect(isPoolGameFullyScored(game, map)).toBe(true);
  });

  it('only requires the played nine on a 9-hole game', () => {
    const nineGame = twoFoursomes({ holesPlaying: 'back9' });
    const nine = backNine();
    const map = new Map([
      ['m1', flatRound(team1, 0, nine)],
      ['m2', flatRound(team2, 0, nine)],
    ]);
    expect(isPoolGameFullyScored(nineGame, map)).toBe(true);
    // The same scores do NOT complete an 18-hole game.
    expect(isPoolGameFullyScored(twoFoursomes(), map)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Player detail rows (the leaderboard's Player Details grid)
// ---------------------------------------------------------------------------

describe('computePoolPlayerDetails', () => {
  it('reports per-hole strokes, gross and net totals', () => {
    const game = twoFoursomes({ indexes: [18, 0, 0, 0, 0, 0, 0, 0], strokeMethod: 'full' });
    const details = computePoolPlayerDetails(game, new Map([
      ['m1', flatRound(team1, 1)],   // everyone bogeys
      ['m2', flatRound(team2, 0)],
    ]));
    const p1 = details.find((d) => d.teamId === 't1')!.players.find((p) => p.playerId === 'p1')!;
    expect(p1.playingHcap).toBe(18);
    expect(p1.grossTotal).toBe(90);      // 72 + 18
    expect(p1.netTotal).toBe(72);        // one stroke on every hole
    expect(p1.holes.every((h) => h.strokes === 1)).toBe(true);
  });

  it('leaves totals null before any score is entered', () => {
    const details = computePoolPlayerDetails(twoFoursomes(), new Map());
    const p1 = details[0].players[0];
    expect(p1.grossTotal).toBeNull();
    expect(p1.netTotal).toBeNull();
    // Strokes are still known from the handicap — that's tee-box information.
    expect(p1.holes).toHaveLength(18);
  });

  it('restricts to the played nine', () => {
    const details = computePoolPlayerDetails(twoFoursomes({ holesPlaying: 'back9' }), new Map());
    expect(details[0].players[0].holes.map((h) => h.holeNumber)).toEqual(backNine());
  });
});

// ---------------------------------------------------------------------------
// Sanity: the fixture's hole set
// ---------------------------------------------------------------------------

describe('getGameHoles', () => {
  it('returns 18, front 9, or back 9 per holesPlaying', () => {
    expect(getGameHoles(makeGame()).map((h) => h.number)).toHaveLength(18);
    expect(getGameHoles(makeGame({ holesPlaying: 'front9' })).map((h) => h.number)).toEqual(frontNine());
    expect(getGameHoles(makeGame({ holesPlaying: 'back9' })).map((h) => h.number)).toEqual(backNine());
  });
});
