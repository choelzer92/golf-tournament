import type { FormatSetting } from '../formats';
import type { HoleData, PoolGame } from '../pool-game';
import { distributePot, teamHandicapForFormat } from '../pool-game';
import type { Player } from '../game-state';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding, PotSliceLine, TeamLegLine } from './types';
import { boolSetting, numberSetting, parseVector, stringSetting, JUNK_SETTINGS, junkPayout, settleJunkForSides, tallyJunkForSides } from './settings';
import {
  defaultSideLabel, fromLegacySubTeams, settleRoundRobin, settleWinnerTakes, type GameSide,
} from './sides';
import {
  ballsPerHole, evenValueOnHole, isOneBall, teamValueOnHole, type ScoreBasis, type TeamFormat,
} from './team-scoring';

// 2-vs-2 within one foursome. The group's players are split into two SIDES
// (ctx.subTeams). Each hole yields one team score per side by the chosen FORMAT;
// the RESULT toggle decides hole-by-hole (match) vs 18-hole total; the leaderboard
// also breaks the contest into Front 9 / Back 9 / Overall legs; MONEY settles
// head-to-head. Every multi-ball format uses per-player gross entry; scramble/alt-shot
// use one team ball per hole (same gross written to both members on the scorecard)
// plus a team handicap.
//
// HOLE SCORING IS NOT DONE HERE. Since F-072 a side's hole value comes from the shared
// `teamValueOnHole` (team-scoring.ts), the same function the classic pool ranks and pays on.
// This file used to carry its own best-ball / combined / one-ball arithmetic and silently
// scored any OTHER format as best ball (F-069) — which is why the wizard had to grey
// "Best net + best gross" for pairs. One engine, every format, both containers.

// Settings that can only change a payout with THREE OR MORE teams (Phase 3 step 3). Every surface
// that renders the schema hides them for a smaller game, so nobody is asked a question with no effect.
export const MULTI_TEAM_ONLY_KEYS: ReadonlySet<string> = new Set(['legsPayout', 'pointsPayout']);

const SETTINGS: FormatSetting[] = [
  {
    key: 'format', label: 'Team format', type: 'select',
    options: [
      { value: 'best-ball', label: 'Best ball (low net counts)' },
      { value: 'net-and-gross', label: 'Best net + best gross (two balls, two players)' },
      { value: 'two-best-net', label: 'Two best net scores added' },
      { value: 'two-best-gross', label: 'Two best gross scores added' },
      { value: 'combined', label: 'Combined (every score added)' },
      { value: 'scramble', label: 'Scramble (one ball, team handicap)' },
      { value: 'alternate-shot', label: 'Alternate shot (one ball)' },
    ],
    defaultValue: 'best-ball',
    hint: 'How each team’s hole score is formed. Two-ball formats need two scores on the hole; scramble/alt-shot enter one team score per hole.',
  },
  {
    key: 'scoring', label: 'Hole score', type: 'select',
    options: [{ value: 'stableford', label: 'Points (Stableford)' }, { value: 'stroke', label: 'Net strokes' }],
    defaultValue: 'stableford',
    hint: 'How each team’s hole score is expressed — Stableford points or net strokes. (Not the same as match vs total — see “Compare by”.)',
  },
  {
    key: 'result', label: 'Compare by', type: 'select',
    options: [{ value: 'match', label: 'Match (hole by hole)' }, { value: 'total', label: 'Total (18 holes)' }],
    defaultValue: 'match',
    hint: 'Match: win each hole. Total: compare the 18-hole total. Works with either hole score. Front/back/overall shown either way.',
  },
  {
    key: 'moneyModel', label: 'Money', type: 'select',
    options: [
      { value: 'per-hole', label: '$ per hole won' },
      { value: 'per-point', label: '$ per point of margin' },
      { value: 'legs', label: 'Fixed front / back / overall' },
      { value: 'pot', label: 'Pot (buy-in per team)' },
    ],
    defaultValue: 'legs',
  },
  { key: 'dollarsPerHole', label: '$ per hole won', type: 'number', defaultValue: 2, hint: 'Money = $ per hole × (holes won − holes lost) over 18.', showIf: { key: 'moneyModel', in: ['per-hole'] } },
  { key: 'dollarsPerPoint', label: '$ per point', type: 'number', defaultValue: 1, hint: 'Money = $ per point × 18-hole margin.', showIf: { key: 'moneyModel', in: ['per-point'] } },
  // POT money (DECISIONS.md §5.ag). The buy-in is PER SIDE, not per player: every side buys one
  // equal shot at the pot whatever its size. At $20 a player an uneven game would let a solo side
  // risk $20 for the same prize a trio risked $60 for.
  {
    key: 'sideBuyIn', label: 'Buy-in ($ / team)', type: 'number', defaultValue: 20,
    hint: 'Each TEAM puts in this much, whatever its size. The best team takes the pot — or each slice of it; ties split.',
    showIf: { key: 'moneyModel', in: ['pot'] },
  },
  // POT SLICES (Phase 3 step 4, §5.bq Q-E): the classic pool's front / back / overall (/ junk)
  // split, on this engine. The four are SHARES scaled to the pot — 25/25/25/25, 1/1/1/1 and
  // $20/$20/$20/$20 all mean the same thing — so nobody has to make percentages add up. Defaults
  // 0 / 0 / 100 keep every saved pot as it was: ONE prize on the overall. The junk share sits with
  // the junk settings below (it only exists when junk pays as a pot).
  {
    key: 'potFront', label: 'Front 9 share of pot', type: 'number', defaultValue: 0,
    hint: 'Shares are scaled to the pot: 25 / 25 / 50 and $20 / $20 / $40 split it the same way. Leave front and back at 0 for one prize on the overall.',
    showIf: { key: 'moneyModel', in: ['pot'] },
  },
  {
    key: 'potBack', label: 'Back 9 share of pot', type: 'number', defaultValue: 0,
    showIf: { key: 'moneyModel', in: ['pot'] },
  },
  {
    key: 'potOverall', label: 'Overall share of pot', type: 'number', defaultValue: 100,
    hint: 'On a 9-hole game the front and back shares fold into this one.',
    showIf: { key: 'moneyModel', in: ['pot'] },
  },
  {
    key: 'potSplit', label: 'Places paid (%)', type: 'text', defaultValue: '100',
    hint: 'How each slice of the pot pays down its finishing order. "100" = winner takes it; "70,30" pays the top two. Ties split the places they span.',
    showIf: { key: 'moneyModel', in: ['pot'] },
  },
  { key: 'legFront', label: 'Front 9 ($)', type: 'number', defaultValue: 10, showIf: { key: 'moneyModel', in: ['legs'] } },
  { key: 'legBack', label: 'Back 9 ($)', type: 'number', defaultValue: 10, showIf: { key: 'moneyModel', in: ['legs'] } },
  { key: 'legOverall', label: 'Overall 18 ($)', type: 'number', defaultValue: 10, showIf: { key: 'moneyModel', in: ['legs'] } },
  // HOW LOSERS PAY with three or more teams (Phase 3 step 3, DECISIONS.md §5.bq/§5.br). Both only
  // matter at 3+ teams — at two the modes coincide — so the UI hides them for smaller games.
  //   legs default WINNER TAKES ALL: "$10 per leg" never costs a team more than $10 (§5.br).
  //   $/point default PAY EACH: the pairwise round robin every saved game already settles by (§5.ae).
  {
    key: 'legsPayout', label: 'With 3+ teams, a leg pays', type: 'select',
    options: [
      { value: 'winner-takes', label: 'Winner takes all — every other team pays the leg once; tied winners split it' },
      { value: 'pay-each', label: 'Pay each team you lost to — every pair of teams settles the leg' },
    ],
    defaultValue: 'winner-takes',
    hint: 'Winner takes all: lose the leg, pay it once. Pay each: lose to two teams, pay two teams.',
    showIf: { key: 'moneyModel', in: ['legs'] },
  },
  {
    key: 'pointsPayout', label: 'With 3+ teams, points pay', type: 'select',
    options: [
      { value: 'pay-each', label: 'Pay each team you lost to — your margin against each team' },
      { value: 'winner-takes', label: 'Winner takes all — the leader collects its margin from each team' },
    ],
    defaultValue: 'pay-each',
    hint: 'Pay each: second place can still be up, having beaten third. Winner takes all: only the leader is paid.',
    showIf: { key: 'moneyModel', in: ['per-point'] },
  },
  {
    key: 'carryover', label: 'Carry ties to the next hole', type: 'toggle', defaultValue: false,
    hint: 'Skins-style: a halved hole’s money rolls onto the next hole won outright. A carry left after the last hole is dead.',
    showIf: { key: 'moneyModel', in: ['per-hole'] },
  },
  { key: 'altShotAllowance', label: 'Alt-shot allowance (%)', type: 'number', defaultValue: 50, hint: 'Alternate shot only: % of the 60/40 combined handicap. USGA default 50.', showIf: { key: 'format', in: ['alternate-shot'] } },
  // NOTE: side NAMES are deliberately NOT here (F-014). They used to be six static keys,
  // `sideAName`..`sideFName`, and a static schema cannot express "one field per side that
  // actually exists" — so a two-side game showed four always-blank boxes, and each surface had to
  // remember to hide them. Two of three did; the third shipped six empty rows (F-015).
  //
  // A name now lives on the side itself (`GameSide.name`), edited where sides are assigned. Saved
  // games keep their names: `sidesOfGame` absorbs the legacy keys at the read boundary via
  // `hydrateLegacyNames`, so nothing needs migrating and there is one source of truth downstream.
  // Under a BUY-IN pot the junk pot is a SLICE of that pot (Phase 3 step 4, §5.bq Q-E), so the
  // separately-anted `junkPot` is asked only under the other money models.
  ...JUNK_SETTINGS.map((s) => (s.key === 'junkPot'
    ? { ...s, showIf: [...(Array.isArray(s.showIf) ? s.showIf : s.showIf ? [s.showIf] : []), { key: 'moneyModel', in: ['legs', 'per-hole', 'per-point'] }] }
    : s)),
  {
    key: 'potJunk', label: 'Junk share of pot', type: 'number', defaultValue: 25,
    hint: 'The junk pot comes out of the buy-in. Scaled with the other shares (100 overall + 25 junk = four to one); the most junk points takes it, ties split.',
    showIf: [{ key: 'moneyModel', in: ['pot'] }, { key: 'junkEnabled', in: ['true'] }, { key: 'junkPayout', in: ['pot'] }],
  },
  // Team-only junk (Phase 3 step 2): the classic pool's "all par" — every member of the team at
  // par or better on a hole. Not in the shared JUNK_SETTINGS because it has no individual meaning.
  {
    key: 'junkGroupHug', label: 'All par (pts)', type: 'number', defaultValue: 0,
    hint: 'Junk points when every player on the team makes par or better on a hole. 0 = not played.',
    showIf: { key: 'junkEnabled', in: ['true'] },
  },
];

