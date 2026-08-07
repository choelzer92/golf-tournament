import type { FormatSetting } from '../formats';
import type { HoleData } from '../pool-game';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding, WolfHoleLine } from './types';
import { rankByPointsDesc, settlePerPoint } from './types';
import type { NassauLegLine } from './types';
import { numberSetting, stringSetting, NASSAU_SETTINGS, settleNassauFromSettings, JUNK_SETTINGS, settleJunkFromSettings } from './settings';

// Wolf. Each hole one player is the "Wolf" (rotating by tee order). The Wolf
// either takes a PARTNER (2v2, best net of the pair vs best net of the other
// two), goes LONE (1v3), or BLIND (declared lone before tees — higher stakes).
// The winning side earns points per player; lone/blind multiply. If a lone/blind
// Wolf LOSES, the field takes the (multiplied) points. Decisions come from
// ctx.wolfDecisions (set on the scoring page); with no decision recorded, the
// hole defaults to the rotating Wolf going lone once everyone has a score.
//
// This is a DECISION-INPUT game: inputType 'gross+decisions'.

const SETTINGS: FormatSetting[] = [
  {
    key: 'scoreBasis', label: 'Score basis', type: 'select',
    options: [{ value: 'net', label: 'Net' }, { value: 'gross', label: 'Gross' }],
    defaultValue: 'net',
    hint: 'Best-ball comparison uses net (handicap) or gross.',
  },
  { key: 'basePoints', label: 'Base points / hole', type: 'number', defaultValue: 1, hint: 'Points the winning side earns per hole (per player).' },
  { key: 'loneMultiplier', label: 'Lone Wolf ×', type: 'number', defaultValue: 2, hint: 'Multiplier when the Wolf goes it alone (1 vs 3).' },
  { key: 'blindMultiplier', label: 'Blind Wolf ×', type: 'number', defaultValue: 3, hint: 'Multiplier for a blind Wolf (declared before tee shots).' },
  {
    key: 'moneyModel', label: 'Money', type: 'select',
    options: [
      { value: 'per-point', label: '$ per point (zero-sum)' },
      { value: 'nassau', label: 'Nassau pot (buy-in, split by segment)' },
    ],
    defaultValue: 'per-point',
  },
  { key: 'dollarsPerPoint', label: '$ per point', type: 'number', defaultValue: 1, hint: 'Settle (points − group avg) × this. Zero-sum.', showIf: { key: 'moneyModel', in: ['per-point'] } },
  ...NASSAU_SETTINGS,
  ...JUNK_SETTINGS,
];

// Best score (lower = better) among a set of players on a hole; null if none scored.
function bestOf(ctx: GameModeContext, ids: string[], hole: HoleData, basis: string): number | null {
  const vals: number[] = [];
  for (const id of ids) {
    const v = basis === 'gross' ? ctx.grossOnHole(id, hole) : ctx.netOnHole(id, hole);
    if (v !== null) vals.push(v);
  }
  return vals.length ? Math.min(...vals) : null;
}

