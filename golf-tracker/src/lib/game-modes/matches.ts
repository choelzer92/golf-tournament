import type { FormatSetting } from '../formats';
import { distributePot, type PoolGame } from '../pool-game';
import type { GameModeContext, IndividualResult, MatchLine, PlayerStanding, PotSliceLine, TeamLegLine } from './types';
import { boolSetting, junkPayout, numberSetting, parseVector, settleJunkForSides, stringSetting, tallyJunkForSides } from './settings';
import { settleRoundRobin, settleWinnerTakes, sidesOfGame, type GameSide } from './sides';
import { ballsPerHole, evenValueOnHole, type TeamFormat } from './team-scoring';

// TEAM → MATCH → MONEY (F-037, DECISIONS.md §5.cn / §5.co).
//
// A TEAM is a set of players (one of the game's sides). With `matchSize` set, each team's players
// meet the other team's head to head in MATCHES of that size (1 v 1, 2 v 2, foursome v foursome).
// Each match is scored by the ordinary team engine on just its two units, so a match IS a 2v2
// (or singles) game, and its result rolls up into its team's total. Team totals settle the money.
//
// Who meets whom is READ FROM THE TEE SHEET (§5.co Q6: the app builds the tee groups from the
// matches, so a foursome holds one 2v2 or two singles). Nothing new is stored but the settings.
//
// `matchSize` absent or 0 is OFF, and the engine computes exactly as before (f037-pairings-golden).

// The match settings. Read with the shared setting readers; T3 adds them to the team engine's
// schema (with showIf) so the wizard and hub render them.
export const MATCH_SETTINGS: FormatSetting[] = [
  {
    key: 'matchSize', label: 'Head-to-head matches', type: 'select',
    options: [
      { value: '0', label: 'Off — every team against every team' },
      { value: '1', label: '1 v 1 — singles' },
      { value: '2', label: '2 v 2 — pairs' },
    ],
    defaultValue: '0',
    hint: 'Each match is played inside a foursome; the matches add up to the team total.',
  },
  {
    key: 'matchCounting', label: 'A match counts', type: 'select',
    options: [
      { value: 'points', label: 'Match points — 1 for a win, ½ for a halve' },
      { value: 'holes', label: 'Holes won' },
      { value: 'strokes', label: 'Net strokes (score to par)' },
    ],
    defaultValue: 'points',
    showIf: { key: 'matchSize', in: ['1', '2'] },
  },
  { key: 'matchNassau', label: 'Front / back / overall in each match', type: 'toggle', defaultValue: false, hint: 'Each match is three points instead of one: the front nine, the back nine and the 18.', showIf: { key: 'matchSize', in: ['1', '2'] } },
  { key: 'matchPtsFront', label: 'Front 9 (points)', type: 'number', defaultValue: 1, showIf: [{ key: 'matchSize', in: ['1', '2'] }, { key: 'matchNassau', in: ['true'] }] },
  { key: 'matchPtsBack', label: 'Back 9 (points)', type: 'number', defaultValue: 1, showIf: [{ key: 'matchSize', in: ['1', '2'] }, { key: 'matchNassau', in: ['true'] }] },
  { key: 'matchPtsOverall', label: 'Overall 18 (points)', type: 'number', defaultValue: 1, showIf: [{ key: 'matchSize', in: ['1', '2'] }, { key: 'matchNassau', in: ['true'] }] },
  {
    key: 'teamTiebreak', label: 'Teams tied on points', type: 'select',
    options: [
      { value: 'push', label: 'Push — tied teams split' },
      { value: 'holes', label: 'Most holes won' },
      { value: 'strokes', label: 'Best net strokes' },
    ],
    defaultValue: 'push',
    showIf: { key: 'matchSize', in: ['1', '2'] },
  },
];

export { matchSizeOf, pairMatches, matchesOf } from './match-pairing';
export type { Match, MatchUnit } from './match-pairing';
import { matchesOf, matchSizeOf, pairMatches } from './match-pairing';

/**
 * Why this game's teams and tee sheet can't be played as head-to-head matches, or null when they
 * can (or matches are off). Pure: the wizard, the hub's team and tee-group edits and a late
 * player's join call it BEFORE writing, so a game that can't be paired is never saved.
 */
export function matchShapeProblem(game: PoolGame): string | null {
  return matchSheetProblem(sidesOfGame(game), game.teams.map((t) => t.playerIds), matchSizeOf(game.modeSettings ?? {}));
}

