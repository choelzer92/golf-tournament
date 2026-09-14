'use client';

import { useState, useEffect } from 'react';
import type { CourseSelection, TeeSetOption } from '@/lib/game-state';
import { saveGhinIdentity, getCreatorGhin } from '@/lib/pool-identity';
import { getRecentCourses, hydratePoolGames } from '@/lib/pool-game';
import { getToken } from './shared';

export function CourseStep({
  course, setCourse, holesPlaying, setHolesPlaying, nineHandicapBasis, setNineHandicapBasis, onNext, onBack,
}: {
  course: CourseSelection | null;
  setCourse: (c: CourseSelection | null) => void;
  holesPlaying: '18' | 'front9' | 'back9';
  setHolesPlaying: (v: '18' | 'front9' | 'back9') => void;
  nineHandicapBasis: '18' | '9';
  setNineHandicapBasis: (v: '18' | '9') => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [searchName, setSearchName] = useState('');
  const [searchState, setSearchState] = useState('VA');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [noToken, setNoToken] = useState(false);
  const [ghinUser, setGhinUser] = useState('');
  const [ghinPass, setGhinPass] = useState('');
  const [authError, setAuthError] = useState('');

  // JY (real user, via the organizer link): "Once you create a game it goes to select
  // course. Can it check to see if you are signed into GHIN before that? I go to select
  // course then it pops up and says sign in to GHIN."
  //
  // `noToken` used to be set only INSIDE search(), i.e. after typing a course name and
  // submitting — so the login prompt arrived as an interruption after wasted effort.
  // Check on mount instead: the sign-in card renders immediately, above the search box,
  // so it's the first thing on the step rather than a reaction to a failed action.
  useEffect(() => {
    if (!getToken()) setNoToken(true);
  }, []);

  // Recent courses — JY: "if it could save previously selected courses so you don't have
  // to type it in every time." Derived from games already played (no new storage), and
  // each carries its full tee/rating data, so picking one needs no GHIN call at all.
  const [recent, setRecent] = useState<CourseSelection[]>([]);
  useEffect(() => {
    hydratePoolGames()
      .then(() => setRecent(getRecentCourses(getCreatorGhin())))
      .catch(() => {});
  }, []);

  async function quickAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/ghin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ghinUser, password: ghinPass }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'Login failed');
        return;
      }
      sessionStorage.setItem('ghin_token', data.token);
      // Capture the organizer's GHIN identity so games they create are tied to
      // them (their "My Pool Games" history). Persisted to local storage too so
      // it survives a tab close.
      if (data.golfer) saveGhinIdentity(data.golfer);
      setNoToken(false);
    } catch {
      setAuthError('Connection error');
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) { setNoToken(true); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/ghin/courses/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: searchName, state: searchState }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.courses || []);
      } else {
        sessionStorage.removeItem('ghin_token');
        setNoToken(true);
        setError(data.error || 'Search failed — try logging in again');
      }
    } catch {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  }

  async function selectCourse(courseResult: any) {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch('/api/ghin/courses/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, course_id: courseResult.CourseID }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }

      const courseData = data.course;
      const allTeeSets: TeeSetOption[] = (courseData.TeeSets || []).map((ts: any) => ({
        id: ts.TeeSetRatingId,
        name: ts.TeeSetRatingName,
        gender: ts.Gender === 'Female' ? 'F' as const : 'M' as const,
        totalYardage: ts.TotalYardage,
        totalPar: ts.TotalPar,
        ratings: (ts.Ratings || []).map((r: any) => ({
          type: r.RatingType,
          courseRating: r.CourseRating,
          slopeRating: r.SlopeRating,
        })),
        holes: (ts.Holes || []).map((h: any) => ({
          number: h.Number,
          par: h.Par,
          yardage: h.Length,
          handicap: h.Allocation,
        })),
      }));
      // F-038: GHIN returns tees in no reliable order (The Meadows arrives Gold, Green, Blue,
      // White). Sort each gender block longest-first, like tee-pick.ts — the picker then reads
      // tips → forward, and the `teeSets[0]` default below lands on a deliberate tee, not
      // whatever the payload happened to list first.
      const byYardageDesc = (a: TeeSetOption, b: TeeSetOption) => (b.totalYardage ?? 0) - (a.totalYardage ?? 0);
      const mensTeeSets = allTeeSets.filter((t) => t.gender === 'M').sort(byYardageDesc);
      const womensTeeSets = allTeeSets.filter((t) => t.gender === 'F').sort(byYardageDesc);
      // Suffix women's tees with (W), but idempotently — never produce "(W) (W)"
      // if GHIN already includes it.
      const teeSets = mensTeeSets.length > 0
        ? [...mensTeeSets, ...womensTeeSets.map((t) => ({ ...t, name: /\(w\)/i.test(t.name) ? t.name : `${t.name} (W)` }))]
        : [...allTeeSets].sort(byYardageDesc);

      setCourse({
        courseId: courseResult.CourseID,
        courseName: courseResult.CourseName || courseData.CourseName,
        city: courseResult.City || courseData.CourseCity || '',
        state: courseResult.State || courseData.CourseState || '',
        teeSets,
        selectedTeeId: teeSets[0]?.id || null,
      });
      setResults([]);
    } catch {
      setError('Failed to load course');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Course</h2>

      {/* One tap to reuse a course you've already played — shown ABOVE the GHIN prompt,
          because this path needs no login at all. */}
      {recent.length > 0 && !course && (
        <div className="rounded-lg bg-white shadow p-4 mb-4">
          <p className="text-sm font-medium text-gray-800 mb-1">Played recently</p>
          <p className="text-xs text-gray-500 mb-2">Pick one to skip the search — tees and ratings are already saved.</p>
          <div className="flex flex-wrap gap-2">
            {recent.map((c) => (
              <button
                key={c.courseId}
                type="button"
                onClick={() => setCourse(c)}
                className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-green-400"
              >
                {c.courseName}
                {c.city ? <span className="ml-1 text-xs text-gray-400">{c.city}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {noToken && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4 space-y-2">
          {/* Shown on arrival now, not after a failed search — so it reads as a
              heads-up, not an error. Deliberately NOT a gate: the step still works
              without it (a saved course or manual entry), and a share-link organizer
              may have no GHIN at all. */}
          <p className="text-sm text-amber-800 font-medium">Sign in to GHIN to search for a course</p>
          <p className="text-xs text-amber-700">Course search uses your GHIN login. It&apos;s only needed to look up the course and tees.</p>
          <form onSubmit={quickAuth} className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={ghinUser}
              onChange={(e) => setGhinUser(e.target.value)}
              placeholder="GHIN email"
              className="flex-1 min-w-[140px] rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            <input
              type="password"
              value={ghinPass}
              onChange={(e) => setGhinPass(e.target.value)}
              placeholder="Password"
              className="flex-1 min-w-[140px] rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            <button type="submit" className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white font-medium hover:bg-amber-700">
              Login
            </button>
          </form>
          {authError && <p className="text-xs text-red-600">{authError}</p>}
        </div>
      )}

      <form onSubmit={search} className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          placeholder="Course name"
          className="flex-1 min-w-[200px] rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <input
          type="text"
          value={searchState}
          onChange={(e) => setSearchState(e.target.value.toUpperCase())}
          placeholder="State"
          maxLength={2}
          className="w-20 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <button type="submit" disabled={loading} className="rounded-md bg-green-700 px-4 py-2 text-white font-medium hover:bg-green-800 disabled:opacity-50">
          {loading ? '...' : 'Search'}
        </button>
      </form>

      {error && <p className="text-red-600 mb-4 text-sm">{error}</p>}

      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
          <ul className="divide-y divide-gray-200">
            {results.map((c: any) => (
              <li key={c.CourseID}>
                <button onClick={() => selectCourse(c)} disabled={loading} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition">
                  <p className="font-medium text-gray-900">{c.CourseName}</p>
                  <p className="text-sm text-gray-500">{c.FacilityName} — {c.City}, {c.State}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {course && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium text-gray-900">{course.courseName}</p>
              <p className="text-sm text-gray-500">{course.city}{course.city && course.state ? ', ' : ''}{course.state}</p>
            </div>
            <button onClick={() => setCourse(null)} className="text-red-500 hover:text-red-700 text-sm">
              Clear
            </button>
          </div>
          {course.teeSets.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Tee</label>
              <select
                value={course.selectedTeeId || ''}
                onChange={(e) => setCourse({ ...course, selectedTeeId: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                {course.teeSets.map((ts) => (
                  <option key={ts.id} value={ts.id}>
                    {ts.name} ({ts.totalYardage} yds)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Holes played. 18 (default) keeps the classic front/back/overall pot
              split; a nine puts the whole pot on the nine and reveals the
              handicap-basis choice below. */}
          <div className="mt-4 pt-3 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-1">Holes</label>
            <div className="flex gap-2">
              {([
                { v: '18', label: '18 holes' },
                { v: 'front9', label: 'Front 9' },
                { v: 'back9', label: 'Back 9' },
              ] as const).map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setHolesPlaying(v)}
                  className={`flex-1 min-h-[44px] rounded-md border px-3 py-2.5 text-sm font-medium ${
                    holesPlaying === v ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {holesPlaying !== '18' && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">9-hole handicap</label>
                <div className="flex gap-2">
                  {([
                    { v: '18', label: 'Half of 18-hole' },
                    { v: '9', label: '9-hole (USGA)' },
                  ] as const).map(({ v, label }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setNineHandicapBasis(v)}
                      className={`flex-1 min-h-[44px] rounded-md border px-3 py-2.5 text-sm font-medium ${
                        nineHandicapBasis === v ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {nineHandicapBasis === '18'
                    ? 'Most casual games: take each player’s full 18-hole course handicap and give strokes on this nine using the regular 18-hole stroke index (so a player gets roughly half their strokes).'
                    : 'USGA-proper: use the tee’s 9-hole rating with the handicap halved, and re-rank the stroke index 1–9 for this nine. More technically correct, less common casually.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!course}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Set Tees
      </button>
    </div>
  );
}

