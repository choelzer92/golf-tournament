import type { FormatSetting } from '../formats';
import type { HoleData } from '../pool-game';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding } from './types';
import { numberSetting, stringSetting } from './settings';

// 2-vs-2 within one foursome. The group's four players are split into two SIDES
// (ctx.subTeams). Each hole produces a team score per side by the chosen FORMAT;
// the RESULT toggle decides whether we tally hole-by-hole (match) or by total;
// MONEY settles head-to-head between the two sides. Phase A supports the two
// per-player-entry formats (best-ball, combined); scramble/alt-shot (single-ball
// entry) come in Phase B.
//
// Self-contained Stableford scale (redefined here like quota.ts, rather than
// widening another module's exports).
const SCALE = { albatrossOrBetter: 5, eagle: 4, birdie: 3, par: 2, bogey: 1, doubleOrWorse: 0 };
function sfPts(net: number, par: number): number {
  const diff = net - par;
  if (diff <= -3) return SCALE.albatrossOrBetter;
  if (diff === -2) return SCALE.eagle;
  if (diff === -1) return SCALE.birdie;
  if (diff === 0) return SCALE.par;
  if (diff === 1) return SCALE.bogey;
  return SCALE.doubleOrWorse;
}

const SETTINGS: FormatSetting[] = [
  {
    key: 'format', label: 'Team format', type: 'select',
    options: [
      { value: 'best-ball', label: 'Best ball (low net counts)' },
      { value: 'combined', label: 'Combined (both scores added)' },
    ],
    defaultValue: 'best-ball',
    hint: 'How each side’s hole score is formed from its two players.',
  },
  {
    key: 'scoring', label: 'Scoring', type: 'select',
    options: [{ value: 'stableford', label: 'Stableford (points)' }, { value: 'stroke', label: 'Stroke (net)' }],
    defaultValue: 'stableford',
  },
  {
    key: 'result', label: 'Result', type: 'select',
    options: [{ value: 'match', label: 'Match play (hole by hole)' }, { value: 'total', label: 'Total (18 holes)' }],
    defaultValue: 'match',
    hint: 'Match: win each hole for points. Total: compare the 18-hole total.',
  },
  {
    key: 'moneyModel', label: 'Money', type: 'select',
    options: [
      { value: 'per-hole', label: '$ per hole won' },
      { value: 'per-point', label: '$ per point of margin' },
      { value: 'legs', label: 'Fixed front / back / overall' },
    ],
    defaultValue: 'per-hole',
  },
  { key: 'dollarsPerHole', label: '$ per hole won', type: 'number', defaultValue: 2, hint: 'Money = $ per hole × (holes won − holes lost).' },
  { key: 'dollarsPerPoint', label: '$ per point', type: 'number', defaultValue: 1, hint: 'Money = $ per point × (your total − their total).' },
  { key: 'legFront', label: 'Front 9 ($)', type: 'number', defaultValue: 10 },
  { key: 'legBack', label: 'Back 9 ($)', type: 'number', defaultValue: 10 },
  { key: 'legOverall', label: 'Overall 18 ($)', type: 'number', defaultValue: 10 },
];

type Side = 'a' | 'b';

// One side's team NET on a hole (lower is better), by format. null if no member
// posted a score. (Phase A: best-ball = min member net; combined = sum.)
function sideNet(ctx: GameModeContext, sideIds: string[], hole: HoleData, format: string): number | null {
  const nets: number[] = [];
  for (const id of sideIds) {
    const n = ctx.netOnHole(id, hole);
    if (n !== null) nets.push(n);
  }
  if (nets.length === 0) return null;
  if (format === 'combined') return nets.reduce((s, n) => s + n, 0);
  return Math.min(...nets); // best-ball
}

// One side's Stableford points on a hole, by format. Best-ball = points of the
// best net; combined = sum of each member's points (mirrors the tournament engine).
function sidePts(ctx: GameModeContext, sideIds: string[], hole: HoleData, format: string): number | null {
  if (format === 'combined') {
    let total = 0; let any = false;
    for (const id of sideIds) {
      const n = ctx.netOnHole(id, hole);
      if (n === null) continue;
      any = true;
      total += sfPts(n, hole.par);
    }
    return any ? total : null;
  }
  const net = sideNet(ctx, sideIds, hole, format);
  return net === null ? null : sfPts(net, hole.par);
}

