'use client';

import { useState } from 'react';
import type { Player } from '@/lib/game-state';

// "Keep together" pairing locks. The organizer picks two+ players who must share
// a team; auto-balance then optimizes handicaps around that constraint. Shared
// by the new-game wizard and the hub's edit mode so both edit the same
// game-level lockedGroups. Kept deliberately simple: add a pair from two
// dropdowns, see the locked groups as removable chips.
//
// The apply step lives RIGHT HERE (the `onApplyAction` button) so a
// non-technical organizer can't miss the connection: lock players → tap the
// green button in the same box → they end up together with balanced teams.
// Previously the only way to apply a lock was a separate "Auto-balance" button
// elsewhere, and the organizer didn't realize a lock did nothing on its own.
export function PairingLocks({
  players, lockedGroups, setLockedGroupsAction, onApplyAction,
}: {
  players: Player[];
  lockedGroups: string[][];
  setLockedGroupsAction: (g: string[][]) => void;
  // When provided, shows a prominent "keep together + balance" button in-box.
  onApplyAction?: () => void;
}) {
  const setLockedGroups = setLockedGroupsAction;
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?';

  // A player can only be in one lock group; already-locked players drop out of
  // the pickers.
  const lockedIds = new Set(lockedGroups.flat());

  function addPair() {
    if (!a || !b || a === b) return;
    // If either player is already in a group, merge into it; else make a new group.
    const groups = lockedGroups.map((g) => [...g]);
    const gi = groups.findIndex((g) => g.includes(a) || g.includes(b));
    if (gi >= 0) {
      if (!groups[gi].includes(a)) groups[gi].push(a);
      if (!groups[gi].includes(b)) groups[gi].push(b);
    } else {
      groups.push([a, b]);
    }
    setLockedGroups(groups);
    setA(''); setB('');
    setJustAdded(true);
  }

  function removeGroup(idx: number) {
    setLockedGroups(lockedGroups.filter((_, i) => i !== idx));
  }

  const available = players.filter((p) => !lockedIds.has(p.id));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-sm font-semibold text-gray-800">Keep players together (optional)</p>
      <p className="text-xs text-gray-500 mb-2">
        Pick two players who should be on the same team — e.g. a pair who always play together.
        {onApplyAction ? ' Then tap the green button to build balanced teams that keep them together.' : ' Auto-balance will keep them together.'}
      </p>

      <div className="flex gap-2 flex-wrap items-center">
        <select
          value={a}
          onChange={(e) => setA(e.target.value)}
          className="flex-1 min-w-[120px] rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none"
        >
          <option value="">Player…</option>
          {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="text-gray-400 text-sm">+</span>
        <select
          value={b}
          onChange={(e) => setB(e.target.value)}
          className="flex-1 min-w-[120px] rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none"
        >
          <option value="">Player…</option>
          {available.filter((p) => p.id !== a).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button
          onClick={addPair}
          disabled={!a || !b}
          className="rounded-md bg-green-700 px-3 py-1.5 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
        >
          Lock
        </button>
      </div>

      {lockedGroups.length > 0 && (
        <div className="mt-3 rounded-md bg-green-50 border border-green-200 p-2.5">
          <p className="text-xs font-semibold text-green-900 mb-1.5">Locked together:</p>
          <div className="flex flex-wrap gap-2">
            {lockedGroups.map((g, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white border border-green-300 text-green-800 px-2 py-0.5 text-xs font-medium">
                {g.map(nameOf).join(' + ')}
                <button onClick={() => removeGroup(i)} className="text-green-700 hover:text-green-900 font-bold" title="Remove lock">&times;</button>
              </span>
            ))}
          </div>

          {onApplyAction && (
            <>
              {justAdded && (
                <p className="mt-2 text-xs text-green-800">
                  These are just rules so far — tap below to actually build the teams.
                </p>
              )}
              <button
                onClick={() => { setJustAdded(false); onApplyAction(); }}
                className="mt-2 w-full rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800"
              >
                Build teams &amp; keep these together
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
