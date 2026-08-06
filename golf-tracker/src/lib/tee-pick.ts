import type { CourseSelection, TeeSetOption } from './game-state';

// Choose a player's tee on a course — "the tee they typically play." Resolution,
// most-specific first:
//   1. Remembered tee by NAME, matched within the player's gender pool (exact —
//      the tee they last played, when this course has a tee by that name).
//   2. Remembered RELATIVE POSITION (defaultTeeRank, 0 = longest) within the
//      gender pool ranked by yardage — the cross-course fallback when the name
//      doesn't exist here (tee names differ course to course).
//   3. Gender default ("3 Stars" men / "1 Star" women — legacy Spring Creek).
//   4. First same-gender tee, else the course default.
//
// The gender pool + normalization exactly match the prior inline copies in the
// pool wizard and hub (extracted here so both share one implementation and the
// rank fallback lives in a single place).

// The player's gender pool of tees (by the tee's own gender flag; falls back to
// the "(W)" name convention, then all tees). Exported so callers can compute a
// tee's RANK against the same pool this picker uses.
export function genderTeePool(tees: TeeSetOption[], gender: 'M' | 'F' | undefined): TeeSetOption[] {
  const g: 'M' | 'F' = gender === 'F' ? 'F' : 'M';
  let pool = tees.filter((t) => t.gender === g);
  if (pool.length === 0) {
    pool = tees.filter((t) => (g === 'F' ? /\(w\)/i.test(t.name) : !/\(w\)/i.test(t.name)));
  }
  if (pool.length === 0) pool = tees;
  return pool;
}

// The gender pool ordered longest → shortest by yardage. Index 0 = longest tee,
// which is the meaning of defaultTeeRank.
function poolByLength(tees: TeeSetOption[], gender: 'M' | 'F' | undefined): TeeSetOption[] {
  return [...genderTeePool(tees, gender)].sort((a, b) => b.totalYardage - a.totalYardage);
}

const normTeeName = (n: string) => n.replace(/\s*\(w\)\s*$/i, '').trim().toLowerCase();

// A played/selected tee's relative rank (0 = longest) within a player's gender
// pool — what we persist as defaultTeeRank so the usual tee travels to courses
// with different tee names. Returns null if the tee isn't found.
export function teeRankInPool(
  course: CourseSelection | null,
  gender: 'M' | 'F' | undefined,
  teeSetId: number | undefined,
): number | null {
  if (!course || teeSetId == null) return null;
  const ordered = poolByLength(course.teeSets, gender);
  const idx = ordered.findIndex((t) => t.id === teeSetId);
  return idx < 0 ? null : idx;
}

export function pickTeeForPlayer(
  course: CourseSelection | null,
  gender: 'M' | 'F' | undefined,
  rememberedTeeName: string | null | undefined,
  rememberedRank?: number | null,
): number | undefined {
  if (!course || course.teeSets.length === 0) return undefined;
  const tees = course.teeSets;
  const g: 'M' | 'F' = gender === 'F' ? 'F' : 'M';
  const pool = genderTeePool(tees, gender);

  // 1) Remembered tee by name, within the gender pool.
  if (rememberedTeeName) {
    const want = normTeeName(rememberedTeeName);
    const hit = pool.find((t) => normTeeName(t.name) === want);
    if (hit) return hit.id;
  }

  // 2) Remembered relative position (cross-course fallback). Clamp to the pool
  //    so a course with fewer tees still resolves (e.g. rank 3 on a 3-tee course
  //    picks the most-forward tee).
  if (rememberedRank != null && rememberedRank >= 0) {
    const ordered = poolByLength(tees, gender);
    if (ordered.length > 0) {
      const clamped = Math.min(rememberedRank, ordered.length - 1);
      return ordered[clamped].id;
    }
  }

  // 3) Gender default (legacy Spring Creek names), by base name.
  const wantDefault = g === 'F' ? '1 star' : '3 stars';
  const def = pool.find((t) => normTeeName(t.name) === wantDefault);
  if (def) return def.id;

  // 4) First same-gender tee, else course default.
  return pool[0]?.id ?? course.selectedTeeId ?? tees[0]?.id ?? undefined;
}
