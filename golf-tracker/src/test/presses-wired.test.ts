// PRESSES wired through every engine (DECISIONS.md §5.dj/§5.dk, design note §5).
//
// The goldens in presses-golden.test.ts pin the rules module. This file pins the WIRING: the same
// worked examples settled by the team engine (two sides), by each match of a Team → Match game
// (paid between that match's players, §5.dk Q4) and by the classic pool's two-team match. Every
// expected dollar is worked by hand in the comments, never read back from the engine (§5.z).
//
// Scratch players (net == gross), each unit's players shooting the same card, so a hole is won by
// the side that birdies it: 'A' side a birdies, 'B' side b birdies, '-' both par, '.' not played.

import { describe, expect, it } from 'vitest';
import { computeGameResult } from '@/lib/game-modes/result';
import type { IndividualResult } from '@/lib/game-modes/types';
import type { PressTap } from '@/lib/game-modes/presses';
import type { GameScore } from '@/lib/game-state';
import { computePoolResult, type PoolGame } from '@/lib/pool-game';
import { perPlayerNets } from '@/lib/stats-ledger';
import { makeGame, makePlayers, makeTeam, TEST_PARS } from './fixtures';

const HALVED9 = '---------';

/** One side's card from an 18-char pattern (front + back). */
function card(ids: string[], pattern: string, side: string): GameScore[] {
  return ids.flatMap((id) => [...pattern].flatMap((c, i) => (c === '.'
    ? []
    : [{ playerId: id, hole: i + 1, grossScore: TEST_PARS[i] - (c === side ? 1 : 0) }])));
}

type Bag = Record<string, string | number | boolean>;

// ---------------------------------------------------------------------------
// The team engine, two sides in one foursome
// ---------------------------------------------------------------------------

function twoSide(settings: Bag, extra: Partial<PoolGame> = {}): PoolGame {
  return makeGame({
    gameMode: 'team-2v2', indexes: [0, 0, 0, 0],
    subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] },
    modeSettings: {
      format: 'best-ball', scoring: 'stroke', result: 'match', moneyModel: 'legs', junkEnabled: false,
      legFront: 10, legBack: 10, legOverall: 10, presses: true, pressMode: 'auto',
      ...settings,
    },
    ...extra,
  });
}

function runTwoSide(game: PoolGame, pattern: string): IndividualResult {
  const r = computeGameResult(game, new Map([['m1', [...card(['p1', 'p2'], pattern, 'A'), ...card(['p3', 'p4'], pattern, 'B')]]]));
  if (r.kind !== 'individual') throw new Error('expected the team engine');
  return r;
}

const sideMoney = (r: IndividualResult) => {
  expect(r.standings.reduce((s, x) => s + x.moneyNet, 0), 'zero-sum').toBe(0);
  return Object.fromEntries(r.standings.map((s) => [s.playerId, s.moneyNet]));
};

/** The ledger's per-player nets (what settle-up pays), checked zero-sum. */
function ledger(game: PoolGame, scores: Map<string, GameScore[]>) {
  const nets = perPlayerNets(game, scores);
  expect(nets.reduce((s, n) => s + n.net, 0), 'ledger zero-sum').toBeCloseTo(0, 9);
  return Object.fromEntries(nets.map((n) => [n.playerId, n.net]));
}

