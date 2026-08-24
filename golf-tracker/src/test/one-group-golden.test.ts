// GOLDEN pins for the ONE-GROUP engine, taken BEFORE F-019 gives a side game real playing groups.
//
// WHY THIS FILE EXISTS
// Today every single-group game — individual and side alike — stores exactly ONE `PoolTeam`
// holding the whole field, and `buildGameModeContext` reads `game.teams[0].matchupId` and filters
// `ctx.players` to that team's members (context.ts:25–32). F-019 widens that to N playing groups:
// the engine must union every group's scores while the SIDES stay the money grouping.
//
// Unlike `n-side-golden.test.ts`, this file pins a change that should move NOTHING. Every case
// here is `MUST NOT MOVE`:
//
//   - every existing game has one group, so the union over one group is that group
//   - the money model, the side split, and the handicap math are all untouched by F-019
//
// So there is no `SHOULD MOVE` block, and that is the point: if any snapshot in this file moves
// when the engine is widened, it is a regression, full stop. Cases proving the NEW behaviour
// (players spanning two groups) belong in a separate file — a pin cannot describe a shape that
// does not exist yet.
//
// WHAT IS COVERED, and why each is here rather than trusted to the other golden files:
//   - all seven registered modes            <- context.ts is shared by every one of them
//   - both handicap bases (18 / USGA nine)  <- the prompt calls out 9-hole bases explicitly
//   - playersMin as well as a foursome      <- AGENTS.md: several real bugs lived exactly there
//   - a game whose stored team OMITS a player from game.players
//                                           <- the filter on line 32 is the thing being changed,
//                                              and this is the only case where it does any work
//   - matchupId passed EXPLICITLY           <- the scorecard path (play/page.tsx:331) hands the
//                                              engine one group's scores; that must keep working
//   - the classic N-foursome pool           <- computePoolResult already reads N matchups; pinned
//                                              so a shared-helper change can't reach it unseen
//
// MUTATION-PROVED per DECISIONS.md §5.z — a green suite is evidence of nothing until you have
// watched it fail. Results recorded in the table at the bottom of this file.

import { describe, expect, it } from 'vitest';
import { getGameMode, GAME_MODES } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import type { IndividualResult } from '@/lib/game-modes/types';
import type { GameSide } from '@/lib/game-modes/sides';
import { computePoolResult, type PoolGame } from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import {
  allEighteen, frontNine, makeGame, makeTeam, scoreMap, scoresFor, parScores,
  singleMatchup, TEST_PARS,
} from './fixtures';

// --- helpers ---------------------------------------------------------------

function run(game: PoolGame, scores: GameScore[], matchupId?: string): IndividualResult {
  const mode = getGameMode(game.gameMode);
  if (!mode) throw new Error(`no such mode: ${game.gameMode}`);
  return mode.compute(buildGameModeContext(game, singleMatchup(scores), matchupId));
}

// The full result, normalized. Mirrors n-side-golden's `shapeOf` so a reader comparing the two
// files sees the same fields — plus `players`, because WHICH PLAYERS the context resolved to is
// exactly what F-019 changes and a money-only shape would not show it moving.
function shapeOf(r: IndividualResult) {
  return {
    metricLabel: r.metricLabel,
    thruHole: r.thruHole,
    moneyModel: r.moneyModel,
    sideLabels: r.sideLabels,
    standings: r.standings.map((s) => ({
      id: s.playerId, points: s.points, toPar: s.toPar,
      money: s.moneyNet, thru: s.thru, place: s.place,
    })),
    teamLegs: r.teamLegs?.map((l) => ({
      key: l.key, label: l.label, status: l.status, winner: l.winner, thru: l.thru,
    })),
    sideBreakdown: r.sideBreakdown?.map((b) => ({
      id: b.id, name: b.name, total: b.total, status: b.status,
    })),
    junkLines: r.junkLines?.map((j) => ({ id: j.playerId, dollars: j.dollars })),
  };
}

