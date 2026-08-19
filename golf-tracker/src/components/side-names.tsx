'use client';

import { useState } from 'react';
import type { GameSide } from '@/lib/game-modes/sides';
import { sideNameFrom } from '@/lib/game-modes/team-game';
import type { Player } from '@/lib/game-state';

// Optional custom names for the sides a game ACTUALLY has (F-014).
//
// WHY THIS IS A COMPONENT AND NOT SETTINGS. Names used to be six static keys in the generic
// settings bag (`sideAName`..`sideFName`), because six is the ceiling at playersMax 8. A static
// schema cannot express "one field per side that exists", so a two-side game rendered four
// always-blank boxes and every consumer had to remember to hide them. Two of three remembered;
// the third shipped six empty rows to every player (F-015). And the wizard couldn't get it right
// at all: it shows mode options BEFORE sides are chosen, so a third side added later could never
// be named anywhere in the wizard.
//
// One field per real side removes the whole class of problem. `AGENTS.md` calls a bespoke control
// a design smell — worth noting the Sides editor this lives in is already bespoke, and the
// alternative was two more surfaces silently disagreeing.
//
// COLLAPSED BY DEFAULT. Almost nobody names their sides; the board already reads "Craig & Jym".
// So this is a disclosure, not a field — "just the usual game" never opens it. It opens itself
// when any side already HAS a name, so an existing game's names are never hidden from the person
// editing them.
export function SideNames({
  sides, players, onChangeAction, idPrefix = 'side-name',
}: {
  sides: GameSide[];
  players: Pick<Player, 'id' | 'name'>[];
  /** Called with the full updated collection, so the caller persists sides in one write. */
  onChangeAction: (sides: GameSide[]) => void;
  /** Distinguishes the inputs when two of these render on one page. */
  idPrefix?: string;
}) {
  const anyNamed = sides.some((s) => (s.name ?? '').trim() !== '');
  const [open, setOpen] = useState(anyNamed);

  if (sides.length === 0) return null;

  function setName(sideId: string, name: string) {
    onChangeAction(sides.map((s) => (s.id === sideId ? { ...s, name } : s)));
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-green-700 hover:text-green-900"
      >
        {open ? '▾' : '▸'} Name the sides
        {!open && anyNamed && <span className="ml-1 text-xs text-gray-500">(set)</span>}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-gray-500">
            Optional. Leave blank and a side is named after its players.
          </p>
          {sides.map((side) => {
            const fieldId = `${idPrefix}-${side.id}`;
            // The placeholder shows what the board WILL say if this is left blank, so the
            // consequence of not typing anything is visible rather than implied.
            const auto = sideNameFrom(players, side.playerIds, side.id, undefined);
            return (
              <div key={side.id} className="flex items-center gap-2">
                <label htmlFor={fieldId} className="w-14 shrink-0 text-sm font-medium text-gray-700">
                  Side {side.id.toUpperCase()}
                </label>
                <input
                  id={fieldId}
                  type="text"
                  value={side.name ?? ''}
                  onChange={(e) => setName(side.id, e.target.value)}
                  placeholder={auto}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
