// Compute tests for every registered game mode.
//
// These assert the MONEY MATH — the part that costs real dollars when it's wrong.
// Every expected number below is hand-derivable because the fixture course has
// slope 113 + rating == par (Course Handicap == Handicap Index) and stroke index
// == hole number. See fixtures.test.ts, which verifies those two assumptions.
//
// Nothing here touches Supabase, the network, or a browser: the modes' compute()
// functions are pure. See AGENTS.md.

import { describe, expect, it } from 'vitest';
import { GAME_MODES, getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import { computeGameResult, gameListSubtitle, isSingleGroupGame } from '@/lib/game-modes/result';
import type { IndividualResult, PlayerStanding } from '@/lib/game-modes/types';
import type { PoolGame } from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import {
  backNine, frontNine, makeGame, parScores, scoresFor, singleMatchup, TEST_PARS,
} from './fixtures';

// --- helpers ---------------------------------------------------------------

// Run a mode's compute() over one foursome's scores.
function run(game: PoolGame, scores: GameScore[]): IndividualResult {
  const mode = getGameMode(game.gameMode);
  if (!mode) throw new Error(`no such mode: ${game.gameMode}`);
  return mode.compute(buildGameModeContext(game, singleMatchup(scores)));
}

const standing = (r: IndividualResult, playerId: string): PlayerStanding => {
  const s = r.standings.find((x) => x.playerId === playerId);
  if (!s) throw new Error(`no standing for ${playerId}`);
  return s;
};

// Money must be zero-sum: what one player wins, the others collectively lose.
const totalMoney = (r: IndividualResult) => r.standings.reduce((sum, s) => sum + s.moneyNet, 0);

// ---------------------------------------------------------------------------
// Invariants that must hold for EVERY mode
// ---------------------------------------------------------------------------

describe('every registered mode', () => {
  it('has a unique id and a coherent descriptor', () => {
    const ids = GAME_MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of GAME_MODES) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.playersMin).toBeGreaterThanOrEqual(2);
      expect(m.playersMax).toBeGreaterThanOrEqual(m.playersMin);
      expect(['individual', 'team-within-group', 'team']).toContain(m.category);
    }
  });

  // The audit's root cause: a mode that renders on one leaderboard axis but not
  // the other. Every registered mode is single-group by construction.
  it('routes to the single-group leaderboard', () => {
    for (const m of GAME_MODES) {
      expect(isSingleGroupGame(makeGame({ gameMode: m.id }))).toBe(true);
    }
  });

  it('returns an empty-but-valid result with no scores', () => {
    for (const m of GAME_MODES) {
      const indexes = Array(m.playersMax).fill(10);
      const game = makeGame({ gameMode: m.id, indexes });
      const r = run(game, []);
      expect(r.thruHole, m.id).toBe(0);
      expect(r.standings.length, m.id).toBeGreaterThan(0);
      // Nobody owes anything before a ball is struck.
      expect(totalMoney(r), m.id).toBeCloseTo(0, 6);
      for (const s of r.standings) expect(s.thru, `${m.id}/${s.playerId}`).toBe(0);
    }
  });

  it('is zero-sum once everyone has played (default money model)', () => {
    for (const m of GAME_MODES) {
      const n = m.playersMax;
      const game = makeGame({ gameMode: m.id, indexes: Array(n).fill(9) });
      const ids = game.players.map((p) => p.id);
      // Give each player a distinct-ish round so there are real winners/losers.
      const scores = ids.flatMap((id, i) =>
        scoresFor(id, TEST_PARS.map((par) => par + (i % 2 === 0 ? 0 : 1))),
      );
      const r = run(game, scores);
      expect(totalMoney(r), `${m.id} money must be zero-sum`).toBeCloseTo(0, 6);
    }
  });

  // playersMin exists so a mode can be played short-handed. The audit found a
  // hardcoded `>= 4` that broke exactly this case, so exercise it explicitly.
  it('works at playersMin, not just a full foursome', () => {
    for (const m of GAME_MODES) {
      const n = m.playersMin;
      const game = makeGame({ gameMode: m.id, indexes: Array(n).fill(12) });
      const ids = game.players.map((p) => p.id);
      const scores = ids.flatMap((id, i) => scoresFor(id, TEST_PARS.map((p) => p + i)));
      const r = run(game, scores);
      // A 2v2 always reports TWO standings (the sides), however many players.
      // Every other mode reports one row per player.
      const expected = m.category === 'team-within-group' ? 2 : n;
      expect(r.standings.length, m.id).toBe(expected);
      expect(totalMoney(r), `${m.id} zero-sum at ${n} players`).toBeCloseTo(0, 6);
    }
  });

  it('handles a 9-hole game on both handicap bases', () => {
    for (const m of GAME_MODES) {
      for (const basis of ['18', '9'] as const) {
        const game = makeGame({
          gameMode: m.id, indexes: Array(m.playersMax).fill(8),
          holesPlaying: 'back9', nineHandicapBasis: basis,
        });
        const ids = game.players.map((p) => p.id);
        const scores = ids.flatMap((id, i) => scoresFor(id, backNine().map((h) => TEST_PARS[h - 1] + (i % 2)), backNine()));
        const r = run(game, scores);
        const label = `${m.id}/nine-basis-${basis}`;
        // Only the played nine counts.
        expect(r.thruHole, label).toBeGreaterThan(9);
        for (const s of r.standings) expect(s.thru, label).toBeLessThanOrEqual(9);
        expect(totalMoney(r), `${label} zero-sum`).toBeCloseTo(0, 6);
      }
    }
  });

  it('ignores holes nobody has played yet (partial round)', () => {
    for (const m of GAME_MODES) {
      const game = makeGame({ gameMode: m.id, indexes: Array(m.playersMax).fill(10) });
      const ids = game.players.map((p) => p.id);
      const thru6 = [1, 2, 3, 4, 5, 6];
      const scores = ids.flatMap((id, i) =>
        scoresFor(id, thru6.map((h) => TEST_PARS[h - 1] + (i % 2)), thru6),
      );
      const r = run(game, scores);
      expect(r.thruHole, m.id).toBe(6);
      for (const s of r.standings) expect(s.thru, m.id).toBeLessThanOrEqual(6);
      expect(totalMoney(r), `${m.id} zero-sum mid-round`).toBeCloseTo(0, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// Handicap strokes — the foundation every net-based mode sits on
// ---------------------------------------------------------------------------

describe('handicap strokes', () => {
  it('gives a 6-handicap strokes on stroke index 1-6 only', () => {
    const game = makeGame({ gameMode: 'low-total', indexes: [6, 0] });
    const ctx = buildGameModeContext(game, singleMatchup([]));
    const strokesOn = (n: number) => ctx.strokesOnHole('p1', ctx.holes[n - 1]);
    expect([1, 2, 3, 4, 5, 6].map(strokesOn)).toEqual([1, 1, 1, 1, 1, 1]);
    expect([7, 8, 18].map(strokesOn)).toEqual([0, 0, 0]);
    // Scratch player gets none anywhere.
    expect(ctx.strokesOnHole('p2', ctx.holes[0])).toBe(0);
  });

  it('gives a 20-handicap two strokes on index 1-2', () => {
    const game = makeGame({ gameMode: 'low-total', indexes: [20] });
    const ctx = buildGameModeContext(game, singleMatchup([]));
    expect(ctx.strokesOnHole('p1', ctx.holes[0])).toBe(2);
    expect(ctx.strokesOnHole('p1', ctx.holes[1])).toBe(2);
    expect(ctx.strokesOnHole('p1', ctx.holes[2])).toBe(1);
  });

  it('nets gross minus strokes', () => {
    const game = makeGame({ gameMode: 'low-total', indexes: [18] });
    // Bogey (par+1) on every hole for an 18-handicap = net par everywhere.
    const scores = scoresFor('p1', TEST_PARS.map((p) => p + 1));
    const ctx = buildGameModeContext(game, singleMatchup(scores));
    for (const hole of ctx.holes) {
      expect(ctx.netOnHole('p1', hole)).toBe(hole.par);
    }
  });
});

// ---------------------------------------------------------------------------
// Low Total
// ---------------------------------------------------------------------------

describe('low-total', () => {
  it('ranks by net total, lowest first', () => {
    const game = makeGame({
      gameMode: 'low-total', indexes: [0, 0, 0],
      modeSettings: { scoreBasis: 'net', moneyModel: 'per-stroke', dollarsPerStroke: 1 },
    });
    const scores = [
      ...scoresFor('p1', TEST_PARS),                        // 72
      ...scoresFor('p2', TEST_PARS.map((p) => p + 1)),      // 90
      ...scoresFor('p3', TEST_PARS.map((p, i) => p + (i < 9 ? 1 : 0))), // 81
    ];
    const r = run(game, scores);
    expect(standing(r, 'p1').points).toBe(72);
    expect(standing(r, 'p3').points).toBe(81);
    expect(standing(r, 'p2').points).toBe(90);
    expect(standing(r, 'p1').place).toBe(1);
    expect(r.standings[0].playerId).toBe('p1');   // sorted best-first
    expect(standing(r, 'p1').moneyNet).toBeGreaterThan(0);  // low total collects
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });

  it('splits the pot on a tie', () => {
    const game = makeGame({
      gameMode: 'low-total', indexes: [0, 0],
      modeSettings: { scoreBasis: 'net', moneyModel: 'pot', entryPerPlayer: 20 },
    });
    const scores = [...scoresFor('p1', TEST_PARS), ...scoresFor('p2', TEST_PARS)];
    const r = run(game, scores);
    expect(standing(r, 'p1').place).toBe(1);
    expect(standing(r, 'p2').place).toBe(1);
    // Both antes back: −20 + (40/2) = 0.
    expect(standing(r, 'p1').moneyNet).toBeCloseTo(0, 6);
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });

  it('uses gross when the basis is gross (handicap ignored)', () => {
    const game = makeGame({
      gameMode: 'low-total', indexes: [18, 0],
      modeSettings: { scoreBasis: 'gross', moneyModel: 'per-stroke', dollarsPerStroke: 1 },
    });
    // The 18-handicap shoots 90 gross; scratch shoots 72. Gross basis → scratch wins.
    const scores = [
      ...scoresFor('p1', TEST_PARS.map((p) => p + 1)),
      ...scoresFor('p2', TEST_PARS),
    ];
    const r = run(game, scores);
    expect(standing(r, 'p1').points).toBe(90);
    expect(standing(r, 'p2').points).toBe(72);
    expect(standing(r, 'p2').place).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Skins
// ---------------------------------------------------------------------------

describe('skins', () => {
  const base = { scoreBasis: 'gross', moneyModel: 'per-skin', skinValue: 5, carryover: false };

  it('awards a skin to an outright low score', () => {
    const game = makeGame({ gameMode: 'skins', indexes: [0, 0], modeSettings: base });
    // p1 birdies hole 1; everything else halved.
    const p1 = TEST_PARS.slice();
    p1[0] = TEST_PARS[0] - 1;
    const r = run(game, [...scoresFor('p1', p1), ...scoresFor('p2', TEST_PARS)]);
    expect(standing(r, 'p1').points).toBe(1);
    expect(standing(r, 'p2').points).toBe(0);
    // One skin × $5 from the one other player.
    expect(standing(r, 'p1').moneyNet).toBe(5);
    expect(standing(r, 'p2').moneyNet).toBe(-5);
  });

  it('carries a tied hole to the next when carryover is on', () => {
    const game = makeGame({
      gameMode: 'skins', indexes: [0, 0],
      modeSettings: { ...base, carryover: true },
    });
    // Hole 1 halved; p1 wins hole 2 → 2 skins (1 carried + 1).
    const p1 = TEST_PARS.slice();
    p1[1] = TEST_PARS[1] - 1;
    const r = run(game, [...scoresFor('p1', p1), ...scoresFor('p2', TEST_PARS)]);
    expect(standing(r, 'p1').points).toBe(2);
  });

  it('kills a tied hole when carryover is off', () => {
    const game = makeGame({
      gameMode: 'skins', indexes: [0, 0],
      modeSettings: { ...base, carryover: false },
    });
    const p1 = TEST_PARS.slice();
    p1[1] = TEST_PARS[1] - 1;
    const r = run(game, [...scoresFor('p1', p1), ...scoresFor('p2', TEST_PARS)]);
    expect(standing(r, 'p1').points).toBe(1);   // no carry from hole 1
  });

  it('pays each skin by every other player (zero-sum)', () => {
    const game = makeGame({ gameMode: 'skins', indexes: [0, 0, 0, 0], modeSettings: base });
    const p1 = TEST_PARS.slice();
    p1[0] = TEST_PARS[0] - 1;
    const others = ['p2', 'p3', 'p4'].flatMap((id) => scoresFor(id, TEST_PARS));
    const r = run(game, [...scoresFor('p1', p1), ...others]);
    expect(standing(r, 'p1').moneyNet).toBe(15);   // $5 × 3 others
    expect(standing(r, 'p2').moneyNet).toBe(-5);
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });

  it('applies handicap strokes on the net basis', () => {
    const game = makeGame({
      gameMode: 'skins', indexes: [0, 18],
      modeSettings: { ...base, scoreBasis: 'net' },
    });
    // Both shoot par gross. On index 1-18 the 18-handicap nets one better, so the
    // higher handicap wins every hole on net.
    const r = run(game, [...scoresFor('p1', TEST_PARS), ...scoresFor('p2', TEST_PARS)]);
    expect(standing(r, 'p2').points).toBe(18);
    expect(standing(r, 'p1').points).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Stableford
// ---------------------------------------------------------------------------

describe('stableford-ind', () => {
  it('scores the standard scale off net', () => {
    const game = makeGame({
      gameMode: 'stableford-ind', indexes: [0],
      modeSettings: { scoreBasis: 'net', scale: 'standard', moneyModel: 'per-point', dollarsPerPoint: 1 },
    });
    // Par on every hole = 2 pts × 18 = 36.
    const r = run(game, scoresFor('p1', TEST_PARS));
    expect(standing(r, 'p1').points).toBe(36);
  });

  it('scores birdies 3 and doubles 0', () => {
    const game = makeGame({
      gameMode: 'stableford-ind', indexes: [0],
      modeSettings: { scoreBasis: 'net', scale: 'standard' },
    });
    // Hole 1 birdie (3), hole 2 double (0), pars elsewhere (2 × 16 = 32) → 35.
    const s = TEST_PARS.slice();
    s[0] = TEST_PARS[0] - 1;
    s[1] = TEST_PARS[1] + 2;
    const r = run(game, scoresFor('p1', s));
    expect(standing(r, 'p1').points).toBe(35);
  });

  it('honors the modified scale', () => {
    const game = makeGame({
      gameMode: 'stableford-ind', indexes: [0],
      modeSettings: { scoreBasis: 'net', scale: 'modified' },
    });
    // Modified: par = 0. All pars → 0 points.
    const r = run(game, scoresFor('p1', TEST_PARS));
    expect(standing(r, 'p1').points).toBe(0);
  });

  it('honors a custom scale vector', () => {
    const game = makeGame({
      gameMode: 'stableford-ind', indexes: [0],
      modeSettings: { scoreBasis: 'net', scale: 'custom', customScale: '10,8,6,4,2,0' },
    });
    // Custom par = 4 → 18 × 4 = 72.
    const r = run(game, scoresFor('p1', TEST_PARS));
    expect(standing(r, 'p1').points).toBe(72);
  });

  it('settles per point against the field average, zero-sum', () => {
    const game = makeGame({
      gameMode: 'stableford-ind', indexes: [0, 0],
      modeSettings: { scoreBasis: 'net', scale: 'standard', moneyModel: 'per-point', dollarsPerPoint: 2 },
    });
    // p1 pars out (36); p2 bogeys out (18 × 1 = 18). Avg 27.
    const r = run(game, [
      ...scoresFor('p1', TEST_PARS),
      ...scoresFor('p2', TEST_PARS.map((p) => p + 1)),
    ]);
    expect(standing(r, 'p1').points).toBe(36);
    expect(standing(r, 'p2').points).toBe(18);
    expect(standing(r, 'p1').moneyNet).toBe((36 - 27) * 2);
    expect(standing(r, 'p2').moneyNet).toBe((18 - 27) * 2);
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

describe('quota', () => {
  it('sets the quota to 36 − course handicap by default', () => {
    const game = makeGame({
      gameMode: 'quota', indexes: [0, 10],
      modeSettings: { scoreBasis: 'net', quotaBasis: 'par2minus', moneyModel: 'per-point', dollarsPerPoint: 1 },
    });
    // Both par out on net (the 10-hcap shoots par gross → 10 net birdies).
    // p1: earns 36, quota 36 → 0. p2: quota 26, earns 36 + 10 birdie-upgrades.
    const r = run(game, [
      ...scoresFor('p1', TEST_PARS),
      ...scoresFor('p2', TEST_PARS.map((p) => p + 1)),   // bogey gross = net par on 1-10
    ]);
    expect(standing(r, 'p1').points).toBe(0);            // met quota exactly
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });

  it('uses 39 − handicap for Chicago', () => {
    const game = makeGame({
      gameMode: 'quota', indexes: [0],
      modeSettings: { scoreBasis: 'net', quotaBasis: 'chicago' },
    });
    // Pars = 36 earned, Chicago quota 39 → −3.
    const r = run(game, scoresFor('p1', TEST_PARS));
    expect(standing(r, 'p1').points).toBe(-3);
  });

  it('uses one fixed quota for everyone when configured', () => {
    const game = makeGame({
      gameMode: 'quota', indexes: [0, 18],
      modeSettings: { scoreBasis: 'net', quotaBasis: 'fixed', fixedQuota: 30 },
    });
    const r = run(game, [
      ...scoresFor('p1', TEST_PARS),
      ...scoresFor('p2', TEST_PARS),
    ]);
    // p1 earns 36 → +6. p2 (18 hcap, par gross) nets one under everywhere → 3×18=54 → +24.
    expect(standing(r, 'p1').points).toBe(6);
    expect(standing(r, 'p2').points).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// Nines / Split Sixes
// ---------------------------------------------------------------------------

describe('nines', () => {
  it('splits 5/3/1 by hole rank', () => {
    const game = makeGame({
      gameMode: 'nines', indexes: [0, 0, 0],
      modeSettings: { scoreBasis: 'gross', pointVector: '5,3,1', moneyModel: 'per-point', dollarsPerPoint: 1 },
    });
    // p1 best, p2 middle, p3 worst on every hole.
    const r = run(game, [
      ...scoresFor('p1', TEST_PARS.map((p) => p - 1)),
      ...scoresFor('p2', TEST_PARS),
      ...scoresFor('p3', TEST_PARS.map((p) => p + 1)),
    ]);
    expect(standing(r, 'p1').points).toBe(5 * 18);
    expect(standing(r, 'p2').points).toBe(3 * 18);
    expect(standing(r, 'p3').points).toBe(1 * 18);
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });

  it('splits tied slots evenly', () => {
    const game = makeGame({
      gameMode: 'nines', indexes: [0, 0, 0],
      modeSettings: { scoreBasis: 'gross', pointVector: '5,3,1' },
    });
    // All three tie every hole → (5+3+1)/3 = 3 each per hole.
    const r = run(game, parScores(['p1', 'p2', 'p3']));
    expect(standing(r, 'p1').points).toBe(3 * 18);
    expect(standing(r, 'p2').points).toBe(3 * 18);
    expect(standing(r, 'p3').points).toBe(3 * 18);
  });

  it('splits the top two slots when two players tie for low', () => {
    const game = makeGame({
      gameMode: 'nines', indexes: [0, 0, 0],
      modeSettings: { scoreBasis: 'gross', pointVector: '5,3,1' },
    });
    // p1 & p2 tie for best, p3 worst → top two share (5+3)/2 = 4, p3 gets 1.
    const r = run(game, [
      ...scoresFor('p1', TEST_PARS.map((p) => p - 1)),
      ...scoresFor('p2', TEST_PARS.map((p) => p - 1)),
      ...scoresFor('p3', TEST_PARS),
    ]);
    expect(standing(r, 'p1').points).toBe(4 * 18);
    expect(standing(r, 'p2').points).toBe(4 * 18);
    expect(standing(r, 'p3').points).toBe(1 * 18);
  });

  it('supports a Split Sixes 4/2/0 vector', () => {
    const game = makeGame({
      gameMode: 'nines', indexes: [0, 0, 0],
      modeSettings: { scoreBasis: 'gross', pointVector: '4,2,0' },
    });
    const r = run(game, [
      ...scoresFor('p1', TEST_PARS.map((p) => p - 1)),
      ...scoresFor('p2', TEST_PARS),
      ...scoresFor('p3', TEST_PARS.map((p) => p + 1)),
    ]);
    expect(standing(r, 'p1').points).toBe(4 * 18);
    expect(standing(r, 'p2').points).toBe(2 * 18);
    expect(standing(r, 'p3').points).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2v2 (team-within-group)
// ---------------------------------------------------------------------------

describe('team-2v2', () => {
  const sides = { a: ['p1', 'p2'], b: ['p3', 'p4'] };

  function game2v2(modeSettings: Record<string, string | number | boolean>, extra: Partial<PoolGame> = {}) {
    return makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0], subTeams: sides,
      modeSettings, ...extra,
    });
  }

  it('names sides after their players, and honors custom names', () => {
    const derived = run(game2v2({ format: 'best-ball', scoring: 'stroke', result: 'match' }), parScores(['p1', 'p2', 'p3', 'p4']));
    expect(derived.sideNames?.a).toBe('Player1 & Player2');

    const custom = run(
      game2v2({ format: 'best-ball', scoring: 'stroke', result: 'match', sideAName: 'The Hogs', sideBName: 'The Dawgs' }),
      parScores(['p1', 'p2', 'p3', 'p4']),
    );
    expect(custom.sideNames?.a).toBe('The Hogs');
    expect(custom.sideNames?.b).toBe('The Dawgs');
  });

  it('best-ball takes the LOW net of each side', () => {
    const g = game2v2({ format: 'best-ball', scoring: 'stroke', result: 'total', moneyModel: 'legs' });
    // Side A: p1 pars, p2 doubles → side A counts par. Side B both bogey.
    const r = run(g, [
      ...scoresFor('p1', TEST_PARS),
      ...scoresFor('p2', TEST_PARS.map((p) => p + 2)),
      ...scoresFor('p3', TEST_PARS.map((p) => p + 1)),
      ...scoresFor('p4', TEST_PARS.map((p) => p + 1)),
    ]);
    // A's total is 72 (p1's card), B's is 90.
    expect(standing(r, 'A').points).toBe(72);
    expect(standing(r, 'B').points).toBe(90);
    expect(standing(r, 'A').place).toBe(1);
  });

  it('combined ADDS both partners\' nets', () => {
    const g = game2v2({ format: 'combined', scoring: 'stroke', result: 'total', moneyModel: 'legs' });
    const r = run(g, parScores(['p1', 'p2', 'p3', 'p4']));
    // Everyone pars: each side = 72 + 72 = 144.
    expect(standing(r, 'A').points).toBe(144);
    expect(standing(r, 'B').points).toBe(144);
  });

  it('match play counts holes won, and money is head-to-head zero-sum', () => {
    const g = game2v2({
      format: 'best-ball', scoring: 'stroke', result: 'match',
      moneyModel: 'per-hole', dollarsPerHole: 2,
    });
    // Side A wins holes 1-3 outright; the rest are halved.
    const aScores = TEST_PARS.map((p, i) => (i < 3 ? p - 1 : p));
    const r = run(g, [
      ...scoresFor('p1', aScores),
      ...scoresFor('p2', aScores),
      ...scoresFor('p3', TEST_PARS),
      ...scoresFor('p4', TEST_PARS),
    ]);
    // 3 holes won − 0 lost = 3 × $2 = $6 to A.
    expect(standing(r, 'A').moneyNet).toBe(6);
    expect(standing(r, 'B').moneyNet).toBe(-6);
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });

  it('reports front / back / overall legs on 18 holes', () => {
    const g = game2v2({ format: 'best-ball', scoring: 'stroke', result: 'match', moneyModel: 'legs' });
    const r = run(g, parScores(['p1', 'p2', 'p3', 'p4']));
    expect(r.teamLegs?.map((l) => l.key)).toEqual(['front', 'back', 'overall']);
  });

  // Regression: a nine used to pay front AND overall for the same holes.
  it('collapses to ONE leg on a nine (no double-paid money)', () => {
    const g = game2v2(
      { format: 'best-ball', scoring: 'stroke', result: 'match', moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 10 },
      { holesPlaying: 'back9' },
    );
    // Side A wins every hole on the back nine.
    const aScores = backNine().map((h) => TEST_PARS[h - 1] - 1);
    const bScores = backNine().map((h) => TEST_PARS[h - 1]);
    const r = run(g, [
      ...scoresFor('p1', aScores, backNine()),
      ...scoresFor('p2', aScores, backNine()),
      ...scoresFor('p3', bScores, backNine()),
      ...scoresFor('p4', bScores, backNine()),
    ]);
    expect(r.teamLegs).toHaveLength(1);
    expect(r.teamLegs?.[0].key).toBe('back');
    expect(r.teamLegs?.[0].label).toBe('Back 9');
    // ONE leg's worth of money ($10), not two.
    expect(standing(r, 'A').moneyNet).toBe(10);
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });

  it('orders standings by who is winning', () => {
    const g = game2v2({ format: 'best-ball', scoring: 'stroke', result: 'total', moneyModel: 'legs' });
    // Side B better → B should sort first.
    const r = run(g, [
      ...scoresFor('p1', TEST_PARS.map((p) => p + 1)),
      ...scoresFor('p2', TEST_PARS.map((p) => p + 1)),
      ...scoresFor('p3', TEST_PARS),
      ...scoresFor('p4', TEST_PARS),
    ]);
    expect(r.standings[0].playerId).toBe('B');
    expect(standing(r, 'B').place).toBe(1);
  });

  // -------------------------------------------------------------------------
  // ONE BALL MEANS ONE SCORE — the 2v2 twin of the pool-side bug (F-012)
  // -------------------------------------------------------------------------
  //
  // DECISIONS.md §5.ac settled this rule for the pool (`teamNetOnHole` in team-scoring.ts).
  // `team-game.ts` has its OWN one-ball read for a 2v2 side, and it was missed by that pass:
  // it read "the first member with a score", so a side's score — and the money — depended on
  // the ORDER of `subTeams.a`. Probed at $54 on a scratch foursome.
  //
  // Reachable two ways through the hub: `assignSide` re-pushed a player already on that side
  // (moving them to the end of the array), and the 2v2 format select had no equivalent of the
  // pool picker's `lockOneBall` guard, so a scored game could still be switched to scramble.
  //
  // The fix mirrors the pool: take the MINIMUM, so order can never matter. In the correct
  // case every member shares the ball, and min of equal values is that value.
  describe('one-ball formats: side player order can never change the money', () => {
    const ONE_BALL = ['scramble', 'alternate-shot'] as const;

    function payoutFor(sideAOrder: string[], offsets: Record<string, number>, format: string) {
      const g = makeGame({
        gameMode: 'team-2v2', indexes: [0, 0, 0, 0],
        subTeams: { a: sideAOrder, b: ['p3', 'p4'] },
        modeSettings: {
          format, scoring: 'stroke', result: 'total',
          moneyModel: 'per-point', dollarsPerPoint: 1,
        },
      });
      // Deliberately DIVERGENT per-member scores on side A — the shape a mid-round format
      // switch could leave behind. Side B shares one ball, as a correct game would.
      const r = run(g, [
        ...sideAOrder.flatMap((id) => scoresFor(id, TEST_PARS.map((p) => p + offsets[id]))),
        ...scoresFor('p3', TEST_PARS.map((p) => p + 1)),
        ...scoresFor('p4', TEST_PARS.map((p) => p + 1)),
      ]);
      return { total: standing(r, 'A').points, money: standing(r, 'A').moneyNet };
    }

    for (const format of ONE_BALL) {
      it(`${format}: swapping a side's two ids does not move a dollar`, () => {
        const offsets = { p1: 0, p2: 3 };
        const forward = payoutFor(['p1', 'p2'], offsets, format);
        const swapped = payoutFor(['p2', 'p1'], offsets, format);
        expect(swapped.total, `${format}: side total moved with order`).toBe(forward.total);
        expect(swapped.money, `${format}: MONEY moved with order`).toBe(forward.money);
      });

      it(`${format}: every permutation of a foursome's sides settles identically`, () => {
        // Exhaustive over 4! = 24 orders, split 2/2 into the sides. A single swap can pass by
        // luck; this can't. Mirrors the pool-side test in pool-game.test.ts.
        const offsets: Record<string, number> = { p1: 0, p2: 1, p3: 2, p4: 3 };
        const perms: string[][] = [];
        const permute = (rest: string[], acc: string[]) => {
          if (rest.length === 0) { perms.push(acc); return; }
          rest.forEach((x, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]));
        };
        permute(['p1', 'p2', 'p3', 'p4'], []);
        expect(perms).toHaveLength(24);

        // Every permutation assigns the SAME two players to side A (only the order within
        // each side varies), so the money must be identical across all 24.
        const results = perms.map((order) => {
          const g = makeGame({
            gameMode: 'team-2v2', indexes: [0, 0, 0, 0],
            subTeams: { a: order.slice(0, 2), b: order.slice(2) },
            modeSettings: {
              format, scoring: 'stroke', result: 'total',
              moneyModel: 'per-point', dollarsPerPoint: 1,
            },
          });
          const r = run(g, order.flatMap((id) =>
            scoresFor(id, TEST_PARS.map((p) => p + offsets[id]))));
          // Key by WHICH players are on side A, so we compare like with like: the two
          // distinct side splits are separate expectations, order within them is not.
          const key = [...order.slice(0, 2)].sort().join('+');
          return { key, total: standing(r, 'A').points, money: standing(r, 'A').moneyNet };
        });

        // Group by side membership; within a group, order must be irrelevant.
        const byKey = new Map<string, typeof results>();
        for (const r of results) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
        expect(byKey.size).toBe(6); // C(4,2) = 6 distinct side splits
        for (const [key, group] of byKey) {
          for (const r of group) {
            expect(r.total, `${format} ${key}: side total varies by order`).toBe(group[0].total);
            expect(r.money, `${format} ${key}: MONEY varies by order`).toBe(group[0].money);
          }
        }
      });
    }

    it('the CORRECT case (both members share the ball) is unchanged', () => {
      // The normal path: one shared score written to every member of the side. min of equal
      // values is that value, so this must compute exactly as it did before the fix.
      for (const format of ONE_BALL) {
        const same = payoutFor(['p1', 'p2'], { p1: 0, p2: 0 }, format);
        const swapped = payoutFor(['p2', 'p1'], { p1: 0, p2: 0 }, format);
        expect(same.money, format).toBe(swapped.money);
        expect(same.total, format).toBe(swapped.total);
        // Four scratch players all shooting par: the side's gross is par every hole.
        expect(same.total, format).toBe(72);
      }
    });

    // The order tests above prove order is IRRELEVANT — but max() is order-independent too,
    // so they can't tell min from max. This pins WHICH value the backstop takes, matching the
    // pool side's `teamNetOnHole`: the minimum. Verified by mutation — swapping min for max
    // passes every other case in this file and fails only here.
    it('takes the MINIMUM, not the maximum, when members somehow disagree', () => {
      for (const format of ONE_BALL) {
        // p1 pars (72), p2 is three over on every hole (126). Scratch players, so the team
        // handicap is 0 under both one-ball formats and net == gross.
        const r = payoutFor(['p1', 'p2'], { p1: 0, p2: 3 }, format);
        expect(r.total, `${format}: should take p1's 72, not p2's 126`).toBe(72);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Wolf
// ---------------------------------------------------------------------------

describe('wolf', () => {
  const base = { scoreBasis: 'gross', basePoints: 1, loneMultiplier: 2, blindMultiplier: 3, moneyModel: 'per-point', dollarsPerPoint: 1 };

  it('awards a lone Wolf the multiplied points when they win', () => {
    const game = makeGame({
      gameMode: 'wolf', indexes: [0, 0, 0, 0], modeSettings: base,
      wolfDecisions: { 1: { wolfId: 'p1', mode: 'lone', partnerId: null } },
    });
    // Only hole 1 is scored; p1 (lone Wolf) birdies, others par.
    const one = [1];
    const r = run(game, [
      ...scoresFor('p1', [TEST_PARS[0] - 1], one),
      ...scoresFor('p2', [TEST_PARS[0]], one),
      ...scoresFor('p3', [TEST_PARS[0]], one),
      ...scoresFor('p4', [TEST_PARS[0]], one),
    ]);
    expect(standing(r, 'p1').points).toBe(2);       // base 1 × lone 2
    expect(r.wolfHoles?.[0].outcome).toBe('wolf');
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });

  it('pays the field when a lone Wolf loses', () => {
    const game = makeGame({
      gameMode: 'wolf', indexes: [0, 0, 0, 0], modeSettings: base,
      wolfDecisions: { 1: { wolfId: 'p1', mode: 'lone', partnerId: null } },
    });
    const one = [1];
    const r = run(game, [
      ...scoresFor('p1', [TEST_PARS[0] + 1], one),
      ...scoresFor('p2', [TEST_PARS[0]], one),
      ...scoresFor('p3', [TEST_PARS[0]], one),
      ...scoresFor('p4', [TEST_PARS[0]], one),
    ]);
    expect(r.wolfHoles?.[0].outcome).toBe('field');
    expect(standing(r, 'p1').points).toBe(0);
    // Each of the three field players earns the multiplied points.
    expect(standing(r, 'p2').points).toBe(2);
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });

  it('plays a partner hole as best-ball 2v2', () => {
    const game = makeGame({
      gameMode: 'wolf', indexes: [0, 0, 0, 0], modeSettings: base,
      wolfDecisions: { 1: { wolfId: 'p1', mode: 'partner', partnerId: 'p2' } },
    });
    const one = [1];
    const r = run(game, [
      ...scoresFor('p1', [TEST_PARS[0]], one),
      ...scoresFor('p2', [TEST_PARS[0] - 1], one),   // partner's birdie carries the side
      ...scoresFor('p3', [TEST_PARS[0]], one),
      ...scoresFor('p4', [TEST_PARS[0]], one),
    ]);
    expect(r.wolfHoles?.[0].mode).toBe('partner');
    expect(r.wolfHoles?.[0].outcome).toBe('wolf');
    expect(standing(r, 'p1').points).toBe(1);       // no multiplier with a partner
    expect(standing(r, 'p2').points).toBe(1);
    expect(standing(r, 'p3').points).toBe(0);
  });

  it('pushes a tied hole with no points', () => {
    const game = makeGame({
      gameMode: 'wolf', indexes: [0, 0, 0, 0], modeSettings: base,
      wolfDecisions: { 1: { wolfId: 'p1', mode: 'lone', partnerId: null } },
    });
    const one = [1];
    const r = run(game, ['p1', 'p2', 'p3', 'p4'].flatMap((id) => scoresFor(id, [TEST_PARS[0]], one)));
    expect(r.wolfHoles?.[0].outcome).toBe('push');
    for (const s of r.standings) expect(s.points).toBe(0);
  });

  it('applies the blind multiplier', () => {
    const game = makeGame({
      gameMode: 'wolf', indexes: [0, 0, 0, 0], modeSettings: base,
      wolfDecisions: { 1: { wolfId: 'p1', mode: 'blind', partnerId: null } },
    });
    const one = [1];
    const r = run(game, [
      ...scoresFor('p1', [TEST_PARS[0] - 1], one),
      ...scoresFor('p2', [TEST_PARS[0]], one),
      ...scoresFor('p3', [TEST_PARS[0]], one),
      ...scoresFor('p4', [TEST_PARS[0]], one),
    ]);
    expect(standing(r, 'p1').points).toBe(3);       // blind ×3
  });

  it('skips a hole until all four have scored', () => {
    const game = makeGame({
      gameMode: 'wolf', indexes: [0, 0, 0, 0], modeSettings: base,
      wolfDecisions: { 1: { wolfId: 'p1', mode: 'lone', partnerId: null } },
    });
    const one = [1];
    // Only three players in.
    const r = run(game, ['p1', 'p2', 'p3'].flatMap((id) => scoresFor(id, [TEST_PARS[0]], one)));
    expect(r.wolfHoles ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Nassau money model (shared across modes)
// ---------------------------------------------------------------------------

describe('nassau settlement', () => {
  it('contests front / back / total and stays zero-sum', () => {
    const game = makeGame({
      gameMode: 'stableford-ind', indexes: [0, 0],
      modeSettings: {
        scoreBasis: 'net', scale: 'standard', moneyModel: 'nassau',
        nassauSplit: 'three', nassauFront: 5, nassauBack: 5, nassauTotal: 10,
      },
    });
    // p1 wins the front (birdies 1-9), p2 wins the back (birdies 10-18).
    const p1 = TEST_PARS.map((p, i) => (i < 9 ? p - 1 : p));
    const p2 = TEST_PARS.map((p, i) => (i >= 9 ? p - 1 : p));
    const r = run(game, [...scoresFor('p1', p1), ...scoresFor('p2', p2)]);
    expect(r.nassauLegs?.map((l) => l.key)).toEqual(['front', 'back', 'total']);
    expect(r.nassauLegs?.find((l) => l.key === 'front')?.winnerNames).toEqual(['Player1 Last1']);
    expect(r.nassauLegs?.find((l) => l.key === 'back')?.winnerNames).toEqual(['Player2 Last2']);
    // Equal rounds → the total is halved, and each won one nine: net zero.
    expect(totalMoney(r)).toBeCloseTo(0, 6);
    expect(standing(r, 'p1').moneyNet).toBeCloseTo(0, 6);
  });

  it('drops front/back when total-only', () => {
    const game = makeGame({
      gameMode: 'stableford-ind', indexes: [0, 0],
      modeSettings: {
        scoreBasis: 'net', scale: 'standard', moneyModel: 'nassau',
        nassauSplit: 'total', nassauFront: 5, nassauBack: 5, nassauTotal: 10,
      },
    });
    const r = run(game, [
      ...scoresFor('p1', TEST_PARS.map((p) => p - 1)),
      ...scoresFor('p2', TEST_PARS),
    ]);
    expect(r.nassauLegs?.map((l) => l.key)).toEqual(['total']);
    // Winner takes the 2-player pot: −10 ante + 20 = +10.
    expect(standing(r, 'p1').moneyNet).toBe(10);
    expect(standing(r, 'p2').moneyNet).toBe(-10);
  });

  it('returns antes when a segment has not started', () => {
    const game = makeGame({
      gameMode: 'stableford-ind', indexes: [0, 0],
      modeSettings: {
        scoreBasis: 'net', scale: 'standard', moneyModel: 'nassau',
        nassauSplit: 'three', nassauFront: 5, nassauBack: 5, nassauTotal: 10,
      },
    });
    // Front nine only — the back is unplayed and must not leave money undistributed.
    const r = run(game, [
      ...scoresFor('p1', frontNine().map((h) => TEST_PARS[h - 1]), frontNine()),
      ...scoresFor('p2', frontNine().map((h) => TEST_PARS[h - 1]), frontNine()),
    ]);
    expect(r.nassauLegs?.find((l) => l.key === 'back')?.thru).toBe(0);
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// Junk (birdie/eagle bonuses) — shared layer, two different settlement rules
// ---------------------------------------------------------------------------

describe('junk bonuses', () => {
  it('pays an individual earner from the rest of the group', () => {
    const game = makeGame({
      gameMode: 'low-total', indexes: [0, 0, 0, 0],
      modeSettings: {
        scoreBasis: 'gross', moneyModel: 'per-stroke', dollarsPerStroke: 0,
        junkEnabled: true, junkBirdie: 2, junkEagle: 5, junkAlbatross: 10, junkBasis: 'gross',
      },
    });
    // p1 makes one birdie; nobody else does.
    const p1 = TEST_PARS.slice();
    p1[0] = TEST_PARS[0] - 1;
    const r = run(game, [
      ...scoresFor('p1', p1),
      ...['p2', 'p3', 'p4'].flatMap((id) => scoresFor(id, TEST_PARS)),
    ]);
    const line = r.junkLines?.find((l) => l.playerId === 'p1');
    expect(line?.birdies).toBe(1);
    expect(line?.dollars).toBe(2);
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });

  it('counts eagles and albatrosses at their own rates', () => {
    const game = makeGame({
      gameMode: 'low-total', indexes: [0],
      modeSettings: {
        scoreBasis: 'gross', moneyModel: 'per-stroke', dollarsPerStroke: 0,
        junkEnabled: true, junkBirdie: 2, junkEagle: 5, junkAlbatross: 10, junkBasis: 'gross',
      },
    });
    // Hole 2 is a par 5: a 3 is an eagle, a 2 is an albatross.
    const s = TEST_PARS.slice();
    s[1] = 3;    // eagle
    s[12] = 2;   // hole 13 is a par 5 → albatross
    const r = run(game, scoresFor('p1', s));
    const line = r.junkLines?.find((l) => l.playerId === 'p1');
    expect(line?.eagles).toBe(1);
    expect(line?.albatrosses).toBe(1);
    expect(line?.dollars).toBe(15);
  });

  // 2v2 settles junk SIDE vs SIDE — only the difference moves. This is the rule
  // the shared leaderboard caption used to state incorrectly.
  it('nets junk between the two sides in a 2v2', () => {
    const game = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0], subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] },
      modeSettings: {
        format: 'best-ball', scoring: 'stroke', result: 'match', moneyModel: 'per-hole', dollarsPerHole: 0,
        junkEnabled: true, junkBirdie: 2, junkEagle: 5, junkAlbatross: 10, junkBasis: 'gross',
      },
    });
    // p1 (side A) makes 2 birdies; p3 (side B) makes 1. Differential = $2 to A.
    const p1 = TEST_PARS.slice(); p1[0] -= 1; p1[3] -= 1;
    const p3 = TEST_PARS.slice(); p3[0] -= 1;
    const r = run(game, [
      ...scoresFor('p1', p1),
      ...scoresFor('p2', TEST_PARS),
      ...scoresFor('p3', p3),
      ...scoresFor('p4', TEST_PARS),
    ]);
    expect(standing(r, 'A').moneyNet).toBe(2);
    expect(standing(r, 'B').moneyNet).toBe(-2);
    expect(totalMoney(r)).toBeCloseTo(0, 6);
  });

  it('is inert when disabled', () => {
    const game = makeGame({
      gameMode: 'low-total', indexes: [0, 0],
      modeSettings: { scoreBasis: 'gross', moneyModel: 'per-stroke', dollarsPerStroke: 1, junkEnabled: false },
    });
    const p1 = TEST_PARS.slice(); p1[0] -= 1;
    const r = run(game, [...scoresFor('p1', p1), ...scoresFor('p2', TEST_PARS)]);
    expect(r.junkLines).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The game-list card subtitle (§5.al / §5.az) — a claim users act on
// ---------------------------------------------------------------------------

describe('gameListSubtitle', () => {
  it('names the format and counts players for a single-group game', () => {
    expect(gameListSubtitle({ gameMode: 'skins', teamCount: 1, playerCount: 4 }))
      .toBe('Skins · 4 players');
  });

  it('never says "foursomes" for ANY registered mode', () => {
    for (const m of GAME_MODES) {
      const s = gameListSubtitle({ gameMode: m.id, teamCount: 1, playerCount: m.playersMin });
      expect(s, m.id).not.toContain('foursome');
      expect(s, m.id).toContain(m.name);
    }
  });

  it('confirms multiple tee times, but stays quiet about one group', () => {
    expect(gameListSubtitle({ gameMode: 'skins', teamCount: 2, playerCount: 8 }))
      .toBe('Skins · 8 players · 2 groups');
    expect(gameListSubtitle({ gameMode: 'skins', teamCount: 1, playerCount: 4 }))
      .not.toContain('group');
  });

  it('keeps the pluralized foursome count for the classic pool', () => {
    expect(gameListSubtitle({ gameMode: undefined, teamCount: 2, playerCount: 8 }))
      .toBe('Pool · 2 foursomes · 8 players');
    // Singulars: never "1 foursomes" / "1 players" (the §5.al bug).
    expect(gameListSubtitle({ gameMode: undefined, teamCount: 1, playerCount: 1 }))
      .toBe('Pool · 1 foursome · 1 player');
  });
});

// ---------------------------------------------------------------------------
// The classic team pool (the other leaderboard axis)
// ---------------------------------------------------------------------------

describe('classic pool (team axis)', () => {
  it('is a team result, not an individual one', () => {
    const game = makeGame({ teamCount: 2, indexes: Array(8).fill(10) });
    expect(game.gameMode).toBeUndefined();
    expect(isSingleGroupGame(game)).toBe(false);
    const r = computeGameResult(game, new Map([
      ['m1', parScores(['p1', 'p2', 'p3', 'p4'])],
      ['m2', parScores(['p5', 'p6', 'p7', 'p8'])],
    ]));
    expect(r.kind).toBe('team');
  });

  it('splits the pot into legs and pays zero-sum', () => {
    const game = makeGame({ teamCount: 2, indexes: Array(8).fill(0), entryPerPlayer: 25 });
    // Team 1 pars; team 2 bogeys → team 1 wins every leg.
    const r = computeGameResult(game, new Map([
      ['m1', parScores(['p1', 'p2', 'p3', 'p4'])],
      ['m2', ['p5', 'p6', 'p7', 'p8'].flatMap((id) => scoresFor(id, TEST_PARS.map((p) => p + 1)))],
    ]));
    if (r.kind !== 'team') throw new Error('expected team result');
    expect(r.pot).toBe(8 * 25);
    const net = r.payouts.reduce((sum, p) => sum + p.net, 0);
    expect(net).toBeCloseTo(0, 6);      // zero-sum across teams
    const t1 = r.payouts.find((p) => p.teamId === 't1')!;
    expect(t1.net).toBeGreaterThan(0);
  });

  it('puts the whole non-junk pot on one leg for a nine', () => {
    const game = makeGame({
      teamCount: 2, indexes: Array(8).fill(0), entryPerPlayer: 25, holesPlaying: 'front9',
    });
    const nine = frontNine();
    const r = computeGameResult(game, new Map([
      ['m1', ['p1', 'p2', 'p3', 'p4'].flatMap((id) => scoresFor(id, nine.map((h) => TEST_PARS[h - 1]), nine))],
      ['m2', ['p5', 'p6', 'p7', 'p8'].flatMap((id) => scoresFor(id, nine.map((h) => TEST_PARS[h - 1] + 1), nine))],
    ]));
    if (r.kind !== 'team') throw new Error('expected team result');
    // The front/back legs exist for shape but hold no money on a nine.
    const front = r.legs.find((l) => l.leg === 'front')!;
    const overall = r.legs.find((l) => l.leg === 'overall')!;
    expect(front.subPot).toBe(0);
    expect(overall.subPot).toBeGreaterThan(0);
  });
});
