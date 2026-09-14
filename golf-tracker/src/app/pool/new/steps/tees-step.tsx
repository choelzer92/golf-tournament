'use client';

import { useState } from 'react';
import type { CourseSelection, Player } from '@/lib/game-state';
import { getPoolPlayingHandicap } from '@/lib/pool-game';
import { upsertRosterPlayer } from '@/lib/roster';

export function TeesStep({
  course, players, setPlayers, handicapAllowance, handicapBasis, nine, nextLabel, onNext, onBack,
}: {
  course: CourseSelection | null;
  players: Player[]; setPlayers: (p: Player[]) => void;
  handicapAllowance: number;
  handicapBasis: 'course' | 'index';
  nine: 'front9' | 'back9' | null;
  /** What the next step is CALLED for this game — "Sides" in a side game, "Teams" in a pool
      (§5.al). Passed in rather than derived, since only the caller knows the mode. */
  nextLabel: string;
  onNext: () => void; onBack: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  function changePlayerTee(id: string, teeSetId: number) {
    setPlayers(players.map((p) => (p.id === id ? { ...p, teeSetId } : p)));
    setEditingId(null);
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

  // Group players by their assigned tee, in the course's tee order.
  const groups = (course?.teeSets || [])
    .map((tee) => ({
      tee,
      members: players.filter((p) => (p.teeSetId ?? course?.selectedTeeId) === tee.id),
    }))
    .filter((g) => g.members.length > 0);
  const unassigned = players.filter((p) => !course?.teeSets.some((t) => t.id === (p.teeSetId ?? course?.selectedTeeId)));

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Tees ({players.length})</h2>
      <p className="text-sm text-gray-500 mb-4">Who&apos;s playing from where. Tap a player to change their tee. You can also adjust tees later in Teams.</p>

      {!course || course.teeSets.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">No course selected — go back and pick a course to assign tees.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map(({ tee, members }) => (
            <div key={tee.id} className="bg-white rounded-lg shadow p-3">
              <div className="flex items-baseline justify-between mb-2 border-b pb-1">
                <p className="text-sm font-semibold text-gray-900">{tee.name}</p>
                <span className="text-xs text-gray-500">{members.length}</span>
              </div>
              <ul className="space-y-1">
                {members.map((p) => {
                  const hcap = course ? Math.round(getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis, nine)) : null;
                  const g: 'M' | 'F' = p.gender === 'F' ? 'F' : 'M';
                  const genderTees = course.teeSets.filter((t) => (t.gender ?? 'M') === g);
                  const teeOptions = genderTees.length > 0 ? genderTees : course.teeSets;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                        className="w-full flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-gray-50 text-left"
                      >
                        <span className="text-sm text-gray-900 truncate">
                          {p.name}
                          <span className={`ml-1 text-xs ${g === 'F' ? 'text-pink-500' : 'text-blue-500'}`}>{g}</span>
                          {hcap !== null && <span className="ml-1 text-xs text-gray-500">({hcap})</span>}
                        </span>
                        <span className="text-xs text-gray-400">{editingId === p.id ? '▾' : 'change'}</span>
                      </button>
                      {editingId === p.id && (
                        <div className="flex flex-wrap gap-1 px-2 pb-2 pt-1">
                          {teeOptions.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => changePlayerTee(p.id, t.id)}
                              className={`text-xs px-2 py-0.5 rounded-full border ${
                                t.id === p.teeSetId
                                  ? 'bg-green-700 text-white border-green-700'
                                  : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                              }`}
                            >
                              {t.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {unassigned.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-amber-800 mb-2">No tee yet</p>
              <p className="text-xs text-amber-700">{unassigned.map((p) => p.name).join(', ')}</p>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onNext}
        className="w-full mt-4 rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800"
      >
        Next: {nextLabel}
      </button>
    </div>
  );
}

// F-019 — WHO WALKS WITH WHOM. A side game's tee sheet, asked separately from its sides because
// the two are independent: your partner may be in the other foursome (§5.an).
//
// WHY NOT REUSE TeamsStep, which the design suggested. It answers the same question but is built
// around the classic pool's needs: a captains panel (a side game has no captain role), three
// team-building methods with an optimizer, pairing locks, and "Set Teams" vocabulary throughout —
// which is the exact team/side conflation F-019 is about (§5.al). Reusing it would mean threading
// a mode flag through ~10 labels and hiding three panels. The genuine reuse is of the pure
// helpers, which is where the logic lives: groupShapesFor, sortPlayerIdsByHcap,
// proposePlayingGroups. This component is the thin phone-first shell over them.
