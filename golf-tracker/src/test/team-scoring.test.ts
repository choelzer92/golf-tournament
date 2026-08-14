// Tests for the generalized team-scoring rules (FINDINGS.md F-006).
//
// The load-bearing test is EQUIVALENCE: the generalized code must reproduce
// bestBallTeamHoleScore's numbers exactly for the three legacy ballSelection variants.
// If it doesn't, migrating the classic pool would change how existing games settle.

import { describe, expect, it } from 'vitest';
import { bestBallTeamHoleScore } from '@/lib/live-scoring';
import {
  ballSelectionFromFormat,
  ballsPerHole,
  betterValue,
  evenValueOnHole,
  formatFromBallSelection,
  formatOfGame,
  isOneBall,
  needsTwoScores,
  persistedTeamScoring,
  stablefordPoints,
  teamNetOnHole,
  teamStablefordOnHole,
  TEAM_FORMAT_OPTIONS,
  type TeamFormat,
} from '@/lib/game-modes/team-scoring';

const hole = { number: 4, par: 4, handicap: 4 };

// A helper mirroring how the pool feeds scores in: per-player gross + net.
function input(
  cards: Record<string, { gross: number; net: number } | null>,
  format: TeamFormat,
  extra: { teamHandicap?: number; numHoles?: number } = {},
) {
  return {
    playerIds: Object.keys(cards),
    hole,
    format,
    grossOnHole: (id: string) => cards[id]?.gross ?? null,
    netOnHole: (id: string) => cards[id]?.net ?? null,
    ...extra,
  };
}

// --- EQUIVALENCE with the shipped engine ------------------------------------

describe('equivalence with bestBallTeamHoleScore', () => {
  // Several shapes, including ties and a player who out-scores on both measures.
  const FIELDS = [
    { p1: { gross: 5, net: 4 }, p2: { gross: 4, net: 4 }, p3: { gross: 6, net: 5 }, p4: { gross: 7, net: 6 } },
    { p1: { gross: 4, net: 3 }, p2: { gross: 6, net: 6 }, p3: { gross: 5, net: 4 }, p4: { gross: 8, net: 6 } },
    { p1: { gross: 3, net: 3 }, p2: { gross: 3, net: 3 }, p3: { gross: 3, net: 3 }, p4: { gross: 3, net: 3 } },
    { p1: { gross: 9, net: 5 }, p2: { gross: 4, net: 4 }, p3: { gross: 7, net: 4 }, p4: { gross: 5, net: 5 } },
  ] as const;

  const VARIANTS = ['1-net-1-gross', '2-best-net', '2-best-gross'] as const;

  for (const variant of VARIANTS) {
    it(`${variant} matches the legacy result on every field`, () => {
      for (const cards of FIELDS) {
        const legacy = bestBallTeamHoleScore(Object.values(cards), variant);
        const generalized = teamNetOnHole(input({ ...cards }, formatFromBallSelection(variant)));
        expect(generalized).toBe(legacy);
      }
    });
  }

  it('matches when only two of four have scored', () => {
    const cards = { p1: { gross: 5, net: 4 }, p2: { gross: 6, net: 5 }, p3: null, p4: null };
    for (const variant of VARIANTS) {
      const legacy = bestBallTeamHoleScore(
        Object.values(cards).filter((c): c is { gross: number; net: number } => !!c),
        variant,
      );
      expect(teamNetOnHole(input(cards, formatFromBallSelection(variant)))).toBe(legacy);
    }
  });

  it('returns null for a two-ball format with only ONE score, like the legacy engine', () => {
    const cards = { p1: { gross: 5, net: 4 }, p2: null, p3: null, p4: null };
    for (const variant of VARIANTS) {
      expect(bestBallTeamHoleScore([{ gross: 5, net: 4 }], variant)).toBeNull();
      expect(teamNetOnHole(input(cards, formatFromBallSelection(variant)))).toBeNull();
    }
  });
});

// --- the NEW formats the pool couldn't express -----------------------------

