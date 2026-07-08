'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hydratePoolGames, getPoolGameList, getPoolGameListForGhin, type PoolGameListItem } from '@/lib/pool-game';
import { getAccessLevel } from '@/lib/invite-gate';
import { PoolShareButton } from '@/components/pool-share';

// "My Pool Games" — the organizer share-link landing page. Lists the games the
// logged-in GHIN created (their history), newest first. Owner (full access)
// sees all pool games.
function creatorGhin(): number | null {
  try {
    const raw = sessionStorage.getItem('ghin_golfer');
    if (!raw) return null;
    const g = JSON.parse(raw);
    const n = Number(g?.ghin ?? g?.ghin_number ?? g?.id);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export default function PoolGamesListPage() {
  const router = useRouter();
  const [games, setGames] = useState<PoolGameListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const owner = getAccessLevel() === 'full';
    setIsOwner(owner);
    hydratePoolGames().then(() => {
      const ghin = creatorGhin();
      // Owner sees all; a share-link organizer sees only games they created.
      setGames(owner || ghin === null ? getPoolGameList() : getPoolGameListForGhin(ghin));
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">My Pool Games</h1>
          <div className="flex items-center gap-4">
            <PoolShareButton className="text-sm text-green-200 hover:text-white font-medium" label="Share" />
            {isOwner && (
              <button onClick={() => router.push('/dashboard')} className="text-sm text-green-200 hover:text-white">
                Dashboard
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <button
          onClick={() => router.push('/pool/new')}
          className="w-full mb-6 rounded-lg bg-green-700 px-6 py-4 text-white font-bold text-lg hover:bg-green-800 shadow-md"
        >
          + New Pool Game
        </button>

        {loading ? (
          <p className="text-center text-gray-400 py-8">Loading…</p>
        ) : games.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4 text-center">
            No pool games yet. Tap <span className="font-medium">+ New Pool Game</span> to create your first one.
          </p>
        ) : (
          <div className="space-y-2">
            {games.map((g) => (
              <button
                key={g.id}
                onClick={() => router.push(`/pool/${g.id}`)}
                className={`w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition ${g.status === 'completed' ? 'opacity-75' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{g.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    g.status === 'active' ? 'bg-green-100 text-green-800' :
                    g.status === 'completed' ? 'bg-gray-100 text-gray-600' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {g.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {new Date(g.createdAt).toLocaleDateString()} · {g.teamCount} foursome{g.teamCount !== 1 ? 's' : ''} · {g.playerCount} player{g.playerCount !== 1 ? 's' : ''}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
