// F-043 — the handicap chain (explainPlayingHandicap) must NEVER disagree with
// the engine (getPoolPlayingHandicap). The chain mirrors the engine's branches
// step by step; this suite pins its final value to the engine's output across
// the full branch matrix, so a future edit to either one fails here before it
// can ship a disclosure that explains different math than the game charges.

import { describe, it, expect } from 'vitest';
import { explainPlayingHandicap, getPoolPlayingHandicap } from '@/lib/pool-game';
import type { CourseSelection, Player } from '@/lib/game-state';
import { makeCourse, makeTee, makePlayer } from './fixtures';

// A tee whose slope is far from 113, so index ≠ course handicap and the chain
// has real work to show: CH = idx × (131/113) + (71.5 − 72).
function slopeyCourse(): CourseSelection {
  return makeCourse({
    teeSets: [makeTee({
      ratings: [
        { type: 'Total', courseRating: 71.5, slopeRating: 131 },
        { type: 'Front', courseRating: 35.9, slopeRating: 128 },
        { type: 'Back', courseRating: 35.6, slopeRating: 134 },
      ],
    })],
  });
}

// F-023's shape: a tee with no usable ratings row at all (The Meadows).
function noRatingCourse(): CourseSelection {
  return makeCourse({ teeSets: [makeTee({ ratings: [] })] });
}

// A tee with an 18-hole rating but no Front/Back rows, so the USGA 9-hole basis
// has to fall back to half the full course handicap.
function noNineRatingCourse(): CourseSelection {
  return makeCourse({
    teeSets: [makeTee({ ratings: [{ type: 'Total', courseRating: 71.5, slopeRating: 131 }] })],
  });
}

describe('explainPlayingHandicap matches getPoolPlayingHandicap on every branch', () => {
  const players: Player[] = [
    makePlayer(1, 12.4),
    makePlayer(2, 0),                                    // genuine scratch
    makePlayer(3, -2.1),                                 // plus handicap
    makePlayer(4, 18.3),
    { ...makePlayer(5, 0), handicapIndex: null },        // no GHIN yet
  ];
  const courses: (CourseSelection | null)[] = [
    makeCourse(), slopeyCourse(), noRatingCourse(), noNineRatingCourse(), null,
  ];
  const allowances = [100, 90, 85];
  const bases = ['course', 'index'] as const;
  const nines = [null, 'front9', 'back9'] as const;

  it('value and playsOff agree with the engine across the whole matrix', () => {
    for (const player of players)
      for (const course of courses)
        for (const allowance of allowances)
          for (const basis of bases)
            for (const nine of nines) {
              const chain = explainPlayingHandicap(player, course, allowance, basis, nine);
              const engine = getPoolPlayingHandicap(player, course, allowance, basis, nine);
              const label = `idx=${player.handicapIndex} course=${course?.teeSets[0]?.ratings?.length ?? 'none'} allow=${allowance} basis=${basis} nine=${nine}`;
              expect(chain.value, label).toBe(engine);
              expect(chain.playsOff, label).toBe(Math.round(engine));
            }
  });
});

describe('the chain reads like the worked example', () => {
  it('shows index → course handicap (slope/rating/par) → allowance → plays off', () => {
    // 12.4 × (131/113) − 0.5 = 13.8752… → ×85% = 11.7939… → plays off 12.
    const chain = explainPlayingHandicap(makePlayer(1, 12.4), slopeyCourse(), 85, 'course', null);
    expect(chain.steps.map((s) => s.value)).toEqual(['12.4', '13.9', '11.8']);
    expect(chain.steps[0].label).toBe('Handicap index');
    expect(chain.steps[1].label).toContain('slope 131');
    expect(chain.steps[1].label).toContain('rating 71.5');
    expect(chain.steps[1].label).toContain('par 72');
    expect(chain.steps[2].label).toBe('× 85% allowance');
    expect(chain.playsOff).toBe(12);
    expect(chain.note).toBeUndefined();
  });

  it('hides the allowance line at 100% (it would repeat the previous number)', () => {
    const chain = explainPlayingHandicap(makePlayer(1, 12.4), slopeyCourse(), 100, 'course', null);
    expect(chain.steps.some((s) => s.label.includes('allowance'))).toBe(false);
  });

  it('says so when the tee has no slope/rating (F-023 honesty)', () => {
    const chain = explainPlayingHandicap(makePlayer(1, 12.4), noRatingCourse(), 100, 'course', null);
    expect(chain.note).toMatch(/no slope\/rating/i);
    expect(chain.value).toBe(12.4);
  });

  it("names the 'index' basis instead of pretending there was a conversion", () => {
    const chain = explainPlayingHandicap(makePlayer(1, 12.4), slopeyCourse(), 100, 'index', null);
    expect(chain.note).toMatch(/plays off the handicap index/i);
    expect(chain.steps).toHaveLength(1);
  });

  it('shows the halving and the 9-hole rating on the USGA 9-hole basis', () => {
    const chain = explainPlayingHandicap(makePlayer(1, 12.4), slopeyCourse(), 100, 'course', 'front9');
    expect(chain.steps.some((s) => s.label === 'Halved for 9 holes')).toBe(true);
    expect(chain.steps.some((s) => s.label.includes('9-hole course handicap'))).toBe(true);
  });

  it('explains a missing handicap index as playing off 0', () => {
    const chain = explainPlayingHandicap({ ...makePlayer(1, 0), handicapIndex: null }, makeCourse(), 100, 'course', null);
    expect(chain.playsOff).toBe(0);
    expect(chain.note).toMatch(/no handicap index/i);
  });
});
