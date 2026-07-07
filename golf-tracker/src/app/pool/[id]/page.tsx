'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { GameSetup, Player, CourseSelection, TeeSetOption } from '@/lib/game-state';
import type { PoolGame, PoolTeam, PoolTeamDetail } from '@/lib/pool-game';
import {
  loadPoolGame,
  fetchPoolGame,
  savePoolGame,
  subscribeToPoolGame,
  getPoolPlayingHandicap,
  computePoolPlayerDetails,
  getFieldLow,
  getPar3Holes,
} from '@/lib/pool-game';
import {
  type RosterPlayer,
  hydrateRoster,
  searchRoster,
  getRosterPlayerByGhin,
  upsertRosterPlayer,
} from '@/lib/roster';

function getToken() {
  return sessionStorage.getItem('ghin_token');
}

// Pick a tee for a player, STRICTLY within their gender — mirrors the wizard
// (src/app/pool/new/page.tsx). A course's men's and women's tees can share a
// name/yardage yet carry different ratings and hole stroke-index, so we only
// ever choose from tees whose own gender matches the player.
function pickTeeForPlayer(
  course: CourseSelection | null,
  gender: 'M' | 'F' | undefined,
  rememberedTeeName: string | null | undefined
): number | undefined {
  if (!course || course.teeSets.length === 0) return undefined;
  const tees = course.teeSets;
  const g: 'M' | 'F' = gender === 'F' ? 'F' : 'M';

  let pool = tees.filter((t) => t.gender === g);
  if (pool.length === 0) {
    pool = tees.filter((t) => (g === 'F' ? /\(w\)/i.test(t.name) : !/\(w\)/i.test(t.name)));
  }
  if (pool.length === 0) pool = tees;

  const norm = (n: string) => n.replace(/\s*\(w\)\s*$/i, '').trim().toLowerCase();

  if (rememberedTeeName) {
    const want = norm(rememberedTeeName);
    const hit = pool.find((t) => norm(t.name) === want);
    if (hit) return hit.id;
  }

  const wantDefault = g === 'F' ? '1 star' : '3 stars';
  const def = pool.find((t) => norm(t.name) === wantDefault);
  if (def) return def.id;

  return pool[0]?.id ?? course.selectedTeeId ?? tees[0]?.id ?? undefined;
}

