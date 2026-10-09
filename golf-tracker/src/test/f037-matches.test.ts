// F-037 T1 (§5.cn, §5.co) — Team → Match → money, hand-worked from the T0 example.
//
// Same cards as f037-pairings-golden.test.ts, but now the four pairs belong to TWO TEAMS and play
// head-to-head matches inside their foursome (matchSize 2):
//   X = a + c = p1 p2 | p5 p6        Y = b + d = p3 p4 | p7 p8
//   M1 (Group 1): a v b              M2 (Group 2): c v d
// Best ball to par (front / back / overall): a −2/0/−2, b 0/−1/−1, c −1/0/−1, d 0/−3/−3.
//   M1: front a, back b, overall a; holes won a 2 (1, 2), b 1 (10).
//   M2: front c, back d, overall d; holes won c 1 (3), d 3 (11, 12, 13).
// So X and Y each win one match (1–1); on holes won Y leads 4–3; on net strokes Y −4, X −3.
//
// Every number below is derived by hand from those lines, never read back from the engine (§5.z).

import { describe, expect, it } from 'vitest';
import { computeGameResult } from '@/lib/game-modes/result';
import { matchesOf } from '@/lib/game-modes/matches';
import type { GameSide } from '@/lib/game-modes/sides';
import type { GameScore } from '@/lib/game-state';
import type { IndividualResult } from '@/lib/game-modes/types';
import { makeGame, makeTeam, scoresFor, TEST_PARS } from './fixtures';

const G1 = ['p1', 'p2', 'p3', 'p4'];
const G2 = ['p5', 'p6', 'p7', 'p8'];
const TEAMS: GameSide[] = [
  { id: 'x', playerIds: ['p1', 'p2', 'p5', 'p6'] },
  { id: 'y', playerIds: ['p3', 'p4', 'p7', 'p8'] },
];
const BIRDIES: Record<string, number[]> = { p1: [1, 2], p3: [10], p5: [3], p7: [11, 12, 13] };
const ALL = Array.from({ length: 18 }, (_, i) => i + 1);
const FRONT = ALL.slice(0, 9);

function card(id: string, holes: number[]): GameScore[] {
  const b = BIRDIES[id] ?? [];
  return scoresFor(id, holes.map((h) => TEST_PARS[h - 1] - (b.includes(h) ? 1 : 0)), holes);
}
function scores(g2Holes: number[] = ALL) {
  return new Map<string, GameScore[]>([
    ['m1', G1.flatMap((id) => card(id, ALL))],
    ['m2', G2.flatMap((id) => card(id, g2Holes))],
  ]);
}

function matchGame(settings: Record<string, string | number | boolean>, sides: GameSide[] = TEAMS) {
  return makeGame({
    gameMode: 'team-2v2',
    indexes: [0, 0, 0, 0, 0, 0, 0, 0],
    teams: [makeTeam(1, G1), makeTeam(2, G2)],
    sides,
    modeSettings: {
      format: 'best-ball', scoring: 'stroke', result: 'total', junkEnabled: false,
      legFront: 10, legBack: 10, legOverall: 10, dollarsPerPoint: 1, dollarsPerHole: 2,
      sideBuyIn: 20, potSplit: '100', moneyModel: 'pot',
      matchSize: 2,
      ...settings,
    },
  });
}

function run(settings: Record<string, string | number | boolean>, s = scores()): IndividualResult {
  const r = computeGameResult(matchGame(settings), s);
  if (r.kind !== 'individual') throw new Error('expected the team engine');
  return r;
}
function money(r: IndividualResult) {
  const out = Object.fromEntries(r.standings.map((s) => [s.playerId.toLowerCase(), s.moneyNet]));
  expect(r.standings.reduce((s, x) => s + x.moneyNet, 0), 'zero-sum across teams').toBe(0);
  return out;
}
const pts = (r: IndividualResult) => Object.fromEntries(r.standings.map((s) => [s.playerId.toLowerCase(), s.points]));

