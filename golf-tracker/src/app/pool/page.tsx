'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hydratePoolGames, getPoolGameList, getPoolGameListForGhin, type PoolGameListItem } from '@/lib/pool-game';
import { getAccessLevel } from '@/lib/invite-gate';
import { saveGhinIdentity, getCreatorGhin, getCreatorName } from '@/lib/pool-identity';
import { PoolShareButton } from '@/components/pool-share';

// "My Pool Games" — the organizer share-link landing page. Lists the games the
// logged-in GHIN created (their history), newest first. Owner (full access)
// sees all pool games.

export default function PoolGamesListPage() {
  const router = useRouter();
  const [games, setGames] = useState<PoolGameListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  // A share-link organizer with no resolved identity gets a login prompt (not a
  // false-empty list) so their history reliably appears once they log in.
  const [needsLogin, setNeedsLogin] = useState(false);
  const [creatorName, setCreatorName] = useState<string | null>(null);

  // Resolve identity (session or durable local) and filter the cached games.
  // Called on mount and again after an inline login.
  function refreshList() {
    const owner = getAccessLevel() === 'full';
    setIsOwner(owner);
    // Owner (full access) sees all pool games. A share-link organizer sees ONLY
    // games created under their GHIN — and if we can't resolve their identity
    // yet, we prompt login rather than showing everyone's games or a false empty.
    if (owner) {
      setGames(getPoolGameList());
      setNeedsLogin(false);
      return;
    }
    const ghin = getCreatorGhin();
    if (ghin === null) {
      setGames([]);
      setNeedsLogin(true);
      setCreatorName(null);
      return;
    }
    setGames(getPoolGameListForGhin(ghin));
    setCreatorName(getCreatorName());
    setNeedsLogin(false);
  }

  useEffect(() => {
    hydratePoolGames().then(() => {
      refreshList();
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        ) : needsLogin ? (
          <LoginPrompt onLoggedIn={refreshList} />
        ) : games.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4 text-center">
            No pool games yet. Tap <span className="font-medium">+ New Pool Game</span> to create your first one.
          </p>
        ) : (
          <div className="space-y-2">
            {!isOwner && creatorName && (
              <p className="text-xs text-gray-500 mb-1 px-1">
                Showing games created by <span className="font-medium text-gray-700">{creatorName}</span>.
              </p>
            )}
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

// Clearly-labeled login card shown to a share-link organizer we can't yet
// identify — so "no games" is never mistaken for "nothing saved." Logging in
// resolves their identity (persisted durably) and reveals their saved games.
function LoginPrompt({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/ghin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) { setErr(data.error || 'Login failed'); return; }
      sessionStorage.setItem('ghin_token', data.token);
      if (data.golfer) saveGhinIdentity(data.golfer);
      setUser('');
      setPass('');
      onLoggedIn();
    } catch {
      setErr('Connection error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h2 className="text-base font-bold text-gray-900 mb-1">See your saved games</h2>
      <p className="text-sm text-gray-500 mb-4">
        Log in with your GHIN account to see the pool games you&apos;ve created.
      </p>
      <form onSubmit={submit} className="space-y-2">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">GHIN email</label>
          <input
            type="text" value={user} onChange={(e) => setUser(e.target.value)}
            placeholder="GHIN email" autoComplete="username"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Password</label>
          <input
            type="password" value={pass} onChange={(e) => setPass(e.target.value)}
            placeholder="Password" autoComplete="current-password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          type="submit" disabled={busy || !user || !pass}
          className="w-full rounded-md bg-green-700 px-4 py-2.5 text-white text-sm font-medium hover:bg-green-800 disabled:opacity-50"
        >
          {busy ? 'Logging in…' : 'Log In'}
        </button>
      </form>
    </div>
  );
}
