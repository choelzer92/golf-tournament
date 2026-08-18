import type { FormatSetting } from '../formats';
import type { HoleData, PoolGame } from '../pool-game';
import { distributePot, teamHandicapForFormat } from '../pool-game';
import type { Player } from '../game-state';
import { getMoneyStrokesOnHole } from '../money-games';
import type { GameModeContext, GameModeDescriptor, IndividualResult, PlayerStanding, TeamLegLine } from './types';
import { numberSetting, parseVector, stringSetting, JUNK_SETTINGS, settleJunkForSides } from './settings';
import {
  defaultSideLabel, fromLegacySubTeams, settleRoundRobin, type GameSide,
} from './sides';
import { ballsPerHole, evenValueOnHole, type TeamFormat } from './team-scoring';

// 2-vs-2 within one foursome. The group's players are split into two SIDES
// (ctx.subTeams). Each hole yields one team score per side by the chosen FORMAT;
// the RESULT toggle decides hole-by-hole (match) vs 18-hole total; the leaderboard
// also breaks the contest into Front 9 / Back 9 / Overall legs; MONEY settles
// head-to-head. best-ball/combined use per-player gross entry; scramble/alt-shot
// use one team ball per hole (same gross written to both members on the scorecard)
// plus a team handicap.
const SCALE = { albatrossOrBetter: 5, eagle: 4, birdie: 3, par: 2, bogey: 1, doubleOrWorse: 0 };
function sfPts(net: number, par: number): number {
  const diff = net - par;
  if (diff <= -3) return SCALE.albatrossOrBetter;
  if (diff === -2) return SCALE.eagle;
  if (diff === -1) return SCALE.birdie;
  if (diff === 0) return SCALE.par;
  if (diff === 1) return SCALE.bogey;
  return SCALE.doubleOrWorse;
}

const SETTINGS: FormatSetting[] = [
  {
    key: 'format', label: 'Team format', type: 'select',
    options: [
      { value: 'best-ball', label: 'Best ball (low net counts)' },
      { value: 'combined', label: 'Combined (both scores added)' },
      { value: 'scramble', label: 'Scramble (one ball, team handicap)' },
      { value: 'alternate-shot', label: 'Alternate shot (one ball)' },
    ],
    defaultValue: 'best-ball',
    hint: 'How each side’s hole score is formed. Scramble/alt-shot enter one team score per hole.',
  },
  {
    key: 'scoring', label: 'Hole score', type: 'select',
    options: [{ value: 'stableford', label: 'Points (Stableford)' }, { value: 'stroke', label: 'Net strokes' }],
    defaultValue: 'stableford',
    hint: 'How each side’s hole score is expressed — Stableford points or net strokes. (Not the same as match vs total — see “Compare by”.)',
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
      { value: 'pot', label: 'Pot (buy-in, best side wins)' },
    ],
    defaultValue: 'legs',
  },
  { key: 'dollarsPerHole', label: '$ per hole won', type: 'number', defaultValue: 2, hint: 'Money = $ per hole × (holes won − holes lost) over 18.', showIf: { key: 'moneyModel', in: ['per-hole'] } },
  { key: 'dollarsPerPoint', label: '$ per point', type: 'number', defaultValue: 1, hint: 'Money = $ per point × 18-hole margin.', showIf: { key: 'moneyModel', in: ['per-point'] } },
  // POT money (DECISIONS.md §5.ag). The buy-in is PER SIDE, not per player: every side buys one
  // equal shot at the pot whatever its size. At $20 a player an uneven game would let a solo side
  // risk $20 for the same prize a trio risked $60 for.
  {
    key: 'sideBuyIn', label: 'Buy-in ($ / side)', type: 'number', defaultValue: 20,
    hint: 'Each SIDE puts in this much, whatever its size. Best side wins the pot; ties split it.',
    showIf: { key: 'moneyModel', in: ['pot'] },
  },
  {
    key: 'potSplit', label: 'Pot split (%)', type: 'text', defaultValue: '100',
    hint: 'How the pot pays down the finishing order. "100" = winner takes all; "70,30" pays the top two.',
    showIf: { key: 'moneyModel', in: ['pot'] },
  },
  { key: 'legFront', label: 'Front 9 ($)', type: 'number', defaultValue: 10, showIf: { key: 'moneyModel', in: ['legs'] } },
  { key: 'legBack', label: 'Back 9 ($)', type: 'number', defaultValue: 10, showIf: { key: 'moneyModel', in: ['legs'] } },
  { key: 'legOverall', label: 'Overall 18 ($)', type: 'number', defaultValue: 10, showIf: { key: 'moneyModel', in: ['legs'] } },
  { key: 'altShotAllowance', label: 'Alt-shot allowance (%)', type: 'number', defaultValue: 50, hint: 'Alternate shot only: % of the 60/40 combined handicap. USGA default 50.', showIf: { key: 'format', in: ['alternate-shot'] } },
  // Optional custom side names. A/B are the original two keys and stay exactly as they were, so
  // every saved game keeps its names; C-F were added with N sides (F-006) — without them a third
  // side could never be named "The Hogs", which the screenshot made obvious and the code did not.
  // Six is the ceiling because playersMax is 8 and a side needs at least one player; a game with
  // fewer sides simply never renders the extra fields (they're inert, defaulting to blank).
  { key: 'sideAName', label: 'Side A name', type: 'text', defaultValue: '', hint: 'Optional — leave blank to name it after its players.' },
  { key: 'sideBName', label: 'Side B name', type: 'text', defaultValue: '', hint: 'Optional — leave blank to name it after its players.' },
  { key: 'sideCName', label: 'Side C name', type: 'text', defaultValue: '', hint: 'Optional — only used when a third side exists.' },
  { key: 'sideDName', label: 'Side D name', type: 'text', defaultValue: '', hint: 'Optional — only used when a fourth side exists.' },
  { key: 'sideEName', label: 'Side E name', type: 'text', defaultValue: '', hint: 'Optional — only used when a fifth side exists.' },
  { key: 'sideFName', label: 'Side F name', type: 'text', defaultValue: '', hint: 'Optional — only used when a sixth side exists.' },
  ...JUNK_SETTINGS,
];