describe('presses: the team engine, two sides', () => {
  // G1 on the front, the back halved. Front: a 1 up ($10); a's press 5–9: a 3 up ($10). Back all
  // square. Overall: a 1 up ($10). Side a +$30 with presses; +$20 without.
  const G1 = '-B-BA-A-A' + HALVED9;

  it('G1 auto: a 2 down after 4 presses 5–9 and wins it 3 up: +$30, not +$20', () => {
    const r = runTwoSide(twoSide({}), G1);
    expect(sideMoney(r)).toEqual({ A: 30, B: -30 });
    expect(r.presses!.map((p) => [p.label, p.by, p.status, p.stake])).toEqual([['Press 5–9', 'a', 'Player1 & Player2 3 up', 10]]);
    expect(runTwoSide(twoSide({ presses: false }), G1).presses).toBeUndefined();
    expect(sideMoney(runTwoSide(twoSide({ presses: false }), G1))).toEqual({ A: 20, B: -20 });
  });

  it('the ledger pays each player their side\'s share of the presses (ledger == board)', () => {
    const game = twoSide({});
    const scores = new Map([['m1', [...card(['p1', 'p2'], G1, 'A'), ...card(['p3', 'p4'], G1, 'B')]]]);
    expect(ledger(game, scores)).toEqual({ p1: 15, p2: 15, p3: -15, p4: -15 });
  });

  it('button: the side 2 down is offered the press of the bet it is losing; nothing until tapped', () => {
    // Through 4 only: a is 2 down in the front. The button names the bet (§5.dk).
    const r = runTwoSide(twoSide({ pressMode: 'button' }), '-B-B' + '.'.repeat(14));
    expect(r.pressOffers).toEqual([{ of: 'front', by: 'a', side: 'a', fromHole: 5, label: 'Player1 & Player2: press the front 9' }]);
    expect(r.presses).toEqual([]);
    // Not tapped: the round finishes and pays exactly as without presses.
    expect(sideMoney(runTwoSide(twoSide({ pressMode: 'button' }), G1))).toEqual({ A: 20, B: -20 });
  });

  it('button: a tap pays as auto does; a removed tap pays nothing', () => {
    const tap: PressTap = { of: 'front', by: 'a', fromHole: 5 };
    expect(sideMoney(runTwoSide(twoSide({ pressMode: 'button' }, { presses: [tap] }), G1))).toEqual({ A: 30, B: -30 });
    const removed = runTwoSide(twoSide({ pressMode: 'button' }, { presses: [{ ...tap, removed: { note: 'press removed' } }] }), G1);
    expect(sideMoney(removed)).toEqual({ A: 20, B: -20 });
    expect(removed.presses).toEqual([]);
  });

  it('G7: the overall is pressed only when its own toggle is on (§5.dk Q1 B)', () => {
    // b wins 1 and 2, then everything halved. Front: b 2 up (−$10 a); a's press 3–9 all square.
    // Overall: b 2 up (−$10 a). With the overall toggle on, a also presses the overall 3–18,
    // all square: no money either way, but it's its own line.
    const p = 'BB-------' + HALVED9;
    const off = runTwoSide(twoSide({}), p);
    expect(off.presses!.map((x) => [x.leg, x.label])).toEqual([['front', 'Press 3–9']]);
    const on = runTwoSide(twoSide({ pressOverall: true }), p);
    expect(on.presses!.map((x) => [x.leg, x.label, x.status])).toEqual([['front', 'Press 3–9', 'All square'], ['overall', 'Press 3–18', 'All square']]);
    expect(sideMoney(off)).toEqual({ A: -20, B: 20 });
    expect(sideMoney(on)).toEqual({ A: -20, B: 20 });
  });

  it('a voided leg voids its presses (§5.ai)', () => {
    // G1's front, but holes 8 and 9 never posted; the group voids the front at close-out. Thru 7:
    // front a 1 down? -B-BA-A: b 2, a 2 → all square; a's press 5–7: a 2 up. Voided: the front and
    // its press pay nothing. Overall (thru 7, all square) and back (unplayed) pay nothing either.
    const p = '-B-BA-A..' + '.'.repeat(9);
    const r = runTwoSide(twoSide({}, { voidedLegs: ['front'] }), p);
    expect(r.presses!.map((x) => [x.label, x.voided])).toEqual([['Press 5–9', true]]);
    expect(sideMoney(r)).toEqual({ A: 0, B: 0 });
    // Not voided, the press stands 2 up thru 7 and pays $10.
    expect(sideMoney(runTwoSide(twoSide({}), p))).toEqual({ A: 10, B: -10 });
  });

  it('9-hole game: the one leg presses, at the stake it pays (the overall\'s)', () => {
    // A front-nine game: one leg at legOverall ($30). G1 on it: leg +$30, press +$30.
    const r = runTwoSide(twoSide({ legOverall: 30 }, { holesPlaying: 'front9' }), '-B-BA-A-A');
    expect(sideMoney(r)).toEqual({ A: 60, B: -60 });
    expect(r.presses!.map((x) => [x.leg, x.label, x.stake])).toEqual([['front', 'Press 5–9', 30]]);
  });

  it('presses only on match-play legs with two sides (§5.dk Q3)', () => {
    expect(runTwoSide(twoSide({ result: 'total' }), G1).presses).toBeUndefined();
    expect(runTwoSide(twoSide({ moneyModel: 'per-point', dollarsPerPoint: 1 }), G1).presses).toBeUndefined();
    const three = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0],
      sides: [{ id: 'a', playerIds: ['p1'] }, { id: 'b', playerIds: ['p2'] }, { id: 'c', playerIds: ['p3'] }],
      modeSettings: { format: 'best-ball', scoring: 'stroke', result: 'match', moneyModel: 'legs', junkEnabled: false, presses: true, pressMode: 'auto' },
    });
    const r = computeGameResult(three, new Map([['m1', [...card(['p1'], G1, 'A'), ...card(['p2'], G1, 'B'), ...card(['p3'], G1, 'C')]]]));
    expect(r.kind === 'individual' && r.presses).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Team → Match: a press is paid between that match's players (§5.dk Q4)
// ---------------------------------------------------------------------------

const G1G = ['p1', 'p2', 'p3', 'p4'];
const G2G = ['p5', 'p6', 'p7', 'p8'];

function matchGame(settings: Bag, extra: Partial<PoolGame> = {}): PoolGame {
  return makeGame({
    gameMode: 'team-2v2',
    indexes: [0, 0, 0, 0, 0, 0, 0, 0],
    teams: [makeTeam(1, G1G), makeTeam(2, G2G)],
    sides: [{ id: 'x', playerIds: ['p1', 'p2', 'p5', 'p6'] }, { id: 'y', playerIds: ['p3', 'p4', 'p7', 'p8'] }],
    modeSettings: {
      format: 'best-ball', scoring: 'stroke', result: 'match', moneyModel: 'legs', junkEnabled: false,
      // $5 a player a leg, stored per team of four (§5.dd).
      legFront: 20, legBack: 20, legOverall: 20, matchSize: 2, presses: true, pressMode: 'auto',
      ...settings,
    },
    ...extra,
  });
}

function matchScores(m1: string, m2: string) {
  return new Map<string, GameScore[]>([
    ['m1', [...card(['p1', 'p2'], m1, 'A'), ...card(['p3', 'p4'], m1, 'B')]],
    ['m2', [...card(['p5', 'p6'], m2, 'A'), ...card(['p7', 'p8'], m2, 'B')]],
  ]);
}

describe('presses: Team → Match games', () => {
  // Match 1 (p1 p2 v p3 p4) plays G1 on the front, back halved; match 2 halves every hole.
  // TEAM legs (winner takes, $20 a team): front X 1½–½ (+$20), back ½–½ each... 1–1 (push),
  // overall X 1½–½ (+$20): X +$40, Y −$40, $10 a player.
  // THE PRESS (match 1 only): p1 & p2's press 5–9, 3 up, at $5 a player (the leg's $20 ÷ 4):
  // p1 +5, p2 +5, p3 −5, p4 −5. Match 2's players aren't in it.
  const M1 = '-B-BA-A-A' + HALVED9;
  const M2 = HALVED9 + HALVED9;

  it('the press pays between its match\'s players, on top of the team result', () => {
    const game = matchGame({});
    const r = computeGameResult(game, matchScores(M1, M2)) as IndividualResult;
    expect(sideMoney(r)).toEqual({ X: 40, Y: -40 });
    expect(r.presses!.map((p) => [p.match, p.label, p.by, p.stake])).toEqual([[r.matches![0].id, 'Press 5–9', 'x', 5]]);
    expect(r.playerMoney).toEqual({ p1: 5, p2: 5, p3: -5, p4: -5, p5: 0, p6: 0, p7: 0, p8: 0 });
    expect(ledger(game, matchScores(M1, M2))).toEqual({ p1: 15, p2: 15, p5: 10, p6: 10, p3: -15, p4: -15, p7: -10, p8: -10 });
  });

  it('button: the offer names its match; a tap on one match never presses the other', () => {
    const partial = '-B-B' + '.'.repeat(14);
    const r = computeGameResult(matchGame({ pressMode: 'button' }), matchScores(partial, partial)) as IndividualResult;
    const [m1, m2] = r.matches!.map((m) => m.id);
    expect(r.pressOffers!.map((o) => [o.match, o.of, o.side, o.fromHole])).toEqual([[m1, 'front', 'x', 5], [m2, 'front', 'x', 5]]);
    const tapped = matchGame({ pressMode: 'button' }, { presses: [{ match: m1, of: 'front', by: 'a', fromHole: 5 }] });
    const done = computeGameResult(tapped, matchScores(M1, M2)) as IndividualResult;
    expect(done.presses!.map((p) => p.match)).toEqual([m1]);
    expect(ledger(tapped, matchScores(M1, M2))).toEqual({ p1: 15, p2: 15, p5: 10, p6: 10, p3: -15, p4: -15, p7: -10, p8: -10 });
  });

  it('uneven teams don\'t press (no per-player stake yet, §5.dd)', () => {
    const game = matchGame({}, {
      players: makePlayers([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      sides: [{ id: 'x', playerIds: ['p1', 'p2', 'p5', 'p6'] }, { id: 'y', playerIds: ['p3', 'p4', 'p7', 'p8'] }, { id: 'z', playerIds: ['p9', 'p10'] }],
    });
    const r = computeGameResult(game, matchScores(M1, M2));
    expect(r.kind === 'individual' && r.presses).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// The classic pool's two-team match (moneyMode 'match', hole by hole)
// ---------------------------------------------------------------------------

describe('presses: the classic two-team match', () => {
  function classic(cfg: Record<string, unknown>, extra: Partial<PoolGame> = {}): PoolGame {
    return makeGame({
      indexes: [0, 0, 0, 0],
      teams: [makeTeam(1, ['p1', 'p2']), makeTeam(2, ['p3', 'p4'])],
      teamFormat: 'best-ball',
      moneyMode: 'match',
      matchConfig: { legDollars: { front: 10, back: 10, overall: 10 }, junkPerPoint: 0, scoring: 'holes', presses: true, pressMode: 'auto', ...cfg } as PoolGame['matchConfig'],
      ...extra,
    });
  }
  const scores = (p: string) => new Map([['m1', card(['p1', 'p2'], p, 'A')], ['m2', card(['p3', 'p4'], p, 'B')]]);
  const G1 = '-B-BA-A-A' + HALVED9;

  it('G1: $10 a player a bet, presses included: +$30 a player, $60 a team', () => {
    const r = computePoolResult(classic({}), scores(G1));
    const t1 = r.payouts.find((p) => p.teamId === 't1')!;
    const t2 = r.payouts.find((p) => p.teamId === 't2')!;
    expect([t1.perPersonNet, t1.presses, t1.net]).toEqual([30, 10, 60]);
    expect([t2.perPersonNet, t2.presses, t2.net]).toEqual([-30, -10, -60]);
    expect(r.presses!.map((p) => [p.label, p.by, p.status])).toEqual([['Press 5–9', 't1', 'Team 1 3 up']]);
    expect(ledger(classic({}), scores(G1))).toEqual({ p1: 30, p2: 30, p3: -30, p4: -30 });
  });

  it('off, or stroke play: nothing pressed, money as before', () => {
    const off = computePoolResult(classic({ presses: false }), scores(G1));
    expect(off.presses).toBeUndefined();
    expect(off.payouts.find((p) => p.teamId === 't1')!.perPersonNet).toBe(20);
    expect(computePoolResult(classic({ scoring: 'stroke' }), scores(G1)).presses).toBeUndefined();
  });

  it('button: offered at 2 down, paid once tapped', () => {
    const r = computePoolResult(classic({ pressMode: 'button' }), scores('-B-B' + '.'.repeat(14)));
    expect(r.pressOffers).toEqual([{ of: 'front', by: 'a', side: 't1', fromHole: 5, label: 'Team 1: press the front 9' }]);
    const tapped = computePoolResult(classic({ pressMode: 'button' }, { presses: [{ of: 'front', by: 'a', fromHole: 5 }] }), scores(G1));
    expect(tapped.payouts.find((p) => p.teamId === 't1')!.perPersonNet).toBe(30);
  });
});