// The ONE place a side gets its display name. Custom name if set, else the side's players'
// first names ("Craig & Jym"), else "Side A"/"Side B"/"Side C". Exported so the SCORECARD
// (play page) labels sides identically to the leaderboard — it previously fell back to
// "Team A"/"Team B", so the same game read two different ways on two screens.
//
// `sideId` is the side's stable id ('a', 'b', 'c', …), not its position.
export function sideNameFrom(
  players: Pick<Player, 'id' | 'name'>[],
  ids: string[],
  sideId: string,
  customName?: string,
  /**
   * True when EVERY side in the game is a single player (a 1v1, or four players each for
   * themselves). Then "(solo)" is noise: it distinguishes nothing, because there is no pair to
   * contrast with, and "Craig vs Jym" is how golfers say it. Defaults false so every existing
   * caller keeps today's labels.
   */
  allSidesSolo = false,
): string {
  const custom = (customName ?? '').trim();
  if (custom) return custom;
  // F-039: two Bills in one game made side A read "Bill & Bill". A first name that ANYBODY
  // else in the game shares gets a last initial — game-wide, not per-side, so "Bill M." on
  // one row can't sit across from a bare "Bill" on another.
  const firstOf = (full: string) => full.trim().split(/\s+/)[0];
  const counts = new Map<string, number>();
  for (const p of players) counts.set(firstOf(p.name), (counts.get(firstOf(p.name)) ?? 0) + 1);
  const shortName = (full: string) => {
    const parts = full.trim().split(/\s+/);
    const first = parts[0];
    if ((counts.get(first) ?? 0) < 2 || parts.length < 2) return first;
    return `${first} ${parts[parts.length - 1][0]}.`;
  };
  const names = ids
    .map((id) => {
      const p = players.find((x) => x.id === id);
      return p ? shortName(p.name) : undefined;
    })
    .filter(Boolean) as string[];
  if (names.length === 0) return defaultSideLabel(sideId);
  // "Craig & Jym" is right for a PAIR, which is what a side was when only 2v2 existed. At three
  // it read "Craig & Jym & Dave" — a run of ampersands that gets worse with every player — and a
  // ONE-player side read as a bare "Tony", indistinguishable from a player name on a board whose
  // other rows are sides. Both were only obvious in a screenshot.
  //
  // The "(solo)" suffix earns its place only when it CONTRASTS with something: a lone player up
  // against a pair. In a 1v1 every row is one player, so the suffix marks nothing and just makes
  // the board read like a bug report.
  if (names.length === 1) return allSidesSolo ? names[0] : `${names[0]} (solo)`;
  if (names.length === 2) return names.join(' & ');
  // Three or more: name it after the first two and count the rest, so the column stays readable
  // on a phone. A group that cares can set a custom name.
  return `${names[0]} & ${names[1]} +${names.length - 2}`;
}

