// §5.bv — the team engine has no field cap. Craig 2026-09-28: "what if there are 32 people?"
// Thirty-two players are EIGHT tee groups (matchups), and the teams span them: partners, and
// whole teams, sit in different foursomes. The engine reads every matchup and settles any
// number of teams, so every money model must stay zero-sum here exactly as it does at 4.

import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import type { IndividualResult } from '@/lib/game-modes/types';
import type { GameSide } from '@/lib/game-modes/sides';
import { routeContainer } from '@/lib/game-structure';
import { computePoolResult, type PoolGame } from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import { makeGame, scoresFor, TEST_PARS } from './fixtures';

const MONEY_MODELS = ['legs', 'per-hole', 'per-point', 'pot'] as const;
const FORMATS = ['best-ball', 'combined'] as const;

// 32 players in 8 foursomes: p1–p4 are group 1 (m1), p5–p8 group 2 (m2), …
const INDEXES = Array.from({ length: 32 }, (_, i) => (i * 7) % 29);
const ids = INDEXES.map((_, i) => `p${i + 1}`);
const groupOf = (i: number) => Math.floor(i / 4);

// A deterministic spread of cards so teams really differ, hole by hole. Mod 5, not 4: players
// 8, 16 and 24 apart (the partners below) must NOT hold identical cards, or best ball is blind.
const card = (i: number) => TEST_PARS.map((par, h) => par + ((i * 3 + h * 7) % 5) - 2);

function scoresByMatchup(playedGroups = 8, holesPlayed = 18): Map<string, GameScore[]> {
  const m = new Map<string, GameScore[]>();
  ids.forEach((id, i) => {
    const g = groupOf(i);
    if (g >= playedGroups) return;
    const rows = scoresFor(id, card(i)).filter((s) => s.hole <= holesPlayed);
    m.set(`m${g + 1}`, [...(m.get(`m${g + 1}`) ?? []), ...rows]);
  });
  return m;
}

function teamGame(sides: GameSide[], settings: Record<string, string | number | boolean>): PoolGame {
  return makeGame({
    gameMode: 'team-2v2',
    indexes: INDEXES,
    teamCount: 8,        // eight tee groups of four
    sides,
    modeSettings: {
      scoring: 'stroke', result: 'total',
      dollarsPerHole: 2, dollarsPerPoint: 1,
      legFront: 10, legBack: 10, legOverall: 20,
      sideBuyIn: 20, potSplit: '100',
      ...settings,
    },
  });
}

function run(game: PoolGame, scores: Map<string, GameScore[]>): IndividualResult {
  return getGameMode('team-2v2')!.compute(buildGameModeContext(game, scores));
}
const net = (r: IndividualResult) => r.standings.reduce((s, x) => s + x.moneyNet, 0);

// Sixteen pairs, each partner in a DIFFERENT foursome: p1 with p17, p2 with p18, …
const sixteenPairs: GameSide[] = Array.from({ length: 16 }, (_, i) => ({
  id: `s${i + 1}`, playerIds: [ids[i], ids[i + 16]],
}));
// Eight teams of four, one player from each of four different foursomes.
const eightFours: GameSide[] = Array.from({ length: 8 }, (_, i) => ({
  id: `s${i + 1}`, playerIds: [ids[i], ids[i + 8], ids[i + 16], ids[i + 24]],
}));

describe('§5.bv: 32 players, 8 foursomes, teams spanning groups', () => {
  it('routes to the team engine — no field cap refuses it', () => {
    const base = { teamsTogether: false, aligned: false, bonuses: {}, scoring: { format: 'best-ball' as const, basis: 'stroke' as const, compareBy: 'total' as const } };
    for (const sizes of [Array(16).fill(2), Array(8).fill(4), Array(32).fill(1)]) {
      for (const moneyModel of ['legs', 'per-hole', 'per-point'] as const) {
        expect(routeContainer({ ...base, structure: { kind: 'teams', teamSizes: sizes }, moneyModel } as never).container).toBe('sides');
      }
    }
  });

  for (const [label, sides] of [['16 pairs', sixteenPairs], ['8 teams of 4', eightFours]] as const) {
    for (const format of FORMATS) {
      for (const moneyModel of MONEY_MODELS) {
        it(`${label} / ${format} / ${moneyModel}: every team is scored and the money is zero-sum`, () => {
          const r = run(teamGame(sides, { format, moneyModel }), scoresByMatchup());
          // Every team appears, with its whole membership — none dropped past the old 6 or 8.
          expect(r.standings).toHaveLength(sides.length);
          // Every tee group's cards reach the engine, not just the first few: the result with
          // only seven groups in differs from the full field's.
          const seven = run(teamGame(sides, { format, moneyModel }), scoresByMatchup(7));
          expect(JSON.stringify(seven.standings)).not.toBe(JSON.stringify(r.standings));
          expect(net(r)).toBeCloseTo(0, 6);
          // Real money moved: this is a game, not a vacuous all-zero pass.
          expect(r.standings.some((s) => Math.abs(s.moneyNet) > 0)).toBe(true);
        });
      }
    }
  }

  it('mid-round, with only the early tee groups through 9, is still zero-sum', () => {
    for (const moneyModel of MONEY_MODELS) {
      const r = run(teamGame(sixteenPairs, { format: 'best-ball', moneyModel }), scoresByMatchup(3, 9));
      expect(net(r), moneyModel).toBeCloseTo(0, 6);
    }
  });

  it('the classic pool takes eight foursomes too (pot, zero-sum)', () => {
    const game = makeGame({ indexes: INDEXES, teamCount: 8 });
    const r = computePoolResult(game, scoresByMatchup());
    expect(game.teams).toHaveLength(8);
    expect(r.payouts).toHaveLength(8);
    expect(r.payouts.reduce((s, p) => s + p.net, 0)).toBeCloseTo(0, 6);
    expect(r.payouts.some((p) => p.net > 0)).toBe(true);
  });
});
