import type { FormatSetting } from '../formats';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding } from './types';
import { rankByPointsDesc, settlePerPoint } from './types';
import { numberSetting, stringSetting } from './settings';

// Quota (a.k.a. Points / Chicago). Each player has a target "quota" of points to
// earn; they score Stableford-style points vs par (net or gross) and settle on
// how far they beat or miss their quota. Default quota basis = 36 − course
// handicap (so a scratch needs 36, an 18 needs 18). Self-contained points scale
// so the module doesn't couple to the tournament Stableford tables.
const SCALE = { albatrossOrBetter: 5, eagle: 4, birdie: 3, par: 2, bogey: 1, doubleOrWorse: 0 };

function stablefordPoints(net: number, par: number): number {
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
    key: 'scoreBasis', label: 'Score basis', type: 'select',
    options: [{ value: 'net', label: 'Net' }, { value: 'gross', label: 'Gross' }],
    defaultValue: 'net',
    hint: 'Net applies handicap strokes before points; gross does not.',
  },
  {
    key: 'quotaBasis', label: 'Quota', type: 'select',
    options: [
      { value: 'par2minus', label: '36 − course handicap' },
      { value: 'chicago', label: 'Chicago (39 − course handicap)' },
      { value: 'fixed', label: 'Same fixed quota for all' },
    ],
    defaultValue: 'par2minus',
    hint: '36 − handicap is the classic quota (par = 2 pts). Chicago starts from 39. Or set one fixed target.',
  },
  { key: 'fixedQuota', label: 'Fixed quota (if used)', type: 'number', defaultValue: 36 },
  {
    key: 'dollarsPerPoint', label: '$ per point', type: 'number', defaultValue: 1,
    hint: 'Each player settles (points beaten vs quota − group avg) × this. Zero-sum.',
  },
];

function compute(ctx: GameModeContext): IndividualResult {
  const basis = stringSetting(SETTINGS, ctx.settings, 'scoreBasis');
  const quotaBasis = stringSetting(SETTINGS, ctx.settings, 'quotaBasis');
  const fixedQuota = numberSetting(SETTINGS, ctx.settings, 'fixedQuota');
  const dollarsPerPoint = numberSetting(SETTINGS, ctx.settings, 'dollarsPerPoint');

  const quotaFor = (playerId: string): number =>
    quotaBasis === 'fixed' ? fixedQuota
    : quotaBasis === 'chicago' ? Math.max(0, 39 - ctx.playingHcap(playerId))
    : Math.max(0, 36 - ctx.playingHcap(playerId));

  const standings: PlayerStanding[] = ctx.players.map((p) => ({
    playerId: p.id, playerName: p.name, points: 0, moneyNet: 0,
    perHole: ctx.holes.map(() => null as number | null), thru: 0, place: 0,
  }));
  const byId = new Map(standings.map((s) => [s.playerId, s]));
  let thruHole = 0;

  // Accumulate raw Stableford points earned per player.
  const earned = new Map<string, number>(ctx.players.map((p) => [p.id, 0]));
  ctx.holes.forEach((hole, hIdx) => {
    for (const p of ctx.players) {
      const v = basis === 'gross' ? ctx.grossOnHole(p.id, hole) : ctx.netOnHole(p.id, hole);
      if (v === null) continue;
      thruHole = hole.number;
      const pts = stablefordPoints(v, hole.par);
      earned.set(p.id, (earned.get(p.id) ?? 0) + pts);
      const s = byId.get(p.id)!;
      s.perHole[hIdx] = pts;
      s.thru += 1;
    }
  });

  // `points` here is the game metric = points relative to quota (beat quota = +).
  for (const s of standings) {
    if (s.thru === 0) continue;
    s.points = (earned.get(s.playerId) ?? 0) - quotaFor(s.playerId);
  }

  rankByPointsDesc(standings);
  settlePerPoint(standings, dollarsPerPoint);

  return {
    kind: 'individual', gameModeId: 'quota', metricLabel: 'vs quota',
    standings, pot: 0, thruHole, moneyModel: 'per-point',
  };
}

export const quota: GameModeDescriptor = {
  id: 'quota',
  name: 'Quota (Points)',
  description: 'Beat your points quota. Earn Stableford points vs par; settle on how far you beat it.',
  category: 'individual',
  inputType: 'gross',
  playersMin: 2,
  playersMax: 4,
  settings: SETTINGS,
  compute,
};
