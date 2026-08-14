// EXHAUSTIVE SWEEP — every game type, every setting value, every field size.
//
// Craig: "you should try all the game types, settings/versions and see what happens. we need
// to make sure there arent any weird errors."
//
// The per-mode test files assert each game's rules. This file asserts nothing about rules and
// everything about ROBUSTNESS across the whole matrix, which is what a spot-check misses:
//
//   1. compute() never throws, for any legal combination of settings.
//   2. Money is ZERO-SUM. The invariant AGENTS.md calls out as the one that catches real bugs.
//   3. No NaN / Infinity reaches a money or score field — the failure mode that renders as
//      "$NaN" on a phone rather than crashing.
//   4. Every standing's `place` is consistent with its money (a paid player can't be unplaced).
//   5. Partial rounds (thru 1, thru 6, nobody scored) behave — mid-round is the common case,
//      not the exception.
//
// It drives each mode through the REAL registry (GAME_MODES) and the real settings schema, so
// a newly added mode or setting is swept automatically without touching this file.

import { describe, expect, it } from 'vitest';
import { GAME_MODES, defaultSettings, type SettingsBag } from '@/lib/game-modes';
import type { FormatSetting } from '@/lib/formats';
import { computeGameResult } from '@/lib/game-modes/result';
import { computePoolResult, type PoolGame } from '@/lib/pool-game';
import { TEAM_FORMAT_OPTIONS, persistedTeamScoring, type ScoreBasis } from '@/lib/game-modes/team-scoring';
import {
  allEighteen, backNine, frontNine, makeGame, makePlayers, scoresFor, TEST_PARS,
} from './fixtures';
import type { GameScore } from '@/lib/game-state';

// --- helpers ---------------------------------------------------------------

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

// A deterministic, VARIED round: each player is offset differently per hole, so ties,
// birdies, doubles and blow-ups all occur. Deliberately not "everyone shot par" — flat
// rounds hide ranking bugs (every tie looks correct).
function variedRound(playerIds: string[], holes: number[] = allEighteen()): GameScore[] {
  return playerIds.flatMap((id, i) =>
    scoresFor(id, holes.map((h) => TEST_PARS[h - 1] + ((h * (i + 2)) % 5) - 1), holes),
  );
}

