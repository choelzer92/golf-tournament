// §5.by: a gross game is a 0% allowance, on ANY format. The oracle is independent of how strokes
// are computed: a gross game must score exactly like the same game in which every player's
// handicap is 0. Plus players and a 36 are in the field, so a stroke leaking through anywhere
// (an allowance that skips a path, off the low, a one-ball team handicap) moves a number.

import { describe, expect, it } from 'vitest';
import { GAME_MODES, defaultSettings } from '@/lib/game-modes';
import { computeGameResult } from '@/lib/game-modes/result';
import { computePoolResult, type PoolGame } from '@/lib/pool-game';
import { handicapSummary } from '@/lib/game-modes/summary';
import { TEAM_FORMAT_OPTIONS, persistedTeamScoring } from '@/lib/game-modes/team-scoring';
import { isGross, netAllowance, parseAllowance } from '@/components/net-gross-switch';
import { allEighteen, makeGame, scoresFor, TEST_PARS } from './fixtures';

const INDEXES = [-2.4, 7.1, 18.6, 36];
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const round = (pids: string[], salt = 0) =>
  pids.flatMap((id, i) => scoresFor(id, allEighteen().map((h) => TEST_PARS[h - 1] + ((h * (i + 2) + salt) % 5) - 1), allEighteen()));
const scratchField = (g: PoolGame): PoolGame =>
  ({ ...g, handicapAllowance: 100, strokeMethod: 'full', players: g.players.map((p) => ({ ...p, handicapIndex: 0 })) });

describe('§5.by: Gross (0%) scores like a field of scratch players', () => {
  for (const mode of GAME_MODES) {
    const size = Math.min(4, mode.playersMax);
    for (const strokeMethod of ['full', 'off-the-low'] as const) {
      it(`${mode.id}, ${strokeMethod}`, () => {
        const game = makeGame({
          indexes: INDEXES.slice(0, size), gameMode: mode.id, modeSettings: defaultSettings(mode.settings),
          entryPerPlayer: 20, handicapAllowance: 0, strokeMethod,
          ...(mode.id === 'wolf' ? { wolfOrder: ids(size) } : {}),
          ...(mode.category === 'team-within-group' ? { subTeams: { a: ids(size).slice(0, 2), b: ids(size).slice(2) } } : {}),
        });
        const scores = new Map([['m1', round(ids(size))]]);
        expect(computeGameResult(game, scores)).toEqual(computeGameResult(scratchField(game), scores));
      });
    }
  }

  const teamMode = GAME_MODES.find((m) => m.id === 'team-2v2')!;
  for (const opt of TEAM_FORMAT_OPTIONS) {
    for (const scoring of ['stroke', 'stableford'] as const) {
      it(`team game: ${opt.format} / ${scoring}`, () => {
        const game = makeGame({
          indexes: INDEXES, gameMode: 'team-2v2', entryPerPlayer: 20, handicapAllowance: 0,
          modeSettings: { ...defaultSettings(teamMode.settings), format: opt.format, scoring },
          subTeams: { a: ['p1', 'p2'], b: ['p3', 'p4'] },
        });
        const scores = new Map([['m1', round(ids(4))]]);
        expect(computeGameResult(game, scores)).toEqual(computeGameResult(scratchField(game), scores));
      });
    }
  }

  for (const opt of TEAM_FORMAT_OPTIONS) {
    for (const basis of ['stroke', 'stableford'] as const) {
      it(`classic pool: ${opt.format} / ${basis}`, () => {
        const game = makeGame({
          teamCount: 2, indexes: [...INDEXES, 3.3, 11, -0.8, 24], entryPerPlayer: 25,
          handicapAllowance: 0, ...persistedTeamScoring(opt.format, basis),
        });
        const oneBall = opt.format === 'scramble' || opt.format === 'alternate-shot';
        const scores = new Map(game.teams.map((t, ti) => [
          t.matchupId!,
          oneBall
            ? t.playerIds.flatMap((pid) => scoresFor(pid, allEighteen().map((h) => TEST_PARS[h - 1] + ((h + ti) % 3) - 1), allEighteen()))
            : round(t.playerIds, ti),
        ]));
        expect(computePoolResult(game, scores)).toEqual(computePoolResult(scratchField(game), scores));
      });
    }
  }
});

describe('§5.by: the switch and its text', () => {
  it('a typed 0 is gross; a blank or unreadable box is full handicap (never 0 → 100 again)', () => {
    expect(parseAllowance('0')).toBe(0);
    expect(parseAllowance('85')).toBe(85);
    expect(parseAllowance('')).toBe(100);
    expect(parseAllowance('abc')).toBe(100);
    expect(isGross(0)).toBe(true);
    expect(isGross(100)).toBe(false);
  });

  it('Net goes back to the last net percentage, or full handicap', () => {
    expect(netAllowance(90)).toBe(90);
    expect(netAllowance(null)).toBe(100);
    expect(netAllowance(0)).toBe(100);
  });

  it('a gross game summarizes as "gross", not "full handicap · 0%"', () => {
    expect(handicapSummary({ allowance: 0, strokeMethod: 'off-the-low', handicapBasis: 'index' })).toBe('gross');
    expect(handicapSummary({ allowance: 90, strokeMethod: 'full', handicapBasis: 'course' })).toBe('full handicap · 90%');
  });
});
