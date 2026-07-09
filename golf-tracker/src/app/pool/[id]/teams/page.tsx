'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { PoolGame } from '@/lib/pool-game';
import { loadPoolGame, fetchPoolGame, getPoolPlayingHandicap, sortPlayerIdsByHcap } from '@/lib/pool-game';

// A clean teams sheet the organizer can screenshot or print and send out —
// replacing the spreadsheet he used to make by hand. Foursomes in their set
// send-out order, each with its tee time and players listed low→high with their
// course handicap and tee. Deliberately plain (no heavy color) so it looks good
// as a phone screenshot and prints cheaply.

export default function PoolTeamsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [game, setGame] = useState<PoolGame | null>(null);

  useEffect(() => {
    const cached = loadPoolGame(id);
    if (cached) setGame(cached);
    fetchPoolGame(id).then((g) => {
      if (g) setGame(g);
      else if (!cached) router.push('/dashboard');
    });
  }, [id, router]);

  if (!game) return null;

  const course = game.course;
  const dateStr = new Date(game.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const teeNameOf = (playerId: string) =>
    course?.teeSets.find((t) => t.id === game.players.find((p) => p.id === playerId)?.teeSetId)?.name?.replace(/\s*\(w\)\s*$/i, '').trim() ?? null;

  return (
    <div className="min-h-full bg-gray-100">
      <style>{`@media print { @page { size: portrait; margin: 0.4in; } body { background: white; } }`}</style>

      {/* Toolbar (hidden on print/screenshot) */}
      <div className="print:hidden bg-green-800 text-white">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{game.name} — Teams</h1>
            <p className="text-xs text-green-200">Screenshot or print to send out</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} className="rounded-md bg-white text-green-800 px-4 py-1.5 text-sm font-semibold hover:bg-green-50">Print</button>
            <button onClick={() => router.push(`/pool/${id}`)} className="text-sm text-green-200 hover:text-white">Back</button>
          </div>
        </div>
      </div>

      <div className="mx-auto p-3 print:p-0">
        {/* Sheet header */}
        <div className="mb-3 border-b-2 border-gray-800 pb-2">
          <h2 className="text-lg font-bold text-gray-900">{game.name}</h2>
          <p className="text-xs text-gray-600">
            {course?.courseName ?? ''}{course?.courseName ? ' · ' : ''}{dateStr}
          </p>
        </div>

        {game.teams.length === 0 ? (
          <p className="text-center text-gray-500 py-10">No foursomes set yet.</p>
        ) : (
          // All foursomes side by side so one screenshot captures every team.
          // 2-up on a phone (a 4-foursome pool becomes a tidy 2×2), more columns
          // as the screen widens.
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 items-start">
            {game.teams.map((team) => {
              const orderedIds = sortPlayerIdsByHcap(team.playerIds, game.players, course, game.handicapAllowance);
              return (
                <div key={team.id} className="rounded-lg border border-gray-300 bg-white overflow-hidden" style={{ breakInside: 'avoid' }}>
                  <div className="px-2 py-1 bg-gray-100 border-b border-gray-300">
                    <p className="font-bold text-gray-900 text-sm leading-tight truncate">{team.name}</p>
                    {team.teeTime && <p className="text-xs font-semibold text-gray-600 leading-tight">{team.teeTime}</p>}
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {orderedIds.map((pid) => {
                      const p = game.players.find((x) => x.id === pid);
                      if (!p) return null;
                      const chcp = course ? Math.round(getPoolPlayingHandicap(p, course, game.handicapAllowance)) : null;
                      const tn = teeNameOf(pid);
                      return (
                        <li key={pid} className="flex items-baseline gap-1 px-2 py-1">
                          <span className="flex-1 text-xs text-gray-900 truncate">{p.name}</span>
                          {tn && <span className="text-[9px] text-gray-400 flex-shrink-0">{tn}</span>}
                          {chcp !== null && (
                            <span className="flex-shrink-0 text-xs font-semibold text-gray-700 tabular-nums" title="Course handicap">
                              {chcp}
                            </span>
                          )}
                        </li>
                      );
                    })}
                    {orderedIds.length === 0 && <li className="px-2 py-1 text-[10px] text-gray-400">No players.</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-3 text-[10px] text-gray-400">
          {game.players.length} players · {game.teams.length} foursome{game.teams.length === 1 ? '' : 's'} · number after each name = course handicap
        </p>
      </div>
    </div>
  );
}
