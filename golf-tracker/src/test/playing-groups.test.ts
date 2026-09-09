// PLAYING GROUPS × SIDES — the two independent axes (F-019, DECISIONS.md §5.an).
//
// `one-group-golden.test.ts` proves the old shape still settles identically. This file proves the
// NEW shape settles CORRECTLY, which a pin cannot do: it describes behaviour that didn't exist.
//
// The case that matters, and the one nothing in the codebase exercised before:
//
//     TEE TIMES (logistics)          SIDES (money)
//       8:10  Craig, Dave, Sam         The Hogs   Craig & Jym
//       8:20  Jym, Rick, Tony          The Dawgs  Dave & Rick
//                                      The Cats   Sam & Tony
//
// Every side spans both tee groups. Before F-019 the engine read `game.teams[0].matchupId` and
// filtered to that one team, so four sides settled ±$84 off FOUR players' cards with each side's
// group-2 partner silently missing (e2e/screenshots/f019-before-leaderboard.png). That is a money
// bug, not a display bug, which is why these assertions lead with zero-sum and with membership.
//
// MUTATION-PROVED per DECISIONS.md §5.z:
//
//   | mutation                                                      | cases failed |
//   |---------------------------------------------------------------|--------------|
//   | N1  revert to reading group ONE only (the original bug)       |  6           |
//   | N2  half-fix: players span all groups, scores only the first  |  3           |
//   | N3  ignore an explicit matchupId (always the whole field)     |  2           |
//
// N2 is the one worth keeping in mind: a fix that widens the player list but forgets the scores
// leaves every group-2 player in the standings at thru 0, which looks like "they haven't teed off"
// rather than like a bug. The `thru`/`not-started` assertions below are what separate the two.

import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import type { IndividualResult } from '@/lib/game-modes/types';
import type { GameSide } from '@/lib/game-modes/sides';
import type { PoolGame } from '@/lib/pool-game';
import { allEighteen, makeGame, makeTeam, scoreMap, scoresFor, TEST_PARS } from './fixtures';

const HOLES = allEighteen();
const par = () => HOLES.map((h) => TEST_PARS[h - 1]);
const flat = (over: number) => HOLES.map((h) => TEST_PARS[h - 1] + over);
const sumMoney = (r: IndividualResult) => r.standings.reduce((s, x) => s + x.moneyNet, 0);

/**
 * A side game with N playing groups and M sides, specified independently — which is the whole
 * point. `groups` and `sides` are both lists of player-id lists and need not align at all.
 */
function crossGame(
  groups: string[][],
  sideSpec: string[][],
  settings: Record<string, string | number | boolean> = {},
): PoolGame {
  const ids = groups.flat();
  const sides: GameSide[] = sideSpec.map((playerIds, i) => ({
    id: String.fromCharCode(97 + i), playerIds,
  }));
  return makeGame({
    gameMode: 'team-2v2',
    indexes: ids.map(() => 0),   // scratch: net == gross, so every number is hand-checkable
    players: ids.map((id, i) => ({
      id, name: `Player ${i + 1}`, handicapIndex: 0, gender: 'M' as const, teeSetId: 1,
    })),
    teams: groups.map((playerIds, i) =>
      makeTeam(i + 1, playerIds, { teeTime: `8:${i === 0 ? '10' : `${10 + i * 10}`}` })),
    sides,
    modeSettings: {
      format: 'best-ball', scoring: 'stroke', result: 'total',
      dollarsPerHole: 2, dollarsPerPoint: 1,
      legFront: 10, legBack: 10, legOverall: 20,
      sideBuyIn: 20, potSplit: '100',
      ...settings,
    },
  });
}

function run(game: PoolGame, rows: [string, ReturnType<typeof scoresFor>][]): IndividualResult {
  const mode = getGameMode(game.gameMode)!;
  return mode.compute(buildGameModeContext(game, scoreMap(...rows)));
}

