'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { GameSetup, Player, CourseSelection, TeeSetOption } from '@/lib/game-state';
import { parseGhinIndex } from '@/lib/game-state';
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
  distinctRankingsForPlayers,
  balanceTeamsByHandicap,
} from '@/lib/pool-game';
import { loadGameScores, fetchGameScores, saveGameScores } from '@/lib/tournament-state';
import { ORGANIZER_TOKEN, getAccessLevel } from '@/lib/invite-gate';
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
  const [sharing, setSharing] = useState(false);
  // Share-link (pool) visitors don't have the dashboard; give them "New Game" instead.
  const [poolOnly, setPoolOnly] = useState(false);
  useEffect(() => { setPoolOnly(getAccessLevel() === 'pool'); }, []);

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

  // Re-pull this game's players' handicap indexes from GHIN (for the "set up
  // yesterday, handicaps changed overnight" case). Updates indexes in place,
  // stamps the refresh time, and returns how many changed. Also writes fresh
  // indexes back to the roster so future games start current.
  async function refreshGameHandicaps(): Promise<number> {
    const token = getToken();
    if (!token || !game) return 0;
    const now = new Date().toISOString();
    let changed = 0;
    const players = await Promise.all(game.players.map(async (p) => {
      if (p.ghinNumber == null) return p;
      try {
        const res = await fetch('/api/ghin/golfer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, ghin_number: p.ghinNumber }),
        });
        if (!res.ok) return p;
        const { golfer } = await res.json();
        const hi = parseGhinIndex(golfer?.handicap_index ?? golfer?.hi_value);
        if (hi === null) return p;
        if (hi !== p.handicapIndex) changed++;
        upsertRosterPlayer({
          id: p.id, ghinNumber: p.ghinNumber, name: p.name,
          handicapIndex: hi, gender: p.gender ?? null, defaultTeeName: null, hcapUpdatedAt: now,
        });
        return { ...p, handicapIndex: hi };
      } catch { return p; }
    }));
    persist({ ...game, players, handicapsRefreshedAt: now });
    return changed;
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
              onClick={() => setSharing(true)}
              className="text-sm font-medium text-green-200 hover:text-white"
            >
              Share
            </button>
            <button
              onClick={() => setEditing((e) => !e)}
              className={`text-sm font-medium ${editing ? 'text-white' : 'text-green-200 hover:text-white'}`}
            >
              {editing ? 'Done editing' : 'Edit'}
            </button>
            <button onClick={() => router.push(poolOnly ? '/pool' : '/dashboard')} className="text-sm text-green-200 hover:text-white">
              {poolOnly ? 'My Games' : 'Dashboard'}
            </button>
          </div>
        </div>
      </header>

      {sharing && <SharePanel onClose={() => setSharing(false)} />}

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Leaderboard + Scorecards CTAs */}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => router.push(`/pool/${id}/leaderboard`)}
            className="text-sm bg-green-700 hover:bg-green-600 text-white px-5 py-2.5 rounded-lg font-medium transition"
          >
            Leaderboard
          </button>
          <button
            onClick={() => router.push(`/pool/${id}/scorecards`)}
            className="text-sm bg-white border border-green-700 text-green-700 hover:bg-green-50 px-5 py-2.5 rounded-lg font-medium transition"
          >
            Scorecards
          </button>
        </div>

        {/* Handicap refresh — re-pull from GHIN (e.g. teams set up the night
            before, indexes changed overnight) and offer to re-balance. */}
        <HandicapRefresh game={game} onRefresh={refreshGameHandicaps} onRebalance={() => setEditing(true)} />

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

function timeAgo(iso?: string): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

