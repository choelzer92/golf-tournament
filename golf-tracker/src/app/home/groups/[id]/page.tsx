'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { hydrateGroups, getGroupById, addGroupMember, removeGroupMember, type RosterGroup } from '@/lib/roster-groups';
import { hydrateRoster, searchRoster, getRosterPlayerById, type RosterPlayer } from '@/lib/roster';
import { getFormats, getGroupFormats, attachFormatToGroup, detachFormatFromGroup } from '@/lib/pool-formats';
import { hydratePoolGames, loadPoolGame, getPoolGameList, getPoolGameListForGhin } from '@/lib/pool-game';
import { hydrateTournaments, loadTournament, getTournamentList } from '@/lib/tournament-state';
import {
  buildGameLedgers, ledgersForGroup, rollupByPlayer,
  type GameLedger, type PlayerRollup,
} from '@/lib/stats-ledger';
import { getAccessLevel } from '@/lib/invite-gate';
import { getCreatorGhin } from '@/lib/pool-identity';
import { POOL_GROUP_SEED_KEY, TOURNAMENT_GROUP_SEED_KEY, FORMAT_SEED_KEY } from '@/lib/group-seed';

// Group detail — the hub for one saved group, reached from /home. Shows the
// members and lets you (1) start a casual round, (2) start a tournament, or
// (3) add/remove members. Starting a game drops a session "seed" (the group id)
// that the pool / tournament wizard consumes on the relevant step — so a group
// carries its people (and, for pool, its saved format) straight into a new game.
// See POOL_GROUP_SEED_KEY / TOURNAMENT_GROUP_SEED_KEY in lib/group-seed.

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const [ready, setReady] = useState(false);
  const [group, setGroup] = useState<RosterGroup | null>(null);
  const [members, setMembers] = useState<RosterPlayer[]>([]);
  const [missingCount, setMissingCount] = useState(0);

  // Inline "add player" search over the viewer's roster.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RosterPlayer[]>([]);
  const [adding, setAdding] = useState(false);

  // This group's attached game formats, and the whole format library (to import from).
  const [groupFormats, setGroupFormats] = useState<RosterGroup[]>([]);
  const [allFormats, setAllFormats] = useState<RosterGroup[]>([]);
  const [showImport, setShowImport] = useState(false);
  // When starting a casual round, offer a format picker if the group has formats.
  const [showFormatPicker, setShowFormatPicker] = useState(false);

  // DASHBOARD DATA. This page used to be a member manager — at Craig's real 61-member
  // group that was a 5,249px phone scroll of 61 cards, each with a full-width Remove,
  // while the things a group is actually FOR (recent games, money) were absent. Craig:
  // "make it a group dashboard". See FINDINGS.md F-010.
  const [recent, setRecent] = useState<GameLedger[]>([]);
  const [groupNet, setGroupNet] = useState<PlayerRollup[]>([]);
  // Members are collapsed by default and searchable when open — 61 names is a list to
  // look something up in, not something to scroll past on the way to everything else.
  const [membersOpen, setMembersOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');

  function refreshFormats(g: RosterGroup | null) {
    setGroupFormats(g ? getGroupFormats(g) : []);
    setAllFormats(getFormats());
  }

  // Recent games and per-player money for this group. Mirrors /home/stats's load path.
  async function loadGroupLedger(g: RosterGroup, ghin: number | null, isOwner: boolean) {
    try {
      await Promise.all([hydratePoolGames(), hydrateTournaments()]);
      const poolItems = isOwner
        ? getPoolGameList()
        : ghin !== null ? getPoolGameListForGhin(ghin) : [];
      const poolGames = poolItems
        .map((i) => loadPoolGame(i.id))
        .filter((x): x is NonNullable<typeof x> => !!x);
      const tournaments = getTournamentList()
        .map((i) => loadTournament(i.id))
        .filter((x): x is NonNullable<typeof x> => !!x);
      const all = await buildGameLedgers(poolGames, tournaments);
      const mine = ledgersForGroup(all, g);
      setRecent(mine.slice(0, 5));
      setGroupNet(rollupByPlayer(mine));
    } catch {
      /* a group page is still useful without its ledger */
    }
  }

  // Resolve the group's member ids into roster players (name + handicap to show).
  // A member id no longer on the roster is counted, not shown.
  function refreshMembers(g: RosterGroup | null) {
    if (!g) { setMembers([]); setMissingCount(0); return; }
    const found: RosterPlayer[] = [];
    let missing = 0;
    for (const pid of g.playerIds) {
      const rp = getRosterPlayerById(pid);
      if (rp) found.push(rp); else missing++;
    }
    found.sort((a, b) => a.name.localeCompare(b.name));
    setMembers(found);
    setMissingCount(missing);
  }

  useEffect(() => {
    const token = sessionStorage.getItem('ghin_token');
    if (!token) { router.push('/'); return; }
    const isOwner = getAccessLevel() === 'full';
    const ghin = getCreatorGhin();
    // Roster then groups (both viewer-scoped, matching the pool pages). Members
    // are resolved against the roster, so it must load first.
    hydrateRoster({ viewerGhin: ghin, isOwner })
      .then(() => hydrateGroups({ viewerGhin: ghin, isOwner }))
      .then(() => {
        const g = getGroupById(groupId);
        setGroup(g);
        refreshMembers(g);
        refreshFormats(g);
        setResults(searchRoster(''));
        setReady(true);
        // Recent games + money for THIS group. Loaded after the page is usable so the
        // score fetches don't hold up the render. Money is group-scoped by the same rule
        // as /home/stats (DECISIONS.md §5h) — a group's page is exactly where field-wide
        // money is allowed to appear.
        if (g) void loadGroupLedger(g, ghin, isOwner);
      })
      .catch(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, router]);

  // Start a casual round. If the group has attached formats, let the organizer
  // pick one first (or "New/custom"); otherwise go straight in on the group's
  // single baked-in default (today's behavior).
  function startCasualRound() {
    if (groupFormats.length > 0) { setShowFormatPicker(true); return; }
    launchCasual(null);
  }

  // Launch the pool wizard with this group's members seeded. When a format is
  // chosen, ALSO seed its settings (composes with the group seed: members from
  // the group, settings from the format). null format = a fresh/custom game
  // (members only; configure settings in the wizard).
  function launchCasual(format: RosterGroup | null) {
    sessionStorage.setItem(POOL_GROUP_SEED_KEY, groupId);
    if (format?.defaults) {
      sessionStorage.setItem(FORMAT_SEED_KEY, JSON.stringify({ name: format.name, defaults: format.defaults }));
    } else {
      sessionStorage.removeItem(FORMAT_SEED_KEY);
    }
    router.push('/pool/new');
  }

  async function importFormat(formatId: string) {
    if (!group) return;
    const updated = await attachFormatToGroup(group, formatId);
    setGroup(updated);
    refreshFormats(updated);
  }

  async function removeFormat(formatId: string) {
    if (!group) return;
    const updated = await detachFormatFromGroup(group, formatId);
    setGroup(updated);
    refreshFormats(updated);
  }

  function startTournament() {
    sessionStorage.setItem(TOURNAMENT_GROUP_SEED_KEY, groupId);
    router.push('/tournament/new');
  }

  async function addMember(rp: RosterPlayer) {
    if (!group) return;
    setAdding(true);
    await addGroupMember(group.id, rp.id);
    const g = getGroupById(group.id);
    setGroup(g);
    refreshMembers(g);
    setQuery('');
    setResults(searchRoster(''));
    setAdding(false);
  }

  async function removeMember(rp: RosterPlayer) {
    if (!group) return;
    // Craig: "remove should ask for confirmation". Previously one mis-tap while scrolling
    // a 61-name list silently dropped someone from the group.
    if (!confirm(`Remove ${rp.name} from ${group.name}? Their past games and money are unaffected.`)) return;
    await removeGroupMember(group.id, rp.id);
    const g = getGroupById(group.id);
    setGroup(g);
    refreshMembers(g);
  }

  function onSearch(q: string) {
    setQuery(q);
    setResults(searchRoster(q));
  }

  if (!ready) {
    return (
      <div className="min-h-full bg-gray-50">
        <p className="text-center text-gray-400 py-16">Loading…</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-full bg-gray-50">
        <header className="bg-green-800 text-white shadow">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <h1 className="text-xl font-bold">Group not found</h1>
            <button onClick={() => router.push('/home')} className="text-sm text-green-200 hover:text-white">
              Home
            </button>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-6">
          <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
            This group doesn’t exist or isn’t visible to you.
          </p>
        </main>
      </div>
    );
  }

  const memberIds = new Set(group.playerIds);
  const addable = results.filter((r) => !memberIds.has(r.id)).slice(0, 20);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <button onClick={() => router.push('/home')} className="text-xs text-green-200 hover:text-white">
              ← Home
            </button>
            <h1 className="text-xl font-bold">{group.name}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Start something with this group</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={startCasualRound}
              className="flex-1 rounded-lg bg-green-700 px-6 py-5 text-white text-left hover:bg-green-800 shadow-md"
            >
              <p className="font-bold text-lg">Casual round</p>
              <p className="text-sm text-green-100 mt-0.5">
                {groupFormats.length > 0 ? 'Pick one of this group’s formats — or start fresh.' : 'Members and this group’s saved settings pre-loaded.'}
              </p>
            </button>
            <button
              onClick={startTournament}
              className="flex-1 rounded-lg bg-green-900 px-6 py-5 text-white text-left hover:bg-green-950 shadow-md"
            >
              <p className="font-bold text-lg">Multi-round event</p>
              <p className="text-sm text-green-100 mt-0.5">Members pre-filled; split into teams and add rounds.</p>
            </button>
          </div>
        </section>

        {/* WHO'S UP / MONEY — what a group is actually for. These were absent before:
            the page led with 61 member cards and linked money as a single line. */}
        {groupNet.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Money</h2>
              <button
                onClick={() => router.push(`/home/stats?group=${group.id}`)}
                className="text-sm text-green-700 hover:text-green-900 font-medium"
              >
                Full ledger →
              </button>
            </div>
            <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
              {groupNet.slice(0, 5).map((r) => (
                <div key={r.playerId} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{r.playerName}</p>
                    <p className="text-xs text-gray-500">{r.gamesPlayed} game{r.gamesPlayed !== 1 ? 's' : ''}</p>
                  </div>
                  <span className={`font-semibold ${r.net > 0.005 ? 'text-green-700' : r.net < -0.005 ? 'text-red-600' : 'text-gray-500'}`}>
                    {`${r.net < 0 ? '−' : ''}$${Math.abs(r.net).toFixed(2)}`}
                  </span>
                </div>
              ))}
            </div>
            {groupNet.length > 5 && (
              <p className="text-xs text-gray-400 mt-1">
                Top 5 of {groupNet.length} — see the full ledger for everyone.
              </p>
            )}
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Recent games</h2>
            <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
              {recent.map((l) => (
                <button
                  key={l.gameId}
                  onClick={() => router.push(l.gameKind === 'pool' ? `/pool/${l.gameId}` : `/tournament/${l.gameId}`)}
                  className="w-full text-left flex items-center justify-between px-4 py-2.5 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{l.gameName}</p>
                    {l.playedAt && (
                      <p className="text-xs text-gray-500">{new Date(l.playedAt).toLocaleDateString()}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
                    {l.playerIds.length} player{l.playerIds.length !== 1 ? 's' : ''}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Game formats this group plays. Pick one when starting a casual round
            (or start fresh). Import from the saved Format Library. */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Game formats</h2>
            <button
              onClick={() => setShowImport((s) => !s)}
              className="text-sm text-green-700 hover:text-green-900 font-medium"
            >
              {showImport ? 'Done' : '+ Import from library'}
            </button>
          </div>

          {groupFormats.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
              No formats attached yet. Import the games this group plays, so they’re one tap away when you start a round.
            </p>
          ) : (
            <div className="space-y-2">
              {groupFormats.map((f) => (
                <div key={f.id} className="flex items-center justify-between bg-white rounded-lg shadow p-3">
                  <p className="font-medium text-gray-900 truncate">{f.name}</p>
                  <button onClick={() => removeFormat(f.id)} className="shrink-0 text-sm text-red-600 hover:text-red-800 px-2 py-1">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {showImport && (
            <div className="mt-2 bg-white rounded-lg shadow divide-y divide-gray-100">
              {allFormats.filter((f) => !(group.defaults?.formatIds ?? []).includes(f.id)).length === 0 ? (
                <p className="px-3 py-3 text-sm text-gray-500">
                  {allFormats.length === 0
                    ? 'You have no saved formats yet. Save one from a game (or the Game Formats page) first.'
                    : 'All your saved formats are already attached.'}
                </p>
              ) : (
                allFormats
                  .filter((f) => !(group.defaults?.formatIds ?? []).includes(f.id))
                  .map((f) => (
                    <button
                      key={f.id}
                      onClick={() => importFormat(f.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-900">{f.name}</span>
                      <span className="shrink-0 text-sm text-green-700 font-medium">+ Add</span>
                    </button>
                  ))
              )}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Members ({members.length})
          </h2>
          {members.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
              No members yet. Add players below.
            </p>
          ) : !membersOpen ? (
            /* COLLAPSED BY DEFAULT. 61 members rendered flat made this page a 5,249px
               phone scroll of destructive buttons, burying everything else. */
            <button
              onClick={() => setMembersOpen(true)}
              className="w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition"
            >
              <p className="text-sm font-medium text-gray-900">
                {members.length} player{members.length !== 1 ? 's' : ''} — tap to view or edit
              </p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {members.slice(0, 4).map((m) => m.name.split(' ')[0]).join(', ')}
                {members.length > 4 ? `, +${members.length - 4} more` : ''}
              </p>
            </button>
          ) : (
            <>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder={`Search ${members.length} members…`}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <button
                  onClick={() => { setMembersOpen(false); setMemberQuery(''); }}
                  className="shrink-0 min-h-[44px] rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Done
                </button>
              </div>
              <div className="space-y-2">
                {(() => {
                  const q = memberQuery.trim().toLowerCase();
                  const shown = q ? members.filter((m) => m.name.toLowerCase().includes(q)) : members;
                  if (shown.length === 0) {
                    return <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">No members match “{memberQuery}”.</p>;
                  }
                  return shown.map((m) => (
                    <div key={m.id} className="flex items-center justify-between bg-white rounded-lg shadow p-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{m.name}</p>
                        <p className="text-xs text-gray-500">
                          {m.handicapIndex != null ? `Index ${m.handicapIndex}` : 'No index'}
                        </p>
                      </div>
                      <button
                        onClick={() => removeMember(m)}
                        className="shrink-0 text-sm text-red-600 hover:text-red-800 px-2 py-1"
                      >
                        Remove
                      </button>
                    </div>
                  ));
                })()}
              </div>
            </>
          )}
          {missingCount > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              {missingCount} member{missingCount !== 1 ? 's' : ''} no longer on your roster.
            </p>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Add players</h2>
            <button
              onClick={() => router.push('/pool/roster')}
              className="text-sm text-green-700 hover:text-green-900 font-medium"
            >
              Full roster manager
            </button>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search your saved players…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 mb-2"
          />
          {addable.length === 0 ? (
            <p className="text-sm text-gray-500">
              {query ? 'No matching players not already in the group.' : 'Everyone on your roster is already in this group.'}
            </p>
          ) : (
            <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
              {addable.map((r) => (
                <button
                  key={r.id}
                  disabled={adding}
                  onClick={() => addMember(r)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-gray-900">{r.name}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      {r.handicapIndex != null ? r.handicapIndex : '—'}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-green-700 font-medium">+ Add</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Format picker for "Start casual round" when the group has formats. */}
      {showFormatPicker && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 z-50" onClick={() => setShowFormatPicker(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Pick a format</h3>
              <button onClick={() => setShowFormatPicker(false)} className="text-sm text-gray-500 hover:text-gray-800">Cancel</button>
            </div>
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {groupFormats.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { setShowFormatPicker(false); launchCasual(f); }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50"
                >
                  <p className="font-medium text-gray-900">{f.name}</p>
                </button>
              ))}
              <button
                onClick={() => { setShowFormatPicker(false); launchCasual(null); }}
                className="w-full text-left px-4 py-3 hover:bg-gray-50"
              >
                <p className="font-medium text-green-700">New / custom format →</p>
                <p className="text-xs text-gray-500">Start fresh — members loaded, pick settings in the wizard.</p>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
