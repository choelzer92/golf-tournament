'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, TEAM_MODES, getTeamModeConfig } from '@/lib/formats';
import type { TeamMode } from '@/lib/formats';
import type { Player, CourseSelection, TeeSetOption } from '@/lib/game-state';
import type { Tournament, TournamentRound, Team } from '@/lib/tournament-state';
import { saveTournament } from '@/lib/tournament-state';

const WIZARD_KEY = 'tournament_wizard_draft';

type Step = 'details' | 'roster' | 'schedule' | 'review';

function getToken() {
  return sessionStorage.getItem('ghin_token');
}

export default function NewTournamentPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('details');
  const [hydrated, setHydrated] = useState(false);

  const [name, setName] = useState('');
  const [teamAName, setTeamAName] = useState('Team A');
  const [teamBName, setTeamBName] = useState('Team B');

  const [players, setPlayers] = useState<Player[]>([]);
  const [teamAssignments, setTeamAssignments] = useState<Record<string, 'A' | 'B'>>({});

  const [rounds, setRounds] = useState<Omit<TournamentRound, 'matchups' | 'status' | 'bonuses'>[]>([]);

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(WIZARD_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.name) setName(data.name);
        if (data.teamAName) setTeamAName(data.teamAName);
        if (data.teamBName) setTeamBName(data.teamBName);
        if (data.players) setPlayers(data.players);
        if (data.teamAssignments) setTeamAssignments(data.teamAssignments);
        if (data.rounds) setRounds(data.rounds);
        if (data.step) setStep(data.step);
      }
    } catch {}
    setHydrated(true);
  }, []);

  // Auto-save wizard state on every change
  useEffect(() => {
    if (!hydrated) return;
    sessionStorage.setItem(WIZARD_KEY, JSON.stringify({
      name, teamAName, teamBName, players, teamAssignments, rounds, step,
    }));
  }, [hydrated, name, teamAName, teamBName, players, teamAssignments, rounds, step]);

  function createTournament() {
    const id = crypto.randomUUID();
    const teamAPlayerIds = players.filter((p) => teamAssignments[p.id] === 'A').map((p) => p.id);
    const teamBPlayerIds = players.filter((p) => teamAssignments[p.id] === 'B').map((p) => p.id);

    const tournament: Tournament = {
      id,
      name: name || 'My Tournament',
      mode: 'team-event',
      players,
      teams: [
        { id: 'team-a', name: teamAName, playerIds: teamAPlayerIds },
        { id: 'team-b', name: teamBName, playerIds: teamBPlayerIds },
      ],
      rounds: rounds.map((r, i) => ({
        ...r,
        order: i,
        matchups: [],
        bonuses: (r as any).bonuses || [],
        status: 'pending' as const,
      })),
      status: 'active',
    };

    saveTournament(tournament);
    sessionStorage.removeItem(WIZARD_KEY);
    router.push(`/tournament/${id}`);
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">New Tournament</h1>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-green-200 hover:text-white">
            Cancel
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <StepIndicator current={step} />

        {step === 'details' && (
          <DetailsStep
            name={name}
            setName={setName}
            teamAName={teamAName}
            setTeamAName={setTeamAName}
            teamBName={teamBName}
            setTeamBName={setTeamBName}
            onNext={() => setStep('roster')}
          />
        )}

        {step === 'roster' && (
          <RosterStep
            players={players}
            setPlayers={setPlayers}
            teamAssignments={teamAssignments}
            setTeamAssignments={setTeamAssignments}
            teamAName={teamAName}
            teamBName={teamBName}
            onNext={() => setStep('schedule')}
            onBack={() => setStep('details')}
          />
        )}

        {step === 'schedule' && (
          <ScheduleStep
            rounds={rounds}
            setRounds={setRounds}
            onNext={() => setStep('review')}
            onBack={() => setStep('roster')}
          />
        )}

        {step === 'review' && (
          <ReviewStep
            name={name || 'My Tournament'}
            teamAName={teamAName}
            teamBName={teamBName}
            players={players}
            teamAssignments={teamAssignments}
            rounds={rounds}
            onCreate={createTournament}
            onBack={() => setStep('schedule')}
          />
        )}
      </main>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { key: 'details', label: 'Details' },
    { key: 'roster', label: 'Roster' },
    { key: 'schedule', label: 'Schedule' },
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

function DetailsStep({
  name, setName, teamAName, setTeamAName, teamBName, setTeamBName, onNext,
}: {
  name: string; setName: (s: string) => void;
  teamAName: string; setTeamAName: (s: string) => void;
  teamBName: string; setTeamBName: (s: string) => void;
  onNext: () => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Tournament Details</h2>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tournament Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Guys Trip 2026"
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div className="pt-2 border-t">
          <p className="text-sm font-medium text-gray-700 mb-3">Teams</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Team 1</label>
              <input
                type="text"
                value={teamAName}
                onChange={(e) => setTeamAName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Team 2</label>
              <input
                type="text"
                value={teamBName}
                onChange={(e) => setTeamBName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        <div className="pt-2 border-t">
          <p className="text-sm text-gray-500">
            Mode: <span className="font-medium text-gray-900">Team Event</span>
            <span className="ml-2 text-xs text-gray-400">(Flight Bracket coming soon)</span>
          </p>
        </div>
      </div>

      <button
        onClick={onNext}
        className="mt-6 w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800"
      >
        Next: Add Players
      </button>
    </div>
  );
}

function RosterStep({
  players, setPlayers, teamAssignments, setTeamAssignments,
  teamAName, teamBName, onNext, onBack,
}: {
  players: Player[]; setPlayers: (p: Player[]) => void;
  teamAssignments: Record<string, 'A' | 'B'>; setTeamAssignments: (a: Record<string, 'A' | 'B'>) => void;
  teamAName: string; teamBName: string;
  onNext: () => void; onBack: () => void;
}) {
  const [nameInput, setNameInput] = useState('');
  const [handicapInput, setHandicapInput] = useState('');
  const [genderInput, setGenderInput] = useState<'M' | 'F'>('M');
  const [ghinInput, setGhinInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function addByGhin() {
    const token = getToken();
    if (!token || !ghinInput) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ghin/golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ghin_number: Number(ghinInput) }),
      });
      const data = await res.json();
      if (!res.ok) return;
      const golfer = data.golfer;
      const hi = parseFloat(golfer.handicap_index ?? golfer.hi_value ?? '0');
      const ghinGender = (golfer.gender || golfer.Gender || '').toLowerCase();
      const newPlayer: Player = {
        id: crypto.randomUUID(),
        name: `${golfer.first_name} ${golfer.last_name}`,
        handicapIndex: hi,
        gender: ghinGender === 'female' || ghinGender === 'f' ? 'F' : 'M',
        ghinNumber: Number(ghinInput),
      };
      const teamACount = Object.values(teamAssignments).filter((t) => t === 'A').length;
      const teamBCount = Object.values(teamAssignments).filter((t) => t === 'B').length;
      const assignTeam = teamACount <= teamBCount ? 'A' : 'B';

      setPlayers([...players, newPlayer]);
      setTeamAssignments({ ...teamAssignments, [newPlayer.id]: assignTeam });
      setGhinInput('');
    } finally {
      setLoading(false);
    }
  }

  function addManual() {
    if (!nameInput) return;
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      name: nameInput,
      handicapIndex: handicapInput ? parseFloat(handicapInput) : null,
      gender: genderInput,
    };
    const teamACount = Object.values(teamAssignments).filter((t) => t === 'A').length;
    const teamBCount = Object.values(teamAssignments).filter((t) => t === 'B').length;
    const assignTeam = teamACount <= teamBCount ? 'A' : 'B';

    setPlayers([...players, newPlayer]);
    setTeamAssignments({ ...teamAssignments, [newPlayer.id]: assignTeam });
    setNameInput('');
    setHandicapInput('');
  }

  function removePlayer(id: string) {
    setPlayers(players.filter((p) => p.id !== id));
    const updated = { ...teamAssignments };
    delete updated[id];
    setTeamAssignments(updated);
  }

  function toggleTeam(id: string) {
    setTeamAssignments({
      ...teamAssignments,
      [id]: teamAssignments[id] === 'A' ? 'B' : 'A',
    });
  }

  const teamA = players.filter((p) => teamAssignments[p.id] === 'A');
  const teamB = players.filter((p) => teamAssignments[p.id] === 'B');

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Players ({players.length})</h2>

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <p className="text-sm font-medium text-gray-700 mb-2">Add by GHIN #</p>
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
            disabled={loading || !ghinInput}
            className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
          >
            {loading ? '...' : 'Add'}
          </button>
        </div>

        <div className="mt-3 pt-3 border-t">
          <p className="text-sm font-medium text-gray-700 mb-2">Or add manually</p>
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

      {players.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-2">{teamAName} ({teamA.length})</h3>
            <div className="space-y-1">
              {teamA.map((p) => (
                <div key={p.id} className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPlayers(players.map((pl) => pl.id === p.id ? { ...pl, gender: pl.gender === 'F' ? 'M' : 'F' } : pl))}
                      className={`text-[10px] font-bold w-5 h-5 rounded-full ${p.gender === 'F' ? 'bg-pink-200 text-pink-700' : 'bg-blue-200 text-blue-700'}`}
                    >
                      {p.gender || 'M'}
                    </button>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.handicapIndex ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => toggleTeam(p.id)} className="text-xs text-blue-600 hover:text-blue-800 px-1">&rarr;</button>
                    <button onClick={() => removePlayer(p.id)} className="text-xs text-red-500 hover:text-red-700 px-1">&times;</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-2">{teamBName} ({teamB.length})</h3>
            <div className="space-y-1">
              {teamB.map((p) => (
                <div key={p.id} className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPlayers(players.map((pl) => pl.id === p.id ? { ...pl, gender: pl.gender === 'F' ? 'M' : 'F' } : pl))}
                      className={`text-[10px] font-bold w-5 h-5 rounded-full ${p.gender === 'F' ? 'bg-pink-200 text-pink-700' : 'bg-blue-200 text-blue-700'}`}
                    >
                      {p.gender || 'M'}
                    </button>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.handicapIndex ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => toggleTeam(p.id)} className="text-xs text-red-600 hover:text-red-800 px-1">&larr;</button>
                    <button onClick={() => removePlayer(p.id)} className="text-xs text-red-500 hover:text-red-700 px-1">&times;</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={players.length < 2}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Schedule Rounds
      </button>
    </div>
  );
}

function ScheduleStep({
  rounds, setRounds, onNext, onBack,
}: {
  rounds: Omit<TournamentRound, 'matchups' | 'status' | 'bonuses'>[];
  setRounds: (r: Omit<TournamentRound, 'matchups' | 'status' | 'bonuses'>[]) => void;
  onNext: () => void; onBack: () => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);

  function addRound(round: Omit<TournamentRound, 'matchups' | 'status' | 'bonuses'>) {
    setRounds([...rounds, round]);
    setShowAddForm(false);
  }

  function removeRound(id: string) {
    setRounds(rounds.filter((r) => r.id !== id));
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Schedule ({rounds.length} rounds)</h2>

      {rounds.length > 0 && (
        <div className="space-y-2 mb-4">
          {rounds.map((round) => {
            const format = FORMATS.find((f) => f.id === round.formatId);
            return (
              <div key={round.id} className="bg-white rounded-lg shadow p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{round.dayLabel} — {format?.name || round.formatId}</p>
                  <p className="text-xs text-gray-500">
                    {round.holesPlaying === '18' ? '18 holes' : '9 holes'}
                    {' · '}{round.scoringMethod === 'match-play' ? 'Match Play' : 'Stroke Play'}
                    {round.course ? ` · ${round.course.courseName}` : ''}
                  </p>
                </div>
                <button onClick={() => removeRound(round.id)} className="text-red-500 hover:text-red-700 text-sm">
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showAddForm ? (
        <AddRoundForm
          onAdd={addRound}
          onCancel={() => setShowAddForm(false)}
          roundOrder={rounds.length}
        />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full rounded-md border-2 border-dashed border-gray-300 px-4 py-3 text-gray-600 font-medium hover:border-green-500 hover:text-green-700 mb-4"
        >
          + Add Round
        </button>
      )}

      <button
        onClick={onNext}
        disabled={rounds.length === 0}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Review
      </button>
    </div>
  );
}

function AddRoundForm({
  onAdd, onCancel, roundOrder,
}: {
  onAdd: (r: Omit<TournamentRound, 'matchups' | 'status' | 'bonuses'>) => void;
  onCancel: () => void;
  roundOrder: number;
}) {
  const [dayLabel, setDayLabel] = useState('Day 1');
  const [formatId, setFormatId] = useState('match-play');
  const [teamMode, setTeamMode] = useState<TeamMode>(FORMATS.find((f) => f.id === 'match-play')!.defaultTeamMode);
  const [holesPlaying, setHolesPlaying] = useState<'18' | 'front9' | 'back9'>('18');
  const [groupingMode, setGroupingMode] = useState<'cross-team' | 'same-team'>('cross-team');
  const [scoringMethod, setScoringMethod] = useState<'match-play' | 'stroke-play'>('match-play');
  const [pointsForWin, setPointsForWin] = useState(2);
  const [pointsForTie, setPointsForTie] = useState(1);
  const [pointsForLoss, setPointsForLoss] = useState(0);
  const [course, setCourse] = useState<CourseSelection | null>(null);
  const [showCourseSearch, setShowCourseSearch] = useState(false);
  const [handicapAllowance, setHandicapAllowance] = useState(() => {
    const tmCfg = getTeamModeConfig(FORMATS.find((f) => f.id === 'match-play')!.defaultTeamMode);
    return tmCfg.usgaAllowance === 'tiered' ? -1 : tmCfg.usgaAllowance;
  });
  const [strokeMethod, setStrokeMethod] = useState<'full' | 'off-the-low'>(() => {
    return getTeamModeConfig(FORMATS.find((f) => f.id === 'match-play')!.defaultTeamMode).usgaStrokeMethod;
  });
  const [handicapBasis, setHandicapBasis] = useState<'course' | 'index'>('course');
  const [defaultTeeId, setDefaultTeeId] = useState<number | null>(null);
  const [formatSettings, setFormatSettings] = useState<Record<string, string | number | boolean>>({});

  function handleFormatChange(newFormatId: string) {
    setFormatId(newFormatId);
    const f = FORMATS.find((fmt) => fmt.id === newFormatId);
    if (f) {
      const newMode = f.defaultTeamMode;
      setTeamMode(newMode);
      const tmCfg = getTeamModeConfig(newMode);
      const allowance = f.usgaAllowanceOverride ?? (tmCfg.usgaAllowance === 'tiered' ? -1 : tmCfg.usgaAllowance);
      setHandicapAllowance(allowance);
      setScoringMethod(f.scoringType === 'hole-by-hole' ? 'match-play' : 'stroke-play');
      setStrokeMethod(f.usgaStrokeMethodOverride ?? tmCfg.usgaStrokeMethod);
      const defaults: Record<string, string | number | boolean> = {};
      f.settings?.forEach((s) => { defaults[s.key] = s.defaultValue; });
      setFormatSettings(defaults);
    }
  }

  function handleCourseSelect(c: CourseSelection) {
    setCourse(c);
    setDefaultTeeId(c.teeSets[0]?.id || null);
    setShowCourseSearch(false);
  }

  function handleAdd() {
    const format = FORMATS.find((f) => f.id === formatId);
    onAdd({
      id: crypto.randomUUID(),
      name: `${dayLabel} — ${format?.name || formatId}`,
      dayLabel,
      formatId,
      teamMode,
      formatSettings,
      course,
      holesPlaying,
      groupingMode,
      scoringMethod,
      pointsForWin,
      pointsForTie,
      pointsForLoss,
      handicapAllowance,
      strokeMethod,
      handicapBasis,
      defaultTeeId,
      order: roundOrder,
    });
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Add Round</h3>
        <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Day / Label</label>
        <input
          type="text"
          value={dayLabel}
          onChange={(e) => setDayLabel(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Format</label>
        <select
          value={formatId}
          onChange={(e) => handleFormatChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Holes</label>
        <select
          value={holesPlaying}
          onChange={(e) => setHolesPlaying(e.target.value as '18' | 'front9' | 'back9')}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          <option value="18">18 Holes</option>
          <option value="front9">Front 9</option>
          <option value="back9">Back 9</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Scoring</label>
        <select
          value={scoringMethod}
          onChange={(e) => setScoringMethod(e.target.value as 'match-play' | 'stroke-play')}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          <option value="match-play">Match Play (hole by hole)</option>
          <option value="stroke-play">Stroke Play (total strokes)</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Win pts</label>
          <input
            type="number"
            step="0.5"
            value={pointsForWin}
            onChange={(e) => setPointsForWin(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tie pts</label>
          <input
            type="number"
            step="0.5"
            value={pointsForTie}
            onChange={(e) => setPointsForTie(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Loss pts</label>
          <input
            type="number"
            step="0.5"
            value={pointsForLoss}
            onChange={(e) => setPointsForLoss(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
      </div>

      {!showCourseSearch ? (
        <button
          onClick={() => setShowCourseSearch(true)}
          className="text-sm text-green-700 hover:underline"
        >
          {course ? `Course: ${course.courseName}` : '+ Add course (optional)'}
        </button>
      ) : (
        <CourseSearchInline
          onSelect={handleCourseSelect}
          onCancel={() => setShowCourseSearch(false)}
        />
      )}

      {course && course.teeSets.length > 0 && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Default Tees</label>
          <select
            value={defaultTeeId || ''}
            onChange={(e) => setDefaultTeeId(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            {course.teeSets.map((ts) => (
              <option key={ts.id} value={ts.id}>{ts.name} ({ts.totalYardage} yds)</option>
            ))}
          </select>
        </div>
      )}

      <div className="pt-2 border-t">
        <p className="text-xs font-medium text-gray-700 mb-2">Team Mode & Handicap</p>
        {(() => {
          const tmCfg = getTeamModeConfig(teamMode);
          const usgaAllow = tmCfg.usgaAllowance;
          const usgaStroke = tmCfg.usgaStrokeMethod;
          const isUsga = (usgaAllow === 'tiered' ? handicapAllowance === -1 : handicapAllowance === usgaAllow)
            && strokeMethod === usgaStroke;
          const usgaLabel = usgaAllow === 'tiered'
            ? 'Tiered (2p: 35/15, 3p: 20/15/10, 4p: 20/15/10/5)'
            : `${usgaAllow}%`;
          return (
            <div className={`flex items-center gap-2 text-[10px] rounded px-2 py-1.5 mb-2 ${
              isUsga ? 'bg-green-100 text-green-800' : 'bg-amber-50 text-amber-700'
            }`}>
              <span className="font-bold">USGA:</span>
              <span>{usgaLabel} / {usgaStroke === 'off-the-low' ? 'Off the Low' : 'Full'} for {tmCfg.name}</span>
              {!isUsga && (
                <button
                  onClick={() => {
                    setHandicapAllowance(usgaAllow === 'tiered' ? -1 : usgaAllow);
                    setStrokeMethod(usgaStroke);
                  }}
                  className="ml-auto underline font-medium"
                >
                  Reset
                </button>
              )}
            </div>
          );
        })()}

        {/* Team mode selector */}
        {(() => {
          const fmt = FORMATS.find((f) => f.id === formatId);
          if (!fmt || fmt.allowedTeamModes.length <= 1) return null;
          return (
            <div className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">Team Mode</label>
              <select
                value={teamMode}
                onChange={(e) => {
                  const newMode = e.target.value as TeamMode;
                  setTeamMode(newMode);
                  const tmCfg = getTeamModeConfig(newMode);
                  setHandicapAllowance(tmCfg.usgaAllowance === 'tiered' ? -1 : tmCfg.usgaAllowance);
                  setStrokeMethod(tmCfg.usgaStrokeMethod);
                  const newSettings = { ...formatSettings };
                  tmCfg.settings?.forEach((s) => { newSettings[s.key] = s.defaultValue; });
                  setFormatSettings(newSettings);
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                {fmt.allowedTeamModes.map((m) => {
                  const cfg = getTeamModeConfig(m);
                  return <option key={m} value={m}>{cfg.name}</option>;
                })}
              </select>
            </div>
          );
        })()}

        {/* Team mode settings (e.g. ball selection for two-best-balls) */}
        {(() => {
          const tmCfg = getTeamModeConfig(teamMode);
          if (!tmCfg.settings?.length) return null;
          return tmCfg.settings.map((setting) => (
            <div key={setting.key} className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">{setting.label}</label>
              <select
                value={(formatSettings[setting.key] as string) ?? setting.defaultValue}
                onChange={(e) => setFormatSettings({ ...formatSettings, [setting.key]: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                {setting.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          ));
        })()}

        {/* Format-level settings (e.g. stableford scale, presses) */}
        {(() => {
          const fmt = FORMATS.find((f) => f.id === formatId);
          if (!fmt?.settings?.length) return null;
          return fmt.settings.map((setting) => (
            <div key={setting.key} className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">{setting.label}</label>
              {setting.type === 'select' && setting.options && (
                <select
                  value={(formatSettings[setting.key] as string) ?? setting.defaultValue}
                  onChange={(e) => setFormatSettings({ ...formatSettings, [setting.key]: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  {setting.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
              {setting.type === 'toggle' && (
                <button
                  onClick={() => setFormatSettings({ ...formatSettings, [setting.key]: !formatSettings[setting.key] })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${formatSettings[setting.key] ? 'bg-green-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${formatSettings[setting.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              )}
            </div>
          ));
        })()}

        {/* Custom stableford point values */}
        {formatId === 'stableford' && formatSettings.stablefordScale === 'custom' && (
          <div className="space-y-2">
            <label className="block text-xs text-gray-500">Custom Point Values</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'stablefordPts_albatross', label: 'Albatross+', def: 5 },
                { key: 'stablefordPts_eagle', label: 'Eagle', def: 4 },
                { key: 'stablefordPts_birdie', label: 'Birdie', def: 3 },
                { key: 'stablefordPts_par', label: 'Par', def: 2 },
                { key: 'stablefordPts_bogey', label: 'Bogey', def: 1 },
                { key: 'stablefordPts_double', label: 'Double+', def: 0 },
              ] as const).map(({ key, label, def }) => (
                <div key={key} className="flex items-center gap-1">
                  <span className="text-xs text-gray-600 w-16">{label}</span>
                  <input
                    type="number"
                    value={(formatSettings[key] as number) ?? def}
                    onChange={(e) => setFormatSettings({ ...formatSettings, [key]: Number(e.target.value) })}
                    className="w-14 rounded-md border border-gray-300 px-1 py-1 text-xs text-center"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Allowance</label>
            <select
              value={handicapAllowance}
              onChange={(e) => setHandicapAllowance(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {teamMode === 'scramble' && <option value={-1}>Tiered (USGA)</option>}
              {[100, 95, 90, 85, 80, 75, 50, 25, 0].map((v) => (
                <option key={v} value={v}>{v}%</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Strokes</label>
            <select
              value={strokeMethod}
              onChange={(e) => setStrokeMethod(e.target.value as 'full' | 'off-the-low')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="off-the-low">Off the Low</option>
              <option value="full">Full</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Basis</label>
            <select
              value={handicapBasis}
              onChange={(e) => setHandicapBasis(e.target.value as 'course' | 'index')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="course">Course HCP</option>
              <option value="index">Index</option>
            </select>
          </div>
        </div>
      </div>

      <button
        onClick={handleAdd}
        className="w-full rounded-md bg-green-700 px-4 py-2 text-white font-medium text-sm hover:bg-green-800"
      >
        Add Round
      </button>
    </div>
  );
}

function CourseSearchInline({ onSelect, onCancel }: { onSelect: (c: CourseSelection) => void; onCancel: () => void }) {
  const [searchName, setSearchName] = useState('');
  const [searchState, setSearchState] = useState('VA');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
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
    setSearchError('');
    setSearched(false);
    try {
      const res = await fetch('/api/ghin/courses/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: searchName, state: searchState }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.courses || []);
        setSearched(true);
      } else {
        // Token expired on GHIN side — force re-auth
        sessionStorage.removeItem('ghin_token');
        setNoToken(true);
        setSearchError(data.error || 'Search failed — try logging in again');
      }
    } catch {
      setSearchError('Network error');
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
      if (!res.ok) return;
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
      const teeSets = mensTeeSets.length > 0 ? [...mensTeeSets, ...womensTeeSets.map((t) => ({ ...t, name: `${t.name} (W)` }))] : allTeeSets;
      onSelect({
        courseId: courseResult.CourseID,
        courseName: courseResult.CourseName || courseData.CourseName,
        city: courseResult.City || courseData.CourseCity || '',
        state: courseResult.State || courseData.CourseState || '',
        teeSets,
        selectedTeeId: teeSets[0]?.id || null,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-700">Search Course</p>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
      {noToken && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2 space-y-2">
          <p className="text-xs text-amber-800 font-medium">GHIN session expired — log in to search courses</p>
          <form onSubmit={quickAuth} className="flex gap-2">
            <input
              type="text"
              value={ghinUser}
              onChange={(e) => setGhinUser(e.target.value)}
              placeholder="GHIN email"
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
            />
            <input
              type="password"
              value={ghinPass}
              onChange={(e) => setGhinPass(e.target.value)}
              placeholder="Password"
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
            />
            <button type="submit" className="rounded bg-amber-600 px-2 py-1 text-xs text-white font-medium hover:bg-amber-700">
              Login
            </button>
          </form>
          {authError && <p className="text-xs text-red-600">{authError}</p>}
        </div>
      )}
      <form onSubmit={search} className="flex gap-2">
        <input
          type="text"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          placeholder="Course name"
          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <input
          type="text"
          value={searchState}
          onChange={(e) => setSearchState(e.target.value.toUpperCase())}
          placeholder="ST"
          maxLength={2}
          className="w-12 rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <button type="submit" disabled={loading} className="rounded-md bg-green-700 px-2 py-1.5 text-xs text-white font-medium hover:bg-green-800 disabled:opacity-50">
          {loading ? '...' : 'Go'}
        </button>
      </form>
      {searchError && <p className="text-xs text-red-600">{searchError}</p>}
      {results.length > 0 && (
        <ul className="max-h-32 overflow-y-auto divide-y divide-gray-100 text-sm">
          {results.slice(0, 5).map((c: any) => (
            <li key={c.CourseID}>
              <button onClick={() => selectCourse(c)} disabled={loading} className="w-full text-left px-2 py-1.5 hover:bg-gray-50">
                <span className="font-medium">{c.CourseName}</span>
                <span className="text-xs text-gray-500 ml-1">{c.City}, {c.State}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && results.length === 0 && !searchError && (
        <p className="text-xs text-gray-500">No courses found. Try a different name or state.</p>
      )}
    </div>
  );
}

function ReviewStep({
  name, teamAName, teamBName, players, teamAssignments, rounds, onCreate, onBack,
}: {
  name: string; teamAName: string; teamBName: string;
  players: Player[];
  teamAssignments: Record<string, 'A' | 'B'>;
  rounds: Omit<TournamentRound, 'matchups' | 'status' | 'bonuses'>[];
  onCreate: () => void; onBack: () => void;
}) {
  const teamA = players.filter((p) => teamAssignments[p.id] === 'A');
  const teamB = players.filter((p) => teamAssignments[p.id] === 'B');

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Review Tournament</h2>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <p className="text-sm text-gray-500">Tournament</p>
          <p className="text-lg font-bold text-gray-900">{name}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div>
            <p className="text-sm font-bold text-blue-700 mb-1">{teamAName}</p>
            {teamA.map((p) => (
              <p key={p.id} className="text-sm text-gray-700">{p.name} ({p.handicapIndex ?? '—'})</p>
            ))}
          </div>
          <div>
            <p className="text-sm font-bold text-red-700 mb-1">{teamBName}</p>
            {teamB.map((p) => (
              <p key={p.id} className="text-sm text-gray-700">{p.name} ({p.handicapIndex ?? '—'})</p>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t">
          <p className="text-sm font-medium text-gray-700 mb-2">Schedule ({rounds.length} rounds)</p>
          {rounds.map((round) => {
            const format = FORMATS.find((f) => f.id === round.formatId);
            return (
              <div key={round.id} className="text-sm text-gray-600 mb-1">
                <span className="font-medium text-gray-900">{round.dayLabel}</span>
                {' — '}{format?.name}
                {' · '}{round.holesPlaying === '18' ? '18H' : '9H'}
                {round.course ? ` · ${round.course.courseName}` : ''}
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={onCreate}
        className="mt-6 w-full rounded-md bg-green-700 px-4 py-3 text-white font-bold text-lg hover:bg-green-800"
      >
        Create Tournament
      </button>
    </div>
  );
}
