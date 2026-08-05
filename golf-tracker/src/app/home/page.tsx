'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTournamentList, hydrateTournaments, type TournamentListItem } from '@/lib/tournament-state';
import {
  getPoolGameList,
  getPoolGameListForGhin,
  hydratePoolGames,
  type PoolGameListItem,
} from '@/lib/pool-game';
import { hydrateGroups, type RosterGroup } from '@/lib/roster-groups';
import { getPlayerGroups } from '@/lib/pool-formats';
import { getAccessLevel } from '@/lib/invite-gate';
import { getCreatorGhin, getCreatorName } from '@/lib/pool-identity';

// PHASE 1 Home hub — a user-centric landing that only READS existing data:
// your groups, your active/recent games (pool + tournament merged), and a
// "start something" chooser that opens the existing wizards. Nothing here
// writes to Supabase. Reachable only by a `full` user (a `pool` share-link
// visitor is redirected off non-/pool routes by InviteGate). Flag-gated via
// HOME_V2; see .claude/plans/adaptive-squishing-locket.md.

// One row in the merged "Your golf" list. Pool games and tournaments have very
// different shapes, so we normalize each to a common card here.
interface HomeGame {
  key: string;
  kind: 'pool' | 'tournament';
  name: string;
  status: 'setup' | 'active' | 'completed';
  subtitle: string;
  // For recency sort. Pool games carry createdAt; tournaments have no timestamp
  // (dashboard lists them globally, unsorted) — they sort after dated items.
  createdAt: string | null;
  href: string;
}

const statusPill: Record<HomeGame['status'], string> = {
  active: 'bg-green-100 text-green-800',
  setup: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-gray-100 text-gray-600',
};

function poolToHomeGame(g: PoolGameListItem): HomeGame {
  return {
    key: `pool:${g.id}`,
    kind: 'pool',
    name: g.name,
    status: g.status,
    subtitle: `${new Date(g.createdAt).toLocaleDateString()} · ${g.teamCount} foursome${g.teamCount !== 1 ? 's' : ''} · ${g.playerCount} player${g.playerCount !== 1 ? 's' : ''}`,
    createdAt: g.createdAt,
    href: `/pool/${g.id}`,
  };
}

function tournamentToHomeGame(t: TournamentListItem): HomeGame {
  return {
    key: `tournament:${t.id}`,
    kind: 'tournament',
    name: t.name,
    status: t.status,
    subtitle: `${t.teamAName} ${t.teamAPoints} — ${t.teamBPoints} ${t.teamBName}`,
    createdAt: null,
    href: `/tournament/${t.id}`,
  };
}

// Active/setup games first (what's live now), then by recency (newest first).
// Tournaments (no timestamp) fall to the bottom of their status band.
function sortHomeGames(a: HomeGame, b: HomeGame): number {
  const aDone = a.status === 'completed' ? 1 : 0;
  const bDone = b.status === 'completed' ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;
  return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
}

