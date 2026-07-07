'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { TwoBestBallsVariant } from '@/lib/formats';
import type { Player, CourseSelection, TeeSetOption } from '@/lib/game-state';
import {
  type PoolGame,
  type PoolTeam,
  type PoolJunkValues,
  type PoolPotSplit,
  DEFAULT_JUNK_VALUES,
  DEFAULT_POT_SPLIT,
  savePoolGame,
  getPoolPlayingHandicap,
} from '@/lib/pool-game';
import {
  type RosterPlayer,
  hydrateRoster,
  searchRoster,
  getRoster,
  getRosterPlayerByGhin,
  upsertRosterPlayer,
  refreshRosterHandicaps,
} from '@/lib/roster';

const WIZARD_KEY = 'pool_wizard_draft';

type Step = 'details' | 'course' | 'field' | 'teams' | 'create';

function getToken() {
  return sessionStorage.getItem('ghin_token');
}

// Pick a tee for a player, STRICTLY within their gender. This matters because a
// course's men's and women's tees can share a name AND yardage yet carry
// different course ratings/slopes and different hole stroke-index (verified live
// at Spring Creek). Assigning a woman a men's tee id would silently corrupt her
// handicap, so we only ever choose from tees whose own gender matches the player.
// Priority: remembered tee name (within gender) -> gender default -> first
// same-gender tee -> course default.
function pickTeeForPlayer(
  course: CourseSelection | null,
  gender: 'M' | 'F' | undefined,
  rememberedTeeName: string | null | undefined
): number | undefined {
  if (!course || course.teeSets.length === 0) return undefined;
  const tees = course.teeSets;
  const g: 'M' | 'F' = gender === 'F' ? 'F' : 'M';

  // Gender pool by the tee's own gender flag (the reliable signal). Fall back to
  // the (W) name suffix only if tees somehow lack a gender, then to all tees.
  let pool = tees.filter((t) => t.gender === g);
  if (pool.length === 0) {
    pool = tees.filter((t) => (g === 'F' ? /\(w\)/i.test(t.name) : !/\(w\)/i.test(t.name)));
  }
  if (pool.length === 0) pool = tees;

  // Normalize for comparison: strip a trailing "(W)" and lowercase.
  const norm = (n: string) => n.replace(/\s*\(w\)\s*$/i, '').trim().toLowerCase();

  // 1) Remembered tee by name, matched WITHIN the gender pool.
  if (rememberedTeeName) {
    const want = norm(rememberedTeeName);
    const hit = pool.find((t) => norm(t.name) === want);
    if (hit) return hit.id;
  }

  // 2) Gender default: men -> "3 Stars", women -> "1 Star" (by base name).
  const wantDefault = g === 'F' ? '1 star' : '3 stars';
  const def = pool.find((t) => norm(t.name) === wantDefault);
  if (def) return def.id;

  // 3) First same-gender tee, else course default.
  return pool[0]?.id ?? course.selectedTeeId ?? tees[0]?.id ?? undefined;
}

// Percentages (front/back/overall/junk) held as strings so the inputs stay editable.
interface PotSplitPct {
  front: string;
  back: string;
  overall: string;
  junk: string;
}

function potSplitToPct(split: PoolPotSplit): PotSplitPct {
  return {
    front: String(Math.round(split.front * 100)),
    back: String(Math.round(split.back * 100)),
    overall: String(Math.round(split.overall * 100)),
    junk: String(Math.round(split.junk * 100)),
  };
}

function pctToPotSplit(pct: PotSplitPct): PoolPotSplit {
  return {
    front: (parseFloat(pct.front) || 0) / 100,
    back: (parseFloat(pct.back) || 0) / 100,
    overall: (parseFloat(pct.overall) || 0) / 100,
    junk: (parseFloat(pct.junk) || 0) / 100,
  };
}

function parsePositionSplit(text: string): number[] {
  const parsed = text
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n));
  return parsed.length > 0 ? parsed : [100];
}