// The settings key holding a side's custom name, by its position on the board. Exported so the
// hub can hide the fields for sides that don't exist rather than showing six always-blank boxes.
export function sideNameSettingKey(idx: number): string | null {
  const letter = String.fromCharCode(65 + idx);   // 'A'..
  return idx >= 0 && idx < 6 ? `side${letter}Name` : null;
}

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
): string {
  const custom = (customName ?? '').trim();
  if (custom) return custom;
  const names = ids
    .map((id) => players.find((p) => p.id === id)?.name.split(' ')[0])
    .filter(Boolean) as string[];
  if (names.length === 0) return defaultSideLabel(sideId);
  // "Craig & Jym" is right for a PAIR, which is what a side was when only 2v2 existed. At three
  // it read "Craig & Jym & Dave" — a run of ampersands that gets worse with every player — and a
  // ONE-player side read as a bare "Tony", indistinguishable from a player name on a board whose
  // other rows are sides. Both were only obvious in a screenshot.
  if (names.length === 1) return `${names[0]} (solo)`;
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
export function sideNamesForGame(
  game: PoolGame,
  sides: GameSide[],
): { A: string; B: string } {
  const nameAt = (idx: number, legacySetting: string) => {
    const side = sides[idx];
    if (!side) return idx === 0 ? 'Side A' : 'Side B';
    return sideNameFrom(game.players, side.playerIds, side.id, side.name || String(game.modeSettings?.[legacySetting] ?? ''));
  };
  return { A: nameAt(0, 'sideAName'), B: nameAt(1, 'sideBName') };
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
  const potSplit = stringSetting(SETTINGS, ctx.settings, 'potSplit');
  const numHoles = ctx.holes.length || 18;

  // N SIDES. ctx.sides is normalized at the read boundary (game-modes/sides.ts), so a legacy
  // {a, b} game arrives here as two sides with the ids 'a' and 'b' — identical behavior, which
  // the golden snapshots in two-side-golden.test.ts hold us to.
  const sides: GameSide[] = ctx.sides ?? (ctx.subTeams ? fromLegacySubTeams(ctx.subTeams) : []);
  const sideIds = (idx: number) => sides[idx]?.playerIds ?? [];

  // Custom side names. A side may carry its own `name` (the N-side field), else the
  // side<Letter>Name setting for its board position — sideAName/sideBName are the original two
  // keys, so an existing game's names keep working exactly as before.
  const settingName = (idx: number): string => {
    const key = sideNameSettingKey(idx);
    return key ? stringSetting(SETTINGS, ctx.settings, key).trim() : '';
  };
  const nameFor = (idx: number): string =>
    sideNameFrom(ctx.players, sideIds(idx), sides[idx]?.id ?? '?', sides[idx]?.name || settingName(idx));

  // Team handicap for the single-ball formats (0 for best-ball/combined), per side.
  const isSingleBall = format === 'scramble' || format === 'alternate-shot';
  const teamHcap: number[] = sides.map((_, idx) => {
    if (!isSingleBall) return 0;
    const raws = sideIds(idx).map((id) => ctx.rawCourseHcap(id));
    return teamHandicapForFormat(
      raws,
      format as 'scramble' | 'alternate-shot',
      format === 'scramble' ? undefined : altShotAllowance,
    );
  });

  // One side's team NET on a hole (lower better). null if not scored.
  function sideNet(side: number, hole: HoleData): number | null {
    const ids = sideIds(side);
    if (isSingleBall) {
      // ONE BALL MEANS ONE SCORE (DECISIONS.md §5.ac). The members share an identical gross —
      // the scorecard writes the same value to every member of the side.
      //
      // This used to read the FIRST member with a score, which made the side's score, and the
      // payout, depend on the ORDER of subTeams[side]: the same round settled $0 or -$54 after
      // swapping two ids. The pool half of F-006 fixed exactly this in team-scoring.ts and
      // missed this file, which has its own one-ball read. Taking the minimum is
      // order-independent, and in the correct case (all members share the ball) min of equal
      // values IS that value, so nothing changes for a well-formed game.
      //
      // Divergence is PREVENTED upstream — the scorecard enters one shared score, and the hub
      // refuses to switch a scored game to a one-ball format. This is the backstop.
      let gross: number | null = null;
      for (const id of ids) {
        const g = ctx.grossOnHole(id, hole);
        if (g !== null && (gross === null || g < gross)) gross = g;
      }
      if (gross === null) return null;
      return gross - getMoneyStrokesOnHole(teamHcap[side], hole.handicap, numHoles);
    }
    const nets: number[] = [];
    for (const id of ids) { const n = ctx.netOnHole(id, hole); if (n !== null) nets.push(n); }
    if (nets.length === 0) return null;
    return format === 'combined' ? nets.reduce((s, n) => s + n, 0) : Math.min(...nets);
  }

  // One side's Stableford points on a hole. Combined = sum of members' points;
  // everything else = points of the team net.
  function sidePts(side: number, hole: HoleData): number | null {
    if (format === 'combined') {
      let total = 0, any = false;
      for (const id of sideIds(side)) { const n = ctx.netOnHole(id, hole); if (n === null) continue; any = true; total += sfPts(n, hole.par); }
      return any ? total : null;
    }
    const net = sideNet(side, hole);
    return net === null ? null : sfPts(net, hole.par);
  }

  const metric = (side: number, hole: HoleData): number | null =>
    scoring === 'stableford' ? sidePts(side, hole) : sideNet(side, hole);

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
      const sideBalls = ballsPerHole(format as TeamFormat, sideIds(idx).length);
      return m - evenValueOnHole(hole, scoring === 'stableford' ? 'stableford' : 'stroke', sideBalls);
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
  const legLine = (key: 'front' | 'back' | 'overall'): TeamLegLine => {
    const thru = key === 'overall' ? legThru.front + legThru.back : legThru[key];
    const holes = legHoleCount(key);
    if (thru === 0) {
      return { key, label: legLabel(key), status: '–', winner: null, thru: 0, holes };
    }

    // The leg's per-side figure: holes won under match, score to par under total (not the raw
    // summed metric — see the toPar comment above; a side thru fewer holes must not lead a leg
    // on that basis alone).
    //
    // F-016: under 'total' this reads the CONTESTED-hole figures, so every side's number covers
    // the same holes. `legToPar`/`toPar` count each side's own holes, which is right for the
    // standings ("thru 12, +2") but wrong for a head-to-head leg — comparing 9 holes against 3
    // paid a side that walked in. Holes-won was already contested-only, so 'match' needs nothing.
    const values = sides.map((_, idx) =>
      result === 'match'
        ? (key === 'overall' ? legHolesWon.front[idx] + legHolesWon.back[idx] : legHolesWon[key][idx])
        : (key === 'overall'
          ? contestedToPar.front[idx] + contestedToPar.back[idx]
          : contestedToPar[key][idx]));
    // Holes-won is always higher-is-better; a summed metric follows the scoring basis.
    const legBetter = result === 'match' ? (x: number, y: number) => x > y : better;
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
      key, label: legLabel(key), status, winner, thru, holes,
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
  const add = (amounts: number[]) => amounts.forEach((v, idx) => { money[idx] += v; });

  if (moneyModel === 'per-hole') {
    // $ per hole of margin, against each opponent separately.
    const won = sides.map((_, idx) => legHolesWon.front[idx] + legHolesWon.back[idx]);
    add(settleRoundRobin(
      sides.map((_, idx) => (stand[idx].thru > 0 ? won[idx] : null)),
      (v) => v,
      (mine, theirs) => (mine - theirs) * dollarsPerHole,
    ));
  } else if (moneyModel === 'per-point') {
    // Match: margin in match points. Total: margin in SCORE TO PAR, not raw totals — paying on
    // raw totals handed money to whichever side had played fewer holes. Oriented so being
    // BETTER always pays: under strokes lower to-par wins, under Stableford higher does.
    const values = sides.map((_, idx) => (stand[idx].thru > 0
      ? (result === 'match' ? stand[idx].points : toPar[idx])
      : null));
    const higherIsBetter = result === 'match' || scoring === 'stableford';
    add(settleRoundRobin(values, (v) => v,
      (mine, theirs) => (higherIsBetter ? mine - theirs : theirs - mine) * dollarsPerPoint));
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
      // distributePot wants a lower-is-better metric, pre-sorted best-first.
      const rankOf = (idx: number) => {
        const v = rankValue(idx);
        // 'match' points and Stableford are higher-is-better; negate for one direction, exactly
        // as computePoolResult does with rankMetric.
        return (result === 'match' || scoring === 'stableford') ? -v : v;
      };
      const ranked = sides
        .map((s, idx) => ({ teamId: s.id, metric: rankOf(idx) }))
        .filter((_, idx) => inPot[idx])
        .sort((a, b) => a.metric - b.metric);
      const payouts = distributePot(ranked, pot, parseVector(potSplit));
      sides.forEach((s, idx) => {
        if (!inPot[idx]) return;
        money[idx] += (payouts[s.id] ?? 0) - sideBuyIn;
      });
    }
  } else {
    // legs: each leg's winner collects that leg's dollars FROM EACH other side. At two sides
    // that is the old +$leg / −$leg. On a nine there is a single leg, paid at the 'overall'
    // rate — paying front AND overall would settle the same nine holes twice.
    const payLeg = (leg: TeamLegLine, dollars: number) => {
      // A leg the group voided at close-out pays nothing (F-016b). It still shows its margin on
      // the board — those holes were played — but no money changes hands over it.
      if (leg.voided) return;
      if (!leg.winner || dollars === 0) return;
      const winnerIdx = sides.findIndex((s) => s.id === leg.winner);
      if (winnerIdx < 0) return;
      // Only sides that have played this leg are in it — an unscored side neither pays nor
      // collects, matching settleRoundRobin's treatment of a null value.
      const inLeg = sides.map((_, idx) => stand[idx].thru > 0);
      const payers = inLeg.filter((v, idx) => v && idx !== winnerIdx).length;
      money[winnerIdx] += dollars * payers;
      sides.forEach((_, idx) => { if (inLeg[idx] && idx !== winnerIdx) money[idx] -= dollars; });
    };
    if (nineOnly) {
      payLeg(teamLegs[0], legDollars.overall);
    } else {
      payLeg(teamLegs[0], legDollars.front);
      payLeg(teamLegs[1], legDollars.back);
      payLeg(teamLegs[2], legDollars.overall);
    }
  }
  money.forEach((v, idx) => { stand[idx].moneyNet = v; });

  // Birdie/eagle bonuses. Earned by individuals but settled between SIDES, since this game's
  // money is between sides, not a free-for-all among the players.
  const junkLines = settleJunkForSides(SETTINGS, ctx.settings, ctx, stand, sides);

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
  name: 'Sides (within group)',
  description: 'Split the group into sides and play them off against each other — best ball, combined, scramble, or alternate shot. Two sides by default; three or more supported.',
  category: 'team-within-group',
  inputType: 'gross',
  playersMin: 4,
  // Raised from 4 so three pairs from six, or four singles, is reachable. Two sides remains
  // the default, so "just the usual 2v2" is unaffected.
  playersMax: 8,
  settings: SETTINGS,
  compute,
};