describe('matchesOf — who meets whom, read from the tee groups (§5.co Q6)', () => {
  it('2v2: one match per foursome, the team\'s pair in that foursome', () => {
    const m = matchesOf(TEAMS, [G1, G2], 2)!;
    expect(m.map((x) => x.units.map((u) => [u.teamId, u.playerIds]))).toEqual([
      [['x', ['p1', 'p2']], ['y', ['p3', 'p4']]],
      [['x', ['p5', 'p6']], ['y', ['p7', 'p8']]],
    ]);
  });

  it('1v1: two singles per foursome, paired in tee-sheet order', () => {
    const m = matchesOf(TEAMS, [G1, G2], 1)!;
    expect(m.map((x) => x.units.map((u) => u.playerIds[0]))).toEqual([['p1', 'p3'], ['p2', 'p4'], ['p5', 'p7'], ['p6', 'p8']]);
  });

  it('3 teams of 4 in 2v2 rotate fairly: A v B, B v C, C v A', () => {
    const teams: GameSide[] = [
      { id: 'a', playerIds: ['p1', 'p2', 'p11', 'p12'] },
      { id: 'b', playerIds: ['p3', 'p4', 'p5', 'p6'] },
      { id: 'c', playerIds: ['p7', 'p8', 'p9', 'p10'] },
    ];
    const m = matchesOf(teams, [['p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8'], ['p9', 'p10', 'p11', 'p12']], 2)!;
    expect(m.map((x) => x.units.map((u) => u.teamId).sort().join('v'))).toEqual(['avb', 'bvc', 'avc']);
  });

  it('foursome v foursome: 2 teams of 8, size 4, each tee group one team — paired across groups', () => {
    const ids = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
    const teams: GameSide[] = [{ id: 'x', playerIds: ids.slice(0, 8) }, { id: 'y', playerIds: ids.slice(8) }];
    const groups = [ids.slice(0, 4), ids.slice(4, 8), ids.slice(8, 12), ids.slice(12)];
    const m = matchesOf(teams, groups, 4)!;
    expect(m.map((x) => x.units.map((u) => u.playerIds[0]))).toEqual([['p1', 'p9'], ['p5', 'p13']]);
  });

  it('refuses a shape it cannot pair: three teams in one foursome, or a pair split across foursomes', () => {
    const three: GameSide[] = [{ id: 'a', playerIds: ['p1', 'p2'] }, { id: 'b', playerIds: ['p3'] }, { id: 'c', playerIds: ['p4'] }];
    expect(matchesOf(three, [['p1', 'p2', 'p3', 'p4']], 1)).toBeNull();
    // X's pair is split: p1 tees off with three of Y, p2 in the other foursome.
    expect(matchesOf(TEAMS, [['p1', 'p3', 'p4', 'p7'], ['p5', 'p2', 'p6', 'p8']], 2)).toBeNull();
  });

  it('size 0 / absent is OFF — no matches', () => {
    expect(matchesOf(TEAMS, [G1, G2], 0)).toBeNull();
  });
});

