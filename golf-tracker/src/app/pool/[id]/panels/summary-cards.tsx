'use client';

import { useState } from 'react';
import { type Player } from '@/lib/game-state';
import { type PoolGame, type PoolTeam, type PoolTeamDetail, computePoolPlayerDetails, getFieldLow, distinctRankingsForPlayers, summarizeTeamBuild } from '@/lib/pool-game';
import { timeAgo } from './shared';

export function HandicapRefresh({ game, onRefresh, onRebalance, onNeedsLogin }: {
  game: PoolGame;
  onRefresh: () => Promise<{ ok: boolean; changed: number }>;
  onRebalance: () => void;
  onNeedsLogin: () => void;
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
      const res = await onRefresh();
      if (!res.ok) { onNeedsLogin(); return; }  // token expired -> prompt re-login
      setResult(res.changed);
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

export function FieldLowBanner({ game }: { game: PoolGame }) {
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

// Plain-language "How these teams were built" panel. Shows the build method, the
// balance mode that was in effect AT BUILD TIME, captains, pairing locks, and a
// hand-adjusted flag — so the organizer always sees what produced these
// foursomes and isn't surprised when a rebuild under a changed setting differs.
export function TeamBuildSummaryCard({ game }: { game: PoolGame }) {
  const s = summarizeTeamBuild(game);
  const list = (names: string[]) => names.join(' + ');

  return (
    <details className="group rounded-lg border border-gray-200 bg-white overflow-hidden">
      <summary className="flex items-center justify-between gap-2 cursor-pointer px-4 py-2.5 list-none">
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-wide text-gray-400 font-medium">How these teams were built</span>
          <span className="block text-sm font-semibold text-gray-800 truncate">
            {s.headline}
            {s.adjusted && <span className="ml-1.5 font-normal text-amber-700">· hand-adjusted after</span>}
          </span>
        </span>
        <span className="flex-shrink-0 text-gray-400 text-xs group-open:rotate-180 transition-transform">▼</span>
      </summary>

      <div className="border-t border-gray-100 px-4 py-3 space-y-2 text-sm text-gray-600">
        {s.detail && <p>{s.detail}</p>}

        {s.captains.length > 0 && (
          <p>
            <span className="font-medium text-gray-700">Captains:</span>{' '}
            {list(s.captains)}
          </p>
        )}

        {s.locks.length > 0 && (
          <p>
            <span className="font-medium text-gray-700">Kept together:</span>{' '}
            {s.locks.map((g) => list(g)).join(', ')}
          </p>
        )}

        {s.adjusted && (
          <p className="text-amber-700">
            One or more players were moved, swapped, or made captain by hand after the teams were built.
          </p>
        )}

        {!s.known && (
          <p className="text-xs text-gray-400">
            This game was created before we started recording the build method. Rebuild the teams in Edit mode to record it.
          </p>
        )}
      </div>
    </details>
  );
}

export function FoursomeCard({
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
        {players.map((p) => {
          // Show STROKES RECEIVED in this game (accounts for off-the-low),
          // matching the expanded stroke box — not the raw course handicap.
          const pd = detail?.players.find((x) => x.playerId === p.id);
          const strokes = pd ? pd.holes.reduce((s, h) => s + h.strokes, 0) : null;
          const isCaptain = team.captainId === p.id;
          return (
            <span key={p.id} className="text-sm text-gray-700">
              {isCaptain && (
                <span className="mr-1 rounded-full bg-green-700 text-white text-[9px] font-bold px-1 py-0.5 align-middle" title="Captain">C</span>
              )}
              {p.name.split(' ')[0]}
              {strokes !== null && (
                <span className="text-xs text-gray-400 ml-0.5" title="Strokes received in this game">
                  ({strokes} {strokes === 1 ? 'stroke' : 'strokes'})
                </span>
              )}
            </span>
          );
        })}
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
export function StrokeAllocation({ detail, game }: { detail: PoolTeamDetail; game: PoolGame }) {
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