function compute(ctx: GameModeContext): IndividualResult {
  const format = stringSetting(SETTINGS, ctx.settings, 'format');
  const scoring = stringSetting(SETTINGS, ctx.settings, 'scoring'); // 'stableford' | 'stroke'
  const result = stringSetting(SETTINGS, ctx.settings, 'result');   // 'match' | 'total'
  const moneyModel = stringSetting(SETTINGS, ctx.settings, 'moneyModel');
  const dollarsPerHole = numberSetting(SETTINGS, ctx.settings, 'dollarsPerHole');
  const dollarsPerPoint = numberSetting(SETTINGS, ctx.settings, 'dollarsPerPoint');
  const legDollars = {
    front: numberSetting(SETTINGS, ctx.settings, 'legFront'),
    back: numberSetting(SETTINGS, ctx.settings, 'legBack'),
    overall: numberSetting(SETTINGS, ctx.settings, 'legOverall'),
  };

  const sides = ctx.subTeams ?? { a: [], b: [] };
  const nameFor = (side: Side): string => {
    const ids = sides[side];
    const names = ids.map((id) => ctx.players.find((p) => p.id === id)?.name.split(' ')[0]).filter(Boolean);
    return names.length ? names.join(' & ') : `Side ${side.toUpperCase()}`;
  };

  // Per-hole metric for each side (points if stableford, else net). null = not
  // both-scored yet on that hole.
  const metric = (side: Side, hole: HoleData): number | null =>
    scoring === 'stableford' ? sidePts(ctx, sides[side], hole, format) : sideNet(ctx, sides[side], hole, format);

  const stand: Record<Side, PlayerStanding> = {
    a: { playerId: 'A', playerName: nameFor('a'), points: 0, moneyNet: 0, perHole: ctx.holes.map(() => null), thru: 0, place: 0 },
    b: { playerId: 'B', playerName: nameFor('b'), points: 0, moneyNet: 0, perHole: ctx.holes.map(() => null), thru: 0, place: 0 },
  };

  // Match-play tally (per-hole win/tie), plus totals for the 'total' result and
  // for leg money. Higher points win a hole in stableford; lower net wins in stroke.
  let holesWonA = 0, holesWonB = 0;
  let totalA = 0, totalB = 0;
  const legWins = { front: { a: 0, b: 0 }, back: { a: 0, b: 0 } };
  let thruHole = 0;

  ctx.holes.forEach((hole, hIdx) => {
    const ma = metric('a', hole);
    const mb = metric('b', hole);
    if (ma === null && mb === null) return;
    thruHole = hole.number;
    if (ma !== null) { stand.a.thru += 1; totalA += ma; }
    if (mb !== null) { stand.b.thru += 1; totalB += mb; }

    // A hole is only "played" head-to-head when BOTH sides have a score.
    if (ma === null || mb === null) return;
    const aWins = scoring === 'stableford' ? ma > mb : ma < mb;
    const bWins = scoring === 'stableford' ? mb > ma : mb < ma;
    const leg = hole.number <= 9 ? 'front' : 'back';
    if (aWins) { holesWonA++; legWins[leg].a++; }
    else if (bWins) { holesWonB++; legWins[leg].b++; }

    if (result === 'match') {
      // Running match points (win 1 / tie 0.5) for display in perHole + points.
      stand.a.perHole[hIdx] = aWins ? 1 : bWins ? 0 : 0.5;
      stand.b.perHole[hIdx] = bWins ? 1 : aWins ? 0 : 0.5;
      stand.a.points += stand.a.perHole[hIdx]!;
      stand.b.points += stand.b.perHole[hIdx]!;
    } else {
      stand.a.perHole[hIdx] = ma;
      stand.b.perHole[hIdx] = mb;
    }
  });

  // Final metric + place.
  if (result === 'total') {
    stand.a.points = totalA;
    stand.b.points = totalB;
    // stableford total: higher wins; stroke total: lower wins.
    const aBetter = scoring === 'stableford' ? totalA > totalB : totalA < totalB;
    const tie = totalA === totalB;
    stand.a.place = tie ? 1 : aBetter ? 1 : 2;
    stand.b.place = tie ? 1 : aBetter ? 2 : 1;
  } else {
    // match: more match points wins.
    const tie = stand.a.points === stand.b.points;
    stand.a.place = tie ? 1 : stand.a.points > stand.b.points ? 1 : 2;
    stand.b.place = tie ? 1 : stand.b.points > stand.a.points ? 1 : 2;
  }

  // Money — zero-sum, head-to-head. Positive to side A means B owes it.
  let aMoney = 0;
  if (moneyModel === 'per-hole') {
    aMoney = (holesWonA - holesWonB) * dollarsPerHole;
  } else if (moneyModel === 'per-point') {
    // Margin in the game metric. For stroke, lower is better, so A gains when its
    // total is LOWER — flip the sign.
    const marginA = result === 'match'
      ? stand.a.points - stand.b.points
      : scoring === 'stableford' ? totalA - totalB : totalB - totalA;
    aMoney = marginA * dollarsPerPoint;
  } else {
    // legs: front/back by holes won, overall by the full match/total winner.
    const legWinner = (w: { a: number; b: number }) => (w.a > w.b ? 1 : w.b > w.a ? -1 : 0);
    aMoney += legWinner(legWins.front) * legDollars.front;
    aMoney += legWinner(legWins.back) * legDollars.back;
    const overall = stand.a.place === stand.b.place ? 0 : stand.a.place === 1 ? 1 : -1;
    aMoney += overall * legDollars.overall;
  }
  stand.a.moneyNet = aMoney;
  stand.b.moneyNet = -aMoney;

  const metricLabel = result === 'match' ? 'match pts' : scoring === 'stableford' ? 'pts' : 'net';
  return {
    kind: 'individual', gameModeId: 'team-2v2', metricLabel,
    standings: [stand.a, stand.b], pot: 0, thruHole, moneyModel: 'per-point',
  };
}

export const teamGame: GameModeDescriptor = {
  id: 'team-2v2',
  name: '2 vs 2 (within group)',
  description: 'Split the group into two sides and play head-to-head — best ball or combined, match or total.',
  category: 'team-within-group',
  inputType: 'gross',
  playersMin: 4,
  playersMax: 4,
  settings: SETTINGS,
  compute,
};
