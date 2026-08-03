import type { Player, GameScore } from '../game-state';
import type { FormatSetting } from '../formats';
import type { HoleData, WolfHoleDecision } from '../pool-game';

// A game mode's category decides which result axis (and leaderboard) it uses.
//   'team'              — the classic pool: compare foursomes (computePoolResult).
//                         (Documentation value; classic pool has no descriptor.)
//   'individual'        — the players of ONE foursome compete against each other.
//   'team-within-group' — the players of ONE foursome are split into two SIDES
//                         (2v2) that compete head-to-head. Also single-group.
// Both 'individual' and 'team-within-group' produce an IndividualResult and use
// the single-group leaderboard (see isSingleGroupGame).
export type GameCategory = 'team' | 'individual' | 'team-within-group';

// What score entry a mode needs. 'gross' reuses the existing gross-per-player
// scorecard unchanged. 'gross+decisions' additionally needs per-hole decision
// input (e.g. Wolf partner picks) — a LATER phase; no mode here uses it yet.
export type GameInputType = 'gross' | 'gross+decisions';

export type SettingValue = string | number | boolean;
export type SettingsBag = Record<string, SettingValue>;

// A self-describing game. Adding a game = one file exporting one of these +
// registering it in game-modes/index.ts. The wizard and settings editor render
// `settings` generically (the FormatSetting schema, reused verbatim from
// formats.ts), so no game needs a bespoke settings screen.
export interface GameModeDescriptor {
  id: string;                 // registry id, stored on PoolGame.gameMode
  name: string;
  description: string;
  category: GameCategory;
  inputType: GameInputType;
  playersMin: number;         // per group
  playersMax: number;
  settings: FormatSetting[];  // toggleable options, each with a norm default
  compute(ctx: GameModeContext): IndividualResult;  // pure — no I/O
}

// Everything a mode's compute() needs, pre-baked so no game re-derives handicaps.
// strokesOnHole/netOnHole use the SAME stroke math the pool leaderboard trusts
// (getMoneyStrokesOnHole off each player's own-tee stroke index), so a mode's
// nets match the scorecard exactly.
export interface GameModeContext {
  players: Player[];
  holes: HoleData[];
  scores: GameScore[];
  settings: SettingsBag;
  pot: number;                // total buy-in (entryPerPlayer × players), for pot money models
  playingHcap(playerId: string): number;        // rounded whole-stroke playing handicap
  strokesOnHole(playerId: string, hole: HoleData): number;
  grossOnHole(playerId: string, hole: HoleData): number | null;
  netOnHole(playerId: string, hole: HoleData): number | null;
  // Team-within-group games only: the two sides' player-id lists (from
  // game.subTeams, else a balanced default). Undefined for individual games.
  subTeams?: { a: string[]; b: string[] };
  // Raw course handicap (allowance 100, no off-the-low) — the input the USGA
  // team-handicap formulas need (scramble/alt-shot, Phase B). Distinct from
  // playingHcap, which is allowance-adjusted, off-the-low-adjusted, and rounded.
  rawCourseHcap(playerId: string): number;
  // Decision-input games only (Wolf): per-hole decisions from game.wolfDecisions.
  wolfDecisions?: Record<number, WolfHoleDecision>;
}

export interface PlayerStanding {
  playerId: string;
  playerName: string;
  points: number;                 // the game metric (9s pts / quota pts / skins)
  moneyNet: number;               // signed dollars (+ won / − owed); zero-sum across the group
  perHole: (number | null)[];     // metric contribution per hole, aligned to ctx.holes (null = not scored)
  thru: number;                   // holes this player has scored
  place: number;                  // 1-based rank (ties share a place); 0 if unscored
}

// A front/back/overall sub-result for a 2v2 team game (Nassau-style breakdown).
// `label` is "Front 9" / "Back 9" / "Overall 18". `status` is a ready-to-show
// line (e.g. "A 2 UP", "All square", "Side A by 3"). `winner` is which side
// leads that leg ('a'|'b'|null for tied/none).
export interface TeamLegLine {
  key: 'front' | 'back' | 'overall';
  label: string;
  status: string;
  winner: 'a' | 'b' | null;
  thru: number;
}

// The individual-game result. Discriminated by `kind` so the leaderboard can
// branch once against the team PoolResult.
export interface IndividualResult {
  kind: 'individual';
  gameModeId: string;
  metricLabel: string;            // column header for `points`, e.g. "pts" | "skins"
  standings: PlayerStanding[];    // sorted best-first
  pot: number;
  thruHole: number;
  moneyModel: 'per-point' | 'pot';
  // 2v2 team games only: front/back/overall breakdown for the leaderboard.
  teamLegs?: TeamLegLine[];
  sideNames?: { a: string; b: string };
}

// --- shared settlement helpers (kept here so every mode reuses one impl) -----

// Rank standings by points (higher is better) and assign 1-based places with
// tie-sharing. Unscored players (thru 0) sink to place 0. Mutates+returns.
export function rankByPointsDesc(standings: PlayerStanding[]): PlayerStanding[] {
  standings.sort((a, b) => {
    if (a.thru === 0 && b.thru === 0) return 0;
    if (a.thru === 0) return 1;
    if (b.thru === 0) return -1;
    return b.points - a.points;
  });
  let place = 1;
  for (let i = 0; i < standings.length; i++) {
    const s = standings[i];
    if (s.thru === 0) { s.place = 0; continue; }
    if (i > 0 && standings[i - 1].thru > 0 && standings[i - 1].points !== s.points) place = i + 1;
    s.place = place;
  }
  return standings;
}

// Zero-sum "per point" money: each player settles (points − field average) ×
// dollarsPerPoint. Sums to ~0 across the group. Mutates moneyNet in place.
export function settlePerPoint(standings: PlayerStanding[], dollarsPerPoint: number): void {
  const played = standings.filter((s) => s.thru > 0);
  if (played.length === 0) return;
  const avg = played.reduce((sum, s) => sum + s.points, 0) / played.length;
  for (const s of standings) {
    s.moneyNet = s.thru > 0 ? (s.points - avg) * dollarsPerPoint : 0;
  }
}

// Pot money: split the whole pot among the top finishers by place (winner-take-all
// at place 1; ties at the top split it evenly). Everyone paid, minus their own
// entry, nets zero-sum. Mutates moneyNet in place.
export function settlePot(standings: PlayerStanding[], pot: number, entryPerPlayer: number): void {
  const played = standings.filter((s) => s.thru > 0);
  for (const s of standings) s.moneyNet = -entryPerPlayer; // everyone paid in
  if (played.length === 0 || pot <= 0) { for (const s of standings) s.moneyNet = 0; return; }
  const winners = played.filter((s) => s.place === 1);
  const share = pot / winners.length;
  for (const w of winners) w.moneyNet += share;
}
