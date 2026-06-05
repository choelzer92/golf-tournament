'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTournamentList, importTournament, hydrateTournaments, type TournamentListItem } from '@/lib/tournament-state';

interface TeeRating {
  RatingType: 'Front' | 'Back' | 'Total';
  CourseRating: number;
  SlopeRating: number;
  BogeyRating: number;
}

interface Hole {
  Number: number;
  Par: number;
  Length: number;
  Allocation: number;
}

interface TeeSet {
  TeeSetRatingId: number;
  TeeSetRatingName: string;
  Gender: string | null;
  TotalYardage: number;
  TotalPar: number;
  HolesNumber: number;
  Ratings: TeeRating[];
  Holes: Hole[];
}

interface CourseDetails {
  CourseId: number;
  CourseName: string;
  CourseCity: string;
  CourseState: string;
  TeeSets: TeeSet[];
}

interface CourseSearchResult {
  CourseID: number;
  CourseName: string;
  FacilityName: string;
  City: string | null;
  State: string | null;
}

interface Golfer {
  handicap_index: string | number | null;
  clubs: { club_name: string; active: boolean }[];
}

function getToken() {
  return sessionStorage.getItem('ghin_token');
}

export default function DashboardPage() {
  const router = useRouter();
  const [golfer, setGolfer] = useState<Golfer | null>(null);
  const [ghinInput, setGhinInput] = useState('');
  const [searchName, setSearchName] = useState('');
  const [searchState, setSearchState] = useState('VA');
  const [searchResults, setSearchResults] = useState<CourseSearchResult[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);

  useEffect(() => {
    const token = sessionStorage.getItem('ghin_token');
    if (!token) {
      router.push('/');
      return;
    }
    const golferData = sessionStorage.getItem('ghin_golfer');
    if (golferData) {
      setGolfer(JSON.parse(golferData));
    } else {
      setGolfer({ handicap_index: null, clubs: [] });
    }
    hydrateTournaments().then(() => {
      setTournaments(getTournamentList());
    });
  }, [router]);

  async function searchCourses(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) { router.push('/'); return; }

    setError('');
    setLoading(true);
    setSelectedCourse(null);

    try {
      const res = await fetch('/api/ghin/courses/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: searchName, state: searchState }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSearchResults(data.courses || []);
    } catch {
      setError('Failed to search courses');
    } finally {
      setLoading(false);
    }
  }

  async function loadCourseDetails(courseId: number) {
    const token = getToken();
    if (!token) { router.push('/'); return; }

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/ghin/courses/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, course_id: courseId }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSelectedCourse(data.course);
    } catch {
      setError('Failed to load course details');
    } finally {
      setLoading(false);
    }
  }

  async function lookupHandicap(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) { router.push('/'); return; }

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/ghin/golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ghin_number: Number(ghinInput) }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }

      const updatedGolfer = {
        handicap_index: data.golfer.handicap_index ?? data.golfer.hi_value ?? null,
        clubs: data.golfer.clubs || [],
        first_name: data.golfer.first_name,
        last_name: data.golfer.last_name,
      };
      setGolfer(updatedGolfer);
      sessionStorage.setItem('ghin_golfer', JSON.stringify(updatedGolfer));
    } catch {
      setError('Failed to look up golfer');
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    sessionStorage.clear();
    router.push('/');
  }

  if (!golfer) return null;

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Golf Tracker</h1>
            {golfer.handicap_index ? (
              <p className="text-sm text-green-200">
                Handicap Index: {golfer.handicap_index}
              </p>
            ) : (
              <form onSubmit={lookupHandicap} className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={ghinInput}
                  onChange={(e) => setGhinInput(e.target.value)}
                  placeholder="Enter GHIN #"
                  className="w-32 rounded px-2 py-1 text-sm text-gray-900 border-0"
                />
                <button
                  type="submit"
                  disabled={loading || !ghinInput}
                  className="text-sm bg-green-600 hover:bg-green-500 px-2 py-1 rounded disabled:opacity-50"
                >
                  Link
                </button>
              </form>
            )}
          </div>
          <button onClick={logout} className="text-sm text-green-200 hover:text-white">
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <section className="mb-8 flex gap-3">
          <button
            onClick={() => router.push('/game/new')}
            className="flex-1 rounded-lg bg-green-700 px-6 py-4 text-white font-bold text-lg hover:bg-green-800 shadow-md"
          >
            New Game
          </button>
          <button
            onClick={() => router.push('/tournament/new')}
            className="flex-1 rounded-lg bg-green-900 px-6 py-4 text-white font-bold text-lg hover:bg-green-950 shadow-md"
          >
            New Tournament
          </button>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const t = importTournament(reader.result as string);
                  if (t) {
                    router.push(`/tournament/${t.id}`);
                  }
                };
                reader.readAsText(file);
              };
              input.click();
            }}
            className="flex-1 rounded-lg border-2 border-dashed border-gray-300 px-6 py-4 text-gray-600 font-medium text-lg hover:border-green-500 hover:text-green-700"
          >
            Import Tournament
          </button>
        </section>

        {tournaments.filter((t) => t.status !== 'completed').length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Active Tournaments</h2>
            <div className="space-y-2">
              {tournaments.filter((t) => t.status !== 'completed').map((t) => (
                <button
                  key={t.id}
                  onClick={() => router.push(`/tournament/${t.id}`)}
                  className="w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">{t.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      t.status === 'active' ? 'bg-green-100 text-green-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {t.teamAName} <span className="font-bold">{t.teamAPoints}</span>
                    {' — '}
                    <span className="font-bold">{t.teamBPoints}</span> {t.teamBName}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {tournaments.filter((t) => t.status === 'completed').length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Completed</h2>
            <div className="space-y-2">
              {tournaments.filter((t) => t.status === 'completed').map((t) => (
                <button
                  key={t.id}
                  onClick={() => router.push(`/tournament/${t.id}`)}
                  className="w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition opacity-75"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">{t.name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      completed
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {t.teamAName} <span className="font-bold">{t.teamAPoints}</span>
                    {' — '}
                    <span className="font-bold">{t.teamBPoints}</span> {t.teamBName}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Course Lookup</h2>
          <form onSubmit={searchCourses} className="flex gap-3 flex-wrap">
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Course name (e.g. Glenmore)"
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
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </section>

        {error && <p className="text-red-600 mb-4">{error}</p>}

        {searchResults.length > 0 && !selectedCourse && (
          <section className="mb-8">
            <h3 className="text-md font-medium text-gray-700 mb-2">
              Results ({searchResults.length})
            </h3>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <ul className="divide-y divide-gray-200">
                {searchResults.map((course) => (
                  <li key={course.CourseID}>
                    <button
                      onClick={() => loadCourseDetails(course.CourseID)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition"
                    >
                      <p className="font-medium text-gray-900">{course.CourseName}</p>
                      <p className="text-sm text-gray-500">
                        {course.FacilityName} — {course.City}, {course.State}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {selectedCourse && (
          <CourseDetailsView
            course={selectedCourse}
            handicapIndex={Number(golfer.handicap_index) || 0}
            onBack={() => setSelectedCourse(null)}
          />
        )}
      </main>
    </div>
  );
}

function CourseDetailsView({
  course,
  handicapIndex,
  onBack,
}: {
  course: CourseDetails;
  handicapIndex: number;
  onBack: () => void;
}) {
  const maleTees = course.TeeSets.filter(
    (t) => t.Gender === 'Male' || t.Gender === null
  );

  return (
    <section>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">
        &larr; Back to results
      </button>

      <h2 className="text-2xl font-bold text-gray-900 mb-1">{course.CourseName}</h2>
      <p className="text-gray-600 mb-6">{course.CourseCity}, {course.CourseState}</p>

      {maleTees.map((tee) => (
        <TeeSetCard key={tee.TeeSetRatingId} tee={tee} handicapIndex={handicapIndex} />
      ))}
    </section>
  );
}

function TeeSetCard({ tee, handicapIndex }: { tee: TeeSet; handicapIndex: number }) {
  const totalRating = tee.Ratings.find((r) => r.RatingType === 'Total');
  const frontRating = tee.Ratings.find((r) => r.RatingType === 'Front');
  const backRating = tee.Ratings.find((r) => r.RatingType === 'Back');

  function calcCourseHcap(rating: TeeRating | undefined, par: number) {
    if (!rating) return null;
    return Math.round(handicapIndex * (rating.SlopeRating / 113) + (rating.CourseRating - par));
  }

  const frontPar = tee.Holes.filter((h) => h.Number <= 9).reduce((s, h) => s + h.Par, 0);
  const backPar = tee.Holes.filter((h) => h.Number > 9).reduce((s, h) => s + h.Par, 0);

  const hcap18 = calcCourseHcap(totalRating, tee.TotalPar);
  const hcapFront = calcCourseHcap(frontRating, frontPar);
  const hcapBack = calcCourseHcap(backRating, backPar);

  return (
    <div className="bg-white rounded-lg shadow mb-4 overflow-hidden">
      <div className="px-4 py-3 bg-gray-100 border-b flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          {tee.TeeSetRatingName} Tees
        </h3>
        <span className="text-sm text-gray-600">
          {tee.TotalYardage} yds | Par {tee.TotalPar}
        </span>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <RatingBox
            label="18 Holes"
            rating={totalRating}
            courseHcap={hcap18}
          />
          <RatingBox
            label="Front 9"
            rating={frontRating}
            courseHcap={hcapFront}
          />
          <RatingBox
            label="Back 9"
            rating={backRating}
            courseHcap={hcapBack}
          />
        </div>

        <HoleTable holes={tee.Holes} />
      </div>
    </div>
  );
}

function RatingBox({
  label,
  rating,
  courseHcap,
}: {
  label: string;
  rating: TeeRating | undefined;
  courseHcap: number | null;
}) {
  if (!rating) return <div className="text-center text-sm text-gray-400">N/A</div>;

  return (
    <div className="text-center">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className="text-lg font-bold text-gray-900">{rating.CourseRating}</p>
      <p className="text-sm text-gray-600">Slope: {rating.SlopeRating}</p>
      {courseHcap !== null && (
        <p className="mt-1 text-xs text-green-700 font-medium">
          Course HCP: {courseHcap}
        </p>
      )}
    </div>
  );
}

function HoleTable({ holes }: { holes: Hole[] }) {
  const front = holes.filter((h) => h.Number <= 9).sort((a, b) => a.Number - b.Number);
  const back = holes.filter((h) => h.Number > 9).sort((a, b) => a.Number - b.Number);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left py-1 pr-2">Hole</th>
            {front.map((h) => <th key={h.Number} className="text-center px-1">{h.Number}</th>)}
            <th className="text-center px-1 font-bold">Out</th>
            {back.map((h) => <th key={h.Number} className="text-center px-1">{h.Number}</th>)}
            <th className="text-center px-1 font-bold">In</th>
            <th className="text-center px-1 font-bold">Tot</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-left py-1 pr-2 text-gray-500">Par</td>
            {front.map((h) => <td key={h.Number} className="text-center px-1">{h.Par}</td>)}
            <td className="text-center px-1 font-medium">{front.reduce((s, h) => s + h.Par, 0)}</td>
            {back.map((h) => <td key={h.Number} className="text-center px-1">{h.Par}</td>)}
            <td className="text-center px-1 font-medium">{back.reduce((s, h) => s + h.Par, 0)}</td>
            <td className="text-center px-1 font-bold">{holes.reduce((s, h) => s + h.Par, 0)}</td>
          </tr>
          <tr>
            <td className="text-left py-1 pr-2 text-gray-500">Yds</td>
            {front.map((h) => <td key={h.Number} className="text-center px-1">{h.Length}</td>)}
            <td className="text-center px-1 font-medium">{front.reduce((s, h) => s + h.Length, 0)}</td>
            {back.map((h) => <td key={h.Number} className="text-center px-1">{h.Length}</td>)}
            <td className="text-center px-1 font-medium">{back.reduce((s, h) => s + h.Length, 0)}</td>
            <td className="text-center px-1 font-bold">{holes.reduce((s, h) => s + h.Length, 0)}</td>
          </tr>
          <tr>
            <td className="text-left py-1 pr-2 text-gray-500">Hdcp</td>
            {front.map((h) => <td key={h.Number} className="text-center px-1">{h.Allocation}</td>)}
            <td className="text-center px-1"></td>
            {back.map((h) => <td key={h.Number} className="text-center px-1">{h.Allocation}</td>)}
            <td className="text-center px-1"></td>
            <td className="text-center px-1"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