describe('formats the classic pool could not express', () => {
  const four = { p1: { gross: 5, net: 4 }, p2: { gross: 4, net: 4 }, p3: { gross: 6, net: 5 }, p4: { gross: 7, net: 6 } };

  it('best-ball takes the single lowest net', () => {
    expect(teamNetOnHole(input(four, 'best-ball'))).toBe(4);
  });

  it('best-ball needs only ONE score (unlike the two-ball formats)', () => {
    expect(teamNetOnHole(input({ p1: { gross: 9, net: 7 }, p2: null }, 'best-ball'))).toBe(7);
  });

  it('combined adds every member', () => {
    expect(teamNetOnHole(input(four, 'combined'))).toBe(4 + 4 + 5 + 6);
  });

  it('scramble uses ONE ball and the team handicap', () => {
    // All members share the gross; a team handicap of 18 gives a stroke on every hole.
    const cards = { p1: { gross: 4, net: 4 }, p2: { gross: 4, net: 4 } };
    expect(teamNetOnHole(input(cards, 'scramble', { teamHandicap: 18, numHoles: 18 }))).toBe(3);
    // With no team handicap the net IS the gross.
    expect(teamNetOnHole(input(cards, 'scramble', { teamHandicap: 0, numHoles: 18 }))).toBe(4);
  });

  it('alternate shot behaves as a one-ball format too', () => {
    expect(isOneBall('alternate-shot')).toBe(true);
    expect(isOneBall('best-ball')).toBe(false);
  });

  it('scores Stableford points for a team', () => {
    // Best-ball net 4 on a par 4 = par = 2 points.
    expect(teamStablefordOnHole(input(four, 'best-ball'))).toBe(2);
  });

  it('combined Stableford sums each member\'s OWN points, not the combined net', () => {
    // Nets 4,4,5,6 on a par 4 => 2 + 2 + 1 + 0 = 5 points. Scoring the combined net (19)
    // would give 0, which is not what "combined Stableford" means.
    expect(teamStablefordOnHole(input(four, 'combined'))).toBe(5);
  });

  it('two-best-net Stableford adds the two best point scores', () => {
    // Nets 4,4,5,6 -> points 2,2,1,0 -> two best = 4.
    expect(teamStablefordOnHole(input(four, 'two-best-net'))).toBe(4);
  });
});

// --- points come off each BALL, never off a multi-ball total ----------------
//
// The bug this pins: a multi-ball format adds two or four scores into one number, and
// scoring THAT against a single par is a double bogey by construction. two-best-gross and
// net-and-gross both did it, so every team scored 0 on nearly every hole, everyone tied,
// and the pot split evenly regardless of play. two-best-net had a per-ball special case,
// which is exactly why the other two looked like they worked.

describe('Stableford points are per-ball', () => {
  // gross 5/4/6/7 → net 4/4/5/6 on a par 4.
  // gross points: 1,2,0,0     net points: 2,2,1,0
  const four = { p1: { gross: 5, net: 4 }, p2: { gross: 4, net: 4 }, p3: { gross: 6, net: 5 }, p4: { gross: 7, net: 6 } };

  it('two-best-gross adds the two best GROSS point scores', () => {
    // Gross points 1,2,0,0 → two best = 3. Scoring the summed gross (4+5=9) against par 4
    // gave 0 — a double bogey by arithmetic, not by play.
    expect(teamStablefordOnHole(input(four, 'two-best-gross'))).toBe(3);
    expect(teamStablefordOnHole(input(four, 'two-best-gross'))).not.toBe(0);
  });

  it('net-and-gross adds best net points + best gross points from DIFFERENT players', () => {
    // Best net points = 2 (p1 or p2); best gross points from another player = 2 (p2's gross 4).
    // p1 net (2) + p2 gross (2) = 4.
    expect(teamStablefordOnHole(input(four, 'net-and-gross'))).toBe(4);
    expect(teamStablefordOnHole(input(four, 'net-and-gross'))).not.toBe(0);
  });

  it('net-and-gross cannot take both halves from ONE player', () => {
    // p1 is brilliant on both measures; p2 is hopeless. The pair must be p1-net + p2-gross,
    // never p1 twice.
    const cards = { p1: { gross: 2, net: 2 }, p2: { gross: 9, net: 9 } };
    // p1 net 2 on a par 4 = eagle = 4 pts. p2 gross 9 = 0 pts. So 4 + 0 = 4,
    // NOT p1's 4 + 4 = 8.
    expect(teamStablefordOnHole(input(cards, 'net-and-gross'))).toBe(4);
  });

  it('every multi-ball format beats a par-team on a hole where it outplayed them', () => {
    // A birdie-and-par team must out-point an all-pars team under EVERY format. Under the
    // old math both scored 0 and the hole was halved.
    const better = { p1: { gross: 3, net: 3 }, p2: { gross: 4, net: 4 }, p3: { gross: 4, net: 4 }, p4: { gross: 4, net: 4 } };
    const pars = { p1: { gross: 4, net: 4 }, p2: { gross: 4, net: 4 }, p3: { gross: 4, net: 4 }, p4: { gross: 4, net: 4 } };
    const FORMATS: TeamFormat[] = ['best-ball', 'two-best-net', 'two-best-gross', 'net-and-gross', 'combined'];
    for (const f of FORMATS) {
      const a = teamStablefordOnHole(input(better, f))!;
      const b = teamStablefordOnHole(input(pars, f))!;
      expect(a, f).toBeGreaterThan(b);
    }
  });

  it('two-ball formats still need TWO scores under Stableford', () => {
    const one = { p1: { gross: 4, net: 4 }, p2: null };
    for (const f of ['two-best-net', 'two-best-gross', 'net-and-gross'] as TeamFormat[]) {
      expect(teamStablefordOnHole(input(one, f)), f).toBeNull();
    }
    // best-ball scores off one, as it does under strokes.
    expect(teamStablefordOnHole(input(one, 'best-ball'))).toBe(2);
  });

  it('best-ball points agree with the lowest-net ball', () => {
    // Points fall monotonically as net rises against a fixed par, so "most points off one
    // net ball" and "the lowest net ball" must always name the same score.
    for (const cards of [four, { p1: { gross: 7, net: 6 }, p2: { gross: 5, net: 3 } }]) {
      const bestNet = teamNetOnHole(input(cards, 'best-ball'))!;
      expect(teamStablefordOnHole(input(cards, 'best-ball'))).toBe(stablefordPoints(bestNet, hole.par));
    }
  });
});

