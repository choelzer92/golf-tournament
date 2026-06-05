'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Player, CourseSelection, TeeSetOption, HandicapBasis } from '@/lib/game-state';
import type { Tournament, TournamentRound, RoundBonus } from '@/lib/tournament-state';
import { saveTournament } from '@/lib/tournament-state';
import { DEFAULT_MONEY_CONFIG, type MoneyConfig } from '@/lib/money-game';

type Step = 'config' | 'course' | 'players' | 'review';

function getToken() {
  return sessionStorage.getItem('ghin_token');
}

export default function MoneyGamePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('config');
  const [teamAName, setTeamAName] = useState('Team A');
  const [teamBName, setTeamBName] = useState('Team B');
  const [moneyConfig, setMoneyConfig] = useState<MoneyConfig>(DEFAULT_MONEY_CONFIG);
  const [handicapBasis, setHandicapBasis] = useState<HandicapBasis>('index');
  const [course, setCourse] = useState<CourseSelection | null>(null);
  const [defaultTeeId, setDefaultTeeId] = useState<number | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamAssignments, setTeamAssignments] = useState<Record<string, 'A' | 'B'>>({});

  function createGame() {
    const id = crypto.randomUUID();
    const teamAPlayerIds = players.filter((p) => teamAssignments[p.id] === 'A').map((p) => p.id);
    const teamBPlayerIds = players.filter((p) => teamAssignments[p.id] === 'B').map((p) => p.id);
    const unassignedIds = players.filter((p) => !teamAssignments[p.id]).map((p) => p.id);

    // Put unassigned players on team A temporarily — they'll be reassigned on the round page
    const finalTeamA = [...teamAPlayerIds, ...unassignedIds];

    const bonuses: RoundBonus[] = [
      { id: crypto.randomUUID(), type: 'nassau-front', name: `Front 9 ($${moneyConfig.nassauFront})`, points: 1, scope: 'per-tournament-round' },
      { id: crypto.randomUUID(), type: 'nassau-back', name: `Back 9 ($${moneyConfig.nassauBack})`, points: 1, scope: 'per-tournament-round' },
      { id: crypto.randomUUID(), type: 'nassau-overall', name: `Overall ($${moneyConfig.nassauOverall})`, points: 1, scope: 'per-tournament-round' },
      { id: crypto.randomUUID(), type: 'junk', name: `Birdies ($${moneyConfig.birdieValue}/ea) & Eagles ($${moneyConfig.eagleValue}/ea)`, points: 1, scope: 'per-tournament-round' },
    ];

    const round: TournamentRound = {
      id: crypto.randomUUID(),
      name: 'Money Game',
      dayLabel: new Date().toLocaleDateString(),
      formatId: 'nassau',
      teamMode: 'two-best-balls',
      course: course ? { ...course, selectedTeeId: defaultTeeId } : null,
      holesPlaying: '18',
      groupingMode: 'same-team',
      scoringMethod: 'match-play',
      pointsForWin: 1,
      pointsForTie: 0.5,
      pointsForLoss: 0,
      handicapAllowance: 90,
      strokeMethod: 'off-the-low',
      handicapBasis,
      defaultTeeId,
      formatSettings: { ballSelection: '2-best-net' },
      bonuses,
      matchups: [],
      status: 'pending',
      order: 0,
    };

    const tournament: Tournament = {
      id,
      name: `Money Game — ${new Date().toLocaleDateString()}`,
      mode: 'team-event',
      players,
      teams: [
        { id: 'team-a', name: teamAName, playerIds: teamAPlayerIds.length > 0 ? teamAPlayerIds : finalTeamA },
        { id: 'team-b', name: teamBName, playerIds: teamBPlayerIds },
      ],
      rounds: [round],
      status: 'active',
    };

    // Store money config in sessionStorage for the scoreboard to use
    sessionStorage.setItem(`money_config_${id}`, JSON.stringify(moneyConfig));

    saveTournament(tournament);
    router.push(`/tournament/${id}`);
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Money Game</h1>
            <p className="text-xs text-green-200">4v4 Two Best Balls + Nassau</p>
          </div>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-green-200 hover:text-white">
            Cancel
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <MoneyStepIndicator current={step} />

        {step === 'config' && (
          <ConfigStep
            teamAName={teamAName}
            setTeamAName={setTeamAName}
            teamBName={teamBName}
            setTeamBName={setTeamBName}
            moneyConfig={moneyConfig}
            setMoneyConfig={setMoneyConfig}
            handicapBasis={handicapBasis}
            setHandicapBasis={setHandicapBasis}
            onNext={() => setStep('course')}
          />
        )}

        {step === 'course' && (
          <CourseStep
            onSelect={(c) => {
              setCourse(c);
              setDefaultTeeId(c.teeSets[0]?.id || null);
              setStep('players');
            }}
            onBack={() => setStep('config')}
          />
        )}

        {step === 'players' && (
          <PlayersStep
            players={players}
            setPlayers={setPlayers}
            teamAssignments={teamAssignments}
            setTeamAssignments={setTeamAssignments}
            teamAName={teamAName}
            teamBName={teamBName}
            course={course}
            defaultTeeId={defaultTeeId}
            onNext={() => setStep('review')}
            onBack={() => setStep('course')}
          />
        )}

        {step === 'review' && (
          <ReviewStep
            teamAName={teamAName}
            teamBName={teamBName}
            moneyConfig={moneyConfig}
            players={players}
            teamAssignments={teamAssignments}
            course={course}
            onStart={createGame}
            onBack={() => setStep('players')}
          />
        )}
      </main>
    </div>
  );
}

