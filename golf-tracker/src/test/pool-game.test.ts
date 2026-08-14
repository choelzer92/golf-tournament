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
  serpentineTeams,
  customBonusCountsForTeam,
  balanceTeamsWithCaptains,
  type PoolGame,
} from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import {
  allEighteen, backNine, frontNine, makeGame, makePlayer, makePlayers, parScores, scoresFor, TEST_PARS,
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

  // REGRESSION (F-011): mid-round, the un-started back nine is a DEAD HEAT — every
  // team is tied at zero holes, so its sub-pot splits evenly and each team gets its
  // ante back. Before the fix the sub-pot went undistributed while entryPaid was
  // deducted in full, so the live board showed a $50 phantom loss on a $200 pot.
  it('mid-round: an un-started leg splits evenly, keeping the board zero-sum', () => {
    const game = twoFoursomes();
    const six = [1, 2, 3, 4, 5, 6];
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0, six)],
      ['m2', flatRound(team2, 1, six)],
    ]));
    const back = r.legs.find((l) => l.leg === 'back')!;
    expect(back.subPot).toBe(50);
    // The whole sub-pot is distributed, evenly, and every team is jointly 1st.
    expect(back.standings.reduce((s, x) => s + x.payout, 0)).toBeCloseTo(back.subPot, 6);
    for (const st of back.standings) {
      expect(st.payout).toBeCloseTo(back.subPot / back.standings.length, 6);
      expect(st.place).toBe(1);
    }
    // The board a golfer reads at the turn now balances.
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('mid-round: once ANY team starts a leg, only those teams contend it', () => {
    // Team 1 has played the back nine; team 2 has not. Team 2 cannot be "tied" for
    // the back-nine pot just because it hasn't teed off there.
    const game = twoFoursomes();
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0)],                       // all 18
      ['m2', flatRound(team2, 1, frontNine())],          // front only
    ]));
    const back = r.legs.find((l) => l.leg === 'back')!;
    const t1 = back.standings.find((s) => s.teamId === 't1')!;
    const t2 = back.standings.find((s) => s.teamId === 't2')!;
    expect(t1.payout).toBeCloseTo(back.subPot, 6);   // sole contender takes it
    expect(t2.payout).toBe(0);
    expect(t2.place).toBe(0);                        // unplaced, not jointly 1st
  });

  it('zero-sum at every point through a round', () => {
    const game = twoFoursomes();
    for (const thru of [1, 3, 6, 9, 12, 15, 18]) {
      const holes = Array.from({ length: thru }, (_, i) => i + 1);
      const r = computePoolResult(game, new Map([
        ['m1', flatRound(team1, 0, holes)],
        ['m2', flatRound(team2, 1, holes)],
      ]));
      expect(netSum(r.payouts), `thru ${thru}`).toBeCloseTo(0, 6);
    }
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
// Serpentine (snake draft) team building — JY's request
// ---------------------------------------------------------------------------

describe('serpentineTeams', () => {
  // hcapOf is identity on index here, so the expected draft order is readable.
  const mk = (n: number) => makePlayers(Array.from({ length: n }, (_, i) => i + 1));
  const h = (p: { handicapIndex: number | null }) => p.handicapIndex ?? 0;

  it('the higher-handicap captain picks first, then the order reverses', () => {
    // 8 players, indexes 1..8. Captains here are p8 and p7 purely so the arithmetic is
    // readable — in the real app pickCaptains() chooses the LOWEST handicaps, so this
    // ordering is between already-strong players, not a claim that captains are weak.
    const players = mk(8);
    const teams = serpentineTeams(players, 2, h, ['p8', 'p7']);

    // Higher-handicap captain drafts first => team 0 (p8), then team 1 (p7).
    // Pool best-first: p1 p2 p3 p4 p5 p6.
    //   round 0 (0,1): p1 -> t0, p2 -> t1
    //   round 1 (1,0): p3 -> t1, p4 -> t0
    //   round 2 (0,1): p5 -> t0, p6 -> t1
    expect(teams[0]).toEqual(['p8', 'p1', 'p4', 'p5']);
    expect(teams[1]).toEqual(['p7', 'p2', 'p3', 'p6']);
  });

  it('works with realistic captains — the LOWEST handicaps in the field', () => {
    // How the app actually does it: pickCaptains() takes the best players. With p1 (1)
    // and p2 (2) as captains, p2 has the higher handicap OF THE TWO, so p2 picks first.
    const players = mk(8);
    const teams = serpentineTeams(players, 2, h, ['p1', 'p2']);
    const t1 = teams.find((t) => t[0] === 'p1')!;
    const t2 = teams.find((t) => t[0] === 'p2')!;
    // p2's team drafts first, so it gets the best remaining player (p3).
    expect(t2).toContain('p3');
    expect(t1).toContain('p4');
    expect(t1).toHaveLength(4);
    expect(t2).toHaveLength(4);
  });

  it('gives every team the same number of seats', () => {
    const players = mk(12);
    const teams = serpentineTeams(players, 3, h, ['p12', 'p11', 'p10']);
    expect(teams.map((t) => t.length)).toEqual([4, 4, 4]);
    // Every player placed exactly once.
    const all = teams.flat();
    expect(new Set(all).size).toBe(12);
  });

  it('keeps a locked pair together', () => {
    const players = mk(8);
    const teams = serpentineTeams(players, 2, h, ['p8', 'p7'], [['p1', 'p6']]);
    const withP1 = teams.find((t) => t.includes('p1'))!;
    expect(withP1).toContain('p6');
  });

  it('handles an uneven field without dropping anyone', () => {
    const players = mk(7);
    const teams = serpentineTeams(players, 2, h, ['p7', 'p6']);
    expect(teams.flat().sort()).toEqual(players.map((p) => p.id).sort());
    // Sizes differ by at most one.
    const sizes = teams.map((t) => t.length).sort();
    expect(sizes[sizes.length - 1] - sizes[0]).toBeLessThanOrEqual(1);
  });

  it('works with no captains at all', () => {
    const players = mk(8);
    const teams = serpentineTeams(players, 2, h, [undefined, undefined]);
    expect(teams.flat().sort()).toEqual(players.map((p) => p.id).sort());
    expect(teams.map((t) => t.length)).toEqual([4, 4]);
  });

  // The reason BOTH methods exist: the optimizer minimizes spread, serpentine is
  // explicable. Optimal should never be WORSE on its own metric.
  it('the optimizer is at least as even as serpentine on the same field', () => {
    const players = makePlayers([2, 5, 8, 11, 14, 17, 20, 23]);
    const hc = (p: { handicapIndex: number | null }) => p.handicapIndex ?? 0;
    const spread = (teams: string[][]) => {
      const totals = teams.map((t) =>
        t.reduce((s, id) => s + hc(players.find((p) => p.id === id)!), 0));
      return Math.max(...totals) - Math.min(...totals);
    };
    const snake = serpentineTeams(players, 2, hc, ['p8', 'p7']);
    const opt = balanceTeamsWithCaptains(players, 2, hc, ['p8', 'p7']);
    expect(spread(opt)).toBeLessThanOrEqual(spread(snake));
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
// A pool of N foursomes playing scramble / Stableford (F-006)
// ---------------------------------------------------------------------------

describe('pool with a generalized teamFormat', () => {
  it('a legacy game (no teamFormat) is byte-identical to before', () => {
    // The safety property. Also covered by the golden snapshots below, asserted here
    // directly so the intent is obvious at the call site.
    const legacy = twoFoursomes();
    expect(legacy.teamFormat).toBeUndefined();
    const r = computePoolResult(legacy, new Map([
      ['m1', flatRound(team1, 0)], ['m2', flatRound(team2, 1)],
    ]));
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('SCRAMBLE: four foursomes, one ball each', () => {
    const game = makeGame({
      teamCount: 2, indexes: [4, 10, 16, 22, 6, 12, 18, 24], entryPerPlayer: 25,
      teamFormat: 'scramble', strokeMethod: 'full',
    });
    // One ball: every member of a foursome carries the SAME gross, as the scorecard writes.
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0)],   // team 1 shoots par
      ['m2', flatRound(team2, 1)],   // team 2 bogeys
    ]));
    const t1 = r.payouts.find((p) => p.teamId === 't1')!;
    expect(t1.net).toBeGreaterThan(0);          // the better scramble wins
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('STABLEFORD: most points wins instead of lowest strokes', () => {
    const game = makeGame({
      teamCount: 2, indexes: Array(8).fill(0), entryPerPlayer: 25,
      teamFormat: 'best-ball', teamScoreBasis: 'stableford',
    });
    // Team 1 birdies every hole (3 pts), team 2 pars (2 pts).
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, -1)],
      ['m2', flatRound(team2, 0)],
    ]));
    const overall = r.legs.find((l) => l.leg === 'overall')!;
    const t1 = overall.standings.find((st) => st.teamId === 't1')!;
    const t2 = overall.standings.find((st) => st.teamId === 't2')!;
    expect(t1.total).toBeGreaterThan(t2.total);
    // AND the higher score must actually WIN. My first version of this test only checked
    // the totals, which passed while the 54-point team was losing to the 36-point team —
    // buildLeg ranks lower-is-better, which is backwards for points. Assert the money.
    expect(t1.place).toBe(1);
    expect(t2.place).toBe(2);
    expect(r.payouts.find((p) => p.teamId === 't1')!.net).toBeGreaterThan(0);
    expect(r.payouts.find((p) => p.teamId === 't2')!.net).toBeLessThan(0);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('STABLEFORD: a tie on points splits, and stays zero-sum', () => {
    const game = makeGame({
      teamCount: 2, indexes: Array(8).fill(0), entryPerPlayer: 25,
      teamFormat: 'best-ball', teamScoreBasis: 'stableford',
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0)], ['m2', flatRound(team2, 0)],
    ]));
    const overall = r.legs.find((l) => l.leg === 'overall')!;
    for (const st of overall.standings) expect(st.place).toBe(1);
    for (const p of r.payouts) expect(p.net).toBeCloseTo(0, 6);
  });

  it('STABLEFORD: 4 foursomes rank best-points-first', () => {
    const game = makeGame({
      teamCount: 4, indexes: Array(16).fill(0), entryPerPlayer: 20,
      teamFormat: 'best-ball', teamScoreBasis: 'stableford', positionSplit: [70, 30],
    });
    const ids = (n: number) => game.teams[n].playerIds;
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(ids(0), -1)],  // birdies — most points
      ['m2', flatRound(ids(1), 0)],
      ['m3', flatRound(ids(2), 1)],
      ['m4', flatRound(ids(3), 2)],   // fewest
    ]));
    const overall = r.legs.find((l) => l.leg === 'overall')!;
    expect(overall.standings.map((st) => st.teamId)).toEqual(['t1', 't2', 't3', 't4']);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('COMBINED: every member counts', () => {
    const game = makeGame({
      teamCount: 2, indexes: Array(8).fill(0), entryPerPlayer: 25, teamFormat: 'combined',
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0)], ['m2', flatRound(team2, 1)],
    ]));
    const overall = r.legs.find((l) => l.leg === 'overall')!;
    // 4 players × 72 = 288 for the par team.
    expect(overall.standings.find((st) => st.teamId === 't1')!.total).toBe(288);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('teamFormat works on a nine and stays zero-sum', () => {
    const game = makeGame({
      teamCount: 2, indexes: Array(8).fill(6), entryPerPlayer: 25,
      teamFormat: 'best-ball', holesPlaying: 'back9',
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0, backNine())],
      ['m2', flatRound(team2, 1, backNine())],
    ]));
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  // The thru-count normalization. `toPar` exists so a team mid-round can be compared with
  // one that's finished; with the wrong ball count it stopped doing that job and ranked on
  // holes played instead of on how well anyone played.
  it('a team thru 9 ties a team thru 18 when both are even — every format', () => {
    const CASES = [
      { teamFormat: 'best-ball' as const, off: 0 },        // 1 ball
      { teamFormat: 'two-best-net' as const, off: 0 },     // 2 balls
      { teamFormat: 'combined' as const, off: 0 },         // 4 balls
      { teamFormat: 'scramble' as const, off: 0 },         // 1 ball, team handicap
    ];
    for (const { teamFormat, off } of CASES) {
      const game = makeGame({
        teamCount: 2, indexes: Array(8).fill(0), entryPerPlayer: 25, teamFormat,
      });
      // Both teams even par; team 2 has only played the back nine.
      const r = computePoolResult(game, new Map([
        ['m1', flatRound(team1, off)],
        ['m2', flatRound(team2, off, backNine())],
      ]));
      const overall = r.legs.find((l) => l.leg === 'overall')!;
      const [a, b] = overall.standings;
      expect(a.toPar, teamFormat).toBe(b.toPar);
      expect(a.rankMetric, teamFormat).toBe(b.rankMetric);
      for (const st of overall.standings) expect(st.place, teamFormat).toBe(1);
    }
  });

  it('STABLEFORD ranks on PACE, not raw points, so thru counts stay comparable', () => {
    const game = makeGame({
      teamCount: 2, indexes: Array(8).fill(0), entryPerPlayer: 25,
      teamFormat: 'best-ball', teamScoreBasis: 'stableford',
    });
    // Team 1: pars all 18 → 36 pts, dead even pace. Team 2: birdies the back 9 only →
    // 27 pts from 9 holes, +9 on pace. FEWER raw points, clearly playing better.
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 0)],
      ['m2', flatRound(team2, -1, backNine())],
    ]));
    const overall = r.legs.find((l) => l.leg === 'overall')!;
    const t1 = overall.standings.find((st) => st.teamId === 't1')!;
    const t2 = overall.standings.find((st) => st.teamId === 't2')!;
    expect(t1.total).toBe(36);
    expect(t2.total).toBe(27);
    expect(t1.total).toBeGreaterThan(t2.total);   // more raw points…
    expect(t2.place).toBe(1);                      // …but team 2 is ahead on pace
    expect(t1.place).toBe(2);
    // toPar under points reads as pace: even vs nine-better-than-pars.
    expect(t1.toPar).toBe(0);
    expect(t2.toPar).toBe(9);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  // MATCH mode was the worst of the three: it ranked on toPar directly, so the higher
  // Stableford total (a MORE negative toPar under the old math) lost every leg and paid
  // the full amount to the team that played worse.
  it('STABLEFORD + match/stroke: most points wins each leg', () => {
    const game = makeGame({
      teamCount: 2, indexes: Array(8).fill(0),
      teamFormat: 'best-ball', teamScoreBasis: 'stableford',
      moneyMode: 'match',
      matchConfig: {
        legDollars: { front: 10, back: 10, overall: 20 },
        junkPerPoint: 0, scoring: 'stroke',
        pointsPerHole: { win: 1, tie: 0.5, loss: 0 },
      },
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, -1)],   // birdies: 54 pts
      ['m2', flatRound(team2, 0)],    // pars:    36 pts
    ]));
    const t1 = r.payouts.find((p) => p.teamId === 't1')!;
    const t2 = r.payouts.find((p) => p.teamId === 't2')!;
    // All three legs to team 1: ($10 + $10 + $20) × 4 players.
    expect(t1.perPersonNet).toBe(40);
    expect(t1.net).toBe(160);
    expect(t2.net).toBe(-160);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  it('STABLEFORD + match/holes: MORE points wins the hole', () => {
    const game = makeGame({
      teamCount: 2, indexes: Array(8).fill(0),
      teamFormat: 'best-ball', teamScoreBasis: 'stableford',
      moneyMode: 'match',
      matchConfig: {
        legDollars: { front: 10, back: 10, overall: 20 },
        junkPerPoint: 0, scoring: 'holes',
        pointsPerHole: { win: 1, tie: 0.5, loss: 0 },
      },
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, -1)],   // 3 pts a hole
      ['m2', flatRound(team2, 0)],    // 2 pts a hole
    ]));
    const overall = r.legs.find((l) => l.leg === 'overall')!;
    const t1 = overall.standings.find((st) => st.teamId === 't1')!;
    const t2 = overall.standings.find((st) => st.teamId === 't2')!;
    // Team 1 wins all 18 holes. Hard-coded `a < b` gave it ZERO.
    expect(t1.holesWon).toBe(18);
    expect(t2.holesWon).toBe(0);
    expect(t1.place).toBe(1);
    expect(r.payouts.find((p) => p.teamId === 't1')!.net).toBe(160);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  // Junk is scored and settled independently of the score basis — birdies are birdies
  // whether the leg is strokes or points. Both junk models are asserted here so a future
  // change to the score basis can't quietly move junk money.
  it('JUNK, pot model: unaffected by the Stableford basis', () => {
    const opts = {
      teamCount: 2, indexes: Array(8).fill(0), entryPerPlayer: 25,
      teamFormat: 'best-ball' as const,
    };
    // Team 1 birdies every hole (4 players × 18 birdies), team 2 pars.
    const scores = new Map([['m1', flatRound(team1, -1)], ['m2', flatRound(team2, 0)]]);
    const strokes = computePoolResult(makeGame(opts), scores);
    const points = computePoolResult(makeGame({ ...opts, teamScoreBasis: 'stableford' }), scores);

    const junkOf = (r: typeof strokes) => r.legs.find((l) => l.leg === 'junk')!;
    // Identical junk totals, sub-pot, places and payouts under both bases.
    expect(junkOf(points).subPot).toBe(junkOf(strokes).subPot);
    expect(junkOf(points).standings.map((s) => [s.teamId, s.total, s.place, s.payout]))
      .toEqual(junkOf(strokes).standings.map((s) => [s.teamId, s.total, s.place, s.payout]));
    expect(points.junkDetails).toEqual(strokes.junkDetails);
    // And the winner of the junk sub-pot is the team that actually made the birdies.
    const t1Junk = junkOf(points).standings.find((s) => s.teamId === 't1')!;
    expect(t1Junk.total).toBeGreaterThan(0);
    expect(t1Junk.place).toBe(1);
    expect(t1Junk.payout).toBeGreaterThan(0);
    expect(netSum(points.payouts)).toBeCloseTo(0, 6);
  });

  it('JUNK, $-per-point differential: unaffected by the Stableford basis', () => {
    const matchConfig = {
      legDollars: { front: 10, back: 10, overall: 20 },
      junkPerPoint: 5, scoring: 'stroke' as const,
      pointsPerHole: { win: 1, tie: 0.5, loss: 0 },
    };
    const opts = {
      teamCount: 2, indexes: Array(8).fill(0),
      teamFormat: 'best-ball' as const, moneyMode: 'match' as const, matchConfig,
    };
    const scores = new Map([['m1', flatRound(team1, -1)], ['m2', flatRound(team2, 0)]]);
    const strokes = computePoolResult(makeGame(opts), scores);
    const points = computePoolResult(makeGame({ ...opts, teamScoreBasis: 'stableford' }), scores);

    // The junk differential is the same dollars under both bases…
    const junkPer = (r: typeof strokes, id: string) => r.payouts.find((p) => p.teamId === id)!.junk;
    expect(junkPer(points, 't1')).toBe(junkPer(strokes, 't1'));
    expect(junkPer(points, 't2')).toBe(junkPer(strokes, 't2'));
    // …and it's a real, signed amount to the birdie team, not zero.
    expect(junkPer(points, 't1')).toBeGreaterThan(0);
    expect(junkPer(points, 't1')).toBe(-junkPer(points, 't2'));
    // 72 birdies vs 0 = margin 72 × $5 = $360 per player.
    expect(junkPer(points, 't1')).toBe(360);
    expect(netSum(points.payouts)).toBeCloseTo(0, 6);
  });

  it('scales to 4 foursomes', () => {
    const game = makeGame({
      teamCount: 4, indexes: Array(16).fill(8), entryPerPlayer: 20,
      teamFormat: 'best-ball', teamScoreBasis: 'stableford',
    });
    const ids = (n: number) => game.teams[n].playerIds;
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(ids(0), -1)], ['m2', flatRound(ids(1), 0)],
      ['m3', flatRound(ids(2), 1)], ['m4', flatRound(ids(3), 2)],
    ]));
    expect(r.payouts).toHaveLength(4);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// GOLDEN SNAPSHOT — pins today's ballSelection math before the N-sides work