export default function NewPoolGamePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('details');
  const [hydrated, setHydrated] = useState(false);

  // Details
  const [name, setName] = useState('');
  const [entryPerPlayer, setEntryPerPlayer] = useState('25');
  const [handicapAllowance, setHandicapAllowance] = useState('100');
  const [strokeMethod, setStrokeMethod] = useState<'full' | 'off-the-low'>('off-the-low');
  const [potSplitPct, setPotSplitPct] = useState<PotSplitPct>(potSplitToPct(DEFAULT_POT_SPLIT));
  const [positionSplitText, setPositionSplitText] = useState('100');
  const [junkValues, setJunkValues] = useState<PoolJunkValues>({ ...DEFAULT_JUNK_VALUES });
  const [ballSelection, setBallSelection] = useState<TwoBestBallsVariant>('1-net-1-gross');

  // Course
  const [course, setCourse] = useState<CourseSelection | null>(null);

  // Field
  const [players, setPlayers] = useState<Player[]>([]);

  // Teams
  const [teams, setTeams] = useState<PoolTeam[]>([]);

  // Hydrate wizard draft on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(WIZARD_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (typeof data.name === 'string') setName(data.name);
        if (typeof data.entryPerPlayer === 'string') setEntryPerPlayer(data.entryPerPlayer);
        if (typeof data.handicapAllowance === 'string') setHandicapAllowance(data.handicapAllowance);
        if (data.strokeMethod === 'full' || data.strokeMethod === 'off-the-low') setStrokeMethod(data.strokeMethod);
        if (data.potSplitPct) setPotSplitPct(data.potSplitPct);
        if (typeof data.positionSplitText === 'string') setPositionSplitText(data.positionSplitText);
        if (data.junkValues) setJunkValues(data.junkValues);
        if (data.ballSelection) setBallSelection(data.ballSelection);
        if (data.course) setCourse(data.course);
        // Intentionally NOT restoring players/teams/step: the day's field is a
        // fresh per-game selection (the roster is the durable store), so every
        // new game starts with nobody selected. Name/course/config still restore.
      }
    } catch {}
    setHydrated(true);
  }, []);

  // Auto-save wizard draft on every change
  useEffect(() => {
    if (!hydrated) return;
    sessionStorage.setItem(WIZARD_KEY, JSON.stringify({
      name, entryPerPlayer, handicapAllowance, strokeMethod, potSplitPct, positionSplitText,
      junkValues, ballSelection, course, players, teams, step,
    }));
  }, [hydrated, name, entryPerPlayer, handicapAllowance, strokeMethod, potSplitPct, positionSplitText,
      junkValues, ballSelection, course, players, teams, step]);

  function createPoolGame() {
    const id = crypto.randomUUID();
    const game: PoolGame = {
      id,
      name: name || 'Pool Game',
      createdAt: new Date().toISOString(),
      course,
      players,
      teams,
      ballSelection,
      entryPerPlayer: parseFloat(entryPerPlayer) || 0,
      handicapAllowance: parseFloat(handicapAllowance) || 100,
      strokeMethod,
      potSplit: pctToPotSplit(potSplitPct),
      positionSplit: parsePositionSplit(positionSplitText),
      junkValues,
      ctpWinners: {},
      status: 'active',
    };

    savePoolGame(game);
    sessionStorage.removeItem(WIZARD_KEY);
    router.push('/pool/' + game.id);
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">New Pool Game</h1>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-green-200 hover:text-white">
            Cancel
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <StepIndicator current={step} course={course} />

        {step === 'details' && (
          <DetailsStep
            name={name}
            setName={setName}
            entryPerPlayer={entryPerPlayer}
            setEntryPerPlayer={setEntryPerPlayer}
            handicapAllowance={handicapAllowance}
            setHandicapAllowance={setHandicapAllowance}
            strokeMethod={strokeMethod}
            setStrokeMethod={setStrokeMethod}
            potSplitPct={potSplitPct}
            setPotSplitPct={setPotSplitPct}
            positionSplitText={positionSplitText}
            setPositionSplitText={setPositionSplitText}
            junkValues={junkValues}
            setJunkValues={setJunkValues}
            ballSelection={ballSelection}
            setBallSelection={setBallSelection}
            onNext={() => setStep('course')}
          />
        )}

        {step === 'course' && (
          <CourseStep
            course={course}
            setCourse={setCourse}
            onNext={() => setStep('field')}
            onBack={() => setStep('details')}
          />
        )}

        {step === 'field' && (
          <FieldStep
            course={course}
            players={players}
            setPlayers={setPlayers}
            handicapAllowance={parseFloat(handicapAllowance) || 100}
            onNext={() => setStep('teams')}
            onBack={() => setStep('course')}
          />
        )}

        {step === 'teams' && (
          <TeamsStep
            course={course}
            players={players}
            setPlayers={setPlayers}
            teams={teams}
            setTeams={setTeams}
            handicapAllowance={parseFloat(handicapAllowance) || 100}
            onNext={() => setStep('create')}
            onBack={() => setStep('field')}
          />
        )}

        {step === 'create' && (
          <CreateStep
            name={name || 'Pool Game'}
            entryPerPlayer={parseFloat(entryPerPlayer) || 0}
            players={players}
            teams={teams}
            potSplitPct={potSplitPct}
            onCreate={createPoolGame}
            onBack={() => setStep('teams')}
          />
        )}
      </main>
    </div>
  );
}

function StepIndicator({ current, course }: { current: Step; course: CourseSelection | null }) {
  const steps = [
    { key: 'details', label: 'Details' },
    { key: 'course', label: course?.courseName || 'Course' },
    { key: 'field', label: 'Field' },
    { key: 'teams', label: 'Teams' },
    { key: 'create', label: 'Create' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-2 mb-6 text-sm">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded ${i <= currentIdx ? 'bg-green-700 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-gray-300">&rarr;</span>}
        </div>
      ))}
    </div>
  );
}

