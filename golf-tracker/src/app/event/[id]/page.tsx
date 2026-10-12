'use client';

// An EVENT's standings (a Series, DECISIONS.md §5.cu, §5.cv): every round's money per player,
// rounds grouped under their date, TOTAL over finished rounds, and one who-pays-whom for the
// whole event. A live round is PROJECTED: shown, never in TOTAL or the settle-up.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { hydratePoolGames, getSeriesRounds, getPoolGameList, type PoolGame } from '@/lib/pool-game';
import { seriesRoundInputs } from '@/lib/stats-ledger';
import { seriesStandings, shortDate, type SeriesStandings } from '@/lib/series';
import { money } from '@/lib/money-format';
import { getAccessLevel } from '@/lib/invite-gate';
import { gameListSubtitle } from '@/lib/game-modes/result';
import { startNextRound } from '@/components/event-banner';

const tone = (n: number) => (n > 0.5 ? 'text-green-700' : n < -0.5 ? 'text-red-700' : 'text-gray-500');

export default function EventPage() {
  const router = useRouter();
  const id = useParams().id as string;
  const [rounds, setRounds] = useState<PoolGame[] | null>(null);
  const [standings, setStandings] = useState<SeriesStandings | null>(null);
  const [organizer, setOrganizer] = useState(false);
  useEffect(() => { setOrganizer(getAccessLevel() !== 'pool'); }, []);

  useEffect(() => {
    let cancelled = false;
    hydratePoolGames()
      .then(async () => {
        const rs = getSeriesRounds(id);
        if (cancelled) return;
        setRounds(rs);
        const inputs = await seriesRoundInputs(rs);
        if (!cancelled) setStandings(seriesStandings(inputs));
      })
      .catch(() => { if (!cancelled) setRounds([]); });
    return () => { cancelled = true; };
  }, [id]);

  if (rounds === null) return null;
  if (rounds.length === 0) {
    return (
      <div className="min-h-full bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-bold text-gray-900">Event not found</h1>
          <p className="mt-2 text-sm text-gray-600">It may have been removed, or the link is incomplete.</p>
          <button onClick={() => router.push('/home')} className="mt-4 text-sm font-medium text-green-700 hover:underline">Go to Home</button>
        </div>
      </div>
    );
  }

  const latest = rounds[rounds.length - 1];
  const name = rounds.reduce((a, b) => (b.series!.seq > a.series!.seq ? b : a)).series!.name;
  const finished = rounds.filter((r) => r.status === 'completed').length;
  const listItems = new Map(getPoolGameList((g) => g.series?.id === id).map((g) => [g.id, g]));

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <button onClick={() => router.push('/home')} className="text-sm text-green-200 hover:text-white">← Home</button>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-green-200">Event</p>
          <h1 className="text-xl font-bold">{name}</h1>
          <p className="text-sm text-green-100">
            {rounds.length} {rounds.length === 1 ? 'round' : 'rounds'} · {finished} finished
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <section className="bg-white rounded-lg shadow overflow-hidden" aria-label="Standings">
          <h2 className="px-4 pt-4 text-lg font-semibold text-gray-900">Standings</h2>
          {!standings ? (
            <p className="px-4 py-6 text-sm text-gray-500">Adding up the rounds…</p>
          ) : standings.rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No money yet. It shows here once a round has scores.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-2 w-full text-sm tabular-nums" data-testid="event-standings">
                <thead>
                  {/* Total (and Projected) sit next to the name: on a phone the rounds scroll, the
                      number that matters doesn't. */}
                  <tr className="text-xs text-gray-500">
                    <th />
                    <th />
                    {standings.hasProjected && <th />}
                    {standings.dates.map((d) => (
                      <th key={d.date} colSpan={d.gameIds.length} className="px-2 pt-1 font-medium text-center whitespace-nowrap border-l border-gray-100">
                        {shortDate(d.date)}
                      </th>
                    ))}
                  </tr>
                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-1.5 text-left font-medium">Player</th>
                    <th className="px-3 py-1.5 text-right font-semibold text-gray-800">Total</th>
                    {standings.hasProjected && <th className="px-3 py-1.5 text-right font-medium text-amber-700">Projected</th>}
                    {standings.rounds.map((r) => (
                      <th key={r.gameId} className="px-2 py-1.5 text-right font-medium border-l border-gray-100" title={r.gameName}>
                        {r.label}
                        {r.state === 'projected' && <span className="block text-[10px] font-normal text-amber-700">live</span>}
                        {r.state === 'upcoming' && <span className="block text-[10px] font-normal text-gray-400">not started</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {standings.rows.map((row) => (
                    <tr key={row.playerId} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{row.playerName}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${tone(row.total)}`}>{money(row.total)}</td>
                      {standings.hasProjected && <td className="px-3 py-2 text-right text-amber-700">{money(row.projected)}</td>}
                      {standings.rounds.map((r) => {
                        const v = row.byRound[r.gameId];
                        return (
                          <td key={r.gameId} className={`px-2 py-2 text-right border-l border-gray-100 ${v === undefined ? 'text-gray-300' : r.state === 'final' ? tone(v) : 'text-amber-700'}`}>
                            {v === undefined ? '–' : money(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {standings.hasProjected && (
                <p className="px-4 py-2 text-xs text-gray-500">
                  Total counts finished rounds only. Projected adds the live round as if it ended now.
                </p>
              )}
            </div>
          )}
        </section>

        {standings && standings.rows.length > 0 && (
          <section className="bg-white rounded-lg shadow p-4" aria-label="Settle up">
            <h2 className="text-lg font-semibold text-gray-900">Settle up</h2>
            <p className="text-xs text-gray-500">The whole event in one go, on the finished rounds.</p>
            {standings.settle.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">{finished === 0 ? 'Nothing to settle until a round is finished.' : 'Everyone is square.'}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm" data-testid="event-settle">
                {standings.settle.map((t, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="text-gray-800">{t.fromName} pays {t.toName}</span>
                    <span className="font-semibold tabular-nums">${Math.round(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section aria-label="Rounds">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Rounds</h2>
          <div className="space-y-2">
            {rounds.map((r, i) => {
              const item = listItems.get(r.id);
              const state = r.status === 'completed' ? 'Final' : r.status === 'active' ? 'Live' : 'Not started';
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => router.push('/pool/' + r.id)}
                  className="w-full text-left rounded-lg border border-gray-300 bg-white px-3 py-2.5 min-h-[44px] hover:border-green-400"
                >
                  <span className="flex justify-between gap-2 text-sm font-medium text-gray-900">
                    <span>Round {i + 1} · {r.name}</span>
                    <span className={r.status === 'active' ? 'text-amber-700' : 'text-gray-500'}>{state}</span>
                  </span>
                  <span className="block text-xs text-gray-500">
                    {shortDate(r.series!.date)}{r.course ? ` · ${r.course.courseName}` : ''}{item ? ` · ${gameListSubtitle(item)}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
          {organizer && (
            <button
              type="button"
              onClick={() => startNextRound(router, latest.id, id)}
              className="mt-3 w-full rounded-md border border-green-700 bg-white px-4 py-2.5 text-sm font-semibold text-green-800 hover:bg-green-50"
            >
              + Add round {rounds.length + 1}
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
