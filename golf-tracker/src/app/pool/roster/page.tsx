'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AddPlayerPanel } from '@/components/add-player-panel';
import { getAccessLevel } from '@/lib/invite-gate';
import { getCreatorGhin } from '@/lib/pool-identity';
import { GhinLoginModal } from '@/components/ghin-login-modal';
import {
  type RosterPlayer,
  hydrateRoster,
  searchRoster,
  getRoster,
  upsertRosterPlayer,
  deleteRosterPlayer,
  refreshRosterHandicaps,
} from '@/lib/roster';
import {
  type RosterGroup,
  hydrateGroups,
  upsertGroup,
  renameGroup,
  deleteGroup,
  setGroupMembers,
} from '@/lib/roster-groups';
import { getPlayerGroups } from '@/lib/pool-formats';

// Dedicated, clearly-labeled roster manager — SEPARATE from picking a game's
// field. Building your saved-player list and choosing who plays today are two
// different tasks the organizer was conflating, so this page does only the
// former: see everyone saved, add new players, remove players, refresh
// handicaps. Every add shows a plain "Added to your saved players" confirmation.

function getToken() {
  return sessionStorage.getItem('ghin_token');
}

// A player's "usual tee" as a RELATIVE position, so it applies at any course
// regardless of that course's tee names. Value = defaultTeeRank (0 = longest /
// back tee, counting toward forward); '' = no preference (falls back to the
// gender default). Ranks beyond a course's tee count clamp to its most-forward
// tee (see pickTeeForPlayer). Labels are course-agnostic on purpose.
const USUAL_TEE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tee: auto' },
  { value: '0', label: 'Longest (back)' },
  { value: '1', label: '2nd longest' },
  { value: '2', label: 'Middle' },
  { value: '3', label: '4th (forward-ish)' },
  { value: '4', label: 'Most forward' },
];

export default function RosterPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');

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

  async function removePlayer(rp: RosterPlayer) {
    if (!confirm(`Remove ${rp.name} from your saved players? This does not affect games they're already in.`)) return;
    await deleteRosterPlayer(rp.id);
    refresh(query);
    flashConfirmation(`Removed ${rp.name} from your saved players.`);
  }

  // Set a player's USUAL tee as a relative position (0 = longest/back, up to
  // forward). Stored as defaultTeeRank so it travels to any course regardless of
  // that course's tee names; the game wizard resolves it into an actual tee.
  // We also clear defaultTeeName (to '' — NOT null, which upsertRosterPlayer
  // treats as "keep existing") so a stale course-specific name can't win over
  // this deliberate preference, since the picker checks name before rank.
  // rankStr '' clears the preference entirely.
  async function setUsualTee(rp: RosterPlayer, rankStr: string) {
    const rank = rankStr === '' ? null : Number(rankStr);
    await upsertRosterPlayer({ ...rp, defaultTeeName: '', defaultTeeRank: rank });
    refresh(query);
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
          <h1 className="text-xl font-bold">Saved Players &amp; Groups</h1>
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

        {/* Groups — named sets of saved players, reusable when starting a game */}
        <GroupsManager rosterLoading={loading} />

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
                  <select
                    value={rp.defaultTeeRank ?? ''}
                    onChange={(e) => setUsualTee(rp, e.target.value)}
                    title="Usual tee — the tee this player normally plays, applied as their default in new games (overridable per game)."
                    className="text-xs border border-gray-200 rounded px-1 py-0.5 text-gray-600 flex-shrink-0 max-w-[7.5rem]"
                  >
                    {USUAL_TEE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
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

        {/* F-040 option B: the shared add-player stack — name search first, manual
            second (with the no-GHIN note), GHIN numbers behind a disclosure that
            takes a pasted list. */}
        <AddPlayerPanel
          existingGhins={existingGhins}
          getTokenAction={getToken}
          onNeedLoginAction={(retry) => { retryRef.current = retry; setShowLogin(true); }}
          onAddAction={async (info) => {
            await upsertRosterPlayer({
              id: crypto.randomUUID(),
              ghinNumber: info.ghinNumber,
              name: info.name,
              handicapIndex: info.handicapIndex,
              gender: info.gender,
              defaultTeeName: null,
            });
            refresh(query);
            flashConfirmation(`Added ${info.name} to your saved players.`);
          }}
        />
      </main>
    </div>
  );
}

