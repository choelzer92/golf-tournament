import type { FormatSetting } from '../formats';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding } from './types';
import { rankByPointsDesc } from './types';
import type { NassauLegLine } from './types';
import { numberSetting, stringSetting, boolSetting, NASSAU_SETTINGS, settleNassauFromSettings, JUNK_SETTINGS, settleJunkFromSettings } from './settings';

// Skins. Each hole is a skin; the outright low score wins it. A tie carries the
// skin (and any carried skins) to the next hole when carryover is on; with
// carryover off a tied hole is simply dead. Metric = skins won. Money: each skin
// is worth `skinValue`, paid by every other player who didn't win it (zero-sum).
const SETTINGS: FormatSetting[] = [
  {
    key: 'scoreBasis', label: 'Score basis', type: 'select',
    options: [{ value: 'net', label: 'Net' }, { value: 'gross', label: 'Gross' }],
    defaultValue: 'net',
  },
  { key: 'carryover', label: 'Carry ties to next hole', type: 'toggle', defaultValue: true },
  {
    key: 'moneyModel', label: 'Money', type: 'select',
    options: [
      { value: 'per-skin', label: '$ per skin (zero-sum)' },
      { value: 'nassau', label: 'Nassau pot (most skins front/back/total)' },
    ],
    defaultValue: 'per-skin',
  },
  {
    key: 'skinValue', label: '$ per skin', type: 'number', defaultValue: 5,
    hint: 'Each skin won is paid by every other player. Zero-sum across the group.',
    showIf: { key: 'moneyModel', in: ['per-skin'] },
  },
  ...NASSAU_SETTINGS,
  ...JUNK_SETTINGS,
];

function compute(ctx: GameModeContext): IndividualResult {
  const basis = stringSetting(SETTINGS, ctx.settings, 'scoreBasis');
  const carryover = boolSetting(SETTINGS, ctx.settings, 'carryover');
  const skinValue = numberSetting(SETTINGS, ctx.settings, 'skinValue');
  const moneyModel = stringSetting(SETTINGS, ctx.settings, 'moneyModel') === 'nassau' ? 'nassau' : 'per-skin';

  const standings: PlayerStanding[] = ctx.players.map((p) => ({
    playerId: p.id, playerName: p.name, points: 0, moneyNet: 0,
    perHole: ctx.holes.map(() => null as number | null), thru: 0, place: 0,
  }));
  const byId = new Map(standings.map((s) => [s.playerId, s]));
  let thruHole = 0;
  let carried = 0; // skins pending from prior tied holes

  ctx.holes.forEach((hole, hIdx) => {
    const scored: { playerId: string; value: number }[] = [];
    for (const p of ctx.players) {
      const v = basis === 'gross' ? ctx.grossOnHole(p.id, hole) : ctx.netOnHole(p.id, hole);
      if (v !== null) scored.push({ playerId: p.id, value: v });
    }
    // Track thru + hole participation for every player who posted a score.
    for (const { playerId } of scored) {
      const s = byId.get(playerId)!;
      s.thru += 1;
      s.perHole[hIdx] = 0; // played, no skin (may be overwritten below)
    }
    if (scored.length === 0) return;
    thruHole = hole.number;

    const low = Math.min(...scored.map((s) => s.value));
    const winners = scored.filter((s) => s.value === low);
    const skinsThisHole = 1 + carried;
    if (winners.length === 1) {
      const w = byId.get(winners[0].playerId)!;
      w.points += skinsThisHole;
      w.perHole[hIdx] = skinsThisHole;
      carried = 0;
    } else {
      // Tie: carry (if enabled) or dead.
      carried = carryover ? skinsThisHole : 0;
    }
  });

  rankByPointsDesc(standings);

  let nassauLegs: NassauLegLine[] | undefined;
  if (moneyModel === 'nassau') {
    // Nassau: most skins on the front / back / total takes each pot (ties split).
    nassauLegs = settleNassauFromSettings(SETTINGS, ctx.settings, standings, true);
  } else {
    // Per-skin: a skin is worth skinValue from EACH other player. Net for a player
    // = skinValue × (skinsWon × (N−1) − skinsWonByOthers). Zero-sum form:
    const played = standings.filter((s) => s.thru > 0);
    const n = played.length;
    const totalSkins = standings.reduce((sum, s) => sum + s.points, 0);
    for (const s of standings) {
      if (s.thru === 0) { s.moneyNet = 0; continue; }
      s.moneyNet = skinValue * (s.points * (n - 1) - (totalSkins - s.points));
    }
  }

  // Birdie/eagle bonuses, on top of this game's own money model.
  const junkLines = settleJunkFromSettings(SETTINGS, ctx.settings, ctx, standings);

  return {
    kind: 'individual', gameModeId: 'skins', metricLabel: 'skins',
    standings, pot: 0, thruHole,
    moneyModel: moneyModel === 'nassau' ? 'pot' : 'per-point',
    nassauLegs, junkLines: junkLines ?? undefined,
  };
}

export const skins: GameModeDescriptor = {
  id: 'skins',
  name: 'Skins',
  description: 'Win a hole outright to win the skin. Ties carry to the next hole.',
  category: 'individual',
  inputType: 'gross',
  playersMin: 2,
  playersMax: 4,
  settings: SETTINGS,
  compute,
};