describe('a side game with TWO playing groups', () => {
  // 8 players, two foursomes, four sides — each side straddling the two tee times. This is the
  // exact sandbox seed, and the shape the mode's playersMax was widened for.
  const GROUPS = [['p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8']];
  const SIDES = [['p1', 'p5'], ['p2', 'p6'], ['p3', 'p7'], ['p4', 'p8']];

  // MIRRORED cards: group 1 runs level→+3 and group 2 runs +3→level, so each side pairs a strong
  // player with a weak one and the two ends TIE. Used by the low-ball test below, where the tie
  // is the assertion. Not used for the money matrix — see `ranked` for why.
  const rows = (): [string, ReturnType<typeof scoresFor>][] => [
    ['m1', ['p1', 'p2', 'p3', 'p4'].flatMap((id, i) => scoresFor(id, flat(i)))],
    ['m2', ['p5', 'p6', 'p7', 'p8'].flatMap((id, i) => scoresFor(id, flat(3 - i)))],
  ];

  // SEPARATED cards, for the money matrix: side i's best ball is i strokes/hole worse than side
  // i−1, so there is a strict order and somebody must be paid. The mirrored fixture above makes
  // every side tie its opposite, and under `per-hole` a hole with two joint-best sides pushes —
  // so the matrix ran with all four sides at $0 and asserted nothing about ranking.
  const ranked = (): [string, ReturnType<typeof scoresFor>][] => [
    // Group 1 holds the low ball of sides A and B; group 2 holds the low ball of C and D. So the
    // ranking still depends on reading BOTH groups.
    ['m1', [
      ...scoresFor('p1', flat(0)), ...scoresFor('p2', flat(1)),
      ...scoresFor('p3', flat(9)), ...scoresFor('p4', flat(9)),
    ]],
    ['m2', [
      ...scoresFor('p5', flat(9)), ...scoresFor('p6', flat(9)),
      ...scoresFor('p7', flat(2)), ...scoresFor('p8', flat(3)),
    ]],
  ];

  for (const moneyModel of ['legs', 'per-hole', 'per-point', 'pot'] as const) {
    it(`${moneyModel}: every player is in the standings, and the money is zero-sum`, () => {
      const r = run(crossGame(GROUPS, SIDES, { moneyModel }), ranked());
      // Four sides, so four standings rows — and every side has BOTH members' cards behind it.
      expect(r.standings.length).toBe(4);
      expect(sumMoney(r)).toBeCloseTo(0, 6);
      expect(r.standings.some((s) => s.moneyNet > 0)).toBe(true);
      // Nobody is stuck at thru 0 from having been filtered out of the context.
      expect(r.sideBreakdown?.every((b) => b.status !== 'not-started')).toBe(true);
    });
  }

  // The heart of it: a side's total must include its group-2 member. Under best-ball at scratch,
  // side A is p1 (level) + p5 (+3/hole); the low ball is p1's, so A's total is level par. If p5
  // were missing the total would be identical — so this case is deliberately built the other way
  // round: side D is p4 (+3) + p8 (level), where the group-2 player owns the LOW ball. Drop him
  // and side D's total jumps by 54.
  it('a side scores from BOTH groups — the group-2 partner owns the low ball', () => {
    const r = run(crossGame(GROUPS, SIDES, { moneyModel: 'per-point' }), rows());
    const total = Object.fromEntries((r.sideBreakdown ?? []).map((b) => [b.id, b.total]));
    const parTotal = par().reduce((s, p) => s + p, 0);
    // Side D = p4 (+3/hole, group 1) + p8 (level, group 2). Best ball is p8's: level par.
    expect(total.d).toBe(parTotal);
    // Side A = p1 (level, group 1) + p5 (+3/hole, group 2). Best ball is p1's: also level par.
    expect(total.a).toBe(parTotal);
    // So A and D tie, which only happens if BOTH groups' cards are read. Reading group 1 alone
    // would make A level and D 54 over.
    expect(total.a).toBe(total.d);
  });

  it('a partner in the other foursome is not dropped from the field', () => {
    const ctx = buildGameModeContext(crossGame(GROUPS, SIDES), scoreMap(...rows()));
    expect(ctx.players.map((p) => p.id).sort())
      .toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
    // And the scores are the union of both matchups: 8 players × 18 holes.
    expect(ctx.scores.length).toBe(8 * 18);
  });

  // `pot` is the model that reads ctx.pot, which is derived from the resolved player set — so
  // widening the context changes the stake. Eight players ante eight buy-ins, not four.
  it('the pot antes for the WHOLE field, not one group', () => {
    const game = crossGame(GROUPS, SIDES, { moneyModel: 'pot' });
    const ctx = buildGameModeContext(game, scoreMap(...rows()));
    expect(ctx.pot).toBe(8 * (game.entryPerPlayer || 0));
  });
});