// The FIRST TWO sides' display names for a saved side game. Used by the play page (which has a
// PoolGame, not a GameModeContext) so scorecard labels match the board.
//
// Two, not N, because the scorecard's team slot is a two-value field (Player.team: 'A' | 'B').
// A 3+ side game is deliberately left untagged upstream, so this is only ever called with two.
/**
 * True when every side holds exactly one player — a 1v1, or a field each playing for themselves.
 *
 * Exported so the naming decision is made in ONE place: "(solo)" only earns its place when a lone
 * player contrasts with a pair, and each screen deciding that for itself is how the same side ends
 * up labelled two ways (the bug §5.al is about).
 */
export function allSidesAreSolo(sides: GameSide[]): boolean {
  return sides.length > 1 && sides.every((s) => s.playerIds.length === 1);
}

export function sideNamesForGame(
  game: PoolGame,
  sides: GameSide[],
): { A: string; B: string } {
  // No legacy-settings lookup here any more (F-014): `sidesOfGame` has already absorbed
  // `sideAName`/`sideBName` into each side's own `name`, so this reads one field.
  const solo = allSidesAreSolo(sides);
  const nameAt = (idx: number) => {
    const side = sides[idx];
    if (!side) return idx === 0 ? 'Team A' : 'Team B';
    return sideNameFrom(game.players, side.playerIds, side.id, side.name, solo);
  };
  return { A: nameAt(0), B: nameAt(1) };
}

