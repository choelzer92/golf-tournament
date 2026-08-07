import type { FormatSetting } from '../formats';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding } from './types';
import { rankByPointsDesc, settlePerPoint, settlePot } from './types';
import type { NassauLegLine } from './types';
import { numberSetting, stringSetting, parseVector, NASSAU_SETTINGS, settleNassauFromSettings, JUNK_SETTINGS, settleJunkFromSettings } from './settings';

// Nines (a.k.a. 9s / 5-3-1). On each hole a fixed pool of points (default 9,
// split 5/3/1) is divided among the group by score — best score takes the top
// slot, worst the bottom. Ties SPLIT the pooled slots they span, evenly. It's
// Stableford relative to your playing partners instead of par, so it needs only
// gross scores — no per-hole decisions.
const SETTINGS: FormatSetting[] = [
  {
    key: 'scoreBasis', label: 'Score basis', type: 'select',
    options: [{ value: 'net', label: 'Net' }, { value: 'gross', label: 'Gross' }],
    defaultValue: 'net',
    hint: 'Rank each hole by net (handicap-adjusted) or raw gross.',
  },
  {
    key: 'pointVector', label: 'Points per hole (best → worst)', type: 'text',
    defaultValue: '5,3,1',
    hint: 'Points awarded 1st/2nd/3rd… Sums to the hole pool (5+3+1 = 9). Editable — e.g. "4,2,0" for Split Sixes, or "5,3,1,0" for four players.',
  },
  {
    key: 'moneyModel', label: 'Money', type: 'select',
    options: [
      { value: 'per-point', label: '$ per point' },
      { value: 'pot', label: 'Buy-in pot (most points wins)' },
      { value: 'nassau', label: 'Nassau pot (split front/back/total)' },
    ],
    defaultValue: 'per-point',
  },
  {
    key: 'dollarsPerPoint', label: '$ per point', type: 'number', defaultValue: 1,
    hint: 'Each player settles (points − group avg) × this.',
    showIf: { key: 'moneyModel', in: ['per-point'] },
  },
  ...NASSAU_SETTINGS,
  ...JUNK_SETTINGS,
];

// Distribute a point vector across N ranked players with tie-averaging. `order`
// is player indices best→worst; `tieKey` gives each player's comparable score so
// equal scores share the summed slots. Returns points keyed by the passed index.
function distributeVector(
  scored: { playerId: string; value: number }[],
  vector: number[],
): Map<string, number> {
  const out = new Map<string, number>();
  // Best-first: for 'net'/'gross' lower value is better, so ascending.
  const sorted = [...scored].sort((a, b) => a.value - b.value);
  let i = 0;
  while (i < sorted.length) {
    // Find the tie group [i, j)
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) j++;
    // Sum the slot points spanning ranks i..j-1 (missing slots are worth 0).
    let slotSum = 0;
    for (let k = i; k < j; k++) slotSum += vector[k] ?? 0;
    const shared = slotSum / (j - i);
    for (let k = i; k < j; k++) out.set(sorted[k].playerId, shared);
    i = j;
  }
  return out;
}

function compute(ctx: GameModeContext): IndividualResult {
  const basis = stringSetting(SETTINGS, ctx.settings, 'scoreBasis'); // 'net' | 'gross'
  const vector = parseVector(stringSetting(SETTINGS, ctx.settings, 'pointVector'));
  const moneyModelRaw = stringSetting(SETTINGS, ctx.settings, 'moneyModel');
  const moneyModel = moneyModelRaw === 'pot' ? 'pot' : moneyModelRaw === 'nassau' ? 'nassau' : 'per-point';
  const dollarsPerPoint = numberSetting(SETTINGS, ctx.settings, 'dollarsPerPoint');

  const standings: PlayerStanding[] = ctx.players.map((p) => ({
    playerId: p.id, playerName: p.name, points: 0, moneyNet: 0,
    perHole: ctx.holes.map(() => null as number | null), thru: 0, place: 0,
  }));
  const byId = new Map(standings.map((s) => [s.playerId, s]));
  let thruHole = 0;

  ctx.holes.forEach((hole, hIdx) => {
    // Only players who posted a score on this hole share the points.
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
  let nassauLegs: NassauLegLine[] | undefined;
  if (moneyModel === 'nassau') {
    nassauLegs = settleNassauFromSettings(SETTINGS, ctx.settings, standings, true);
  } else if (moneyModel === 'pot') {
    settlePot(standings, ctx.pot, ctx.pot / Math.max(1, ctx.players.length));
  } else {
    settlePerPoint(standings, dollarsPerPoint);
  }

  const resultMoneyModel: 'per-point' | 'pot' = moneyModel === 'per-point' ? 'per-point' : 'pot';
  // Birdie/eagle bonuses, on top of this game's own money model.
  const junkLines = settleJunkFromSettings(SETTINGS, ctx.settings, ctx, standings);

  return {
    kind: 'individual', gameModeId: 'nines', metricLabel: 'pts',
    standings, pot: moneyModel === 'pot' ? ctx.pot : 0, thruHole,
    moneyModel: resultMoneyModel,
    nassauLegs, junkLines: junkLines ?? undefined,
  };
}

export const nines: GameModeDescriptor = {
  id: 'nines',
  name: 'Nines / Split Sixes',
  description: 'Split a pool of points each hole by score — best takes the most, ties split evenly. Default 5-3-1 (Nines); set 4-2-0 for Split Sixes.',
  category: 'individual',
  inputType: 'gross',
  playersMin: 3,
  playersMax: 4,
  settings: SETTINGS,
  compute,
};
