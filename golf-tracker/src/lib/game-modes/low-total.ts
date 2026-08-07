import type { FormatSetting } from '../formats';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding, NassauLegLine } from './types';
import { numberSetting, stringSetting, NASSAU_SETTINGS, settleNassauFromSettings, JUNK_SETTINGS, settleJunkFromSettings } from './settings';

// Low total pool. Lowest NET (or gross) total over the round wins. Unlike the
// points games, LOWER is better — so ranking and money are handled directly here
// rather than via the shared higher-is-better helpers. `points` carries the
// stroke total (metricLabel 'net'/'gross' tells the leaderboard not to +-prefix).
const SETTINGS: FormatSetting[] = [
  {
    key: 'scoreBasis', label: 'Score basis', type: 'select',
    options: [{ value: 'net', label: 'Net' }, { value: 'gross', label: 'Gross' }],
    defaultValue: 'net',
  },
  {
    key: 'moneyModel', label: 'Money', type: 'select',
    options: [
      { value: 'per-stroke', label: '$ per stroke vs field' },
      { value: 'pot', label: 'Buy-in pot (low total wins)' },
      { value: 'nassau', label: 'Nassau pot (low front/back/total)' },
    ],
    defaultValue: 'pot',
  },
  { key: 'dollarsPerStroke', label: '$ per stroke', type: 'number', defaultValue: 1, hint: 'Settle (field avg − your total) × this. Zero-sum.', showIf: { key: 'moneyModel', in: ['per-stroke'] } },
  { key: 'entryPerPlayer', label: 'Buy-in ($ / player)', type: 'number', defaultValue: 20, hint: 'Lowest total wins the pot; ties split.', showIf: { key: 'moneyModel', in: ['pot'] } },
  ...NASSAU_SETTINGS,
  ...JUNK_SETTINGS,
];

function compute(ctx: GameModeContext): IndividualResult {
  const basis = stringSetting(SETTINGS, ctx.settings, 'scoreBasis');
  const moneyModel = stringSetting(SETTINGS, ctx.settings, 'moneyModel');
  const dollarsPerStroke = numberSetting(SETTINGS, ctx.settings, 'dollarsPerStroke');
  const entry = numberSetting(SETTINGS, ctx.settings, 'entryPerPlayer');

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
      const s = byId.get(p.id)!;
      s.points += v;          // running stroke total (lower is better)
      s.perHole[hIdx] = v;
      s.thru += 1;
    }
  });

  // Rank LOWER-is-better; unscored sink to the bottom. Ties share a place.
  standings.sort((a, b) => {
    if (a.thru === 0 && b.thru === 0) return 0;
    if (a.thru === 0) return 1;
    if (b.thru === 0) return -1;
    return a.points - b.points;
  });
  let place = 1;
  for (let i = 0; i < standings.length; i++) {
    const s = standings[i];
    if (s.thru === 0) { s.place = 0; continue; }
    if (i > 0 && standings[i - 1].thru > 0 && standings[i - 1].points !== s.points) place = i + 1;
    s.place = place;
  }

  const played = standings.filter((s) => s.thru > 0);
  let nassauLegs: NassauLegLine[] | undefined;
  if (moneyModel === 'nassau') {
    // Lowest total on the front / back / total takes each pot (ties split).
    nassauLegs = settleNassauFromSettings(SETTINGS, ctx.settings, standings, false);
  } else if (moneyModel === 'pot') {
    const pot = played.length * entry;
    for (const s of standings) s.moneyNet = s.thru > 0 ? -entry : 0;
    if (pot > 0 && played.length > 0) {
      const winners = played.filter((s) => s.place === 1);
      const share = pot / winners.length;
      for (const w of winners) w.moneyNet += share;
    }
  } else {
    // per-stroke, zero-sum: lower total collects (fieldAvg − myTotal) × $/stroke.
    if (played.length > 0) {
      const avg = played.reduce((sum, s) => sum + s.points, 0) / played.length;
      for (const s of standings) s.moneyNet = s.thru > 0 ? (avg - s.points) * dollarsPerStroke : 0;
    }
  }

  // Birdie/eagle bonuses, on top of this game's own money model.
  const junkLines = settleJunkFromSettings(SETTINGS, ctx.settings, ctx, standings);

  return {
    kind: 'individual', gameModeId: 'low-total', metricLabel: basis === 'gross' ? 'gross' : 'net',
    standings, pot: moneyModel === 'pot' ? played.length * entry : 0, thruHole, moneyModel: 'per-point',
    nassauLegs, junkLines: junkLines ?? undefined,
  };
}

export const lowTotal: GameModeDescriptor = {
  id: 'low-total',
  name: 'Low Total (net or gross)',
  description: 'Lowest total over the round wins — net or gross, buy-in pot or per stroke.',
  category: 'individual',
  inputType: 'gross',
  playersMin: 2,
  playersMax: 4,
  settings: SETTINGS,
  compute,
};
