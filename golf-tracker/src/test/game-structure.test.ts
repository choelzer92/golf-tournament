// The routing layer of the §5.bk collapse, tested as a TABLE (plan §3.3 / §3.5, answers §5.bm).
//
// Two things are proven here, and only here:
//   1. Every row of the routing table lands in the container the spec names — including the
//      rows that must be refused with a plain-words reason (capability routing, §5.bm Q1).
//   2. Every routed game that IS expressible settles zero-sum through `computeGameResult`,
//      under both money families, on the REAL engines. The engines are untouched by the
//      collapse; this proves the router never hands them a shape they can't settle.
//
// §5.z: this file was made to fail before it was trusted — see the commit message.

import { describe, expect, it } from 'vitest';
import {
  MONEY_MODEL_LABELS,
  UNEXPRESSIBLE,
  defaultTeeSheetFacts,
  moneyModelsFor,
  proposeTeeGroups,
  packTeamsIntoShape,
  recommendedStructure,
  routeContainer,
  routedFields,
  structureForDefaults,
  structureLabel,
  structureOf,
  gameKindLabel,
  gameKindLabelFrom,
  structureOptionsFor,
  teeSheetFacts,
  type MoneyModel,
  type NeutralScoring,
  type Route,
  type StructureDraft,
  parseTeamSizes,
  structureOptionLabel,
} from '@/lib/game-structure';
import { computeGameResult } from '@/lib/game-modes/result';
import { GAME_MODES, defaultSettings, getGameMode } from '@/lib/game-modes';
import { sidesOfGame } from '@/lib/game-modes/sides';
import type { GameScore } from '@/lib/game-state';
import { allEighteen, makeGame, makePlayers, makeTeam, scoresFor, TEST_PARS } from './fixtures';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const BEST_BALL: NeutralScoring = { format: 'best-ball', basis: 'stroke', compareBy: 'total' };
const STABLEFORD_MATCH: NeutralScoring = { format: 'best-ball', basis: 'stableford', compareBy: 'match' };

/** Team ids as the wizard would hand them over: p1..pN dealt into the shape in order. */
function dealTeams(sizes: number[]): string[][] {
  let n = 0;
  return sizes.map((k) => Array.from({ length: k }, () => `p${++n}`));
}

/** A draft for N teams of K. `mixed` splits partners across foursomes (Q2 dragged apart). */
function teamsDraft(
  sizes: number[],
  moneyModel: MoneyModel,
  extra: Partial<StructureDraft> = {},
  opts: { mixed?: boolean } = {},
): { draft: StructureDraft; teams: string[][]; groups: string[][] } {
  const teams = dealTeams(sizes);
  const groups = opts.mixed ? mixedGroups(teams) : proposeTeeGroups(teams);
  const draft: StructureDraft = {
    structure: { kind: 'teams', teamSizes: sizes },
    scoring: BEST_BALL,
    moneyModel,
    ...teeSheetFacts(teams, groups),
    ...extra,
  };
  return { draft, teams, groups };
}

/** Partners deliberately apart: round-robin players into ceil(n/4) groups. */
function mixedGroups(teams: string[][]): string[][] {
  const all = teams.flat();
  const count = Math.ceil(all.length / 4);
  const groups: string[][] = Array.from({ length: count }, () => []);
  all.forEach((id, i) => groups[i % count].push(id));
  return groups;
}

// Varied, deterministic round (same recipe as all-modes-sweep) so ties and blow-ups occur.
function variedRound(playerIds: string[], holes = allEighteen()): GameScore[] {
  return playerIds.flatMap((id, i) =>
    scoresFor(id, holes.map((h) => TEST_PARS[h - 1] + ((h * (i + 2)) % 5) - 1), holes));
}

/** Build the routed PoolGame exactly as `createPoolGame` will (slice 2): base fields + routedFields. */
function buildRoutedGame(draft: StructureDraft, route: Route, teams: string[][], groups: string[][]) {
  const all = teams.flat();
  const players = makePlayers(all.map((_, i) => (i * 5) % 30));
  const mode = getGameMode(route.container === 'individual' ? route.gameMode : route.container === 'sides' ? 'team-2v2' : undefined);
  const settings = mode ? defaultSettings(mode.settings) : {};
  const game = makeGame({
    players,
    teams: groups.map((g, i) => makeTeam(i + 1, g)),
    entryPerPlayer: 25,
    positionSplit: groups.length > 2 ? [70, 30] : [100],
    ...routedFields(draft, route, teams, settings),
  });
  const scores = new Map(game.teams.map((t, ti) => [
    t.matchupId,
    draft.scoring && (draft.scoring.format === 'scramble' || draft.scoring.format === 'alternate-shot')
      ? t.playerIds.flatMap((pid) => scoresFor(pid, allEighteen().map((h) => TEST_PARS[h - 1] + ((h + ti) % 3) - 1)))
      : variedRound(t.playerIds),
  ]));
  return { game, scores };
}

