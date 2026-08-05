'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { hydratePoolGames, loadPoolGame, getPoolGameList, getPoolGameListForGhin, type PoolGameListItem } from '@/lib/pool-game';
import { hydrateTournaments, loadTournament, getTournamentList } from '@/lib/tournament-state';
import { hydrateGroups, getGroups, type RosterGroup } from '@/lib/roster-groups';
import { getAccessLevel } from '@/lib/invite-gate';
import { getCreatorGhin } from '@/lib/pool-identity';
import {
  buildGameLedgers,
  ledgersForGroup,
  rollupByPlayer,
  settleUp,
  type GameLedger,
} from '@/lib/stats-ledger';

// Stats & money (Phase 2, read-only). Four lenses over finished games: overall,
// by group, by game, by player. Money is only DISPLAYED (who-owes-whom); settle
// outside the app. Reachable from Home's "Stats & money" card and deep-linked
// from a group page via ?group=<id>. Nothing here writes.

type Lens = 'overall' | 'group' | 'game' | 'player';

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
const netClass = (n: number) => (n > 0.005 ? 'text-green-700' : n < -0.005 ? 'text-red-600' : 'text-gray-500');

export default function StatsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkGroup = searchParams.get('group');

  const [ready, setReady] = useState(false);
  const [ledgers, setLedgers] = useState<GameLedger[]>([]);
  const [groups, setGroups] = useState<RosterGroup[]>([]);
  const [lens, setLens] = useState<Lens>(deepLinkGroup ? 'group' : 'overall');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(deepLinkGroup ?? '');

  useEffect(() => {
    const token = sessionStorage.getItem('ghin_token');
    if (!token) { router.push('/'); return; }
    const isOwner = getAccessLevel() === 'full';
    const ghin = getCreatorGhin();

    Promise.all([
      hydratePoolGames(),
      hydrateTournaments(),
      hydrateGroups({ viewerGhin: ghin, isOwner }).catch(() => []),
    ]).then(async () => {
      // Viewer-scoped pool games (owner sees all), plus tournaments (global — no
      // owner field yet). Resolve list items back to full game objects for the
      // ledger reducers, which need players/teams/config.
      const poolItems: PoolGameListItem[] = isOwner
        ? getPoolGameList()
        : ghin !== null
          ? getPoolGameListForGhin(ghin)
          : [];
      const poolGames = poolItems.map((i) => loadPoolGame(i.id)).filter((g): g is NonNullable<typeof g> => !!g);
      const tournaments = getTournamentList()
        .map((i) => loadTournament(i.id))
        .filter((t): t is NonNullable<typeof t> => !!t);

      const built = await buildGameLedgers(poolGames, tournaments);
      setLedgers(built);
      setGroups(getGroups());
      setReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Which games the current lens selects.
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;
  const scoped: GameLedger[] =
    lens === 'group' && selectedGroup ? ledgersForGroup(ledgers, selectedGroup) : ledgers;

  const rollups = rollupByPlayer(scoped);
  const transfers = settleUp(rollups);
  const scoredCount = scoped.filter((l) => l.hasMoney).length;
  const unscoredCount = scoped.length - scoredCount;

  if (!ready) {
    return (
      <div className="min-h-full bg-gray-50">
        <p className="text-center text-gray-400 py-16">Crunching your games…</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <button onClick={() => router.push('/home')} className="text-xs text-green-200 hover:text-white">
              ← Home
            </button>
            <h1 className="text-xl font-bold">Stats &amp; money</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Lens toggle */}
        <div className="flex flex-wrap gap-2">
          {([
            ['overall', 'Overall'],
            ['group', 'By group'],
            ['game', 'By game'],
            ['player', 'By player'],
          ] as [Lens, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setLens(key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                lens === key ? 'bg-green-700 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {lens === 'group' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="">Select a group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}

        {ledgers.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
            No finished games yet. Money and stats appear here once games are completed and scored in the app.
          </p>
        ) : lens === 'group' && !selectedGroup ? (
          <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">Pick a group to see its ledger.</p>
        ) : (
          <>
            {/* Coverage note — the ledger only reflects games actually scored in the app. */}
            {unscoredCount > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {scoredCount} of {scoped.length} finished game{scoped.length !== 1 ? 's' : ''} {scoredCount === 1 ? 'has' : 'have'} money data.
                {' '}The other {unscoredCount} {unscoredCount === 1 ? "wasn't" : "weren't"} scored in the app, so {unscoredCount === 1 ? "it doesn't" : "they don't"} affect the totals.
              </p>
            )}

            {lens === 'game' ? (
              <GameBreakdown ledgers={scoped} />
            ) : (
              <>
                {/* Standings (per-player net) — used by overall / group / player lenses. */}
                <section>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {lens === 'group' && selectedGroup ? `${selectedGroup.name} — standings` : 'Standings'}
                  </h2>
                  {rollups.length === 0 ? (
                    <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">No money data in these games yet.</p>
                  ) : (
                    <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
                      {rollups.map((r) => (
                        <div key={r.playerId} className="flex items-center justify-between px-4 py-3">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{r.playerName}</p>
                            <p className="text-xs text-gray-500">{r.gamesPlayed} game{r.gamesPlayed !== 1 ? 's' : ''}</p>
                          </div>
                          <span className={`font-semibold ${netClass(r.net)}`}>{money(r.net)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Who-owes-whom settlement (hidden on the by-player lens, which is just totals). */}
                {lens !== 'player' && transfers.length > 0 && (
                  <section>
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Settle up</h2>
                    <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
                      {transfers.map((t, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                          <span className="text-gray-900">
                            <span className="font-medium">{t.fromName}</span> pays <span className="font-medium">{t.toName}</span>
                          </span>
                          <span className="font-semibold text-gray-900">{money(t.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Settle outside the app — this is just the tally.</p>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// By-game lens: each finished game with its per-player nets.
function GameBreakdown({ ledgers }: { ledgers: GameLedger[] }) {
  return (
    <div className="space-y-3">
      {ledgers.map((l) => (
        <div key={l.gameId} className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${l.gameKind === 'pool' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                {l.gameKind === 'pool' ? 'Game' : 'Event'}
              </span>
              <p className="font-medium text-gray-900 truncate">{l.gameName}</p>
            </div>
            {l.playedAt && <span className="text-xs text-gray-400 shrink-0">{new Date(l.playedAt).toLocaleDateString()}</span>}
          </div>
          {l.hasMoney ? (
            <div className="divide-y divide-gray-100">
              {[...l.playerNets].sort((a, b) => b.net - a.net).map((n) => (
                <div key={n.playerId} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-gray-900 truncate">{n.playerName}</span>
                  <span className={`font-medium ${netClass(n.net)}`}>{money(n.net)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-3 text-xs text-gray-400">Not scored in the app — no money data.</p>
          )}
        </div>
      ))}
    </div>
  );
}
