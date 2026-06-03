'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, type GameFormat, type FormatSetting } from '@/lib/formats';
import type { Player, CourseSelection, TeeSetOption, GameSetup, StrokeMethod, HandicapBasis } from '@/lib/game-state';
import { calcCourseHandicap } from '@/lib/game-state';

type Step = 'format' | 'course' | 'players' | 'settings';

function getToken() {
  return sessionStorage.getItem('ghin_token');
}

export default function NewGamePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('format');
  const [selectedFormat, setSelectedFormat] = useState<GameFormat | null>(null);
  const [course, setCourse] = useState<CourseSelection | null>(null);
  const [selectedTeeId, setSelectedTeeId] = useState<number | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [handicapAllowance, setHandicapAllowance] = useState(100);
  const [holesPlaying, setHolesPlaying] = useState<'18' | 'front9' | 'back9'>('18');
  const [strokeMethod, setStrokeMethod] = useState<StrokeMethod>('off-the-low');
  const [handicapBasis, setHandicapBasis] = useState<HandicapBasis>('course');
  const [formatSettings, setFormatSettings] = useState<Record<string, string | number | boolean>>({});

  function selectFormat(format: GameFormat) {
    setSelectedFormat(format);
    setHandicapAllowance(format.defaultHandicapAllowance);
    const defaults: Record<string, string | number | boolean> = {};
    format.settings?.forEach((s) => { defaults[s.key] = s.defaultValue; });
    setFormatSettings(defaults);
    setStep('course');
  }

  function onCourseSelected(c: CourseSelection) {
    setCourse(c);
    setSelectedTeeId(c.teeSets[0]?.id || null);
    setStep('players');
  }

  function startGame() {
    const setup: GameSetup = {
      formatId: selectedFormat!.id,
      course: course ? { ...course, selectedTeeId: selectedTeeId } : null,
      players,
      handicapAllowance,
      holesPlaying,
      strokeMethod,
      handicapBasis,
      formatSettings,
    };
    sessionStorage.setItem('game_setup', JSON.stringify(setup));
    router.push('/game/play');
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">New Game</h1>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-green-200 hover:text-white">
            Cancel
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <StepIndicator current={step} format={selectedFormat} course={course} />

        {step === 'format' && (
          <FormatStep onSelect={selectFormat} />
        )}

        {step === 'course' && (
          <CourseStep onSelect={onCourseSelected} onBack={() => setStep('format')} />
        )}

        {step === 'players' && selectedFormat && (
          <PlayersStep
            format={selectedFormat}
            course={course}
            players={players}
            setPlayers={setPlayers}
            handicapAllowance={handicapAllowance}
            selectedTeeId={selectedTeeId}
            setSelectedTeeId={setSelectedTeeId}
            onNext={() => setStep('settings')}
            onBack={() => setStep('course')}
          />
        )}

        {step === 'settings' && selectedFormat && (
          <SettingsStep
            format={selectedFormat}
            holesPlaying={holesPlaying}
            setHolesPlaying={setHolesPlaying}
            handicapAllowance={handicapAllowance}
            setHandicapAllowance={setHandicapAllowance}
            strokeMethod={strokeMethod}
            setStrokeMethod={setStrokeMethod}
            handicapBasis={handicapBasis}
            setHandicapBasis={setHandicapBasis}
            formatSettings={formatSettings}
            setFormatSettings={setFormatSettings}
            onStart={startGame}
            onBack={() => setStep('players')}
          />
        )}
      </main>
    </div>
  );
}

function StepIndicator({ current, format, course }: { current: Step; format: GameFormat | null; course: CourseSelection | null }) {
  const steps = [
    { key: 'format', label: format?.name || 'Format' },
    { key: 'course', label: course?.courseName || 'Course' },
    { key: 'players', label: 'Players' },
    { key: 'settings', label: 'Settings' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-2 mb-6 text-sm">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded ${i <= currentIdx ? 'bg-green-700 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-gray-300">→</span>}
        </div>
      ))}
    </div>
  );
}

