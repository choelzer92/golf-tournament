import type { GameScore } from '../game-state';
import type { PoolGame, HoleData } from '../pool-game';
import { getHoleData, buildHcapMap, playerHoleStrokeIndex, getPoolPlayingHandicap, defaultSubTeams } from '../pool-game';
import { getMoneyStrokesOnHole } from '../money-games';
import type { GameModeContext, SettingsBag } from './types';

// Build the compute context for an INDIVIDUAL game from a single foursome's
// scores. Reuses the exact pool handicap/stroke machinery (buildHcapMap +
// per-own-tee stroke index + getMoneyStrokesOnHole) so a mode's nets and
// strokes match the scorecard and the team leaderboard.
//
// The scores passed in are this one foursome's rows (game_scores keyed by the
// team's matchupId). Individual games are single-group, so we take the FIRST
// team's matchup unless a specific one is given.
export function buildGameModeContext(
  game: PoolGame,
  scoresByMatchup: Map<string, GameScore[]>,
  matchupId?: string,
): GameModeContext {
  const holes = getHoleData(game.course);
  const numHoles = holes.length || 18;
  const hcapMap = buildHcapMap(game); // rounded whole strokes when off-the-low; raw otherwise

  const mid = matchupId ?? game.teams[0]?.matchupId;
  const scores = (mid ? scoresByMatchup.get(mid) : undefined) ?? [];

  // Only the players actually in this foursome.
  const teamPlayerIds = new Set(
    (game.teams.find((t) => t.matchupId === mid)?.playerIds) ?? game.players.map((p) => p.id)
  );
  const players = game.players.filter((p) => teamPlayerIds.has(p.id));

  const playerById = new Map(players.map((p) => [p.id, p]));
  const scoreAt = (playerId: string, hole: number): number | null => {
    const s = scores.find((x) => x.playerId === playerId && x.hole === hole);
    return s ? s.grossScore : null;
  };

  const playingHcap = (playerId: string): number => Math.round(hcapMap.get(playerId) ?? 0);

  const strokesOnHole = (playerId: string, hole: HoleData): number => {
    const player = playerById.get(playerId);
    if (!player) return 0;
    const idx = playerHoleStrokeIndex(player, game.course, hole.number, hole.handicap);
    return getMoneyStrokesOnHole(hcapMap.get(playerId) ?? 0, idx, numHoles);
  };

  const grossOnHole = (playerId: string, hole: HoleData): number | null => scoreAt(playerId, hole.number);

  const netOnHole = (playerId: string, hole: HoleData): number | null => {
    const g = scoreAt(playerId, hole.number);
    if (g === null) return null;
    return g - strokesOnHole(playerId, hole);
  };

  const settings: SettingsBag = game.modeSettings ?? {};
  const pot = players.length * (game.entryPerPlayer || 0);

  // Team-within-group: the two sides (stored, else a balanced default).
  const subTeams = game.subTeams
    ?? defaultSubTeams(players.map((p) => p.id), players, game.course, game.handicapAllowance, game.handicapBasis);

  // Raw course handicap (allowance 100, no off-the-low) for the USGA team formulas.
  const rawCourseHcap = (playerId: string): number => {
    const p = playerById.get(playerId);
    return p ? getPoolPlayingHandicap(p, game.course, 100, game.handicapBasis) : 0;
  };

  // Wolf rotation order: keep only ids actually in this foursome (guards against
  // stale ids); undefined when unset so wolf.ts falls back to ctx.players order.
  const playerIdSet = new Set(players.map((p) => p.id));
  const wolfOrder = game.wolfOrder?.filter((id) => playerIdSet.has(id));

  return { players, holes, scores, settings, pot, playingHcap, strokesOnHole, grossOnHole, netOnHole, subTeams, rawCourseHcap, wolfDecisions: game.wolfDecisions, wolfOrder: wolfOrder && wolfOrder.length > 0 ? wolfOrder : undefined };
}