const HOLES = allEighteen();
const par = (holes: number[] = HOLES) => holes.map((h) => TEST_PARS[h - 1]);
/** A card `over` strokes worse than par on every hole. */
const flat = (over: number, holes: number[] = HOLES) =>
  holes.map((h) => TEST_PARS[h - 1] + over);

const sumMoney = (r: IndividualResult) => r.standings.reduce((s, x) => s + x.moneyNet, 0);

// A spread of cards so no mode sees a field of identical scores (which would tie everything and
// pin nothing about ranking). Player i shoots i strokes over par on every hole.
const spreadCards = (ids: string[]) =>
  ids.flatMap((id, i) => scoresFor(id, flat(i)));

// ---------------------------------------------------------------------------
// 1. EVERY registered mode, one group, at playersMin and at playersMax
//
// context.ts is shared by all seven modes, so a mode-agnostic change needs mode-agnostic pins.
// Each mode is run at both ends of its declared player range because "per group" is exactly the
// quantity F-019 changes the meaning of.
// ---------------------------------------------------------------------------

describe('GOLDEN: every mode at one group (MUST NOT MOVE)', () => {
  for (const mode of GAME_MODES) {
    for (const count of [mode.playersMin, mode.playersMax]) {
      const label = count === mode.playersMin ? 'playersMin' : 'playersMax';
      // Skip the duplicate run for a mode whose min === max (Wolf).
      if (count === mode.playersMax && mode.playersMin === mode.playersMax) continue;

      it(`${mode.id} / ${count} players (${label})`, () => {
        const ids = Array.from({ length: count }, (_, i) => `p${i + 1}`);
        // A real spread of handicaps, so strokes are actually given and the stroke-index path
        // (playerHoleStrokeIndexForGame → getMoneyStrokesOnHole) is exercised, not bypassed.
        const game = makeGame({
          gameMode: mode.id,
          indexes: ids.map((_, i) => i * 4),
        });
        const r = run(game, spreadCards(ids));
        expect(shapeOf(r)).toMatchSnapshot();
        // The invariant AGENTS.md asks for on every mode, every money model.
        expect(sumMoney(r)).toBeCloseTo(0, 6);
        // The context resolved to the whole field — the thing F-019 must preserve at one group.
        // A `team-within-group` mode reports standings per SIDE (rows 'A'/'B'), not per player,
        // so assert on the sides' membership there and on the player rows everywhere else.
        if (mode.category === 'team-within-group') {
          const inSides = (r.sideBreakdown ?? []).length;
          expect(inSides).toBeGreaterThan(1);
          expect(r.standings.length).toBe(inSides);
        } else {
          expect(r.standings.map((s) => s.playerId).sort()).toEqual([...ids].sort());
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 1b. `ctx.pot` — the one context field derived from the GROUP'S SIZE
//
// ADDED AFTER A SURVIVED MUTATION (§5.z). `pot = players.length × entryPerPlayer` is computed
// from the resolved player set, so widening the context to N groups changes it directly: a
// 2-group side game's pot must be eight buy-ins, not four. Hard-coding it to `4 ×` passed all 30
// pins in the first draft of this file.
//
// Why nothing caught it: only `nines` reads `ctx.pot`, and only in `moneyModel: 'pot'` — a
// combination the mode matrix above never ran (its modes take their default money model, and
// nines defaults to per-point). Same shape of blindness as MUT4 in n-side-golden: a field that
// only varies under one setting, and no case setting it.
//
// The counts below deliberately avoid 4, because a hard-coded foursome is invisible at 4.
// ---------------------------------------------------------------------------

describe('GOLDEN: pot money scales with the GROUP SIZE (MUST NOT MOVE)', () => {
  for (const count of [3, 4]) {
    it(`nines in pot mode / ${count} players`, () => {
      const ids = Array.from({ length: count }, (_, i) => `p${i + 1}`);
      const game = makeGame({
        gameMode: 'nines',
        indexes: ids.map(() => 0),      // scratch, so points come only from the cards
        entryPerPlayer: 20,
        modeSettings: { moneyModel: 'pot', scoreBasis: 'net', pointVector: '5,3,1' },
      });
      const r = run(game, spreadCards(ids));
      expect(shapeOf(r)).toMatchSnapshot();
      expect(sumMoney(r)).toBeCloseTo(0, 6);

      // ORACLE, independent of the snapshot: the pot IS the group's buy-ins. Every player antes
      // $20, so the winner's gross take and the total staked both scale with the count — at 3
      // players the pot is $60, not the $80 a hard-coded foursome would produce.
      //
      // settlePot pays out the whole pot and charges each player their share, so the most any
      // one player can be UP is (pot − own ante) = 20 × (count − 1).
      const maxWin = 20 * (count - 1);
      const best = Math.max(...r.standings.map((s) => s.moneyNet));
      expect(best).toBeLessThanOrEqual(maxWin + 1e-9);
      // And with a clear winner (spreadCards separates everyone), the leader really does take it.
      expect(best).toBeCloseTo(maxWin, 6);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. The side game across every money model, at 4 and at playersMax 8
//
// Eight players in "one foursome" is the impossible state F-019 exists to fix, so its money is
// pinned here at the shape it settles today. The engine change must not alter a penny of it.
// ---------------------------------------------------------------------------

describe('GOLDEN: side game, one group, every money model (MUST NOT MOVE)', () => {
  const MONEY_MODELS = ['legs', 'per-hole', 'per-point', 'pot'] as const;

  function sideGame(
    sideSpec: string[][],
    settings: Record<string, string | number | boolean> = {},
  ): PoolGame {
    const ids = sideSpec.flat();
    const sides: GameSide[] = sideSpec.map((playerIds, i) => ({
      id: String.fromCharCode(97 + i), playerIds,
    }));
    return makeGame({
      gameMode: 'team-2v2',
      indexes: ids.map(() => 0),   // scratch: net == gross, every number hand-checkable
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

  // 4 players / 2 sides — the ordinary 2v2, and the case where "one group" and "the whole
  // field" are the same set. F-019's whole risk is that they stop being the same set.
  for (const moneyModel of MONEY_MODELS) {
    it(`2 sides of 2 (4 players) / ${moneyModel}`, () => {
      const r = run(sideGame([['p1', 'p2'], ['p3', 'p4']], { moneyModel }), [
        ...scoresFor('p1', par()), ...scoresFor('p2', par()),
        ...scoresFor('p3', flat(1)), ...scoresFor('p4', flat(1)),
      ]);
      expect(shapeOf(r)).toMatchSnapshot();
      expect(sumMoney(r)).toBeCloseTo(0, 6);
      expect(r.standings.some((s) => s.moneyNet > 0)).toBe(true);
    });
  }

  // 8 players / 4 sides — playersMax. THE case F-019 is about: today these eight are one
  // "foursome"; tomorrow they are two groups of four. The money must be identical either way,
  // because the sides did not change.
  for (const moneyModel of MONEY_MODELS) {
    it(`4 sides of 2 (8 players, playersMax) / ${moneyModel}`, () => {
      const spec = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6'], ['p7', 'p8']];
      const scores = spec.flatMap((sideIds, i) =>
        sideIds.flatMap((id) => scoresFor(id, flat(i))),
      );
      const r = run(sideGame(spec, { moneyModel }), scores);
      expect(shapeOf(r)).toMatchSnapshot();
      expect(sumMoney(r)).toBeCloseTo(0, 6);
      expect(r.standings.some((s) => s.moneyNet > 0)).toBe(true);
    });
  }

  // COMBINED at uneven side sizes. This block exists because of the MUT4 lesson recorded in
  // n-side-golden.test.ts: every uneven case there played BEST BALL, where exactly one ball
  // counts whatever the side size is, so a ball count hard-coded to 2 survived all 54 pins.
  // `ballsPerHole` only varies for `combined` — so uneven + combined is the only shape that
  // can see that class of bug.
  it('COMBINED, uneven sides 3/2/1 — the shape that catches a hard-coded ball count', () => {
    const spec = [['p1', 'p2', 'p3'], ['p4', 'p5'], ['p6']];
    const scores = spec.flatMap((sideIds, i) =>
      sideIds.flatMap((id) => scoresFor(id, flat(i))),
    );
    const r = run(sideGame(spec, { moneyModel: 'per-point', format: 'combined' }), scores);
    expect(shapeOf(r)).toMatchSnapshot();
    expect(sumMoney(r)).toBeCloseTo(0, 6);
    // ORACLE, independent of the snapshot: under `combined` a side's hole total is the SUM of
    // its members' nets, so side size drives the total. At scratch on 18 holes with side i
    // playing i over par per hole:
    //   side a (3 players, level):     sum of 3 par cards      -> toPar 0
    //   side b (2 players, +1/hole):   2 x 18 strokes over     -> toPar +36
    //   side c (1 player,  +2/hole):   1 x 36 strokes over     -> toPar +36
    // A hard-coded 2 balls/side would make a's and c's totals wrong and this fail.
    const byId = Object.fromEntries((r.sideBreakdown ?? []).map((b) => [b.id, b.total]));
    expect(byId.a).toBe(par().reduce((s, p) => s + p, 0) * 3);
    expect(byId.b).toBe(par().reduce((s, p) => s + p, 0) * 2 + 36);
    expect(byId.c).toBe(par().reduce((s, p) => s + p, 0) * 1 + 36);
  });
});

// ---------------------------------------------------------------------------
// 3. The player FILTER on context.ts:32 — the only lines whose behaviour is load-bearing
//
// `players` is `game.players` filtered to the resolved team's members. For every ordinary game
// that filter is a no-op, because the one team holds everybody. These two cases are the only
// ones where it removes anyone, so they pin what "filter to the group" means today.
// ---------------------------------------------------------------------------

describe('GOLDEN: the team-membership filter (MUST NOT MOVE)', () => {
  // A player in game.players but NOT on the stored team. Today they are excluded from the
  // context entirely — no standing, no money. After F-019 they are in no GROUP, which is a
  // different question from being on no SIDE; this pins today's answer either way.
  it('a player absent from the stored team is excluded from the context', () => {
    const game = makeGame({
      gameMode: 'skins',
      indexes: [0, 6, 12, 18],
      // The team omits p4 — only p1..p3 are in the group.
      teams: [makeTeam(1, ['p1', 'p2', 'p3'])],
      modeSettings: { dollarsPerSkin: 5, carryover: true },
    });
    const r = run(game, spreadCards(['p1', 'p2', 'p3', 'p4']));
    expect(shapeOf(r)).toMatchSnapshot();
    expect(r.standings.map((s) => s.playerId)).not.toContain('p4');
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });

  // No teams at all: the `?? game.players.map(p => p.id)` fallback on line 30. A malformed or
  // half-migrated game must keep degrading to "the whole field" rather than to nobody.
  it('a game with NO teams falls back to the whole field', () => {
    const game = makeGame({
      gameMode: 'skins',
      indexes: [0, 6, 12, 18],
      teams: [],
      modeSettings: { dollarsPerSkin: 5, carryover: true },
    });
    // No team means no matchupId to key the scores by, so the rows come back empty and the
    // result is an unscored game — but over the FULL field, not an empty one.
    const r = run(game, spreadCards(['p1', 'p2', 'p3', 'p4']));
    expect(shapeOf(r)).toMatchSnapshot();
    expect(r.standings.map((s) => s.playerId).sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});

// ---------------------------------------------------------------------------
// 4. The EXPLICIT matchupId argument — the scorecard's path
//
// `play/page.tsx:331` computes side totals from `new Map([[poolCtx.matchupId, scores]])`: one
// group's scores, keyed by that group's matchup, with the id passed explicitly. F-019 must not
// break that call shape, so it is pinned with two groups present in the game.
// ---------------------------------------------------------------------------

describe('GOLDEN: explicit matchupId selects that group (MUST NOT MOVE)', () => {
  it('passing a matchupId scopes players and scores to that team', () => {
    const game = makeGame({
      gameMode: 'skins',
      indexes: [0, 4, 8, 12, 16, 20, 24, 28],
      teams: [
        makeTeam(1, ['p1', 'p2', 'p3', 'p4']),
        makeTeam(2, ['p5', 'p6', 'p7', 'p8']),
      ],
      modeSettings: { dollarsPerSkin: 5, carryover: true },
    });
    // Group 2's rows, under group 2's matchup id.
    const scores = spreadCards(['p5', 'p6', 'p7', 'p8']);
    const r = run(game, scores, 'm2');
    expect(shapeOf(r)).toMatchSnapshot();
    expect(r.standings.map((s) => s.playerId).sort()).toEqual(['p5', 'p6', 'p7', 'p8']);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
  });

  // THE ONE CASE IN THIS FILE THAT MOVED, and the only one that should have.
  //
  // Before F-019, omitting the matchupId with two teams present silently took team ONE. That was
  // the whole one-group assumption, and it is now "the whole field": a side game whose partners
  // sit in different foursomes has to settle on everybody's scores.
  //
  // Kept as a SHOULD MOVE record rather than deleted, so the diff that changed it stays legible
  // — the n-side-golden convention (label intent, don't just re-record).
  it('SHOULD MOVE — omitting the matchupId now spans EVERY group', () => {
    const game = makeGame({
      gameMode: 'skins',
      indexes: [0, 4, 8, 12, 16, 20, 24, 28],
      teams: [
        makeTeam(1, ['p1', 'p2', 'p3', 'p4']),
        makeTeam(2, ['p5', 'p6', 'p7', 'p8']),
      ],
      modeSettings: { dollarsPerSkin: 5, carryover: true },
    });
    // Both groups' rows, under their own matchup keys — what the leaderboard fetches.
    const scores = scoreMap(
      ['m1', spreadCards(['p1', 'p2', 'p3', 'p4'])],
      ['m2', spreadCards(['p5', 'p6', 'p7', 'p8'])],
    );
    const mode = getGameMode('skins')!;
    const r = mode.compute(buildGameModeContext(game, scores));

    // WAS: ['p1','p2','p3','p4'] — half the field.
    expect(r.standings.map((s) => s.playerId).sort())
      .toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
    expect(sumMoney(r)).toBeCloseTo(0, 6);
    // Every player has a real card, so nobody is sitting at thru 0 having been dropped.
    expect(r.standings.every((s) => s.thru === 18)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Both handicap bases on a nine
//
// AGENTS.md: "Exercise playersMin, not just a foursome, and both 9-hole handicap bases."
// The nine basis reranks stroke indexes 1–9 and halves the allocation threshold, so it reaches
// buildHcapMap and playerHoleStrokeIndexForGame — both read through the context being changed.
// ---------------------------------------------------------------------------

describe('GOLDEN: nine-hole games, both handicap bases (MUST NOT MOVE)', () => {
  for (const handicapBasis of ['course', 'index'] as const) {
    // '9' is the USGA basis (halved allocation, stroke indexes reranked 1–9); '18' keeps the
    // full-18 allocation on a nine. Both reach buildHcapMap and playerHoleStrokeIndexForGame.
    for (const nineHandicapBasis of ['18', '9'] as const) {
      it(`front nine / basis ${handicapBasis} / nine ${nineHandicapBasis}`, () => {
        const ids = ['p1', 'p2', 'p3', 'p4'];
        const game = makeGame({
          gameMode: 'team-2v2',
          indexes: [2, 9, 15, 23],   // deliberately not multiples of anything
          holesPlaying: 'front9',
          handicapBasis,
          nineHandicapBasis,
          sides: [
            { id: 'a', playerIds: ['p1', 'p4'] },
            { id: 'b', playerIds: ['p2', 'p3'] },
          ],
          modeSettings: {
            format: 'best-ball', scoring: 'stroke', result: 'total',
            moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 20,
          },
        });
        const nine = frontNine();
        const scores = ids.flatMap((id, i) => scoresFor(id, flat(i, nine), nine));
        const r = run(game, scores);
        expect(shapeOf(r)).toMatchSnapshot();
        expect(sumMoney(r)).toBeCloseTo(0, 6);
      });
    }
  }

  // ADDED AFTER A SURVIVED MUTATION (§5.z). Passing 18 instead of `numHolesForStrokes(game)` to
  // getMoneyStrokesOnHole — i.e. ignoring the USGA nine basis entirely — passed every case above.
  //
  // Why: those cases play BEST BALL, where only the low net on a hole counts. Each side pairs a
  // low handicap with a high one, so the strong player's ball wins nearly every hole and the
  // weak player's stroke count barely reaches the money. That is the same blindness as MUT4 in
  // n-side-golden — a shared helper's argument only shows through under some formats.
  //
  // So pin `strokesOnHole` DIRECTLY, where the basis is unambiguous. Both halves of the basis
  // matter and they pull in opposite directions:
  //   basis 18 → handicap stays 24, threshold 18 → 2 strokes where index ≤ 24−18 = 6
  //   basis  9 → handicap halves to 12, threshold 9 → 2 strokes where index ≤ 12−9  = 3
  // So the same player gets a second stroke on SIX holes of the nine on the casual basis and on
  // THREE under USGA. Fixtures guarantee stroke index == hole number (fixtures.test.ts).
  //
  // Handicap 24 (not 15) is deliberate: at 15 both bases give exactly one stroke on all nine
  // holes, so the two are indistinguishable — which is why the first draft of this assertion was
  // wrong. The case has to be past the doubling threshold on both bases to see anything.
  it('the nine basis reaches strokesOnHole — the second-stroke boundary moves', () => {
    const build = (nineHandicapBasis: '18' | '9') => {
      const game = makeGame({
        gameMode: 'skins',
        // Two players so the mode's player range is respected; only the first is asserted on.
        indexes: [24, 0],   // Course Handicap 24 on the slope-113 fixture course
        holesPlaying: 'front9',
        nineHandicapBasis,
        modeSettings: { dollarsPerSkin: 5, carryover: true },
      });
      return buildGameModeContext(game, singleMatchup([]));
    };

    const strokesPerHole = (ctx: ReturnType<typeof build>) => {
      const pid = ctx.players[0].id;
      return ctx.holes.map((h) => ctx.strokesOnHole(pid, h));
    };

    // Handicap kept at 24 against an 18-hole threshold: doubles through index 6.
    expect(strokesPerHole(build('18'))).toEqual([2, 2, 2, 2, 2, 2, 1, 1, 1]);
    // Handicap halved to 12 against a 9-hole threshold: doubles through index 3.
    expect(strokesPerHole(build('9'))).toEqual([2, 2, 2, 1, 1, 1, 1, 1, 1]);
  });

  // The same basis difference, but reaching the MONEY: `combined` counts every ball, so a
  // player's stroke count always lands on their side's total. This is the format-level partner
  // to the direct assertion above.
  it('the nine basis reaches the money under COMBINED (every ball counts)', () => {
    const money = (nineHandicapBasis: '18' | '9') => {
      const ids = ['p1', 'p2', 'p3', 'p4'];
      const game = makeGame({
        gameMode: 'team-2v2',
        // Past the doubling threshold on BOTH bases (see the assertion above), so the two bases
        // allocate a different NUMBER of strokes and the difference can reach the money.
        indexes: [24, 26, 2, 3],
        holesPlaying: 'front9',
        nineHandicapBasis,
        sides: [
          { id: 'a', playerIds: ['p1', 'p2'] },   // both high — their strokes decide the total
          { id: 'b', playerIds: ['p3', 'p4'] },
        ],
        modeSettings: {
          format: 'combined', scoring: 'stroke', result: 'total',
          moneyModel: 'per-point', dollarsPerPoint: 1,
        },
      });
      const nine = frontNine();
      const scores = ids.flatMap((id) => scoresFor(id, par(nine), nine));
      const r = run(game, scores);
      return Object.fromEntries(r.standings.map((s) => [s.playerId, s.moneyNet]));
    };
    // Everyone shoots par, so all the movement comes from strokes given — which is exactly the
    // quantity the basis controls. The two bases must therefore pay DIFFERENTLY.
    expect(money('18')).not.toEqual(money('9'));
    expect(money('18')).toMatchSnapshot('combined-basis18');
    expect(money('9')).toMatchSnapshot('combined-basis9');
  });
});

// ---------------------------------------------------------------------------
// 6. The classic N-foursome pool
//
// `computePoolResult` is a different function and F-019 does not touch it — but it shares
// pool-game.ts helpers with the context, and the prompt lists it as MUST NOT MOVE. Cheap to pin,
// and it is the path real money runs on today.
// ---------------------------------------------------------------------------

describe('GOLDEN: classic pool of foursomes is untouched (MUST NOT MOVE)', () => {
  it('two foursomes, pot mode, fully scored', () => {
    const game = makeGame({
      indexes: [0, 5, 10, 15, 3, 8, 13, 18],
      teamCount: 2,
      moneyMode: 'pot',
    });
    const result = computePoolResult(game, scoreMap(
      ['m1', parScores(['p1', 'p2', 'p3', 'p4'])],
      ['m2', ['p5', 'p6', 'p7', 'p8'].flatMap((id) => scoresFor(id, flat(1)))],
    ));
    expect({
      thruHole: result.thruHole,
      payouts: result.payouts.map((p) => ({
        team: p.teamName, gross: p.grossTotal, net: p.net, perPerson: p.perPersonNet,
      })),
      legs: result.legs.map((l) => ({
        leg: l.leg, subPot: l.subPot, complete: l.complete,
        rows: l.standings.map((s) => ({ team: s.teamName, place: s.place, payout: s.payout })),
      })),
    }).toMatchSnapshot();
    // Zero-sum across the pool.
    expect(result.payouts.reduce((s, p) => s + p.net, 0)).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// MUTATION LOG (DECISIONS.md §5.z)
//
// Every mutation below was applied to context.ts, run, and the failures counted. A pin nobody has
// watched fail is a pin that might assert nothing.
//
//   | mutation                                                        | cases failed |
//   |-----------------------------------------------------------------|--------------|
//   | MUT1  ignore team membership; always use the whole field        |  3           |
//   | MUT2  pot hard-coded to 4 × entryPerPlayer                      |  1  <- see below
//   | MUT3  stroke threshold hard-coded to 18 (ignore the nine basis)  |  2  <- see below
//   | MUT4  ignore stored sides; always use the balanced default      | 10           |
//   | MUT5  read scores from the first map entry, not the matchup key |  2           |
//
// TWO MUTATIONS SURVIVED THE FIRST DRAFT, and both are the §5.z lesson arriving again:
//
// MUT2 (pot hard-coded to a foursome) passed all 30 original pins. `ctx.pot` is read by exactly
// one mode (nines) in exactly one money model ('pot'), and the mode matrix ran every mode on its
// DEFAULT settings — nines defaults to per-point, so nothing in the file ever read the field.
// `pot = players.length × entryPerPlayer` is derived from the resolved player set, so it is one of
// the few context fields F-019 changes directly: a 2-group side game antes eight buy-ins, not
// four. Section 1b was added for it, at 3 players — a hard-coded foursome is invisible at 4.
//
// MUT3 (stroke threshold hard-coded to 18) passed all 30, INCLUDING the four cases whose whole
// purpose was the nine-hole handicap bases. Those cases play best-ball, where only the low net on
// a hole counts; each side pairs a low handicap with a high one, so the strong ball wins nearly
// every hole and the weak player's stroke count never reaches the money. Fixed by pinning
// `strokesOnHole` directly (the boundary where the second stroke stops) plus a `combined` money
// case, where every ball counts. The first draft of that direct assertion was ALSO wrong: at
// handicap 15 both bases give one stroke on all nine holes, so the two are indistinguishable —
// the case has to sit past the doubling threshold on both bases (24 does) to show anything.
//
// Both survivors share one shape with MUT4 in n-side-golden.test.ts: a shared helper's argument
// that only becomes observable under a setting no case set. When adding a pin here, ask which
// setting makes the field you care about vary, and set it.
// ---------------------------------------------------------------------------
