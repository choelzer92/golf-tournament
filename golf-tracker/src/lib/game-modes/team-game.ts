import type { FormatSetting } from '../formats';
import type { HoleData } from '../pool-game';
import { teamHandicapForFormat } from '../pool-game';
import { getMoneyStrokesOnHole } from '../money-games';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding, TeamLegLine } from './types';
import { numberSetting, stringSetting } from './settings';

// 2-vs-2 within one foursome. The group's players are split into two SIDES
// (ctx.subTeams). Each hole yields one team score per side by the chosen FORMAT;
// the RESULT toggle decides hole-by-hole (match) vs 18-hole total; the leaderboard
// also breaks the contest into Front 9 / Back 9 / Overall legs; MONEY settles
// head-to-head. best-ball/combined use per-player gross entry; scramble/alt-shot
// use one team ball per hole (same gross written to both members on the scorecard)
// plus a team handicap.
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
      { value: 'scramble', label: 'Scramble (one ball, team handicap)' },
      { value: 'alternate-shot', label: 'Alternate shot (one ball)' },
    ],
    defaultValue: 'best-ball',
    hint: 'How each side’s hole score is formed. Scramble/alt-shot enter one team score per hole.',
  },
  {
    key: 'scoring', label: 'Hole score', type: 'select',
    options: [{ value: 'stableford', label: 'Points (Stableford)' }, { value: 'stroke', label: 'Net strokes' }],
    defaultValue: 'stableford',
    hint: 'How each side’s hole score is expressed — Stableford points or net strokes. (Not the same as match vs total — see “Compare by”.)',
  },
  {
    key: 'result', label: 'Compare by', type: 'select',
    options: [{ value: 'match', label: 'Match (hole by hole)' }, { value: 'total', label: 'Total (18 holes)' }],
    defaultValue: 'match',
    hint: 'Match: win each hole. Total: compare the 18-hole total. Works with either hole score. Front/back/overall shown either way.',
  },
  {
    key: 'moneyModel', label: 'Money', type: 'select',
    options: [
      { value: 'per-hole', label: '$ per hole won' },
      { value: 'per-point', label: '$ per point of margin' },
      { value: 'legs', label: 'Fixed front / back / overall' },
    ],
    defaultValue: 'legs',
  },
  { key: 'dollarsPerHole', label: '$ per hole won', type: 'number', defaultValue: 2, hint: 'Money = $ per hole × (holes won − holes lost) over 18.', showIf: { key: 'moneyModel', in: ['per-hole'] } },
  { key: 'dollarsPerPoint', label: '$ per point', type: 'number', defaultValue: 1, hint: 'Money = $ per point × 18-hole margin.', showIf: { key: 'moneyModel', in: ['per-point'] } },
  { key: 'legFront', label: 'Front 9 ($)', type: 'number', defaultValue: 10, showIf: { key: 'moneyModel', in: ['legs'] } },
  { key: 'legBack', label: 'Back 9 ($)', type: 'number', defaultValue: 10, showIf: { key: 'moneyModel', in: ['legs'] } },
  { key: 'legOverall', label: 'Overall 18 ($)', type: 'number', defaultValue: 10, showIf: { key: 'moneyModel', in: ['legs'] } },
  { key: 'altShotAllowance', label: 'Alt-shot allowance (%)', type: 'number', defaultValue: 50, hint: 'Alternate shot only: % of the 60/40 combined handicap. USGA default 50.', showIf: { key: 'format', in: ['alternate-shot'] } },
  { key: 'sideAName', label: 'Side A name', type: 'text', defaultValue: '', hint: 'Optional — leave blank to name it after its players.' },
  { key: 'sideBName', label: 'Side B name', type: 'text', defaultValue: '', hint: 'Optional — leave blank to name it after its players.' },
];

type Side = 'a' | 'b';

