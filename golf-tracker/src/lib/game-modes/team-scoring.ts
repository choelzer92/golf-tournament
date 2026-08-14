// Team hole-scoring rules, generalized to ANY group of players.
//
// WHY THIS FILE EXISTS
// The 2v2 mode already computed best-ball, combined, scramble, alternate shot, and
// Stableford — but only for two sides inside one foursome. A classic pool of N foursomes
// was hard-typed to three best-ball variants (`TwoBestBallsVariant`), so "four foursomes,
// scramble, most Stableford points wins" — a standard club outing — could not be
// expressed at all. See FINDINGS.md F-006.
//
// Craig chose to generalize rather than extend the two-side engine, because he does want
// 3+ sides eventually ("yes, eventually i do think that would be an important feature"),
// and the cheaper fix would have to be redone at that point.
//
// A "team" here is just a list of player ids. That's true of a 2v2 side, a foursome in a
// pool, a Wolf partnership, or one of five pairs in an outing — so the same functions serve
// all of them.
//
// NOTHING in here is wired into the classic pool yet: the golden snapshots in
// pool-game.test.ts pin today's ballSelection math exactly, and that stays authoritative
// until the pool is deliberately migrated.

import type { HoleData } from '../pool-game';
import { getMoneyStrokesOnHole } from '../money-games';

/** How a group of players produces ONE score for a hole. */
export type TeamFormat =
  | 'best-ball'        // lowest single net counts
  | 'two-best-net'     // two lowest nets added
  | 'two-best-gross'   // two lowest grosses added
  | 'net-and-gross'    // best net + best gross, from DIFFERENT players
  | 'combined'         // every member's net added
  | 'scramble'         // one ball, USGA tiered team handicap
  | 'alternate-shot';  // one ball, 60/40 combined × allowance

/** What that hole score is expressed as. */
export type ScoreBasis = 'stroke' | 'stableford';

/** True when the format is played with a single ball per team. */
export function isOneBall(format: TeamFormat): boolean {
  return format === 'scramble' || format === 'alternate-shot';
}

/** True when the format needs at least two scores to produce a team score. */
export function needsTwoScores(format: TeamFormat): boolean {
  return format === 'two-best-net' || format === 'two-best-gross' || format === 'net-and-gross';
}

/**
 * How many BALLS the format contributes to one hole's team score.
 *
 * This is the yardstick a team total has to be measured against: two balls of par 4 is 8,
 * so "even par" for a two-ball format is 8 on that hole, not 4. Every legacy pool
 * `ballSelection` happens to be two balls, which is why the old code could hard-code a
 * `× 2` — but scramble plays one and combined plays as many as the team has members, and
 * with the wrong count `toPar` stops being comparable between a team thru 9 and one thru
 * 18. That comparison is the only job it has.
 */
export function ballsPerHole(format: TeamFormat, memberCount: number): number {
  if (isOneBall(format) || format === 'best-ball') return 1;
  if (format === 'combined') return memberCount;
  return 2;
}

// Standard Stableford: 5/4/3/2/1/0 from albatross-or-better down to double-or-worse.
const SCALE = { albatrossOrBetter: 5, eagle: 4, birdie: 3, par: 2, bogey: 1, doubleOrWorse: 0 };

export function stablefordPoints(net: number, par: number): number {
  const diff = net - par;
  if (diff <= -3) return SCALE.albatrossOrBetter;
  if (diff === -2) return SCALE.eagle;
  if (diff === -1) return SCALE.birdie;
  if (diff === 0) return SCALE.par;
  if (diff === 1) return SCALE.bogey;
  return SCALE.doubleOrWorse;
}

/**
 * Everything a team-score calculation needs, so this module stays pure and works from
 * either a GameModeContext (single group) or a PoolGame (N foursomes).
 */
export interface TeamScoreInput {
  playerIds: string[];
  hole: HoleData;
  format: TeamFormat;
  grossOnHole(playerId: string): number | null;
  netOnHole(playerId: string): number | null;
  /** One-ball formats only: the team's combined handicap, and the hole count for allocation. */
  teamHandicap?: number;
  numHoles?: number;
}