function FormatStep({ onSelect }: { onSelect: (f: GameFormat) => void }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Choose Format</h2>
      <div className="grid gap-3">
        {FORMATS.map((format) => (
          <button
            key={format.id}
            onClick={() => onSelect(format)}
            className="text-left p-4 bg-white rounded-lg shadow hover:shadow-md hover:border-green-500 border border-gray-200 transition"
          >
            <p className="font-medium text-gray-900">{format.name}</p>
            <p className="text-sm text-gray-500 mt-1">{format.description}</p>
            <p className="text-xs text-gray-400 mt-1">
              {format.playersMin === format.playersMax
                ? `${format.playersMin} players`
                : `${format.playersMin}-${format.playersMax} players`}
              {' · '}{format.teamMode === 'teams' ? 'Teams' : 'Individual'}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function CourseStep({ onSelect, onBack }: { onSelect: (c: CourseSelection) => void; onBack: () => void }) {
  const [searchName, setSearchName] = useState('');
  const [searchState, setSearchState] = useState('VA');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      const teeSets: TeeSetOption[] = (courseData.TeeSets || []).map((ts: any) => ({
        id: ts.TeeSetRatingId,
        name: ts.TeeSetRatingName,
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

      onSelect({
        courseId: courseResult.CourseID,
        courseName: courseResult.CourseName || courseData.CourseName,
        city: courseResult.City || courseData.CourseCity || '',
        state: courseResult.State || courseData.CourseState || '',
        teeSets,
        selectedTeeId: null,
      });
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
        <div className="bg-white rounded-lg shadow overflow-hidden">
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
    </div>
  );
}

function PlayersStep({
  format,
  course,
  players,
  setPlayers,
  handicapAllowance,
  selectedTeeId: selectedTee,
  setSelectedTeeId: setSelectedTee,
  onNext,
  onBack,
}: {
  format: GameFormat;
  course: CourseSelection | null;
  players: Player[];
  setPlayers: (p: Player[]) => void;
  handicapAllowance: number;
  selectedTeeId: number | null;
  setSelectedTeeId: (id: number | null) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [handicap, setHandicap] = useState('');
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
      const newPlayer: Player = {
        id: crypto.randomUUID(),
        name: `${golfer.first_name} ${golfer.last_name}`,
        handicapIndex: hi,
        ghinNumber: Number(ghinInput),
        teeSetId: selectedTee || undefined,
      };

      if (format.teamMode === 'teams') {
        const teamACount = players.filter((p) => p.team === 'A').length;
        const teamBCount = players.filter((p) => p.team === 'B').length;
        newPlayer.team = teamACount <= teamBCount ? 'A' : 'B';
      }

      setPlayers([...players, newPlayer]);
      setGhinInput('');
    } finally {
      setLoading(false);
    }
  }

  function addManual() {
    if (!name) return;
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      name,
      handicapIndex: handicap ? parseFloat(handicap) : null,
      teeSetId: selectedTee || undefined,
    };

    if (format.teamMode === 'teams') {
      const teamACount = players.filter((p) => p.team === 'A').length;
      const teamBCount = players.filter((p) => p.team === 'B').length;
      newPlayer.team = teamACount <= teamBCount ? 'A' : 'B';
    }

    setPlayers([...players, newPlayer]);
    setName('');
    setHandicap('');
  }

  function removePlayer(id: string) {
    setPlayers(players.filter((p) => p.id !== id));
  }

  function toggleTeam(id: string) {
    setPlayers(players.map((p) =>
      p.id === id ? { ...p, team: p.team === 'A' ? 'B' : 'A' } : p
    ));
  }

  function getPlayerCourseHcap(player: Player): number | null {
    if (!player.handicapIndex || !course || !selectedTee) return null;
    const tee = course.teeSets.find((t) => t.id === selectedTee);
    if (!tee) return null;
    const totalRating = tee.ratings.find((r) => r.type === 'Total');
    if (!totalRating) return null;
    const raw = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, tee.totalPar);
    return Math.round(raw * (handicapAllowance / 100));
  }

  const canProceed = players.length >= format.playersMin;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Add Players ({players.length}/{format.playersMax})
      </h2>

      {course && course.teeSets.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tees</label>
          <select
            value={selectedTee || ''}
            onChange={(e) => setSelectedTee(Number(e.target.value))}
            className="rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            {course.teeSets.map((ts) => (
              <option key={ts.id} value={ts.id}>
                {ts.name} ({ts.totalYardage} yds)
              </option>
            ))}
          </select>
        </div>
      )}

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
            disabled={loading || !ghinInput || players.length >= format.playersMax}
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <input
              type="text"
              inputMode="decimal"
              value={handicap}
              onChange={(e) => setHandicap(e.target.value)}
              placeholder="HCP"
              className="w-16 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <button
              onClick={addManual}
              disabled={!name || players.length >= format.playersMax}
              className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {players.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
          <ul className="divide-y divide-gray-200">
            {players.map((player) => (
              <li key={player.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {player.name}
                    {format.teamMode === 'teams' && (
                      <button
                        onClick={() => toggleTeam(player.id)}
                        className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200"
                      >
                        Team {player.team}
                      </button>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">
                    Index: {player.handicapIndex ?? 'N/A'}
                    {getPlayerCourseHcap(player) !== null && (
                      <span className="ml-2 text-green-700">
                        Course HCP: {getPlayerCourseHcap(player)}
                      </span>
                    )}
                  </p>
                </div>
                <button onClick={() => removePlayer(player.id)} className="text-red-500 hover:text-red-700 text-sm">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Settings
      </button>
    </div>
  );
}

function SettingsStep({
  format,
  holesPlaying,
  setHolesPlaying,
  handicapAllowance,
  setHandicapAllowance,
  strokeMethod,
  setStrokeMethod,
  handicapBasis,
  setHandicapBasis,
  formatSettings,
  setFormatSettings,
  onStart,
  onBack,
}: {
  format: GameFormat;
  holesPlaying: '18' | 'front9' | 'back9';
  setHolesPlaying: (h: '18' | 'front9' | 'back9') => void;
  handicapAllowance: number;
  setHandicapAllowance: (n: number) => void;
  strokeMethod: StrokeMethod;
  setStrokeMethod: (m: StrokeMethod) => void;
  handicapBasis: HandicapBasis;
  setHandicapBasis: (b: HandicapBasis) => void;
  formatSettings: Record<string, string | number | boolean>;
  setFormatSettings: (s: Record<string, string | number | boolean>) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  function updateSetting(key: string, value: string | number | boolean) {
    setFormatSettings({ ...formatSettings, [key]: value });
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Game Settings</h2>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Holes</label>
          <select
            value={holesPlaying}
            onChange={(e) => setHolesPlaying(e.target.value as '18' | 'front9' | 'back9')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            <option value="18">18 Holes</option>
            <option value="front9">Front 9</option>
            <option value="back9">Back 9</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Handicap Allowance: {handicapAllowance}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={handicapAllowance}
            onChange={(e) => setHandicapAllowance(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-400 mb-0">
            <span>Scratch</span>
            <span>Full handicap</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Handicap Basis</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setHandicapBasis('course')}
              className={`p-3 rounded-lg border text-left transition ${
                handicapBasis === 'course'
                  ? 'border-green-600 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-sm font-medium text-gray-900">Course Handicap <span className="text-xs text-green-600">(Recommended)</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Adjusted for tee difficulty. Fairer when playing different tees.</p>
            </button>
            <button
              onClick={() => setHandicapBasis('index')}
              className={`p-3 rounded-lg border text-left transition ${
                handicapBasis === 'index'
                  ? 'border-green-600 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-sm font-medium text-gray-900">Player Index</p>
              <p className="text-xs text-gray-500 mt-0.5">Raw index difference. Simpler but ignores course difficulty.</p>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Stroke Method</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setStrokeMethod('off-the-low')}
              className={`p-3 rounded-lg border text-left transition ${
                strokeMethod === 'off-the-low'
                  ? 'border-green-600 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-sm font-medium text-gray-900">Off the Low</p>
              <p className="text-xs text-gray-500 mt-0.5">Low player gets 0. Others get the difference.</p>
            </button>
            <button
              onClick={() => setStrokeMethod('full')}
              className={`p-3 rounded-lg border text-left transition ${
                strokeMethod === 'full'
                  ? 'border-green-600 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-sm font-medium text-gray-900">Full Handicap</p>
              <p className="text-xs text-gray-500 mt-0.5">Everyone gets their full course handicap in strokes.</p>
            </button>
          </div>
        </div>

        {format.settings?.map((setting) => (
          <SettingControl
            key={setting.key}
            setting={setting}
            value={formatSettings[setting.key] ?? setting.defaultValue}
            onChange={(v) => updateSetting(setting.key, v)}
          />
        ))}
      </div>

      <button
        onClick={onStart}
        className="mt-6 w-full rounded-md bg-green-700 px-4 py-3 text-white font-bold text-lg hover:bg-green-800"
      >
        Start Game
      </button>
    </div>
  );
}

function SettingControl({
  setting,
  value,
  onChange,
}: {
  setting: FormatSetting;
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  if (setting.type === 'toggle') {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{setting.label}</span>
        <button
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${value ? 'bg-green-600' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${value ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
    );
  }

  if (setting.type === 'number') {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{setting.label}</label>
        <input
          type="number"
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>
    );
  }

  if (setting.type === 'select' && setting.options) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{setting.label}</label>
        <select
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          {setting.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return null;
}