export default function PoolHubPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [game, setGame] = useState<PoolGame | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const cached = loadPoolGame(id);
    if (cached) setGame(cached);
    fetchPoolGame(id).then((g) => {
      if (g) setGame(g);
      else if (!cached) router.push('/dashboard');
    });
    const channel = subscribeToPoolGame(id, (g) => setGame(g));
    return () => { channel.unsubscribe(); };
  }, [id, router]);

  // Stroke allocation per team/player/hole — no scores needed, so pass an empty
  // map. Memoized on the game object (recomputes only when the game changes).
  const teamDetails = useMemo<PoolTeamDetail[]>(
    () => (game ? computePoolPlayerDetails(game, new Map()) : []),
    [game]
  );

  if (!game) return null;

  function playersForTeam(team: PoolTeam): Player[] {
    return team.playerIds
      .map((pid) => game!.players.find((p) => p.id === pid))
      .filter((p): p is Player => !!p);
  }

  function detailForTeam(teamId: string): PoolTeamDetail | undefined {
    return teamDetails.find((d) => d.teamId === teamId);
  }

  function persist(updated: PoolGame) {
    savePoolGame(updated);
    setGame(updated);
  }

  function enterScores(team: PoolTeam) {
    const players = playersForTeam(team);
    const strokeMethod = game!.strokeMethod || 'full';

    // For off-the-low, compute the field-low playing handicap across the WHOLE
    // field and pass it as a fixed baseline, so this foursome's scorecard nets
    // match the pool leaderboard (which also subtracts the field low).
    let offTheLowBaseline: number | undefined;
    if (strokeMethod === 'off-the-low' && game!.players.length > 0) {
      offTheLowBaseline = Math.min(
        ...game!.players.map((p) => getPoolPlayingHandicap(p, game!.course, game!.handicapAllowance))
      );
    }

    const setup: GameSetup = {
      formatId: 'stroke-play',
      teamMode: 'two-best-balls',
      course: game!.course,
      players,
      handicapAllowance: game!.handicapAllowance,
      holesPlaying: '18',
      strokeMethod,
      handicapBasis: 'course',
      formatSettings: { ballSelection: game!.ballSelection },
      matchupId: team.matchupId,
      offTheLowBaseline,
    };

    sessionStorage.setItem('game_setup', JSON.stringify(setup));
    sessionStorage.setItem('game_pool_context', JSON.stringify({ poolGameId: game!.id, matchupId: team.matchupId }));
    sessionStorage.removeItem('game_tournament_context');
    router.push('/game/play');
  }

  const pot = game.players.length * game.entryPerPlayer;

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{game.name}</h1>
            <p className="text-xs text-green-200">Pool Money Game · {game.teams.length} foursomes</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setEditing((e) => !e)}
              className={`text-sm font-medium ${editing ? 'text-white' : 'text-green-200 hover:text-white'}`}
            >
              {editing ? 'Done editing' : 'Edit'}
            </button>
            <button onClick={() => router.push('/dashboard')} className="text-sm text-green-200 hover:text-white">
              Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Leaderboard CTA */}
        <div className="flex justify-center">
          <button
            onClick={() => router.push(`/pool/${id}/leaderboard`)}
            className="text-sm bg-green-700 hover:bg-green-600 text-white px-5 py-2.5 rounded-lg font-medium transition"
          >
            Leaderboard
          </button>
        </div>

        {/* Field-low banner — explains how the low man sets everyone's strokes */}
        <FieldLowBanner game={game} />

        {/* Money summary */}
        <MoneySummary game={game} pot={pot} />

        {/* Foursome cards */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Foursomes</h2>
          {editing ? (
            <EditFoursomes game={game} onSave={persist} />
          ) : (
            <div className="space-y-3">
              {game.teams.map((team) => (
                <FoursomeCard
                  key={team.id}
                  team={team}
                  players={playersForTeam(team)}
                  game={game}
                  detail={detailForTeam(team.id)}
                  onEnterScores={() => enterScores(team)}
                />
              ))}
              {game.teams.length === 0 && (
                <p className="text-center text-gray-500 py-8">No foursomes configured yet.</p>
              )}
            </div>
          )}
        </section>

        {/* CTP editor / finalize surface */}
        <CtpEditor game={game} onSave={persist} />
      </main>
    </div>
  );
}

function FieldLowBanner({ game }: { game: PoolGame }) {
  const low = getFieldLow(game);
  if (!low) return null;

  if (low.applies) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-sm text-green-900">
          <span className="font-semibold">Off the low:</span> {low.playerName.split(' ')[0]} plays to scratch
          (Course HCP {low.courseHandicap}) — everyone else plays the difference.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-2.5">
      <p className="text-xs text-gray-500">
        Full handicap — low man: <span className="font-medium text-gray-700">{low.playerName.split(' ')[0]}</span> (CHcp {low.courseHandicap})
      </p>
    </div>
  );
}

