'use client';

import { useState, useEffect, useRef } from 'react';
import type { CourseSelection, Player } from '@/lib/game-state';
import { parseGhinIndex } from '@/lib/game-state';
import { AddPlayerPanel, type AddedPlayer } from '@/components/add-player-panel';
import { GhinLoginModal } from '@/components/ghin-login-modal';
import { HandicapChip } from '@/components/handicap-chain';
import { getCreatorGhin } from '@/lib/pool-identity';
import { getAccessLevel } from '@/lib/invite-gate';
import { getPoolPlayingHandicap, teeHasRating, teeOptionsForPlayer } from '@/lib/pool-game';
import {
  type RosterPlayer,
  hydrateRoster,
  searchRoster,
  getRoster,
  getRosterPlayerByGhin,
  getRosterPlayerById,
  upsertRosterPlayer,
  refreshRosterHandicaps,
  getOldestHcapRefresh,
} from '@/lib/roster';
import { pickTeeForPlayer, teeRankInPool } from '@/lib/tee-pick';
import { type RosterGroup, type GroupDefaults, hydrateGroups, getGroups, getGroupById, upsertGroup } from '@/lib/roster-groups';
import { POOL_GROUP_SEED_KEY } from '@/lib/group-seed';
import { getToken } from './shared';

export function FieldStep({
  course, players, setPlayers, handicapAllowance, handicapBasis, nine, getGroupDefaults, applyGroupDefaults, onGroupLoaded, preselectedGroupId, formatSeedAppliedRef, nextLabel, onNext,
}: {
  course: CourseSelection | null;
  // Dispatch (not a plain setter): a pasted GHIN list appends several players
  // from one closure, so adds must use the functional form (F-040).
  players: Player[]; setPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  handicapAllowance: number;
  handicapBasis: 'course' | 'index';
  nine: 'front9' | 'back9' | null;
  getGroupDefaults: () => GroupDefaults;
  applyGroupDefaults: (d: GroupDefaults | null) => void;
  onGroupLoaded: (groupId: string) => void;
  /** A group already chosen (e.g. restored from a draft) — its members load automatically
      so the question isn't asked twice. */
  preselectedGroupId?: string;
  /** §5.au: read at group-load time through a ref — the field step is now FIRST, so a prop
      snapshot could be stale when the parent's mount effect consumes the format seed. */
  formatSeedAppliedRef: React.RefObject<boolean>;
  /** What the next step is CALLED. §5.au: the game follows the field. */
  nextLabel: string;
  onNext: () => void;
}) {
  const [rosterQuery, setRosterQuery] = useState('');
  const [rosterResults, setRosterResults] = useState<RosterPlayer[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');

  // Shown when a GHIN call fails (token expired). Re-login, then retry via retryRef.
  const [showLogin, setShowLogin] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);

  // Saved groups (organizer's "home base" rosters + format defaults).
  const [groups, setGroups] = useState<RosterGroup[]>([]);
  const [saveGroupName, setSaveGroupName] = useState('');
  const [groupNote, setGroupNote] = useState('');
  // The group currently loaded as today's roster context. When set, the player
  // picker shows this group's members up top ("who's playing today") and tucks
  // the rest of the roster behind an "Add someone else" toggle — so you pick a
  // day's field FROM the group instead of scrolling the whole saved-player pool.
  const [activeGroupId, setActiveGroupId] = useState('');
  const [showOtherPlayers, setShowOtherPlayers] = useState(false);

  useEffect(() => {
    // Scope the roster to this organizer (owner sees all; others see the shared
    // base roster plus their own saved players).
    hydrateRoster({ viewerGhin: getCreatorGhin(), isOwner: getAccessLevel() === 'full' }).then(async () => {
      setRosterResults(searchRoster(''));
      // Groups share the same viewer scope. Best-effort — fails soft to empty.
      hydrateGroups({ viewerGhin: getCreatorGhin(), isOwner: getAccessLevel() === 'full' })
        .then(() => {
          setGroups(getGroups());
          // A group seed from /home/groups/[id] "Start casual round": load that
          // group now and consume the seed so it applies exactly once. Tees resolve
          // when the course is picked later (§5.au moved the course after the field).
          try {
            const seededGroupId = sessionStorage.getItem(POOL_GROUP_SEED_KEY);
            if (seededGroupId) {
              sessionStorage.removeItem(POOL_GROUP_SEED_KEY);
              // If a format was chosen for this game, load members only — the
              // format seed already set the settings; don't clobber with the
              // group's own default. Read through the ref: this step mounts FIRST
              // now (§5.au), so the parent may consume the format seed after this
              // effect starts but before hydration lands here.
              loadGroup(seededGroupId, { skipDefaults: formatSeedAppliedRef.current });
            } else if (preselectedGroupId && players.length === 0) {
              // Already chosen (a restored draft): load its members now so the group
              // question isn't asked twice; its settings were applied back then.
              // Guarded on an empty field so a user who came Back and edited their
              // player list doesn't get it silently replaced.
              loadGroup(preselectedGroupId, { skipDefaults: true });
            }
          } catch {}
        })
        .catch(() => {});
      // Auto-refresh from GHIN if the roster's handicaps are stale (>24h) or
      // never refreshed — so new games start current without hammering GHIN
      // every time. Manual "Refresh handicaps" is always available too.
      const token = getToken();
      if (!token) return;
      const oldest = getOldestHcapRefresh();
      const staleMs = 24 * 60 * 60 * 1000;
      const isStale = oldest === null || (Date.now() - new Date(oldest).getTime()) > staleMs;
      if (!isStale) return;
      setRefreshing(true);
      setRefreshNote('Refreshing handicaps from GHIN…');
      try {
        const changed = await refreshRosterHandicaps(token);
        setRosterResults(searchRoster(rosterQuery));
        setRefreshNote(changed > 0 ? `Updated ${changed} handicap${changed === 1 ? '' : 's'} from GHIN.` : 'Handicaps up to date.');
      } catch {
        setRefreshNote('Could not refresh from GHIN — using saved handicaps.');
      } finally {
        setRefreshing(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshRoster(query: string) {
    setRosterQuery(query);
    setRosterResults(searchRoster(query));
  }

  // Above this size, loading a group pre-checks NOBODY: the group becomes the
  // list you pick today's field FROM, not the field itself. At 61 members,
  // picking 12 by unchecking 49 is the wrong direction (Craig, 2026-09-10).
  // 8 = up to two foursomes — a small crew that loads a group almost always
  // means "we're all playing". The threshold is a judgment call; adjust freely.
  const GROUP_PRECHECK_MAX = 8;

  // Load a group: make it today's roster context (members listed up top) and,
  // unless skipDefaults, apply the group's saved format defaults. Small groups
  // (≤ GROUP_PRECHECK_MAX) also REPLACE today's field with all members
  // pre-checked; larger groups load with nobody checked, so the day's field is
  // picked BY checking. skipDefaults is used when a specific FORMAT was
  // chosen for this game (group page's format picker): the format seed already
  // applied the settings on mount, so re-applying the group's OWN baked-in
  // default here would clobber the chosen format. Members still load either way.
  function loadGroup(groupId: string, opts?: { skipDefaults?: boolean }) {
    // Prefer the group cache (populated by hydrateGroups) over the `groups`
    // React state, so a seed can load a group in the same tick hydration
    // finishes — before setGroups has re-rendered. Falls back to state.
    const group = getGroupById(groupId) ?? groups.find((g) => g.id === groupId);
    if (!group) return;
    const precheck = group.playerIds.length <= GROUP_PRECHECK_MAX;
    const loaded: Player[] = [];
    let missing = 0;
    if (precheck) {
      for (const pid of group.playerIds) {
        const rp = getRosterPlayerById(pid);
        if (!rp) { missing++; continue; }
        loaded.push({
          id: rp.id,
          name: rp.name,
          handicapIndex: rp.handicapIndex,
          gender: rp.gender ?? undefined,
          ghinNumber: rp.ghinNumber ?? undefined,
          teeSetId: pickTeeForPlayer(course, rp.gender ?? undefined, rp.defaultTeeName, rp.defaultTeeRank),
        });
      }
    }
    setPlayers(loaded);
    if (!opts?.skipDefaults) applyGroupDefaults(group.defaults);
    onGroupLoaded(groupId);         // stamp the game's sourceGroupId (exact stats link)
    setActiveGroupId(groupId);      // the picker now centers on this group
    setShowOtherPlayers(false);
    setGroupNote(
      precheck
        ? `Loaded “${group.name}” — ${loaded.length} player${loaded.length === 1 ? '' : 's'} pre-selected${missing > 0 ? ` (${missing} no longer on the roster)` : ''}. Uncheck anyone sitting out, or add others below.`
        : `Loaded “${group.name}” (${group.playerIds.length} members). Check who's playing today.`
    );
  }

  // Save the current field + format as a group (new, or overwrite one by the same
  // name in this organizer's scope). Store each player's CANONICAL ROSTER id, not
  // the field id: a GHIN-added field player gets a fresh UUID, but the roster
  // dedupes by GHIN and keeps its own id — so we resolve by GHIN here, else fall
  // back to the field id (matches for manual/no-GHIN adds). Without this, loading
  // the group would miss every GHIN-added player (only their random field id was
  // stored, which no roster row has).
  async function saveAsGroup() {
    const name = saveGroupName.trim();
    if (name.length === 0 || players.length === 0) return;
    const existing = groups.find((g) => g.name.trim().toLowerCase() === name.toLowerCase());
    const rosterIds: string[] = [];
    for (const p of players) {
      const canonical = p.ghinNumber != null ? getRosterPlayerByGhin(p.ghinNumber)?.id : getRosterPlayerById(p.id)?.id;
      const id = canonical ?? p.id;
      if (!rosterIds.includes(id)) rosterIds.push(id); // dedupe (e.g. same person added twice)
    }
    const group: RosterGroup = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      ownerGhin: existing?.ownerGhin ?? getCreatorGhin(),
      playerIds: rosterIds,
      defaults: getGroupDefaults(),
    };
    await upsertGroup(group);
    setGroups(getGroups());
    setSaveGroupName('');
    setGroupNote(`Saved “${name}” — ${players.length} player${players.length === 1 ? '' : 's'}.`);
  }

  const existingGhins = new Set(players.map((p) => p.ghinNumber).filter((g): g is number => g != null));

  function addRosterPlayer(rp: RosterPlayer) {
    if (rp.ghinNumber != null && existingGhins.has(rp.ghinNumber)) return;
    const newPlayer: Player = {
      id: rp.id,
      name: rp.name,
      handicapIndex: rp.handicapIndex,
      gender: rp.gender ?? undefined,
      ghinNumber: rp.ghinNumber ?? undefined,
      teeSetId: pickTeeForPlayer(course, rp.gender ?? undefined, rp.defaultTeeName, rp.defaultTeeRank),
    };
    const nextPlayers = [...players, newPlayer];
    setPlayers(nextPlayers);

    // Auto-refresh: pull this player's current index from GHIN so every new
    // game uses up-to-date handicaps. Non-blocking — updates in place on return.
    const token = getToken();
    if (token && rp.ghinNumber != null) {
      fetch('/api/ghin/golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ghin_number: rp.ghinNumber }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const hi = parseGhinIndex(data?.golfer?.handicap_index ?? data?.golfer?.hi_value);
          if (hi === null || hi === rp.handicapIndex) return;
          setPlayers(nextPlayers.map((p) => (p.id === rp.id ? { ...p, handicapIndex: hi } : p)));
          upsertRosterPlayer({ ...rp, handicapIndex: hi });
        })
        .catch(() => { /* keep the cached index on any failure */ });
    }
  }

  async function doRefreshRoster() {
    const token = getToken();
    if (!token) { setRefreshNote('Log in via the Course step to refresh from GHIN.'); return; }
    setRefreshing(true);
    setRefreshNote('');
    try {
      const count = await refreshRosterHandicaps(token);
      refreshRoster(rosterQuery);
      // Reflect any updated indexes on players already in this field.
      const updated = getRoster();
      setPlayers(players.map((p) => {
        const rp = updated.find((r) => r.ghinNumber != null && r.ghinNumber === p.ghinNumber);
        return rp && rp.handicapIndex != null ? { ...p, handicapIndex: rp.handicapIndex } : p;
      }));
      setRefreshNote(count > 0 ? `Updated ${count} handicap${count === 1 ? '' : 's'} from GHIN.` : 'Handicaps already current.');
    } catch {
      setRefreshNote('Refresh failed — check your connection.');
    } finally {
      setRefreshing(false);
    }
  }

  // One handler for every AddPlayerPanel path (search / GHIN list / manual):
  // build the Player (remembered tee where we know the GHIN), keep the roster
  // in sync, and append to today's field. Functional setPlayers because a
  // pasted GHIN list adds several players inside one closure (F-040).
  function addResolvedPlayer(info: AddedPlayer) {
    const rememberedRp = info.ghinNumber != null ? getRosterPlayerByGhin(info.ghinNumber) : null;
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      name: info.name,
      handicapIndex: info.handicapIndex,
      gender: info.gender,
      ghinNumber: info.ghinNumber ?? undefined,
      teeSetId: pickTeeForPlayer(course, info.gender, rememberedRp?.defaultTeeName ?? null, rememberedRp?.defaultTeeRank),
    };
    setPlayers((prev) => [...prev, newPlayer]);
    upsertRosterPlayer({
      id: newPlayer.id,
      ghinNumber: info.ghinNumber,
      name: info.name,
      handicapIndex: info.handicapIndex,
      gender: info.gender,
      defaultTeeName: null,
    });
    refreshRoster(rosterQuery);
  }

  function removePlayer(id: string) {
    setPlayers(players.filter((p) => p.id !== id));
  }

  function changePlayerTee(id: string, teeSetId: number) {
    setPlayers(players.map((p) => (p.id === id ? { ...p, teeSetId } : p)));
    // Remember this tee for next time — by NAME (exact) and by RELATIVE RANK
    // (cross-course fallback), so their usual tee follows them to other courses.
    const player = players.find((p) => p.id === id);
    const teeName = course?.teeSets.find((t) => t.id === teeSetId)?.name;
    if (player && teeName) {
      upsertRosterPlayer({
        id: player.id,
        ghinNumber: player.ghinNumber ?? null,
        name: player.name,
        handicapIndex: player.handicapIndex,
        gender: player.gender ?? null,
        defaultTeeName: teeName,
        defaultTeeRank: teeRankInPool(course, player.gender ?? undefined, teeSetId),
      });
    }
  }

  const fieldIds = new Set(players.map((p) => p.id));

  const canProceed = players.length >= 2;

  return (
    <div>
      <GhinLoginModal
        open={showLogin}
        onCloseAction={() => setShowLogin(false)}
        onDoneAction={() => { setShowLogin(false); const r = retryRef.current; retryRef.current = null; r?.(); }}
      />
      {/* §5.au: the field is the FIRST step — nothing to go back to. */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Who&apos;s playing? ({players.length})</h2>

      {/* Groups — asked FIRST (§5.au), as chips rather than a dropdown+Load: a group answers
          three questions at once (its people, its stakes, its formats) and one tap turns the
          later steps into confirmations. The old buried dropdown is why only 7 of 44 real
          games carried a sourceGroupId. */}
      {groups.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <p className="text-sm font-semibold text-gray-800 mb-1">Your groups</p>
          <p className="text-xs text-gray-500 mb-2">
            Tap one to start from its people and usual setup. You can change anything after.
          </p>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => {
              const active = activeGroupId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => loadGroup(g.id)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium min-h-[44px] ${
                    active
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                  }`}
                >
                  {g.name}
                  <span className={`ml-1.5 text-xs ${active ? 'text-green-100' : 'text-gray-400'}`}>
                    {g.playerIds.length}
                  </span>
                </button>
              );
            })}
          </div>
          {groupNote && <p className="text-xs text-green-700 mt-2">{groupNote}</p>}
        </div>
      )}

      {/* Saved roster — alphabetical checklist, tap to add/remove today's field */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-800">
            Choose who&apos;s playing
            <span className="ml-2 text-xs font-normal text-gray-500">{players.length} selected</span>
          </p>
          <div className="flex items-center gap-3">
            {(players.length > 0 || activeGroupId) && (
              <button
                onClick={() => { setPlayers([]); setActiveGroupId(''); setShowOtherPlayers(false); setGroupNote(''); }}
                className="text-xs text-gray-500 hover:text-red-600 font-medium"
                title="Deselect everyone, clear the loaded group, and start fresh"
              >
                Clear
              </button>
            )}
            <button
              onClick={doRefreshRoster}
              disabled={refreshing}
              className="text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-50"
              title="Re-pull current handicap indexes from GHIN for all saved players"
            >
              {refreshing ? 'Refreshing…' : '↻ Refresh handicaps'}
            </button>
          </div>
        </div>
        {refreshNote && <p className="text-xs text-gray-500 mb-2">{refreshNote}</p>}
        <input
          type="text"
          value={rosterQuery}
          onChange={(e) => refreshRoster(e.target.value)}
          placeholder="Filter by name…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        {(() => {
          // Reusable row renderer so the group section and the "everyone else"
          // section look identical.
          const row = (rp: RosterPlayer) => {
            const inField = fieldIds.has(rp.id);
            return (
              <li key={rp.id}>
                <button
                  onClick={() => (inField ? removePlayer(rp.id) : addRosterPlayer(rp))}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 ${inField ? 'bg-green-50' : ''}`}
                >
                  <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${inField ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white'}`}>
                    {inField ? '✓' : ''}
                  </span>
                  <span className="flex-1 font-medium text-gray-900">{rp.name}</span>
                  <span className="text-xs text-gray-500">
                    {rp.handicapIndex ?? '—'}{rp.gender ? ` · ${rp.gender}` : ''}
                  </span>
                </button>
              </li>
            );
          };

          if (rosterResults.length === 0) {
            return <p className="mt-2 text-xs text-gray-500">No saved players{rosterQuery ? ' match' : ' yet'}. Search by name or add manually below.</p>;
          }

          // When a group is loaded, split the roster into that group's members
          // (shown up top — "who's playing today") and everyone else (collapsed
          // behind a toggle). No active group → the plain full list as before.
          const activeGroup = activeGroupId ? groups.find((g) => g.id === activeGroupId) : null;
          if (!activeGroup) {
            return (
              <ul className="mt-2 max-h-80 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-100">
                {rosterResults.map(row)}
              </ul>
            );
          }
          const memberIds = new Set(activeGroup.playerIds);
          const members = rosterResults.filter((rp) => memberIds.has(rp.id));
          const others = rosterResults.filter((rp) => !memberIds.has(rp.id));
          return (
            <div className="mt-2 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{activeGroup.name} · {members.length}</p>
              <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-100">
                {members.length > 0 ? members.map(row) : <li className="px-3 py-2 text-xs text-gray-500">No group members match this filter.</li>}
              </ul>
              <button
                type="button"
                onClick={() => setShowOtherPlayers((v) => !v)}
                className="text-xs font-medium text-green-700 hover:text-green-900"
              >
                {showOtherPlayers ? '▾ Hide other players' : `▸ Add someone else (${others.length})`}
              </button>
              {showOtherPlayers && (
                <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-100">
                  {others.length > 0 ? others.map(row) : <li className="px-3 py-2 text-xs text-gray-500">Everyone else is already in the field or filtered out.</li>}
                </ul>
              )}
            </div>
          );
        })()}
      </div>

      {/* F-040 option B: the shared add-player stack — name search first, manual
          second (with the no-GHIN note), GHIN numbers behind a disclosure that
          takes a pasted list. */}
      <AddPlayerPanel
        existingGhins={existingGhins}
        getTokenAction={getToken}
        onNeedLoginAction={(retry) => { retryRef.current = retry; setShowLogin(true); }}
        onAddAction={addResolvedPlayer}
      />

      {/* Field list */}
      {players.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
          <ul className="divide-y divide-gray-200">
            {players.map((player) => {
              const courseHcap = course ? Math.round(getPoolPlayingHandicap(player, course, handicapAllowance, handicapBasis, nine)) : null;
              return (
                <li key={player.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {player.name}
                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${player.gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                          {player.gender || 'M'}
                        </span>
                      </p>
                      <p className="text-sm text-gray-500">
                        Index: {player.handicapIndex ?? 'N/A'}
                        {/* F-023: when this tee has no usable slope/rating the number is the raw
                            index, not a course handicap — SAY so instead of printing a confident
                            "Course HCP" that's wrong on any course whose slope is far from 113.
                            The 'index' basis skips the conversion on purpose, so no warning there.
                            Both chips open the F-043 chain (index → CH → allowance → plays off). */}
                        {courseHcap !== null && (handicapBasis === 'index' || teeHasRating(player, course!) ? (
                          <HandicapChip
                            player={player}
                            course={course}
                            allowance={handicapAllowance}
                            basis={handicapBasis}
                            nine={nine}
                            chipClassName="ml-2 text-green-700"
                          >
                            Course HCP: {courseHcap}
                          </HandicapChip>
                        ) : (
                          <HandicapChip
                            player={player}
                            course={course}
                            allowance={handicapAllowance}
                            basis={handicapBasis}
                            nine={nine}
                            chipClassName="ml-2 text-amber-700 text-left"
                          >
                            no slope/rating on this tee — using index ({courseHcap})
                          </HandicapChip>
                        ))}
                      </p>
                    </div>
                    <button onClick={() => removePlayer(player.id)} className="text-red-500 hover:text-red-700 text-sm">
                      Remove
                    </button>
                  </div>
                  {course && course.teeSets.length > 1 && (
                    <div className="mt-2">
                      <select
                        value={player.teeSetId || ''}
                        onChange={(e) => changePlayerTee(player.id, Number(e.target.value))}
                        className="text-sm rounded-md border border-gray-300 px-2 py-1 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                      >
                        {teeOptionsForPlayer(course, player).map((ts) => (
                          <option key={ts.id} value={ts.id}>
                            {ts.name} ({ts.totalYardage} yds)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Save today's field as a group — kept below the list, where the field it saves is
          visible. (The Load half of the old Groups box became the chips up top — §5.au.) */}
      {players.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={saveGroupName}
              onChange={(e) => setSaveGroupName(e.target.value)}
              placeholder="Save current field as…"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={saveAsGroup}
              disabled={saveGroupName.trim().length === 0}
              className="rounded-md border border-green-700 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: {nextLabel}
      </button>
    </div>
  );
}