// Every finite number reachable from a result, so one assertion covers NaN and Infinity
// wherever they'd surface.
function numbersIn(value: unknown, path = '', out: [string, number][] = []): [string, number][] {
  if (typeof value === 'number') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => numbersIn(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) numbersIn(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

function expectAllFinite(result: unknown, label: string) {
  for (const [path, n] of numbersIn(result)) {
    // A NaN here renders as "$NaN" on someone's phone rather than throwing.
    expect(Number.isFinite(n), `${label}: ${path} = ${n}`).toBe(true);
  }
}

// Every candidate value for one setting: both booleans, every select option, and a few
// numbers including the edges that have historically broken things (0, 1).
function settingCandidates(s: FormatSetting): (string | number | boolean)[] {
  switch (s.type) {
    case 'toggle': return [true, false];
    case 'select': return (s.options ?? []).map((o) => o.value);
    case 'number': return [0, 1, 2, 5, Number(s.defaultValue) || 1];
    case 'text': return [String(s.defaultValue), '5,3,1', ''];
  }
}

// --- 1. every registered mode, every setting value -------------------------

describe('every game mode survives every setting value', () => {
  for (const mode of GAME_MODES) {
    // Exercise playersMin (several real bugs lived exactly there, per AGENTS.md) and a
    // full foursome.
    const sizes = [...new Set([mode.playersMin, Math.min(4, mode.playersMax)])];

    for (const size of sizes) {
      for (const setting of mode.settings) {
        for (const candidate of settingCandidates(setting)) {
          const label = `${mode.id} n=${size} ${setting.key}=${String(candidate)}`;

          it(label, () => {
            const settings: SettingsBag = { ...defaultSettings(mode.settings), [setting.key]: candidate };
            const game = makeGame({
              indexes: Array.from({ length: size }, (_, i) => i * 6),
              gameMode: mode.id,
              modeSettings: settings,
              entryPerPlayer: 20,
              // Wolf needs a rotation; a decision game with none falls back to player order.
              ...(mode.id === 'wolf' ? { wolfOrder: ids(size) } : {}),
              ...(mode.category === 'team-within-group' && size >= 4
                ? { subTeams: { a: ids(size).slice(0, size / 2), b: ids(size).slice(size / 2) } }
                : {}),
            });
            const scores = new Map([['m1', variedRound(ids(size))]]);

            // 1. never throws.
            const result = computeGameResult(game, scores);

            // 3. no NaN / Infinity anywhere.
            expectAllFinite(result, label);

            if (result.kind === 'individual') {
              // 2. zero-sum money.
              const net = result.standings.reduce((s, st) => s + st.moneyNet, 0);
              expect(net, `${label}: money not zero-sum`).toBeCloseTo(0, 6);

              // 4. a paid player must have a place.
              for (const st of result.standings) {
                if (st.moneyNet !== 0) expect(st.place, `${label}: paid but unplaced`).toBeGreaterThan(0);
              }
            }
          });
        }
      }
    }
  }
});

// --- 2. every mode on a partial round --------------------------------------

describe('every game mode survives a PARTIAL round', () => {
  // Mid-round is the normal state of a game, not an edge case. "Continuing" is the verb
  // AGENTS.md says to bias effort toward.
  const CASES: { label: string; holes: number[] }[] = [
    { label: 'nobody scored', holes: [] },
    { label: 'thru 1', holes: [1] },
    { label: 'thru 6', holes: [1, 2, 3, 4, 5, 6] },
    { label: 'back nine only', holes: backNine() },
    { label: 'front nine only', holes: frontNine() },
  ];

  for (const mode of GAME_MODES) {
    for (const { label, holes } of CASES) {
      it(`${mode.id} — ${label}`, () => {
        const size = Math.min(4, Math.max(mode.playersMin, 4));
        const game = makeGame({
          indexes: Array.from({ length: size }, (_, i) => i * 5),
          gameMode: mode.id,
          modeSettings: defaultSettings(mode.settings),
          entryPerPlayer: 20,
          ...(mode.id === 'wolf' ? { wolfOrder: ids(size) } : {}),
          ...(mode.category === 'team-within-group'
            ? { subTeams: { a: ids(size).slice(0, 2), b: ids(size).slice(2) } }
            : {}),
        });
        const scores = new Map([['m1', holes.length ? variedRound(ids(size), holes) : []]]);

        const result = computeGameResult(game, scores);
        expectAllFinite(result, `${mode.id}/${label}`);
        if (result.kind === 'individual') {
          expect(result.standings.reduce((s, st) => s + st.moneyNet, 0)).toBeCloseTo(0, 6);
        }
      });
    }
  }
});

// --- 3. the CLASSIC POOL matrix --------------------------------------------

describe('classic pool: every format x basis x money mode x holes', () => {
  const MONEY: ('pot' | 'match')[] = ['pot', 'match'];
  const BASES: ScoreBasis[] = ['stroke', 'stableford'];
  const HOLES: ('18' | 'front9' | 'back9')[] = ['18', 'front9', 'back9'];

  // Match play settles its legs two different ways and they rank by DIFFERENT things: 'holes'
  // by holes won, 'stroke' by the leg total. Sweeping only 'holes' left the stroke path — one
  // of the three places that paid the losing team under Stableford — completely uncovered.
  const LEG_SCORING: ('holes' | 'stroke')[] = ['holes', 'stroke'];

  for (const opt of TEAM_FORMAT_OPTIONS) {
    for (const basis of BASES) {
      for (const moneyMode of MONEY) {
        for (const holesPlaying of HOLES) {
          // Match mode is two teams by definition; pot mode is worth testing at 2 and 4.
          const teamCounts = moneyMode === 'match' ? [2] : [2, 4];
          const legScorings = moneyMode === 'match' ? LEG_SCORING : (['holes'] as const);

          for (const teamCount of teamCounts) {
          for (const legScoring of legScorings) {
            const label = `${opt.format}/${basis}/${moneyMode}/${holesPlaying}/${teamCount}t${moneyMode === 'match' ? `/${legScoring}` : ''}`;

            it(label, () => {
              const holes = holesPlaying === '18' ? allEighteen()
                : holesPlaying === 'front9' ? frontNine() : backNine();
              const game = makeGame({
                teamCount,
                indexes: Array.from({ length: teamCount * 4 }, (_, i) => (i * 3) % 28),
                entryPerPlayer: 25,
                holesPlaying,
                ...persistedTeamScoring(opt.format, basis),
                ...(moneyMode === 'match'
                  ? {
                      moneyMode: 'match' as const,
                      matchConfig: {
                        legDollars: { front: 10, back: 10, overall: 20 },
                        junkPerPoint: 5,
                        scoring: legScoring,
                        pointsPerHole: { win: 1, tie: 0.5, loss: 0 },
                      },
                    }
                  : { positionSplit: teamCount > 2 ? [70, 30] : [100] }),
              });

              // One ball formats: the scorecard writes the SAME gross to every member.
              const scores = new Map(
                game.teams.map((t, ti) => [
                  t.matchupId!,
                  opt.format === 'scramble' || opt.format === 'alternate-shot'
                    ? t.playerIds.flatMap((pid) =>
                        scoresFor(pid, holes.map((h) => TEST_PARS[h - 1] + ((h + ti) % 3) - 1), holes))
                    : variedRound(t.playerIds, holes),
                ]),
              );

              const r = computePoolResult(game, scores);
              expectAllFinite(r, label);

              // Zero-sum, every combination.
              expect(r.payouts.reduce((s, p) => s + p.net, 0), `${label}: not zero-sum`).toBeCloseTo(0, 6);

              // Ranking is consistent with an INDEPENDENT oracle, not with the engine's own
              // rankMetric — comparing place against rankMetric is a tautology (both come
              // from the same three lines), and a mutation reverting the points direction
              // survived that version of this check.
              //
              // The oracle: on equal holes played, the team that scored better must not be
              // ranked behind. Better = MORE points under Stableford, FEWER strokes
              // otherwise. Stated as an implication so it holds for every leg and format.
              for (const leg of r.legs) {
                if (leg.leg === 'junk') {
                  // Junk is points: more is better, always.
                  for (const a of leg.standings) {
                    for (const b of leg.standings) {
                      if (a.total > b.total && b.place > 0) {
                        expect(a.place, `${label}: junk ${a.teamId} scored more but ranks worse`)
                          .toBeLessThanOrEqual(b.place);
                      }
                    }
                  }
                  continue;
                }
                const played = leg.standings.filter((s) => s.thru > 0);
                if (played.length < 2) continue;
                const holeMatch = played.every((s) => s.holesWon !== undefined);

                // In hole-match, recount the holes won FROM THE PER-HOLE GRID rather than
                // trusting standings.holesWon — that field is produced by the very code under
                // test, and a mutation ignoring the score basis survived reading it back.
                const legHoleNumbers = leg.leg === 'front' ? holes.filter((h) => h <= 9)
                  : leg.leg === 'back' ? holes.filter((h) => h > 9) : holes;
                const holesWonByOracle = (teamId: string, oppId: string) => {
                  let won = 0;
                  for (const hs of r.holeScores) {
                    if (!legHoleNumbers.includes(hs.holeNumber)) continue;
                    const mine = hs.teamScores[teamId];
                    const theirs = hs.teamScores[oppId];
                    if (mine == null || theirs == null) continue;
                    // More points wins under Stableford; fewer strokes otherwise.
                    if (basis === 'stableford' ? mine > theirs : mine < theirs) won++;
                  }
                  return won;
                };

                for (const a of played) {
                  for (const b of played) {
                    if (a.teamId === b.teamId) continue;
                    // Only compare teams through the same number of holes; a team thru 9 vs
                    // one thru 18 is what toPar normalization is for, tested separately.
                    if (a.thru !== b.thru) continue;

                    const aBetter = holeMatch
                      ? holesWonByOracle(a.teamId, b.teamId) > holesWonByOracle(b.teamId, a.teamId)
                      : basis === 'stableford' ? a.total > b.total : a.total < b.total;

                    if (aBetter) {
                      expect(a.place, `${label}: ${leg.leg} ${a.teamId} played better but ranks worse`)
                        .toBeLessThan(b.place);
                      // And the better team must not be paid LESS out of the same sub-pot.
                      expect(a.payout, `${label}: ${leg.leg} ${a.teamId} played better but paid less`)
                        .toBeGreaterThanOrEqual(b.payout);
                    }
                  }
                }
              }

              // Whoever settles up best overall must have out-played whoever settles worst,
              // on the leg the pot mostly rides on. Catches a direction flip that somehow
              // kept every leg self-consistent.
              if (moneyMode === 'pot') {
                const overall = r.legs.find((l) => l.leg === 'overall')!;
                const allThru = overall.standings.every((s) => s.thru === overall.standings[0].thru);
                if (allThru && overall.standings[0].thru > 0) {
                  const byMoney = [...r.payouts].sort((x, y) => y.net - x.net);
                  const scoreOf = (teamId: string) =>
                    overall.standings.find((s) => s.teamId === teamId)!.total;
                  const bestPaid = scoreOf(byMoney[0].teamId);
                  const worstPaid = scoreOf(byMoney[byMoney.length - 1].teamId);
                  if (byMoney[0].net !== byMoney[byMoney.length - 1].net) {
                    // Junk can outweigh a score leg, so only assert when scores differ AND
                    // the money differs: the top earner must not have the worse score.
                    if (bestPaid !== worstPaid) {
                      const topOutscored = basis === 'stableford'
                        ? bestPaid > worstPaid
                        : bestPaid < worstPaid;
                      expect(topOutscored, `${label}: top earner scored worse (${bestPaid} vs ${worstPaid})`).toBe(true);
                    }
                  }
                }
              }

              // MATCH mode: each leg pays a fixed amount to its winner, so the money is a
              // direct readout of who the engine thinks won. Check it against the oracle
              // rather than against the engine's own metric — reading `toPar` here instead of
              // `rankMetric` is exactly the bug that paid the 36-point team, and it survived
              // every check that trusted the engine's numbers.
              if (moneyMode === 'match' && legScoring === 'stroke') {
                for (const leg of r.legs) {
                  if (leg.leg === 'junk') continue;
                  const played = leg.standings.filter((s) => s.thru > 0);
                  if (played.length !== 2 || played[0].thru !== played[1].thru) continue;
                  const [x, y] = played;
                  if (x.total === y.total) continue;   // a push pays nobody
                  const xWon = basis === 'stableford' ? x.total > y.total : x.total < y.total;
                  const winner = xWon ? x : y;
                  const loser = xWon ? y : x;
                  // The leg amount is per player; compare the per-person leg component.
                  const legKey = leg.leg as 'front' | 'back' | 'overall';
                  const payOf = (teamId: string) =>
                    r.payouts.find((p) => p.teamId === teamId)![legKey];
                  expect(payOf(winner.teamId), `${label}: ${leg.leg} winner not paid`)
                    .toBeGreaterThan(payOf(loser.teamId));
                }
              }
            });
          }
          }
        }
      }
    }
  }
});

// --- 4. pool robustness against awkward settings --------------------------

// The thru-count normalization, across EVERY format. `toPar` is a CUMULATIVE differential —
// exactly like a real leaderboard's "-5 thru 12" — so playing at the same RATE for different
// numbers of holes legitimately gives different figures. What must hold is the zero point:
// a team playing to expectation sits at 0 whatever it has completed.
//
// That's precisely where the hard-coded "two balls per hole" hid. Measuring a one-ball format
// against 2 x par made an even-par team thru 18 read -72 and an even-par team thru 9 read -36,
// so the leg ranked on holes played rather than on how anyone played. Both must be 0.
describe('classic pool: playing to expectation reads as ZERO at any thru count', () => {
  for (const opt of TEAM_FORMAT_OPTIONS) {
    for (const basis of ['stroke', 'stableford'] as ScoreBasis[]) {
      it(`${opt.format}/${basis}: even-par thru 9 ties even-par thru 18`, () => {
        const game = makeGame({
          teamCount: 2, indexes: Array(8).fill(0), entryPerPlayer: 25,
          ...persistedTeamScoring(opt.format, basis),
        });
        // Scratch players, everyone exactly par. Team 2 is only at the turn.
        const round = (playerIds: string[], holes: number[]) =>
          playerIds.flatMap((pid) => scoresFor(pid, holes.map((h) => TEST_PARS[h - 1]), holes));
        const r = computePoolResult(game, new Map([
          ['m1', round(game.teams[0].playerIds, allEighteen())],
          ['m2', round(game.teams[1].playerIds, frontNine())],
        ]));
        const overall = r.legs.find((l) => l.leg === 'overall')!;
        const [a, b] = overall.standings;
        const label = `${opt.format}/${basis}`;
        expect(a.thru, label).not.toBe(b.thru);            // genuinely different progress
        // Playing to expectation is the zero point under both bases (par, or 2 points a ball).
        expect(a.toPar, `${label}: even par thru ${a.thru} isn't zero`).toBe(0);
        expect(b.toPar, `${label}: even par thru ${b.thru} isn't zero`).toBe(0);
        expect(a.rankMetric, label).toBe(b.rankMetric);
        for (const st of overall.standings) expect(st.place, label).toBe(1);
        expect(r.payouts.reduce((s, p) => s + p.net, 0), label).toBeCloseTo(0, 6);
      });
    }
  }
});

describe('classic pool: awkward but legal settings', () => {
  const BASES: ScoreBasis[] = ['stroke', 'stableford'];

  for (const basis of BASES) {
    it(`${basis}: a THREESOME (one team short a player)`, () => {
      // Real games do this constantly — someone drops out. A two-ball format still needs
      // two scores; a combined format's ball count must follow the actual roster.
      const game = makeGame({
        players: makePlayers([4, 10, 16, 8, 12, 20, 24]),
        teams: [
          { id: 't1', name: 'Team 1', playerIds: ['p1', 'p2', 'p3'], matchupId: 'm1' },
          { id: 't2', name: 'Team 2', playerIds: ['p4', 'p5', 'p6', 'p7'], matchupId: 'm2' },
        ],
        entryPerPlayer: 20,
        ...persistedTeamScoring('combined', basis),
      });
      const r = computePoolResult(game, new Map([
        ['m1', variedRound(['p1', 'p2', 'p3'])],
        ['m2', variedRound(['p4', 'p5', 'p6', 'p7'])],
      ]));
      expectAllFinite(r, `threesome/${basis}`);
      expect(r.payouts.reduce((s, p) => s + p.net, 0)).toBeCloseTo(0, 6);
    });

    it(`${basis}: one team hasn't teed off yet`, () => {
      const game = makeGame({
        teamCount: 2, indexes: Array(8).fill(9), entryPerPlayer: 25,
        ...persistedTeamScoring('best-ball', basis),
      });
      const r = computePoolResult(game, new Map([['m1', variedRound(['p1', 'p2', 'p3', 'p4'])]]));
      expectAllFinite(r, `unstarted/${basis}`);
      expect(r.payouts.reduce((s, p) => s + p.net, 0)).toBeCloseTo(0, 6);
    });

    it(`${basis}: zero buy-in pays nobody anything`, () => {
      const game = makeGame({
        teamCount: 2, indexes: Array(8).fill(0), entryPerPlayer: 0,
        ...persistedTeamScoring('two-best-net', basis),
      });
      const r = computePoolResult(game, new Map([
        ['m1', variedRound(['p1', 'p2', 'p3', 'p4'])],
        ['m2', variedRound(['p5', 'p6', 'p7', 'p8'])],
      ]));
      expectAllFinite(r, `zero-pot/${basis}`);
      for (const p of r.payouts) expect(p.net).toBeCloseTo(0, 6);
    });

    it(`${basis}: both 9-hole handicap bases`, () => {
      for (const nineHandicapBasis of ['18', '9'] as const) {
        const game = makeGame({
          teamCount: 2, indexes: [2, 9, 15, 24, 5, 11, 18, 27], entryPerPlayer: 25,
          holesPlaying: 'back9', nineHandicapBasis,
          ...persistedTeamScoring('scramble', basis),
        });
        const r = computePoolResult(game, new Map(
          game.teams.map((t, ti) => [
            t.matchupId!,
            t.playerIds.flatMap((pid) =>
              scoresFor(pid, backNine().map((h) => TEST_PARS[h - 1] + ti), backNine())),
          ]),
        ));
        expectAllFinite(r, `nine-${nineHandicapBasis}/${basis}`);
        expect(r.payouts.reduce((s, p) => s + p.net, 0)).toBeCloseTo(0, 6);
      }
    });

    it(`${basis}: every stroke method and handicap basis`, () => {
      for (const strokeMethod of ['full', 'off-the-low'] as const) {
        for (const handicapBasis of ['course', 'index'] as const) {
          for (const handicapAllowance of [0, 85, 100]) {
            const game = makeGame({
              teamCount: 2, indexes: [0, 7, 14, 21, 3, 10, 17, 28], entryPerPlayer: 25,
              strokeMethod, handicapBasis, handicapAllowance,
              ...persistedTeamScoring('net-and-gross', basis),
            });
            const r = computePoolResult(game, new Map([
              ['m1', variedRound(['p1', 'p2', 'p3', 'p4'])],
              ['m2', variedRound(['p5', 'p6', 'p7', 'p8'])],
            ]));
            const label = `${strokeMethod}/${handicapBasis}/${handicapAllowance}%/${basis}`;
            expectAllFinite(r, label);
            expect(r.payouts.reduce((s, p) => s + p.net, 0), label).toBeCloseTo(0, 6);
          }
        }
      }
    });

    it(`${basis}: match mode with STROKE leg scoring as well as holes`, () => {
      for (const scoring of ['stroke', 'holes'] as const) {
        const game = makeGame({
          teamCount: 2, indexes: [1, 8, 15, 22, 4, 11, 18, 25],
          moneyMode: 'match',
          matchConfig: {
            legDollars: { front: 10, back: 10, overall: 20 },
            junkPerPoint: 5, scoring,
            pointsPerHole: { win: 1, tie: 0.5, loss: 0 },
          },
          ...persistedTeamScoring('best-ball', basis),
        });
        const r = computePoolResult(game, new Map([
          ['m1', variedRound(['p1', 'p2', 'p3', 'p4'])],
          ['m2', variedRound(['p5', 'p6', 'p7', 'p8'])],
        ]));
        expectAllFinite(r, `match-${scoring}/${basis}`);
        expect(r.payouts.reduce((s, p) => s + p.net, 0)).toBeCloseTo(0, 6);
      }
    });
  }

  it('a pool with EIGHT foursomes still settles (a real club outing)', () => {
    for (const basis of BASES) {
      const game = makeGame({
        teamCount: 8, indexes: Array.from({ length: 32 }, (_, i) => (i * 2) % 30),
        entryPerPlayer: 20, positionSplit: [50, 30, 20],
        ...persistedTeamScoring('scramble', basis),
      });
      const r = computePoolResult(game, new Map(
        game.teams.map((t, ti) => [
          t.matchupId!,
          t.playerIds.flatMap((pid) =>
            scoresFor(pid, allEighteen().map((h) => TEST_PARS[h - 1] + (ti % 4) - 1))),
        ]),
      ));
      expectAllFinite(r, `8-teams/${basis}`);
      expect(r.payouts.reduce((s, p) => s + p.net, 0)).toBeCloseTo(0, 6);
      expect(r.payouts).toHaveLength(8);
    }
  });
});

// --- 5. the persistence rule holds across the whole matrix -----------------

describe('a legacy-equivalent choice never opts into the new code path', () => {
  it('every (format, basis) pair stores the expected shape', () => {
    for (const opt of TEAM_FORMAT_OPTIONS) {
      for (const basis of ['stroke', 'stableford'] as ScoreBasis[]) {
        const saved = persistedTeamScoring(opt.format, basis) as Partial<PoolGame>;
        const shouldBeLegacy = opt.legacyEquivalent !== null && basis === 'stroke';
        expect(saved.teamFormat === undefined, `${opt.format}/${basis}`).toBe(shouldBeLegacy);
      }
    }
  });

  it('and a legacy-shaped game computes IDENTICALLY to naming the format explicitly', () => {
    // The equivalence that makes the whole design safe: choosing "two best net / strokes"
    // in the picker must produce the same money as the pre-F-006 code, which the golden
    // snapshots pin. Here: legacy storage vs explicit teamFormat, same numbers.
    for (const opt of TEAM_FORMAT_OPTIONS.filter((o) => o.legacyEquivalent)) {
      const base = {
        teamCount: 2, indexes: [2, 9, 15, 24, 5, 11, 18, 27], entryPerPlayer: 25,
        strokeMethod: 'off-the-low' as const,
      };
      const scores = new Map([
        ['m1', variedRound(['p1', 'p2', 'p3', 'p4'])],
        ['m2', variedRound(['p5', 'p6', 'p7', 'p8'])],
      ]);
      const legacy = computePoolResult(makeGame({ ...base, ballSelection: opt.legacyEquivalent! }), scores);
      const explicit = computePoolResult(
        makeGame({ ...base, ballSelection: opt.legacyEquivalent!, teamFormat: opt.format, teamScoreBasis: 'stroke' }),
        scores,
      );
      expect(explicit.payouts, opt.format).toEqual(legacy.payouts);
      expect(explicit.holeScores, opt.format).toEqual(legacy.holeScores);
      expect(explicit.legs.map((l) => l.standings.map((s) => [s.teamId, s.total, s.place, s.payout])), opt.format)
        .toEqual(legacy.legs.map((l) => l.standings.map((s) => [s.teamId, s.total, s.place, s.payout])));
    }
  });
});