function DetailsStep({
  name, setName, entryPerPlayer, setEntryPerPlayer, handicapAllowance, setHandicapAllowance,
  strokeMethod, setStrokeMethod,
  potSplitPct, setPotSplitPct, positionSplitText, setPositionSplitText,
  junkValues, setJunkValues, ballSelection, setBallSelection, onNext,
}: {
  name: string; setName: (s: string) => void;
  entryPerPlayer: string; setEntryPerPlayer: (s: string) => void;
  handicapAllowance: string; setHandicapAllowance: (s: string) => void;
  strokeMethod: 'full' | 'off-the-low'; setStrokeMethod: (v: 'full' | 'off-the-low') => void;
  potSplitPct: PotSplitPct; setPotSplitPct: (p: PotSplitPct) => void;
  positionSplitText: string; setPositionSplitText: (s: string) => void;
  junkValues: PoolJunkValues; setJunkValues: (v: PoolJunkValues) => void;
  ballSelection: TwoBestBallsVariant; setBallSelection: (v: TwoBestBallsVariant) => void;
  onNext: () => void;
}) {
  const potSum =
    (parseFloat(potSplitPct.front) || 0) +
    (parseFloat(potSplitPct.back) || 0) +
    (parseFloat(potSplitPct.overall) || 0) +
    (parseFloat(potSplitPct.junk) || 0);
  const potSumOff = Math.abs(potSum - 100) > 0.01;

  const junkFields: { key: keyof PoolJunkValues; label: string }[] = [
    { key: 'birdie', label: 'Birdie' },
    { key: 'eagle', label: 'Eagle' },
    { key: 'albatross', label: 'Albatross' },
    { key: 'groupHug', label: 'Group Hug' },
    { key: 'ctp', label: 'CTP' },
  ];

  const potFields: { key: keyof PotSplitPct; label: string }[] = [
    { key: 'front', label: 'Front 9' },
    { key: 'back', label: 'Back 9' },
    { key: 'overall', label: 'Overall' },
    { key: 'junk', label: 'Junk' },
  ];

  const ballOptions: { value: TwoBestBallsVariant; label: string }[] = [
    { value: '1-net-1-gross', label: '1 Net + 1 Gross (different players)' },
    { value: '2-best-net', label: '2 Best Net' },
    { value: '2-best-gross', label: '2 Best Gross' },
  ];

  const canProceed = name.trim().length > 0;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Pool Game Details</h2>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Game Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Saturday Pool"
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Entry ($ / player)</label>
            <input
              type="number"
              inputMode="decimal"
              value={entryPerPlayer}
              onChange={(e) => setEntryPerPlayer(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Handicap Allowance (%)</label>
            <input
              type="number"
              inputMode="decimal"
              value={handicapAllowance}
              onChange={(e) => setHandicapAllowance(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Handicap Strokes</label>
          <div className="flex gap-2">
            {([
              { v: 'full', label: 'Full handicap' },
              { v: 'off-the-low', label: 'Off the low' },
            ] as const).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setStrokeMethod(v)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                  strokeMethod === v
                    ? 'border-green-600 bg-green-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {strokeMethod === 'off-the-low'
              ? 'Lowest-handicap player in the field plays to scratch; everyone else plays the difference.'
              : 'Every player uses their full course handicap × allowance.'}
          </p>
        </div>

        <div className="pt-2 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-2">Pot Split (%)</p>
          <div className="grid grid-cols-4 gap-2">
            {potFields.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-gray-600 font-medium mb-1">{label}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={potSplitPct[key]}
                  onChange={(e) => setPotSplitPct({ ...potSplitPct, [key]: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            ))}
          </div>
          <p className={`text-xs mt-1 ${potSumOff ? 'text-amber-600' : 'text-gray-500'}`}>
            Total: {potSum}%{potSumOff ? ' — should sum to 100%' : ''}
          </p>
        </div>

        <div className="pt-2 border-t">
          <label className="block text-sm font-medium text-gray-800 mb-1">Position Split</label>
          <input
            type="text"
            value={positionSplitText}
            onChange={(e) => setPositionSplitText(e.target.value)}
            placeholder="e.g. 100 or 70, 30"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Percent of each sub-pot per finishing place. &quot;100&quot; = winner-take-all; &quot;70, 30&quot; = 1st/2nd.
          </p>
        </div>

        <div className="pt-2 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-2">Junk Values (points)</p>
          <div className="grid grid-cols-5 gap-2">
            {junkFields.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-gray-600 font-medium mb-1">{label}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={junkValues[key]}
                  onChange={(e) => setJunkValues({ ...junkValues, [key]: Number(e.target.value) })}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t">
          <label className="block text-sm font-medium text-gray-800 mb-1">Team Ball Selection</label>
          <select
            value={ballSelection}
            onChange={(e) => setBallSelection(e.target.value as TwoBestBallsVariant)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            {ballOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Per-hole team score for each foursome.</p>
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="mt-6 w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Select Course
      </button>
    </div>
  );
}

function CourseStep({
  course, setCourse, onNext, onBack,
}: {
  course: CourseSelection | null;
  setCourse: (c: CourseSelection | null) => void;
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
      const mensTeeSets = allTeeSets.filter((t) => t.gender === 'M');
      const womensTeeSets = allTeeSets.filter((t) => t.gender === 'F');
      // Suffix women's tees with (W), but idempotently — never produce "(W) (W)"
      // if GHIN already includes it.
      const teeSets = mensTeeSets.length > 0
        ? [...mensTeeSets, ...womensTeeSets.map((t) => ({ ...t, name: /\(w\)/i.test(t.name) ? t.name : `${t.name} (W)` }))]
        : allTeeSets;

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

      {noToken && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4 space-y-2">
          <p className="text-sm text-amber-800 font-medium">Log in to GHIN to search courses</p>
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
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!course}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Build Field
      </button>
    </div>
  );
}

function FieldStep({
  course, players, setPlayers, handicapAllowance, onNext, onBack,
}: {
  course: CourseSelection | null;
  players: Player[]; setPlayers: (p: Player[]) => void;
  handicapAllowance: number;
  onNext: () => void; onBack: () => void;
}) {
  const [rosterQuery, setRosterQuery] = useState('');
  const [rosterResults, setRosterResults] = useState<RosterPlayer[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');

  const [ghinInput, setGhinInput] = useState('');
  const [ghinLoading, setGhinLoading] = useState(false);
  const [ghinError, setGhinError] = useState('');

  const [nameInput, setNameInput] = useState('');
  const [handicapInput, setHandicapInput] = useState('');
  const [genderInput, setGenderInput] = useState<'M' | 'F'>('M');

  // GHIN name search
  const [gsFirst, setGsFirst] = useState('');
  const [gsLast, setGsLast] = useState('');
  const [gsState, setGsState] = useState('VA');
  const [gsResults, setGsResults] = useState<any[]>([]);
  const [gsLoading, setGsLoading] = useState(false);
  const [gsSearched, setGsSearched] = useState(false);
  const [gsNote, setGsNote] = useState('');

  useEffect(() => {
    hydrateRoster().then(() => {
      setRosterResults(searchRoster(''));
    });
  }, []);

  function refreshRoster(query: string) {
    setRosterQuery(query);
    setRosterResults(searchRoster(query));
  }

  const existingGhins = new Set(players.map((p) => p.ghinNumber).filter((g): g is number => g != null));

  function addRosterPlayer(rp: RosterPlayer) {
    if (rp.ghinNumber != null && existingGhins.has(rp.ghinNumber)) return;
    const newPlayer: Player = {
      id: rp.id,
      name: rp.name,
      handicapIndex: rp.handicapIndex,
      gender: rp.gender ?? undefined,
      ghinNumber: rp.ghinNumber ?? undefined,
      teeSetId: pickTeeForPlayer(course, rp.gender ?? undefined, rp.defaultTeeName),
    };
    const nextPlayers = [...players, newPlayer];
    setPlayers(nextPlayers);

    // Auto-refresh: pull this player's current index from GHIN so every new
    // game uses up-to-date handicaps. Non-blocking — updates in place on return.
    const token = getToken();
    if (token && rp.ghinNumber != null) {
      fetch('/api/ghin/golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ghin_number: rp.ghinNumber }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const hi = parseFloat(data?.golfer?.handicap_index ?? data?.golfer?.hi_value ?? '');
          if (isNaN(hi) || hi === rp.handicapIndex) return;
          setPlayers(nextPlayers.map((p) => (p.id === rp.id ? { ...p, handicapIndex: hi } : p)));
          upsertRosterPlayer({ ...rp, handicapIndex: hi });
        })
        .catch(() => { /* keep the cached index on any failure */ });
    }
  }

  async function doRefreshRoster() {
    const token = getToken();
    if (!token) { setRefreshNote('Log in via the Course step to refresh from GHIN.'); return; }
    setRefreshing(true);
    setRefreshNote('');
    try {
      const count = await refreshRosterHandicaps(token);
      refreshRoster(rosterQuery);
      // Reflect any updated indexes on players already in this field.
      const updated = getRoster();
      setPlayers(players.map((p) => {
        const rp = updated.find((r) => r.ghinNumber != null && r.ghinNumber === p.ghinNumber);
        return rp && rp.handicapIndex != null ? { ...p, handicapIndex: rp.handicapIndex } : p;
      }));
      setRefreshNote(count > 0 ? `Updated ${count} handicap${count === 1 ? '' : 's'} from GHIN.` : 'Handicaps already current.');
    } catch {
      setRefreshNote('Refresh failed — check your connection.');
    } finally {
      setRefreshing(false);
    }
  }

  async function addByGhin() {
    const token = getToken();
    if (!token || !ghinInput) return;
    setGhinLoading(true);
    setGhinError('');
    try {
      const res = await fetch('/api/ghin/golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ghin_number: Number(ghinInput) }),
      });
      const data = await res.json();
      if (!res.ok) { setGhinError(data.error || 'Lookup failed'); return; }
      const golfer = data.golfer;
      const hi = parseFloat(golfer.handicap_index ?? golfer.hi_value ?? '0');
      const ghinGender = (golfer.gender || golfer.Gender || '').toLowerCase();
      const gender: 'M' | 'F' = ghinGender === 'female' || ghinGender === 'f' ? 'F' : 'M';
      const ghinNumber = Number(ghinInput);
      const remembered = getRosterPlayerByGhin(ghinNumber)?.defaultTeeName ?? null;
      const newPlayer: Player = {
        id: crypto.randomUUID(),
        name: `${golfer.first_name} ${golfer.last_name}`,
        handicapIndex: isNaN(hi) ? null : hi,
        gender,
        ghinNumber,
        teeSetId: pickTeeForPlayer(course, gender, remembered),
      };
      setPlayers([...players, newPlayer]);
      upsertRosterPlayer({
        id: newPlayer.id,
        ghinNumber,
        name: newPlayer.name,
        handicapIndex: newPlayer.handicapIndex,
        gender,
        defaultTeeName: null,
      });
      setGhinInput('');
      refreshRoster(rosterQuery);
    } catch {
      setGhinError('Network error');
    } finally {
      setGhinLoading(false);
    }
  }

  function addManual() {
    if (!nameInput) return;
    const id = crypto.randomUUID();
    const handicapIndex = handicapInput ? parseFloat(handicapInput) : null;
    const newPlayer: Player = {
      id,
      name: nameInput,
      handicapIndex,
      gender: genderInput,
      teeSetId: pickTeeForPlayer(course, genderInput, null),
    };
    setPlayers([...players, newPlayer]);
    upsertRosterPlayer({
      id,
      ghinNumber: null,
      name: nameInput,
      handicapIndex,
      gender: genderInput,
      defaultTeeName: null,
    });
    setNameInput('');
    setHandicapInput('');
  }

  async function searchGhinByName() {
    const token = getToken();
    if (!token) { setGsNote('Log in to GHIN (via the Course step) to search by name.'); return; }
    // GHIN name search requires a last name AND a state to return results.
    if (!gsLast.trim()) { setGsNote('Enter a last name to search.'); return; }
    if (!gsState.trim()) { setGsNote('Enter a state (e.g. VA) — GHIN requires it to search by name.'); return; }
    setGsLoading(true);
    setGsSearched(false);
    setGsNote('');
    try {
      const res = await fetch('/api/ghin/search-golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, first_name: gsFirst, last_name: gsLast, state: gsState }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGsResults([]);
        setGsNote(data.error || 'Search failed — try again or add by GHIN #');
        return;
      }
      const golfers: any[] = data.golfers || [];
      setGsResults(golfers);
      setGsSearched(true);
      if (golfers.length === 0) {
        setGsNote(`No golfers named "${gsLast}" found in ${gsState.toUpperCase()}. Check spelling/state, or add by GHIN #.`);
      }
    } catch {
      setGsResults([]);
      setGsNote('Search failed — check your connection or add by GHIN #');
    } finally {
      setGsLoading(false);
    }
  }

  function addGhinSearchResult(g: any) {
    const ghinNumber = Number(g.ghin ?? g.id);
    if (!isNaN(ghinNumber) && existingGhins.has(ghinNumber)) return;
    const hi = parseFloat(g.handicap_index ?? g.hi_value ?? '');
    const ghinGender = (g.gender || g.Gender || '').toLowerCase();
    const gender: 'M' | 'F' = ghinGender === 'female' || ghinGender === 'f' ? 'F' : 'M';
    const id = crypto.randomUUID();
    const remembered = !isNaN(ghinNumber) ? (getRosterPlayerByGhin(ghinNumber)?.defaultTeeName ?? null) : null;
    const newPlayer: Player = {
      id,
      name: `${g.first_name ?? ''} ${g.last_name ?? ''}`.trim(),
      handicapIndex: isNaN(hi) ? null : hi,
      gender,
      ghinNumber: isNaN(ghinNumber) ? undefined : ghinNumber,
      teeSetId: pickTeeForPlayer(course, gender, remembered),
    };
    setPlayers([...players, newPlayer]);
    upsertRosterPlayer({
      id,
      ghinNumber: isNaN(ghinNumber) ? null : ghinNumber,
      name: newPlayer.name,
      handicapIndex: newPlayer.handicapIndex,
      gender,
      defaultTeeName: null,
    });
    refreshRoster(rosterQuery);
  }

  function removePlayer(id: string) {
    setPlayers(players.filter((p) => p.id !== id));
  }

  function changePlayerTee(id: string, teeSetId: number) {
    setPlayers(players.map((p) => (p.id === id ? { ...p, teeSetId } : p)));
    // Remember this tee (by name) for next time this player is added.
    const player = players.find((p) => p.id === id);
    const teeName = course?.teeSets.find((t) => t.id === teeSetId)?.name;
    if (player && teeName) {
      upsertRosterPlayer({
        id: player.id,
        ghinNumber: player.ghinNumber ?? null,
        name: player.name,
        handicapIndex: player.handicapIndex,
        gender: player.gender ?? null,
        defaultTeeName: teeName,
      });
    }
  }

  const fieldIds = new Set(players.map((p) => p.id));

  const canProceed = players.length >= 2;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Build Field ({players.length})</h2>

      {/* Saved roster — alphabetical checklist, tap to add/remove today's field */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-800">
            Choose who&apos;s playing
            <span className="ml-2 text-xs font-normal text-gray-500">{players.length} selected</span>
          </p>
          <div className="flex items-center gap-3">
            {players.length > 0 && (
              <button
                onClick={() => setPlayers([])}
                className="text-xs text-gray-500 hover:text-red-600 font-medium"
                title="Deselect everyone and start fresh"
              >
                Clear
              </button>
            )}
            <button
              onClick={doRefreshRoster}
              disabled={refreshing}
              className="text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-50"
              title="Re-pull current handicap indexes from GHIN for all saved players"
            >
              {refreshing ? 'Refreshing…' : '↻ Refresh handicaps'}
            </button>
          </div>
        </div>
        {refreshNote && <p className="text-xs text-gray-500 mb-2">{refreshNote}</p>}
        <input
          type="text"
          value={rosterQuery}
          onChange={(e) => refreshRoster(e.target.value)}
          placeholder="Filter by name…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        {rosterResults.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">No saved players{rosterQuery ? ' match' : ' yet'}. Add by GHIN # or manually below.</p>
        ) : (
          <ul className="mt-2 max-h-80 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-100">
            {rosterResults.map((rp) => {
              const inField = fieldIds.has(rp.id);
              return (
                <li key={rp.id}>
                  <button
                    onClick={() => (inField ? removePlayer(rp.id) : addRosterPlayer(rp))}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 ${inField ? 'bg-green-50' : ''}`}
                  >
                    <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${inField ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white'}`}>
                      {inField ? '✓' : ''}
                    </span>
                    <span className="flex-1 font-medium text-gray-900">{rp.name}</span>
                    <span className="text-xs text-gray-500">
                      {rp.handicapIndex ?? '—'}{rp.gender ? ` · ${rp.gender}` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add by GHIN # + manual */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">Add by GHIN #</p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={ghinInput}
            onChange={(e) => setGhinInput(e.target.value)}
            placeholder="GHIN number"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <button
            onClick={addByGhin}
            disabled={ghinLoading || !ghinInput}
            className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
          >
            {ghinLoading ? '...' : 'Add'}
          </button>
        </div>
        {ghinError && <p className="text-xs text-red-600 mt-1">{ghinError}</p>}

        <div className="mt-3 pt-3 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-2">Or add manually</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Name"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <input
              type="text"
              inputMode="decimal"
              value={handicapInput}
              onChange={(e) => setHandicapInput(e.target.value)}
              placeholder="HCP"
              className="w-16 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={() => setGenderInput(genderInput === 'M' ? 'F' : 'M')}
              className={`w-9 rounded-md border text-sm font-bold py-2 ${genderInput === 'M' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-pink-300 bg-pink-50 text-pink-700'}`}
            >
              {genderInput}
            </button>
            <button
              onClick={addManual}
              disabled={!nameInput}
              className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* GHIN name search */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-0.5">Search GHIN by name</p>
        <p className="text-xs text-gray-500 mb-2">Last name and state required. First name optional to narrow it down.</p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={gsFirst}
            onChange={(e) => setGsFirst(e.target.value)}
            placeholder="First (optional)"
            className="flex-1 min-w-[100px] rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <input
            type="text"
            value={gsLast}
            onChange={(e) => setGsLast(e.target.value)}
            placeholder="Last name"
            className="flex-1 min-w-[100px] rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <input
            type="text"
            value={gsState}
            onChange={(e) => setGsState(e.target.value.toUpperCase())}
            placeholder="ST"
            maxLength={2}
            className="w-14 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <button
            onClick={searchGhinByName}
            disabled={gsLoading || !gsLast.trim() || !gsState.trim()}
            className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
          >
            {gsLoading ? '...' : 'Search GHIN'}
          </button>
        </div>
        {gsNote && <p className="text-xs text-gray-500 mt-2">{gsNote}</p>}
        {gsSearched && gsResults.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-y-auto divide-y divide-gray-100">
            {gsResults.map((g: any, i: number) => (
              <li key={g.ghin ?? g.id ?? i}>
                <button
                  onClick={() => addGhinSearchResult(g)}
                  className="w-full text-left px-2 py-1.5 hover:bg-gray-50 rounded"
                >
                  <span className="text-sm font-medium text-gray-900">
                    {g.first_name} {g.last_name}
                  </span>
                  <span className="text-xs text-gray-500 ml-2">
                    {g.handicap_index ?? g.hi_value ?? '—'}
                    {g.gender ? ` · ${g.gender}` : ''}
                    {g.club_name ? ` · ${g.club_name}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Field list */}
      {players.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
          <ul className="divide-y divide-gray-200">
            {players.map((player) => {
              const courseHcap = course ? Math.round(getPoolPlayingHandicap(player, course, handicapAllowance)) : null;
              return (
                <li key={player.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {player.name}
                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${player.gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                          {player.gender || 'M'}
                        </span>
                      </p>
                      <p className="text-sm text-gray-500">
                        Index: {player.handicapIndex ?? 'N/A'}
                        {courseHcap !== null && (
                          <span className="ml-2 text-green-700">Course HCP: {courseHcap}</span>
                        )}
                      </p>
                    </div>
                    <button onClick={() => removePlayer(player.id)} className="text-red-500 hover:text-red-700 text-sm">
                      Remove
                    </button>
                  </div>
                  {course && course.teeSets.length > 1 && (
                    <div className="mt-2">
                      <select
                        value={player.teeSetId || ''}
                        onChange={(e) => changePlayerTee(player.id, Number(e.target.value))}
                        className="text-sm rounded-md border border-gray-300 px-2 py-1 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                      >
                        {course.teeSets.map((ts) => (
                          <option key={ts.id} value={ts.id}>
                            {ts.name} ({ts.totalYardage} yds)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Set Teams
      </button>
    </div>
  );
}

function makeTeam(index: number, playerIds: string[]): PoolTeam {
  return {
    id: crypto.randomUUID(),
    name: `Team ${index + 1}`,
    playerIds,
    matchupId: crypto.randomUUID(),
    teeTime: '',
  };
}

function TeamsStep({
  course, players, setPlayers, teams, setTeams, handicapAllowance, onNext, onBack,
}: {
  course: CourseSelection | null;
  players: Player[]; setPlayers: (p: Player[]) => void;
  teams: PoolTeam[]; setTeams: (t: PoolTeam[]) => void;
  handicapAllowance: number;
  onNext: () => void; onBack: () => void;
}) {
  const playerById = new Map(players.map((p) => [p.id, p]));

  function hcapOf(p: Player): number {
    return course ? getPoolPlayingHandicap(p, course, handicapAllowance) : (p.handicapIndex ?? 0);
  }

  function changePlayerTee(id: string, teeSetId: number) {
    setPlayers(players.map((p) => (p.id === id ? { ...p, teeSetId } : p)));
    const player = players.find((p) => p.id === id);
    const teeName = course?.teeSets.find((t) => t.id === teeSetId)?.name;
    if (player && teeName) {
      upsertRosterPlayer({
        id: player.id,
        ghinNumber: player.ghinNumber ?? null,
        name: player.name,
        handicapIndex: player.handicapIndex,
        gender: player.gender ?? null,
        defaultTeeName: teeName,
      });
    }
  }

  function autoGenerate() {
    const groups: string[][] = [];
    for (let i = 0; i < players.length; i += 4) {
      groups.push(players.slice(i, i + 4).map((p) => p.id));
    }
    setTeams(groups.map((ids, i) => makeTeam(i, ids)));
  }

  function autoBalance() {
    const numTeams = Math.max(1, Math.ceil(players.length / 4));
    const sorted = [...players].sort((a, b) => hcapOf(b) - hcapOf(a)); // high to low
    const buckets: string[][] = Array.from({ length: numTeams }, () => []);
    // Snake draft across teams.
    let dir = 1;
    let col = 0;
    for (const p of sorted) {
      buckets[col].push(p.id);
      if (dir === 1) {
        if (col === numTeams - 1) { dir = -1; } else { col++; }
      } else {
        if (col === 0) { dir = 1; } else { col--; }
      }
    }
    setTeams(buckets.map((ids, i) => makeTeam(i, ids)));
  }

  function movePlayer(playerId: string, fromTeamId: string, toTeamId: string) {
    if (fromTeamId === toTeamId) return;
    setTeams(teams.map((t) => {
      if (t.id === fromTeamId) return { ...t, playerIds: t.playerIds.filter((id) => id !== playerId) };
      if (t.id === toTeamId) return { ...t, playerIds: [...t.playerIds, playerId] };
      return t;
    }));
  }

  function renameTeam(teamId: string, newName: string) {
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, name: newName } : t)));
  }

  function setTeeTime(teamId: string, teeTime: string) {
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, teeTime } : t)));
  }

  function addTeam() {
    setTeams([...teams, makeTeam(teams.length, [])]);
  }

  function removeTeam(teamId: string) {
    const removed = teams.find((t) => t.id === teamId);
    if (!removed) return;
    const remaining = teams.filter((t) => t.id !== teamId);
    // Push orphaned players onto the first remaining team (if any).
    if (removed.playerIds.length > 0 && remaining.length > 0) {
      remaining[0] = { ...remaining[0], playerIds: [...remaining[0].playerIds, ...removed.playerIds] };
    }
    setTeams(remaining);
  }

  const assignedIds = new Set(teams.flatMap((t) => t.playerIds));
  const unassigned = players.filter((p) => !assignedIds.has(p.id));

  function teamCombinedHcap(team: PoolTeam): number {
    return team.playerIds.reduce((sum, id) => {
      const p = playerById.get(id);
      return p ? sum + hcapOf(p) : sum;
    }, 0);
  }

  const canProceed = teams.length > 0 && teams.some((t) => t.playerIds.length > 0) && unassigned.length === 0;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Set Teams</h2>

      <div className="flex gap-2 flex-wrap mb-4">
        <button
          onClick={autoGenerate}
          className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800"
        >
          Auto-generate foursomes
        </button>
        <button
          onClick={autoBalance}
          className="rounded-md border border-green-700 px-3 py-2 text-sm text-green-700 font-medium hover:bg-green-50"
        >
          Auto-balance by course HCP
        </button>
        <button
          onClick={addTeam}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 font-medium hover:bg-gray-100"
        >
          + Add team
        </button>
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4">
          <p className="text-sm text-amber-800 font-medium mb-1">
            Unassigned ({unassigned.length}) — generate teams or add them below
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <span key={p.id} className="rounded-full bg-white border border-amber-300 px-2 py-0.5 text-xs text-amber-800">
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {teams.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center text-gray-500 mb-4">
          <p className="text-sm">No teams yet. Use a button above to build foursomes.</p>
        </div>
      ) : (
        <div className="grid gap-3 mb-4 sm:grid-cols-2">
          {teams.map((team) => (
            <div key={team.id} className="bg-white rounded-lg shadow p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={team.name}
                  onChange={(e) => renameTeam(team.id, e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-semibold shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <button
                  onClick={() => removeTeam(team.id)}
                  className="text-red-500 hover:text-red-700 text-sm px-1"
                  title="Remove team"
                >
                  &times;
                </button>
              </div>

              <div className="mb-2">
                <label className="block text-xs text-gray-500 mb-1">Tee time</label>
                <input
                  type="text"
                  value={team.teeTime || ''}
                  onChange={(e) => setTeeTime(team.id, e.target.value)}
                  placeholder="HH:MM"
                  className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <p className="text-xs text-gray-500 mb-2">
                {team.playerIds.length} player{team.playerIds.length === 1 ? '' : 's'}
                {course ? ` · combined HCP ${Math.round(teamCombinedHcap(team))}` : ''}
              </p>

              <ul className="space-y-1">
                {team.playerIds.map((pid) => {
                  const p = playerById.get(pid);
                  if (!p) return null;
                  const hcap = course ? Math.round(hcapOf(p)) : null;
                  return (
                    <li key={pid} className="flex items-center justify-between gap-2 rounded bg-gray-50 px-2 py-1">
                      <span className="text-sm text-gray-900 truncate min-w-0">
                        {p.name}
                        {hcap !== null && <span className="ml-1 text-xs text-gray-500">({hcap})</span>}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {course && course.teeSets.length > 1 && (
                          <select
                            value={p.teeSetId ?? ''}
                            onChange={(e) => changePlayerTee(pid, Number(e.target.value))}
                            className="text-xs rounded border border-gray-300 px-1 py-0.5 shadow-sm focus:border-green-500 focus:outline-none max-w-[110px]"
                            title="Tee"
                          >
                            {course.teeSets.map((ts) => (
                              <option key={ts.id} value={ts.id}>{ts.name}</option>
                            ))}
                          </select>
                        )}
                        <select
                          value={team.id}
                          onChange={(e) => movePlayer(pid, team.id, e.target.value)}
                          className="text-xs rounded border border-gray-300 px-1 py-0.5 shadow-sm focus:border-green-500 focus:outline-none"
                          title="Move to team"
                        >
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    </li>
                  );
                })}
                {team.playerIds.length === 0 && (
                  <li className="text-xs text-gray-400 px-2 py-1">Empty — move players here.</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Review &amp; Create
      </button>
    </div>
  );
}

function CreateStep({
  name, entryPerPlayer, players, teams, potSplitPct, onCreate, onBack,
}: {
  name: string;
  entryPerPlayer: number;
  players: Player[];
  teams: PoolTeam[];
  potSplitPct: PotSplitPct;
  onCreate: () => void; onBack: () => void;
}) {
  const playerById = new Map(players.map((p) => [p.id, p]));
  const pot = players.length * entryPerPlayer;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Review &amp; Create</h2>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <p className="text-sm text-gray-500">Pool Game</p>
          <p className="text-lg font-bold text-gray-900">{name}</p>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2 border-t text-center">
          <div>
            <p className="text-xs text-gray-500">Players</p>
            <p className="text-lg font-bold text-gray-900">{players.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Teams</p>
            <p className="text-lg font-bold text-gray-900">{teams.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Pot</p>
            <p className="text-lg font-bold text-green-700">${pot}</p>
          </div>
        </div>

        <div className="pt-2 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-1">Pot Split</p>
          <p className="text-sm text-gray-600">
            Front {potSplitPct.front}% · Back {potSplitPct.back}% · Overall {potSplitPct.overall}% · Junk {potSplitPct.junk}%
          </p>
        </div>

        <div className="pt-2 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-2">Foursomes</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {teams.map((team) => (
              <div key={team.id} className="rounded-lg border border-gray-200 p-2">
                <p className="text-sm font-medium text-gray-900">
                  {team.name}
                  {team.teeTime ? <span className="ml-2 text-xs text-gray-500">{team.teeTime}</span> : null}
                </p>
                {team.playerIds.map((pid) => {
                  const p = playerById.get(pid);
                  if (!p) return null;
                  return (
                    <p key={pid} className="text-sm text-gray-600">
                      {p.name} ({p.handicapIndex ?? '—'})
                    </p>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={onCreate}
        className="mt-6 w-full rounded-md bg-green-700 px-4 py-3 text-white font-bold text-lg hover:bg-green-800"
      >
        Create Pool Game
      </button>
    </div>
  );
}
