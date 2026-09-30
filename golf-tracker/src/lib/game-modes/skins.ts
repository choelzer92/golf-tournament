import type { FormatSetting } from '../formats';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding } from './types';
import { rankByPointsDesc } from './types';
import type { NassauLegLine } from './types';
import { numberSetting, stringSetting, boolSetting, NASSAU_SETTINGS, settleNassauFromSettings, JUNK_SETTINGS, settleJunkFromSettings } from './settings';

// Skins. Each hole is a skin; the outright low score wins it. A tie carries the
// skin (and any carried skins) to the next hole when carryover is on; with
// carryover off a tied hole is simply dead. Metric = skins won. Money: each skin
// is worth `skinValue`, paid by every other player who didn't win it (zero-sum), or
// a skins pot: everyone antes, the pot splits by skins won (§5.ca, the big-field game).
//
// Across tee groups (F-101 d, §5.ca) a hole is decided once EVERY group has posted it, so
// group 1 isn't handed skins a later group takes back. With carryover on, a hole after an
// open one is open too (its value isn't known yet). A closed game decides on what was posted.
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
      { value: 'pot', label: 'Skins pot (buy-in, split by skins won)' },
      { value: 'nassau', label: 'Nassau pot (most skins front/back/total)' },
    ],
    defaultValue: 'per-skin',
  },
  {
    key: 'skinValue', label: '$ per skin', type: 'number', defaultValue: 5,
    hint: 'Each skin won is paid by every other player. Zero-sum across the group.',
    showIf: { key: 'moneyModel', in: ['per-skin'] },
  },
  {
    key: 'entryPerPlayer', label: 'Buy-in ($ / player)', type: 'number', defaultValue: 20,
    hint: 'The pot splits by skins won. No skins won, everyone gets their buy-in back.',
    showIf: { key: 'moneyModel', in: ['pot'] },
  },
  ...NASSAU_SETTINGS,
  ...JUNK_SETTINGS,
];

function compute(ctx: GameModeContext): IndividualResult {
  const basis = stringSetting(SETTINGS, ctx.settings, 'scoreBasis');
  const carryover = boolSetting(SETTINGS, ctx.settings, 'carryover');
  const skinValue = numberSetting(SETTINGS, ctx.settings, 'skinValue');
  const model = stringSetting(SETTINGS, ctx.settings, 'moneyModel');
  const moneyModel = model === 'nassau' || model === 'pot' ? model : 'per-skin';

  const standings: PlayerStanding[] = ctx.players.map((p) => ({
    playerId: p.id, playerName: p.name, points: 0, moneyNet: 0,
    perHole: ctx.holes.map(() => null as number | null), thru: 0, place: 0,
  }));
  const byId = new Map(standings.map((s) => [s.playerId, s]));
  let thruHole = 0;
  let carried = 0; // skins pending from prior tied holes
  let open = false; // with carryover on, everything after an open hole is open too
  const openSkins: NonNullable<IndividualResult['openSkins']> = [];
  const groups = ctx.teeGroups ?? [ctx.players.map((p) => p.id)];

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
    const posted = new Set(scored.map((s) => s.playerId));
    const everyGroup = groups.every((g) => g.some((id) => posted.has(id)));
    if (!ctx.closed && (!everyGroup || (open && carryover))) {
      open = true;
      openSkins.push({
        hole: hole.number,
        leaders: winners.length === 1 ? [winners[0].playerId] : [],
        names: winners.length === 1 ? [byId.get(winners[0].playerId)!.playerName] : [],
      });
      return;
    }
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
  let pot = 0;
  if (moneyModel === 'nassau') {
    // Nassau: most skins on the front / back / total takes each pot (ties split).
    nassauLegs = settleNassauFromSettings(SETTINGS, ctx.settings, standings, true);
  } else if (moneyModel === 'pot') {
    // Skins pot: everyone who played antes; each skin won is an equal share of the pot. No skins
    // won (yet), nobody is out anything. Zero-sum: the shares add back up to the pot.
    const entry = numberSetting(SETTINGS, ctx.settings, 'entryPerPlayer');
    const played = standings.filter((s) => s.thru > 0);
    const totalSkins = standings.reduce((sum, s) => sum + s.points, 0);
    pot = played.length * entry;
    for (const s of standings) {
      s.moneyNet = s.thru > 0 && totalSkins > 0 ? pot * (s.points / totalSkins) - entry : 0;
    }
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
    standings, pot, thruHole,
    moneyModel: moneyModel === 'per-skin' ? 'per-point' : 'pot',
    nassauLegs, junkLines: junkLines ?? undefined,
    ...(openSkins.length > 0 ? { openSkins } : {}),
  };
}

export const skins: GameModeDescriptor = {
  id: 'skins',
  name: 'Skins',
  description: 'Win a hole outright to win the skin. Ties carry to the next hole.',
  category: 'individual',
  inputType: 'gross',
  playersMin: 2,
  playersMax: Number.POSITIVE_INFINITY, // F-101 d (§5.bw): a whole field across tee groups
  settings: SETTINGS,
  compute,
};
