'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCreatorGhin, getCreatorName } from '@/lib/pool-identity';
import { parseGhinIndex, type CourseSelection, type TeeSetOption } from '@/lib/game-state';
import { GhinLoginModal } from '@/components/ghin-login-modal';
import {
  buildEmptyHoles,
  hydrateSoloRounds,
  getSoloRoundList,
  getSoloRoundListForGhin,
  saveSoloRound,
  saveRoundLocal,
  type SoloRound,
  type SoloRoundListItem,
} from '@/lib/solo-round';
import { getAccessLevel } from '@/lib/invite-gate';

// Solo round landing + start flow. The heart of the golf trainer (Layer 1):
// a single player logs each shot (club + shape + GPS) to learn their real
// per-club distances. This page lists your rounds and starts a new one
// (course → tee → holes). Full-access only — not on the pool share-link path.

const getToken = () => (typeof window !== 'undefined' ? sessionStorage.getItem('ghin_token') : null);

type Mode = 'list' | 'course' | 'setup';

interface CourseResult {
  CourseID: number;
  CourseName?: string;
  FacilityName?: string;
  City?: string;
  State?: string;
}

const holesLabel: Record<SoloRound['holesPlaying'], string> = {
  '18': '18 holes',
  front9: 'Front 9',
  back9: 'Back 9',
};

