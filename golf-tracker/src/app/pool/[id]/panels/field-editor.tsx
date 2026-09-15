'use client';

import { useState, useEffect, useMemo } from 'react';
import { type Player, type TeeSetOption, parseGhinIndex, type GameScore } from '@/lib/game-state';
import { type PoolGame, type PoolTeam, getPoolPlayingHandicap, gameNineBasis, balanceTeamsWithCaptains, captainsDealTeams, balanceTeamsWithLocks, pickCaptains, sortPlayerIdsByHcap, groupShapesFor, groupShapeLabel, dealBalancedIntoShape, TEE_GROUP_SHAPE_OPTS, orderPlayerIdsWithCaptain, teeOptionsForPlayer, playerTeeGenderMismatch, rankSwapCandidates, teamHandicapSpread, poolStrokeMap } from '@/lib/pool-game';
import { loadGameScores, fetchGameScores, saveGameScores } from '@/lib/tournament-state';
import { isAppOwner } from '@/lib/invite-gate';
import { getCreatorGhin } from '@/lib/pool-identity';
import { getGameMode } from '@/lib/game-modes';
import { PairingLocks } from '@/components/pairing-locks';
import { CaptainsPanel } from '@/components/captains-panel';
import { TeeTimePicker } from '@/components/tee-time-picker';
import { WolfDrawCtp } from '@/components/wolf-draw-ctp';
import { type RosterPlayer, hydrateRoster, searchRoster, getRosterPlayerByGhin, upsertRosterPlayer } from '@/lib/roster';
import { pickTeeForPlayer, teeRankInPool } from '@/lib/tee-pick';
import { getToken } from './shared';

