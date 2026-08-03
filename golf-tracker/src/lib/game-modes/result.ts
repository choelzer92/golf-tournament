import type { GameScore } from '../game-state';
import type { PoolGame, PoolResult } from '../pool-game';
import { computePoolResult } from '../pool-game';
import type { IndividualResult } from './types';
import { getGameMode } from './index';
import { buildGameModeContext } from './context';

// Unified result across both axes, discriminated by `kind`. The leaderboard (and
// any other consumer) branches once: 'individual' → per-player standings;
// 'team' → the classic pool result, byte-identical to today.
export type GameResult = (PoolResult & { kind: 'team' }) | IndividualResult;

// Lives here (not in pool-game.ts) so the registry can import pool-game without a
// cycle. `computePoolResult` and all team math are untouched; a legacy game
// (gameMode undefined, i.e. classic pot/match) always takes the team branch.
// ANY registered mode (individual or team-within-group) routes to its compute.
export function computeGameResult(
  game: PoolGame,
  scoresByMatchup: Map<string, GameScore[]>,
): GameResult {
  const mode = getGameMode(game.gameMode);
  if (mode) {
    return mode.compute(buildGameModeContext(game, scoresByMatchup));
  }
  return { kind: 'team', ...computePoolResult(game, scoresByMatchup) };
}

export function isIndividualGame(game: PoolGame): boolean {
  return getGameMode(game.gameMode)?.category === 'individual';
}

// A single-group game (individual OR 2v2 within-group) — one foursome, one
// device inputs, shared live leaderboard. Used at every UI branch point that
// distinguishes single-group play from the classic multi-foursome pool.
export function isSingleGroupGame(game: PoolGame): boolean {
  const c = getGameMode(game.gameMode)?.category;
  return c === 'individual' || c === 'team-within-group';
}