function HandicapRefresh({ game, onRefresh, onRebalance }: {
  game: PoolGame;
  onRefresh: () => Promise<number>;
  onRebalance: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  const refreshedAt = game.handicapsRefreshedAt;
  const staleMs = 24 * 60 * 60 * 1000;
  const isStale = !refreshedAt || (Date.now() - new Date(refreshedAt).getTime()) > staleMs;

  async function doRefresh() {
    setBusy(true);
    setResult(null);
    try {
      const changed = await onRefresh();
      setResult(changed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-lg border px-4 py-2.5 ${isStale ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-600">
          {isStale
            ? <span className="text-amber-800 font-medium">Handicaps last refreshed {timeAgo(refreshedAt)} — may have changed.</span>
            : <span>Handicaps refreshed {timeAgo(refreshedAt)}.</span>}
        </p>
        <button
          onClick={doRefresh}
          disabled={busy}
          className="text-xs font-medium text-green-700 hover:text-green-900 disabled:opacity-50"
        >
          {busy ? 'Refreshing…' : '↻ Refresh from GHIN'}
        </button>
      </div>
      {result !== null && (
        <div className="mt-1.5 text-xs">
          {result > 0 ? (
            <span className="text-gray-700">
              {result} handicap{result === 1 ? '' : 's'} changed.{' '}
              <button onClick={onRebalance} className="text-green-700 font-medium hover:text-green-900 underline">Re-balance teams</button>
            </span>
          ) : (
            <span className="text-gray-500">Handicaps already up to date.</span>
          )}
        </div>
      )}
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

function SharePanel({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // Organizer link: opens pool setup with 'pool' access (create/manage pool
  // games) — it does NOT expose the dashboard or the rest of the app.
  const organizerLink = `${origin}/pool/new?key=${ORGANIZER_TOKEN}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(organizerLink)}`;

  async function share() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: 'Create a pool game', url: organizerLink }); return; } catch { /* fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(organizerLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — user can long-press the field */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Share pool games</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
        </div>

        <p className="text-sm font-semibold text-gray-800">Organizer link</p>
        <p className="text-xs text-gray-500 mb-2">
          Send this to whoever runs the game. They can create and manage pool games, build teams, and make scorecards — logging into their own GHIN. It does not open the rest of your app.
        </p>
        <div className="flex gap-2">
          <input readOnly value={organizerLink} className="flex-1 min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-600" onFocus={(e) => e.currentTarget.select()} />
          <button onClick={share} className="flex-shrink-0 rounded-md bg-green-700 px-3 py-1.5 text-sm text-white font-medium hover:bg-green-800">
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
        <div className="mt-3 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt="QR code — create a pool game" width={180} height={180} className="rounded-lg border border-gray-200" />
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-1">Or scan to open on a phone</p>
      </div>
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
  const nines: { label: string; holes: number[] }[] = [
    { label: 'OUT', holes: Array.from({ length: 9 }, (_, i) => i + 1) },
    { label: 'IN', holes: Array.from({ length: 9 }, (_, i) => i + 10) },
  ];

  function strokesFor(playerHoles: PoolTeamDetail['players'][number]['holes'], holeNumber: number): number {
    return playerHoles.find((h) => h.holeNumber === holeNumber)?.strokes ?? 0;
  }

  function teeName(playerId: string): string | null {
    const p = game.players.find((x) => x.id === playerId);
    if (!p) return null;
    return game.course?.teeSets.find((t) => t.id === p.teeSetId)?.name ?? null;
  }

  // Distinct hole rankings among this foursome's tees (gender-labeled when clean).
  const rankings = distinctRankingsForPlayers(game, detail.players.map((p) => p.playerId));

  return (
    <div className="mt-1 rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-4">
      {detail.players.map((pl) => {
        const totalStrokes = pl.holes.reduce((s, h) => s + h.strokes, 0);
        const tn = teeName(pl.playerId);
        return (
          <div key={pl.playerId}>
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-sm font-semibold text-gray-800">
                {pl.playerName.split(' ')[0]}
                {tn && <span className="ml-1.5 text-[10px] font-normal text-gray-400">{tn}</span>}
              </p>
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">{Math.round(pl.playingHcap)}</span> hcp
                <span className="mx-1 text-gray-300">·</span>
                <span className="font-medium text-green-700">{totalStrokes}</span> strokes
              </p>
            </div>
            <div className="flex gap-3">
              {nines.map((nine) => (
                <div key={nine.label} className="flex-1">
                  <div className="flex gap-px">
                    {nine.holes.map((holeNumber) => {
                      const strokes = strokesFor(pl.holes, holeNumber);
                      return (
                        <div
                          key={holeNumber}
                          className={`flex-1 rounded-sm text-center py-1 ${
                            strokes >= 2 ? 'bg-green-600 text-white' : strokes === 1 ? 'bg-green-100 text-green-800' : 'bg-white text-gray-300'
                          }`}
                          title={`Hole ${holeNumber}`}
                        >
                          <div className="text-[8px] leading-none opacity-60">{holeNumber}</div>
                          <div className="text-[11px] leading-tight font-semibold h-3">{strokes > 0 ? strokes : ''}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Distinct hole rankings in play (SI = stroke index; lower = harder). */}
      {rankings.length > 0 && (
        <div className="pt-2 border-t border-gray-200 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Hole rankings (SI)</p>
          {rankings.map((r) => (
            <div key={r.label} className="text-[10px] text-gray-500">
              <span className="font-semibold text-gray-600">{r.label}:</span>{' '}
              <span className="tabular-nums">
                {Array.from({ length: 18 }, (_, i) => r.strokeIndexByHole[i + 1] ?? '–').join(' ')}
              </span>
            </div>
          ))}
        </div>
      )}
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

  // Fetch each foursome's scores into cache on entering edit mode, so the
  // re-balance "scores exist?" check (via loadGameScores) is accurate.
  useEffect(() => {
    game.teams.forEach((t) => { fetchGameScores(t.matchupId); });
  }, [game.teams]);

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

  // Reassign the field into `newGroups` (arrays of player IDs), reusing the
  // EXISTING team slots so each foursome keeps its matchupId. If any foursome
  // already has scores, warn — and on confirm, clear all scores for the round
  // (the old cards no longer match the reshuffled players).
  function applyReshuffle(newGroups: string[][]) {
    const teamsWithScores = game.teams.filter((t) => {
      const s = loadGameScores(t.matchupId);
      return Array.isArray(s) && s.length > 0;
    });
    if (teamsWithScores.length > 0) {
      const ok = confirm(
        `${teamsWithScores.length} foursome${teamsWithScores.length === 1 ? '' : 's'} already ` +
        `${teamsWithScores.length === 1 ? 'has' : 'have'} scores entered. Re-balancing reshuffles ` +
        `players, so those scores will be cleared for the round. Continue?`
      );
      if (!ok) return;
      for (const t of game.teams) saveGameScores(t.matchupId, []);
    }
    // Keep existing team slots (id, name, matchupId, teeTime); just swap playerIds.
    const numTeams = Math.max(game.teams.length, newGroups.length);
    const teams = Array.from({ length: numTeams }, (_, i) => {
      const existing = game.teams[i];
      const playerIds = newGroups[i] ?? [];
      if (existing) return { ...existing, playerIds };
      return { id: crypto.randomUUID(), name: `Team ${i + 1}`, playerIds, matchupId: crypto.randomUUID() };
    });
    onSave({ ...game, teams });
  }

  function autoBalance() {
    const numTeams = Math.max(1, Math.ceil(game.players.length / 4));
    const groups = balanceTeamsByHandicap(
      game.players,
      numTeams,
      (p) => getPoolPlayingHandicap(p, course, game.handicapAllowance)
    );
    applyReshuffle(groups);
  }

  function autoGenerate() {
    const groups: string[][] = [];
    for (let i = 0; i < game.players.length; i += 4) {
      groups.push(game.players.slice(i, i + 4).map((p) => p.id));
    }
    applyReshuffle(groups);
  }

  return (
    <div className="space-y-3">
      {game.teams.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={autoBalance}
            className="rounded-md border border-green-700 px-3 py-2 text-sm text-green-700 font-medium hover:bg-green-50"
          >
            Auto-balance by course HCP
          </button>
          <button
            onClick={autoGenerate}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 font-medium hover:bg-gray-100"
          >
            Auto-generate foursomes
          </button>
        </div>
      )}
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
      const hi = parseGhinIndex(golfer.handicap_index ?? golfer.hi_value);
      const ghinGender = (golfer.gender || golfer.Gender || '').toLowerCase();
      const gender: 'M' | 'F' = ghinGender === 'female' || ghinGender === 'f' ? 'F' : 'M';
      const ghinNumber = Number(ghinInput);
      if (existingGhins.has(ghinNumber)) { setGhinError('Player already in the game'); return; }
      const remembered = getRosterPlayerByGhin(ghinNumber)?.defaultTeeName ?? null;
      const newPlayer: Player = {
        id: crypto.randomUUID(),
        name: `${golfer.first_name} ${golfer.last_name}`,
        handicapIndex: hi,
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