describe('F-037 T1 — match points (default): one point a match, 1 / ½ / 0', () => {
  it('each match is decided on its own overall leg: X takes M1, Y takes M2 → 1–1', () => {
    const r = run({});
    expect(pts(r)).toEqual({ x: 1, y: 1 });
    expect(r.matches!.map((m) => m.winner)).toEqual(['x', 'y']);
  });

  it('pot, push (default): a 1–1 tie splits the $40 → nobody moves', () => {
    expect(money(run({}))).toEqual({ x: 0, y: 0 });
  });

  it('tiebreak holes won: Y 4–3 → Y takes the pot', () => {
    expect(money(run({ teamTiebreak: 'holes' }))).toEqual({ x: -20, y: 20 });
  });

  it('tiebreak net strokes: Y −4 v X −3 → Y takes the pot', () => {
    expect(money(run({ teamTiebreak: 'strokes' }))).toEqual({ x: -20, y: 20 });
  });

  it('$ per point at 1–1 pays nothing', () => {
    expect(money(run({ moneyModel: 'per-point' }))).toEqual({ x: 0, y: 0 });
  });

  it('a halved match is ½ each', () => {
    // p7 makes par on 11, 12, 13 instead of birdie → d 0/0/0, c −1 overall: c takes M2. Then make
    // p5 par 3 too: c 0 — M2 halved; X 1½ (M1 + ½), Y ½.
    const s = scores();
    s.set('m2', G2.flatMap((id) => scoresFor(id, ALL.map((h) => TEST_PARS[h - 1]))));
    const r = run({ moneyModel: 'per-point' }, s);
    expect(pts(r)).toEqual({ x: 1.5, y: 0.5 });
    expect(money(r)).toEqual({ x: 1, y: -1 });
  });
});

describe('F-037 T1 — other ways to count a match (§5.cn)', () => {
  it('holes won: X 3, Y 4 → Y takes the pot; $1/point pays Y $1', () => {
    expect(pts(run({ matchCounting: 'holes' }))).toEqual({ x: 3, y: 4 });
    expect(money(run({ matchCounting: 'holes' }))).toEqual({ x: -20, y: 20 });
    expect(money(run({ matchCounting: 'holes', moneyModel: 'per-point' }))).toEqual({ x: -1, y: 1 });
  });

  it('net strokes: X −3, Y −4 (lower is better) → Y; $1/point pays Y $1', () => {
    expect(pts(run({ matchCounting: 'strokes' }))).toEqual({ x: -3, y: -4 });
    expect(money(run({ matchCounting: 'strokes', moneyModel: 'per-point' }))).toEqual({ x: -1, y: 1 });
  });
});

describe('F-037 T1 — Nassau inside a match, points per leg adjustable (§5.co Q4)', () => {
  it('1 / 1 / 1: M1 X 2–1, M2 Y 2–1 → 3–3', () => {
    expect(pts(run({ matchNassau: true }))).toEqual({ x: 3, y: 3 });
  });

  it('front worth 2: M1 X 3–1, M2 2–2 → X 5–3, takes the pot', () => {
    const r = run({ matchNassau: true, matchPtsFront: 2 });
    expect(pts(r)).toEqual({ x: 5, y: 3 });
    expect(money(r)).toEqual({ x: 20, y: -20 });
  });
});

describe('F-037 T1 — every money model with matches on (§5.co follow-up)', () => {
  it('legs: front X 2–0 (+10), back Y 2–0 (+10), overall 1–1 push → level', () => {
    expect(money(run({ moneyModel: 'legs' }))).toEqual({ x: 0, y: 0 });
  });

  it('legs, overall $20: still level — the overall leg is 1–1', () => {
    expect(money(run({ moneyModel: 'legs', legOverall: 20 }))).toEqual({ x: 0, y: 0 });
  });

  it('$ per hole: M1 a +1 hole, M2 d +2 holes at $2 → X −2, Y +2', () => {
    expect(money(run({ moneyModel: 'per-hole' }))).toEqual({ x: -2, y: 2 });
  });

  it('pot place split with 2 teams: "70,30" on a 1–0 lead pays 1st $28, 2nd $12', () => {
    const s = scores();
    s.set('m2', G2.flatMap((id) => scoresFor(id, ALL.map((h) => TEST_PARS[h - 1]))));
    // M2 halved (all pars) → X 1½, Y ½.
    expect(money(run({ potSplit: '70,30' }, s))).toEqual({ x: 8, y: -8 });
  });
});