export function EditFoursomes({ game, onSave: onSaveProp }: { game: PoolGame; onSave: (g: PoolGame) => void }) {
  const course = game.course;
  const playerById = new Map(game.players.map((p) => [p.id, p]));
  // Single-group games (individual / 2v2 / Wolf) are ONE foursome — the captains,
  // pairing-locks, balance, auto-generate, and swap machinery is meaningless
  // there, so hide it and keep just the per-player list (rename/tees/add/remove).
  const modeCategory = getGameMode(game.gameMode)?.category;
  const isSingleGroup = modeCategory === 'individual' || modeCategory === 'team-within-group';
  // Strokes THIS GAME (off-the-low-adjusted) — same number as the cards and the
  // swap tool, so the handicap shown next to each name here is consistent.
  const strokeMap = poolStrokeMap(game);

  // Captain working state — one player id per existing team SLOT (aligned to
  // game.teams by index, since applyReshuffle reuses those slots). Seeded from
  // each team's saved captainId; if none are set, auto-pick the lowest handicaps.
  const numTeams = Math.max(1, game.teams.length || Math.ceil(game.players.length / 4));
  // Whether this game uses captains at all (default true for older/pot games).
  const useCaptains = game.useCaptains ?? true;
  const [captainIds, setCaptainIds] = useState<string[]>(() => {
    const fromTeams = game.teams.map((t) => t.captainId ?? '');
    if (!useCaptains) return Array.from({ length: numTeams }, () => '');
    if (fromTeams.some(Boolean)) return fromTeams;
    const picks = pickCaptains(game.players, course, game.handicapAllowance, numTeams, game.lockedGroups ?? [], game.handicapBasis);
    return Array.from({ length: numTeams }, (_, i) => picks[i] ?? '');
  });
  // Balance the non-captain players only (default on when unset). Persisted on
  // the game so reopening setup remembers the organizer's choice.
  const excludeCaptains = game.balanceExcludeCaptains ?? true;

  // Every team edit here saves instantly (there is no separate submit step). The
  // organizer wasn't sure his changes stuck, so wrap the save so EVERY edit both
  // persists and flashes a visible "Saved ✓" banner. All the helpers below call
  // this `onSave`, so nothing can save without confirming it.
  const [saveTick, setSaveTick] = useState(0);
  const [showSaved, setShowSaved] = useState(false);
  const onSave = (updated: PoolGame) => {
    onSaveProp(updated);
    setShowSaved(true);          // show immediately (event handler — safe)
    setSaveTick((n) => n + 1);   // re-arm the auto-hide timer below
  };
  useEffect(() => {
    if (saveTick === 0) return;  // don't flash on first mount
    const t = setTimeout(() => setShowSaved(false), 1800);
    return () => clearTimeout(t);
  }, [saveTick]);

  // Fetch each foursome's scores into cache on entering edit mode, so the
  // re-balance "scores exist?" check (via loadGameScores) is accurate.
  useEffect(() => {
    game.teams.forEach((t) => { fetchGameScores(t.matchupId); });
  }, [game.teams]);

  function renameTeam(teamId: string, newName: string) {
    onSave({
      ...game,
      teams: game.teams.map((t) => (t.id === teamId ? { ...t, name: newName } : t)),
    });
  }

  function setTeeTime(teamId: string, teeTime: string) {
    onSave({
      ...game,
      teams: game.teams.map((t) => (t.id === teamId ? { ...t, teeTime } : t)),
    });
  }

  const sortIds = (ids: string[]) => sortPlayerIdsByHcap(ids, game.players, course, game.handicapAllowance, game.handicapBasis);
  const orderIds = (ids: string[], captainId: string | undefined) => orderPlayerIdsWithCaptain(ids, captainId, game.players, course, game.handicapAllowance, game.handicapBasis);

  // A hand edit (move/swap/make-captain) flags the current build as adjusted so
  // the read-only summary can say "hand-adjusted after". Older games with no
  // recorded build become method: 'manual'.
  function markAdjusted(): PoolGame['teamBuild'] {
    return { ...(game.teamBuild ?? { method: 'manual' }), adjustedAfter: true };
  }

  // Move a player between foursomes — preserves each team's matchupId. The
  // destination stays captain-first, then low->high. If the captain is moved out,
  // their old team's captaincy passes to its next-lowest handicap.
  function movePlayer(playerId: string, fromTeamId: string, toTeamId: string) {
    if (fromTeamId === toTeamId) return;
    onSave({
      ...game,
      teamBuild: markAdjusted(),
      teams: game.teams.map((t) => {
        if (t.id === fromTeamId) {
          const remaining = t.playerIds.filter((id) => id !== playerId);
          const captainId = t.captainId === playerId ? sortIds(remaining)[0] : t.captainId;
          return { ...t, playerIds: remaining, captainId };
        }
        if (t.id === toTeamId) return { ...t, playerIds: orderIds([...t.playerIds, playerId], t.captainId) };
        return t;
      }),
    });
  }

  // Swap two players between their two foursomes (1-for-1, sizes unchanged).
  // Each destination stays captain-first then low->high; matchupIds are preserved.
  // A swapped-away captain hands the role to the incoming player (the slot keeps a
  // captain).
  function swapPlayers(playerA: string, playerB: string) {
    const teamA = game.teams.find((t) => t.playerIds.includes(playerA));
    const teamB = game.teams.find((t) => t.playerIds.includes(playerB));
    if (!teamA || !teamB || teamA.id === teamB.id) return;
    onSave({
      ...game,
      teamBuild: markAdjusted(),
      teams: game.teams.map((t) => {
        if (t.id === teamA.id) {
          const captainId = t.captainId === playerA ? playerB : t.captainId;
          return { ...t, captainId, playerIds: orderIds(t.playerIds.map((id) => (id === playerA ? playerB : id)), captainId) };
        }
        if (t.id === teamB.id) {
          const captainId = t.captainId === playerB ? playerA : t.captainId;
          return { ...t, captainId, playerIds: orderIds(t.playerIds.map((id) => (id === playerB ? playerA : id)), captainId) };
        }
        return t;
      }),
    });
  }

  // Make a player the captain of their current team (top of the list). Mirrors
  // the pick into the captainIds slot for that team so the panel stays in sync.
  function makeCaptain(teamId: string, playerId: string) {
    const idx = game.teams.findIndex((t) => t.id === teamId);
    onSave({
      ...game,
      teamBuild: markAdjusted(),
      teams: game.teams.map((t) => (
        t.id === teamId ? { ...t, captainId: playerId, playerIds: orderIds(t.playerIds, playerId) } : t
      )),
    });
    if (idx >= 0) {
      const next = [...captainIds];
      for (let i = 0; i < next.length; i++) if (next[i] === playerId) next[i] = '';
      next[idx] = playerId;
      setCaptainIds(next);
    }
  }

  // Reorder foursomes (the order they're sent out in), preserving matchupIds.
  function moveTeam(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= game.teams.length) return;
    const next = [...game.teams];
    [next[index], next[j]] = [next[j], next[index]];
    onSave({ ...game, teams: next });
  }

  // Order foursomes by tee time (blank times sink to the bottom).
  function sortTeamsByTeeTime() {
    const next = [...game.teams].sort((a, b) => {
      const ta = (a.teeTime || '').trim(), tb = (b.teeTime || '').trim();
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return ta.localeCompare(tb);
    });
    onSave({ ...game, teams: next });
  }

  // Change a player's tee (updates game.players) and remember it on the roster.
  function changePlayerTee(playerId: string, teeSetId: number) {
    onSave({
      ...game,
      players: game.players.map((p) => (p.id === playerId ? { ...p, teeSetId } : p)),
    });
    const player = playerById.get(playerId);
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

  // Manually set a player's handicap INDEX on this game (e.g. a no-GHIN player
  // typed in wrong). Updates game.players so strokes recompute immediately, and
  // mirrors to the roster so it sticks for future games. Empty clears to null.
  function setPlayerHandicap(playerId: string, raw: string) {
    const trimmed = raw.trim();
    const idx = trimmed === '' ? null : parseFloat(trimmed);
    const handicapIndex = idx === null || isNaN(idx) ? null : idx;
    onSave({
      ...game,
      players: game.players.map((p) => (p.id === playerId ? { ...p, handicapIndex } : p)),
      handicapsRefreshedAt: new Date().toISOString(),
    });
    const player = playerById.get(playerId);
    if (player) {
      upsertRosterPlayer({
        id: player.id,
        ghinNumber: player.ghinNumber ?? null,
        name: player.name,
        handicapIndex,
        gender: player.gender ?? null,
        defaultTeeName: null,
      });
    }
  }

  // Remove a player from their team AND from game.players. Any score rows they
  // had become orphaned (keyed by matchupId), which is acceptable. If they were a
  // captain, the role passes to their team's next-lowest handicap.
  function removePlayer(playerId: string) {
    onSave({
      ...game,
      players: game.players.filter((p) => p.id !== playerId),
      teams: game.teams.map((t) => {
        const playerIds = t.playerIds.filter((id) => id !== playerId);
        const captainId = t.captainId === playerId ? sortIds(playerIds)[0] : t.captainId;
        return { ...t, playerIds, captainId };
      }),
    });
  }

  // Add a new player to game.players and onto a chosen foursome (kept sorted).
  function addPlayer(player: Player, toTeamId: string) {
    const players = game.players.some((p) => p.id === player.id)
      ? game.players.map((p) => (p.id === player.id ? player : p))
      : [...game.players, player];
    const teams = game.teams.map((t) =>
      t.id === toTeamId
        ? { ...t, playerIds: t.playerIds.includes(player.id) ? t.playerIds : sortPlayerIdsByHcap([...t.playerIds, player.id], players, course, game.handicapAllowance) }
        : t
    );
    onSave({ ...game, players, teams });
  }

  // Reassign the field into `newGroups` (arrays of player IDs), reusing the
  // EXISTING team slots so each foursome keeps its matchupId. `captainByTeam[i]`
  // (when present and on the slot) becomes that slot's captain, else the slot's
  // lowest handicap. Players within a slot list captain-first. If any foursome
  // already has scores, warn — and on confirm, clear all scores for the round
  // (the old cards no longer match the reshuffled players).
  function applyReshuffle(newGroups: string[][], captainByTeam: (string | undefined)[] = [], teamBuild?: PoolGame['teamBuild']) {
    const teamsWithScores = game.teams.filter((t) => {
      const s = loadGameScores(t.matchupId);
      return Array.isArray(s) && s.length > 0;
    });
    if (teamsWithScores.length > 0) {
      const ok = confirm(
        `${teamsWithScores.length} foursome${teamsWithScores.length === 1 ? '' : 's'} already ` +
        `${teamsWithScores.length === 1 ? 'has' : 'have'} scores entered. Re-balancing reshuffles ` +
        `players, so those scores will be cleared for the round. Continue?`
      );
      if (!ok) return;
      for (const t of game.teams) saveGameScores(t.matchupId, []);
    }
    // Keep existing team slots (id, name, matchupId, teeTime); just swap playerIds
    // (captain first, then low->high within each foursome).
    const n = Math.max(game.teams.length, newGroups.length);
    const teams = Array.from({ length: n }, (_, i) => {
      const existing = game.teams[i];
      const ids = newGroups[i] ?? [];
      // With captains off, teams carry no captain role — just sort low->high.
      const captainId = !useCaptains
        ? undefined
        : (captainByTeam[i] && ids.includes(captainByTeam[i]!) ? captainByTeam[i] : sortIds(ids)[0]);
      const playerIds = useCaptains ? orderIds(ids, captainId) : sortIds(ids);
      if (existing) return { ...existing, playerIds, captainId };
      return { id: crypto.randomUUID(), name: `Team ${i + 1}`, playerIds, matchupId: crypto.randomUUID(), captainId };
    });
    // Mirror the resulting captains back into the working slots.
    setCaptainIds(teams.map((t) => t.captainId ?? ''));
    onSave({ ...game, teams, teamBuild: teamBuild ?? game.teamBuild });
  }

  // Balance AROUND CAPTAINS (captainIds, aligned to the team slots), honoring
  // pairing locks. Each captain anchors their slot; the field balances evenly
  // around them.
  function autoBalance() {
    if (!useCaptains) {
      const groups = balanceTeamsWithLocks(
        game.players,
        numTeams,
        // Balance on the SAME scale the game actually plays off (9-hole handicaps
        // on a USGA nine), or teams are balanced against numbers nobody uses.
        (p) => getPoolPlayingHandicap(p, course, game.handicapAllowance, game.handicapBasis, gameNineBasis(game)),
        game.lockedGroups ?? []
      );
      applyReshuffle(groups, [], {
        method: 'balanced',
        excludeCaptains: false,
        hadCaptains: false,
        hadLocks: (game.lockedGroups ?? []).some((g) => g.length >= 2),
        adjustedAfter: false,
      });
      return;
    }
    const captainByTeam = Array.from({ length: numTeams }, (_, i) => captainIds[i] || undefined);
    const groups = balanceTeamsWithCaptains(
      game.players,
      numTeams,
      // Also pass the basis (it was omitted here, so an 'index'-basis game
      // balanced off course handicaps) and the game's nine.
      (p) => getPoolPlayingHandicap(p, course, game.handicapAllowance, game.handicapBasis, gameNineBasis(game)),
      captainByTeam,
      game.lockedGroups ?? [],
      excludeCaptains
    );
    // Snapshot the settings that produced this build so the read-only summary
    // reflects what was actually used, not the live toggle later on.
    applyReshuffle(groups, captainByTeam, {
      method: 'balanced',
      excludeCaptains,
      hadCaptains: captainByTeam.some(Boolean),
      hadLocks: (game.lockedGroups ?? []).some((g) => g.length >= 2),
      adjustedAfter: false,
    });
  }

  // Captains' deal on an EXISTING game. The wizard had this but the hub didn't, so an
  // organizer who wanted to re-deal after a late arrival had no way to.
  function autoCaptainsDeal() {
    const captainByTeam = Array.from({ length: numTeams }, (_, i) =>
      useCaptains ? (captainIds[i] || undefined) : undefined);
    const groups = captainsDealTeams(
      game.players,
      numTeams,
      course,
      game.handicapAllowance,
      captainByTeam,
      game.lockedGroups ?? [],
      game.handicapBasis,
      gameNineBasis(game),
    );
    applyReshuffle(groups, captainByTeam, {
      method: 'serpentine',
      excludeCaptains: false,
      hadCaptains: captainByTeam.some(Boolean),
      hadLocks: (game.lockedGroups ?? []).some((g) => g.length >= 2),
      adjustedAfter: false,
    });
  }

  function autoGenerate() {
    const groups: string[][] = [];
    for (let i = 0; i < game.players.length; i += 4) {
      groups.push(game.players.slice(i, i + 4).map((p) => p.id));
    }
    // Plain sequential foursomes — each slot's lowest handicap becomes captain.
    applyReshuffle(groups, [], { method: 'sequential', adjustedAfter: false });
  }

  function setLockedGroups(groups: string[][]) {
    onSave({ ...game, lockedGroups: groups.length > 0 ? groups : undefined });
  }

  return (
    <div className="space-y-3">
      {/* Floating confirmation so the organizer always sees that an edit stuck. */}
      {showSaved && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center pointer-events-none print:hidden">
          <div className="rounded-full bg-green-700 text-white px-4 py-2 text-sm font-semibold shadow-lg">
            ✓ Saved
          </div>
        </div>
      )}

      {/* Plain-words note: there is no submit step, so he won't fear losing edits. */}
      <p className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
        Changes save automatically as you make them — no submit button. Tap <span className="font-semibold">Done editing</span> at the top when you&apos;re finished.
      </p>

      {/* Team-building style: captains vs plain balance. Mirrors the wizard so a
          game can drop or add captains after creation. Single-group games (Wolf/
          individual/2v2) have one foursome, so none of this applies. */}
      {!isSingleGroup && game.players.length > 0 && (
        <div className="bg-white rounded-lg shadow p-3">
          <p className="text-sm font-semibold text-gray-800 mb-2">Team Building</p>
          <div className="flex gap-2">
            {([{ v: true, label: 'Use captains' }, { v: false, label: 'No captains' }] as const).map(({ v, label }) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => onSave({ ...game, useCaptains: v })}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                  useCaptains === v ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {useCaptains ? 'Each team has a captain; the rest balance around them.' : 'Teams balanced by handicap, no captain role.'}
          </p>
        </div>
      )}

      {!isSingleGroup && useCaptains && game.players.length > 0 && (
        <CaptainsPanel
          players={game.players}
          course={course}
          handicapAllowance={game.handicapAllowance}
          handicapBasis={game.handicapBasis}
          nine={gameNineBasis(game)}
          numTeams={numTeams}
          captainIds={captainIds}
          setCaptainIdsAction={setCaptainIds}
          excludeCaptains={excludeCaptains}
          setExcludeCaptainsAction={(v) => onSave({ ...game, balanceExcludeCaptains: v })}
          onApplyAction={autoBalance}
        />
      )}
      {!isSingleGroup && game.players.length > 0 && (
        <PairingLocks
          players={game.players}
          lockedGroups={game.lockedGroups ?? []}
          setLockedGroupsAction={setLockedGroups}
          onApplyAction={autoBalance}
        />
      )}
      {!isSingleGroup && game.teams.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Build &amp; adjust teams</p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={autoBalance}
              className="rounded-md border border-green-700 px-3 py-2 text-sm text-green-700 font-medium hover:bg-green-50"
            >
              {useCaptains ? 'Even out around captains' : 'Even out by handicap'}
            </button>
            <button
              onClick={autoCaptainsDeal}
              className="min-h-[44px] rounded-md border border-green-700 px-3 py-2.5 text-sm text-green-700 font-medium hover:bg-green-50"
              title="Each round the best captain takes the worst remaining player, down to the worst captain taking the best"
            >
              Captains&rsquo; deal
            </button>
            <button
              onClick={autoGenerate}
              className="min-h-[44px] rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-700 font-medium hover:bg-gray-100"
            >
              Auto-generate foursomes
            </button>
            {game.teams.length > 1 && (
              <button
                onClick={sortTeamsByTeeTime}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 font-medium hover:bg-gray-100"
              >
                Order by tee time
              </button>
            )}
          </div>
        </div>
      )}
      {game.teams.length > 1 && (
        <SwapPanel game={game} onSwap={swapPlayers} />
      )}
      {game.teams.map((team, teamIdx) => (
        <div key={team.id} className="bg-white rounded-lg shadow p-4">
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Team name · send-out order</label>
            <div className="flex items-center gap-2">
              {game.teams.length > 1 && (
                <div className="flex flex-col leading-none">
                  <button
                    onClick={() => moveTeam(teamIdx, -1)}
                    disabled={teamIdx === 0}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs"
                    title="Move team up"
                  >▲</button>
                  <button
                    onClick={() => moveTeam(teamIdx, 1)}
                    disabled={teamIdx === game.teams.length - 1}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs"
                    title="Move team down"
                  >▼</button>
                </div>
              )}
              <input
                type="text"
                value={team.name}
                onChange={(e) => renameTeam(team.id, e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm font-semibold shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Tee time</label>
            <TeeTimePicker value={team.teeTime || ''} onChangeAction={(v) => setTeeTime(team.id, v)} />
          </div>

          <ul className="space-y-1.5">
            {team.playerIds.map((pid) => {
              const p = playerById.get(pid);
              if (!p) return null;
              const chcp = course ? Math.round(strokeMap.get(pid) ?? 0) : null;
              const teeOptions: TeeSetOption[] = teeOptionsForPlayer(course, p);
              const mismatch = playerTeeGenderMismatch(course, p);
              const isCaptain = team.captainId === pid;
              return (
                <li key={pid} className={`rounded px-2 py-2 ${isCaptain ? 'bg-green-50 ring-1 ring-green-200' : 'bg-gray-50'}`}>
                  {/* Line 1: who + their course handicap */}
                  <div className="flex items-center gap-2">
                    {isCaptain && (
                      <span className="flex-shrink-0 rounded-full bg-green-700 text-white text-[10px] font-bold px-1.5 py-0.5" title="Captain">C</span>
                    )}
                    <span className="text-sm font-medium text-gray-900 truncate min-w-0 flex-1">
                      {p.name}
                      {chcp !== null && <span className="ml-1 text-xs font-normal text-gray-500" title="Strokes received in this game">({chcp})</span>}
                      {mismatch && <span className="ml-1 text-xs text-red-600 font-medium" title="This tee doesn't match the player's gender — fix it to correct their handicap">⚠ tee</span>}
                    </span>
                    <button
                      onClick={() => removePlayer(pid)}
                      className="text-red-500 hover:text-red-700 text-lg leading-none px-1 flex-shrink-0"
                      title="Remove player"
                    >
                      &times;
                    </button>
                  </div>
                  {/* Line 2: clearly-labeled controls with real tap targets */}
                  <div className="mt-1.5 flex items-end gap-2 flex-wrap">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Index</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        defaultValue={p.handicapIndex ?? ''}
                        onBlur={(e) => { if ((e.target.value.trim() === '' ? null : parseFloat(e.target.value)) !== p.handicapIndex) setPlayerHandicap(pid, e.target.value); }}
                        placeholder="—"
                        className="w-16 text-sm rounded-md border border-gray-300 px-2 py-1 shadow-sm focus:border-green-500 focus:outline-none bg-white"
                        title="Handicap index — edit for a player entered by hand"
                      />
                    </label>
                    {!isSingleGroup && useCaptains && !isCaptain && (
                      <button
                        onClick={() => makeCaptain(team.id, pid)}
                        className="rounded-md border border-green-600 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                        title="Make this player the team captain"
                      >
                        Make captain
                      </button>
                    )}
                    {game.teams.length > 1 && (
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Move to</span>
                        <select
                          value={team.id}
                          onChange={(e) => movePlayer(pid, team.id, e.target.value)}
                          className="text-sm rounded-md border border-gray-300 px-2 py-1 shadow-sm focus:border-green-500 focus:outline-none bg-white"
                          title="Move this player to another team"
                        >
                          {game.teams.map((t) => (
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
                          className={`text-sm rounded-md border px-2 py-1 shadow-sm focus:outline-none bg-white ${mismatch ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-green-500'}`}
                          title="Tee"
                        >
                          {teeOptions.map((ts) => (
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
              <li className="text-xs text-gray-400 px-2 py-1">Empty — add or move players here.</li>
            )}
          </ul>
        </div>
      ))}

      {game.teams.length === 0 && (
        <p className="text-center text-gray-500 py-6 bg-white rounded-lg shadow">No foursomes to edit.</p>
      )}

      {game.teams.length > 0 && <AddPlayerPanel game={game} onAdd={addPlayer} />}
    </div>
  );
}

export function AddPlayerPanel({
  game,
  onAdd,
}: {
  game: PoolGame;
  onAdd: (player: Player, toTeamId: string) => void;
}) {
  const course = game.course;
  const [targetTeamId, setTargetTeamId] = useState<string>(game.teams[game.teams.length - 1]?.id ?? '');

  const [rosterQuery, setRosterQuery] = useState('');
  const [rosterResults, setRosterResults] = useState<RosterPlayer[]>([]);

  const [ghinInput, setGhinInput] = useState('');
  const [ghinLoading, setGhinLoading] = useState(false);
  const [ghinError, setGhinError] = useState('');

  useEffect(() => {
    // Scope the roster to this organizer (owner sees all; others see the shared
    // base roster plus their own saved players).
    hydrateRoster({ viewerGhin: getCreatorGhin(), isOwner: isAppOwner() }).then(() => setRosterResults(searchRoster('')));
  }, []);

  // Keep the target team valid if teams change under us.
  useEffect(() => {
    if (!game.teams.some((t) => t.id === targetTeamId)) {
      setTargetTeamId(game.teams[game.teams.length - 1]?.id ?? '');
    }
  }, [game.teams, targetTeamId]);

  function refreshRoster(query: string) {
    setRosterQuery(query);
    setRosterResults(searchRoster(query));
  }

  const existingGhins = new Set(game.players.map((p) => p.ghinNumber).filter((g): g is number => g != null));
  const existingIds = new Set(game.players.map((p) => p.id));

  function addRosterPlayer(rp: RosterPlayer) {
    if (!targetTeamId) return;
    if (rp.ghinNumber != null && existingGhins.has(rp.ghinNumber)) return;
    if (existingIds.has(rp.id)) return;
    const newPlayer: Player = {
      id: rp.id,
      name: rp.name,
      handicapIndex: rp.handicapIndex,
      gender: rp.gender ?? undefined,
      ghinNumber: rp.ghinNumber ?? undefined,
      teeSetId: pickTeeForPlayer(course, rp.gender ?? undefined, rp.defaultTeeName, rp.defaultTeeRank),
    };
    onAdd(newPlayer, targetTeamId);
  }

  async function addByGhin() {
    const token = getToken();
    if (!token || !ghinInput || !targetTeamId) return;
    setGhinLoading(true);
    setGhinError('');
    try {
      const res = await fetch('/api/ghin/golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ghin_number: Number(ghinInput) }),
      });
      const data = await res.json();
      if (!res.ok) { setGhinError(data.error || 'Lookup failed'); return; }
      const golfer = data.golfer;
      const hi = parseGhinIndex(golfer.handicap_index ?? golfer.hi_value);
      const ghinGender = (golfer.gender || golfer.Gender || '').toLowerCase();
      const gender: 'M' | 'F' = ghinGender === 'female' || ghinGender === 'f' ? 'F' : 'M';
      const ghinNumber = Number(ghinInput);
      if (existingGhins.has(ghinNumber)) { setGhinError('Player already in the game'); return; }
      const rememberedRp = getRosterPlayerByGhin(ghinNumber);
      const newPlayer: Player = {
        id: crypto.randomUUID(),
        // GHIN can return empty/missing name fields (privacy-restricted golfers,
        // partial responses) — never write "undefined undefined" or "" to the roster (F-027).
        name: [golfer.first_name, golfer.last_name].filter(Boolean).join(' ').trim() || `GHIN #${ghinNumber}`,
        handicapIndex: hi,
        gender,
        ghinNumber,
        teeSetId: pickTeeForPlayer(course, gender, rememberedRp?.defaultTeeName ?? null, rememberedRp?.defaultTeeRank),
      };
      onAdd(newPlayer, targetTeamId);
      upsertRosterPlayer({
        id: newPlayer.id,
        ghinNumber,
        name: newPlayer.name,
        handicapIndex: newPlayer.handicapIndex,
        gender,
        defaultTeeName: null,
      });
      setGhinInput('');
      refreshRoster(rosterQuery);
    } catch {
      setGhinError('Network error');
    } finally {
      setGhinLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-sm font-semibold text-gray-800 mb-2">Add a player</p>

      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">Add to foursome</label>
        <select
          value={targetTeamId}
          onChange={(e) => setTargetTeamId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          {game.teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Roster name search */}
      <input
        type="text"
        value={rosterQuery}
        onChange={(e) => refreshRoster(e.target.value)}
        placeholder="Search saved players…"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
      />
      {rosterResults.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No saved players{rosterQuery ? ' match' : ' yet'}. Add by GHIN # below.</p>
      ) : (
        <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-100">
          {rosterResults.map((rp) => {
            const inGame = existingIds.has(rp.id) || (rp.ghinNumber != null && existingGhins.has(rp.ghinNumber));
            return (
              <li key={rp.id}>
                <button
                  onClick={() => addRosterPlayer(rp)}
                  disabled={inGame}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm ${inGame ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                >
                  <span className="flex-1 font-medium text-gray-900">{rp.name}</span>
                  <span className="text-xs text-gray-500">
                    {rp.handicapIndex ?? '—'}{rp.gender ? ` · ${rp.gender}` : ''}
                  </span>
                  {!inGame && <span className="text-xs text-green-700 font-medium">+ Add</span>}
                  {inGame && <span className="text-xs text-gray-400">In game</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add by GHIN # */}
      <div className="mt-3 pt-3 border-t">
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
            disabled={ghinLoading || !ghinInput || !targetTeamId}
            className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
          >
            {ghinLoading ? '...' : 'Add'}
          </button>
        </div>
        {ghinError && <p className="text-xs text-red-600 mt-1">{ghinError}</p>}
      </div>
    </div>
  );
}

// Guided player swap: pick one player, see the fairest 1-for-1 partners on the
// other teams (ranked by how even the teams stay), preview both affected teams
// as they'd look after the swap, then apply. Fairness uses each player's playing
// handicap off THEIR OWN tee. Lets the organizer make a personality-driven swap
// while seeing its exact effect on game fairness before committing.
export function SwapPanel({ game, onSwap }: { game: PoolGame; onSwap: (a: string, b: string) => void }) {
  const [selected, setSelected] = useState('');
  const [partner, setPartner] = useState('');

  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? '?';
  const teamOf = (id: string) => game.teams.find((t) => t.playerIds.includes(id));

  // Show STROKES THIS GAME (off-the-low-adjusted) — the exact number on the
  // foursome cards — not the raw course handicap, so the swap tool's per-player
  // values and spread match what the organizer sees everywhere else.
  const strokeMap = useMemo(() => poolStrokeMap(game), [game]);
  const strokesOf = (id: string) => Math.round(strokeMap.get(id) ?? 0);

  const candidates = useMemo(
    () => (selected ? rankSwapCandidates(game, selected) : []),
    [game, selected]
  );
  const currentSpread = useMemo(
    () => teamHandicapSpread(game.teams, strokeMap),
    [game, strokeMap]
  );

  // Reset a stale partner if the selected player changed.
  const partnerValid = candidates.some((c) => c.playerId === partner);
  const activePartner = partnerValid ? partner : '';
  const chosen = candidates.find((c) => c.playerId === activePartner) ?? null;

  const fromTeam = selected ? teamOf(selected) : undefined;
  const toTeam = chosen ? game.teams.find((t) => t.id === chosen.teamId) : undefined;

  // Preview player-id lists for the two affected teams after the swap.
  function previewIds(team: typeof fromTeam, outId: string, inId: string): string[] {
    if (!team) return [];
    return team.playerIds.map((id) => (id === outId ? inId : id));
  }

  function fairnessTag(delta: number) {
    if (delta < -0.5) return { text: 'fairer', cls: 'text-green-700' };
    if (delta > 0.5) return { text: 'less fair', cls: 'text-amber-600' };
    return { text: 'about the same', cls: 'text-gray-500' };
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-sm font-semibold text-gray-800">Swap two players</p>
      <p className="text-xs text-gray-500 mb-2">
        Pick a player, then choose someone to swap with — the fairest matches (teams stay most even) are listed first.
        Numbers in parentheses are <span className="font-medium text-gray-700">strokes received this game</span>.
        Current spread between teams: <span className="font-medium text-gray-700">{Math.round(currentSpread)}</span>.
      </p>

      <div className="mb-2">
        <label className="block text-xs text-gray-500 mb-1">Player to move</label>
        <select
          value={selected}
          onChange={(e) => { setSelected(e.target.value); setPartner(''); }}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none"
        >
          <option value="">Choose a player…</option>
          {game.teams.map((t) => (
            <optgroup key={t.id} label={t.name}>
              {t.playerIds.map((pid) => (
                <option key={pid} value={pid}>{nameOf(pid)} ({strokesOf(pid)})</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {selected && (
        <div className="mb-2">
          <label className="block text-xs text-gray-500 mb-1">Swap with</label>
          {candidates.length === 0 ? (
            <p className="text-xs text-gray-400">No one on another team to swap with.</p>
          ) : (
            <div className="max-h-52 overflow-y-auto rounded-md border border-gray-100 divide-y divide-gray-100">
              {candidates.map((c) => {
                const tag = fairnessTag(c.delta);
                const isSel = c.playerId === activePartner;
                return (
                  <button
                    key={c.playerId}
                    onClick={() => setPartner(c.playerId)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm ${isSel ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className="flex-1 truncate">
                      <span className="font-medium text-gray-900">{nameOf(c.playerId)}</span>
                      <span className="text-gray-500"> ({strokesOf(c.playerId)}) · {c.teamName}</span>
                    </span>
                    <span className={`text-xs flex-shrink-0 ${tag.cls}`}>
                      {tag.text} · spread {Math.round(c.resultingSpread)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {chosen && fromTeam && toTeam && (
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2">
          <p className="text-xs font-semibold text-gray-700 mb-1.5">
            After swap — spread {Math.round(currentSpread)} → <span className={fairnessTag(chosen.delta).cls}>{Math.round(chosen.resultingSpread)}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { team: fromTeam, ids: previewIds(fromTeam, selected, chosen.playerId), inId: chosen.playerId },
              { team: toTeam, ids: previewIds(toTeam, chosen.playerId, selected), inId: selected },
            ].map(({ team, ids, inId }) => {
              const total = ids.reduce((s, id) => s + strokesOf(id), 0);
              return (
                <div key={team!.id} className="rounded border border-gray-200 bg-white p-2">
                  <p className="text-xs font-semibold text-gray-800 truncate">{team!.name}
                    <span className="ml-1 font-normal text-gray-400">Σ{total}</span>
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {sortPlayerIdsByHcap(ids, game.players, game.course, game.handicapAllowance).map((id) => (
                      <li key={id} className={`text-xs flex justify-between gap-1 ${id === inId ? 'text-green-700 font-semibold' : 'text-gray-700'}`}>
                        <span className="truncate">{id === inId ? '+ ' : ''}{nameOf(id)}</span>
                        <span className="tabular-nums text-gray-400">{strokesOf(id)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => { onSwap(selected, chosen.playerId); setSelected(''); setPartner(''); }}
            className="mt-2 w-full rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800"
          >
            Apply swap
          </button>
        </div>
      )}
    </div>
  );
}

// F-019 — a PLAYING GROUP that has outgrown a tee slot.
//
// Five players can't walk together, so when a side game's group passes four the app has to say
// something. Craig's call (2026-08-25) was **prompt, defaulting to keep**, and the three parts of
// that matter:
//
//   - PROMPT, not a silent re-split. §5.ao: an uneven count is a question, not a default. The app
//     proposes; the group decides.
//   - DEFAULT TO KEEP. Dismissing changes nothing, so a round already being scored can't be
//     reshuffled by a stray tap.
//   - SCORES ARE UNTOUCHED EITHER WAY. Splitting moves players between groups, which moves them
//     between matchupIds — so the scores already entered have to travel with them. That is the
//     whole reason this doesn't reuse applyReshuffle, which CLEARS scores on a scored round
//     (correct there: it reshuffles pot foursomes, changing who competes with whom; here the
//     money grouping is the SIDES and is not touched at all).
//
// Not shown for a classic pool: its foursomes are its money teams, and its own re-balance flow
// already owns that question.
export function OversizedGroupPrompt({ game, onSave }: { game: PoolGame; onSave: (g: PoolGame) => void }) {
  const [dismissed, setDismissed] = useState(false);
  const [choosing, setChoosing] = useState(false);

  const mode = getGameMode(game.gameMode);
  const isSideGame = mode?.category === 'team-within-group';
  const oversized = game.teams.filter((t) => t.playerIds.length > 4);
  if (!isSideGame || oversized.length === 0 || dismissed) return null;

  // The shapes the whole field could take. Offered from the field size rather than per-group,
  // because splitting one group of five into 3 + 2 changes the tee sheet as a whole.
  const shapes = groupShapesFor(game.players.length, TEE_GROUP_SHAPE_OPTS);

  // Re-deal the field into `shape`, CARRYING SCORES. Each new group reuses an existing slot's
  // matchupId where it can, and every score row is rewritten under the matchup its player ends up
  // in — so a hole entered before the split is still there after it.
  function applyShape(shape: number[]) {
    const ids = sortPlayerIdsByHcap(
      game.players.map((p) => p.id), game.players, game.course, game.handicapAllowance, game.handicapBasis,
    );
    const buckets = dealBalancedIntoShape(ids, shape);

    // Every score currently in play, keyed by player, so it can be re-filed by destination.
    const scoresByPlayer = new Map<string, GameScore[]>();
    for (const t of game.teams) {
      const rows = loadGameScores(t.matchupId);
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const list = scoresByPlayer.get(row.playerId) ?? [];
        list.push(row);
        scoresByPlayer.set(row.playerId, list);
      }
    }

    const teams: PoolTeam[] = buckets.map((playerIds, i) => ({
      id: game.teams[i]?.id ?? crypto.randomUUID(),
      name: `Group ${i + 1}`,
      playerIds,
      // Reuse the slot's matchupId so an unchanged group's scores stay exactly where they are.
      matchupId: game.teams[i]?.matchupId ?? crypto.randomUUID(),
      teeTime: game.teams[i]?.teeTime ?? '',
    }));

    // Rewrite each matchup's rows from the new membership. A player who moved takes their holes
    // with them; a player who didn't is written back unchanged.
    for (const t of teams) {
      const rows = t.playerIds.flatMap((pid) => scoresByPlayer.get(pid) ?? []);
      saveGameScores(t.matchupId, rows);
    }
    // Empty any slot that's no longer in use. This is DEFENSIVE, not load-bearing: every reader
    // keys off `game.teams`, so an abandoned matchup's rows are already unreachable and a mutation
    // test that deleted this loop passed. Kept anyway, because "unreachable" is a property of
    // today's call sites rather than of the data — a future reader that enumerates score rows
    // instead of teams would silently double-count a player. Cheap insurance against a bug class
    // that has already cost this project real money twice (§5.ac).
    for (const old of game.teams) {
      if (!teams.some((t) => t.matchupId === old.matchupId)) saveGameScores(old.matchupId, []);
    }

    onSave({ ...game, teams });
    setChoosing(false);
  }

  const big = oversized[0];
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        {big.playerIds.length} players in {big.name}
      </p>
      <p className="mt-0.5 text-xs text-amber-800">
        More than four can&apos;t play as one group. Split them into separate tee times, or keep them
        together if that&apos;s really the plan — <span className="font-medium">scores already entered
        are kept either way</span>, and your sides don&apos;t change.
      </p>

      {!choosing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Keep-as-is FIRST and styled as the plain action: dismissing must be the easy path. */}
          <button
            onClick={() => setDismissed(true)}
            className="min-h-[44px] rounded-md border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            Keep one group
          </button>
          <button
            onClick={() => setChoosing(true)}
            className="min-h-[44px] rounded-md bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
          >
            Split into groups
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-xs font-medium text-amber-900 mb-2">How do they split?</p>
          <div className="flex flex-wrap gap-2">
            {shapes.map((shape) => (
              <button
                key={shape.join('-')}
                onClick={() => applyShape(shape)}
                className="min-h-[44px] rounded-md border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
              >
                {groupShapeLabel(shape)}
                <span className="ml-1.5 text-xs text-amber-700">
                  {shape.length} tee time{shape.length === 1 ? '' : 's'}
                </span>
              </button>
            ))}
            {shapes.length === 0 && (
              <p className="text-xs text-amber-800">No split fits this many players.</p>
            )}
          </div>
          <button
            onClick={() => setChoosing(false)}
            className="mt-2 text-xs text-amber-800 underline hover:text-amber-900"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// Wolf rotation editor. Sets the order the Wolf rotates through the group
// (hole N → order[(N-1) % 4]). Stored on game.wolfOrder; absent = field-entry
// order (the game.players sequence). Three paths: randomize, reorder by hand,
// or reset to field order. The Wolf draw mini-games (a later layer) also write
// game.wolfOrder — this editor is the manual/randomize entry point.
export function WolfRotationEditor({ game, onSave }: { game: PoolGame; onSave: (g: PoolGame) => void }) {
  const [drawing, setDrawing] = useState(false);
  // Wolf is a single-foursome game: the one team's players, in field order.
  const fieldIds = game.teams[0]?.playerIds ?? game.players.map((p) => p.id);
  // Current rotation: stored order (filtered to current field) padded with any
  // field members it's missing, else plain field order.
  const stored = game.wolfOrder?.filter((id) => fieldIds.includes(id)) ?? [];
  const orderIds = stored.length > 0
    ? [...stored, ...fieldIds.filter((id) => !stored.includes(id))]
    : fieldIds;

  const nameOf = (id: string): string =>
    game.players.find((p) => p.id === id)?.name.split(' ')[0] ?? '—';
  const isCustom = (game.wolfOrder?.length ?? 0) > 0;

  // Changing the rotation invalidates any recorded per-hole Wolf picks (each pins
  // a specific wolf, so a stale pick would keep showing the old wolf "overridden"
  // against the new order). Clear them on any order change — but confirm first if
  // picks exist, so a genuine mid-round reorder doesn't silently wipe real data.
  function clearDecisionsOk(): boolean {
    const hasDecisions = Object.keys(game.wolfDecisions ?? {}).length > 0;
    if (!hasDecisions) return true;
    return confirm('Changing the Wolf rotation will reset the per-hole Wolf picks already recorded. Continue?');
  }
  function save(newOrder: string[]) {
    if (!clearDecisionsOk()) return;
    const updated = { ...game, wolfOrder: newOrder };
    delete updated.wolfDecisions;
    onSave(updated);
  }
  function resetToField() {
    if (!clearDecisionsOk()) return;
    const updated = { ...game };
    delete updated.wolfOrder;
    delete updated.wolfDecisions;
    onSave(updated);
  }
  function randomize() {
    const shuffled = [...orderIds];
    // Fisher–Yates.
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    save(shuffled);
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...orderIds];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    save(next);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Wolf Rotation</h2>
      <p className="text-xs text-gray-400 mb-3">
        Who&apos;s the Wolf each hole. Rotates in this order and repeats (hole 5 = 1st again).
        {isCustom ? ' Custom order set.' : ' Using the order players were added.'}
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => setDrawing(true)}
          className="text-sm px-3 py-1.5 rounded-lg bg-green-700 text-white font-medium hover:bg-green-800"
        >
          🎯 Play for it
        </button>
        <button
          onClick={randomize}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 font-medium hover:border-gray-400"
        >
          🎲 Randomize
        </button>
        <button
          onClick={resetToField}
          disabled={!isCustom}
          className={`text-sm px-3 py-1.5 rounded-lg border font-medium ${
            isCustom
              ? 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
          }`}
        >
          Reset to entry order
        </button>
      </div>

      {drawing && (
        <WolfDrawCtp
          players={orderIds.map((id) => ({ id, name: game.players.find((p) => p.id === id)?.name ?? '—' }))}
          onCompleteAction={(ordered) => { save(ordered); setDrawing(false); }}
          onCancelAction={() => setDrawing(false)}
        />
      )}

      <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
        {orderIds.map((id, idx) => (
          <div key={id} className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-400 w-14">Hole {idx + 1}</span>
              <span className="font-medium text-gray-900">{nameOf(id)}</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className={`w-8 h-8 rounded-md border text-gray-600 ${idx === 0 ? 'opacity-30 cursor-not-allowed border-gray-200' : 'border-gray-300 hover:border-gray-400'}`}
                aria-label="Move up"
              >
                ▲
              </button>
              <button
                onClick={() => move(idx, 1)}
                disabled={idx === orderIds.length - 1}
                className={`w-8 h-8 rounded-md border text-gray-600 ${idx === orderIds.length - 1 ? 'opacity-30 cursor-not-allowed border-gray-200' : 'border-gray-300 hover:border-gray-400'}`}
                aria-label="Move down"
              >
                ▼
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-2">Wraps after hole {orderIds.length} · you can still override any single hole while scoring.</p>
    </section>
  );
}
