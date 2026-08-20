// `groupShapesFor(N)` — the shared "what shapes fit N players?" rule.
//
// One helper answers the question for BOTH groupings (DECISIONS.md §5.ao, FINDINGS.md F-019 +
// F-020): playing groups (who walks together, 3–4 to a tee slot) and sides (who your money is
// with, a solo allowed). It's unit-tested here rather than trusted to the screens, because the
// whole point of extracting it was that the rule stops being invented twice.
//
// The behaviour under test is a RECOMMENDATION, not an enumeration: one balanced shape per group
// count, not every integer partition of N. Several assertions below pin that on purpose — if a
// later change starts returning all 22 partitions of 8, these fail, and they should.

import { describe, expect, it } from 'vitest';
import {
  groupShapesFor, groupShapeLabel, groupShapeIsObvious,
  TEE_GROUP_SHAPE_OPTS, SIDE_SHAPE_OPTS,
} from '@/lib/pool-game';

describe('groupShapesFor', () => {
  // The case Craig named, and the reason the helper exists: today 5 players silently become 3v2.
  // Unconstrained, [5] leads — "all five in one group" is a real answer for the SIDE axis
  // (nobody splits; it's just not a game, which is why SIDE_SHAPE_OPTS sets minGroups 2) and an
  // impossible one for the tee axis (max 4). The axis supplies the constraint, not the helper.
  it('offers 5 players the shapes Craig named, best-first', () => {
    expect(groupShapesFor(5, { minGroups: 2 })).toEqual([
      [3, 2],
      [2, 2, 1],
      [2, 1, 1, 1],
      [1, 1, 1, 1, 1],
    ]);
  });

  it('puts the FEWEST groups first, so the head of the list is the sane default', () => {
    for (const n of [4, 5, 6, 7, 8, 9, 12]) {
      const shapes = groupShapesFor(n);
      const counts = shapes.map((s) => s.length);
      expect([...counts]).toEqual([...counts].sort((a, b) => a - b));
    }
  });

  it('every shape sums to N and is descending', () => {
    for (let n = 1; n <= 16; n++) {
      for (const shape of groupShapesFor(n)) {
        expect(shape.reduce((s, x) => s + x, 0)).toBe(n);
        expect([...shape]).toEqual([...shape].sort((a, b) => b - a));
      }
    }
  });

  // The design decision worth pinning: shapes are BALANCED, so sizes never differ by more than 1.
  // This is what keeps the list short enough to choose from — [4,3,1] is a valid partition of 8
  // and deliberately absent, because manual adjustment covers it and a 22-item list does not help.
  it('returns the BALANCED shape per group count — never a spread wider than 1', () => {
    for (let n = 1; n <= 16; n++) {
      for (const shape of groupShapesFor(n)) {
        expect(shape[0] - shape[shape.length - 1]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('offers one shape per group count, and no duplicates', () => {
    for (let n = 1; n <= 16; n++) {
      const shapes = groupShapesFor(n);
      const counts = shapes.map((s) => s.length);
      expect(new Set(counts).size).toBe(counts.length);
      expect(new Set(shapes.map((s) => s.join(','))).size).toBe(shapes.length);
    }
  });

  // --- playing groups: min 2, max 4 (a fivesome is not a tee slot) --------------------

  describe('as PLAYING GROUPS (min 2, typical 3, max 4)', () => {
    const tee = TEE_GROUP_SHAPE_OPTS;

    // The `typical` rule, stated as its own case because it's the non-obvious half of the design:
    // ONE short group is a remainder, TWO short groups is a shape nobody plays.
    it('tolerates one short group but not two', () => {
      expect(groupShapesFor(8, tee)).toContainEqual([3, 3, 2]);   // one short — a real tee sheet
      expect(groupShapesFor(8, tee)).not.toContainEqual([2, 2, 2, 2]);
      expect(groupShapesFor(4, tee)).not.toContainEqual([2, 2]);  // a foursome, not two twosomes
      expect(groupShapesFor(6, tee)).not.toContainEqual([2, 2, 2]);
    });

    it('4 players walk as one foursome — and that is the only option', () => {
      expect(groupShapesFor(4, tee)).toEqual([[4]]);
      // So the wizard must not ask. An ordinary 2v2 gains no taps (the north star's
      // "just the usual game must never require touching one").
      expect(groupShapeIsObvious(4, tee)).toBe(true);
    });

    it('8 players are two foursomes, or three groups of 3/3/2', () => {
      expect(groupShapesFor(8, tee)).toEqual([[4, 4], [3, 3, 2]]);
    });

    // The F-019 headline: 8 players in ONE group is what the app claims today, and it is not a
    // shape a real day of golf can take.
    it('never offers a group bigger than four', () => {
      for (let n = 2; n <= 16; n++) {
        for (const shape of groupShapesFor(n, tee)) {
          expect(shape[0]).toBeLessThanOrEqual(4);
        }
      }
      expect(groupShapesFor(8, tee).some((s) => s.length === 1)).toBe(false);
    });

    it('supports 3-player groups explicitly — 7 players are 4+3', () => {
      expect(groupShapesFor(7, tee)[0]).toEqual([4, 3]);
      expect(groupShapesFor(6, tee)[0]).toEqual([3, 3]);
      // 5 can't be [4,1] under min 2, so the only fit is one group of 5 — which max 4 forbids.
      // Two groups of 3+2 is the answer, and it's the first one offered.
      expect(groupShapesFor(5, tee)[0]).toEqual([3, 2]);
    });

    it('5 players CANNOT walk as one group', () => {
      expect(groupShapesFor(5, tee)).not.toContainEqual([5]);
    });

    // A single golfer has no tee-group shape under min 2 — the caller must handle "nothing fits"
    // rather than get a nonsense answer.
    it('returns nothing when no shape fits', () => {
      expect(groupShapesFor(1, tee)).toEqual([]);
      expect(groupShapesFor(0, tee)).toEqual([]);
    });
  });

  // --- sides: min 1 (a solo is allowed), at least 2 sides ----------------------------

  describe('as SIDES (min 1, at least 2)', () => {
    const sides = SIDE_SHAPE_OPTS;

    it('never offers a single side — one side is not a game', () => {
      for (let n = 2; n <= 12; n++) {
        for (const shape of groupShapesFor(n, sides)) {
          expect(shape.length).toBeGreaterThanOrEqual(2);
        }
      }
      expect(groupShapesFor(4, sides)).not.toContainEqual([4]);
    });

    it('4 players: 2v2, or three sides, or four singles', () => {
      expect(groupShapesFor(4, sides)).toEqual([[2, 2], [2, 1, 1], [1, 1, 1, 1]]);
    });

    it('allows a SOLO side — the guest playing for themselves', () => {
      expect(groupShapesFor(5, sides)).toContainEqual([2, 2, 1]);
      expect(groupShapesFor(3, sides)).toContainEqual([2, 1]);
    });

    it('8 players at playersMax: 4v4 through eight singles', () => {
      expect(groupShapesFor(8, sides)[0]).toEqual([4, 4]);
      expect(groupShapesFor(8, sides)).toContainEqual([2, 2, 2, 2]);
      expect(groupShapesFor(8, sides)).toContainEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    });

    it('2 players have exactly one shape, so nothing is asked', () => {
      expect(groupShapesFor(2, sides)).toEqual([[1, 1]]);
      expect(groupShapeIsObvious(2, sides)).toBe(true);
    });
  });

  // --- the guard the callers rely on -------------------------------------------------

  describe('groupShapeIsObvious', () => {
    it('is true only when there is nothing to choose', () => {
      const tee = TEE_GROUP_SHAPE_OPTS;
      expect(groupShapeIsObvious(4, tee)).toBe(true);   // one foursome
      expect(groupShapeIsObvious(8, tee)).toBe(false);  // 4+4 or 3+3+2 — ASK (§5.ao)
      // 5 is obvious for TEE GROUPS (only 3+2 fits) but a genuine question for SIDES. The same
      // count, two different answers — which is the F-019 point that the axes are independent,
      // showing up in the helper. §5.ao's "5 could be 3v2 or five singles" was about sides.
      expect(groupShapeIsObvious(5, tee)).toBe(true);
      expect(groupShapeIsObvious(5, SIDE_SHAPE_OPTS)).toBe(false);
    });

    // "Nothing fits" is also nothing to choose. The caller checks the shape list itself before
    // relying on this, so it must not claim a choice exists where there is none.
    it('is true when NO shape fits at all', () => {
      expect(groupShapeIsObvious(1, { min: 2, max: 4 })).toBe(true);
    });
  });

  describe('groupShapeLabel', () => {
    it('reads the way a golfer would say it', () => {
      expect(groupShapeLabel([4, 4])).toBe('4 + 4');
      expect(groupShapeLabel([3, 2])).toBe('3 + 2');
      expect(groupShapeLabel([1, 1, 1, 1, 1])).toBe('1 + 1 + 1 + 1 + 1');
      expect(groupShapeLabel([4])).toBe('4');
    });
  });

  // --- degenerate input: a pure function should not throw on it ----------------------
  //
  // MUTATION-PROVED per DECISIONS.md §5.z (no money here, but the wizard's proposals come from
  // this and a silently-wrong shape list is how §5.ao's problem comes back):
  //
  //   | mutation                                              | cases failed |
  //   |-------------------------------------------------------|--------------|
  //   | M1  drop the `typical` rule (allow 2+2 and 2+2+2+2)   |  4           |
  //   | M2  off-by-one on `max` (>= instead of >)             |  4           |
  //   | M3  return most-groups-first instead of fewest-first  |  5           |
  //   | M4  ignore `minGroups` (offer a single side)          |  6           |

  it('handles nonsense options without throwing', () => {
    expect(groupShapesFor(4, { min: 5, max: 2 })).toEqual([]);   // max < min
    expect(groupShapesFor(4, { min: 0 })).toEqual([]);           // min below 1
    expect(groupShapesFor(-3)).toEqual([]);
    // minGroups above N: no shape can have more groups than players.
    expect(groupShapesFor(3, { minGroups: 9 })).toEqual([]);
  });
});