export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [games, setGames] = useState<HomeGame[]>([]);
  const [groups, setGroups] = useState<RosterGroup[]>([]);
  // "Your golf" is a collapsible list — groups are the primary focus, games are
  // one tap away. Defaults collapsed so the page opens on groups + start actions.
  const [gamesOpen, setGamesOpen] = useState(false);

  useEffect(() => {
    // A logged-in convenience: mirror the dashboard's gate — no GHIN token means
    // not logged in, so send them to the login page.
    const token = sessionStorage.getItem('ghin_token');
    if (!token) {
      router.push('/');
      return;
    }

    const isOwner = getAccessLevel() === 'full';
    const ghin = getCreatorGhin();
    setName(getCreatorName());

    // Read-only hydration. Games and groups scope to the viewer exactly like the
    // pool pages: owner (full access) sees all pool games; a scoped organizer
    // sees only their own. Tournaments have no owner field, so they list
    // globally — matching today's dashboard behavior (Phase 1 caveat).
    Promise.all([
      hydratePoolGames(),
      hydrateTournaments(),
      hydrateGroups({ viewerGhin: ghin, isOwner }).catch(() => []),
    ]).then(() => {
      const poolItems = isOwner
        ? getPoolGameList()
        : ghin !== null
          ? getPoolGameListForGhin(ghin)
          : [];
      const merged = [
        ...poolItems.map(poolToHomeGame),
        ...getTournamentList().map(tournamentToHomeGame),
      ].sort(sortHomeGames);
      setGames(merged);
      setGroups(getPlayerGroups());
      setReady(true);
    });
  }, [router]);

  function logout() {
    sessionStorage.clear();
    router.push('/');
  }

  if (!ready) {
    return (
      <div className="min-h-full bg-gray-50">
        <p className="text-center text-gray-400 py-16">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Golf Tracker</h1>
            {name && <p className="text-sm text-green-200">Welcome back, {name}</p>}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-green-200 hover:text-white"
            >
              Classic dashboard
            </button>
            <button onClick={logout} className="text-sm text-green-200 hover:text-white">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Start something</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => router.push('/pool/new')}
              className="flex-1 rounded-lg bg-green-700 px-6 py-5 text-white text-left hover:bg-green-800 shadow-md"
            >
              <p className="font-bold text-lg">Casual game</p>
              <p className="text-sm text-green-100 mt-0.5">A single round — money game, skins, 2v2, and more.</p>
            </button>
            <button
              onClick={() => router.push('/tournament/new')}
              className="flex-1 rounded-lg bg-green-900 px-6 py-5 text-white text-left hover:bg-green-950 shadow-md"
            >
              <p className="font-bold text-lg">Multi-round event</p>
              <p className="text-sm text-green-100 mt-0.5">A tournament across several rounds.</p>
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Your groups</h2>
            <button
              onClick={() => router.push('/pool/roster')}
              className="text-sm text-green-700 hover:text-green-900 font-medium"
            >
              Manage
            </button>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
              No saved groups yet. Save a group of players from the roster to prefill future games.
            </p>
          ) : (
            <div className="space-y-2">
              {groups.map((grp) => (
                <button
                  key={grp.id}
                  onClick={() => router.push(`/home/groups/${grp.id}`)}
                  className="w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition"
                >
                  <p className="font-medium text-gray-900">{grp.name}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {grp.playerIds.length} player{grp.playerIds.length !== 1 ? 's' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <button
            onClick={() => setGamesOpen((o) => !o)}
            className="w-full flex items-center justify-between mb-3"
          >
            <h2 className="text-lg font-semibold text-gray-900">
              Your golf{games.length > 0 && <span className="text-gray-400 font-normal"> ({games.length})</span>}
            </h2>
            <span className="text-sm text-gray-500">{gamesOpen ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {gamesOpen && (
            games.length === 0 ? (
              <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
                No games yet. Tap <span className="font-medium">Start something</span> above to begin.
              </p>
            ) : (
              <div className="space-y-2">
                {games.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => router.push(g.href)}
                    className={`w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition ${g.status === 'completed' ? 'opacity-75' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${g.kind === 'pool' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {g.kind === 'pool' ? 'Game' : 'Event'}
                        </span>
                        <p className="font-medium text-gray-900 truncate">{g.name}</p>
                      </div>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${statusPill[g.status]}`}>
                        {g.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{g.subtitle}</p>
                  </button>
                ))}
              </div>
            )
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Stats &amp; money</h2>
          <button
            onClick={() => router.push('/home/stats')}
            className="w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition"
          >
            <p className="font-medium text-gray-900">Money ledger &amp; standings →</p>
            <p className="text-sm text-gray-500 mt-1">
              Who owes whom across your games — overall, by group, by game, or by player.
            </p>
          </button>
        </section>
      </main>
    </div>
  );
}
