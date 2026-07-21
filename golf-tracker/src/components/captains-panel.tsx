'use client';

import type { Player, CourseSelection } from '@/lib/game-state';
import { getPoolPlayingHandicap, rankPlayersForCaptain } from '@/lib/pool-game';

// Captains panel — one captain slot per team, shown prominently above team
// building. By default the captains are the lowest course handicaps in the field
// (one per team); the organizer can freely reassign any slot. Picking a player
// who already captains another slot SWAPS the two, so nobody captains twice.
//
// Like PairingLocks, the apply step ("Build balanced teams around captains")
// lives RIGHT HERE so the connection is unmissable for a non-technical organizer:
// set captains → tap the green button → teams are built with each captain fixed
// on their own team and everyone else balanced evenly around them.
export function CaptainsPanel({
  players, course, handicapAllowance, numTeams, captainIds, setCaptainIdsAction, onApplyAction,
}: {
  players: Player[];
  course: CourseSelection | null;
  handicapAllowance: number;
  numTeams: number;
  captainIds: string[];                          // length numTeams; '' = unset slot
  setCaptainIdsAction: (ids: string[]) => void;
  // When provided, shows the prominent "build balanced teams around captains" button.
  onApplyAction?: () => void;
}) {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '';
  const chcpOf = (id: string) => {
    const p = players.find((x) => x.id === id);
    return p && course ? Math.round(getPoolPlayingHandicap(p, course, handicapAllowance)) : null;
  };

  // Field ordered best-first, for the "auto-pick" hint and dropdown ordering.
  const ranked = rankPlayersForCaptain(players, course, handicapAllowance);
  const orderedPlayers = ranked
    .map((r) => players.find((p) => p.id === r.playerId))
    .filter((p): p is Player => !!p);

  // Normalize the working array to exactly numTeams slots.
  const slots: string[] = Array.from({ length: Math.max(1, numTeams) }, (_, i) => captainIds[i] ?? '');

  function setCaptain(slotIndex: number, playerId: string) {
    const next = [...slots];
    if (playerId) {
      const existing = next.findIndex((id, i) => id === playerId && i !== slotIndex);
      if (existing >= 0) next[existing] = next[slotIndex]; // swap: other slot takes who was here
    }
    next[slotIndex] = playerId;
    setCaptainIdsAction(next);
  }

  function autoPick() {
    // The N lowest course handicaps, one per slot (skips no-index players).
    const picks = ranked.filter((r) => r.eligible).slice(0, slots.length).map((r) => r.playerId);
    setCaptainIdsAction(Array.from({ length: slots.length }, (_, i) => picks[i] ?? ''));
  }

  const filledCount = slots.filter(Boolean).length;
  const enoughPlayers = players.length >= slots.length;

  return (
    <div className="rounded-lg border border-green-300 bg-green-50/60 p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-gray-900">Captains ({slots.length})</p>
        <button
          onClick={autoPick}
          className="rounded-md border border-green-700 bg-white px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
        >
          Auto-pick lowest handicaps
        </button>
      </div>
      <p className="text-xs text-gray-600 mb-2.5">
        One captain per team — the lowest course handicaps by default. Each captain anchors their own
        team; everyone else is balanced evenly around them. Change any captain below.
      </p>

      {!enoughPlayers && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
          Add more players — you need at least {slots.length} for {slots.length} team{slots.length === 1 ? '' : 's'}.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {slots.map((capId, i) => {
          const chcp = capId ? chcpOf(capId) : null;
          return (
            <label key={i} className="flex items-center gap-2 rounded-md bg-white border border-gray-200 px-2 py-1.5">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-700 text-[11px] font-bold text-white" title="Captain">
                C{i + 1}
              </span>
              <select
                value={capId}
                onChange={(e) => setCaptain(i, e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-green-500 focus:outline-none"
              >
                <option value="">— pick captain —</option>
                {orderedPlayers.map((p) => {
                  const h = chcpOf(p.id);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name}{h !== null ? ` (${h})` : ''}
                    </option>
                  );
                })}
              </select>
              {chcp !== null && (
                <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700 tabular-nums" title="Course handicap">
                  {chcp}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {onApplyAction && (
        <button
          onClick={onApplyAction}
          disabled={filledCount === 0}
          className="mt-3 w-full rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
        >
          Build balanced teams around captains
        </button>
      )}
    </div>
  );
}