// Full group manager: create a named group from scratch, rename/delete, and
// add/remove members from the saved roster. Groups store canonical roster ids
// (the roster is the source of truth), scoped to the viewer's GHIN. Separate
// from the wizard's "save current field as a group" — this is where you curate
// a reusable group directly.
function GroupsManager({ rosterLoading }: { rosterLoading: boolean }) {
  const [groups, setGroups] = useState<RosterGroup[]>([]);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [note, setNote] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');

  // Load groups (roster is already hydrated by the page; re-read the cache after
  // it finishes so member names resolve).
  useEffect(() => {
    hydrateGroups({ viewerGhin: getCreatorGhin(), isOwner: getAccessLevel() === 'full' })
      .then(() => setGroups(getPlayerGroups()))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!rosterLoading) setRoster(getRoster());
  }, [rosterLoading]);

  const selected = groups.find((g) => g.id === selectedId) ?? null;
  const rosterById = new Map(roster.map((r) => [r.id, r]));

  function flash(msg: string) {
    setNote(msg);
    window.setTimeout(() => setNote(''), 3000);
  }

  async function createGroup() {
    const name = newName.trim();
    if (!name) return;
    const group: RosterGroup = {
      id: crypto.randomUUID(),
      name,
      ownerGhin: getCreatorGhin(),
      playerIds: [],
      defaults: null,
    };
    await upsertGroup(group);
    setGroups(getPlayerGroups());
    setSelectedId(group.id);
    setNewName('');
    flash(`Created group “${name}”. Add players below.`);
  }

  async function doRename() {
    if (!selected) return;
    const name = renameText.trim();
    if (!name) return;
    await renameGroup(selected.id, name);
    setGroups(getPlayerGroups());
    setRenaming(false);
    flash('Group renamed.');
  }

  async function doDelete() {
    if (!selected) return;
    if (!confirm(`Delete group “${selected.name}”? This does not remove any players from your roster.`)) return;
    await deleteGroup(selected.id);
    setGroups(getPlayerGroups());
    setSelectedId('');
    flash('Group deleted.');
  }

  async function toggleMember(playerId: string) {
    if (!selected) return;
    const has = selected.playerIds.includes(playerId);
    const next = has ? selected.playerIds.filter((id) => id !== playerId) : [...selected.playerIds, playerId];
    await setGroupMembers(selected.id, next);
    setGroups(getPlayerGroups());
  }

  const inputCls = 'rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';
  const memberMatches = memberQuery.trim()
    ? roster.filter((r) => r.name.toLowerCase().includes(memberQuery.trim().toLowerCase()))
    : roster;

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <p className="text-sm font-semibold text-gray-800 mb-0.5">Groups</p>
      <p className="text-xs text-gray-500 mb-3">
        A group is a named set of your saved players (e.g. “Weekend Warriors”). Load one when starting a game to fill the field in one tap.
      </p>

      {note && <p className="mb-2 rounded-md bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-medium text-green-800">{note}</p>}

      {/* Pick an existing group, or create a new one */}
      <div className="flex gap-2 flex-wrap">
        <select className={`${inputCls} flex-1 min-w-[160px]`} value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setRenaming(false); }}>
          <option value="">{groups.length ? 'Select a group…' : 'No groups yet'}</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.playerIds.length})</option>)}
        </select>
      </div>
      <div className="flex gap-2 mt-2">
        <input className={`${inputCls} flex-1`} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New group name…" />
        <button onClick={createGroup} disabled={!newName.trim()} className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50">Create</button>
      </div>

      {selected && (
        <div className="mt-4 border-t pt-3">
          <div className="flex items-center justify-between mb-2">
            {renaming ? (
              <div className="flex gap-2 flex-1">
                <input className={`${inputCls} flex-1`} value={renameText} onChange={(e) => setRenameText(e.target.value)} placeholder="Group name" />
                <button onClick={doRename} className="text-xs text-green-700 font-medium hover:text-green-900">Save</button>
                <button onClick={() => setRenaming(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-900">{selected.name} <span className="text-xs font-normal text-gray-500">({selected.playerIds.length} member{selected.playerIds.length === 1 ? '' : 's'})</span></p>
                <div className="flex gap-3">
                  <button onClick={() => { setRenaming(true); setRenameText(selected.name); }} className="text-xs text-green-700 font-medium hover:text-green-900">Rename</button>
                  <button onClick={doDelete} className="text-xs text-red-500 font-medium hover:text-red-700">Delete</button>
                </div>
              </>
            )}
          </div>

          {/* Current members (removable) */}
          {selected.playerIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selected.playerIds.map((id) => {
                const rp = rosterById.get(id);
                return (
                  <button key={id} onClick={() => toggleMember(id)} className="rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium hover:bg-green-200" title="Remove from group">
                    {rp ? rp.name : 'Unknown player'} ✕
                  </button>
                );
              })}
            </div>
          )}

          {/* Add members from the roster */}
          <input className={`${inputCls} w-full`} value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Search saved players to add…" />
          <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-100">
            {memberMatches.map((rp) => {
              const inGroup = selected.playerIds.includes(rp.id);
              return (
                <li key={rp.id}>
                  <button onClick={() => toggleMember(rp.id)} className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-50">
                    <span className="flex-1 text-sm text-gray-900 truncate">{rp.name}</span>
                    <span className="text-xs text-gray-500">{rp.handicapIndex ?? '—'}{rp.ghinNumber ? '' : ' · manual'}</span>
                    <span className={`text-xs font-medium ${inGroup ? 'text-red-500' : 'text-green-700'}`}>{inGroup ? 'Remove' : '+ Add'}</span>
                  </button>
                </li>
              );
            })}
            {memberMatches.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">No saved players match.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