describe('F-037 T1 — invariants', () => {
  it('mid-round (Group 2 thru 9): M2 is c v d on the front only → c leads, X 2–0, $1/point X +2', () => {
    const r = run({ moneyModel: 'per-point' }, scores(FRONT));
    expect(pts(r)).toEqual({ x: 2, y: 0 });
    expect(money(r)).toEqual({ x: 2, y: -2 });
  });

  it('locality: Group 2\'s cards cannot move M1', () => {
    const before = run({}).matches![0];
    const s = scores();
    s.set('m2', s.get('m2')!.map((x) => ((x.playerId === 'p7' || x.playerId === 'p8') && x.hole === 18 ? { ...x, grossScore: 9 } : x)));
    const after = run({}, s).matches![0];
    expect(after).toEqual(before);
  });

  it('each match equals a standalone 2v2 of its two pairs', () => {
    const lone = computeGameResult(makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0],
      sides: [{ id: 'x', playerIds: ['p1', 'p2'] }, { id: 'y', playerIds: ['p3', 'p4'] }],
      modeSettings: { format: 'best-ball', scoring: 'stroke', result: 'total', junkEnabled: false, moneyModel: 'legs' },
    }), new Map([['m1', G1.flatMap((id) => card(id, ALL))]]));
    if (lone.kind !== 'individual') throw new Error('expected the team engine');
    const m1 = run({}).matches![0];
    expect(m1.legs.map((l) => [l.key, l.winner])).toEqual(lone.teamLegs!.map((l) => [l.key, l.winner]));
  });

  it('zero-sum for every model × counting × payout at 3 teams', () => {
    const teams: GameSide[] = [
      { id: 'a', playerIds: ['p1', 'p2', 'p11', 'p12'] },
      { id: 'b', playerIds: ['p3', 'p4', 'p5', 'p6'] },
      { id: 'c', playerIds: ['p7', 'p8', 'p9', 'p10'] },
    ];
    const groups = [['p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8'], ['p9', 'p10', 'p11', 'p12']];
    const sc = new Map(groups.map((g, i) => [`m${i + 1}`, g.flatMap((id, j) =>
      scoresFor(id, ALL.map((h) => TEST_PARS[h - 1] + ((h + j + i) % 3) - 1)))]));
    for (const moneyModel of ['pot', 'per-point', 'legs', 'per-hole']) {
      for (const matchCounting of ['points', 'holes', 'strokes']) {
        for (const payout of ['winner-takes', 'pay-each']) {
          const g = makeGame({
            gameMode: 'team-2v2', indexes: Array(12).fill(0),
            teams: groups.map((ids, i) => makeTeam(i + 1, ids)), sides: teams,
            modeSettings: { format: 'best-ball', scoring: 'stroke', result: 'match', matchSize: 2,
              moneyModel, matchCounting, legsPayout: payout, pointsPayout: payout, potSplit: '70,30', junkEnabled: false },
          });
          const r = computeGameResult(g, sc);
          if (r.kind !== 'individual') throw new Error('expected the team engine');
          expect(r.matches, 'three matches').toHaveLength(3);
          const sum = r.standings.reduce((s, x) => s + x.moneyNet, 0);
          expect(Math.abs(sum), `${moneyModel}/${matchCounting}/${payout}`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('COMPAT: matchSize absent or 0 is today exactly — T0\'s field-wide legs', () => {
    const fourPairs: GameSide[] = [
      { id: 'a', playerIds: ['p1', 'p2'] }, { id: 'b', playerIds: ['p3', 'p4'] },
      { id: 'c', playerIds: ['p5', 'p6'] }, { id: 'd', playerIds: ['p7', 'p8'] },
    ];
    const r = computeGameResult(matchGame({ moneyModel: 'legs', matchSize: 0 }, fourPairs), scores());
    if (r.kind !== 'individual') throw new Error('expected the team engine');
    expect(r.matches).toBeUndefined();
    expect(Object.fromEntries(r.standings.map((s) => [s.playerId.toLowerCase(), s.moneyNet]))).toEqual({ a: 10, b: -30, c: -30, d: 50 });
  });
});
