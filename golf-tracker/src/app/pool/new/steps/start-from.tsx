'use client';

import { useEffect, useState } from 'react';
import { getCreatorGhin } from '@/lib/pool-identity';
import { hydratePoolGames, getPoolGameListForGhin, type PoolGameListItem } from '@/lib/pool-game';
import { gameListSubtitle } from '@/lib/game-modes/result';

const RECENT_GAMES = 4;

// B1 (§5.cm): every former game is a format to start from. Picking a recent game pre-fills its
// format, field, course, tees and teams (Run it back). Saved formats are NOT repeated here: the
// field step's "Your groups" row already offers them. Adding players below is starting fresh.
export function StartFromCard({ onGame }: { onGame: (id: string) => void }) {
  const [games, setGames] = useState<PoolGameListItem[]>([]);

  useEffect(() => {
    const me = getCreatorGhin();
    if (me != null) {
      hydratePoolGames()
        .then(() => setGames(getPoolGameListForGhin(me)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, RECENT_GAMES)))
        .catch(() => {});
    }
  }, []);

  if (games.length === 0) return null;

  const row = 'w-full text-left rounded-lg border border-gray-300 bg-white px-3 py-2.5 min-h-[44px] hover:border-green-400';
  return (
    <section className="bg-white rounded-lg shadow p-4 mb-4" aria-label="Start from">
      <h2 className="text-sm font-semibold text-gray-900">Start from a recent game</h2>
      <p className="text-xs text-gray-500 mb-3">Same game again, or change the players and course on the way. Or add players below to start fresh.</p>
      <div className="space-y-2">
        {games.map((g) => (
          <button key={g.id} type="button" className={row} onClick={() => onGame(g.id)}>
            <span className="block text-sm font-medium text-gray-900">{g.name}</span>
            <span className="block text-xs text-gray-500">
              {new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {gameListSubtitle(g)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
