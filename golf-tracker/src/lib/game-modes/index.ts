// Pluggable pool game-mode registry. Adding a game = create a file exporting a
// GameModeDescriptor and add it to GAME_MODES below. The wizard, settings editor,
// and leaderboard all read the descriptor generically — no switch statements.
import type { GameModeDescriptor } from './types';
import { nines } from './nines';
import { skins } from './skins';
import { quota } from './quota';

export type {
  GameCategory,
  GameInputType,
  GameModeDescriptor,
  GameModeContext,
  IndividualResult,
  PlayerStanding,
  SettingsBag,
  SettingValue,
} from './types';
export { buildGameModeContext } from './context';
export { defaultSettings, settingValue, numberSetting, boolSetting, stringSetting, parseVector } from './settings';

// Registered individual game modes (order = display order in the wizard).
export const GAME_MODES: GameModeDescriptor[] = [nines, skins, quota];

export function getGameMode(id: string | undefined): GameModeDescriptor | undefined {
  return id ? GAME_MODES.find((m) => m.id === id) : undefined;
}