function compute(ctx: GameModeContext): IndividualResult {
  const format = stringSetting(SETTINGS, ctx.settings, 'format');
  const scoring = stringSetting(SETTINGS, ctx.settings, 'scoring');  // 'stableford' | 'stroke'
  const result = stringSetting(SETTINGS, ctx.settings, 'result');    // 'match' | 'total'
  const moneyModel = stringSetting(SETTINGS, ctx.settings, 'moneyModel');
  const dollarsPerHole = numberSetting(SETTINGS, ctx.settings, 'dollarsPerHole');
  const dollarsPerPoint = numberSetting(SETTINGS, ctx.settings, 'dollarsPerPoint');
  const legDollars = {
    front: numberSetting(SETTINGS, ctx.settings, 'legFront'),
    back: numberSetting(SETTINGS, ctx.settings, 'legBack'),
    overall: numberSetting(SETTINGS, ctx.settings, 'legOverall'),
  };
  const altShotAllowance = numberSetting(SETTINGS, ctx.settings, 'altShotAllowance');
  const numHoles = ctx.holes.length || 18;

  const sides = ctx.subTeams ?? { a: [], b: [] };
  const sideIds = (side: Side) => sides[side];
  // Custom side names (optional). Blank falls back to naming the side after its
  // players ("Craig & Jym"), then "Side A"/"Side B" if the side has no players.
  const customName: Record<Side, string> = {
    a: stringSetting(SETTINGS, ctx.settings, 'sideAName').trim(),
    b: stringSetting(SETTINGS, ctx.settings, 'sideBName').trim(),
  };
  const nameFor = (side: Side): string => {
    if (customName[side]) return customName[side];
    const names = sideIds(side).map((id) => ctx.players.find((p) => p.id === id)?.name.split(' ')[0]).filter(Boolean);
    return names.length ? names.join(' & ') : `Side ${side.toUpperCase()}`;
  };

  // Team handicap for the single-ball formats (undefined for best-ball/combined).
  const isSingleBall = format === 'scramble' || format === 'alternate-shot';
  const teamHcap: Record<Side, number> = { a: 0, b: 0 };
  if (isSingleBall) {
    for (const side of ['a', 'b'] as Side[]) {
      const raws = sideIds(side).map((id) => ctx.rawCourseHcap(id));
      teamHcap[side] = teamHandicapForFormat(
        raws,
        format as 'scramble' | 'alternate-shot',
        format === 'scramble' ? undefined : altShotAllowance,
      );
    }
  }

  // One side's team NET on a hole (lower better). null if not scored.
  function sideNet(side: Side, hole: HoleData): number | null {
    const ids = sideIds(side);
    if (isSingleBall) {
      // One ball: the members share an identical gross (the scorecard writes the
      // same value to both). Read the first member with a score.
      let gross: number | null = null;
      for (const id of ids) { const g = ctx.grossOnHole(id, hole); if (g !== null) { gross = g; break; } }
      if (gross === null) return null;
      return gross - getMoneyStrokesOnHole(teamHcap[side], hole.handicap, numHoles);
    }
    const nets: number[] = [];
    for (const id of ids) { const n = ctx.netOnHole(id, hole); if (n !== null) nets.push(n); }
    if (nets.length === 0) return null;
    return format === 'combined' ? nets.reduce((s, n) => s + n, 0) : Math.min(...nets);
  }

  // One side's Stableford points on a hole. Combined = sum of members' points;
  // everything else = points of the team net.
  function sidePts(side: Side, hole: HoleData): number | null {
    if (format === 'combined') {
      let total = 0, any = false;
      for (const id of sideIds(side)) { const n = ctx.netOnHole(id, hole); if (n === null) continue; any = true; total += sfPts(n, hole.par); }
      return any ? total : null;
    }
    const net = sideNet(side, hole);
    return net === null ? null : sfPts(net, hole.par);
  }

  const metric = (side: Side, hole: HoleData): number | null =>
    scoring === 'stableford' ? sidePts(side, hole) : sideNet(side, hole);

  const stand: Record<Side, PlayerStanding> = {
    a: { playerId: 'A', playerName: nameFor('a'), points: 0, moneyNet: 0, perHole: ctx.holes.map(() => null), thru: 0, place: 0 },
    b: { playerId: 'B', playerName: nameFor('b'), points: 0, moneyNet: 0, perHole: ctx.holes.map(() => null), thru: 0, place: 0 },
  };

  // Per-leg tallies (front = holes 1-9, back = 10-18, overall = all).
  const legHolesWon = { front: { a: 0, b: 0 }, back: { a: 0, b: 0 } };
  const legMetric = { front: { a: 0, b: 0 }, back: { a: 0, b: 0 } };
  const legThru = { front: 0, back: 0 };
  let totalA = 0, totalB = 0, thruHole = 0;

  ctx.holes.forEach((hole, hIdx) => {
    const ma = metric('a', hole);
    const mb = metric('b', hole);
    if (ma === null && mb === null) return;
    thruHole = hole.number;
    const leg = hole.number <= 9 ? 'front' : 'back';
    if (ma !== null) { stand.a.thru += 1; totalA += ma; legMetric[leg].a += ma; }
    if (mb !== null) { stand.b.thru += 1; totalB += mb; legMetric[leg].b += mb; }
    if (ma === null || mb === null) return;

    legThru[leg] += 1;
    const aWins = scoring === 'stableford' ? ma > mb : ma < mb;
    const bWins = scoring === 'stableford' ? mb > ma : mb < ma;
    if (aWins) legHolesWon[leg].a++;
    else if (bWins) legHolesWon[leg].b++;

    if (result === 'match') {
      stand.a.perHole[hIdx] = aWins ? 1 : bWins ? 0 : 0.5;
      stand.b.perHole[hIdx] = bWins ? 1 : aWins ? 0 : 0.5;
      stand.a.points += stand.a.perHole[hIdx]!;
      stand.b.points += stand.b.perHole[hIdx]!;
    } else {
      stand.a.perHole[hIdx] = ma;
      stand.b.perHole[hIdx] = mb;
    }
  });

  // Overall metric + place.
  if (result === 'total') {
    stand.a.points = totalA; stand.b.points = totalB;
    const aBetter = scoring === 'stableford' ? totalA > totalB : totalA < totalB;
    const tie = totalA === totalB;
    stand.a.place = tie ? 1 : aBetter ? 1 : 2;
    stand.b.place = tie ? 1 : aBetter ? 2 : 1;
  } else {
    const tie = stand.a.points === stand.b.points;
    stand.a.place = tie ? 1 : stand.a.points > stand.b.points ? 1 : 2;
    stand.b.place = tie ? 1 : stand.b.points > stand.a.points ? 1 : 2;
  }

  // Per-leg winners + status lines for the leaderboard.
  const nameA = nameFor('a'), nameB = nameFor('b');
  const legLine = (key: 'front' | 'back' | 'overall'): TeamLegLine => {
    const thru = key === 'overall' ? legThru.front + legThru.back : legThru[key];
    if (thru === 0) return { key, label: legLabel(key), status: '–', winner: null, thru: 0 };
    if (result === 'match') {
      const wa = key === 'overall' ? legHolesWon.front.a + legHolesWon.back.a : legHolesWon[key].a;
      const wb = key === 'overall' ? legHolesWon.front.b + legHolesWon.back.b : legHolesWon[key].b;
      const diff = wa - wb;
      const winner = diff > 0 ? 'a' : diff < 0 ? 'b' : null;
      const status = diff === 0 ? 'All square' : `${diff > 0 ? nameA : nameB} ${Math.abs(diff)} up`;
      return { key, label: legLabel(key), status, winner, thru };
    }
    // total: compare summed metric on the leg (stableford higher wins / stroke lower).
    const va = key === 'overall' ? totalA : legMetric[key].a;
    const vb = key === 'overall' ? totalB : legMetric[key].b;
    const aBetter = scoring === 'stableford' ? va > vb : va < vb;
    const winner = va === vb ? null : aBetter ? 'a' : 'b';
    const margin = Math.abs(va - vb);
    const status = va === vb ? 'Tied' : `${aBetter ? nameA : nameB} by ${margin % 1 === 0 ? margin : margin.toFixed(1)}`;
    return { key, label: legLabel(key), status, winner, thru };
  };
  const teamLegs: TeamLegLine[] = [legLine('front'), legLine('back'), legLine('overall')];

  // Money — zero-sum head-to-head. Positive to A means B owes it.
  let aMoney = 0;
  if (moneyModel === 'per-hole') {
    const wonA = legHolesWon.front.a + legHolesWon.back.a;
    const wonB = legHolesWon.front.b + legHolesWon.back.b;
    aMoney = (wonA - wonB) * dollarsPerHole;
  } else if (moneyModel === 'per-point') {
    const marginA = result === 'match'
      ? stand.a.points - stand.b.points
      : scoring === 'stableford' ? totalA - totalB : totalB - totalA;
    aMoney = marginA * dollarsPerPoint;
  } else {
    // legs: each leg's winner collects that leg's dollars.
    const legSign = (l: TeamLegLine) => (l.winner === 'a' ? 1 : l.winner === 'b' ? -1 : 0);
    aMoney += legSign(teamLegs[0]) * legDollars.front;
    aMoney += legSign(teamLegs[1]) * legDollars.back;
    aMoney += legSign(teamLegs[2]) * legDollars.overall;
  }
  stand.a.moneyNet = aMoney;
  stand.b.moneyNet = -aMoney;

  const metricLabel = result === 'match' ? 'match pts' : scoring === 'stableford' ? 'pts' : 'net';
  // Order the two sides by who's winning (place 1 first). Unscored (place 0) sinks
  // last. Without this the board always listed A then B regardless of the lead.
  const standings = [stand.a, stand.b].sort((x, y) => {
    const px = x.place === 0 ? Infinity : x.place;
    const py = y.place === 0 ? Infinity : y.place;
    return px - py;
  });
  return {
    kind: 'individual', gameModeId: 'team-2v2', metricLabel,
    standings, pot: 0, thruHole, moneyModel: 'per-point',
    teamLegs, sideNames: { a: nameA, b: nameB },
  };
}

function legLabel(key: 'front' | 'back' | 'overall'): string {
  return key === 'front' ? 'Front 9' : key === 'back' ? 'Back 9' : 'Overall 18';
}

export const teamGame: GameModeDescriptor = {
  id: 'team-2v2',
  name: '2 vs 2 (within group)',
  description: 'Split the group into two sides and play head-to-head — best ball, combined, scramble, or alternate shot.',
  category: 'team-within-group',
  inputType: 'gross',
  playersMin: 4,
  playersMax: 4,
  settings: SETTINGS,
  compute,
};