/**
 * A team's NET score for one hole (lower is better), or null when it can't be scored yet.
 *
 * Note the asymmetry that trips people up: a two-ball format returns null until TWO members
 * have scored, while best-ball returns as soon as one has. That's deliberate — "two best
 * nets" from a single card isn't a team score.
 */
export function teamNetOnHole(input: TeamScoreInput): number | null {
  const { playerIds, hole, format, grossOnHole, netOnHole } = input;

  if (isOneBall(format)) {
    // ONE BALL MEANS ONE SCORE. Craig's rule: "if you start a game as a scramble or alt
    // shot, and dont declare a different format on the back 9 or different holes, I feel
    // there should only be one score entered per team." A pool has a single format for all
    // 18 holes (unlike a tournament's splitFormat), so there is no declared exception —
    // divergent per-member scores are data that should not exist, not a case to resolve.
    //
    // This used to read the FIRST member with a score, which made the team score — and the
    // payout — depend on the order of playerIds whenever members disagreed: the same round
    // paid +$75 or -$75 after reordering four names. Taking the minimum is
    // order-independent, and in the correct case (all members share the ball) min of equal
    // values IS that value, so nothing changes. The guarantee is structural rather than a
    // reliance on callers behaving.
    //
    // Divergence is PREVENTED upstream — the scorecard enters one shared score, and the hub
    // refuses to switch a scored game to a one-ball format. This is the backstop.
    let gross: number | null = null;
    for (const id of playerIds) {
      const g = grossOnHole(id);
      if (g !== null && (gross === null || g < gross)) gross = g;
    }
    if (gross === null) return null;
    const strokes = getMoneyStrokesOnHole(input.teamHandicap ?? 0, hole.handicap, input.numHoles ?? 18);
    return gross - strokes;
  }

  const nets: number[] = [];
  const grosses: number[] = [];
  const pairs: { gross: number; net: number }[] = [];
  for (const id of playerIds) {
    const n = netOnHole(id);
    const g = grossOnHole(id);
    if (n !== null) nets.push(n);
    if (g !== null) grosses.push(g);
    if (n !== null && g !== null) pairs.push({ gross: g, net: n });
  }

  switch (format) {
    case 'combined':
      return nets.length === 0 ? null : nets.reduce((s, n) => s + n, 0);

    case 'two-best-net': {
      if (nets.length < 2) return null;
      const sorted = [...nets].sort((a, b) => a - b);
      return sorted[0] + sorted[1];
    }

    case 'two-best-gross': {
      if (grosses.length < 2) return null;
      const sorted = [...grosses].sort((a, b) => a - b);
      return sorted[0] + sorted[1];
    }

    case 'net-and-gross': {
      // Best net from one player plus best gross from a DIFFERENT one — so a single
      // brilliant card can't supply both halves.
      if (pairs.length < 2) return null;
      let best = Infinity;
      for (let i = 0; i < pairs.length; i++) {
        for (let j = 0; j < pairs.length; j++) {
          if (i === j) continue;
          best = Math.min(best, pairs[i].net + pairs[j].gross);
        }
      }
      return best === Infinity ? null : best;
    }

    case 'best-ball':
    default:
      return nets.length === 0 ? null : Math.min(...nets);
  }
}

/**
 * A team's Stableford points for one hole (higher is better), or null when unscored.
 *
 * THE RULE: points are scored per BALL, off that ball's own score, and then added.
 * Whether a ball is net or gross is decided by the format — best-ball, combined and the
 * one-ball formats are net; two-best-gross is gross; net-and-gross is one of each — so the
 * points always come off the same score the money engine ranks, and the two can't diverge.
 *
 * Why it can't be "score the team's stroke total against par": a multi-ball format adds
 * two or four scores into one number, and comparing that to a SINGLE par is a double bogey
 * by construction. Every team scores 0 on nearly every hole, everyone ties, and the pot
 * splits evenly no matter how anyone played. That was live for two-best-gross and
 * net-and-gross; two-best-net already had the per-ball special case, which is what made
 * the other two look like they worked.
 */