function moneySum(result: ReturnType<typeof computeGameResult>): number {
  return result.kind === 'team'
    ? result.payouts.reduce((s, p) => s + p.net, 0)
    : result.standings.reduce((s, st) => s + st.moneyNet, 0);
}

// ---------------------------------------------------------------------------
// 1. Structure step
// ---------------------------------------------------------------------------

describe('F-074 parseTeamSizes — a typed split under "Other split…"', () => {
  it('accepts any separator, sorts largest-first, and must add up to the field', () => {
    expect(parseTeamSizes('4, 2, 2', 8)).toEqual([4, 2, 2]);
    expect(parseTeamSizes('2 v 2 v 4', 8)).toEqual([4, 2, 2]);
    expect(parseTeamSizes('2+2+4', 8)).toEqual([4, 2, 2]);
    expect(parseTeamSizes('3 1', 4)).toEqual([3, 1]);
  });
  it('rejects a single team, a zero, a wrong total, or nothing typed yet', () => {
    expect(parseTeamSizes('8', 8)).toBeNull();
    expect(parseTeamSizes('4, 0, 4', 8)).toBeNull();
    expect(parseTeamSizes('4, 2', 8)).toBeNull();
    expect(parseTeamSizes('4, 2, 2, 1', 8)).toBeNull();
    expect(parseTeamSizes('', 8)).toBeNull();
    expect(parseTeamSizes('4,', 8)).toBeNull();
  });
  it('a typed 4 + 2 + 2 labels and routes like any other uneven shape (the 2s share a foursome)', () => {
    const shape = { kind: 'teams' as const, teamSizes: parseTeamSizes('4 2 2', 8)! };
    expect(structureOptionLabel(shape, 8).label).toBe('Three teams, 4 + 2 + 2');
    expect(defaultTeeSheetFacts(shape.teamSizes)).toEqual({ aligned: false, teamsTogether: true });
  });
});

