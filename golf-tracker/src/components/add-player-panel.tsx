'use client';

// F-040 (option B): ONE add-player stack for every surface, ordered the way
// people think, not the way the API grew — name search FIRST (knowing a name is
// universal), manual add second with the no-GHIN note (§5.ac honesty about what
// a manual player IS), and GHIN numbers behind a disclosure that also takes a
// pasted LIST (comma/newline separated) with per-number success/failure.
//
// The panel owns the GHIN fetches and its own inputs; each surface supplies
// what to DO with a resolved player (onAddAction) and, where a GHIN login modal
// exists, how to prompt for it (onNeedLoginAction). Without a login handler a
// missing token surfaces as an inline note instead of a silent failure.

import { useState } from 'react';
import { parseGhinIndex } from '@/lib/game-state';

export interface AddedPlayer {
  name: string;
  handicapIndex: number | null;
  /** null = no official GHIN (manual add) — the handicap won't update itself. */
  ghinNumber: number | null;
  gender: 'M' | 'F';
  source: 'search' | 'ghin' | 'manual';
}

const inputCls =
  'rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';
const addBtnCls =
  'rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50';

function toGender(raw: unknown): 'M' | 'F' {
  const g = String(raw ?? '').toLowerCase();
  return g === 'female' || g === 'f' ? 'F' : 'M';
}

