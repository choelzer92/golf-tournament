'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessLevel } from '@/lib/invite-gate';
import { getCreatorGhin, saveGhinIdentity } from '@/lib/pool-identity';
import { hydrateGroups } from '@/lib/roster-groups';
import type { RosterGroup, GroupDefaults } from '@/lib/roster-groups';
import { renameGroup, deleteGroup } from '@/lib/roster-groups';
import { getFormats, duplicateFormat, setFormatShared } from '@/lib/pool-formats';
import { getGameMode } from '@/lib/game-modes';

const FORMAT_SEED_KEY = 'pool_format_seed';

// Format Library — the organizer's saved game formats (mode + settings, no
// players). Start a new game from one, spin off a variant, rename, delete, or
// share. Scoped by GHIN exactly like games/groups: you see your own + shared
// (owner_ghin null) formats; owner sees all. Null identity → prompt login.
export default function FormatLibraryPage() {
  const router = useRouter();
  const [formats, setFormats] = useState<RosterGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [note, setNote] = useState('');

  function refresh() {
    const ghin = getCreatorGhin();
    const isOwner = getAccessLevel() === 'full';
    if (!isOwner && ghin === null) { setNeedsLogin(true); setFormats([]); return; }
    setNeedsLogin(false);
    setFormats(getFormats());
  }

  useEffect(() => {
    hydrateGroups({ viewerGhin: getCreatorGhin(), isOwner: getAccessLevel() === 'full' })
      .then(() => { refresh(); setLoading(false); })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(msg: string) { setNote(msg); window.setTimeout(() => setNote(''), 2500); }

  function startGame(f: RosterGroup) {
    // Seed the wizard with this format, then send the organizer to pick players.
    sessionStorage.setItem(FORMAT_SEED_KEY, JSON.stringify({ name: f.name, defaults: f.defaults }));
    router.push('/pool/new');
  }

  async function duplicate(f: RosterGroup) {
    const name = prompt('Name for the copy?', `${f.name} (copy)`);
    if (!name || !name.trim()) return;
    await duplicateFormat(f.id, name.trim());
    refresh();
    flash(`Created “${name.trim()}”.`);
  }

  async function rename(f: RosterGroup) {
    const name = prompt('Rename format:', f.name);
    if (!name || !name.trim() || name.trim() === f.name) return;
    await renameGroup(f.id, name.trim());
    refresh();
  }

  async function remove(f: RosterGroup) {
    if (!confirm(`Delete the format “${f.name}”? This does not affect games already created from it.`)) return;
    await deleteGroup(f.id);
    refresh();
    flash(`Deleted “${f.name}”.`);
  }

  async function toggleShare(f: RosterGroup) {
    const nowShared = f.ownerGhin === null;
    await setFormatShared(f.id, !nowShared);
    refresh();
    flash(nowShared ? `“${f.name}” is now private.` : `“${f.name}” shared with everyone.`);
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Game Formats</h1>
          <button onClick={() => router.push('/pool')} className="text-sm text-green-200 hover:text-white">My Games</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {note && <p className="mb-3 rounded-md bg-green-100 text-green-800 text-sm px-3 py-2">{note}</p>}

        <p className="text-sm text-gray-500 mb-4">
          Saved game formats you can reuse. Start a new game from one, or duplicate it to spin off a variant.
          Save a format from any game&apos;s page with <span className="font-medium">Save format</span>.
        </p>

        {loading ? (
          <p className="text-center text-gray-400 py-8">Loading…</p>
        ) : needsLogin ? (
          <LoginPrompt onLoggedIn={refresh} />
        ) : formats.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4 text-center">
            No saved formats yet. Open a game and tap <span className="font-medium">Save format</span> to add one.
          </p>
        ) : (
          <div className="space-y-2">
            {formats.map((f) => (
              <div key={f.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {f.name}
                      {f.ownerGhin === null && <span className="ml-2 text-[10px] font-bold text-green-700 uppercase tracking-wide">Shared</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{summarizeFormat(f.defaults)}</p>
                  </div>
                  <button
                    onClick={() => startGame(f)}
                    className="flex-shrink-0 rounded-md bg-green-700 px-3 py-1.5 text-sm text-white font-medium hover:bg-green-800"
                  >
                    Start a game
                  </button>
                </div>
                <div className="flex flex-wrap gap-3 mt-3 text-xs">
                  <button onClick={() => duplicate(f)} className="text-green-700 hover:text-green-900 font-medium">Duplicate</button>
                  <button onClick={() => rename(f)} className="text-gray-600 hover:text-gray-900 font-medium">Rename</button>
                  <button onClick={() => toggleShare(f)} className="text-gray-600 hover:text-gray-900 font-medium">
                    {f.ownerGhin === null ? 'Make private' : 'Share'}
                  </button>
                  <button onClick={() => remove(f)} className="text-red-600 hover:text-red-800 font-medium ml-auto">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// A short human summary of a format for the list row.
function summarizeFormat(d: GroupDefaults | null): string {
  if (!d) return 'Custom format';
  const mode = getGameMode(d.gameMode);
  if (mode) {
    const parts: string[] = [mode.name];
    // Surface a couple of the mode's chosen settings if present.
    const s = d.modeSettings ?? {};
    if (s.format) parts.push(String(s.format).replace('-', ' '));
    if (s.scoring) parts.push(String(s.scoring));
    if (s.result) parts.push(String(s.result));
    return parts.join(' · ');
  }
  // Classic pool.
  const label = d.moneyMode === 'match' ? 'Head-to-head match' : 'Pool (pot split)';
  const ball = d.ballSelection ? ` · ${String(d.ballSelection).replace(/-/g, ' ')}` : '';
  return `${label}${ball}`;
}

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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) { setErr(data.error || 'Login failed'); return; }
      sessionStorage.setItem('ghin_token', data.token);
      if (data.golfer) saveGhinIdentity(data.golfer);
      setUser(''); setPass('');
      onLoggedIn();
    } catch {
      setErr('Connection error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h2 className="text-base font-bold text-gray-900 mb-1">See your saved formats</h2>
      <p className="text-sm text-gray-500 mb-4">Log in with your GHIN account to see your game formats.</p>
      <form onSubmit={submit} className="space-y-2">
        <input type="text" value={user} onChange={(e) => setUser(e.target.value)} placeholder="GHIN email" autoComplete="username"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Password" autoComplete="current-password"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" disabled={busy || !user || !pass}
          className="w-full rounded-md bg-green-700 px-4 py-2.5 text-white text-sm font-medium hover:bg-green-800 disabled:opacity-50">
          {busy ? 'Logging in…' : 'Log In'}
        </button>
      </form>
    </div>
  );
}
