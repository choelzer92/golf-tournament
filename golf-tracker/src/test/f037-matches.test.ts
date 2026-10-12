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
import { matchesOf, matchShapeProblem, matchSizesFor, suggestMatches, teeGroupsFromMatches } from '@/lib/game-modes/matches';
import type { GameSide } from '@/lib/game-modes/sides';
import type { GameScore } from '@/lib/game-state';
import type { IndividualResult } from '@/lib/game-modes/types';
import { buildHcapMap, poolStrokeMap } from '@/lib/pool-game';
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

describe('F-037 — carry ties apply INSIDE each match (Craig 2026-10-09)', () => {
  it('$2 a hole, carry on: M1 a 2+2, b 1+7 carried = $16 → X −12; M2 c 1+2 = $6, d 1+7, 1, 1 = $20 → X −14; X −26, Y +26', () => {
    // M1: holes 1, 2 a (no carry); 3–9 halved (carry 7); 10 b takes 8 holes = $16; 11–18 halved, dead.
    // M2: 1, 2 halved (carry 2); 3 c takes 3 = $6; 4–10 halved (carry 7); 11 d takes 8 = $16; 12, 13 d $2 each.
    expect(money(run({ moneyModel: 'per-hole', carryover: true }))).toEqual({ x: -26, y: 26 });
  });

  it('carry off is the plain margin (unchanged): X −2, Y +2', () => {
    expect(money(run({ moneyModel: 'per-hole', carryover: false }))).toEqual({ x: -2, y: 2 });
  });
});

describe('F-037 — a shape that cannot be paired is a problem, never a game (§5.ac, Craig 2026-10-09)', () => {
  const game = (groups: string[][], matchSize: number) => makeGame({
    gameMode: 'team-2v2', indexes: Array(8).fill(0),
    teams: groups.map((ids, i) => makeTeam(i + 1, ids)), sides: TEAMS,
    modeSettings: { matchSize },
  });

  it('a pairable sheet, or matches off, has no problem', () => {
    expect(matchShapeProblem(game([G1, G2], 2))).toBeNull();
    expect(matchShapeProblem(game([G1, G2], 1))).toBeNull();
    expect(matchShapeProblem(game([['p1', 'p3', 'p4', 'p7'], ['p5', 'p2', 'p6', 'p8']], 0))).toBeNull();
  });

  it('a split pair says which group and why', () => {
    expect(matchShapeProblem(game([['p1', 'p3', 'p4', 'p7'], ['p5', 'p2', 'p6', 'p8']], 2)))
      .toBe('Group 1 needs the same number of players from each team, 2 players a match.');
  });

  it('three teams in one foursome', () => {
    const g = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0],
      sides: [{ id: 'a', playerIds: ['p1', 'p2'] }, { id: 'b', playerIds: ['p3'] }, { id: 'c', playerIds: ['p4'] }],
      modeSettings: { matchSize: 1 },
    });
    expect(matchShapeProblem(g)).toBe('Group 1 has players from 3 teams; a match is between two.');
  });

  it('size 3 cannot divide a foursome of 2 + 2', () => {
    expect(matchShapeProblem(game([G1, G2], 3))).toMatch(/^Group 1 /);
  });
});

describe('F-037 T3 — building the tee sheet FROM the matches (§5.co Q1, Q6)', () => {
  const team = (t: string, n: number) => Array.from({ length: n }, (_, i) => `${t}${i + 1}`);
  const asTeams = (ts: string[][]): GameSide[] => ts.map((ids, i) => ({ id: String.fromCharCode(97 + i), playerIds: ids }));

  it('offers 1 v 1 and 2 v 2 only where they divide every team and are smaller than it', () => {
    expect(matchSizesFor([4, 4])).toEqual([1, 2]);
    expect(matchSizesFor([2, 2])).toEqual([1]);
    expect(matchSizesFor([4, 4, 4])).toEqual([1, 2]);
    expect(matchSizesFor([3, 3])).toEqual([1]);
    expect(matchSizesFor([1, 1, 1, 1])).toEqual([]);
    expect(matchSizesFor([8])).toEqual([]);
    expect(matchSizesFor([4, 2, 2])).toEqual([1]);
  });

  it('three teams of 4 at 2 v 2 rotate: every team meets both others once', () => {
    const ts = [team('a', 4), team('b', 4), team('c', 4)];
    const m = suggestMatches(ts, 2)!;
    const meet = m.map(([x, y]) => [x[0][0], y[0][0]].sort().join(''));
    expect(meet.sort()).toEqual(['ab', 'ac', 'bc']);
  });

  it('four teams of 4 at 2 v 2: four matches, each team meets two different teams', () => {
    const ts = [team('a', 4), team('b', 4), team('c', 4), team('d', 4)];
    const m = suggestMatches(ts, 2)!;
    expect(m).toHaveLength(4);
    for (const t of 'abcd') {
      const opp = m.filter(([x, y]) => x[0][0] === t || y[0][0] === t).map(([x, y]) => (x[0][0] === t ? y[0][0] : x[0][0]));
      expect(new Set(opp).size, `team ${t} meets two different teams`).toBe(2);
    }
  });

  for (const [label, sizes, size] of [
    ['2 teams of 4, 2 v 2', [4, 4], 2], ['2 teams of 4, singles', [4, 4], 1], ['3 teams of 4, 2 v 2', [4, 4, 4], 2],
    ['4 teams of 4, 2 v 2', [4, 4, 4, 4], 2], ['2 teams of 2, singles', [2, 2], 1], ['3 teams of 2, singles', [2, 2, 2], 1],
    ['2 teams of 8, 2 v 2', [8, 8], 2],
  ] as [string, number[], number][]) {
    it(`${label}: the built tee sheet reads back as the suggested matches, in foursomes`, () => {
      const ts = sizes.map((k, i) => team(String.fromCharCode(97 + i), k));
      const groups = teeGroupsFromMatches(ts, size)!;
      expect(groups.every((g) => g.length <= 4)).toBe(true);
      expect(groups.flat().sort()).toEqual(ts.flat().sort());
      const read = matchesOf(asTeams(ts), groups, size)!;
      expect(read, 'pairable').not.toBeNull();
      const want = suggestMatches(ts, size)!.map((m) => m.map((u) => u.join(',')).sort().join(' v ')).sort();
      expect(read.map((m) => m.units.map((u) => u.playerIds.join(',')).sort().join(' v ')).sort()).toEqual(want);
    });
  }
});

