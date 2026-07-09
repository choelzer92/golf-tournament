'use client';

import { useState } from 'react';
import { saveGhinIdentity } from '@/lib/pool-identity';

// Shown when a GHIN call fails because the 12-hour token expired. Lets the user
// re-login in place (stores a fresh token + their GHIN identity), then fires
// onDone so the caller can retry. Rendered only while `open` is true.
export function GhinLoginModal({ open, onDoneAction, onCloseAction }: {
  open: boolean;
  onDoneAction: () => void;
  onCloseAction: () => void;
}) {
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
      // Persist identity to session AND local storage so a returning organizer
      // keeps their "My Pool Games" history after the tab closes.
      if (data.golfer) saveGhinIdentity(data.golfer);
      setUser('');
      setPass('');
      onDoneAction();
    } catch {
      setErr('Connection error');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCloseAction}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-900">GHIN login expired</h2>
          <button onClick={onCloseAction} className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Your GHIN session timed out (they last ~12 hours). Log in again to continue.</p>
        <form onSubmit={submit} className="space-y-2">
          <input
            type="text" value={user} onChange={(e) => setUser(e.target.value)}
            placeholder="GHIN email" autoFocus
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <input
            type="password" value={pass} onChange={(e) => setPass(e.target.value)}
            placeholder="Password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button
            type="submit" disabled={busy || !user || !pass}
            className="w-full rounded-md bg-green-700 px-4 py-2 text-white text-sm font-medium hover:bg-green-800 disabled:opacity-50"
          >
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  );
}