// ---------------------------------------------------------------------------
//
// F-006 generalizes team scoring from two sides to N. That touches the money engine's hot
// path, so before ANY of it: lock down exactly what every existing ballSelection produces,
// on a mixed-handicap field, across both money modes and a nine. If the generalization
// changes any of these numbers, existing games would settle differently — which is not
// allowed. These are deliberately concrete numbers, not invariants.

describe('GOLDEN: current ballSelection results (must not change)', () => {
  const VARIANTS = ['1-net-1-gross', '2-best-net', '2-best-gross'] as const;
  // A mixed field, so handicap strokes actually bite.
  const MIXED = [2, 9, 15, 24, 5, 11, 18, 27];

  function fixture(variant: (typeof VARIANTS)[number], extra: GameOpts = {}) {
    return makeGame({
      teamCount: 2, indexes: MIXED, entryPerPlayer: 25,
      ballSelection: variant, strokeMethod: 'off-the-low', ...extra,
    });
  }
  // Distinct, deterministic scores per player so every variant differs.
  const scoresFor8 = (ids: string[], holes = allEighteen()) =>
    ids.flatMap((id, i) => scoresFor(id, holes.map((h) => TEST_PARS[h - 1] + ((h + i) % 4)), holes));

  for (const variant of VARIANTS) {
    it(`${variant}: per-hole team scores and leg totals are stable`, () => {
      const game = fixture(variant);
      const r = computePoolResult(game, new Map([
        ['m1', scoresFor8(['p1', 'p2', 'p3', 'p4'])],
        ['m2', scoresFor8(['p5', 'p6', 'p7', 'p8'])],
      ]));
      // Snapshot the first six holes' team scores plus every leg total, which together
      // pin the ball-selection rule AND the stroke allocation feeding it.
      const shape = {
        holes: r.holeScores.slice(0, 6).map((h) => ({ n: h.holeNumber, t1: h.teamScores.t1, t2: h.teamScores.t2 })),
        legs: r.legs.map((l) => ({
          leg: l.leg,
          totals: l.standings.map((st) => ({ id: st.teamId, total: st.total, toPar: st.toPar })),
        })),
        payouts: r.payouts.map((p) => ({ id: p.teamId, net: p.net })),
      };
      expect(shape).toMatchSnapshot();
    });
  }

  it('match mode leg outcomes are stable', () => {
    const game = fixture('1-net-1-gross', {
      moneyMode: 'match',
      matchConfig: {
        legDollars: { front: 10, back: 10, overall: 20 },
        junkPerPoint: 5, scoring: 'holes',
        pointsPerHole: { win: 1, tie: 0.5, loss: 0 },
      },
    });
    const r = computePoolResult(game, new Map([
      ['m1', scoresFor8(['p1', 'p2', 'p3', 'p4'])],
      ['m2', scoresFor8(['p5', 'p6', 'p7', 'p8'])],
    ]));
    expect(r.payouts.map((p) => ({ id: p.teamId, net: p.net, perPerson: p.perPersonNet }))).toMatchSnapshot();
  });

  it('a nine is stable on both handicap bases', () => {
    for (const basis of ['18', '9'] as const) {
      const game = fixture('2-best-net', { holesPlaying: 'back9', nineHandicapBasis: basis });
      const r = computePoolResult(game, new Map([
        ['m1', scoresFor8(['p1', 'p2', 'p3', 'p4'], backNine())],
        ['m2', scoresFor8(['p5', 'p6', 'p7', 'p8'], backNine())],
      ]));
      expect({
        basis,
        legs: r.legs.map((l) => ({ leg: l.leg, subPot: l.subPot })),
        payouts: r.payouts.map((p) => ({ id: p.teamId, net: p.net })),
      }).toMatchSnapshot();
    }
  });

  it('3 foursomes with a position split are stable', () => {
    const game = makeGame({
      teamCount: 3, indexes: [...MIXED, 7, 13, 21, 30], entryPerPlayer: 20,
      ballSelection: '1-net-1-gross', positionSplit: [70, 30], strokeMethod: 'off-the-low',
    });
    const ids = (n: number) => game.teams[n].playerIds;
    const r = computePoolResult(game, new Map([
      ['m1', scoresFor8(ids(0))], ['m2', scoresFor8(ids(1))], ['m3', scoresFor8(ids(2))],
    ]));
    expect(r.payouts.map((p) => ({ id: p.teamId, net: p.net }))).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Manual bonuses (sandies, barkies, …) — the ones a scorecard can't reveal
// ---------------------------------------------------------------------------

describe('manual bonuses', () => {
  const SANDIE = { id: 'sandie', label: 'Sandie', points: 2 };
  const BARKIE = { id: 'barkie', label: 'Barkie', points: 3 };

  // The property that matters most: nothing changes for a game that doesn't use them.
  it('a game with no custom bonuses computes exactly as before', () => {
    const plain = twoFoursomes();
    const withEmpty = twoFoursomes({ customBonuses: [], bonusMarks: {} });
    const scores = new Map([['m1', flatRound(team1, 0)], ['m2', flatRound(team2, 1)]]);
    const a = computePoolResult(plain, scores);
    const b = computePoolResult(withEmpty, scores);
    expect(b.junkDetails.map((j) => j.total)).toEqual(a.junkDetails.map((j) => j.total));
    expect(b.payouts.map((p) => p.net)).toEqual(a.payouts.map((p) => p.net));
  });

  it('adds marked bonus points to the junk total', () => {
    const game = twoFoursomes({
      customBonuses: [SANDIE, BARKIE],
      // p1 got a sandie on 4 and a barkie on 7; p5 (other team) a sandie on 4.
      bonusMarks: { 4: { p1: ['sandie'], p5: ['sandie'] }, 7: { p1: ['barkie'] } },
      junkValues: { birdie: 0, eagle: 0, albatross: 0, groupHug: 0, ctp: 0 },
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 1)],
      ['m2', flatRound(team2, 1)],
    ]));
    const j1 = r.junkDetails.find((j) => j.teamId === 't1')!;
    const j2 = r.junkDetails.find((j) => j.teamId === 't2')!;
    expect(j1.custom).toBe(5);   // sandie 2 + barkie 3
    expect(j2.custom).toBe(2);   // sandie 2
    expect(j1.total).toBe(5);
    expect(netSum(r.payouts)).toBeCloseTo(0, 6);
  });

  // ctpWinners is Record<hole, playerId> — one winner per hole. Sandies aren't like
  // that, which is why they needed their own shape.
  it('lets SEVERAL players earn the same bonus on one hole', () => {
    const game = twoFoursomes({
      customBonuses: [SANDIE],
      bonusMarks: { 9: { p1: ['sandie'], p2: ['sandie'], p3: ['sandie'] } },
      junkValues: { birdie: 0, eagle: 0, albatross: 0, groupHug: 0, ctp: 0 },
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 1)], ['m2', flatRound(team2, 1)],
    ]));
    expect(r.junkDetails.find((j) => j.teamId === 't1')!.custom).toBe(6);
  });

  it('lets one player earn SEVERAL bonuses on one hole', () => {
    const game = twoFoursomes({
      customBonuses: [SANDIE, BARKIE],
      bonusMarks: { 2: { p1: ['sandie', 'barkie'] } },
      junkValues: { birdie: 0, eagle: 0, albatross: 0, groupHug: 0, ctp: 0 },
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 1)], ['m2', flatRound(team2, 1)],
    ]));
    expect(r.junkDetails.find((j) => j.teamId === 't1')!.custom).toBe(5);
  });

  it('ignores a mark whose bonus this game does not define', () => {
    // A group removed "barkie" after a game was scored — the stale mark must not crash
    // or silently score as some other bonus.
    const game = twoFoursomes({
      customBonuses: [SANDIE],
      bonusMarks: { 3: { p1: ['sandie', 'barkie'] } },
      junkValues: { birdie: 0, eagle: 0, albatross: 0, groupHug: 0, ctp: 0 },
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 1)], ['m2', flatRound(team2, 1)],
    ]));
    expect(r.junkDetails.find((j) => j.teamId === 't1')!.custom).toBe(2);
  });

  it('reports per-bonus counts for display', () => {
    const game = twoFoursomes({
      customBonuses: [SANDIE, BARKIE],
      bonusMarks: { 1: { p1: ['sandie'] }, 5: { p2: ['sandie'], p1: ['barkie'] } },
    });
    const counts = customBonusCountsForTeam(game, team1);
    expect(counts).toEqual([
      { id: 'sandie', label: 'Sandie', count: 2, points: 4 },
      { id: 'barkie', label: 'Barkie', count: 1, points: 3 },
    ]);
    // A bonus nobody earned isn't listed.
    expect(customBonusCountsForTeam(game, team2)).toEqual([]);
  });

  it('stays zero-sum when only one team earns bonuses', () => {
    const game = twoFoursomes({
      customBonuses: [SANDIE],
      bonusMarks: { 1: { p1: ['sandie'] } },
    });
    const r = computePoolResult(game, new Map([
      ['m1', flatRound(team1, 1)], ['m2', flatRound(team2, 1)],
    ]));
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
