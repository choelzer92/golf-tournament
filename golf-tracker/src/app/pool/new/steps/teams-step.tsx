'use client';

import { useEffect } from 'react';
import type { CourseSelection, Player } from '@/lib/game-state';
import {
  type PoolGame,
  type PoolTeam,
  getPoolPlayingHandicap,
  balanceTeamsWithCaptains,
  captainsDealTeams,
  balanceTeamsWithLocks,
  pickCaptains,
  sortPlayerIdsByHcap,
  orderPlayerIdsWithCaptain,
  teeOptionsForPlayer,
} from '@/lib/pool-game';
import { upsertRosterPlayer } from '@/lib/roster';
import { PairingLocks } from '@/components/pairing-locks';
import { CaptainsPanel } from '@/components/captains-panel';
import { TeeTimePicker } from '@/components/tee-time-picker';
import { HandicapChip } from '@/components/handicap-chain';

function makeTeam(index: number, playerIds: string[], captainId?: string): PoolTeam {
  return {
    id: crypto.randomUUID(),
    name: `Team ${index + 1}`,
    playerIds,
    matchupId: crypto.randomUUID(),
    teeTime: '',
    captainId,
  };
}

// F-019: the proposed TEE SHEET for a side game — who walks with whom, before anyone says a word
// about money. `groupShapesFor` supplies the shape (8 → 4+4, 7 → 4+3, 5 → 3+2, and never a group
// of five), and the field is dealt into it low→high so the groups are balanced by handicap. §5.ao:
// the app proposes, the organizer adjusts.
//
// Named "Group N" rather than "Team N" because on this axis they are not teams — the money teams
// are the sides, and calling both "team" is exactly the conflation F-019 is about (§5.al).
export function TeamsStep({
  course, players, setPlayers, teams, setTeams, lockedGroups, setLockedGroups, captainIds, setCaptainIds,
  excludeCaptains, setExcludeCaptains, useCaptains, setUseCaptains, teamBuild, setTeamBuild, handicapAllowance, handicapBasis, nine, onNext, onBack,
}: {
  course: CourseSelection | null;
  players: Player[]; setPlayers: (p: Player[]) => void;
  teams: PoolTeam[]; setTeams: (t: PoolTeam[]) => void;
  lockedGroups: string[][]; setLockedGroups: (g: string[][]) => void;
  captainIds: string[]; setCaptainIds: (ids: string[]) => void;
  excludeCaptains: boolean; setExcludeCaptains: (v: boolean) => void;
  useCaptains: boolean; setUseCaptains: (v: boolean) => void;
  teamBuild: PoolGame['teamBuild']; setTeamBuild: (b: PoolGame['teamBuild']) => void;
  handicapAllowance: number;
  handicapBasis: 'course' | 'index';
  nine: 'front9' | 'back9' | null;
  onNext: () => void; onBack: () => void;
}) {
  function hcapOf(p: Player): number {
    return course ? getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis, nine) : (p.handicapIndex ?? 0);
  }

  const numTeams = Math.max(1, Math.ceil(players.length / 4));

  // Auto-pick captains (lowest course handicaps, honoring locks) whenever the
  // field or team count changes and no captains have been set yet. Prunes any
  // captain who left the field. The organizer can still reassign any slot.
  useEffect(() => {
    if (!useCaptains) return; // no captains this game — skip auto-pick entirely
    const present = new Set(players.map((p) => p.id));
    const kept = captainIds.filter((id) => id && present.has(id));
    const needsAutopick = kept.length === 0 && players.length >= numTeams;
    if (needsAutopick) {
      const picks = pickCaptains(players, course, handicapAllowance, numTeams, lockedGroups, handicapBasis);
      setCaptainIds(Array.from({ length: numTeams }, (_, i) => picks[i] ?? ''));
    } else if (kept.length !== captainIds.length || captainIds.length !== numTeams) {
      // Trim/pad to numTeams and drop departed players, preserving existing picks.
      const deduped: string[] = [];
      for (const id of kept) if (!deduped.includes(id)) deduped.push(id);
      setCaptainIds(Array.from({ length: numTeams }, (_, i) => deduped[i] ?? ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, numTeams]);

  function changePlayerTee(id: string, teeSetId: number) {
    setPlayers(players.map((p) => (p.id === id ? { ...p, teeSetId } : p)));
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
      });
    }
  }

  // The lowest course handicap on a team becomes its captain when we don't have
  // an explicit pick for the slot (e.g. plain auto-generate).
  function lowestHcapId(ids: string[]): string | undefined {
    return sortPlayerIdsByHcap(ids, players, course, handicapAllowance, handicapBasis)[0];
  }

  // Flag the current build as hand-adjusted after a move/make-captain, so the
  // read-only summary reads "hand-adjusted after". Nothing built yet → 'manual'.
  function markAdjusted() {
    setTeamBuild({ ...(teamBuild ?? { method: 'manual' }), adjustedAfter: true });
  }

  // Auto-generate: sequential foursomes, each sorted low->high, lowest = captain.
  function autoGenerate() {
    const groups: string[][] = [];
    for (let i = 0; i < players.length; i += 4) {
      groups.push(players.slice(i, i + 4).map((p) => p.id));
    }
    setTeams(groups.map((ids, i) => {
      const sorted = sortPlayerIdsByHcap(ids, players, course, handicapAllowance, handicapBasis);
      return makeTeam(i, sorted, useCaptains ? sorted[0] : undefined);
    }));
    setTeamBuild({ method: 'sequential', adjustedAfter: false });
  }

  // Auto-balance the field into even-handicap teams, honoring pairing locks.
  // With captains ON: each captain anchors a slot and the rest balance around
  // them (captain-first ordering). With captains OFF: plain even balance, no
  // captain role at all — each team just listed low->high.
  // Captains' deal (§5.ay) — kept separate from autoBalance() rather than folded in
  // behind a flag, because the two answer different questions: autoBalance minimizes
  // team-handicap spread (exact branch-and-bound), while this deals positionally so an
  // organizer can explain and verify it. Both are legitimate; neither replaces the other.
  function autoCaptainsDeal() {
    const captainByTeam = Array.from({ length: numTeams }, (_, i) =>
      useCaptains ? (captainIds[i] || undefined) : undefined);
    const groups = captainsDealTeams(players, numTeams, course, handicapAllowance, captainByTeam, lockedGroups, handicapBasis, nine);
    setTeams(groups.map((ids, i) => {
      const capId = captainByTeam[i] && ids.includes(captainByTeam[i]!) ? captainByTeam[i] : undefined;
      // Display lowest-to-highest handicap, same as every other build method. I'd first
      // kept the raw deal order to make it verifiable, but being the one team
      // list in the app that reads differently is more confusing than that is useful.
      const ordered = capId
        ? orderPlayerIdsWithCaptain(ids, capId, players, course, handicapAllowance, handicapBasis)
        : sortPlayerIdsByHcap(ids, players, course, handicapAllowance, handicapBasis);
      return makeTeam(i, ordered, capId);
    }));
    setTeamBuild({
      method: 'serpentine',
      excludeCaptains: false,
      hadCaptains: useCaptains,
      hadLocks: lockedGroups.some((g) => g.length >= 2),
      adjustedAfter: false,
    });
  }

  function autoBalance() {
    if (!useCaptains) {
      const groups = balanceTeamsWithLocks(players, numTeams, hcapOf, lockedGroups);
      setTeams(groups.map((ids, i) => {
        const ordered = sortPlayerIdsByHcap(ids, players, course, handicapAllowance, handicapBasis);
        return makeTeam(i, ordered); // no captainId
      }));
      setTeamBuild({
        method: 'balanced',
        excludeCaptains: false,
        hadCaptains: false,
        hadLocks: lockedGroups.some((g) => g.length >= 2),
        adjustedAfter: false,
      });
      return;
    }
    const captainByTeam = Array.from({ length: numTeams }, (_, i) => captainIds[i] || undefined);
    const groups = balanceTeamsWithCaptains(players, numTeams, hcapOf, captainByTeam, lockedGroups, excludeCaptains);
    setTeams(groups.map((ids, i) => {
      const captainId = captainByTeam[i] && ids.includes(captainByTeam[i]!) ? captainByTeam[i] : lowestHcapId(ids);
      const ordered = orderPlayerIdsWithCaptain(ids, captainId, players, course, handicapAllowance, handicapBasis);
      return makeTeam(i, ordered, captainId);
    }));
    // Snapshot the settings used, so the read-only summary reflects the actual
    // build rather than the live toggle later.
    setTeamBuild({
      method: 'balanced',
      excludeCaptains,
      hadCaptains: captainByTeam.some(Boolean),
      hadLocks: lockedGroups.some((g) => g.length >= 2),
      adjustedAfter: false,
    });
  }

  function movePlayer(playerId: string, fromTeamId: string, toTeamId: string) {
    if (fromTeamId === toTeamId) return;
    setTeams(teams.map((t) => {
      if (t.id === fromTeamId) {
        const remaining = t.playerIds.filter((id) => id !== playerId);
        // If the captain left, the next-lowest handicap takes over the slot.
        const captainId = t.captainId === playerId ? sortPlayerIdsByHcap(remaining, players, course, handicapAllowance, handicapBasis)[0] : t.captainId;
        return { ...t, playerIds: remaining, captainId };
      }
      if (t.id === toTeamId) {
        return { ...t, playerIds: orderPlayerIdsWithCaptain([...t.playerIds, playerId], t.captainId, players, course, handicapAllowance, handicapBasis) };
      }
      return t;
    }));
    markAdjusted();
  }

  // Make a player the captain of their team (moves them to the top of the list).
  // Also mirrors the pick into the captainIds slot for that team so the Captains
  // panel stays in sync.
  function makeCaptain(teamId: string, playerId: string) {
    const idx = teams.findIndex((t) => t.id === teamId);
    setTeams(teams.map((t) => (
      t.id === teamId
        ? { ...t, captainId: playerId, playerIds: orderPlayerIdsWithCaptain(t.playerIds, playerId, players, course, handicapAllowance, handicapBasis) }
        : t
    )));
    if (idx >= 0) {
      const next = [...captainIds];
      // Drop this player from any other slot, then set this team's slot.
      for (let i = 0; i < next.length; i++) if (next[i] === playerId) next[i] = '';
      next[idx] = playerId;
      setCaptainIds(next);
    }
    markAdjusted();
  }

  function renameTeam(teamId: string, newName: string) {
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, name: newName } : t)));
  }

  function setTeeTime(teamId: string, teeTime: string) {
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, teeTime } : t)));
  }

  // Reorder teams (send-out order): move one team up or down the list.
  function moveTeam(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= teams.length) return;
    const next = [...teams];
    [next[index], next[j]] = [next[j], next[index]];
    setTeams(next);
  }

  // Order teams by tee time (blank times sink to the bottom).
  function sortTeamsByTeeTime() {
    const next = [...teams].sort((a, b) => {
      const ta = (a.teeTime || '').trim(), tb = (b.teeTime || '').trim();
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return ta.localeCompare(tb);
    });
    setTeams(next);
  }

  function addTeam() {
    setTeams([...teams, makeTeam(teams.length, [])]);
  }

  function removeTeam(teamId: string) {
    const removed = teams.find((t) => t.id === teamId);
    if (!removed) return;
    const remaining = teams.filter((t) => t.id !== teamId);
    // Push orphaned players onto the first remaining team (if any).
    if (removed.playerIds.length > 0 && remaining.length > 0) {
      remaining[0] = { ...remaining[0], playerIds: sortPlayerIdsByHcap([...remaining[0].playerIds, ...removed.playerIds], players, course, handicapAllowance, handicapBasis) };
    }
    setTeams(remaining);
  }

  const assignedIds = new Set(teams.flatMap((t) => t.playerIds));
  const unassigned = players.filter((p) => !assignedIds.has(p.id));

  function teamCombinedHcap(team: PoolTeam): number {
    return team.playerIds.reduce((sum, id) => {
      const p = players.find((x) => x.id === id);
      return p ? sum + hcapOf(p) : sum;
    }, 0);
  }

  const canProceed = teams.length > 0 && teams.some((t) => t.playerIds.length > 0) && unassigned.length === 0;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Set Teams</h2>

      {/* Team-building style: captains (default) vs plain balance by handicap. */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">Team Building</p>
        <div className="flex gap-2">
          {([
            { v: true, label: 'Use captains' },
            { v: false, label: 'No captains' },
          ] as const).map(({ v, label }) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setUseCaptains(v)}
              className={`flex-1 min-h-[44px] rounded-md border px-3 py-2.5 text-sm font-medium ${
                useCaptains === v
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {useCaptains
            ? 'Each team gets a captain (lowest handicaps by default); the rest balance around them.'
            : 'Teams are balanced by handicap with no captain role.'}
        </p>
      </div>

      {/* Captains — the primary way to build teams. One captain per team (lowest
          course handicaps by default), each anchoring an even balance around
          them. The apply button lives in the panel. */}
      {useCaptains && (
      <div className="mb-4">
        <CaptainsPanel
          players={players}
          course={course}
          handicapAllowance={handicapAllowance}
          handicapBasis={handicapBasis}
          nine={nine}
          numTeams={numTeams}
          captainIds={captainIds}
          setCaptainIdsAction={setCaptainIds}
          excludeCaptains={excludeCaptains}
          setExcludeCaptainsAction={setExcludeCaptains}
          onApplyAction={autoBalance}
        />
      </div>
      )}

      {/* Pairing locks — keep chosen players on the same team through balancing.
          Applying the lock IS auto-balance (around captains), wired right into
          the box so it's one obvious action. */}
      <div className="mb-4">
        <PairingLocks
          players={players}
          lockedGroups={lockedGroups}
          setLockedGroupsAction={setLockedGroups}
          onApplyAction={autoBalance}
        />
      </div>

      {/* ONE QUESTION, not three rival buttons. Each method is a different GOAL, so the
          consequence is spelled out rather than the mechanism — "evens out the totals"
          vs "you can check it by eye". The captains toggle stays separate above: it's
          orthogonal (any method runs with or without captains), and folding it in would
          multiply the options. */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <p className="text-sm font-medium text-gray-800 mb-1">How should teams be built?</p>
        <p className="text-xs text-gray-500 mb-3">Pick one to build them now — you can still move anyone by hand afterwards.</p>
        <div className="space-y-2">
          {([
            {
              key: 'optimal',
              label: useCaptains ? 'Even them out around the captains' : 'Even them out by handicap',
              detail: 'Searches for the closest possible team totals. The fairest result, but the assignment is hard to explain.',
              run: autoBalance,
            },
            {
              key: 'deal',
              label: 'Captains’ deal',
              detail: 'Each round the best captain takes the worst remaining player, down to the worst captain taking the best. Slightly less even, but your group can watch it happen.',
              run: autoCaptainsDeal,
            },
            {
              key: 'sequential',
              label: 'Straight down the list',
              detail: 'Foursomes in the order players were added. No balancing at all — for when the groups are already decided.',
              run: autoGenerate,
            },
          ] as const).map(({ key, label, detail, run }) => (
            <button
              key={key}
              type="button"
              onClick={run}
              className="w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-left hover:border-green-400"
            >
              <span className="block text-sm font-medium text-gray-800">{label}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{detail}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Or drag nobody at all — assign every player by hand below.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        <button
          onClick={addTeam}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 font-medium hover:bg-gray-100"
        >
          + Add team
        </button>
        {teams.length > 1 && (
          <button
            onClick={sortTeamsByTeeTime}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 font-medium hover:bg-gray-100"
          >
            Order by tee time
          </button>
        )}
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4">
          <p className="text-sm text-amber-800 font-medium mb-1">
            Unassigned ({unassigned.length}) — generate teams or add them below
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <span key={p.id} className="rounded-full bg-white border border-amber-300 px-2 py-0.5 text-xs text-amber-800">
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {teams.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center text-gray-500 mb-4">
          <p className="text-sm">No teams yet. Use a button above to build foursomes.</p>
        </div>
      ) : (
        <div className="grid gap-3 mb-4 sm:grid-cols-2">
          {teams.map((team, teamIdx) => (
            <div key={team.id} className="bg-white rounded-lg shadow p-3">
              <div className="flex items-center gap-2 mb-2">
                {/* Reorder controls — the order teams are sent out in */}
                <div className="flex flex-col leading-none">
                  <button
                    onClick={() => moveTeam(teamIdx, -1)}
                    disabled={teamIdx === 0}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs"
                    title="Move team up"
                  >▲</button>
                  <button
                    onClick={() => moveTeam(teamIdx, 1)}
                    disabled={teamIdx === teams.length - 1}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs"
                    title="Move team down"
                  >▼</button>
                </div>
                <input
                  type="text"
                  value={team.name}
                  onChange={(e) => renameTeam(team.id, e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-semibold shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <button
                  onClick={() => removeTeam(team.id)}
                  className="text-red-500 hover:text-red-700 text-sm px-1"
                  title="Remove team"
                >
                  &times;
                </button>
              </div>

              <div className="mb-2">
                <label className="block text-xs text-gray-500 mb-1">Tee time</label>
                <TeeTimePicker value={team.teeTime || ''} onChangeAction={(v) => setTeeTime(team.id, v)} />
              </div>

              <p className="text-xs text-gray-500 mb-2">
                {team.playerIds.length} player{team.playerIds.length === 1 ? '' : 's'}
                {course ? ` · combined HCP ${Math.round(teamCombinedHcap(team))}` : ''}
              </p>

              <ul className="space-y-1">
                {team.playerIds.map((pid) => {
                  const p = players.find((x) => x.id === pid);
                  if (!p) return null;
                  const hcap = course ? Math.round(hcapOf(p)) : null;
                  const isCaptain = team.captainId === pid;
                  return (
                    <li key={pid} className={`rounded px-2 py-2 ${isCaptain ? 'bg-green-50 ring-1 ring-green-200' : 'bg-gray-50'}`}>
                      {/* Line 1: who + their course handicap. The chip opens the F-043 chain
                          (index → CH → allowance → plays off) — flex-wrap so the panel drops
                          to its own line under the name. */}
                      <div className="flex flex-wrap items-center gap-2">
                        {isCaptain && (
                          <span className="flex-shrink-0 rounded-full bg-green-700 text-white text-[10px] font-bold px-1.5 py-0.5" title="Captain">C</span>
                        )}
                        <span className="text-sm font-medium text-gray-900 truncate min-w-0 flex-1">{p.name}</span>
                        {hcap !== null && (
                          <HandicapChip
                            player={p}
                            course={course}
                            allowance={handicapAllowance}
                            basis={handicapBasis}
                            nine={nine}
                          />
                        )}
                      </div>
                      {/* Line 2: clearly-labeled controls with real tap targets */}
                      <div className="mt-1.5 flex items-end gap-2 flex-wrap">
                        {useCaptains && !isCaptain && (
                          <button
                            onClick={() => makeCaptain(team.id, pid)}
                            className="rounded-md border border-green-600 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                            title="Make this player the team captain"
                          >
                            Make captain
                          </button>
                        )}
                        {teams.length > 1 && (
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Move to</span>
                            <select
                              value={team.id}
                              onChange={(e) => movePlayer(pid, team.id, e.target.value)}
                              className="text-sm rounded-md border border-gray-300 px-2 py-1 shadow-sm focus:border-green-500 focus:outline-none bg-white"
                              title="Move this player to another team"
                            >
                              {teams.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        {course && course.teeSets.length > 1 && (
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tee</span>
                            <select
                              value={p.teeSetId ?? ''}
                              onChange={(e) => changePlayerTee(pid, Number(e.target.value))}
                              className="text-sm rounded-md border border-gray-300 px-2 py-1 shadow-sm focus:border-green-500 focus:outline-none bg-white"
                              title="Tee"
                            >
                              {teeOptionsForPlayer(course, p).map((ts) => (
                                <option key={ts.id} value={ts.id}>{ts.name}</option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    </li>
                  );
                })}
                {team.playerIds.length === 0 && (
                  <li className="text-xs text-gray-400 px-2 py-1">Empty — move players here.</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Review &amp; Create
      </button>
    </div>
  );
}

// Within-group SIDES: assign the group's players to a side. Seeded from a balanced default
// (low+high vs the two middle) at two sides, which is the norm — three or more is available for
// the groups that want it (DECISIONS.md 5.g) without making the usual 2v2 any harder to set up.