export function teamStablefordOnHole(input: TeamScoreInput): number | null {
  const { playerIds, hole, format, grossOnHole, netOnHole } = input;
  const pts = (score: number) => stablefordPoints(score, hole.par);

  // One ball: the team's single net score is already a per-ball score.
  if (isOneBall(format)) {
    const net = teamNetOnHole(input);
    return net === null ? null : pts(net);
  }

  const netPts: number[] = [];
  const grossPts: number[] = [];
  const pairs: { net: number; gross: number }[] = [];
  for (const id of playerIds) {
    const n = netOnHole(id);
    const g = grossOnHole(id);
    if (n !== null) netPts.push(pts(n));
    if (g !== null) grossPts.push(pts(g));
    if (n !== null && g !== null) pairs.push({ net: pts(n), gross: pts(g) });
  }
  const desc = (a: number, b: number) => b - a;

  switch (format) {
    case 'combined':
      // Every member's own points added — not the combined net scored against par.
      return netPts.length === 0 ? null : netPts.reduce((s, p) => s + p, 0);

    case 'two-best-net': {
      if (netPts.length < 2) return null;
      const s = [...netPts].sort(desc);
      return s[0] + s[1];
    }

    case 'two-best-gross': {
      if (grossPts.length < 2) return null;
      const s = [...grossPts].sort(desc);
      return s[0] + s[1];
    }

    case 'net-and-gross': {
      // Best net points from one player plus best gross points from a DIFFERENT one, so a
      // single brilliant card can't supply both halves. Mirrors the stroke version, only
      // maximizing instead of minimizing.
      if (pairs.length < 2) return null;
      let best = -Infinity;
      for (let i = 0; i < pairs.length; i++) {
        for (let j = 0; j < pairs.length; j++) {
          if (i === j) continue;
          best = Math.max(best, pairs[i].net + pairs[j].gross);
        }
      }
      return best === -Infinity ? null : best;
    }

    case 'best-ball':
    default:
      // Most points off a single net ball. Equivalent to the lowest net, since points fall
      // monotonically as net rises against a fixed par — asserted in team-scoring.test.ts.
      return netPts.length === 0 ? null : Math.max(...netPts);
  }
}

/** The team's hole value under the chosen basis. */
export function teamValueOnHole(input: TeamScoreInput, basis: ScoreBasis): number | null {
  return basis === 'stableford' ? teamStablefordOnHole(input) : teamNetOnHole(input);
}

/** Under Stableford higher wins; under strokes lower wins. */
export function betterValue(basis: ScoreBasis, a: number, b: number): boolean {
  return basis === 'stableford' ? a > b : a < b;
}

/**
 * The "even" value for ONE hole — what a team that played to expectation scores on it.
 * Strokes: par per ball. Stableford: 2 points per ball (a par is worth 2).
 *
 * Subtracting this per scored hole is what makes a total comparable between a team thru 9
 * and a team thru 18. Without it, more holes played always looks like a better score under
 * strokes, and a worse one under points.
 */
export function evenValueOnHole(hole: { par: number }, basis: ScoreBasis, balls: number): number {
  return basis === 'stableford' ? 2 * balls : hole.par * balls;
}

/** Maps a legacy pool `ballSelection` to the equivalent generalized format. */
export function formatFromBallSelection(
  variant: '1-net-1-gross' | '2-best-net' | '2-best-gross',
): TeamFormat {
  switch (variant) {
    case '2-best-net': return 'two-best-net';
    case '2-best-gross': return 'two-best-gross';
    case '1-net-1-gross':
    default: return 'net-and-gross';
  }
}