describe('ballsPerHole', () => {
  it('counts the balls each format actually plays', () => {
    // The yardstick a team total is measured against. A wrong count makes `toPar`
    // incomparable between a team thru 9 and one thru 18 — its only purpose.
    expect(ballsPerHole('best-ball', 4)).toBe(1);
    expect(ballsPerHole('scramble', 4)).toBe(1);
    expect(ballsPerHole('alternate-shot', 4)).toBe(1);
    expect(ballsPerHole('two-best-net', 4)).toBe(2);
    expect(ballsPerHole('two-best-gross', 4)).toBe(2);
    expect(ballsPerHole('net-and-gross', 4)).toBe(2);
    // Combined scales with the roster — a threesome plays three balls, not four.
    expect(ballsPerHole('combined', 4)).toBe(4);
    expect(ballsPerHole('combined', 3)).toBe(3);
    expect(ballsPerHole('combined', 2)).toBe(2);
  });

  it('every legacy ballSelection is two balls (why the old hard-coded x2 worked)', () => {
    for (const v of ['1-net-1-gross', '2-best-net', '2-best-gross'] as const) {
      expect(ballsPerHole(formatFromBallSelection(v), 4)).toBe(2);
    }
  });
});

describe('evenValueOnHole', () => {
  it('is par per ball under strokes, and 2 points per ball under Stableford', () => {
    const par4 = { par: 4 };
    expect(evenValueOnHole(par4, 'stroke', 1)).toBe(4);
    expect(evenValueOnHole(par4, 'stroke', 2)).toBe(8);
    expect(evenValueOnHole(par4, 'stroke', 4)).toBe(16);
    // A par is worth 2 points whatever the hole's par, so the points yardstick doesn't
    // depend on par at all.
    expect(evenValueOnHole(par4, 'stableford', 1)).toBe(2);
    expect(evenValueOnHole({ par: 3 }, 'stableford', 1)).toBe(2);
    expect(evenValueOnHole({ par: 5 }, 'stableford', 1)).toBe(2);
    expect(evenValueOnHole(par4, 'stableford', 4)).toBe(8);
  });
});

describe('stablefordPoints', () => {
  it('scores the standard scale off par', () => {
    expect(stablefordPoints(1, 4)).toBe(5);   // albatross or better
    expect(stablefordPoints(2, 4)).toBe(4);   // eagle
    expect(stablefordPoints(3, 4)).toBe(3);   // birdie
    expect(stablefordPoints(4, 4)).toBe(2);   // par
    expect(stablefordPoints(5, 4)).toBe(1);   // bogey
    expect(stablefordPoints(6, 4)).toBe(0);   // double or worse
    expect(stablefordPoints(9, 4)).toBe(0);
  });
});