describe('a 3-player playing group, and a guest on no side', () => {
  // 7 players as 4 + 3 — a threesome is a real tee group. p7 is in a group but on NOBODY's side:
  // along for the round, not the money.
  const GROUPS = [['p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7']];
  const SIDES = [['p1', 'p5'], ['p2', 'p6'], ['p3', 'p4']];

  const rows = (): [string, ReturnType<typeof scoresFor>][] => [
    ['m1', ['p1', 'p2', 'p3', 'p4'].flatMap((id, i) => scoresFor(id, flat(i)))],
    ['m2', ['p5', 'p6', 'p7'].flatMap((id, i) => scoresFor(id, flat(i)))],
  ];

  it('the threesome is scored, and the sideless guest breaks nothing', () => {
    const r = run(crossGame(GROUPS, SIDES, { moneyModel: 'per-point' }), rows());
    expect(r.standings.length).toBe(3);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });

  it('the guest is in the FIELD but not in any side', () => {
    const game = crossGame(GROUPS, SIDES);
    const ctx = buildGameModeContext(game, scoreMap(...rows()));
    // In the field: he's playing, and his card must be enterable.
    expect(ctx.players.map((p) => p.id)).toContain('p7');
    // On no side: his score must not reach anyone's money.
    expect((ctx.sides ?? []).flatMap((s) => s.playerIds)).not.toContain('p7');
  });

  it('the sideless guest cannot change what the sides settle', () => {
    const withGuest = run(crossGame(GROUPS, SIDES, { moneyModel: 'per-point' }), rows());
    // The same game with the guest removed entirely.
    const without = run(
      crossGame([['p1', 'p2', 'p3', 'p4'], ['p5', 'p6']], SIDES, { moneyModel: 'per-point' }),
      [
        ['m1', ['p1', 'p2', 'p3', 'p4'].flatMap((id, i) => scoresFor(id, flat(i)))],
        ['m2', ['p5', 'p6'].flatMap((id, i) => scoresFor(id, flat(i)))],
      ],
    );
    const money = (r: IndividualResult) =>
      Object.fromEntries(r.standings.map((s) => [s.playerId, s.moneyNet]));
    expect(money(withGuest)).toEqual(money(without));
  });
});

describe('an explicit matchupId still scopes to ONE group', () => {
  // The scorecard path: a phone in group 2 holds only group 2's rows and passes that group's id.
  // It must keep seeing its own group, or the card would show blanks for players it can't score.
  const GROUPS = [['p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8']];
  const SIDES = [['p1', 'p5'], ['p2', 'p6'], ['p3', 'p7'], ['p4', 'p8']];

  it('names one group and gets exactly that group', () => {
    const game = crossGame(GROUPS, SIDES);
    const scores = scoreMap(
      ['m1', ['p1', 'p2', 'p3', 'p4'].flatMap((id) => scoresFor(id, par()))],
      ['m2', ['p5', 'p6', 'p7', 'p8'].flatMap((id) => scoresFor(id, par()))],
    );
    const only2 = buildGameModeContext(game, scores, 'm2');
    expect(only2.players.map((p) => p.id).sort()).toEqual(['p5', 'p6', 'p7', 'p8']);
    expect(only2.scores.length).toBe(4 * 18);

    // And the whole field when no id is named — the two calls differ, which is the point.
    const all = buildGameModeContext(game, scores);
    expect(all.players.length).toBe(8);
  });

  // An id matching no group degrades to the WHOLE FIELD, which is what the code did before
  // F-019 (`find(...)?.playerIds ?? game.players`) and is deliberately kept: a stale or bad id
  // should show a full board rather than an empty one, and this change is meant to be a no-op
  // for anything that isn't a genuine multi-group game.
  it('an unknown matchupId degrades to the whole field, as it always did', () => {
    const game = crossGame(GROUPS, SIDES);
    const ctx = buildGameModeContext(game, scoreMap(), 'nope');
    expect(ctx.players.length).toBe(8);
    // But no SCORES, because nothing is keyed under that id — so it reads as an unscored game
    // rather than inventing rows.
    expect(ctx.scores).toEqual([]);
  });
});

describe('an existing ONE-group game is unchanged', () => {
  // The regression direction that matters most: every side game in the live database has one
  // group. one-group-golden.test.ts pins 34 cases of this; here is the direct statement.
  it('one group of four still resolves to exactly those four', () => {
    const game = crossGame([['p1', 'p2', 'p3', 'p4']], [['p1', 'p4'], ['p2', 'p3']]);
    const scores = scoreMap(['m1', ['p1', 'p2', 'p3', 'p4'].flatMap((id, i) => scoresFor(id, flat(i)))]);
    const ctx = buildGameModeContext(game, scores);
    expect(ctx.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(ctx.scores.length).toBe(4 * 18);
  });
});