/** The inverse: the legacy `ballSelection` a format is identical to, or null if it has none. */
export function ballSelectionFromFormat(
  format: TeamFormat,
): '1-net-1-gross' | '2-best-net' | '2-best-gross' | null {
  switch (format) {
    case 'two-best-net': return '2-best-net';
    case 'two-best-gross': return '2-best-gross';
    case 'net-and-gross': return '1-net-1-gross';
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Picking a format (the wizard's vocabulary)
// ---------------------------------------------------------------------------

/**
 * Every format an organizer can choose, in the order a golfer would recognize them, with
 * the wording the wizard shows.
 *
 * `legacyEquivalent` is the load-bearing field. Three of these are arithmetically identical
 * to a legacy `ballSelection`, so choosing them must save the game the OLD way — no
 * `teamFormat` at all. That keeps the opt-in path genuinely opt-in: a game only leaves the
 * snapshot-pinned code path when it's playing something that path cannot express.
 */
export interface TeamFormatOption {
  format: TeamFormat;
  label: string;
  /** One line on how the hole is scored, naming net or gross — it's decided by the format. */
  hint: string;
  legacyEquivalent: '1-net-1-gross' | '2-best-net' | '2-best-gross' | null;
  /** Members needed to score a hole; a two-ball format can't be played by a single golfer. */
  minPlayers: number;
}

export const TEAM_FORMAT_OPTIONS: TeamFormatOption[] = [
  {
    format: 'net-and-gross',
    label: 'Best net + best gross',
    hint: 'Two balls, from two different players — one net, one gross.',
    legacyEquivalent: '1-net-1-gross',
    minPlayers: 2,
  },
  {
    format: 'two-best-net',
    label: 'Two best net scores',
    hint: 'The two lowest net scores on the hole, added.',
    legacyEquivalent: '2-best-net',
    minPlayers: 2,
  },
  {
    format: 'two-best-gross',
    label: 'Two best gross scores',
    hint: 'The two lowest gross scores, added — no handicaps.',
    legacyEquivalent: '2-best-gross',
    minPlayers: 2,
  },
  {
    format: 'best-ball',
    label: 'Best ball',
    hint: 'The single lowest net score in the group counts.',
    legacyEquivalent: null,
    minPlayers: 1,
  },
  {
    format: 'combined',
    label: 'Combined — every ball counts',
    hint: "Everyone's net score added together. No hiding a bad hole.",
    legacyEquivalent: null,
    minPlayers: 1,
  },
  {
    format: 'scramble',
    label: 'Scramble',
    hint: 'One ball for the team, played off a USGA tiered team handicap.',
    legacyEquivalent: null,
    minPlayers: 1,
  },
  {
    format: 'alternate-shot',
    label: 'Alternate shot',
    hint: 'One ball, hit in turn, off 60/40 of the combined handicap.',
    legacyEquivalent: null,
    minPlayers: 1,
  },
];

/**
 * What to persist for a chosen (format, basis) pair.
 *
 * The whole point: a format with a legacy equivalent AND plain stroke scoring saves as a
 * legacy game (`teamFormat: undefined`), so it computes down the snapshot-pinned path and
 * settles exactly as every game before it. Anything else — a new format, or Stableford —
 * opts in.
 *
 * Pure and exported so the rule is unit-tested rather than living inside a component.
 */
export function persistedTeamScoring(
  format: TeamFormat,
  basis: ScoreBasis,
): {
  ballSelection: '1-net-1-gross' | '2-best-net' | '2-best-gross';
  teamFormat?: TeamFormat;
  teamScoreBasis?: ScoreBasis;
} {
  const legacy = ballSelectionFromFormat(format);
  if (legacy && basis === 'stroke') return { ballSelection: legacy };
  return {
    // ballSelection stays populated even on the generalized path: it's a required field,
    // it's what every legacy reader falls back to, and it keeps a game readable by an
    // older client. teamFormat takes precedence wherever both are read.
    ballSelection: legacy ?? '1-net-1-gross',
    teamFormat: format,
    teamScoreBasis: basis,
  };
}

/** The format a saved game is playing, whichever way it was stored. */
export function formatOfGame(game: {
  teamFormat?: TeamFormat;
  ballSelection?: '1-net-1-gross' | '2-best-net' | '2-best-gross';
}): TeamFormat {
  return game.teamFormat ?? formatFromBallSelection(game.ballSelection ?? '1-net-1-gross');
}

/**
 * The `TeamMode` whose USGA allowance applies to a format, so the wizard's recommendation
 * comes from the single table in `lib/formats.ts` (`TEAM_MODES[].usgaAllowance`) instead of
 * a second copy of the percentages that could drift from it.
 *
 * Two-ball formats map to `two-best-balls` (four-ball stroke play); scramble is 'tiered' by
 * team size, which is why the wizard shows no single number for it.
 */
export function teamModeForFormat(
  format: TeamFormat,
): 'best-ball' | 'two-best-balls' | 'combined' | 'scramble' | 'alternate-shot' {
  switch (format) {
    case 'best-ball': return 'best-ball';
    case 'combined': return 'combined';
    case 'scramble': return 'scramble';
    case 'alternate-shot': return 'alternate-shot';
    default: return 'two-best-balls';
  }
}