export function AddPlayerPanel({
  existingGhins,
  onAddAction,
  getTokenAction,
  onNeedLoginAction,
  showGender = true,
  addDisabled = false,
}: {
  /** GHIN numbers already present on this surface — used to dedupe every path. */
  existingGhins: Set<number>;
  onAddAction: (p: AddedPlayer) => void | Promise<void>;
  getTokenAction: () => string | null;
  /** Prompt for GHIN login and re-run `retry` once signed in (surfaces with a modal). */
  onNeedLoginAction?: (retry: () => void) => void;
  showGender?: boolean;
  /** Disables every Add button (e.g. the game's player cap is reached). */
  addDisabled?: boolean;
}) {
  // Name search (primary)
  const [gsFirst, setGsFirst] = useState('');
  const [gsLast, setGsLast] = useState('');
  const [gsState, setGsState] = useState('VA');
  const [gsResults, setGsResults] = useState<Record<string, unknown>[]>([]);
  const [gsLoading, setGsLoading] = useState(false);
  const [gsSearched, setGsSearched] = useState(false);
  const [gsNote, setGsNote] = useState('');
  // Manual add
  const [nameInput, setNameInput] = useState('');
  const [handicapInput, setHandicapInput] = useState('');
  const [genderInput, setGenderInput] = useState<'M' | 'F'>('M');
  // GHIN numbers (disclosure): single or pasted list
  const [ghinOpen, setGhinOpen] = useState(false);
  const [ghinText, setGhinText] = useState('');
  const [ghinLoading, setGhinLoading] = useState(false);
  const [ghinResults, setGhinResults] = useState<{ raw: string; note: string; ok: boolean }[]>([]);

  function requestLogin(retry: () => void, setNote: (s: string) => void) {
    if (onNeedLoginAction) onNeedLoginAction(retry);
    else setNote('Sign in to GHIN first (top of the page), then try again.');
  }

  async function searchGhinByName() {
    // GHIN name search requires a last name AND a state to return results.
    if (!gsLast.trim()) { setGsNote('Enter a last name to search.'); return; }
    if (!gsState.trim()) { setGsNote('Enter a state (e.g. VA) — GHIN requires it to search by name.'); return; }
    const token = getTokenAction();
    if (!token) { requestLogin(searchGhinByName, setGsNote); return; }
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
      if (!res.ok) { setGsResults([]); requestLogin(searchGhinByName, setGsNote); return; }
      const golfers: Record<string, unknown>[] = data.golfers || [];
      setGsResults(golfers);
      setGsSearched(true);
      if (golfers.length === 0) {
        setGsNote(`No golfers named "${gsLast}" found in ${gsState.toUpperCase()}. Check spelling/state, or add manually below.`);
      }
    } catch {
      setGsResults([]);
      setGsNote('Search failed — check your connection or add manually below.');
    } finally {
      setGsLoading(false);
    }
  }

  async function addSearchResult(g: Record<string, unknown>) {
    const ghinNumber = Number(g.ghin ?? g.id);
    if (!isNaN(ghinNumber) && existingGhins.has(ghinNumber)) return;
    await onAddAction({
      name: `${g.first_name ?? ''} ${g.last_name ?? ''}`.trim(),
      handicapIndex: parseGhinIndex((g.handicap_index ?? g.hi_value) as string),
      ghinNumber: isNaN(ghinNumber) ? null : ghinNumber,
      gender: toGender(g.gender || g.Gender),
      source: 'search',
    });
  }

  async function addManual() {
    if (!nameInput.trim()) return;
    await onAddAction({
      name: nameInput.trim(),
      handicapIndex: handicapInput ? parseFloat(handicapInput) : null,
      ghinNumber: null,
      gender: genderInput,
      source: 'manual',
    });
    setNameInput('');
    setHandicapInput('');
  }

  // Resolve one-or-many GHIN numbers, reporting per-number success/failure.
  // The bulk case is where number entry genuinely earns its place (F-040).
  async function addByGhinNumbers() {
    const raws = ghinText.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (raws.length === 0) return;
    const token = getTokenAction();
    if (!token) {
      requestLogin(addByGhinNumbers, (s) => setGhinResults([{ raw: '', note: s, ok: false }]));
      return;
    }
    setGhinLoading(true);
    const results: { raw: string; note: string; ok: boolean }[] = [];
    const addedNow = new Set<number>();
    for (const raw of raws) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) { results.push({ raw, note: 'not a GHIN number', ok: false }); continue; }
      if (existingGhins.has(n) || addedNow.has(n)) { results.push({ raw, note: 'already added', ok: true }); continue; }
      try {
        const res = await fetch('/api/ghin/golfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, ghin_number: n }),
        });
        const data = await res.json();
        if (res.status === 401) {
          // Token died mid-list: stop, prompt, and let the retry resume the leftovers.
          results.push({ raw, note: 'GHIN sign-in needed', ok: false });
          setGhinResults(results);
          setGhinLoading(false);
          requestLogin(addByGhinNumbers, (s) => setGhinResults([...results, { raw: '', note: s, ok: false }]));
          return;
        }
        const golfer = data.golfer;
        if (!res.ok || !golfer) { results.push({ raw, note: 'not found', ok: false }); continue; }
        // Guard against blank GHIN names (F-027) — never add a nameless player.
        const name = [golfer.first_name, golfer.last_name].filter(Boolean).join(' ').trim() || `GHIN #${n}`;
        await onAddAction({
          name,
          handicapIndex: parseGhinIndex(golfer.handicap_index ?? golfer.hi_value),
          ghinNumber: n,
          gender: toGender(golfer.gender || golfer.Gender),
          source: 'ghin',
        });
        addedNow.add(n);
        results.push({ raw, note: `added ${name}`, ok: true });
      } catch {
        results.push({ raw, note: 'network error', ok: false });
      }
    }
    setGhinResults(results);
    setGhinLoading(false);
    // Keep only the failures in the box so a fixed typo can be retried alone.
    setGhinText(results.filter((r) => !r.ok).map((r) => r.raw).join('\n'));
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      {/* 1. Name search — the way people actually know each other. */}
      <p className="text-sm font-semibold text-gray-800 mb-0.5">Search GHIN by name</p>
      <p className="text-xs text-gray-500 mb-2">Last name and state required. First name optional to narrow it down.</p>
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={gsFirst}
          onChange={(e) => setGsFirst(e.target.value)}
          placeholder="First (optional)"
          className={`flex-1 min-w-[100px] ${inputCls}`}
        />
        <input
          type="text"
          value={gsLast}
          onChange={(e) => setGsLast(e.target.value)}
          placeholder="Last name"
          className={`flex-1 min-w-[100px] ${inputCls}`}
        />
        <input
          type="text"
          value={gsState}
          onChange={(e) => setGsState(e.target.value.toUpperCase())}
          placeholder="ST"
          maxLength={2}
          className={`w-14 ${inputCls}`}
        />
        <button
          onClick={searchGhinByName}
          disabled={gsLoading || !gsLast.trim() || !gsState.trim()}
          className={addBtnCls}
        >
          {gsLoading ? '...' : 'Search GHIN'}
        </button>
      </div>
      {gsNote && <p className="text-xs text-gray-500 mt-2">{gsNote}</p>}
      {gsSearched && gsResults.length > 0 && (
        <ul className="mt-2 max-h-48 overflow-y-auto divide-y divide-gray-100">
          {gsResults.map((g, i) => {
            const ghinNumber = Number(g.ghin ?? g.id);
            const already = !isNaN(ghinNumber) && existingGhins.has(ghinNumber);
            return (
              <li key={String(g.ghin ?? g.id ?? i)}>
                <button
                  onClick={() => addSearchResult(g)}
                  disabled={already || addDisabled}
                  className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between gap-2 ${
                    already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'
                  }`}
                >
                  <span>
                    <span className="text-sm font-medium text-gray-900">
                      {String(g.first_name ?? '')} {String(g.last_name ?? '')}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      {String(g.handicap_index ?? g.hi_value ?? '—')}
                      {g.gender ? ` · ${String(g.gender)}` : ''}
                      {g.club_name ? ` · ${String(g.club_name)}` : ''}
                    </span>
                  </span>
                  <span className={`text-xs font-medium ${already ? 'text-gray-400' : 'text-green-700'}`}>
                    {already ? 'Added' : '+ Add'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 2. Manual add — the fallback when search finds nothing. */}
      <div className="mt-3 pt-3 border-t">
        <p className="text-sm font-semibold text-gray-800 mb-2">Or add manually</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Name"
            className={`flex-1 ${inputCls}`}
          />
          <input
            type="text"
            inputMode="decimal"
            value={handicapInput}
            onChange={(e) => setHandicapInput(e.target.value)}
            placeholder="HCP"
            className={`w-16 ${inputCls}`}
          />
          {showGender && (
            <button
              type="button"
              onClick={() => setGenderInput(genderInput === 'M' ? 'F' : 'M')}
              className={`w-9 rounded-md border text-sm font-bold py-2 ${genderInput === 'M' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-pink-300 bg-pink-50 text-pink-700'}`}
            >
              {genderInput}
            </button>
          )}
          <button onClick={addManual} disabled={!nameInput.trim() || addDisabled} className={addBtnCls}>
            Add
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          No official GHIN — the handicap you type stays as typed and won&apos;t update itself.
        </p>
      </div>

      {/* 3. GHIN numbers — folded away; earns its place for a pasted list. */}
      <div className="mt-3 pt-3 border-t">
        {!ghinOpen ? (
          <button
            type="button"
            onClick={() => setGhinOpen(true)}
            className="text-sm font-medium text-green-700 hover:text-green-900"
          >
            Have GHIN numbers?
            <span className="ml-1 text-xs text-gray-400 font-normal">add one, or paste a whole list</span>
          </button>
        ) : (
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">Add by GHIN #</p>
            <div className="flex gap-2 items-start">
              <textarea
                value={ghinText}
                onChange={(e) => setGhinText(e.target.value)}
                placeholder="One number, or a list — commas or new lines"
                rows={2}
                inputMode="numeric"
                className={`flex-1 ${inputCls}`}
              />
              <button
                onClick={addByGhinNumbers}
                disabled={ghinLoading || !ghinText.trim() || addDisabled}
                className={addBtnCls}
              >
                {ghinLoading ? '...' : 'Add'}
              </button>
            </div>
            {ghinResults.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {ghinResults.map((r, i) => (
                  <li key={`${r.raw}-${i}`} className={`text-xs ${r.ok ? 'text-green-700' : 'text-red-600'}`}>
                    {r.raw ? `${r.raw} — ${r.note}` : r.note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
