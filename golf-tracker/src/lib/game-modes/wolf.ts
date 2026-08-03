import type { FormatSetting } from '../formats';
import type { HoleData } from '../pool-game';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding } from './types';
import { rankByPointsDesc, settlePerPoint } from './types';
import { numberSetting, stringSetting } from './settings';

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
  { key: 'dollarsPerPoint', label: '$ per point', type: 'number', defaultValue: 1, hint: 'Settle (points − group avg) × this. Zero-sum.' },
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

  const order = ctx.players.map((p) => p.id); // rotation order = player (tee) order
  const decisions = ctx.wolfDecisions ?? {};

  const standings: PlayerStanding[] = ctx.players.map((p) => ({
    playerId: p.id, playerName: p.name, points: 0, moneyNet: 0,
    perHole: ctx.holes.map(() => null as number | null), thru: 0, place: 0,
  }));
  const byId = new Map(standings.map((s) => [s.playerId, s]));
  let thruHole = 0;

  ctx.holes.forEach((hole, hIdx) => {
    // The rotating Wolf for this hole (unless a decision overrode who it is).
    const decided = decisions[hole.number];
    const wolfId = decided?.wolfId ?? order[(hole.number - 1) % order.length];
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
    if (wolfBest < fieldBest) winners = wolfSide;
    else if (fieldBest < wolfBest) winners = fieldSide;

    // Award: each winner gets the pot; in a lone/blind loss the whole field wins.
    for (const id of winners) {
      const s = byId.get(id);
      if (!s) continue;
      s.points += pot;
      s.perHole[hIdx] = (s.perHole[hIdx] ?? 0) + pot;
    }
  });

  // thru = holes each player has a gross for.
  for (const p of ctx.players) {
    const s = byId.get(p.id)!;
    s.thru = ctx.holes.filter((h) => ctx.grossOnHole(p.id, h) !== null).length;
  }

  rankByPointsDesc(standings);
  settlePerPoint(standings, dollarsPerPoint);

  return {
    kind: 'individual', gameModeId: 'wolf', metricLabel: 'pts',
    standings, pot: 0, thruHole, moneyModel: 'per-point',
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
