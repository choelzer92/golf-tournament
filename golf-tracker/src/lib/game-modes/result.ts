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
// (gameMode undefined) always takes the team branch.
export function computeGameResult(
  game: PoolGame,
  scoresByMatchup: Map<string, GameScore[]>,
): GameResult {
  const mode = getGameMode(game.gameMode);
  if (mode && mode.category === 'individual') {
    return mode.compute(buildGameModeContext(game, scoresByMatchup));
  }
  return { kind: 'team', ...computePoolResult(game, scoresByMatchup) };
}

export function isIndividualGame(game: PoolGame): boolean {
  return getGameMode(game.gameMode)?.category === 'individual';
}