// T4 (§5.cn): under OFF THE LOW, strokes come off the low player IN EACH MATCH, not the field.
// Indexes (CH == index): M1 x p1 2, p2 4 v y p3 6, p4 8; M2 x p5 10, p6 12 v y p7 14, p8 16.
//   Field low 2:  p5..p8 get 8, 10, 12, 14.      Per match:  M1 0, 2, 4, 6;  M2 0, 2, 4, 6.
// Everyone pars every hole except p8 bogeys 3–6 (SI == hole, so strokes fall on holes 1..n).
//   M1 (same either way): x best −1 on 1–2; y best −1 on 1–6 → y wins 3, 4, 5, 6 = 4 holes.
//   M2 per match: x −1 on 1–2 (p6); y: p7 −1 on 1–4, p8 net par on 3–6 → y wins 3, 4 = 2 holes.
//   M2 field-wide: x −1 on 1–10 (p6); y: p7 −1 on 1–12, p8 −1 on 13–14 → y wins 11–14 = 4 holes.
describe('F-037 T4 — strokes off the low PER MATCH', () => {
  const idx = [2, 4, 6, 8, 10, 12, 14, 16];
  const t4Game = (strokeMethod: 'off-the-low' | 'full', matchSize = 2) => makeGame({
    gameMode: 'team-2v2', indexes: idx, strokeMethod,
    teams: [makeTeam(1, G1), makeTeam(2, G2)], sides: TEAMS,
    modeSettings: { format: 'best-ball', scoring: 'stroke', result: 'match', moneyModel: 'per-point', dollarsPerPoint: 1, matchCounting: 'holes', junkEnabled: false, matchSize },
  });
  const t4Scores = () => new Map<string, GameScore[]>([
    ['m1', G1.flatMap((id) => scoresFor(id, ALL.map((h) => TEST_PARS[h - 1])))],
    ['m2', G2.flatMap((id) => scoresFor(id, ALL.map((h) => TEST_PARS[h - 1] + (id === 'p8' && h >= 3 && h <= 6 ? 1 : 0))))],
  ]);
  const holes = (g: ReturnType<typeof t4Game>) => {
    const r = computeGameResult(g, t4Scores());
    if (r.kind !== 'individual') throw new Error('expected the team engine');
    return r.matches ? r.matches.map((m) => m.holesWon.y) : null;
  };

  it('the stroke map takes each match\'s low: 0 / 2 / 4 / 6 in both matches', () => {
    const map = buildHcapMap(t4Game('off-the-low'));
    expect(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((id) => map.get(id))).toEqual([0, 2, 4, 6, 0, 2, 4, 6]);
  });

  it('M2 is decided on its own low: y wins 2 holes (field-wide it would be 4)', () => {
    expect(holes(t4Game('off-the-low'))).toEqual([4, 2]);
  });

  it('COMPAT: matches off keeps the field low (8 / 10 / 12 / 14 in group 2)', () => {
    const map = buildHcapMap(t4Game('off-the-low', 0));
    expect(['p5', 'p6', 'p7', 'p8'].map((id) => map.get(id))).toEqual([8, 10, 12, 14]);
  });

  it('COMPAT: full handicap is untouched by matches — everyone plays their own course handicap', () => {
    const map = buildHcapMap(t4Game('full'));
    expect(['p1', 'p5', 'p8'].map((id) => map.get(id))).toEqual([2, 10, 16]);
    expect(holes(t4Game('full'))).toEqual([4, 4]);
  });

  it('the scorecard\'s stroke dots read the same map as the money (one source, AGENTS.md)', () => {
    const g = t4Game('off-the-low');
    expect(poolStrokeMap(g)).toEqual(buildHcapMap(g));
  });
});