function compute(ctx: GameModeContext): IndividualResult {
  const format = stringSetting(SETTINGS, ctx.settings, 'format');
  const scoring = stringSetting(SETTINGS, ctx.settings, 'scoring');  // 'stableford' | 'stroke'
  const result = stringSetting(SETTINGS, ctx.settings, 'result');    // 'match' | 'total'
  const moneyModel = stringSetting(SETTINGS, ctx.settings, 'moneyModel');
  const dollarsPerHole = numberSetting(SETTINGS, ctx.settings, 'dollarsPerHole');
  const dollarsPerPoint = numberSetting(SETTINGS, ctx.settings, 'dollarsPerPoint');
  const legDollars = {
    front: numberSetting(SETTINGS, ctx.settings, 'legFront'),
    back: numberSetting(SETTINGS, ctx.settings, 'legBack'),
    overall: numberSetting(SETTINGS, ctx.settings, 'legOverall'),
  };
  const altShotAllowance = numberSetting(SETTINGS, ctx.settings, 'altShotAllowance');
  const sideBuyIn = numberSetting(SETTINGS, ctx.settings, 'sideBuyIn');
  // Phase 3 step 3 (§5.bq/§5.br): how losers pay with 3+ sides, and carry-ties for $/hole.
  const legsPayout = stringSetting(SETTINGS, ctx.settings, 'legsPayout') === 'pay-each' ? 'pay-each' : 'winner-takes';
  const pointsPayout = stringSetting(SETTINGS, ctx.settings, 'pointsPayout') === 'winner-takes' ? 'winner-takes' : 'pay-each';
  const carryover = boolSetting(SETTINGS, ctx.settings, 'carryover');
  const potSplit = stringSetting(SETTINGS, ctx.settings, 'potSplit');
  const numHoles = ctx.holes.length || 18;

  // N SIDES. ctx.sides is normalized at the read boundary (game-modes/sides.ts), so a legacy
  // {a, b} game arrives here as two sides with the ids 'a' and 'b' — identical behavior, which
  // the golden snapshots in two-side-golden.test.ts hold us to.
  const sides: GameSide[] = ctx.sides ?? (ctx.subTeams ? fromLegacySubTeams(ctx.subTeams) : []);
  const sideIds = (idx: number) => sides[idx]?.playerIds ?? [];

  // Custom side names come off the side itself (F-014). The legacy `side<Letter>Name` settings
  // were absorbed into `GameSide.name` by `sidesOfGame`, so there is no settings lookup here —
  // one field, one source of truth, and an existing game's names still resolve.
  const soloSides = allSidesAreSolo(sides);
  const nameFor = (idx: number): string =>
    sideNameFrom(ctx.players, sideIds(idx), sides[idx]?.id ?? '?', sides[idx]?.name, soloSides);

  // The format as the shared engine spells it. An unknown string (a hand-edited settings bag)
  // scores as best ball, exactly as `teamNetOnHole`'s default arm does — the F-069 fallback,
  // now in one place instead of two.
  const teamFormat = format as TeamFormat;
  const basis: ScoreBasis = scoring === 'stableford' ? 'stableford' : 'stroke';

  // Team handicap for the single-ball formats (0 for every multi-ball format), per side.
  const teamHcap: number[] = sides.map((_, idx) => {
    if (!isOneBall(teamFormat)) return 0;
    const raws = sideIds(idx).map((id) => ctx.rawCourseHcap(id));
    return teamHandicapForFormat(
      raws,
      teamFormat as 'scramble' | 'alternate-shot',
      teamFormat === 'scramble' ? undefined : altShotAllowance,
    );
  });

  // One side's hole value — net strokes (lower better) or Stableford points (higher better),
  // null until the format has the scores it needs (a two-ball format waits for two cards; a
  // one-ball format reads the side's shared ball, order-independently — §5.ac's backstop lives
  // in `teamNetOnHole`). SAME function as the classic pool, so the two containers can't drift.
  const metric = (side: number, hole: HoleData): number | null =>
    teamValueOnHole({
      playerIds: sideIds(side),
      hole,
      format: teamFormat,
      grossOnHole: (id) => ctx.grossOnHole(id, hole),
      netOnHole: (id) => ctx.netOnHole(id, hole),
      teamHandicap: teamHcap[side],
      numHoles,
    }, basis);

  // Higher-is-better under Stableford, lower-is-better under strokes. ONE definition, so no
  // consumer re-derives the comparison — four places deriving it separately is how the
  // points-ranked-backwards bug reached three consumers (FINDINGS F-006, bug #2).
  const better = (x: number, y: number) => (scoring === 'stableford' ? x > y : x < y);

  // Standings, one per side. playerId is the side's id UPPERCASED ('A', 'B', 'C', …), which
  // keeps a legacy two-side game emitting exactly 'A' and 'B' as before.
  const stand: PlayerStanding[] = sides.map((side, idx) => ({
    playerId: side.id.toUpperCase(),
    playerName: nameFor(idx),
    points: 0, moneyNet: 0,
    perHole: ctx.holes.map(() => null as number | null),
    thru: 0, place: 0,
  }));

  // Per-leg tallies (front = holes 1-9, back = 10-18, overall = all), one slot per side.
  const zeros = () => sides.map(() => 0);
  const legHolesWon = { front: zeros(), back: zeros() };
  // SCORE TO PAR, the figure sides are actually RANKED and PAID on (Craig, 2026-08-17: "i
  // actually think score to par is the way to rank it, showing what holes each team is
  // through... this is what it looks like in a normal golf tournament in terms of the
  // scoreboard"). A raw total rewards a side for having played FEWER holes: two sides both at
  // par, one thru 9 and one thru 5, settled $16 to the one that had played less golf. Score to
  // par reads 0 for both, exactly as a tournament board does.
  //
  // At EQUAL thru counts the to-par margin is arithmetically identical to the raw-total margin
  // (the "even" term cancels), so no completed game's money moves — only mid-round numbers,
  // which is the bug. Same mechanism the classic pool already uses (evenValueOnHole), so the
  // two axes now agree instead of one being right.
  const toPar = zeros();
  const legToPar = { front: zeros(), back: zeros() };
  const legThru = { front: 0, back: 0 };
  const totals = zeros();
  // The same to-par figures, accumulated ONLY on CONTESTED holes — ones every side has posted.
  //
  // F-016: `legToPar` above counts every hole a side individually played, while `legThru` counts
  // only contested ones. Comparing the two meant a leg's margin could pit one side's 9 holes
  // against another's 3, and the leg winner is paid (`payLeg`). A side that walked in after 12
  // collected the back nine: $60 for playing three of its nine holes.
  //
  // §5.af fixed exactly this class of bug for the STANDINGS (rank on to-par, show thru); the leg
  // lines never got the same treatment — one axis drifting from the other. This is the leg-level
  // equivalent, and it uses the gate that already existed rather than inventing a rule.
  //
  // Why a SECOND accumulator instead of changing the first: the standings legitimately want
  // every hole a side has played (that's what "thru 12, +2" means on a tournament board). Only
  // the head-to-head leg COMPARISON needs like-for-like holes. Two different questions, so two
  // different figures.
  //
  // At equal thru counts these are identical to `legToPar`/`toPar`, so no completed game's money
  // moves — held by n-side-golden.test.ts, where every "MUST NOT MOVE" case is byte-identical.
  const contestedToPar = { front: zeros(), back: zeros() };
  let thruHole = 0;
  // Each side's HOLE SCORE per hole, kept for the scorecard (DECISIONS.md §5.ah). Distinct from
  // PlayerStanding.perHole, which under match scoring holds the 1 / 0.5 / 0 match POINTS and so
  // cannot draw a card row.
  const holeValues: (number | null)[][] = sides.map(() => ctx.holes.map(() => null));
  // Per hole: the outright winner's side index, null = contested but halved, undefined = not yet
  // contested (some side unscored).
  const holeWinner: (number | null | undefined)[] = ctx.holes.map(() => undefined);

  ctx.holes.forEach((hole, hIdx) => {
    const ms = sides.map((_, idx) => metric(idx, hole));
    ms.forEach((m, idx) => { holeValues[idx][hIdx] = m; });
    if (ms.every((m) => m === null)) return;
    thruHole = hole.number;
    const leg = hole.number <= 9 ? 'front' : 'back';
    // Each side's to-par contribution on THIS hole. Computed once and reused below, because the
    // contested-hole accumulator (F-016) needs the same figure after the contested gate.
    //
    // "Even" is what a side playing to expectation scores here: par per ball under strokes, 2
    // points per ball under Stableford. Each side's ball count is its own, since sides can be
    // uneven (a 3-player side playing combined contributes three balls).
    const holeToPar = ms.map((m, idx) => {
      if (m === null) return null;
      const sideBalls = ballsPerHole(teamFormat, sideIds(idx).length);
      return m - evenValueOnHole(hole, basis, sideBalls);
    });

    ms.forEach((m, idx) => {
      if (m === null) return;
      stand[idx].thru += 1;
      totals[idx] += m;
      toPar[idx] += holeToPar[idx]!;
      legToPar[leg][idx] += holeToPar[idx]!;
    });

    // A hole is only CONTESTED once every side has posted — the same rule as before, where a
    // hole with one side unscored counted toward neither side's holes-won.
    if (ms.some((m) => m === null)) return;
    const scored = ms as number[];
    legThru[leg] += 1;
    // F-016: the leg comparison accumulates only here, past the contested gate, so every side's
    // leg figure covers exactly the same holes.
    ms.forEach((_, idx) => { contestedToPar[leg][idx] += holeToPar[idx]!; });

    // Best value on the hole, and who holds it. Multiple sides can share it.
    const best = scored.reduce((b, m) => (better(m, b) ? m : b), scored[0]);
    const winners = scored.map((m) => m === best);
    const outright = winners.filter(Boolean).length === 1;
    scored.forEach((_, idx) => {
      if (winners[idx] && outright) legHolesWon[leg][idx]++;
    });
    // Who won the hole outright (side index), or null for a halved hole — the carry-over money
    // model walks these in order (Phase 3 step 3).
    holeWinner[hIdx] = outright ? winners.indexOf(true) : null;

    if (result === 'match') {
      // Match points: 1 for an outright hole win, 0.5 shared when tied at the top, 0 otherwise.
      // At two sides this is exactly the old 1 / 0.5 / 0.
      const tiedCount = winners.filter(Boolean).length;
      scored.forEach((_, idx) => {
        const v = winners[idx] ? (outright ? 1 : 1 / tiedCount) : 0;
        stand[idx].perHole[hIdx] = v;
        stand[idx].points += v;
      });
    } else {
      scored.forEach((m, idx) => { stand[idx].perHole[hIdx] = m; });
    }
  });

  // Overall metric + place.
  //
  // DISPLAY vs RANK, deliberately different under 'total' (Craig: "score to par is the way to
  // rank it, showing what holes each team is through"). `points` stays the side's REAL total —
  // the number they actually shot, which is what a scoreboard shows — while the ranking and the
  // money run off score to par, so a side that has played fewer holes gains nothing.
  //
  // Match mode is already thru-safe (it only scores a hole every side has posted), so it ranks
  // on its match points directly.
  if (result === 'total') {
    sides.forEach((_, idx) => {
      stand[idx].points = totals[idx];
      // Surface the figure the board is ranked on, so the leaderboard can SHOW it. Without
      // this a side could sit above another with a worse-looking total and nothing on screen
      // explained why (DECISIONS.md §5.af).
      stand[idx].toPar = toPar[idx];
    });
  }
  const rankValue = (idx: number) => (result === 'match' ? stand[idx].points : toPar[idx]);
  assignPlaces(stand, sides.map((_, idx) => rankValue(idx)), result === 'match' ? (x, y) => x > y : better);

  // Per-leg winners + status lines for the leaderboard.
  const names = sides.map((_, idx) => nameFor(idx));
  // How many holes a leg spans, from the holes actually in play. A leg is INCOMPLETE when
  // fewer than this many have been contested, which is what close-out asks about (F-016b).
  const legHoleCount = (key: 'front' | 'back' | 'overall'): number => {
    const front = ctx.holes.filter((h) => h.number <= 9).length;
    const back = ctx.holes.filter((h) => h.number > 9).length;
    return key === 'front' ? front : key === 'back' ? back : front + back;
  };
  const voided = new Set(ctx.voidedLegs ?? []);
  // Holes-won is always higher-is-better; a summed metric follows the scoring basis.
  const legBetter = result === 'match' ? (x: number, y: number) => x > y : better;
  // The leg's per-side figure: holes won under match, score to par under total (not the raw summed
  // metric — a side thru fewer holes must not lead a leg on that basis alone). Under 'total' this
  // reads the CONTESTED-hole figures (F-016), so every side's number covers the same holes.
  const legValues = (key: 'front' | 'back' | 'overall'): number[] => sides.map((_, idx) =>
    result === 'match'
      ? (key === 'overall' ? legHolesWon.front[idx] + legHolesWon.back[idx] : legHolesWon[key][idx])
      : (key === 'overall'
        ? contestedToPar.front[idx] + contestedToPar.back[idx]
        : contestedToPar[key][idx]));
  const legLine = (key: 'front' | 'back' | 'overall'): TeamLegLine => {
    const thru = key === 'overall' ? legThru.front + legThru.back : legThru[key];
    const holes = legHoleCount(key);
    if (thru === 0) {
      return { key, label: legLabel(key), status: '–', winner: null, leaders: [], thru: 0, holes };
    }

    // The leg's per-side figure: holes won under match, score to par under total (not the raw
    // summed metric — see the toPar comment above; a side thru fewer holes must not lead a leg
    // on that basis alone).
    //
    // F-016: under 'total' this reads the CONTESTED-hole figures, so every side's number covers
    // the same holes. `legToPar`/`toPar` count each side's own holes, which is right for the
    // standings ("thru 12, +2") but wrong for a head-to-head leg — comparing 9 holes against 3
    // paid a side that walked in. Holes-won was already contested-only, so 'match' needs nothing.
    const values = legValues(key);
    const best = values.reduce((b, v) => (legBetter(v, b) ? v : b), values[0]);
    const leaders = values.map((v, idx) => ({ v, idx })).filter((e) => e.v === best);
    const winner = leaders.length === 1 ? sides[leaders[0].idx].id : null;

    let status: string;
    if (leaders.length > 1) {
      // Two sides tied reads "All square" (match) / "Tied" (total), as before. Three or more
      // sides need to say WHO is tied, or the row is unreadable.
      status = leaders.length === sides.length
        ? (result === 'match' ? 'All square' : 'Tied')
        : `${leaders.map((e) => names[e.idx]).join(' & ')} tied`;
    } else {
      const lead = leaders[0];
      // The margin is over the best OTHER side — at two sides that's the head-to-head gap,
      // which is what the existing status strings say.
      const rest = values.filter((_, idx) => idx !== lead.idx);
      const runnerUp = rest.reduce((b, v) => (legBetter(v, b) ? v : b), rest[0]);
      const margin = Math.abs(lead.v - runnerUp);
      status = result === 'match'
        ? `${names[lead.idx]} ${margin} up`
        : `${names[lead.idx]} by ${margin % 1 === 0 ? margin : margin.toFixed(1)}`;
    }
    return {
      key, label: legLabel(key), status, winner, leaders: leaders.map((e) => sides[e.idx].id), thru, holes,
      // Voided legs still SHOW their margin — the group played those holes and wants to see
      // them — they just don't settle. Only mark it when the leg is genuinely short, so a
      // stale flag on a completed leg can't silently withhold money.
      voided: voided.has(key) && thru < holes,
    };
  };
  // A 9-hole game has ONE leg. Every hole in ctx.holes belongs to the played
  // nine, so the other nine's leg is permanently empty while 'overall' covers
  // exactly the same holes as the played leg — under the 'legs' money model that
  // paid the SAME nine twice (front + overall) and showed two dead rows on the
  // leaderboard. Collapse to a single leg labelled for the nine actually played.
  const nineOnly = ctx.holes.length > 0 && ctx.holes.every((h) => h.number > 9)
    ? 'back'
    : ctx.holes.length > 0 && ctx.holes.every((h) => h.number <= 9) && ctx.holes.length <= 9
      ? 'front'
      : null;
  const teamLegs: TeamLegLine[] = nineOnly
    ? [{
        ...legLine('overall'),
        key: nineOnly,
        label: nineOnly === 'front' ? 'Front 9' : 'Back 9',
        // The collapsed leg is keyed to the nine actually played, so a void recorded against
        // that nine's key applies. Re-read it here rather than inheriting 'overall's flag.
        voided: voided.has(nineOnly) && legLine('overall').thru < legHoleCount('overall'),
      }]
    : [legLine('front'), legLine('back'), legLine('overall')];

  // MONEY — pairwise round-robin across every side (DECISIONS.md §5.ae). Craig's rule: "the
  // losing team would owe all teams ahead of them, and the 2nd team would owe just the one
  // ahead". Each side settles against each OTHER side individually and sums the results, which
  // is zero-sum at any side count AND reduces to today's head-to-head margin at two sides — so
  // every existing 2v2 game settles unchanged (held to that by two-side-golden.test.ts).
  const money = zeros();
  // Each side's junk POINTS, tallied up front: the pot's junk slice ranks them (Phase 3 step 4).
  // Null when the junk layer is off. Settlement (per point, or a separate junk pot) happens below.
  const junkTally = tallyJunkForSides(SETTINGS, ctx.settings, ctx, sides);
  const potSlices: PotSliceLine[] = [];
  const add = (amounts: number[]) => amounts.forEach((v, idx) => { money[idx] += v; });

  if (moneyModel === 'per-hole') {
    if (carryover) {
      // CARRY TIES (Phase 3 step 3, §5.bq Q-F/Q-G): walk the contested holes in order. An outright
      // winner collects $ per hole × (1 + holes carried) from EVERY other side; a halved hole adds
      // itself to the carry; a carry still standing after the last contested hole is dead.
      // With no halved holes this is exactly the round robin below (each outright win collects
      // from every other side), so the toggle changes nothing until a hole is actually halved.
      let carried = 0;
      const n = sides.length;
      holeWinner.forEach((w) => {
        if (w === undefined) return;
        if (w === null) { carried += 1; return; }
        const units = dollarsPerHole * (1 + carried);
        carried = 0;
        sides.forEach((_, idx) => { money[idx] += idx === w ? units * (n - 1) : -units; });
      });
    } else {
      // $ per hole of margin, against each opponent separately. (Identical to "winner takes from
      // everyone": an outright hole win is a +1 only for the winner, so the pairwise margin sum is
      // the winner collecting from each other side — there is no second mode to offer here.)
      const won = sides.map((_, idx) => legHolesWon.front[idx] + legHolesWon.back[idx]);
      add(settleRoundRobin(
        sides.map((_, idx) => (stand[idx].thru > 0 ? won[idx] : null)),
        (v) => v,
        (mine, theirs) => (mine - theirs) * dollarsPerHole,
      ));
    }
  } else if (moneyModel === 'per-point') {
    // Match: margin in match points. Total: margin in SCORE TO PAR, not raw totals — paying on
    // raw totals handed money to whichever side had played fewer holes. Oriented so being
    // BETTER always pays: under strokes lower to-par wins, under Stableford higher does.
    const values = sides.map((_, idx) => (stand[idx].thru > 0
      ? (result === 'match' ? stand[idx].points : toPar[idx])
      : null));
    const higherIsBetter = result === 'match' || scoring === 'stableford';
    if (pointsPayout === 'winner-takes') {
      // WINNER TAKES ALL (Phase 3 step 3, §5.bq): only the leader(s) are paid. Each side behind pays
      // its margin to the top ONCE; tied leaders split what each loser pays (§5.br). At two sides
      // this is the head-to-head margin, same as the round robin.
      add(settleWinnerTakes(values, higherIsBetter, (top, v) => Math.abs(top - v) * dollarsPerPoint));
    } else {
      // PAY EACH TEAM YOU LOST TO — pairwise round robin (§5.ae), the default.
      add(settleRoundRobin(values, (v) => v,
        (mine, theirs) => (higherIsBetter ? mine - theirs : theirs - mine) * dollarsPerPoint));
    }
  } else if (moneyModel === 'pot') {
    // POT (DECISIONS.md §5.ag): every SIDE antes the same buy-in whatever its size, and the pot
    // pays down the finishing order by `potSplit` — "100" winner-take-all, "70,30" top two.
    //
    // Ranking already happened (assignPlaces, on score to par under 'total'), so this reuses the
    // pool's distributePot: it assigns places by metric, gives tied sides the SUM of the
    // positions they span, and distributes 100% of the pot. That's Craig's tie rule
    // ("first and second would split first place money if there is a two way tie") without a
    // second implementation of it.
    //
    // Sides that haven't started are NOT in the pot — they neither ante nor collect. An
    // unstarted side ranking first on an empty total is the bug §5.af closed.
    const inPot = sides.map((_, idx) => stand[idx].thru > 0);
    const potSides = sides.filter((_, idx) => inPot[idx]);
    if (potSides.length > 0 && sideBuyIn > 0) {
      const pot = sideBuyIn * potSides.length;
      const places = parseVector(potSplit);
      // 'match' points and Stableford are higher-is-better; negate for distributePot's one
      // lower-is-better direction, exactly as computePoolResult does with rankMetric.
      const orient = (v: number) => ((result === 'match' || scoring === 'stableford') ? -v : v);

      // SLICES (Phase 3 step 4, §5.bq Q-E): the pot is divided front / back / overall (/ junk) by
      // the share settings, scaled to add up. A 9-hole game has one leg, so front and back fold into
      // the overall. The junk share is a slice only when junk pays as a pot — that pot then comes
      // out of the buy-in and `junkPot` is not anted separately. All-zero shares = one prize on the
      // overall (today's pot, and every saved game's).
      const junkSliced = junkTally !== null && junkPayout(SETTINGS, ctx.settings) === 'pot';
      const shares = {
        front: nineOnly ? 0 : Math.max(0, numberSetting(SETTINGS, ctx.settings, 'potFront')),
        back: nineOnly ? 0 : Math.max(0, numberSetting(SETTINGS, ctx.settings, 'potBack')),
        overall: Math.max(0, numberSetting(SETTINGS, ctx.settings, 'potOverall'))
          + (nineOnly ? Math.max(0, numberSetting(SETTINGS, ctx.settings, 'potFront')) + Math.max(0, numberSetting(SETTINGS, ctx.settings, 'potBack')) : 0),
        junk: junkSliced ? Math.max(0, numberSetting(SETTINGS, ctx.settings, 'potJunk')) : 0,
      };
      const shareTotal = shares.front + shares.back + shares.overall + shares.junk;
      const dollarsOf = (k: keyof typeof shares) => (shareTotal > 0 ? (pot * shares[k]) / shareTotal : k === 'overall' ? pot : 0);

      // Pay one slice: rank the ELIGIBLE sides on `metricOf` (lower is better) and hand the slice
      // to distributePot — places by `potSplit`, tied sides share the SUM of the places they span,
      // all of it distributed. Eligible = in the pot AND has played the slice's holes: once anyone
      // has started a leg, a side still on the other nine can't be tied for it (the classic pool's
      // F-011 rule). A slice NOBODY has started (the back nine at the turn), or whose leg the group
      // voided, is a dead heat: it splits evenly among the sides in the pot, so every ante comes
      // back on it and a mid-round board never shows phantom losses.
      const paySlice = (
        key: 'front' | 'back' | 'overall' | 'junk', label: string, dollars: number,
        eligible: (idx: number) => boolean, metricOf: (idx: number) => number,
      ) => {
        if (dollars <= 0) return;
        const entries = sides.map((s, idx) => ({ teamId: s.id, idx })).filter((e) => inPot[e.idx]);
        const contenders = entries.filter((e) => eligible(e.idx));
        const started = contenders.length > 0;
        const ranked = (started ? contenders : entries)
          .map((e) => ({ teamId: e.teamId, metric: started ? metricOf(e.idx) : 0 }))
          .sort((a, b) => a.metric - b.metric);
        const paid = distributePot(ranked, dollars, places);
        entries.forEach((e) => { money[e.idx] += paid[e.teamId] ?? 0; });
        const payouts = Object.fromEntries(Object.entries(paid).filter(([, v]) => v > 0));
        const top = Math.max(0, ...Object.values(payouts));
        const winnerNames = started && top > 0
          ? entries.filter((e) => payouts[e.teamId] === top).map((e) => nameFor(e.idx))
          : [];
        potSlices.push({ key, label, dollars, payouts, winnerNames, split: !started });
      };
      // A side's holes played on a nine (its OWN holes, not only contested ones — a pot ranks each
      // side on its own score to par, §5.af, exactly as the overall does).
      const inLeg = (key: 'front' | 'back', h: HoleData) => (key === 'front' ? h.number <= 9 : h.number > 9);
      const sideLegThru = (key: 'front' | 'back', idx: number) =>
        ctx.holes.reduce((n, h, hIdx) => n + (inLeg(key, h) && holeValues[idx][hIdx] !== null ? 1 : 0), 0);
      const legVoided = (key: 'front' | 'back') => !!teamLegs.find((l) => l.key === key)?.voided;
      const legMetric = (key: 'front' | 'back') => (idx: number) =>
        orient(result === 'match' ? legHolesWon[key][idx] : legToPar[key][idx]);
      if (!nineOnly) {
        for (const key of ['front', 'back'] as const) {
          paySlice(key, legLabel(key), dollarsOf(key), (idx) => !legVoided(key) && sideLegThru(key, idx) > 0, legMetric(key));
        }
      }
      // The overall slice ranks exactly as the standings do (assignPlaces on `rankValue`), so the
      // board's finishing order and the money always agree — this is the old one-prize pot.
      paySlice('overall', nineOnly ? teamLegs[0].label : legLabel('overall'), dollarsOf('overall'), () => true, (idx) => orient(rankValue(idx)));
      if (junkSliced) {
        const pts = junkTally!.sides;
        paySlice('junk', 'Junk', dollarsOf('junk'), () => true, (idx) => -(pts.find((p) => p.id === sides[idx].id)?.points ?? 0));
      }
      sides.forEach((_, idx) => { if (inPot[idx]) money[idx] -= sideBuyIn; });
    }
  } else {
    // legs: each leg's winner collects that leg's dollars FROM EACH other side. At two sides
    // that is the old +$leg / −$leg. On a nine there is a single leg, paid at the 'overall'
    // rate — paying front AND overall would settle the same nine holes twice.
    // PAIRWISE (DECISIONS.md §5.aj). Every side BEHIND the leg pays the leg's dollars to EVERY
    // side that LED it. Craig, asked whether a losing side owes one leg or one per opponent:
    //
    //   > "i think they would owe both based on the settings we are making. IF it was a pot split
    //   > situation, it would be different, no?"
    //
    // That distinction is the rule: `legs` is per-opponent STAKES ("we're playing you for $10 a
    // leg" is a separate bet against each side), whereas a pot is one divided PRIZE (§5.ag, which
    // splits and is untouched here). Lose to two sides, owe two sides.
    //
    // F-017 was the tie case: with a single winner this already collected the leg from each side
    // behind, but `winner` is null on a tie, so a side 18 over par owed NOTHING when the two
    // ahead of it happened to tie. per-point charged it $36 and pot $20 on the same cards.
    //
    // Consequence Craig accepted knowingly, put to him twice: a tie at the top costs last place
    // MORE than a clean defeat ($20 vs $10 on a $10 leg), because it lost to two sides that both
    // beat it rather than one. Under per-opponent stakes that's the correct reading.
    //
    // At ONE leader this is arithmetically identical to the old code, so no existing game moves —
    // held by n-side-golden.test.ts's "a clear leg winner collects from each side behind".
    //
    // PHASE 3 STEP 3 (§5.bq/§5.br) split this into two NAMED modes, because the goldens showed the
    // code above was neither: it paid only the LEADERS (winner-take-all shape) but charged a loser
    // once per tied leader (per-opponent shape) — F-094.
    //   'winner-takes' (DEFAULT, §5.br — "$10 per leg" never costs a team more than $10): every side
    //     behind pays the leg ONCE; the leader(s) share what is paid. Distinct places pay exactly
    //     what the old code paid; a tie at the top now costs last place $10, not $20.
    //   'pay-each' (§5.aj's words): every pair of sides settles the leg between themselves — lose
    //     to two sides, owe two sides; second place collects from third.
    const payLeg = (leg: TeamLegLine, key: 'front' | 'back' | 'overall', dollars: number) => {
      // A leg the group voided at close-out pays nothing (F-016b). It still shows its margin on
      // the board — those holes were played — but no money changes hands over it.
      if (leg.voided) return;
      if (dollars === 0 || leg.leaders.length === 0) return;
      // Only sides that have played are in the leg — an unscored side neither pays nor collects,
      // matching settleRoundRobin's treatment of a null value.
      const inLeg = sides.map((_, idx) => stand[idx].thru > 0);
      if (legsPayout === 'pay-each') {
        const values = legValues(key);
        add(settleRoundRobin(
          sides.map((_, idx) => (inLeg[idx] ? values[idx] : null)),
          (v) => v,
          (mine, theirs) => (legBetter(mine, theirs) ? dollars : legBetter(theirs, mine) ? -dollars : 0),
        ));
        return;
      }
      const isLeader = sides.map((s) => leg.leaders.includes(s.id));
      const leaderCount = isLeader.filter((v, idx) => v && inLeg[idx]).length;
      const behind = inLeg.filter((v, idx) => v && !isLeader[idx]).length;
      // A leg where EVERY side tied has nobody behind, so nothing changes hands — which is also
      // what two tied sides have always done ("All square" pushes).
      if (leaderCount === 0 || behind === 0) return;
      sides.forEach((_, idx) => {
        if (!inLeg[idx]) return;
        if (isLeader[idx]) money[idx] += (dollars * behind) / leaderCount;   // share of what the losers pay
        else money[idx] -= dollars;                                          // pays the leg once
      });
    };
    if (nineOnly) {
      payLeg(teamLegs[0], 'overall', legDollars.overall);
    } else {
      payLeg(teamLegs[0], 'front', legDollars.front);
      payLeg(teamLegs[1], 'back', legDollars.back);
      payLeg(teamLegs[2], 'overall', legDollars.overall);
    }
  }
  money.forEach((v, idx) => { stand[idx].moneyNet = v; });

  // Birdie/eagle bonuses. Earned by individuals but settled between SIDES, since this game's
  // money is between sides, not a free-for-all among the players.
  // Under a buy-in pot the junk pot was paid as a SLICE above, so the settlement only tallies here.
  const junk = settleJunkForSides(SETTINGS, ctx.settings, ctx, stand, sides, { junkPotInBuyIn: moneyModel === 'pot' });
  const junkLines = junk?.lines;

  // One side's ready-to-show status for the SCORECARD: its rank, plus the margin in the unit the
  // game actually counts (DECISIONS.md §5.ah). Craig's correction: "what if it isnt a score to
  // par type of game? what if its points?" — so the figure follows the game, never a hard-coded
  // "to par". At TWO sides the leaderboard's own leg lines already say "2 up"/"by 3"; this is the
  // per-side line the card needs, which has to be readable with any number of opponents.
  function sideStatus(idx: number): string {
    if (stand[idx].thru === 0) return '–';
    const place = stand[idx].place;
    const ord = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`;
    const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));
    if (result === 'match') {
      // Match play counts HOLES, not strokes or points.
      const holesWon = legHolesWon.front[idx] + legHolesWon.back[idx];
      return `${ord} · ${holesWon} ${holesWon === 1 ? 'hole' : 'holes'}`;
    }
    if (scoring === 'stableford') return `${ord} · ${fmt(totals[idx])} pts`;
    // Strokes: score to par, which is the figure the ranking and the money use.
    const tp = toPar[idx];
    return `${ord} · ${tp === 0 ? 'E' : tp > 0 ? `+${fmt(tp)}` : fmt(tp)}`;
  }

  const metricLabel = result === 'match' ? 'match pts' : scoring === 'stableford' ? 'pts' : 'net';
  // Order the sides by who's winning (place 1 first). Unscored (place 0) sinks last. Without
  // this the board listed the sides in storage order regardless of the lead.
  const standings = [...stand].sort((x, y) => {
    const px = x.place === 0 ? Infinity : x.place;
    const py = y.place === 0 ? Infinity : y.place;
    return px - py;
  });
  return {
    kind: 'individual', gameModeId: 'team-2v2', metricLabel,
    standings, thruHole,
    // Report the pot so the leaderboard can show "$60 pot" (it already renders that for any
    // result whose moneyModel is 'pot'). Only sides that have STARTED are in it, matching the
    // settlement — an unstarted side neither antes nor collects.
    moneyModel: moneyModel === 'pot' ? 'pot' : 'per-point',
    pot: moneyModel === 'pot' ? sideBuyIn * stand.filter((s) => s.thru > 0).length : 0,
    teamLegs,
    // The two-side view every current consumer reads. Kept exactly as before for a two-side
    // game; for 3+ sides it names the first two, and `sideLabels` below carries them all.
    sideNames: { a: names[0] ?? '', b: names[1] ?? '' },
    sideLabels: sides.map((s, idx) => ({ id: s.id, name: names[idx] })),
    sideBreakdown: sides.map((s, idx) => ({
      id: s.id,
      name: names[idx],
      values: holeValues[idx],
      total: totals[idx],
      place: stand[idx].place,
      status: sideStatus(idx),
    })),
    junkLines: junkLines ?? undefined,
    potSlices: potSlices.length > 0 ? potSlices : undefined,
    junkSides: junk ? junk.sides.map((s) => ({ ...s, name: names[sides.findIndex((x) => x.id === s.id)] ?? s.id })) : undefined,
  };
}

// 1-based places with ties SHARING a place, and unscored sides sinking to 0. Extracted so the
// ranking has exactly one definition — `rankByPointsDesc` in types.ts can't be reused here
// because it hard-codes higher-is-better, and a stroke-scored side game is lower-is-better.
function assignPlaces(
  stand: PlayerStanding[],
  values: number[],
  better: (x: number, y: number) => boolean,
): void {
  const rows = stand.map((s, idx) => ({ s, v: values[idx] })).filter((r) => r.s.thru > 0);
  for (const s of stand) s.place = 0;
  if (rows.length === 0) return;
  const sorted = [...rows].sort((x, y) => (better(x.v, y.v) ? -1 : better(y.v, x.v) ? 1 : 0));
  let place = 1;
  sorted.forEach((r, i) => {
    if (i > 0 && sorted[i - 1].v !== r.v) place = i + 1;
    r.s.place = place;
  });
}

function legLabel(key: 'front' | 'back' | 'overall'): string {
  return key === 'front' ? 'Front 9' : key === 'back' ? 'Back 9' : 'Overall 18';
}

export const teamGame: GameModeDescriptor = {
  // The registry id is UNCHANGED — every saved 2v2 game points at it. Craig's call was to
  // widen this mode in place rather than register a second N-side mode, which would have put
  // two overlapping team engines in the registry (the design smell AGENTS.md names, and the
  // reason option B was rejected in F-006).
  id: 'team-2v2',
  // NOT "Sides (within group)" any more. F-019 gave this mode real playing groups, so it spans
  // several tee times and "within group" described a limit that no longer exists (§5.at). At two
  // players it read worse still: a 1v1 has no "group" to be within.
  // Phase 2 (§5.bm Q5): "team" everywhere — the game-kind label users see comes from
  // `gameKindLabel` (structure · money), so this name only shows where a MODE is picked by name.
  name: 'Teams',
  description: 'Teams that share foursomes — 1 v 1 up to four-a-side, any team format — play each other. Front, back and overall settle separately.',
  category: 'team-within-group',
  inputType: 'gross',
  // TWO, so a singles match is reachable (Craig, 2026-08-27). The engine always handled it — one
  // player per side is just a side of one, which `sides.ts` supports and the pairwise settlement
  // treats like any other — so `playersMin: 4` was refusing a game that already worked. A singles
  // Nassau is the most common two-player bet in golf and was inexpressible.
  playersMin: 2,
  // Raised from 4 so three pairs from six, or four singles, is reachable. Two sides remains
  // the default, so "just the usual 2v2" is unaffected.
  playersMax: 8,
  settings: SETTINGS,
  compute,
};
