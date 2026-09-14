'use client';

import { useState } from 'react';
import type { CourseSelection, Player } from '@/lib/game-state';
import { type PoolTeam, getPoolPlayingHandicap, sortPlayerIdsByHcap, groupShapesFor, groupShapeLabel, dealBalancedIntoShape, TEE_GROUP_SHAPE_OPTS } from '@/lib/pool-game';
import { proposePlayingGroups } from './shared';

export function PlayingGroupsStep({
  course, players, teams, setTeams, handicapAllowance, handicapBasis, nine, onNext, onBack,
}: {
  course: CourseSelection | null;
  players: Player[];
  teams: PoolTeam[]; setTeams: (t: PoolTeam[]) => void;
  handicapAllowance: number;
  handicapBasis: 'course' | 'index';
  nine: 'front9' | 'back9' | null;
  onNext: () => void; onBack: () => void;
}) {
  // The player being moved. Tap a player, then tap the group to move them to — the same
  // two-tap idiom the sides step already uses, so there's one gesture to learn.
  const [moving, setMoving] = useState<string | null>(null);

  const hcapOf = (p: Player): number =>
    course ? getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis, nine) : (p.handicapIndex ?? 0);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown';

  // Every shape the field can take (8 → 4+4 or 3+3+2). §5.ao: an uneven count is a QUESTION, not
  // a silent default, so these are offered rather than decided.
  const shapes = groupShapesFor(players.length, TEE_GROUP_SHAPE_OPTS);
  const currentShape = teams.map((t) => t.playerIds.length).sort((a, b) => b - a);

  function applyShape(shape: number[]) {
    // Rebuild from the balanced proposal for that shape, keeping any tee times already typed
    // (they belong to the slot, not to the players in it).
    const times = teams.map((t) => t.teeTime ?? '');
    const rebuilt = proposePlayingGroups(players, course, handicapAllowance, handicapBasis);
    // proposePlayingGroups always returns the FIRST shape; re-deal for a different group count
    // using the same balanced dealer, so every shape on this screen is balanced the same way.
    const ids = sortPlayerIdsByHcap(players.map((p) => p.id), players, course, handicapAllowance, handicapBasis);
    setTeams(dealBalancedIntoShape(ids, shape).map((playerIds, i) => ({
      id: rebuilt[i]?.id ?? crypto.randomUUID(),
      name: `Group ${i + 1}`,
      playerIds,
      matchupId: rebuilt[i]?.matchupId ?? crypto.randomUUID(),
      teeTime: times[i] ?? '',
    })));
    setMoving(null);
  }

  function moveTo(teamId: string) {
    if (!moving) return;
    setTeams(teams.map((t) => {
      const without = t.playerIds.filter((id) => id !== moving);
      if (t.id !== teamId) return { ...t, playerIds: without };
      return {
        ...t,
        playerIds: sortPlayerIdsByHcap([...without, moving], players, course, handicapAllowance, handicapBasis),
      };
    }));
    setMoving(null);
  }

  function setTeeTime(teamId: string, teeTime: string) {
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, teeTime } : t)));
  }

  // Nobody may be left out: a player in no group has no scorecard to be on.
  const assigned = new Set(teams.flatMap((t) => t.playerIds));
  const unassigned = players.filter((p) => !assigned.has(p.id));
  const canProceed = unassigned.length === 0 && teams.every((t) => t.playerIds.length > 0);

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Who&apos;s playing together?</h2>
      <p className="text-sm text-gray-600 mb-4">
        {players.length} players can&apos;t walk as one group, so they tee off separately — each group
        gets its own tee time and scorecard. <span className="text-gray-500">Your sides come next, and
        a partner can be in the other group.</span>
      </p>

      {/* The shape choice. Only shown when there IS one — at 4 or 7 players exactly one shape
          fits, and offering a single button is noise. */}
      {shapes.length > 1 && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <p className="text-sm font-medium text-gray-800 mb-1">How do they split?</p>
          <p className="text-xs text-gray-500 mb-3">
            Balanced by handicap either way — you can still move anyone by hand below.
          </p>
          <div className="flex flex-wrap gap-2">
            {shapes.map((shape) => {
              const isCurrent = shape.length === currentShape.length
                && shape.every((n, i) => n === currentShape[i]);
              return (
                <button
                  key={shape.join('-')}
                  type="button"
                  onClick={() => applyShape(shape)}
                  className={`min-h-[44px] rounded-md border px-4 py-2 text-sm font-medium ${
                    isCurrent
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                  }`}
                >
                  {groupShapeLabel(shape)}
                  <span className={`ml-1.5 text-xs ${isCurrent ? 'text-green-100' : 'text-gray-500'}`}>
                    {shape.length} group{shape.length === 1 ? '' : 's'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {teams.map((team) => (
          <div key={team.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="font-semibold text-gray-900">{team.name}</p>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                Tee time
                <input
                  type="time"
                  value={team.teeTime ?? ''}
                  onChange={(e) => setTeeTime(team.id, e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                />
              </label>
            </div>
            <ul className="divide-y divide-gray-100">
              {team.playerIds.map((pid) => (
                <li key={pid}>
                  <button
                    type="button"
                    onClick={() => setMoving(moving === pid ? null : pid)}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-2 text-left rounded ${
                      moving === pid ? 'bg-green-50 ring-1 ring-green-500' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-sm text-gray-900 truncate">{nameOf(pid)}</span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {Math.round(hcapOf(players.find((p) => p.id === pid)!))}
                    </span>
                  </button>
                </li>
              ))}
              {team.playerIds.length === 0 && (
                <li className="px-2 py-2 text-xs text-gray-400">Nobody in this group yet.</li>
              )}
            </ul>
            {/* The move target only appears while a player is selected, so the screen is quiet
                until there's a reason for it to speak. */}
            {moving && !team.playerIds.includes(moving) && (
              <button
                type="button"
                onClick={() => moveTo(team.id)}
                className="mt-2 w-full rounded-md border border-green-600 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
              >
                Move {nameOf(moving).split(' ')[0]} here
              </button>
            )}
          </div>
        ))}
      </div>

      {unassigned.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-800">
            Not in a group yet: {unassigned.map((p) => p.name).join(', ')}
          </p>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full mt-4 rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50"
      >
        Next: Sides
      </button>
    </div>
  );
}

