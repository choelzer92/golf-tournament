'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { parseGhinIndex } from '@/lib/game-state';
import { getAccessLevel } from '@/lib/invite-gate';
import { getCreatorGhin } from '@/lib/pool-identity';
import { GhinLoginModal } from '@/components/ghin-login-modal';
import {
  type RosterPlayer,
  hydrateRoster,
  searchRoster,
  upsertRosterPlayer,
  deleteRosterPlayer,
  refreshRosterHandicaps,
} from '@/lib/roster';

// Dedicated, clearly-labeled roster manager — SEPARATE from picking a game's
// field. Building your saved-player list and choosing who plays today are two
// different tasks the organizer was conflating, so this page does only the
// former: see everyone saved, add new players, remove players, refresh
// handicaps. Every add shows a plain "Added to your saved players" confirmation.

function getToken() {
  return sessionStorage.getItem('ghin_token');
}

export default function RosterPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');

  // Add by GHIN #
  const [ghinInput, setGhinInput] = useState('');
  const [ghinLoading, setGhinLoading] = useState(false);
  const [ghinError, setGhinError] = useState('');

  // Add manually
  const [nameInput, setNameInput] = useState('');
  const [handicapInput, setHandicapInput] = useState('');
  const [genderInput, setGenderInput] = useState<'M' | 'F'>('M');

  // GHIN name search
  const [gsFirst, setGsFirst] = useState('');
  const [gsLast, setGsLast] = useState('');
  const [gsState, setGsState] = useState('VA');
  const [gsResults, setGsResults] = useState<Record<string, unknown>[]>([]);
  const [gsLoading, setGsLoading] = useState(false);
  const [gsSearched, setGsSearched] = useState(false);
  const [gsNote, setGsNote] = useState('');

  const [showLogin, setShowLogin] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    hydrateRoster({ viewerGhin: getCreatorGhin(), isOwner: getAccessLevel() === 'full' }).then(() => {
      setPlayers(searchRoster(''));
      setLoading(false);
    });
  }, []);

  function refresh(q: string) {
    setQuery(q);
    setPlayers(searchRoster(q));
  }

  // Show a plain confirmation so it's OBVIOUS the player was saved and persists.
  function flashConfirmation(msg: string) {
    setConfirmation(msg);
    window.setTimeout(() => setConfirmation(''), 3500);
  }

  const existingGhins = new Set(players.map((p) => p.ghinNumber).filter((g): g is number => g != null));

  async function addByGhin() {
    if (!ghinInput) return;
    const token = getToken();
    if (!token) { retryRef.current = addByGhin; setShowLogin(true); return; }
    setGhinLoading(true);
    setGhinError('');
    try {
      const res = await fetch('/api/ghin/golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ghin_number: Number(ghinInput) }),
      });
      const data = await res.json();
      if (!res.ok) { retryRef.current = addByGhin; setShowLogin(true); return; }
      const golfer = data.golfer;
      const ghinNumber = Number(ghinInput);
      if (existingGhins.has(ghinNumber)) { setGhinError('That player is already on your roster.'); return; }
      const hi = parseGhinIndex(golfer.handicap_index ?? golfer.hi_value);
      const ghinGender = (golfer.gender || golfer.Gender || '').toLowerCase();
      const gender: 'M' | 'F' = ghinGender === 'female' || ghinGender === 'f' ? 'F' : 'M';
      const name = `${golfer.first_name} ${golfer.last_name}`.trim();
      await upsertRosterPlayer({
        id: crypto.randomUUID(),
        ghinNumber,
        name,
        handicapIndex: hi,
        gender,
        defaultTeeName: null,
      });
      setGhinInput('');
      refresh(query);
      flashConfirmation(`Added ${name} to your saved players.`);
    } catch {
      setGhinError('Network error');
    } finally {
      setGhinLoading(false);
    }
  }

  async function addManual() {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    const handicapIndex = handicapInput ? parseFloat(handicapInput) : null;
    await upsertRosterPlayer({
      id: crypto.randomUUID(),
      ghinNumber: null,
      name,
      handicapIndex,
      gender: genderInput,
      defaultTeeName: null,
    });
    setNameInput('');
    setHandicapInput('');
    refresh(query);
    flashConfirmation(`Added ${name} to your saved players.`);
  }

  async function searchGhinByName() {
    if (!gsLast.trim()) { setGsNote('Enter a last name to search.'); return; }
    if (!gsState.trim()) { setGsNote('Enter a state (e.g. VA) — GHIN requires it to search by name.'); return; }
    const token = getToken();
    if (!token) { retryRef.current = searchGhinByName; setShowLogin(true); return; }
    setGsLoading(true);
    setGsSearched(false);
    setGsNote('');
    try {
      const res = await fetch('/api/ghin/search-golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, first_name: gsFirst, last_name: gsLast, state: gsState }),
      });
      const data = await res.json();
      if (!res.ok) { setGsResults([]); retryRef.current = searchGhinByName; setShowLogin(true); return; }
      const golfers: Record<string, unknown>[] = data.golfers || [];
      setGsResults(golfers);
      setGsSearched(true);
      if (golfers.length === 0) {
        setGsNote(`No golfers named "${gsLast}" found in ${gsState.toUpperCase()}. Check spelling/state, or add by GHIN #.`);
      }
    } catch {
      setGsResults([]);
      setGsNote('Search failed — check your connection or add by GHIN #');
    } finally {
      setGsLoading(false);
    }
  }

  async function addGhinSearchResult(g: Record<string, unknown>) {
    const ghinNumber = Number(g.ghin ?? g.id);
    if (!isNaN(ghinNumber) && existingGhins.has(ghinNumber)) { flashConfirmation('That player is already on your roster.'); return; }
    const hi = parseGhinIndex((g.handicap_index ?? g.hi_value) as string);
    const ghinGender = String(g.gender || g.Gender || '').toLowerCase();
    const gender: 'M' | 'F' = ghinGender === 'female' || ghinGender === 'f' ? 'F' : 'M';
    const name = `${g.first_name ?? ''} ${g.last_name ?? ''}`.trim();
    await upsertRosterPlayer({
      id: crypto.randomUUID(),
      ghinNumber: isNaN(ghinNumber) ? null : ghinNumber,
      name,
      handicapIndex: hi,
      gender,
      defaultTeeName: null,
    });
    refresh(query);
    flashConfirmation(`Added ${name} to your saved players.`);
  }

  async function removePlayer(rp: RosterPlayer) {
    if (!confirm(`Remove ${rp.name} from your saved players? This does not affect games they're already in.`)) return;
    await deleteRosterPlayer(rp.id);
    refresh(query);
    flashConfirmation(`Removed ${rp.name} from your saved players.`);
  }

  async function doRefreshHandicaps() {
    const token = getToken();
    if (!token) { retryRef.current = doRefreshHandicaps; setShowLogin(true); return; }
    setRefreshing(true);
    setRefreshNote('');
    try {
      const count = await refreshRosterHandicaps(token);
      refresh(query);
      setRefreshNote(count > 0 ? `Updated ${count} handicap${count === 1 ? '' : 's'} from GHIN.` : 'Handicaps already current.');
    } catch {
      setRefreshNote('Refresh failed — check your connection.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="min-h-full bg-gray-50">
      <GhinLoginModal
        open={showLogin}
        onCloseAction={() => setShowLogin(false)}
        onDoneAction={() => { setShowLogin(false); const r = retryRef.current; retryRef.current = null; r?.(); }}
      />

      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">My Saved Players</h1>
          <button onClick={() => router.push('/pool')} className="text-sm text-green-200 hover:text-white">My Games</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-sm text-gray-600 mb-4">
          These are the players saved for reuse. Add someone once here and they&apos;ll be available to pick
          for every game. Adding to this list is permanent until you remove them.
        </p>

        {/* Sticky confirmation banner so it's obvious an add/remove persisted */}
        {confirmation && (
          <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-800">
            ✓ {confirmation}
          </div>
        )}

        {/* Saved players list */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-800">
              Saved players <span className="ml-1 text-xs font-normal text-gray-500">({players.length})</span>
            </p>
            <button
              onClick={doRefreshHandicaps}
              disabled={refreshing}
              className="text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-50"
              title="Re-pull current handicap indexes from GHIN for all saved players"
            >
              {refreshing ? 'Refreshing…' : '↻ Refresh handicaps'}
            </button>
          </div>
          {refreshNote && <p className="text-xs text-gray-500 mb-2">{refreshNote}</p>}
          <input
            type="text"
            value={query}
            onChange={(e) => refresh(e.target.value)}
            placeholder="Filter by name…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          {loading ? (
            <p className="mt-3 text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : players.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500">No saved players{query ? ' match' : ' yet'}. Add someone below.</p>
          ) : (
            <ul className="mt-2 max-h-96 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-100">
              {players.map((rp) => (
                <li key={rp.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="flex-1 font-medium text-gray-900 truncate">
                    {rp.name}
                    <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${rp.gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                      {rp.gender || 'M'}
                    </span>
                  </span>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    Index {rp.handicapIndex ?? '—'}
                    {rp.ghinNumber ? ` · GHIN ${rp.ghinNumber}` : ' · manual'}
                  </span>
                  <button
                    onClick={() => removePlayer(rp)}
                    className="text-red-500 hover:text-red-700 text-xs font-medium flex-shrink-0"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add by GHIN # + manual */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <p className="text-sm font-semibold text-gray-800 mb-2">Add by GHIN #</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={ghinInput}
              onChange={(e) => setGhinInput(e.target.value)}
              placeholder="GHIN number"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <button
              onClick={addByGhin}
              disabled={ghinLoading || !ghinInput}
              className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
            >
              {ghinLoading ? '...' : 'Add'}
            </button>
          </div>
          {ghinError && <p className="text-xs text-red-600 mt-1">{ghinError}</p>}

          <div className="mt-3 pt-3 border-t">
            <p className="text-sm font-semibold text-gray-800 mb-2">Or add manually</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Name"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <input
                type="text"
                inputMode="decimal"
                value={handicapInput}
                onChange={(e) => setHandicapInput(e.target.value)}
                placeholder="HCP"
                className="w-16 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <button
                type="button"
                onClick={() => setGenderInput(genderInput === 'M' ? 'F' : 'M')}
                className={`w-9 rounded-md border text-sm font-bold py-2 ${genderInput === 'M' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-pink-300 bg-pink-50 text-pink-700'}`}
              >
                {genderInput}
              </button>
              <button
                onClick={addManual}
                disabled={!nameInput.trim()}
                className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* GHIN name search */}
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm font-semibold text-gray-800 mb-0.5">Search GHIN by name</p>
          <p className="text-xs text-gray-500 mb-2">Last name and state required. First name optional to narrow it down.</p>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={gsFirst}
              onChange={(e) => setGsFirst(e.target.value)}
              placeholder="First (optional)"
              className="flex-1 min-w-[100px] rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <input
              type="text"
              value={gsLast}
              onChange={(e) => setGsLast(e.target.value)}
              placeholder="Last name"
              className="flex-1 min-w-[100px] rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <input
              type="text"
              value={gsState}
              onChange={(e) => setGsState(e.target.value.toUpperCase())}
              placeholder="ST"
              maxLength={2}
              className="w-14 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <button
              onClick={searchGhinByName}
              disabled={gsLoading || !gsLast.trim() || !gsState.trim()}
              className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
            >
              {gsLoading ? '...' : 'Search GHIN'}
            </button>
          </div>
          {gsNote && <p className="text-xs text-gray-500 mt-2">{gsNote}</p>}
          {gsSearched && gsResults.length > 0 && (
            <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-gray-100">
              {gsResults.map((g, i) => {
                const ghinNumber = Number(g.ghin ?? g.id);
                const already = !isNaN(ghinNumber) && existingGhins.has(ghinNumber);
                return (
                  <li key={(g.ghin as string) ?? (g.id as string) ?? i}>
                    <button
                      onClick={() => addGhinSearchResult(g)}
                      disabled={already}
                      className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                    >
                      <span className="text-sm font-medium text-gray-900 flex-1">
                        {String(g.first_name ?? '')} {String(g.last_name ?? '')}
                      </span>
                      <span className="text-xs text-gray-500">
                        {String(g.handicap_index ?? g.hi_value ?? '—')}
                        {g.gender ? ` · ${String(g.gender)}` : ''}
                        {g.club_name ? ` · ${String(g.club_name)}` : ''}
                      </span>
                      {already ? <span className="text-xs text-gray-400">Saved</span> : <span className="text-xs text-green-700 font-medium">+ Add</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