function MoneySummary({ game, pot }: { game: PoolGame; pot: number }) {
  const rows: { label: string; amount: number }[] = [
    { label: 'Front 9', amount: pot * game.potSplit.front },
    { label: 'Back 9', amount: pot * game.potSplit.back },
    { label: 'Overall 18', amount: pot * game.potSplit.overall },
    { label: 'Junk', amount: pot * game.potSplit.junk },
  ];

  return (
    <section>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 bg-gray-100 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Pot</h2>
          <span className="text-sm text-gray-600">
            {game.players.length} × ${game.entryPerPlayer} = <span className="font-bold text-gray-900">${Math.round(pot)}</span>
          </span>
        </div>
        <div className="grid grid-cols-4 divide-x divide-gray-100">
          {rows.map((r) => (
            <div key={r.label} className="px-2 py-3 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">{r.label}</p>
              <p className="text-lg font-bold text-green-700">${Math.round(r.amount)}</p>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 text-xs text-gray-400 border-t">
          Winner-take-all per pot · lowest team total wins · {game.handicapAllowance}% handicap
        </div>
      </div>
    </section>
  );
}

function FoursomeCard({
  team,
  players,
  game,
  detail,
  onEnterScores,
}: {
  team: PoolTeam;
  players: Player[];
  game: PoolGame;
  detail: PoolTeamDetail | undefined;
  onEnterScores: () => void;
}) {
  const [showStrokes, setShowStrokes] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-gray-900">{team.name}</p>
        {team.teeTime && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{team.teeTime}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
        {players.map((p) => (
          <span key={p.id} className="text-sm text-gray-700">
            {p.name.split(' ')[0]}
            <span className="text-xs text-gray-400 ml-0.5">
              ({Math.round(getPoolPlayingHandicap(p, game.course, game.handicapAllowance))})
            </span>
          </span>
        ))}
      </div>
      <button
        onClick={onEnterScores}
        className="w-full bg-green-700 hover:bg-green-600 text-white font-medium py-2.5 rounded-lg text-sm"
      >
        Enter Scores
      </button>

      {detail && detail.players.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowStrokes((s) => !s)}
            className="w-full flex items-center justify-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 py-1.5"
          >
            <span>{showStrokes ? 'Hide strokes' : 'Strokes'}</span>
            <span className="text-[10px]">{showStrokes ? '▲' : '▼'}</span>
          </button>
          {showStrokes && <StrokeAllocation detail={detail} game={game} />}
        </div>
      )}
    </div>
  );
}

// Hole-by-hole stroke allocation for a foursome. Uses the field-low-adjusted
// playing handicap and each player's OWN-tee stroke index (both already baked
// into computePoolPlayerDetails), so no scores are required.
function StrokeAllocation({ detail, game }: { detail: PoolTeamDetail; game: PoolGame }) {
  const front = Array.from({ length: 9 }, (_, i) => i + 1);
  const back = Array.from({ length: 9 }, (_, i) => i + 10);

  function dots(strokes: number): string {
    if (strokes >= 2) return '●●';
    if (strokes === 1) return '●';
    return '·';
  }

  function strokesFor(playerHoles: PoolTeamDetail['players'][number]['holes'], holeNumber: number): number {
    return playerHoles.find((h) => h.holeNumber === holeNumber)?.strokes ?? 0;
  }

  // Each player's own tee (men's and women's tees rank holes differently, so the
  // per-hole "SI" shown is that player's tee's ranking — explains their strokes).
  function teeFor(playerId: string) {
    const p = game.players.find((x) => x.id === playerId);
    if (!p) return null;
    return game.course?.teeSets.find((t) => t.id === p.teeSetId)
      ?? game.course?.teeSets.find((t) => t.id === game.course?.selectedTeeId)
      ?? null;
  }

  return (
    <div className="mt-1 rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-3">
      {detail.players.map((pl) => {
        const totalStrokes = pl.holes.reduce((s, h) => s + h.strokes, 0);
        const tee = teeFor(pl.playerId);
        const siOf = (holeNumber: number) => tee?.holes.find((h) => h.number === holeNumber)?.handicap ?? null;
        return (
          <div key={pl.playerId}>
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-sm font-medium text-gray-800">
                {pl.playerName.split(' ')[0]}
                {tee && <span className="ml-1 text-[10px] font-normal text-gray-400">{tee.name}</span>}
              </p>
              <p className="text-xs text-gray-500">
                HCP {Math.round(pl.playingHcap)} · {totalStrokes} stroke{totalStrokes === 1 ? '' : 's'}
              </p>
            </div>
            {[front, back].map((holes, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-9 gap-px mb-0.5">
                {holes.map((holeNumber) => {
                  const strokes = strokesFor(pl.holes, holeNumber);
                  return (
                    <div key={holeNumber} className="text-center">
                      <div className="text-[9px] leading-none text-gray-400">{holeNumber}</div>
                      <div className={`text-xs leading-tight ${strokes > 0 ? 'text-green-700 font-bold' : 'text-gray-300'}`}>
                        {dots(strokes)}
                      </div>
                      <div className="text-[8px] leading-none text-gray-300">{siOf(holeNumber) ?? ''}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit mode — rename teams, edit tee times, move/remove/retee players, and
// add players by roster search or GHIN #. Scores stay attached because every
// team keeps its matchupId and we never touch ctpWinners.
// ---------------------------------------------------------------------------

function EditFoursomes({ game, onSave }: { game: PoolGame; onSave: (g: PoolGame) => void }) {
  const course = game.course;
  const playerById = new Map(game.players.map((p) => [p.id, p]));

  function renameTeam(teamId: string, newName: string) {
    onSave({
      ...game,
      teams: game.teams.map((t) => (t.id === teamId ? { ...t, name: newName } : t)),
    });
  }

  function setTeeTime(teamId: string, teeTime: string) {
    onSave({
      ...game,
      teams: game.teams.map((t) => (t.id === teamId ? { ...t, teeTime } : t)),
    });
  }

  // Move a player between foursomes — preserves each team's matchupId.
  function movePlayer(playerId: string, fromTeamId: string, toTeamId: string) {
    if (fromTeamId === toTeamId) return;
    onSave({
      ...game,
      teams: game.teams.map((t) => {
        if (t.id === fromTeamId) return { ...t, playerIds: t.playerIds.filter((id) => id !== playerId) };
        if (t.id === toTeamId) return { ...t, playerIds: [...t.playerIds, playerId] };
        return t;
      }),
    });
  }

  // Change a player's tee (updates game.players) and remember it on the roster.
  function changePlayerTee(playerId: string, teeSetId: number) {
    onSave({
      ...game,
      players: game.players.map((p) => (p.id === playerId ? { ...p, teeSetId } : p)),
    });
    const player = playerById.get(playerId);
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

  // Remove a player from their team AND from game.players. Any score rows they
  // had become orphaned (keyed by matchupId), which is acceptable.
  function removePlayer(playerId: string) {
    onSave({
      ...game,
      players: game.players.filter((p) => p.id !== playerId),
      teams: game.teams.map((t) => ({ ...t, playerIds: t.playerIds.filter((id) => id !== playerId) })),
    });
  }

  // Add a new player to game.players and onto a chosen foursome.
  function addPlayer(player: Player, toTeamId: string) {
    const players = game.players.some((p) => p.id === player.id)
      ? game.players.map((p) => (p.id === player.id ? player : p))
      : [...game.players, player];
    const teams = game.teams.map((t) =>
      t.id === toTeamId
        ? { ...t, playerIds: t.playerIds.includes(player.id) ? t.playerIds : [...t.playerIds, player.id] }
        : t
    );
    onSave({ ...game, players, teams });
  }

  return (
    <div className="space-y-3">
      {game.teams.map((team) => (
        <div key={team.id} className="bg-white rounded-lg shadow p-4">
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Team name</label>
            <input
              type="text"
              value={team.name}
              onChange={(e) => renameTeam(team.id, e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-semibold shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Tee time</label>
            <input
              type="text"
              value={team.teeTime || ''}
              onChange={(e) => setTeeTime(team.id, e.target.value)}
              placeholder="HH:MM"
              className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <ul className="space-y-1.5">
            {team.playerIds.map((pid) => {
              const p = playerById.get(pid);
              if (!p) return null;
              const chcp = course ? Math.round(getPoolPlayingHandicap(p, course, game.handicapAllowance)) : null;
              const g: 'M' | 'F' = p.gender === 'F' ? 'F' : 'M';
              const genderTees = (course?.teeSets || []).filter((t) => (t.gender ?? 'M') === g);
              const teeOptions: TeeSetOption[] = genderTees.length > 0 ? genderTees : (course?.teeSets || []);
              return (
                <li key={pid} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1.5">
                  <span className="text-sm text-gray-900 truncate min-w-0 flex-1">
                    {p.name}
                    {chcp !== null && <span className="ml-1 text-xs text-gray-500">({chcp})</span>}
                  </span>
                  {course && course.teeSets.length > 1 && (
                    <select
                      value={p.teeSetId ?? ''}
                      onChange={(e) => changePlayerTee(pid, Number(e.target.value))}
                      className="text-xs rounded border border-gray-300 px-1 py-0.5 shadow-sm focus:border-green-500 focus:outline-none max-w-[92px]"
                      title="Tee"
                    >
                      {teeOptions.map((ts) => (
                        <option key={ts.id} value={ts.id}>{ts.name}</option>
                      ))}
                    </select>
                  )}
                  <select
                    value={team.id}
                    onChange={(e) => movePlayer(pid, team.id, e.target.value)}
                    className="text-xs rounded border border-gray-300 px-1 py-0.5 shadow-sm focus:border-green-500 focus:outline-none max-w-[92px]"
                    title="Move to team"
                  >
                    {game.teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removePlayer(pid)}
                    className="text-red-500 hover:text-red-700 text-sm px-1 flex-shrink-0"
                    title="Remove player"
                  >
                    &times;
                  </button>
                </li>
              );
            })}
            {team.playerIds.length === 0 && (
              <li className="text-xs text-gray-400 px-2 py-1">Empty — add or move players here.</li>
            )}
          </ul>
        </div>
      ))}

      {game.teams.length === 0 && (
        <p className="text-center text-gray-500 py-6 bg-white rounded-lg shadow">No foursomes to edit.</p>
      )}

      {game.teams.length > 0 && <AddPlayerPanel game={game} onAdd={addPlayer} />}
    </div>
  );
}

function AddPlayerPanel({
  game,
  onAdd,
}: {
  game: PoolGame;
  onAdd: (player: Player, toTeamId: string) => void;
}) {
  const course = game.course;
  const [targetTeamId, setTargetTeamId] = useState<string>(game.teams[game.teams.length - 1]?.id ?? '');

  const [rosterQuery, setRosterQuery] = useState('');
  const [rosterResults, setRosterResults] = useState<RosterPlayer[]>([]);

  const [ghinInput, setGhinInput] = useState('');
  const [ghinLoading, setGhinLoading] = useState(false);
  const [ghinError, setGhinError] = useState('');

  useEffect(() => {
    hydrateRoster().then(() => setRosterResults(searchRoster('')));
  }, []);

  // Keep the target team valid if teams change under us.
  useEffect(() => {
    if (!game.teams.some((t) => t.id === targetTeamId)) {
      setTargetTeamId(game.teams[game.teams.length - 1]?.id ?? '');
    }
  }, [game.teams, targetTeamId]);

  function refreshRoster(query: string) {
    setRosterQuery(query);
    setRosterResults(searchRoster(query));
  }

  const existingGhins = new Set(game.players.map((p) => p.ghinNumber).filter((g): g is number => g != null));
  const existingIds = new Set(game.players.map((p) => p.id));

  function addRosterPlayer(rp: RosterPlayer) {
    if (!targetTeamId) return;
    if (rp.ghinNumber != null && existingGhins.has(rp.ghinNumber)) return;
    if (existingIds.has(rp.id)) return;
    const newPlayer: Player = {
      id: rp.id,
      name: rp.name,
      handicapIndex: rp.handicapIndex,
      gender: rp.gender ?? undefined,
      ghinNumber: rp.ghinNumber ?? undefined,
      teeSetId: pickTeeForPlayer(course, rp.gender ?? undefined, rp.defaultTeeName),
    };
    onAdd(newPlayer, targetTeamId);
  }

  async function addByGhin() {
    const token = getToken();
    if (!token || !ghinInput || !targetTeamId) return;
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
      if (existingGhins.has(ghinNumber)) { setGhinError('Player already in the game'); return; }
      const remembered = getRosterPlayerByGhin(ghinNumber)?.defaultTeeName ?? null;
      const newPlayer: Player = {
        id: crypto.randomUUID(),
        name: `${golfer.first_name} ${golfer.last_name}`,
        handicapIndex: isNaN(hi) ? null : hi,
        gender,
        ghinNumber,
        teeSetId: pickTeeForPlayer(course, gender, remembered),
      };
      onAdd(newPlayer, targetTeamId);
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

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-sm font-semibold text-gray-800 mb-2">Add a player</p>

      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">Add to foursome</label>
        <select
          value={targetTeamId}
          onChange={(e) => setTargetTeamId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          {game.teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Roster name search */}
      <input
        type="text"
        value={rosterQuery}
        onChange={(e) => refreshRoster(e.target.value)}
        placeholder="Search saved players…"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
      />
      {rosterResults.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No saved players{rosterQuery ? ' match' : ' yet'}. Add by GHIN # below.</p>
      ) : (
        <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-100">
          {rosterResults.map((rp) => {
            const inGame = existingIds.has(rp.id) || (rp.ghinNumber != null && existingGhins.has(rp.ghinNumber));
            return (
              <li key={rp.id}>
                <button
                  onClick={() => addRosterPlayer(rp)}
                  disabled={inGame}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm ${inGame ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                >
                  <span className="flex-1 font-medium text-gray-900">{rp.name}</span>
                  <span className="text-xs text-gray-500">
                    {rp.handicapIndex ?? '—'}{rp.gender ? ` · ${rp.gender}` : ''}
                  </span>
                  {!inGame && <span className="text-xs text-green-700 font-medium">+ Add</span>}
                  {inGame && <span className="text-xs text-gray-400">In game</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add by GHIN # */}
      <div className="mt-3 pt-3 border-t">
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
            disabled={ghinLoading || !ghinInput || !targetTeamId}
            className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
          >
            {ghinLoading ? '...' : 'Add'}
          </button>
        </div>
        {ghinError && <p className="text-xs text-red-600 mt-1">{ghinError}</p>}
      </div>
    </div>
  );
}

function CtpEditor({ game, onSave }: { game: PoolGame; onSave: (g: PoolGame) => void }) {
  const par3Holes = getPar3Holes(game.course);
  if (par3Holes.length === 0) return null;

  function setWinner(hole: number, playerId: string | null) {
    const updated: PoolGame = {
      ...game,
      ctpWinners: { ...game.ctpWinners, [hole]: playerId },
    };
    onSave(updated);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Closest to the Pin</h2>
      <p className="text-xs text-gray-400 mb-3">Set the CTP winner on each par 3. Contributes to the junk pot.</p>
      <div className="space-y-3">
        {par3Holes.map((hole) => {
          const currentId = game.ctpWinners?.[hole] ?? null;
          const currentPlayer = currentId ? game.players.find((p) => p.id === currentId) : null;
          return (
            <div key={hole} className="bg-white rounded-lg shadow p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-gray-900">Hole {hole}</p>
                <span className="text-xs text-gray-500">
                  {currentPlayer ? currentPlayer.name.split(' ')[0] : 'No winner'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setWinner(hole, null)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${
                    currentId === null
                      ? 'bg-gray-700 text-white border-gray-700'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  None
                </button>
                {game.players.map((p) => {
                  const isSelected = currentId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setWinner(hole, p.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border ${
                        isSelected
                          ? 'bg-green-700 text-white border-green-700'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {p.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