describe('structureOptionsFor', () => {
  it('8 players: the plan §6 mock, even shapes first, the classic pool recommended', () => {
    const opts = structureOptionsFor(8);
    expect(opts.map((o) => o.label)).toEqual([
      'Two teams of 4', 'Four pairs', 'Everyone for themselves',
      'Three teams, 3 + 3 + 2', 'Five teams, 2 + 2 + 2 + 1 + 1', 'Six teams, 2 + 2 + 1 + 1 + 1 + 1', 'Seven teams, 2 + 1 + 1 + 1 + 1 + 1 + 1',
    ]);
    expect(opts.find((o) => o.recommended)?.id).toBe('teams:4+4');
    expect(opts.filter((o) => o.primary).map((o) => o.id)).toEqual(['teams:4+4', 'teams:2+2+2+2', 'solo']);
  });

  it('5 players: the recommended 3 + 2 is PRIMARY even though uneven — never behind "Other split…"', () => {
    const opts = structureOptionsFor(5);
    expect(opts.filter((o) => o.primary).map((o) => o.label)).toEqual(['Two teams, 3 + 2', 'Everyone for themselves']);
    expect(opts.find((o) => o.recommended)?.id).toBe('teams:3+2');
    expect(opts.filter((o) => !o.primary).map((o) => o.id)).toEqual(['teams:2+2+1', 'teams:2+1+1+1']);
  });

  it('every option sums to the field and is a real shape', () => {
    for (let n = 2; n <= 16; n++) {
      for (const o of structureOptionsFor(n)) {
        expect(o.teamSizes.reduce((s, k) => s + k, 0), `${n}: ${o.id}`).toBe(n);
        expect(o.teamSizes.length).toBeGreaterThanOrEqual(2);
      }
      expect(structureOptionsFor(n).filter((o) => o.recommended)).toHaveLength(1);
    }
  });

  it('two players get BOTH 1 v 1 (sides of one) and everyone-for-themselves', () => {
    const ids = structureOptionsFor(2).map((o) => o.id);
    expect(ids).toEqual(['teams:1+1', 'solo']);
    expect(structureOptionsFor(3).map((o) => o.id)).not.toContain('teams:1+1+1');
  });

  it('recommends per §5.bk: 2–3 solo, 4–7 two teams, 8+ teams that are tee groups', () => {
    expect(recommendedStructure(3)).toEqual({ kind: 'solo', teamSizes: [1, 1, 1] });
    expect(recommendedStructure(5)?.teamSizes).toEqual([3, 2]);
    expect(recommendedStructure(7)?.teamSizes).toEqual([4, 3]);
    expect(recommendedStructure(9)?.teamSizes).toEqual([3, 3, 3]);
    expect(recommendedStructure(12)?.teamSizes).toEqual([4, 4, 4]);
    expect(recommendedStructure(1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Tee sheet (§5.bm Q2)
// ---------------------------------------------------------------------------

describe('defaultTeeSheetFacts / structureForDefaults', () => {
  it('knows which shapes walk as their own group before any players exist', () => {
    expect(defaultTeeSheetFacts([4, 4])).toEqual({ aligned: true, teamsTogether: true });
    expect(defaultTeeSheetFacts([3, 3, 2])).toEqual({ aligned: true, teamsTogether: true });
    expect(defaultTeeSheetFacts([3, 2])).toEqual({ aligned: true, teamsTogether: true });
    expect(defaultTeeSheetFacts([2, 2])).toEqual({ aligned: false, teamsTogether: true });
    expect(defaultTeeSheetFacts([2, 2, 2, 2])).toEqual({ aligned: false, teamsTogether: true });
    expect(defaultTeeSheetFacts([1, 1])).toEqual({ aligned: false, teamsTogether: true });
    expect(defaultTeeSheetFacts([2, 2, 1])).toEqual({ aligned: false, teamsTogether: true });
  });

  it("derives a saved format's structure for the field at hand (plan §4.3)", () => {
    expect(structureForDefaults({ gameMode: 'skins' }, 4)).toEqual({ kind: 'solo', teamSizes: [1, 1, 1, 1] });
    expect(structureForDefaults({ gameMode: 'team-2v2', subTeams: { a: ['x', 'y'], b: ['z', 'w'] } }, 4)?.teamSizes).toEqual([2, 2]);
    // Sides saved for four, field of six: keep the side COUNT, re-balance the sizes.
    expect(structureForDefaults({ gameMode: 'team-2v2', subTeams: { a: ['x', 'y'], b: ['z', 'w'] } }, 6)?.teamSizes).toEqual([3, 3]);
    expect(structureForDefaults({ gameMode: 'team-2v2', sides: [{ id: 'a', playerIds: ['x'] }, { id: 'b', playerIds: ['y'] }] }, 2)?.teamSizes).toEqual([1, 1]);
    // A classic-pool format: teams that are tee groups at 8+, two teams under that.
    expect(structureForDefaults({}, 8)?.teamSizes).toEqual([4, 4]);
    expect(structureForDefaults({}, 12)?.teamSizes).toEqual([4, 4, 4]);
    expect(structureForDefaults({}, 6)?.teamSizes).toEqual([3, 3]);
    expect(structureForDefaults({}, 1)).toBeNull();
  });
});

describe('proposeTeeGroups / teeSheetFacts', () => {
  it('four pairs → two foursomes, partners together, not aligned', () => {
    const teams = dealTeams([2, 2, 2, 2]);
    const groups = proposeTeeGroups(teams);
    expect(groups).toEqual([['p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8']]);
    expect(teeSheetFacts(teams, groups)).toEqual({ aligned: false, teamsTogether: true });
  });

  it('two teams of 4 → each team is its own foursome (aligned)', () => {
    const teams = dealTeams([4, 4]);
    expect(teeSheetFacts(teams, proposeTeeGroups(teams))).toEqual({ aligned: true, teamsTogether: true });
  });

  it('3 + 3 + 2 → three groups, aligned; three teams of 3 never share a slot', () => {
    expect(proposeTeeGroups(dealTeams([3, 3, 2]))).toEqual([['p1', 'p2', 'p3'], ['p4', 'p5', 'p6'], ['p7', 'p8']]);
    expect(teeSheetFacts(dealTeams([3, 3, 2]), proposeTeeGroups(dealTeams([3, 3, 2]))).aligned).toBe(true);
  });

  it('2 + 2 + 1 walks as 3 + 2 (the single rides with a pair), never 4 + 1', () => {
    const teams = dealTeams([2, 2, 1]);
    const groups = proposeTeeGroups(teams);
    expect(groups.map((g) => g.length).sort()).toEqual([2, 3]);
    expect(groups.every((g) => g.length >= 2)).toBe(true);
    // Both pairs still walk together.
    for (const pair of teams.filter((t) => t.length === 2)) {
      expect(groups.some((g) => pair.every((id) => g.includes(id)))).toBe(true);
    }
    expect(teeSheetFacts(teams, groups)).toEqual({ aligned: false, teamsTogether: true });
  });

  it('three pairs walk as 4 + 2 (two pairs together, one pair alone) — never a pair split', () => {
    const teams = dealTeams([2, 2, 2]);
    const groups = proposeTeeGroups(teams);
    expect(groups.map((g) => g.length).sort()).toEqual([2, 4]);
    for (const pair of teams) expect(groups.some((g) => pair.every((id) => g.includes(id)))).toBe(true);
  });

  it('a team of five cannot walk together and is split along the best tee shape', () => {
    const groups = proposeTeeGroups(dealTeams([5, 4]));
    expect(groups.every((g) => g.length <= 4)).toBe(true);
    expect(groups.flat().sort()).toEqual(dealTeams([5, 4]).flat().sort());
  });

  it('partners dragged apart is detected', () => {
    const teams = dealTeams([2, 2, 2, 2]);
    expect(teeSheetFacts(teams, mixedGroups(teams))).toEqual({ aligned: false, teamsTogether: false });
  });

  // F-071: the groups step's shape buttons re-pack whole teams into the chosen shape.
  it('packTeamsIntoShape: four pairs into 3 + 3 + 2 cannot keep every pair whole → null', () => {
    expect(packTeamsIntoShape(dealTeams([2, 2, 2, 2]), [3, 3, 2])).toBeNull();
  });

  it('packTeamsIntoShape: three pairs into 4 + 2 keeps every pair together, first-fit in team order', () => {
    const teams = dealTeams([2, 2, 2]);
    const packed = packTeamsIntoShape(teams, [4, 2]);
    expect(packed).toEqual([['p1', 'p2', 'p3', 'p4'], ['p5', 'p6']]);
    expect(teeSheetFacts(teams, packed!)).toEqual({ aligned: false, teamsTogether: true });
  });

  it('packTeamsIntoShape: 2 + 2 + 1 into 3 + 2 rides the single with a pair; the same into 4 + 1 is refused by the shape rules upstream', () => {
    const teams = dealTeams([2, 2, 1]);
    const packed = packTeamsIntoShape(teams, [3, 2]);
    expect(packed).toEqual([['p1', 'p2', 'p5'], ['p3', 'p4']]);
    expect(teeSheetFacts(teams, packed!)).toEqual({ aligned: false, teamsTogether: true });
  });
});

// ---------------------------------------------------------------------------
// 3. The routing table (plan §3.3 under §5.bm Q1)
// ---------------------------------------------------------------------------

interface Row {
  name: string;
  sizes: number[];
  money: MoneyModel;
  extra?: Partial<StructureDraft>;
  mixed?: boolean;
  expect: { container: Route['container']; moneyMode?: 'pot' | 'match'; reason?: string };
}

const TABLE: Row[] = [
  // --- classic pool: aligned teams, pot or two-team head-to-head --------------------------
  { name: 'two teams of 4, pot', sizes: [4, 4], money: 'pot', expect: { container: 'classic', moneyMode: 'pot' } },
  { name: 'three teams of 4, pot with CTP + captains + hidden holes', sizes: [4, 4, 4], money: 'pot',
    extra: { bonuses: { junk: true, ctp: true }, captains: true, hideHolesUntilAllFinish: true },
    expect: { container: 'classic', moneyMode: 'pot' } },
  { name: 'two teams of 4, fixed legs (the overlap row → classic, it carries more)', sizes: [4, 4], money: 'legs',
    extra: { bonuses: { junk: true } }, expect: { container: 'classic', moneyMode: 'match' } },
  { name: 'two teams of 4, legs decided hole by hole', sizes: [4, 4], money: 'legs',
    extra: { scoring: STABLEFORD_MATCH }, expect: { container: 'classic', moneyMode: 'match' } },
  { name: '3 + 3 + 2 uneven, pot (each team its own group)', sizes: [3, 3, 2], money: 'pot', expect: { container: 'classic', moneyMode: 'pot' } },
  { name: 'two teams of 4, two-best-net pot (both engines can; classic carries more)', sizes: [4, 4], money: 'pot',
    extra: { scoring: { format: 'two-best-net', basis: 'stroke', compareBy: 'total' } }, expect: { container: 'classic', moneyMode: 'pot' } },
  { name: 'two teams of 4, scramble pot (one ball per team, teams together)', sizes: [4, 4], money: 'pot',
    extra: { scoring: { format: 'scramble', basis: 'stroke', compareBy: 'total' } }, expect: { container: 'classic', moneyMode: 'pot' } },

  // --- sides engine: independent teams, margin money, N>2 head-to-head ---------------------
  { name: '1 v 1 legs (singles Nassau)', sizes: [1, 1], money: 'legs', expect: { container: 'sides' } },
  { name: 'two pairs in one foursome, Stableford match legs (today\'s 2v2)', sizes: [2, 2], money: 'legs',
    extra: { scoring: STABLEFORD_MATCH }, expect: { container: 'sides' } },
  { name: 'four pairs, legs', sizes: [2, 2, 2, 2], money: 'legs', expect: { container: 'sides' } },
  { name: 'four pairs, $ per hole', sizes: [2, 2, 2, 2], money: 'per-hole', expect: { container: 'sides' } },
  { name: 'four pairs, $ per point', sizes: [2, 2, 2, 2], money: 'per-point', expect: { container: 'sides' } },
  { name: 'four pairs, single pot per team', sizes: [2, 2, 2, 2], money: 'pot', expect: { container: 'sides' } },
  // Phase 3 step 4 (§5.bq Q-E): the team engine's pot has front / back / overall / junk slices, so a
  // pairs pot with a junk pot is a plain sides route — nothing about a split pot is classic-only.
  { name: 'four pairs, pot with junk (sliced on the sides engine since Phase 3 step 4)', sizes: [2, 2, 2, 2], money: 'pot',
    extra: { bonuses: { junk: true, ctp: true } }, expect: { container: 'sides' } },
  { name: 'two teams of 4 aligned, $ per point (classic cannot express margin money)', sizes: [4, 4], money: 'per-point', expect: { container: 'sides' } },
  { name: 'two teams of 4 aligned, legs with junk differential', sizes: [4, 4], money: 'per-hole', extra: { bonuses: { junk: true } }, expect: { container: 'sides' } },
  { name: 'two teams of 3 in one 6-player field, legs, partners apart', sizes: [3, 3], money: 'legs', mixed: true, expect: { container: 'sides' } },
  { name: 'four pairs, scramble, partners together', sizes: [2, 2, 2, 2], money: 'legs',
    extra: { scoring: { format: 'scramble', basis: 'stroke', compareBy: 'match' } }, expect: { container: 'sides' } },
  // F-072: the sides engine scores every team format through the pool's `teamValueOnHole`.
  { name: 'four pairs, two-best-net legs (F-072)', sizes: [2, 2, 2, 2], money: 'legs',
    extra: { scoring: { format: 'two-best-net', basis: 'stroke', compareBy: 'total' } }, expect: { container: 'sides' } },
  { name: 'two pairs, best net + best gross, $ per point (F-072)', sizes: [2, 2], money: 'per-point',
    extra: { scoring: { format: 'net-and-gross', basis: 'stableford', compareBy: 'total' } }, expect: { container: 'sides' } },
  { name: 'two teams of 4 aligned, two best net, $ per hole (F-072: margin money on a two-ball format)', sizes: [4, 4], money: 'per-hole',
    extra: { scoring: { format: 'two-best-net', basis: 'stroke', compareBy: 'match' } }, expect: { container: 'sides' } },
  { name: '3 + 3 + 2 uneven, two-best-net, $ per hole (F-072; the pair still has two balls)', sizes: [3, 3, 2], money: 'per-hole',
    extra: { scoring: { format: 'two-best-net', basis: 'stroke', compareBy: 'total' } }, expect: { container: 'sides' } },

  // --- refused, with the reason the money step shows ---------------------------------------
  // Phase 3 step 2 (§5.bq): closest-to-pin and hand-tracked bonuses are junk on the sides engine too.
  { name: 'three pairs, pot + CTP (bonuses ride on the sides engine since Phase 3)', sizes: [2, 2, 2], money: 'pot', extra: { bonuses: { ctp: true } },
    expect: { container: 'sides' } },
  { name: '1 v 1, two-best-net (a team of one has one ball)', sizes: [1, 1], money: 'legs',
    extra: { scoring: { format: 'two-best-net', basis: 'stroke', compareBy: 'total' } },
    expect: { container: 'unexpressible', reason: UNEXPRESSIBLE.needTeams('Two-ball formats') } },
  { name: '2 + 2 + 1, best net + best gross (the single refuses it)', sizes: [2, 2, 1], money: 'legs',
    extra: { scoring: { format: 'net-and-gross', basis: 'stroke', compareBy: 'total' } },
    expect: { container: 'unexpressible', reason: UNEXPRESSIBLE.needTeams('Two-ball formats') } },
  { name: 'three teams of 4, head-to-head legs + captains', sizes: [4, 4, 4], money: 'legs', extra: { captains: true },
    expect: { container: 'unexpressible', reason: UNEXPRESSIBLE.needTwoTeams('Captains') } },
  { name: 'two teams of 4, $ per hole + manual bonuses (sides since Phase 3)', sizes: [4, 4], money: 'per-hole', extra: { bonuses: { custom: true } },
    expect: { container: 'sides' } },
  { name: 'four pairs, scramble, partners in different foursomes', sizes: [2, 2, 2, 2], money: 'legs', mixed: true,
    extra: { scoring: { format: 'scramble', basis: 'stroke', compareBy: 'match' } },
    expect: { container: 'unexpressible', reason: UNEXPRESSIBLE.oneBallApart } },
  { name: 'six pairs (12 players), legs — beyond the sides engine\'s field', sizes: [2, 2, 2, 2, 2, 2], money: 'legs',
    expect: { container: 'unexpressible', reason: UNEXPRESSIBLE.sidesFieldCap(8) } },
  { name: '1 v 1 with CTP (sides since Phase 3; F-075 gap closed)', sizes: [1, 1], money: 'legs', extra: { bonuses: { ctp: true } },
    expect: { container: 'sides' } },
  { name: 'two needs joined in one sentence', sizes: [2, 2, 2], money: 'pot', extra: { captains: true, hideHolesUntilAllFinish: true },
    expect: { container: 'unexpressible', reason: UNEXPRESSIBLE.needAligned('Captains and hiding holes until every group finishes') } },
];

describe('routeContainer — every row of the table', () => {
  for (const row of TABLE) {
    it(row.name, () => {
      const { draft } = teamsDraft(row.sizes, row.money, row.extra, { mixed: row.mixed });
      const route = routeContainer(draft);
      expect(route.container).toBe(row.expect.container);
      if (route.container === 'classic') expect(route.moneyMode).toBe(row.expect.moneyMode);
      if (route.container === 'unexpressible') expect(route.reason).toBe(row.expect.reason);
    });
  }

  it('solo routes to the chosen individual mode; no mode is refused, not guessed', () => {
    const solo: StructureDraft = { structure: { kind: 'solo', teamSizes: [1, 1, 1, 1] }, soloMode: 'skins', aligned: false, teamsTogether: true, moneyModel: 'pot' };
    expect(routeContainer(solo)).toEqual({ container: 'individual', gameMode: 'skins' });
    expect(routeContainer({ ...solo, soloMode: undefined })).toEqual({ container: 'unexpressible', reason: UNEXPRESSIBLE.noSoloMode });
  });

  it('teams without a scoring choice is refused, not defaulted', () => {
    const { draft } = teamsDraft([4, 4], 'pot');
    expect(routeContainer({ ...draft, scoring: undefined })).toEqual({ container: 'unexpressible', reason: UNEXPRESSIBLE.noScoring });
  });
});

// ---------------------------------------------------------------------------
// 4. Every expressible row settles ZERO-SUM on the real engine
// ---------------------------------------------------------------------------

describe('every routed game is zero-sum through computeGameResult', () => {
  for (const row of TABLE.filter((r) => r.expect.container !== 'unexpressible')) {
    it(row.name, () => {
      const { draft, teams, groups } = teamsDraft(row.sizes, row.money, row.extra, { mixed: row.mixed });
      const route = routeContainer(draft);
      const { game, scores } = buildRoutedGame(draft, route, teams, groups);

      const result = computeGameResult(game, scores);
      // The container is visible in the result kind: classic → 'team', sides → 'individual'.
      expect(result.kind).toBe(route.container === 'classic' ? 'team' : 'individual');
      expect(moneySum(result), `${row.name}: not zero-sum`).toBeCloseTo(0, 6);

      // Something actually settled — a table of zeros is zero-sum and meaningless.
      const moved = result.kind === 'team'
        ? result.payouts.some((p) => Math.abs(p.net) > 0)
        : result.standings.some((s) => Math.abs(s.moneyNet) > 0);
      expect(moved, `${row.name}: nobody won or lost anything`).toBe(true);

      // The saved game reads back as the structure the user chose.
      const s = structureOf(game);
      expect(s.kind).toBe('teams');
      expect(s.teamSizes).toEqual(row.sizes);
      expect(s.container).toBe(route.container);
      expect(s.aligned).toBe(draft.aligned);
      expect(s.teamsTogether).toBe(draft.teamsTogether);
    });
  }

  it('solo → individual (skins, 4 players) is zero-sum and reads back as solo', () => {
    const draft: StructureDraft = { structure: { kind: 'solo', teamSizes: [1, 1, 1, 1] }, soloMode: 'skins', aligned: false, teamsTogether: true, moneyModel: 'pot' };
    const route = routeContainer(draft);
    const teams = dealTeams([1, 1, 1, 1]);
    const { game, scores } = buildRoutedGame(draft, route, teams, [teams.flat()]);
    const result = computeGameResult(game, scores);
    expect(result.kind).toBe('individual');
    expect(moneySum(result)).toBeCloseTo(0, 6);
    expect(structureOf(game)).toMatchObject({ kind: 'solo', teamCount: 4, teamSize: 1, container: 'individual' });
  });
});

// ---------------------------------------------------------------------------
// 5. routedFields keeps every existing game's persisted shape
// ---------------------------------------------------------------------------

describe('routedFields', () => {
  it('an ordinary stroke pool (best net + best gross) gets NO teamFormat — the golden-snapshot path', () => {
    const { draft, teams } = teamsDraft([4, 4], 'pot', { scoring: { format: 'net-and-gross', basis: 'stroke', compareBy: 'total' } });
    const f = routedFields(draft, routeContainer(draft), teams);
    expect(f.gameMode).toBeUndefined();
    expect(f.moneyMode).toBe('pot');
    expect(f.matchConfig).toBeUndefined();
    expect(f.ballSelection).toBe('1-net-1-gross');
    expect(f.teamFormat).toBeUndefined();
  });

  it('a two-team head-to-head carries matchConfig with hole-by-hole when compareBy is match', () => {
    const { draft, teams } = teamsDraft([4, 4], 'legs', { scoring: STABLEFORD_MATCH });
    const f = routedFields(draft, routeContainer(draft), teams);
    expect(f.moneyMode).toBe('match');
    expect(f.matchConfig?.scoring).toBe('holes');
    expect(f.teamScoreBasis).toBe('stableford');
  });

  it('two unnamed sides persist as legacy subTeams; three or more as sides', () => {
    const two = teamsDraft([2, 2], 'legs', { scoring: STABLEFORD_MATCH });
    const f2 = routedFields(two.draft, routeContainer(two.draft), two.teams);
    expect(f2.gameMode).toBe('team-2v2');
    expect(f2.subTeams).toEqual({ a: ['p1', 'p2'], b: ['p3', 'p4'] });
    expect(f2.sides).toBeUndefined();
    expect(f2.modeSettings).toMatchObject({ format: 'best-ball', scoring: 'stableford', result: 'match', moneyModel: 'legs', junkEnabled: false });

    const four = teamsDraft([2, 2, 2, 2], 'per-point', { bonuses: { junk: true } });
    const f4 = routedFields(four.draft, routeContainer(four.draft), four.teams);
    expect(f4.subTeams).toBeUndefined();
    expect(f4.sides?.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(f4.modeSettings?.junkEnabled).toBe(true);
    expect(sidesOfGame({ sides: f4.sides })).toHaveLength(4);
  });

  it("keeps the organizer's own sides (ids and names) when given them", () => {
    const { draft, teams } = teamsDraft([2, 2, 2], 'legs');
    const mine = [
      { id: 'a', name: 'The Hogs', playerIds: ['p1', 'p2'] },
      { id: 'b', playerIds: ['p3', 'p4'] },
      { id: 'c', playerIds: ['p5', 'p6'] },
    ];
    const f = routedFields(draft, routeContainer(draft), teams, {}, { sides: mine });
    expect(f.sides).toEqual(mine);
    expect(f.subTeams).toBeUndefined();
  });

  it('every modeSettings key the router writes exists in the team-2v2 schema', () => {
    const keys = new Set(getGameMode('team-2v2')!.settings.map((s) => s.key));
    const { draft, teams } = teamsDraft([2, 2, 2, 2], 'legs');
    const f = routedFields(draft, routeContainer(draft), teams);
    for (const k of Object.keys(f.modeSettings ?? {})) expect(keys.has(k), `unknown setting ${k}`).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. moneyModelsFor is the router's own verdict, model by model
// ---------------------------------------------------------------------------

describe('moneyModelsFor', () => {
  it('two teams of 4 with CTP: every model — pot/legs on classic, margin money on sides (Phase 3)', () => {
    const { draft } = teamsDraft([4, 4], 'pot', { bonuses: { ctp: true } });
    const opts = moneyModelsFor(draft);
    expect(opts.map((o) => [o.model, o.available])).toEqual([['pot', true], ['legs', true], ['per-hole', true], ['per-point', true]]);
    expect(opts.find((o) => o.model === 'per-hole')?.route).toEqual({ container: 'sides', gameMode: 'team-2v2', moneyModel: 'per-hole' });
    expect(opts.every((o) => o.label === MONEY_MODEL_LABELS[o.model])).toBe(true);
  });

  it('four pairs: all four models, all on the sides engine', () => {
    const { draft } = teamsDraft([2, 2, 2, 2], 'pot');
    expect(moneyModelsFor(draft).every((o) => o.available && o.route.container === 'sides')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. structureOf on games shaped like the ones already saved
// ---------------------------------------------------------------------------

describe('structureOf / structureLabel on existing game shapes', () => {
  it('a classic 3-foursome pool', () => {
    const game = makeGame({ teamCount: 3, indexes: Array.from({ length: 12 }, (_, i) => i) });
    const s = structureOf(game);
    expect(s).toMatchObject({ kind: 'teams', teamCount: 3, teamSize: 4, aligned: true, teamsTogether: true, container: 'classic' });
    expect(structureLabel(s)).toBe('3 teams of 4');
  });

  it('a legacy 2v2 in one foursome', () => {
    const game = makeGame({ gameMode: 'team-2v2', subTeams: { a: ['p1', 'p3'], b: ['p2', 'p4'] } });
    const s = structureOf(game);
    expect(s).toMatchObject({ kind: 'teams', teamSizes: [2, 2], aligned: false, teamsTogether: true, container: 'sides' });
    expect(structureLabel(s)).toBe('2 pairs');
  });

  it('a 1 v 1 and an uneven three-side game', () => {
    expect(structureLabel(structureOf(makeGame({ indexes: [0, 9], gameMode: 'team-2v2', subTeams: { a: ['p1'], b: ['p2'] } })))).toBe('1 v 1');
    const uneven = makeGame({ indexes: [0, 3, 6, 9, 12], gameMode: 'team-2v2', sides: [{ id: 'a', playerIds: ['p1', 'p2'] }, { id: 'b', playerIds: ['p3', 'p4'] }, { id: 'c', playerIds: ['p5'] }] });
    expect(structureLabel(structureOf(uneven))).toBe('2 + 2 + 1');
    expect(structureOf(uneven).teamSize).toBeNull();
  });

  it('an individual game is solo', () => {
    const s = structureOf(makeGame({ gameMode: 'skins', modeSettings: defaultSettings(getGameMode('skins')!.settings) }));
    expect(s).toMatchObject({ kind: 'solo', teamCount: 4, container: 'individual' });
    expect(structureLabel(s)).toBe('4 players');
  });
});

// ---------------------------------------------------------------------------
// gameKindLabel — F-061: the ONE game-kind label. Four surfaces used to improvise it.
// ---------------------------------------------------------------------------

describe('gameKindLabel (F-061)', () => {
  it('classic pool: structure · money word, never "Pool" / "foursomes" / "side"', () => {
    const pot = makeGame({ teamCount: 2, indexes: Array.from({ length: 8 }, (_, i) => i) });
    expect(gameKindLabel(pot)).toBe('2 teams of 4 · pot');
    expect(gameKindLabel({ ...pot, moneyMode: 'match' })).toBe('2 teams of 4 · head-to-head');
    const uneven = makeGame({ indexes: Array.from({ length: 7 }, (_, i) => i), teamCount: 2 });
    expect(gameKindLabel(uneven)).toBe('4 + 3 · pot');
  });

  it('team game: money teams by size, its money model, and 2+ tee times', () => {
    const pairs = makeGame({
      indexes: Array.from({ length: 8 }, (_, i) => i), teamCount: 2, gameMode: 'team-2v2',
      modeSettings: { moneyModel: 'per-point' },
      sides: [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6'], ['p7', 'p8']].map((ids, i) => ({ id: 'abcd'[i], playerIds: ids })),
    });
    expect(gameKindLabel(pairs)).toBe('4 pairs · $/point · 2 groups');
    const oneFoursome = makeGame({ gameMode: 'team-2v2', subTeams: { a: ['p1', 'p3'], b: ['p2', 'p4'] } });
    expect(gameKindLabel(oneFoursome)).toBe('2 pairs · head-to-head');
    expect(gameKindLabel({ ...oneFoursome, modeSettings: { moneyModel: 'pot' } })).toBe('2 pairs · pot');
    expect(gameKindLabel({ ...oneFoursome, modeSettings: { moneyModel: 'per-hole' } })).toBe('2 pairs · $/hole');
    const singles = makeGame({ indexes: [0, 9], gameMode: 'team-2v2', subTeams: { a: ['p1'], b: ['p2'] } });
    expect(gameKindLabel(singles)).toBe('1 v 1 · head-to-head');
  });

  it('solo game: the format and the field size', () => {
    expect(gameKindLabel(makeGame({ gameMode: 'skins' }))).toBe('Skins · 4 players');
  });

  it('every mode, every label: no "side", no "foursome", and the list-item flavour agrees with the game', () => {
    for (const m of GAME_MODES) {
      const n = Math.max(m.playersMin, 2);
      const idx = Array.from({ length: n }, (_, i) => i);
      const half = Math.ceil(n / 2);
      const game = makeGame({
        indexes: idx, gameMode: m.id,
        sides: m.category === 'team-within-group'
          ? [{ id: 'a', playerIds: idx.slice(0, half).map((i) => `p${i + 1}`) }, { id: 'b', playerIds: idx.slice(half).map((i) => `p${i + 1}`) }]
          : undefined,
      });
      const label = gameKindLabel(game);
      expect(label.toLowerCase(), m.id).not.toMatch(/side|foursome/);
      expect(gameKindLabelFrom({
        gameMode: game.gameMode, playerCount: n, groupSizes: game.teams.map((t) => t.playerIds.length),
        sideSizes: (game.sides ?? []).map((s) => s.playerIds.length), money: String(game.modeSettings?.moneyModel ?? 'legs'),
      }), m.id).toBe(label);
    }
  });
});
