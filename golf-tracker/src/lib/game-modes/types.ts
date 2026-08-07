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
  // Wolf only: the rotation order (player ids). Absent = use ctx.players order.
  // Kept separate from ctx.players so it drives ONLY who's the default Wolf each
  // hole, not the standings display order or the "all four scored" check.
  wolfOrder?: string[];
}

export interface PlayerStanding {
  playerId: string;
  playerName: string;
  points: number;                 // the game metric (9s pts / quota pts / skins)
  moneyNet: number;               // signed dollars (+ won / − owed); zero-sum across the group
  perHole: (number | null)[];     // metric contribution per hole, aligned to ctx.holes (null = not scored)
  thru: number;                   // holes this player has scored
  place: number;                  // 1-based rank (ties share a place); 0 if unscored
  holesWon?: number[];            // Wolf only: hole numbers this player earned points on (for the expandable standings)
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

// One hole's matchup story for the Wolf leaderboard breakdown. Wolf's whole
// interest is per-hole (who was Wolf, their call, both sides' best net, who
// won), so compute() surfaces it instead of only the running points. Sides are
// always BEST NET (lower net of the side's members), never combined.
export interface WolfHoleLine {
  holeNumber: number;
  wolfName: string;                        // the Wolf's display name
  mode: 'partner' | 'lone' | 'blind';
  partnerName: string | null;              // partner's name when mode === 'partner'
  multiplier: number;                       // 1 / lone× / blind×
  wolfSideNames: string[];                  // display names on the Wolf's side
  fieldSideNames: string[];                 // display names on the field side
  wolfNet: number | null;                   // Wolf side's best net (null = unscored)
  fieldNet: number | null;                  // field side's best net
  outcome: 'wolf' | 'field' | 'push';       // who won the hole
  pointsEach: number;                        // points each winner earned this hole
  winnerNames: string[];                     // who got the points (may be the whole field)
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
  // Wolf only: per-hole matchup breakdown (Wolf, call, side nets, winner).
  wolfHoles?: WolfHoleLine[];
  // Nassau-pot money model only: the front/back/total segment payout breakdown
  // for the leaderboard. Present when moneyModel is 'pot' and the game used a
  // Nassau (buy-in, split-by-segment) settlement.
  nassauLegs?: NassauLegLine[];
  // Birdie/eagle bonus breakdown, when the junk layer is on (any mode). Already
  // settled into standings.moneyNet — this is for display only.
  junkLines?: JunkLine[];
}

// One player's birdie/eagle bonus tally. Mirrors settings.ts's JunkLine; declared
// there because that's where the settlement lives.
export interface JunkLine {
  playerId: string;
  playerName: string;
  birdies: number;
  eagles: number;
  albatrosses: number;
  dollars: number;
}

// One Nassau segment's pot result for the leaderboard. `value` a winner needed
// to lead is captured in the winnerNames + amount; `thru` gates the display so
// a not-yet-started segment (e.g. the back 9 early in the round) reads "TBD".
export interface NassauLegLine {
  key: 'front' | 'back' | 'total';
  label: string;                 // "Front 9" / "Back 9" / "Total"
  pot: number;                   // dollars in this segment's pot
  winnerNames: string[];         // leader(s); split the pot when tied
  thru: number;                  // holes scored in this segment (0 = not started)
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

// Per-player dollar amounts for each Nassau segment. Every player antes the sum
// of the amounts for the segments in play; each segment's pot = amount × players.
// Amounts can differ (e.g. 5/5/20 to make the Total the big prize). For a
// total-only Nassau, front/back are 0 and only `total` is contested.
export interface NassauAmounts {
  front: number;
  back: number;
  total: number;
}

// Nassau-pot money: everyone antes the segment amounts they're playing; each
// segment's pot (amount × players) goes to whoever leads that segment; ties
// split it. moneyNet = winnings − ante, zero-sum once scored. Returns the
// per-segment leg lines for the leaderboard and mutates moneyNet in place.
// `higherIsBetter` false for lower-is-better games (Low Total). A segment with a
// $0 amount is skipped entirely (that's how total-only drops front/back).
//
// A segment ranks by each player's summed `perHole` contribution over its holes;
// only players who scored at least one hole in the segment are eligible for it.
export function settleNassau(
  standings: PlayerStanding[],
  amounts: NassauAmounts,
  higherIsBetter: boolean = true,
): NassauLegLine[] {
  const n = standings.length;
  const allSegs: { key: 'front' | 'back' | 'total'; label: string; amount: number; inSeg: (holeIdx1: number) => boolean }[] = [
    { key: 'front', label: 'Front 9', amount: amounts.front, inSeg: (h) => h <= 9 },
    { key: 'back', label: 'Back 9', amount: amounts.back, inSeg: (h) => h > 9 },
    { key: 'total', label: 'Total', amount: amounts.total, inSeg: () => true },
  ];
  // Only segments with a positive stake are contested.
  const segDefs = allSegs.filter((s) => s.amount > 0);

  // Everyone antes the sum of the segment amounts they're playing.
  const antePerPlayer = segDefs.reduce((sum, s) => sum + s.amount, 0);
  for (const s of standings) s.moneyNet = -antePerPlayer;

  const legs: NassauLegLine[] = [];
  for (const seg of segDefs) {
    const pot = seg.amount * n;
    // Each player's segment value + holes scored within this segment. The TOTAL
    // segment ranks by the standings metric `s.points` (identical to the summed
    // perHole for every game except Quota, whose metric is points-vs-quota — this
    // keeps the total winner consistent with the standings). Front/Back rank by
    // the summed per-hole contribution over that nine.
    const rows = standings.map((s) => {
      let sum = 0;
      let thru = 0;
      s.perHole.forEach((v, idx) => {
        // perHole is aligned to ctx.holes; idx+1 is the 1-based hole POSITION.
        // (Individual games play 18 holes 1..18, so position == hole number.)
        if (v !== null && seg.inSeg(idx + 1)) { sum += v; thru += 1; }
      });
      const value = seg.key === 'total' ? s.points : sum;
      return { s, value, thru };
    });
    const eligible = rows.filter((r) => r.thru > 0);
    const segThru = eligible.reduce((m, r) => Math.max(m, r.thru), 0);
    // A segment nobody has played yet is a dead heat: everyone's tied, so the pot
    // splits evenly — which returns each player's ante for that segment (net zero
    // on it). This keeps the WHOLE board zero-sum at every moment (an un-started
    // back 9 doesn't leave its pot undistributed). Once holes come in, the
    // leader(s) among those who've played take it (ties still split).
    const winners = eligible.length === 0 ? rows : (() => {
      const best = higherIsBetter
        ? Math.max(...eligible.map((r) => r.value))
        : Math.min(...eligible.map((r) => r.value));
      return eligible.filter((r) => r.value === best);
    })();
    const share = pot / winners.length;
    for (const w of winners) w.s.moneyNet += share;
    legs.push({ key: seg.key, label: seg.label, pot, winnerNames: winners.map((w) => w.s.playerName), thru: segThru });
  }
  return legs;
}
