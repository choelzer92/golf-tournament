import type { FormatSetting } from '../formats';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding } from './types';
import { rankByPointsDesc, settlePerPoint } from './types';
import { numberSetting, stringSetting, parseVector } from './settings';

// Split Sixes (a.k.a. "English"). A THREE-player game: each hole, 6 points are
// split among the three by score, default 4/2/0 (best/middle/worst). Ties share
// the pooled slots evenly — e.g. two tie for low → (4+2)/2 = 3 each, worst 0; all
// three tie → (4+2+0)/3 = 2 each. Same tie-averaging as 9s, different vector +
// player count.
const SETTINGS: FormatSetting[] = [
  {
    key: 'scoreBasis', label: 'Score basis', type: 'select',
    options: [{ value: 'net', label: 'Net' }, { value: 'gross', label: 'Gross' }],
    defaultValue: 'net',
  },
  {
    key: 'pointVector', label: 'Points per hole (best → worst)', type: 'text', defaultValue: '4,2,0',
    hint: 'Six points split among three players. Ties average the pooled slots.',
  },
  { key: 'dollarsPerPoint', label: '$ per point', type: 'number', defaultValue: 1, hint: 'Settle (points − group avg) × this. Zero-sum.' },
];

// Distribute a point vector across ranked players (best-first = lowest score),
// averaging the pooled slots across any tie group. Identical to nines' logic.
function distributeVector(scored: { playerId: string; value: number }[], vector: number[]): Map<string, number> {
  const out = new Map<string, number>();
  const sorted = [...scored].sort((a, b) => a.value - b.value);
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) j++;
    let slotSum = 0;
    for (let k = i; k < j; k++) slotSum += vector[k] ?? 0;
    const shared = slotSum / (j - i);
    for (let k = i; k < j; k++) out.set(sorted[k].playerId, shared);
    i = j;
  }
  return out;
}

function compute(ctx: GameModeContext): IndividualResult {
  const basis = stringSetting(SETTINGS, ctx.settings, 'scoreBasis');
  const vector = parseVector(stringSetting(SETTINGS, ctx.settings, 'pointVector'));
  const dollarsPerPoint = numberSetting(SETTINGS, ctx.settings, 'dollarsPerPoint');

  const standings: PlayerStanding[] = ctx.players.map((p) => ({
    playerId: p.id, playerName: p.name, points: 0, moneyNet: 0,
    perHole: ctx.holes.map(() => null as number | null), thru: 0, place: 0,
  }));
  const byId = new Map(standings.map((s) => [s.playerId, s]));
  let thruHole = 0;

  ctx.holes.forEach((hole, hIdx) => {
    const scored: { playerId: string; value: number }[] = [];
    for (const p of ctx.players) {
      const v = basis === 'gross' ? ctx.grossOnHole(p.id, hole) : ctx.netOnHole(p.id, hole);
      if (v !== null) scored.push({ playerId: p.id, value: v });
    }
    if (scored.length === 0) return;
    thruHole = hole.number;
    const pts = distributeVector(scored, vector);
    for (const { playerId } of scored) {
      const s = byId.get(playerId)!;
      const gained = pts.get(playerId) ?? 0;
      s.points += gained;
      s.perHole[hIdx] = gained;
      s.thru += 1;
    }
  });

  rankByPointsDesc(standings);
  settlePerPoint(standings, dollarsPerPoint);

  return {
    kind: 'individual', gameModeId: 'split-sixes', metricLabel: 'pts',
    standings, pot: 0, thruHole, moneyModel: 'per-point',
  };
}

export const splitSixes: GameModeDescriptor = {
  id: 'split-sixes',
  name: 'Split Sixes (3-player)',
  description: 'Three players split 6 points a hole (4/2/0). Ties share evenly.',
  category: 'individual',
  inputType: 'gross',
  playersMin: 3,
  playersMax: 3,
  settings: SETTINGS,
  compute,
};