export default function SoloLandingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [rounds, setRounds] = useState<SoloRoundListItem[]>([]);
  const [mode, setMode] = useState<Mode>('list');
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push('/');
      return;
    }
    setName(getCreatorName());
    hydrateSoloRounds().then(() => {
      refreshList();
      setReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function refreshList() {
    const ghin = getCreatorGhin();
    const isOwner = getAccessLevel() === 'full';
    setRounds(isOwner ? getSoloRoundList() : ghin !== null ? getSoloRoundListForGhin(ghin) : []);
  }

  if (!ready) {
    return (
      <div className="min-h-full bg-gray-50">
        <p className="text-center text-gray-400 py-16">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Solo round</h1>
            {name && <p className="text-sm text-green-200">{name}</p>}
          </div>
          <button onClick={() => router.push('/home')} className="text-sm text-green-200 hover:text-white">
            Home
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {mode === 'list' && (
          <>
            <button
              onClick={() => setMode('course')}
              className="w-full rounded-lg bg-green-700 px-6 py-5 text-white text-left hover:bg-green-800 shadow-md"
            >
              <p className="font-bold text-lg">Start a round</p>
              <p className="text-sm text-green-100 mt-0.5">
                Log every shot by voice or tap — learn how far you really hit each club.
              </p>
            </button>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Your rounds</h2>
              {rounds.length === 0 ? (
                <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
                  No solo rounds yet. Tap <span className="font-medium">Start a round</span> to begin. Say
                  your shot (&ldquo;full 6 iron&rdquo;) or tap the club — GPS between shots measures your
                  real distances.
                </p>
              ) : (
                <div className="space-y-2">
                  {rounds.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => router.push(`/solo/${r.id}`)}
                      className={`w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition ${r.status === 'finished' ? 'opacity-75' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900 truncate">{r.courseName}</p>
                        <span
                          className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${r.status === 'playing' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                        >
                          {r.status === 'playing' ? 'in progress' : 'finished'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {new Date(r.startedAt).toLocaleDateString()} · {holesLabel[r.holesPlaying]} ·{' '}
                        {r.shotCount} shot{r.shotCount !== 1 ? 's' : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {(mode === 'course' || mode === 'setup') && (
          <StartFlow
            onCancel={() => setMode('list')}
            onExpiredToken={() => setShowLogin(true)}
            onStarted={(round) => {
              saveSoloRound(round);
              saveRoundLocal(round);
              router.push(`/solo/${round.id}`);
            }}
          />
        )}
      </main>

      <GhinLoginModal
        open={showLogin}
        onDoneAction={() => setShowLogin(false)}
        onCloseAction={() => setShowLogin(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Start flow: course search → details → tee + holes → create round.
// The GHIN → CourseSelection/TeeSetOption mapping mirrors game/new's CourseStep
// (kept lean here: a single tee, no per-player anything).
// ---------------------------------------------------------------------------

function StartFlow({
  onCancel,
  onStarted,
  onExpiredToken,
}: {
  onCancel: () => void;
  onStarted: (round: SoloRound) => void;
  onExpiredToken: () => void;
}) {
  const [searchName, setSearchName] = useState('');
  const [searchState, setSearchState] = useState('VA');
  const [results, setResults] = useState<CourseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [course, setCourse] = useState<CourseSelection | null>(null);
  const [teeId, setTeeId] = useState<number | null>(null);
  const [holesPlaying, setHolesPlaying] = useState<SoloRound['holesPlaying']>('18');

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) { onExpiredToken(); return; }
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
        onExpiredToken();
        setError(data.error || 'Search failed — log in again');
      }
    } catch {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  }

  async function selectCourse(cr: CourseResult) {
    const token = getToken();
    if (!token) { onExpiredToken(); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ghin/courses/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, course_id: cr.CourseID }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load course'); return; }
      const cd = data.course;
      const allTees: TeeSetOption[] = (cd.TeeSets || []).map((ts: Record<string, unknown>) => ({
        id: ts.TeeSetRatingId as number,
        name: ts.TeeSetRatingName as string,
        gender: ts.Gender === 'Female' ? ('F' as const) : ('M' as const),
        totalYardage: ts.TotalYardage as number,
        totalPar: ts.TotalPar as number,
        ratings: ((ts.Ratings as Record<string, unknown>[]) || []).map((r) => ({
          type: r.RatingType as 'Front' | 'Back' | 'Total',
          courseRating: r.CourseRating as number,
          slopeRating: r.SlopeRating as number,
        })),
        holes: ((ts.Holes as Record<string, unknown>[]) || []).map((h) => ({
          number: h.Number as number,
          par: h.Par as number,
          yardage: h.Length as number,
          handicap: h.Allocation as number,
        })),
      }));
      const mens = allTees.filter((t) => t.gender === 'M');
      const womens = allTees.filter((t) => t.gender === 'F');
      const teeSets = mens.length > 0 ? [...mens, ...womens.map((t) => ({ ...t, name: `${t.name} (W)` }))] : allTees;
      setCourse({
        courseId: cr.CourseID,
        courseName: cr.CourseName || (cd.CourseName as string),
        city: cr.City || (cd.CourseCity as string) || '',
        state: cr.State || (cd.CourseState as string) || '',
        teeSets,
        selectedTeeId: null,
      });
      setTeeId(teeSets[0]?.id ?? null);
    } catch {
      setError('Failed to load course');
    } finally {
      setLoading(false);
    }
  }

  function start() {
    if (!course || teeId == null) return;
    const rawIndex = (() => {
      try {
        const raw = sessionStorage.getItem('ghin_golfer');
        if (!raw) return null;
        const g = JSON.parse(raw) as Record<string, unknown>;
        return parseGhinIndex(g.handicap_index ?? g.hi_value ?? g.handicap);
      } catch {
        return null;
      }
    })();
    const now = new Date().toISOString();
    const round: SoloRound = {
      id: crypto.randomUUID(),
      createdByGhin: getCreatorGhin() ?? undefined,
      playerName: getCreatorName() ?? undefined,
      handicapIndex: rawIndex,
      course: { ...course, selectedTeeId: teeId },
      teeSetId: teeId,
      holesPlaying,
      startedAt: now,
      status: 'playing',
      holes: buildEmptyHoles(course, teeId, holesPlaying),
      updatedAt: now,
    };
    onStarted(round);
  }

  return (
    <div>
      <button onClick={onCancel} className="text-sm text-green-700 hover:underline mb-4">
        &larr; Cancel
      </button>

      {!course && (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pick your course</h2>
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
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-green-700 px-4 py-2 text-white font-medium hover:bg-green-800 disabled:opacity-50"
            >
              {loading ? '…' : 'Search'}
            </button>
          </form>
          {error && <p className="text-red-600 mb-4 text-sm">{error}</p>}
          {results.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <ul className="divide-y divide-gray-200">
                {results.map((c) => (
                  <li key={c.CourseID}>
                    <button
                      onClick={() => selectCourse(c)}
                      disabled={loading}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition"
                    >
                      <p className="font-medium text-gray-900">{c.CourseName}</p>
                      <p className="text-sm text-gray-500">
                        {c.FacilityName} — {c.City}, {c.State}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {course && (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">{course.courseName}</h2>
          <button
            onClick={() => { setCourse(null); setTeeId(null); }}
            className="text-sm text-green-700 hover:underline mb-4"
          >
            Change course
          </button>

          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <p className="text-sm font-medium text-gray-800 mb-2">Tee</p>
            <div className="flex flex-wrap gap-2">
              {course.teeSets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTeeId(t.id)}
                  className={`rounded-md border px-3 py-2 text-sm ${teeId === t.id ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'}`}
                >
                  {t.name}
                  <span className={`block text-xs ${teeId === t.id ? 'text-green-100' : 'text-gray-500'}`}>
                    {t.totalYardage} yds · par {t.totalPar}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <p className="text-sm font-medium text-gray-800 mb-2">Holes</p>
            <div className="flex flex-wrap gap-2">
              {(['18', 'front9', 'back9'] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => setHolesPlaying(h)}
                  className={`rounded-md border px-3 py-2 text-sm ${holesPlaying === h ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'}`}
                >
                  {holesLabel[h]}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={start}
            disabled={teeId == null}
            className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50"
          >
            Start round
          </button>
        </>
      )}
    </div>
  );
}
