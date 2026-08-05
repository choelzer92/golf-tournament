'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { hydrateGroups, getGroupById, addGroupMember, removeGroupMember, type RosterGroup } from '@/lib/roster-groups';
import { hydrateRoster, searchRoster, getRosterPlayerById, type RosterPlayer } from '@/lib/roster';
import { getAccessLevel } from '@/lib/invite-gate';
import { getCreatorGhin } from '@/lib/pool-identity';
import { POOL_GROUP_SEED_KEY, TOURNAMENT_GROUP_SEED_KEY } from '@/lib/group-seed';

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
        setResults(searchRoster(''));
        setReady(true);
      })
      .catch(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, router]);

  function startCasualRound() {
    sessionStorage.setItem(POOL_GROUP_SEED_KEY, groupId);
    router.push('/pool/new');
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
          <button
            onClick={() => router.push(`/home/stats?group=${group.id}`)}
            className="w-full text-left bg-white rounded-lg shadow p-3 hover:shadow-md transition mb-2"
          >
            <p className="font-medium text-gray-900 text-sm">Money &amp; standings for this group →</p>
          </button>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Start something with this group</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={startCasualRound}
              className="flex-1 rounded-lg bg-green-700 px-6 py-5 text-white text-left hover:bg-green-800 shadow-md"
            >
              <p className="font-bold text-lg">Casual round</p>
              <p className="text-sm text-green-100 mt-0.5">Members and this group’s saved settings pre-loaded.</p>
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

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Members ({members.length})
          </h2>
          {members.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
              No members yet. Add players below.
            </p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
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
              ))}
            </div>
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
    </div>
  );
}
