import type { FormatSetting } from '../formats';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding } from './types';
import { rankByPointsDesc, settlePerPoint } from './types';
import type { NassauLegLine } from './types';
import { numberSetting, stringSetting, parseVector, NASSAU_SETTINGS, settleNassauFromSettings } from './settings';

// Stableford (individual). Points per hole vs par off the net (or gross) score.
// Highest total wins. The scale is selectable: Standard (5/4/3/2/1/0 for
// albatross+/eagle/birdie/par/bogey/double+) or a custom vector. Self-contained
// scales (like quota.ts) so this doesn't couple to the tournament tables.
const STANDARD = { albatrossOrBetter: 5, eagle: 4, birdie: 3, par: 2, bogey: 1, doubleOrWorse: 0 };
const MODIFIED = { albatrossOrBetter: 8, eagle: 5, birdie: 2, par: 0, bogey: -1, doubleOrWorse: -3 };

function ptsFrom(scale: { albatrossOrBetter: number; eagle: number; birdie: number; par: number; bogey: number; doubleOrWorse: number }, net: number, par: number): number {
  const diff = net - par;
  if (diff <= -3) return scale.albatrossOrBetter;
  if (diff === -2) return scale.eagle;
  if (diff === -1) return scale.birdie;
  if (diff === 0) return scale.par;
  if (diff === 1) return scale.bogey;
  return scale.doubleOrWorse;
}

const SETTINGS: FormatSetting[] = [
  {
    key: 'scoreBasis', label: 'Score basis', type: 'select',
    options: [{ value: 'net', label: 'Net' }, { value: 'gross', label: 'Gross' }],
    defaultValue: 'net',
  },
  {
    key: 'scale', label: 'Points scale', type: 'select',
    options: [
      { value: 'standard', label: 'Standard (5/4/3/2/1/0)' },
      { value: 'modified', label: 'Modified (8/5/2/0/-1/-3)' },
      { value: 'custom', label: 'Custom' },
    ],
    defaultValue: 'standard',
    hint: 'Points for albatross+/eagle/birdie/par/bogey/double+.',
  },
  {
    key: 'customScale', label: 'Custom scale', type: 'text', defaultValue: '5,4,3,2,1,0',
    hint: 'Used when scale = Custom. Six values: albatross+, eagle, birdie, par, bogey, double+.',
  },
  {
    key: 'moneyModel', label: 'Money', type: 'select',
    options: [
      { value: 'per-point', label: '$ per point (zero-sum)' },
      { value: 'nassau', label: 'Nassau pot (buy-in, split by segment)' },
    ],
    defaultValue: 'per-point',
  },
  { key: 'dollarsPerPoint', label: '$ per point', type: 'number', defaultValue: 1, hint: 'Used when money = $ per point. Settle (points − group avg) × this. Zero-sum.' },
  ...NASSAU_SETTINGS,
];

function compute(ctx: GameModeContext): IndividualResult {
  const basis = stringSetting(SETTINGS, ctx.settings, 'scoreBasis');
  const scaleKey = stringSetting(SETTINGS, ctx.settings, 'scale');
  const dollarsPerPoint = numberSetting(SETTINGS, ctx.settings, 'dollarsPerPoint');
  const moneyModel = stringSetting(SETTINGS, ctx.settings, 'moneyModel') === 'nassau' ? 'nassau' : 'per-point';

  let scale = STANDARD;
  if (scaleKey === 'modified') scale = MODIFIED;
  else if (scaleKey === 'custom') {
    const v = parseVector(stringSetting(SETTINGS, ctx.settings, 'customScale'));
    if (v.length >= 6) scale = { albatrossOrBetter: v[0], eagle: v[1], birdie: v[2], par: v[3], bogey: v[4], doubleOrWorse: v[5] };
  }

  const standings: PlayerStanding[] = ctx.players.map((p) => ({
    playerId: p.id, playerName: p.name, points: 0, moneyNet: 0,
    perHole: ctx.holes.map(() => null as number | null), thru: 0, place: 0,
  }));
  const byId = new Map(standings.map((s) => [s.playerId, s]));
  let thruHole = 0;

  ctx.holes.forEach((hole, hIdx) => {
    for (const p of ctx.players) {
      const v = basis === 'gross' ? ctx.grossOnHole(p.id, hole) : ctx.netOnHole(p.id, hole);
      if (v === null) continue;
      thruHole = hole.number;
      const pts = ptsFrom(scale, v, hole.par);
      const s = byId.get(p.id)!;
      s.points += pts;
      s.perHole[hIdx] = pts;
      s.thru += 1;
    }
  });

  rankByPointsDesc(standings);
  let nassauLegs: NassauLegLine[] | undefined;
  if (moneyModel === 'nassau') {
    nassauLegs = settleNassauFromSettings(SETTINGS, ctx.settings, standings, true);
  } else {
    settlePerPoint(standings, dollarsPerPoint);
  }

  return {
    kind: 'individual', gameModeId: 'stableford-ind', metricLabel: 'pts',
    standings, pot: 0, thruHole,
    moneyModel: moneyModel === 'nassau' ? 'pot' : 'per-point',
    nassauLegs,
  };
}

export const stablefordIndividual: GameModeDescriptor = {
  id: 'stableford-ind',
  name: 'Stableford',
  description: 'Points per hole vs par — birdie 3, par 2, bogey 1. Highest total wins.',
  category: 'individual',
  inputType: 'gross',
  playersMin: 2,
  playersMax: 4,
  settings: SETTINGS,
  compute,
};
