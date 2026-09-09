'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { hydratePoolGames, loadPoolGame, getPoolGameList, getPoolGameListForGhin, type PoolGameListItem } from '@/lib/pool-game';
import { hydrateTournaments, loadTournament, getTournamentList } from '@/lib/tournament-state';
import { hydrateGroups, type RosterGroup } from '@/lib/roster-groups';
import { getPlayerGroups } from '@/lib/pool-formats';
import { getAccessLevel } from '@/lib/invite-gate';
import { getCreatorGhin } from '@/lib/pool-identity';
import {
  buildGameLedgers,
  ledgersForGroup,
  myGameHistory,
  myMoney,
  rollupByPlayer,
  settleUp,
  type GameLedger,
  type GamePlayerNet,
  type MyMoney,
} from '@/lib/stats-ledger';
import { hydrateRoster, getRosterPlayerByGhin } from '@/lib/roster';

// Stats & money (read-only). Money is only DISPLAYED (who-owes-whom); settle outside
// the app. Reachable from Home's "Stats & money" card and deep-linked from a group page
// via ?group=<id>. Nothing here writes.
//
// THE PRIVACY RULE (DECISIONS.md §5h): money is PRIVATE TO THE GROUP that played for it.
//   - 'mine'  — the viewer's OWN money across every group, broken down by group. Their
//               money crosses groups because it's theirs.
//   - 'group' — field-wide money for ONE group, from that group's games only. This is
//               the only lens that shows other players' money.
//   - 'game'  — one game at a time.
//
// The old 'overall' lens is GONE: it showed every player's money across every game the
// viewer could load, so a Warriors organizer saw Tuesday Crew results for anyone in both.
// The old 'player' lens rendered identically to 'overall' with settle-up hidden.
//
// NOTE this is a DISPLAY boundary while RLS is open by decision (§5c) — not enforced, and
// it must become a real policy when security work lands.

type Lens = 'mine' | 'group' | 'game';

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
const netClass = (n: number) => (n > 0.005 ? 'text-green-700' : n < -0.005 ? 'text-red-600' : 'text-gray-500');

export default function StatsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkGroup = searchParams.get('group');

  const [ready, setReady] = useState(false);
  const [ledgers, setLedgers] = useState<GameLedger[]>([]);
  const [groups, setGroups] = useState<RosterGroup[]>([]);
  const [lens, setLens] = useState<Lens>(deepLinkGroup ? 'group' : 'mine');
  // Which roster player the logged-in user IS — drives the "mine" lens. Null when their
  // GHIN doesn't match a roster entry (e.g. an organizer who doesn't play in their own
  // games), which the UI handles rather than showing a blank.
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
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
      hydrateRoster({ viewerGhin: ghin, isOwner }).catch(() => []),
    ]).then(async () => {
      // Map the logged-in GHIN to a roster player. Game players carry the roster id
      // (see the wizard's loadGroup), so this is what links "me" to my results.
      const rp = ghin !== null ? getRosterPlayerByGhin(ghin) : null;
      if (rp) setMe({ id: rp.id, name: rp.name });
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
      // getPlayerGroups() excludes Format Library entries — formats live in the same
      // roster_groups table tagged kind:'format' and have no players by design, so a
      // format in this picker is a dead option that can only render an empty ledger.
      setGroups(getPlayerGroups());
      setReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Which games the current lens selects. 'group' narrows to that group's games — the
  // only place another player's money is shown. 'mine' and 'game' see everything the
  // viewer can load, but 'mine' filters down to the viewer's own rows.
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;
  const scoped: GameLedger[] =
    lens === 'group' && selectedGroup ? ledgersForGroup(ledgers, selectedGroup) : ledgers;
  const mine = me ? myMoney(ledgers, me.id, me.name, groups) : null;
  const myHistory = me ? myGameHistory(ledgers, me.id) : [];

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
            ['mine', 'My money'],
            ['group', 'By group'],
            ['game', 'By game'],
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

            {lens === 'mine' ? (
              <MyMoneyView mine={mine} history={myHistory} />
            ) : lens === 'game' ? (
              <GameBreakdown ledgers={scoped} />
            ) : (
              <>
                {/* Field-wide standings — ONLY inside a group, per the privacy rule. */}
                <section>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {selectedGroup ? `${selectedGroup.name} — standings` : 'Standings'}
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

                {/* Who-owes-whom, within this group. */}
                {transfers.length > 0 && (
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

// "My money" — the viewer's own total, where it came from, and their game history.
//
// This replaces the old "Overall" lens, which showed EVERY player's money across every
// game the viewer could load. Per DECISIONS.md §5h, another player's money is only
// visible inside a shared group, so a cross-group view can only ever be about yourself.
function MyMoneyView({ mine, history }: { mine: MyMoney | null; history: GamePlayerNet[] }) {
  // An organizer who doesn't play in their own games has no matching roster GHIN. Say so
  // plainly instead of rendering an empty screen that looks broken.
  if (!mine) {
    return (
      <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
        We couldn&apos;t match your GHIN number to a player in these games, so there&apos;s no
        personal total to show. Use <span className="font-medium">By group</span> to see a
        group&apos;s money, or add yourself to the roster to track your own.
      </p>
    );
  }

  if (mine.gamesPlayed === 0) {
    return (
      <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
        You haven&apos;t played in a finished game yet. Your running total appears here once
        a game you played in is closed out.
      </p>
    );
  }

  return (
    <>
      <section>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Your total</p>
          <p className={`text-3xl font-bold ${netClass(mine.net)}`}>{money(mine.net)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            across {mine.gamesPlayed} game{mine.gamesPlayed !== 1 ? 's' : ''}
          </p>
        </div>
      </section>

      {/* Where it came from — the point of the lens. A big loss in one group can hide
          inside a positive total, so the breakdown is ordered by biggest swing. */}
      {(mine.byGroup.length > 0 || mine.ungroupedGames > 0) && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Where it came from</h2>
          <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
            {mine.byGroup.map((g) => (
              <div key={g.groupId} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{g.groupName}</p>
                  <p className="text-xs text-gray-500">{g.gamesPlayed} game{g.gamesPlayed !== 1 ? 's' : ''}</p>
                </div>
                <span className={`font-semibold ${netClass(g.net)}`}>{money(g.net)}</span>
              </div>
            ))}
            {mine.ungroupedGames > 0 && (
              <div className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">Other games</p>
                  <p className="text-xs text-gray-500">
                    {mine.ungroupedGames} game{mine.ungroupedGames !== 1 ? 's' : ''} · not tied to a group
                  </p>
                </div>
                <span className={`font-semibold ${netClass(mine.ungroupedNet)}`}>{money(mine.ungroupedNet)}</span>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Your games</h2>
        <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
          {history.map((n) => (
            <div key={n.gameId} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{n.gameName}</p>
                {n.playedAt && (
                  <p className="text-xs text-gray-500">{new Date(n.playedAt).toLocaleDateString()}</p>
                )}
              </div>
              <span className={`font-medium ${netClass(n.net)}`}>{money(n.net)}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-gray-400">
        Only your own money crosses groups. To see everyone&apos;s, open a group under{' '}
        <span className="font-medium">By group</span>.
      </p>
    </>
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