describe('betterValue', () => {
  it('flips direction with the basis', () => {
    expect(betterValue('stroke', 4, 5)).toBe(true);      // lower net wins
    expect(betterValue('stableford', 4, 5)).toBe(false); // higher points win
  });
});

// --- what the wizard PERSISTS ------------------------------------------------
//
// The safety rule for F-006's UI: choosing a format that a legacy `ballSelection` already
// expresses, with plain stroke scoring, must save the game the OLD way — no teamFormat.
// Otherwise shipping the picker would silently move every new ordinary pool onto the new
// code path, and "existing games settle identically" would only be true of games created
// before today.

describe('persistedTeamScoring', () => {
  it('saves the three legacy formats as legacy games (no teamFormat)', () => {
    const CASES = [
      ['net-and-gross', '1-net-1-gross'],
      ['two-best-net', '2-best-net'],
      ['two-best-gross', '2-best-gross'],
    ] as const;
    for (const [format, ballSelection] of CASES) {
      const saved = persistedTeamScoring(format, 'stroke');
      expect(saved, format).toEqual({ ballSelection });
      expect(saved.teamFormat, format).toBeUndefined();
      expect(saved.teamScoreBasis, format).toBeUndefined();
    }
  });

  it('opts in for a format the legacy path cannot express', () => {
    for (const format of ['best-ball', 'combined', 'scramble', 'alternate-shot'] as TeamFormat[]) {
      const saved = persistedTeamScoring(format, 'stroke');
      expect(saved.teamFormat, format).toBe(format);
      expect(saved.teamScoreBasis, format).toBe('stroke');
      // ballSelection is still populated — it's required, and it's what an older client
      // would fall back to reading.
      expect(saved.ballSelection, format).toBeTruthy();
    }
  });

  it('opts in for Stableford even on a legacy format', () => {
    // Same ball selection, different basis: the legacy path is strokes-only, so this MUST
    // carry teamFormat or the points would be silently computed as strokes.
    const saved = persistedTeamScoring('two-best-net', 'stableford');
    expect(saved.teamFormat).toBe('two-best-net');
    expect(saved.teamScoreBasis).toBe('stableford');
    expect(saved.ballSelection).toBe('2-best-net');
  });

  it('round-trips: whatever is saved reads back as the format chosen', () => {
    for (const opt of TEAM_FORMAT_OPTIONS) {
      for (const basis of ['stroke', 'stableford'] as const) {
        expect(formatOfGame(persistedTeamScoring(opt.format, basis)), `${opt.format}/${basis}`)
          .toBe(opt.format);
      }
    }
  });
});

describe('ballSelectionFromFormat', () => {
  it('inverts formatFromBallSelection exactly', () => {
    for (const v of ['1-net-1-gross', '2-best-net', '2-best-gross'] as const) {
      expect(ballSelectionFromFormat(formatFromBallSelection(v))).toBe(v);
    }
  });

  it('is null for the formats with no legacy equivalent', () => {
    for (const f of ['best-ball', 'combined', 'scramble', 'alternate-shot'] as TeamFormat[]) {
      expect(ballSelectionFromFormat(f), f).toBeNull();
    }
  });
});

describe('TEAM_FORMAT_OPTIONS', () => {
  it('covers every TeamFormat exactly once', () => {
    // A format missing here is unreachable in the UI; a duplicate renders twice.
    const ALL: TeamFormat[] = [
      'best-ball', 'two-best-net', 'two-best-gross', 'net-and-gross',
      'combined', 'scramble', 'alternate-shot',
    ];
    const listed = TEAM_FORMAT_OPTIONS.map((o) => o.format);
    expect([...listed].sort()).toEqual([...ALL].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('agrees with the engine on legacy equivalence and ball count', () => {
    for (const o of TEAM_FORMAT_OPTIONS) {
      expect(o.legacyEquivalent, o.format).toBe(ballSelectionFromFormat(o.format));
      // needsTwoScores is what the engine enforces; minPlayers is what the UI promises.
      expect(o.minPlayers, o.format).toBe(needsTwoScores(o.format) ? 2 : 1);
    }
  });

  it('gives every option a label and a hint that names net or gross', () => {
    for (const o of TEAM_FORMAT_OPTIONS) {
      expect(o.label.length, o.format).toBeGreaterThan(0);
      // Net-or-gross is decided by the format, so the hint has to say which.
      expect(o.hint, o.format).toMatch(/net|gross|handicap/i);
    }
  });
});
