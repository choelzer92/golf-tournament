import type { GameScore } from '../game-state';
import type { PoolGame, HoleData } from '../pool-game';
import { getGameHoles, numHolesForStrokes, buildHcapMap, playerHoleStrokeIndexForGame, gameNineBasis, getPoolPlayingHandicap, defaultSubTeams } from '../pool-game';
import { getMoneyStrokesOnHole } from '../money-games';
import type { GameModeContext, SettingsBag } from './types';
import { fromLegacySubTeams, sidesOfGame } from './sides';

// Build the compute context for an INDIVIDUAL game from its players' scores.
// Reuses the exact pool handicap/stroke machinery (buildHcapMap + per-own-tee
// stroke index + getMoneyStrokesOnHole) so a mode's nets and strokes match the
// scorecard and the team leaderboard.
//
// PLAYING GROUPS vs SIDES (F-019, DECISIONS.md §5.an). A side game has two
// independent groupings and this function must not confuse them:
//
//   playing group — who walks together: one tee slot, one scorecard, one matchupId
//   side          — who your money is with
//
// They are independent: your partner may be in the other foursome. So the context
// spans EVERY playing group — the union of all their scores and players — while the
// sides stay the money grouping, exactly as before.
//
// It used to read `game.teams[0].matchupId` and filter to that one team, because a
// side game stored a single team holding everybody. That was invisible at four
// players (one group and the whole field are the same set) and became a MONEY bug at
// eight: four sides settled ±$84 off four players' cards, each side's group-2 partner
// silently missing. See e2e/screenshots/f019-before-leaderboard.png.
//
// `matchupId` still selects ONE group when passed, for a caller that means it (a
// single group's scorecard). Omitting it now means "the whole field", not "group one".
export function buildGameModeContext(
  game: PoolGame,
  scoresByMatchup: Map<string, GameScore[]>,
  matchupId?: string,
): GameModeContext {
  const holes = getGameHoles(game);           // the played nine (or full 18)
  const numHoles = numHolesForStrokes(game);  // stroke-allocation threshold (18 casual / 9 USGA)
  const hcapMap = buildHcapMap(game); // rounded whole strokes when off-the-low; raw otherwise

  // The groups in scope: one when a matchupId is named, otherwise all of them.
  const groups = matchupId
    ? game.teams.filter((t) => t.matchupId === matchupId)
    : game.teams;

  // Every in-scope group's rows, concatenated. Distinct groups hold distinct players,
  // so there is nothing to merge or de-duplicate — a player appears under exactly one
  // matchup. (Scores for a matchup absent from the map are simply not yet loaded.)
  const scoreMatchupIds = matchupId
    ? [matchupId]
    : Array.from(new Set(game.teams.map((t) => t.matchupId)));
  const scores = scoreMatchupIds.flatMap((mid) => scoresByMatchup.get(mid) ?? []);

  // Only the players actually playing — in one of the in-scope groups. With no teams
  // stored at all, fall back to the whole field rather than to nobody.
  const teamPlayerIds = new Set(
    groups.length > 0
      ? groups.flatMap((t) => t.playerIds)
      : game.players.map((p) => p.id)
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
    const idx = playerHoleStrokeIndexForGame(game, player, hole.number, hole.handicap);
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

  // Team-within-group: the sides. Normalized ONCE here, at the read boundary, so no mode has
  // to know which of the two storage shapes a game used (see game-modes/sides.ts).
  const stored = sidesOfGame(game);
  const sides = stored.length > 0
    ? stored
    : fromLegacySubTeams(
        defaultSubTeams(players.map((p) => p.id), players, game.course, game.handicapAllowance, game.handicapBasis),
      );
  // The legacy two-side view, kept populated for consumers not yet migrated. For a 3+ side
  // game it holds only the first two sides and is therefore incomplete — `sides` is complete.
  const subTeams = { a: sides[0]?.playerIds ?? [], b: sides[1]?.playerIds ?? [] };

  // Raw course handicap (allowance 100, no off-the-low) for the USGA team formulas.
  // Respects the 9-hole basis so scramble/alt-shot team handicaps match the nine.
  const nineBasis = gameNineBasis(game);
  const rawCourseHcap = (playerId: string): number => {
    const p = playerById.get(playerId);
    return p ? getPoolPlayingHandicap(p, game.course, 100, game.handicapBasis, nineBasis) : 0;
  };

  // Wolf rotation order: keep only ids actually in this foursome (guards against
  // stale ids); undefined when unset so wolf.ts falls back to ctx.players order.
  const playerIdSet = new Set(players.map((p) => p.id));
  const wolfOrder = game.wolfOrder?.filter((id) => playerIdSet.has(id));

  return { players, holes, scores, settings, pot, playingHcap, strokesOnHole, grossOnHole, netOnHole, subTeams, sides, rawCourseHcap, wolfDecisions: game.wolfDecisions, wolfOrder: wolfOrder && wolfOrder.length > 0 ? wolfOrder : undefined, voidedLegs: game.voidedLegs };
}