function compute(ctx: GameModeContext): IndividualResult {
  const basis = stringSetting(SETTINGS, ctx.settings, 'scoreBasis');
  const basePoints = numberSetting(SETTINGS, ctx.settings, 'basePoints');
  const loneMult = numberSetting(SETTINGS, ctx.settings, 'loneMultiplier');
  const blindMult = numberSetting(SETTINGS, ctx.settings, 'blindMultiplier');
  const dollarsPerPoint = numberSetting(SETTINGS, ctx.settings, 'dollarsPerPoint');
  const moneyModel = stringSetting(SETTINGS, ctx.settings, 'moneyModel') === 'nassau' ? 'nassau' : 'per-point';

  const order = ctx.players.map((p) => p.id); // the full field (for sides + all-scored check)
  // Rotation order = the Wolf draw result if set, else the field order. Only who's
  // the default Wolf each hole reads from this; sides + scoring use `order`.
  const rotationOrder = ctx.wolfOrder && ctx.wolfOrder.length > 0 ? ctx.wolfOrder : order;
  const decisions = ctx.wolfDecisions ?? {};
  const nameOf = (id: string): string => ctx.players.find((p) => p.id === id)?.name ?? id;

  const standings: PlayerStanding[] = ctx.players.map((p) => ({
    playerId: p.id, playerName: p.name, points: 0, moneyNet: 0,
    perHole: ctx.holes.map(() => null as number | null), thru: 0, place: 0,
  }));
  const byId = new Map(standings.map((s) => [s.playerId, s]));
  let thruHole = 0;
  const wolfHoles: WolfHoleLine[] = [];              // per-hole matchup breakdown
  const holesWon = new Map<string, number[]>();      // playerId -> hole numbers they won

  ctx.holes.forEach((hole, hIdx) => {
    // The rotating Wolf for this hole (unless a decision overrode who it is).
    const decided = decisions[hole.number];
    const wolfId = decided?.wolfId ?? rotationOrder[(hole.number - 1) % rotationOrder.length];
    const mode = decided?.mode ?? 'lone';
    const partnerId = mode === 'partner' ? decided?.partnerId ?? null : null;

    const wolfSide = partnerId ? [wolfId, partnerId] : [wolfId];
    const fieldSide = order.filter((id) => !wolfSide.includes(id));

    // Only score the hole once every player involved has a score.
    const wolfBest = bestOf(ctx, wolfSide, hole, basis);
    const fieldBest = bestOf(ctx, fieldSide, hole, basis);
    if (wolfBest === null || fieldBest === null) return;
    // Require all four to have posted (a fair Wolf hole needs the whole group).
    if (order.some((id) => (basis === 'gross' ? ctx.grossOnHole(id, hole) : ctx.netOnHole(id, hole)) === null)) return;
    thruHole = hole.number;

    const mult = mode === 'blind' ? blindMult : mode === 'lone' ? loneMult : 1;
    const pot = basePoints * mult;

    // Push = nobody scores.
    let winners: string[] = [];
    let outcome: 'wolf' | 'field' | 'push' = 'push';
    if (wolfBest < fieldBest) { winners = wolfSide; outcome = 'wolf'; }
    else if (fieldBest < wolfBest) { winners = fieldSide; outcome = 'field'; }

    // Award: each winner gets the pot; in a lone/blind loss the whole field wins.
    for (const id of winners) {
      const s = byId.get(id);
      if (!s) continue;
      s.points += pot;
      s.perHole[hIdx] = (s.perHole[hIdx] ?? 0) + pot;
      holesWon.set(id, [...(holesWon.get(id) ?? []), hole.number]);
    }

    wolfHoles.push({
      holeNumber: hole.number,
      wolfName: nameOf(wolfId),
      mode,
      partnerName: partnerId ? nameOf(partnerId) : null,
      multiplier: mult,
      wolfSideNames: wolfSide.map(nameOf),
      fieldSideNames: fieldSide.map(nameOf),
      wolfNet: wolfBest,
      fieldNet: fieldBest,
      outcome,
      pointsEach: outcome === 'push' ? 0 : pot,
      winnerNames: winners.map(nameOf),
    });
  });

  // thru = holes each player has a gross for; holesWon = holes they earned on.
  for (const p of ctx.players) {
    const s = byId.get(p.id)!;
    s.thru = ctx.holes.filter((h) => ctx.grossOnHole(p.id, h) !== null).length;
    s.holesWon = holesWon.get(p.id) ?? [];
  }

  rankByPointsDesc(standings);
  let nassauLegs: NassauLegLine[] | undefined;
  if (moneyModel === 'nassau') {
    nassauLegs = settleNassauFromSettings(SETTINGS, ctx.settings, standings, true);
  } else {
    settlePerPoint(standings, dollarsPerPoint);
  }

  // Birdie/eagle bonuses, on top of this game's own money model.
  const junkLines = settleJunkFromSettings(SETTINGS, ctx.settings, ctx, standings);

  return {
    kind: 'individual', gameModeId: 'wolf', metricLabel: 'pts',
    standings, pot: 0, thruHole,
    moneyModel: moneyModel === 'nassau' ? 'pot' : 'per-point',
    wolfHoles, nassauLegs, junkLines: junkLines ?? undefined,
  };
}

export const wolf: GameModeDescriptor = {
  id: 'wolf',
  name: 'Wolf',
  description: 'Rotating Wolf each hole picks a partner, goes lone, or blind. Win the hole, win the points.',
  category: 'individual',
  inputType: 'gross+decisions',
  playersMin: 4,
  playersMax: 4,
  settings: SETTINGS,
  compute,
};

// The rotating Wolf for a hole (by tee/player order), used by the scoring-page
// decision panel to preselect who the Wolf is.
export function wolfForHole(playerIds: string[], holeNumber: number): string | undefined {
  if (playerIds.length === 0) return undefined;
  return playerIds[(holeNumber - 1) % playerIds.length];
}