/** The same check on raw teams + tee groups, for a game not yet built (the wizard). */
export function matchSheetProblem(teams: { id: string; playerIds: string[] }[], teeGroups: string[][], size: number): string | null {
  if (size === 0) return null;
  if (teams.length < 2) return 'Head-to-head matches need two or more teams.';
  const r = pairMatches(teams, teeGroups, size);
  return 'problem' in r ? r.problem : null;
}

type LegKey = 'front' | 'back' | 'overall';

/**
 * The game as matches rolled up to teams, or null when matches are off or can't be built (the
 * caller then computes the game as it always has). `compute` is the team engine itself, called
 * once per match on that match's two units with money and junk switched off.
 */
export function computeMatchGame(
  ctx: GameModeContext,
  deps: {
    schema: FormatSetting[];
    compute: (ctx: GameModeContext) => IndividualResult;
    teamName: (side: GameSide) => string;
  },
): IndividualResult | null {
  const bag = ctx.settings;
  const teams = ctx.sides ?? [];
  const matches = matchesOf(teams, ctx.teeGroups ?? [ctx.players.map((p) => p.id)], matchSizeOf(bag));
  if (!matches || teams.length < 2) return null;

  const s = (key: string) => stringSetting(deps.schema, bag, key);
  const n = (key: string) => numberSetting(deps.schema, bag, key);
  const scoring = s('scoring');
  const format = s('format') as TeamFormat;
  const moneyModel = s('moneyModel');
  // Anything but the three margin models settles as a pot (the default with matches on).
  const isPot = moneyModel !== 'per-point' && moneyModel !== 'per-hole' && moneyModel !== 'legs';
  const counting = stringSetting(MATCH_SETTINGS, bag, 'matchCounting');
  const tiebreak = stringSetting(MATCH_SETTINGS, bag, 'teamTiebreak');
  const nassau = boolSetting(MATCH_SETTINGS, bag, 'matchNassau');
  const legWeight: Record<LegKey, number> = nassau
    ? { front: numberSetting(MATCH_SETTINGS, bag, 'matchPtsFront'), back: numberSetting(MATCH_SETTINGS, bag, 'matchPtsBack'), overall: numberSetting(MATCH_SETTINGS, bag, 'matchPtsOverall') }
    : { front: 0, back: 0, overall: 1 };
  const strokesHigher = scoring === 'stableford';
  const holeBetter = (x: number, y: number) => (strokesHigher ? x > y : x < y);

  const tIdx = new Map(teams.map((t, i) => [t.id, i]));
  const zeros = () => teams.map(() => 0);
  const holesWon = zeros();
  const toPar = zeros();
  const total = zeros();
  const thru = zeros();
  const legPts: Record<LegKey, number[]> = { front: zeros(), back: zeros(), overall: zeros() };
  const legStarted: Record<LegKey, boolean[]> = { front: teams.map(() => false), back: teams.map(() => false), overall: teams.map(() => false) };
  const perHoleMoney = zeros();
  let nineOnly: 'front' | 'back' | null = null;
  let thruHole = 0;
  const lines: MatchLine[] = [];

  for (const m of matches) {
    const ids = new Set(m.units.flatMap((u) => u.playerIds));
    const sub: GameModeContext = {
      ...ctx,
      players: ctx.players.filter((p) => ids.has(p.id)),
      scores: ctx.scores.filter((x) => ids.has(x.playerId)),
      sides: m.units.map((u) => ({ id: u.teamId, playerIds: u.playerIds })),
      subTeams: { a: m.units[0].playerIds, b: m.units[1].playerIds },
      // Money off — except $ per hole, which the engine settles INSIDE the match, carry-ties
      // included (a halved hole carries only within the match it was halved in).
      settings: moneyModel === 'per-hole'
        ? { ...bag, matchSize: 0, junkEnabled: false }
        : { ...bag, matchSize: 0, moneyModel: 'per-point', dollarsPerPoint: 0, junkEnabled: false },
      teeGroups: undefined,
      pot: 0,
    };
    const r = deps.compute(sub);
    thruHole = Math.max(thruHole, r.thruHole);
    const legs = r.teamLegs ?? [];
    if (legs.length === 1) nineOnly = legs[0].key === 'back' ? 'back' : 'front';
    const ui = m.units.map((u) => tIdx.get(u.teamId)!);
    const unitThru = m.units.map((u) => r.standings.find((x) => x.playerId === u.teamId.toUpperCase())?.thru ?? 0);
    unitThru.forEach((t, k) => { thru[ui[k]] = Math.max(thru[ui[k]], t); });

    // Holes won and score to par, on CONTESTED holes only (both units posted) — the same gate the
    // engine's legs use, so a unit that has played more holes gains nothing.
    const vals = m.units.map((u) => r.sideBreakdown?.find((b) => b.id === u.teamId)?.values ?? []);
    const won = [0, 0];
    const par = [0, 0];
    ctx.holes.forEach((hole, h) => {
      const va = vals[0][h];
      const vb = vals[1][h];
      if (va == null || vb == null) return;
      if (holeBetter(va, vb)) won[0] += 1;
      else if (holeBetter(vb, va)) won[1] += 1;
      m.units.forEach((u, k) => {
        par[k] += (k === 0 ? va : vb) - evenValueOnHole(hole, scoring === 'stableford' ? 'stableford' : 'stroke', ballsPerHole(format, u.playerIds.length));
      });
    });

    // Match points: each scored leg pays its weight to its winner, half each on a halve. Without
    // Nassau only the 18 counts (one point a match); on a 9-hole game the single leg is the match.
    const got = [0, 0];
    const legsGot: Record<LegKey, [number, number]> = { front: [0, 0], back: [0, 0], overall: [0, 0] };
    for (const leg of legs) {
      const key: LegKey = legs.length === 1 ? 'overall' : leg.key;
      if (leg.thru === 0 || leg.voided) continue;
      const share = m.units.map((u) => (leg.leaders.includes(u.teamId) ? 1 / leg.leaders.length : 0));
      share.forEach((v, k) => {
        got[k] += v * legWeight[key];
        legsGot[key][k] = v;
      });
      const teamKey: LegKey = legs.length === 1 ? 'overall' : leg.key;
      ui.forEach((t, k) => { legPts[teamKey][t] += share[k]; legStarted[teamKey][t] = true; });
    }

    const counted = counting === 'holes' ? won : counting === 'strokes' ? par : got;
    ui.forEach((t, k) => {
      total[t] += counted[k];
      holesWon[t] += won[k];
      toPar[t] += par[k];
    });
    if (moneyModel === 'per-hole') {
      m.units.forEach((u, k) => { perHoleMoney[ui[k]] += r.standings.find((x) => x.playerId === u.teamId.toUpperCase())?.moneyNet ?? 0; });
    }

    const overall = legs.length === 1 ? legs[0] : legs.find((l) => l.key === 'overall');
    lines.push({
      id: m.id,
      units: m.units.map((u, k) => {
        const b = r.sideBreakdown?.find((x) => x.id === u.teamId);
        return {
          teamId: u.teamId,
          name: r.sideLabels?.find((x) => x.id === u.teamId)?.name ?? u.teamId,
          playerIds: u.playerIds,
          thru: unitThru[k],
          values: b?.values ?? ctx.holes.map(() => null),
          total: b?.total ?? 0,
          place: b?.place ?? 0,
          status: b?.status ?? '–',
        };
      }),
      legs,
      winner: overall && overall.thru > 0 && !overall.voided ? overall.winner : null,
      points: Object.fromEntries(m.units.map((u, k) => [u.teamId, counted[k]])),
      holesWon: Object.fromEntries(m.units.map((u, k) => [u.teamId, won[k]])),
    });
  }

  // TEAM STANDINGS. Higher total is better, except net strokes under stroke scoring.
  const higher = counting === 'strokes' ? strokesHigher : true;
  const better = (x: number, y: number) => (higher ? x > y : x < y);
  const tieValue = (t: number): number | null =>
    tiebreak === 'holes' ? holesWon[t] : tiebreak === 'strokes' ? (strokesHigher ? toPar[t] : -toPar[t]) : null;
  // −1: team i ahead of j; 1: behind; 0: level after the tiebreak (or push).
  const cmp = (i: number, j: number): number => {
    if (better(total[i], total[j])) return -1;
    if (better(total[j], total[i])) return 1;
    const ti = tieValue(i);
    const tj = tieValue(j);
    if (ti === null || tj === null || ti === tj) return 0;
    return ti > tj ? -1 : 1;
  };
  const started = teams.map((_, t) => thru[t] > 0);
  const order = teams.map((_, t) => t).filter((t) => started[t]).sort(cmp);
  const place = zeros();
  order.forEach((t, k) => { place[t] = k > 0 && cmp(order[k - 1], t) === 0 ? place[order[k - 1]] : k + 1; });

  const names = teams.map((t) => deps.teamName(t));
  const stand: PlayerStanding[] = teams.map((t, i) => ({
    playerId: t.id.toUpperCase(),
    playerName: names[i],
    points: total[i],
    moneyNet: 0,
    perHole: ctx.holes.map(() => null),
    thru: thru[i],
    place: place[i],
    ...(counting === 'strokes' ? { toPar: total[i] } : {}),
  }));

  // MONEY (§5.co follow-up: every model stays with matches on).
  const money = zeros();
  const add = (amounts: number[]) => amounts.forEach((v, i) => { money[i] += v; });
  const potSlices: PotSliceLine[] = [];
  const junkTally = tallyJunkForSides(deps.schema, bag, ctx, teams);
  const legKeys: LegKey[] = nineOnly ? ['overall'] : ['front', 'back', 'overall'];
  const legLabel = (key: LegKey) => (key === 'overall'
    ? (nineOnly === 'front' ? 'Front 9' : nineOnly === 'back' ? 'Back 9' : 'Overall')
    : key === 'front' ? 'Front 9' : 'Back 9');

  if (moneyModel === 'per-point') {
    // The team-point margin × $ (pay each team you lost to, or winner takes all at 3+).
    const values = teams.map((_, t) => (started[t] ? total[t] : null));
    const dollars = n('dollarsPerPoint');
    if (s('pointsPayout') === 'winner-takes') {
      add(settleWinnerTakes(values, higher, (top, v) => Math.abs(top - v) * dollars));
    } else {
      add(settleRoundRobin(values, (v) => v, (mine, theirs) => (higher ? mine - theirs : theirs - mine) * dollars));
    }
  } else if (moneyModel === 'per-hole') {
    // Holes won minus holes lost in each match, × $ (carry-ties if set), summed across the team's
    // matches — settled by the engine inside each match, above.
    add(perHoleMoney);
  } else if (moneyModel === 'legs') {
    // Each nine is its own bet, won by the team that won more of the matches ON THAT NINE.
    const payEach = s('legsPayout') === 'pay-each';
    for (const key of legKeys) {
      const dollars = n(key === 'front' ? 'legFront' : key === 'back' ? 'legBack' : 'legOverall');
      const inLeg = teams.map((_, t) => legStarted[key][t]);
      const v = legPts[key];
      if (dollars === 0 || !inLeg.some(Boolean)) continue;
      if (payEach) {
        add(settleRoundRobin(teams.map((_, t) => (inLeg[t] ? v[t] : null)), (x) => x,
          (mine, theirs) => (mine > theirs ? dollars : mine < theirs ? -dollars : 0)));
        continue;
      }
      const top = Math.max(...teams.map((_, t) => (inLeg[t] ? v[t] : -Infinity)));
      const leaders = teams.map((_, t) => inLeg[t] && v[t] === top);
      const leaderCount = leaders.filter(Boolean).length;
      const behind = teams.filter((_, t) => inLeg[t] && !leaders[t]).length;
      if (behind === 0) continue;
      teams.forEach((_, t) => {
        if (!inLeg[t]) return;
        money[t] += leaders[t] ? (dollars * behind) / leaderCount : -dollars;
      });
    }
  } else {
    // POT (the default with matches on): each team antes `sideBuyIn`; the pot pays down the finish
    // by `potSplit`, sliced front / back / overall (/ junk) by the share settings, as without matches.
    const buyIn = n('sideBuyIn');
    const inPot = started;
    const potTeams = teams.filter((_, t) => inPot[t]);
    if (potTeams.length > 0 && buyIn > 0) {
      const pot = buyIn * potTeams.length;
      const places = parseVector(s('potSplit'));
      const junkSliced = junkTally !== null && junkPayout(deps.schema, bag) === 'pot';
      const shares = {
        front: nineOnly ? 0 : Math.max(0, n('potFront')),
        back: nineOnly ? 0 : Math.max(0, n('potBack')),
        overall: Math.max(0, n('potOverall')) + (nineOnly ? Math.max(0, n('potFront')) + Math.max(0, n('potBack')) : 0),
        junk: junkSliced ? Math.max(0, n('potJunk')) : 0,
      };
      const shareTotal = shares.front + shares.back + shares.overall + shares.junk;
      const dollarsOf = (k: keyof typeof shares) => (shareTotal > 0 ? (pot * shares[k]) / shareTotal : k === 'overall' ? pot : 0);
      const paySlice = (
        key: PotSliceLine['key'], label: string, dollars: number,
        eligible: (t: number) => boolean, metricOf: (t: number) => number,
      ) => {
        if (dollars <= 0) return;
        const entries = teams.map((x, t) => ({ teamId: x.id, t })).filter((e) => inPot[e.t]);
        const contenders = entries.filter((e) => eligible(e.t));
        const any = contenders.length > 0;
        const ranked = (any ? contenders : entries)
          .map((e) => ({ teamId: e.teamId, metric: any ? metricOf(e.t) : 0 }))
          .sort((a, b) => a.metric - b.metric);
        const paid = distributePot(ranked, dollars, places);
        entries.forEach((e) => { money[e.t] += paid[e.teamId] ?? 0; });
        const payouts = Object.fromEntries(Object.entries(paid).filter(([, v]) => v > 0));
        const top = Math.max(0, ...Object.values(payouts));
        const winnerNames = any && top > 0 ? entries.filter((e) => payouts[e.teamId] === top).map((e) => names[e.t]) : [];
        potSlices.push({ key, label, dollars, payouts, winnerNames, split: !any });
      };
      if (!nineOnly) {
        for (const key of ['front', 'back'] as const) {
          paySlice(key, legLabel(key), dollarsOf(key), (t) => legStarted[key][t], (t) => -legPts[key][t]);
        }
      }
      // The overall slice pays the team finish (places, after the tiebreak), so board and money agree.
      paySlice('overall', legLabel('overall'), dollarsOf('overall'), () => true, (t) => place[t]);
      if (junkSliced) {
        paySlice('junk', 'Junk', dollarsOf('junk'), () => true, (t) => -(junkTally!.sides.find((x) => x.id === teams[t].id)?.points ?? 0));
      }
      teams.forEach((_, t) => { if (inPot[t]) money[t] -= buyIn; });
    }
  }
  money.forEach((v, i) => { stand[i].moneyNet = v; });

  // Junk is earned in the match and tallied by TEAM (§5.cn).
  const junk = settleJunkForSides(deps.schema, bag, ctx, stand, teams, { junkPotInBuyIn: isPot });

  // The team board's leg lines: match wins per nine ("Hogs 2–0").
  const fmt = (x: number) => (x % 1 === 0 ? String(x) : x.toFixed(1));
  const teamLegs: TeamLegLine[] = legKeys.map((key) => {
    const v = legPts[key];
    const inLeg = teams.map((_, t) => legStarted[key][t]);
    // A team leg is as far along as its SLOWEST match ("5 of 9 holes" until every match has
    // finished the nine), which is what close-out asks about; voided when the group voided it.
    const matchLegs = lines.map((l) => (l.legs.length === 1 ? l.legs[0] : l.legs.find((x) => x.key === key)));
    const playedThru = Math.min(...matchLegs.map((l) => l?.thru ?? 0));
    const holes = Math.max(0, ...matchLegs.map((l) => l?.holes ?? 0));
    const voided = matchLegs.some((l) => l?.voided);
    if (!inLeg.some(Boolean)) return { key, label: legLabel(key), status: '–', winner: null, leaders: [], thru: 0, holes };
    const top = Math.max(...teams.map((_, t) => (inLeg[t] ? v[t] : -Infinity)));
    const leaders = teams.filter((_, t) => inLeg[t] && v[t] === top).map((x) => x.id);
    const status = teams.length === 2
      ? `${names[0]} ${fmt(v[0])}–${fmt(v[1])}`
      : teams.map((_, t) => `${names[t]} ${fmt(v[t])}`).join(' · ');
    return { key, label: legLabel(key), status, winner: leaders.length === 1 ? leaders[0] : null, leaders, thru: playedThru, holes, ...(voided ? { voided } : {}) };
  });

  const standings = [...stand].sort((x, y) => (x.place === 0 ? Infinity : x.place) - (y.place === 0 ? Infinity : y.place));
  return {
    kind: 'individual', gameModeId: 'team-2v2',
    metricLabel: counting === 'holes' ? 'holes' : counting === 'strokes' ? 'net' : 'match pts',
    standings, thruHole,
    moneyModel: isPot ? 'pot' : 'per-point',
    pot: isPot ? n('sideBuyIn') * stand.filter((x) => x.thru > 0).length : 0,
    teamLegs,
    sideNames: { a: names[0] ?? '', b: names[1] ?? '' },
    sideLabels: teams.map((t, i) => ({ id: t.id, name: names[i] })),
    matches: lines,
    junkLines: junk?.lines ?? undefined,
    potSlices: potSlices.length > 0 ? potSlices : undefined,
    junkSides: junk ? junk.sides.map((x) => ({ ...x, name: names[teams.findIndex((t) => t.id === x.id)] ?? x.id })) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Building a game AS matches (T3): which sizes to offer, and the tee sheet that plays them.
// ---------------------------------------------------------------------------

/**
 * Who meets whom, SUGGESTED (§5.co Q1): each team's players cut into units of `size`, then paired
 * greedily — the team with the most units left meets the team it has met least (most units left
 * breaking that tie, then board order). Three teams of 4 at 2 v 2 rotate A v B, C v A, B v C; four
 * teams of 4 meet two of the other three each. Null when some unit would be left without an
 * opponent from another team.
 */
export function suggestMatches(teams: string[][], size: number): string[][][] | null {
  if (!(size >= 1) || teams.length < 2) return null;
  const left = teams.map((t) => {
    if (t.length % size !== 0) return null;
    return Array.from({ length: t.length / size }, (_, k) => t.slice(k * size, (k + 1) * size));
  });
  if (left.some((u) => u === null)) return null;
  const units = left as string[][][];
  const met = teams.map(() => teams.map(() => 0));
  const out: string[][][] = [];
  for (;;) {
    const open = units.map((u, i) => i).filter((i) => units[i].length > 0);
    if (open.length === 0) return out;
    if (open.length === 1) return null;
    const a = open.reduce((b, i) => (units[i].length > units[b].length ? i : b), open[0]);
    const rivals = open.filter((i) => i !== a);
    const b = rivals.reduce((best, i) => {
      if (met[a][i] !== met[a][best]) return met[a][i] < met[a][best] ? i : best;
      return units[i].length > units[best].length ? i : best;
    }, rivals[0]);
    out.push([units[a].shift()!, units[b].shift()!]);
    met[a][b] += 1;
    met[b][a] += 1;
  }
}

/**
 * The tee sheet that plays the suggested matches (§5.co Q6: the app builds the tee groups from the
 * matches). A 2 v 2 is one foursome; singles go two to a foursome, matches between the same two
 * teams together where possible. Each group lists the two units in match order, so `pairMatches`
 * reads back exactly these matches. Null when the teams can't be paired at this size.
 */
export function teeGroupsFromMatches(teams: string[][], size: number): string[][] | null {
  if (size > 2) return null;
  const matches = suggestMatches(teams, size);
  if (!matches) return null;
  if (size === 2) return matches.map(([a, b]) => [...a, ...b]);
  const teamOf = new Map<string, number>();
  teams.forEach((t, i) => t.forEach((id) => teamOf.set(id, i)));
  const key = (m: string[][]) => m.map((u) => teamOf.get(u[0])!).sort((x, y) => x - y).join('-');
  const sorted = matches.map((m, i) => ({ m, i })).sort((x, y) => (key(x.m) < key(y.m) ? -1 : key(x.m) > key(y.m) ? 1 : x.i - y.i));
  const groups: string[][] = [];
  for (let k = 0; k < sorted.length; k += 2) {
    const pair = sorted.slice(k, k + 2).map((x) => x.m);
    // Two singles in one foursome read back by team, in order: A's 1st v B's 1st, A's 2nd v B's 2nd —
    // only when both singles are between the same two teams. Otherwise they need their own groups.
    if (pair.length === 2 && key(pair[0]) === key(pair[1])) {
      const [first, second] = pair;
      const aTeam = teamOf.get(first[0][0])!;
      const side = (m: string[][], t: number) => m.find((u) => teamOf.get(u[0]) === t)!;
      const bTeam = teamOf.get(first.find((u) => teamOf.get(u[0]) !== aTeam)![0])!;
      groups.push([...side(first, aTeam), ...side(second, aTeam), ...side(first, bTeam), ...side(second, bTeam)]);
    } else {
      pair.forEach((m) => groups.push(m.flat()));
    }
  }
  return groups;
}

/** The match sizes the Compete step offers for these team sizes: 1 v 1 and 2 v 2 where the size
 *  divides every team, is smaller than every team (equal is the ordinary team game), and pairs. */
export function matchSizesFor(teamSizes: number[]): number[] {
  if (teamSizes.length < 2) return [];
  return [1, 2].filter((s) => teamSizes.every((k) => k % s === 0 && k > s)
    && suggestMatches(teamSizes.map((k, t) => Array.from({ length: k }, (_, i) => `${t}:${i}`)), s) !== null);
}
