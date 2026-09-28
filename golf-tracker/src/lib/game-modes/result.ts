import type { GameScore } from '../game-state';
import type { PoolGame, PoolGameListItem, PoolResult } from '../pool-game';
import { computePoolResult } from '../pool-game';
import type { IndividualResult } from './types';
import { getGameMode } from './index';
import { boolSetting, numberSetting } from './settings';
import { DEFAULT_JUNK_VALUES } from '../pool-game';
import { buildGameModeContext } from './context';
import { gameKindLabelFrom } from '../game-structure';

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

// Does this game pay closest-to-pin? The ONE predicate every CTP surface (hub editor, scorer's
// par-3 picker) reads, so a control never shows for a game whose engine won't pay it (F-090).
// Classic pool: `junkValues.ctp` (absent = pre-setting game that played the classic defaults).
// Mode game (Phase 3 step 2): junk on and `junkCtp` > 0.
export function gameCountsCtp(game: PoolGame): boolean {
  const mode = getGameMode(game.gameMode);
  if (!mode) return (game.junkValues ?? DEFAULT_JUNK_VALUES).ctp > 0;
  const bag = game.modeSettings ?? {};
  return boolSetting(mode.settings, bag, 'junkEnabled') && numberSetting(mode.settings, bag, 'junkCtp') > 0;
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

// The game-list card subtitle — the same label the hub and leaderboard headers print
// (F-061, Phase 2): "2 teams of 4 · pot", "4 pairs · $/point · 2 groups", "Skins · 4 players".
export function gameListSubtitle(item: Pick<PoolGameListItem, 'gameMode' | 'playerCount' | 'groupSizes' | 'sideSizes' | 'money'>): string {
  return gameKindLabelFrom(item);
}