function MoneyStepIndicator({ current }: { current: Step }) {
  const steps = [
    { key: 'config', label: 'Stakes' },
    { key: 'course', label: 'Course' },
    { key: 'players', label: 'Players' },
    { key: 'review', label: 'Review' },
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

function ConfigStep({
  teamAName, setTeamAName, teamBName, setTeamBName,
  moneyConfig, setMoneyConfig, handicapBasis, setHandicapBasis, onNext,
}: {
  teamAName: string; setTeamAName: (v: string) => void;
  teamBName: string; setTeamBName: (v: string) => void;
  moneyConfig: MoneyConfig; setMoneyConfig: (v: MoneyConfig) => void;
  handicapBasis: HandicapBasis; setHandicapBasis: (v: HandicapBasis) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Game Setup</h2>
        <p className="text-sm text-gray-500 mb-4">
          4v4 Two Best Balls (Net), Nassau match play with birdie/eagle bonuses
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <h3 className="font-medium text-gray-800">Team Names</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Team A</label>
            <input
              type="text"
              value={teamAName}
              onChange={(e) => setTeamAName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Team B</label>
            <input
              type="text"
              value={teamBName}
              onChange={(e) => setTeamBName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <h3 className="font-medium text-gray-800">Handicap Basis</h3>
        <p className="text-xs text-gray-500">
          Player index = raw handicap index. Course handicap = adjusted for slope/rating of the tees being played.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setHandicapBasis('index')}
            className={`flex-1 py-2 rounded-md text-sm font-medium ${
              handicapBasis === 'index'
                ? 'bg-green-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Player Index
          </button>
          <button
            onClick={() => setHandicapBasis('course')}
            className={`flex-1 py-2 rounded-md text-sm font-medium ${
              handicapBasis === 'course'
                ? 'bg-green-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Course Handicap
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <h3 className="font-medium text-gray-800">Nassau Stakes (per player)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Front 9</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400">$</span>
              <input
                type="number"
                value={moneyConfig.nassauFront}
                onChange={(e) => setMoneyConfig({ ...moneyConfig, nassauFront: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Back 9</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400">$</span>
              <input
                type="number"
                value={moneyConfig.nassauBack}
                onChange={(e) => setMoneyConfig({ ...moneyConfig, nassauBack: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Overall</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400">$</span>
              <input
                type="number"
                value={moneyConfig.nassauOverall}
                onChange={(e) => setMoneyConfig({ ...moneyConfig, nassauOverall: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <h3 className="font-medium text-gray-800">Birdie/Eagle Bonus (per occurrence difference)</h3>
        <p className="text-xs text-gray-500">
          The team with more birdies/eagles wins the difference &times; the value below
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Per Birdie</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400">$</span>
              <input
                type="number"
                value={moneyConfig.birdieValue}
                onChange={(e) => setMoneyConfig({ ...moneyConfig, birdieValue: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Per Eagle</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400">$</span>
              <input
                type="number"
                value={moneyConfig.eagleValue}
                onChange={(e) => setMoneyConfig({ ...moneyConfig, eagleValue: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
        <h3 className="font-medium text-green-900 mb-2">Max payout per player</h3>
        <p className="text-sm text-green-800">
          If one team sweeps: ${moneyConfig.nassauFront + moneyConfig.nassauBack + moneyConfig.nassauOverall} nassau
          {' + '}birdie/eagle bonuses
        </p>
        <p className="text-xs text-green-600 mt-1">
          Format: Two Best Balls (2 best net per hole), Match Play per hole for Nassau, gross birdies/eagles for bonus
        </p>
      </div>

      <button
        onClick={onNext}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800"
      >
        Next: Select Course
      </button>
    </div>
  );
}

function CourseStep({ onSelect, onBack }: { onSelect: (c: CourseSelection) => void; onBack: () => void }) {
  const [searchName, setSearchName] = useState('');
  const [searchState, setSearchState] = useState('VA');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingCourse, setPendingCourse] = useState<{ teeSets: TeeSetOption[]; courseId: number; courseName: string; city: string; state: string } | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/ghin/courses/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: searchName, state: searchState }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setResults(data.courses || []);
    } catch {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  }

  async function selectCourse(courseId: number) {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch('/api/ghin/courses/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, course_id: courseId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }

      const c = data.course;
      const allTeeSets: TeeSetOption[] = (c.TeeSets || []).map((ts: any) => ({
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
      const teeSets = mensTeeSets.length > 0
        ? [...mensTeeSets, ...womensTeeSets.map((t) => ({ ...t, name: `${t.name} (W)` }))]
        : allTeeSets;

      setPendingCourse({
        teeSets,
        courseId: c.CourseId,
        courseName: c.CourseName,
        city: c.CourseCity || '',
        state: c.CourseState || '',
      });
    } catch {
      setError('Failed to load course');
    } finally {
      setLoading(false);
    }
  }

  function confirmTee(teeId: number) {
    if (!pendingCourse) return;
    onSelect({
      courseId: pendingCourse.courseId,
      courseName: pendingCourse.courseName,
      city: pendingCourse.city,
      state: pendingCourse.state,
      teeSets: pendingCourse.teeSets,
      selectedTeeId: teeId,
    });
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-green-700 hover:underline">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900">Select Course</h2>

      <form onSubmit={search} className="flex gap-3">
        <input
          type="text"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          placeholder="Course name"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <input
          type="text"
          value={searchState}
          onChange={(e) => setSearchState(e.target.value.toUpperCase())}
          placeholder="ST"
          maxLength={2}
          className="w-16 rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-green-700 px-4 py-2 text-white font-medium hover:bg-green-800 disabled:opacity-50"
        >
          {loading ? '...' : 'Search'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!pendingCourse && results.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <ul className="divide-y divide-gray-200">
            {results.map((c: any) => (
              <li key={c.CourseID}>
                <button
                  onClick={() => selectCourse(c.CourseID)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50"
                >
                  <p className="font-medium text-gray-900">{c.CourseName}</p>
                  <p className="text-sm text-gray-500">{c.FacilityName} — {c.City}, {c.State}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingCourse && (
        <div className="space-y-2">
          <p className="font-medium text-gray-900">{pendingCourse.courseName}</p>
          <p className="text-sm text-gray-500 mb-2">Select tees:</p>
          <div className="grid gap-2">
            {pendingCourse.teeSets.map((tee) => (
              <button
                key={tee.id}
                onClick={() => confirmTee(tee.id)}
                className="text-left p-3 bg-white rounded-lg shadow hover:shadow-md border border-gray-200 hover:border-green-500 transition"
              >
                <p className="font-medium text-gray-900">{tee.name}</p>
                <p className="text-xs text-gray-500">{tee.totalYardage} yds · Par {tee.totalPar}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayersStep({
  players, setPlayers, teamAssignments, setTeamAssignments,
  teamAName, teamBName, course, defaultTeeId, onNext, onBack,
}: {
  players: Player[]; setPlayers: (p: Player[]) => void;
  teamAssignments: Record<string, 'A' | 'B'>; setTeamAssignments: (a: Record<string, 'A' | 'B'>) => void;
  teamAName: string; teamBName: string;
  course: CourseSelection | null; defaultTeeId: number | null;
  onNext: () => void; onBack: () => void;
}) {
  const [ghinInput, setGhinInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [handicapInput, setHandicapInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function addByGhin(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/ghin/golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ghin_number: Number(ghinInput) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Lookup failed'); return; }

      const g = data.golfer;
      const newPlayer: Player = {
        id: crypto.randomUUID(),
        name: `${g.first_name} ${g.last_name}`,
        handicapIndex: g.handicap_index ?? g.hi_value ?? null,
        gender: g.gender === 'Female' ? 'F' : 'M',
        ghinNumber: Number(ghinInput),
      };
      setPlayers([...players, newPlayer]);
      setGhinInput('');
    } catch {
      setError('Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  function addManual(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) return;
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      name: nameInput.trim(),
      handicapIndex: handicapInput ? Number(handicapInput) : null,
    };
    setPlayers([...players, newPlayer]);
    setNameInput('');
    setHandicapInput('');
  }

  function removePlayer(id: string) {
    setPlayers(players.filter((p) => p.id !== id));
    const newAssignments = { ...teamAssignments };
    delete newAssignments[id];
    setTeamAssignments(newAssignments);
  }

  function assignTeam(playerId: string, team: 'A' | 'B') {
    setTeamAssignments({ ...teamAssignments, [playerId]: team });
  }

  const teamACount = Object.values(teamAssignments).filter((t) => t === 'A').length;
  const teamBCount = Object.values(teamAssignments).filter((t) => t === 'B').length;
  const allAssigned = teamACount === 4 && teamBCount === 4;
  const canProceed = players.length >= 2;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-green-700 hover:underline">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900">Add Players (8 needed)</h2>
      <p className="text-sm text-gray-500">
        Add players by GHIN number or manually, then assign 4 to each team.
      </p>

      <form onSubmit={addByGhin} className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={ghinInput}
          onChange={(e) => setGhinInput(e.target.value)}
          placeholder="GHIN #"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <button
          type="submit"
          disabled={loading || !ghinInput}
          className="rounded-md bg-green-700 px-4 py-2 text-white font-medium hover:bg-green-800 disabled:opacity-50"
        >
          {loading ? '...' : 'Add'}
        </button>
      </form>

      <form onSubmit={addManual} className="flex gap-2">
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Name"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <input
          type="number"
          step="0.1"
          value={handicapInput}
          onChange={(e) => setHandicapInput(e.target.value)}
          placeholder="HI"
          className="w-20 rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <button
          type="submit"
          disabled={!nameInput.trim()}
          className="rounded-md bg-gray-600 px-4 py-2 text-white font-medium hover:bg-gray-700 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {players.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-4 text-sm font-medium text-gray-600">
            <span className="flex-1">Player</span>
            <span className="w-20 text-center">{teamAName}</span>
            <span className="w-20 text-center">{teamBName}</span>
            <span className="w-8"></span>
          </div>
          {players.map((p) => (
            <div key={p.id} className="flex items-center gap-4 bg-white rounded-lg shadow px-3 py-2">
              <div className="flex-1">
                <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                <p className="text-xs text-gray-500">
                  {p.handicapIndex !== null ? `HI: ${p.handicapIndex}` : 'No handicap'}
                </p>
              </div>
              <button
                onClick={() => assignTeam(p.id, 'A')}
                className={`w-20 py-1 rounded text-xs font-medium ${
                  teamAssignments[p.id] === 'A'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-blue-50'
                }`}
              >
                {teamAName}
              </button>
              <button
                onClick={() => assignTeam(p.id, 'B')}
                className={`w-20 py-1 rounded text-xs font-medium ${
                  teamAssignments[p.id] === 'B'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-red-50'
                }`}
              >
                {teamBName}
              </button>
              <button
                onClick={() => removePlayer(p.id)}
                className="w-8 text-gray-400 hover:text-red-500 text-lg"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="text-sm text-gray-500">
        {players.length}/8 players &middot; {teamAName}: {teamACount}/4 &middot; {teamBName}: {teamBCount}/4
      </div>

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {canProceed
          ? allAssigned ? 'Next: Review' : 'Next: Review (teams can be assigned later)'
          : 'Add at least 2 players'}
      </button>
    </div>
  );
}

function ReviewStep({
  teamAName, teamBName, moneyConfig, players, teamAssignments, course, onStart, onBack,
}: {
  teamAName: string; teamBName: string;
  moneyConfig: MoneyConfig;
  players: Player[];
  teamAssignments: Record<string, 'A' | 'B'>;
  course: CourseSelection | null;
  onStart: () => void;
  onBack: () => void;
}) {
  const teamAPlayers = players.filter((p) => teamAssignments[p.id] === 'A');
  const teamBPlayers = players.filter((p) => teamAssignments[p.id] === 'B');

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-green-700 hover:underline">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900">Review & Start</h2>

      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <div>
          <p className="text-sm text-gray-500">Course</p>
          <p className="font-medium text-gray-900">{course?.courseName || 'Not selected'}</p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Format</p>
          <p className="font-medium text-gray-900">Two Best Balls (Net) &middot; Nassau Match Play</p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Stakes</p>
          <p className="font-medium text-gray-900">
            Front ${moneyConfig.nassauFront} &middot; Back ${moneyConfig.nassauBack} &middot; Overall ${moneyConfig.nassauOverall}
          </p>
          <p className="text-sm text-gray-700">
            Birdies ${moneyConfig.birdieValue}/diff &middot; Eagles ${moneyConfig.eagleValue}/diff
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="font-medium text-blue-900 mb-2">{teamAName}</p>
          {teamAPlayers.map((p) => (
            <p key={p.id} className="text-sm text-blue-800">
              {p.name} {p.handicapIndex !== null && <span className="text-blue-500">({p.handicapIndex})</span>}
            </p>
          ))}
        </div>
        <div className="bg-red-50 rounded-lg p-3">
          <p className="font-medium text-red-900 mb-2">{teamBName}</p>
          {teamBPlayers.map((p) => (
            <p key={p.id} className="text-sm text-red-800">
              {p.name} {p.handicapIndex !== null && <span className="text-red-500">({p.handicapIndex})</span>}
            </p>
          ))}
        </div>
      </div>

      <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
        <p className="text-sm text-yellow-800">
          <strong>Max exposure per player:</strong> ${moneyConfig.nassauFront + moneyConfig.nassauBack + moneyConfig.nassauOverall} (nassau) + birdie/eagle differential
        </p>
      </div>

      <button
        onClick={onStart}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-bold text-lg hover:bg-green-800"
      >
        Start Money Game
      </button>
    </div>
  );
}
