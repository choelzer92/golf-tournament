'use client';

import type { CourseSelection, Player } from '@/lib/game-state';
import { getPoolPlayingHandicap, defaultSubTeams, sortPlayerIdsByHcap, groupShapesFor, dealBalancedIntoShape, SIDE_SHAPE_OPTS } from '@/lib/pool-game';
import { fromLegacySubTeams, nextSideId, sideMembers, sideOfPlayer, type GameSide } from '@/lib/game-modes/sides';
import { SideNames } from '@/components/side-names';
import { HandicapChip } from '@/components/handicap-chain';

export function SubTeamsStep({
  players, course, handicapAllowance, handicapBasis, nine, sides, setSides, onNext, onBack,
}: {
  players: Player[];
  course: CourseSelection | null;
  handicapAllowance: number;
  handicapBasis: 'course' | 'index';
  nine: 'front9' | 'back9' | null;
  sides: GameSide[] | undefined;
  setSides: (v: GameSide[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const effective = sides && sides.length > 0
    ? sides
    : fromLegacySubTeams(defaultSubTeams(players.map((p) => p.id), players, course, handicapAllowance, handicapBasis));
  const sideIdOf = (id: string): string | null => sideOfPlayer(effective, id)?.id ?? null;

  function assign(playerId: string, sideId: string) {
    // Tapping the side a player is already on is a NO-OP. Filter-then-push would move them to
    // the end of the list, which changed nothing on screen but moved real money under a
    // one-ball format (F-012). Same guard as the hub's editor.
    if (sideMembers(effective, sideId).includes(playerId)) return;
    setSides(effective.map((side) => ({
      ...side,
      playerIds: side.id === sideId
        ? [...side.playerIds.filter((x) => x !== playerId), playerId]
        : side.playerIds.filter((x) => x !== playerId),
    })));
  }

  function addSide() {
    setSides([...effective, { id: nextSideId(effective), playerIds: [] }]);
  }

  function removeSide(sideId: string) {
    // The removed side's players are unassigned rather than silently moved somewhere — the
    // organizer chose who plays together, so the app shouldn't guess a new pairing.
    setSides(effective.filter((side) => side.id !== sideId));
  }

  const counts = effective.map((side) => side.playerIds.length);
  const balanced = counts.every((c) => c === counts[0]);
  const unassigned = players.filter((p) => sideIdOf(p.id) === null);

  // F-020 option C. The shapes this field could split into, and the one it's currently in.
  // Sorted descending to match `groupShapesFor`'s output so "is this the current shape?" is a
  // plain array compare rather than a set comparison.
  const shapeOptions = groupShapesFor(players.length, SIDE_SHAPE_OPTS);
  const currentShape = [...counts].sort((a, b) => b - a);

  /** Re-deal every player into `shape`, balanced by handicap, KEEPING each side's custom name. */
  function applySideShape(shape: number[]) {
    const ids = sortPlayerIdsByHcap(players.map((p) => p.id), players, course, handicapAllowance, handicapBasis);
    const buckets = dealBalancedIntoShape(ids, shape);
    // Reuse the existing side's id and name where there is one, so a side called "The Hogs"
    // survives a reshape — the ids are identity, not position (game-modes/sides.ts), and
    // re-lettering them would silently relabel money rows. New ids must be minted against the
    // list BEING BUILT, not the old one: F-036 — growing 2 sides to 4 in one reshape sliced the
    // old array past its end and minted 'c' twice, putting one player on two money sides.
    setSides(buckets.reduce<GameSide[]>((built, playerIds, i) => [...built, {
      id: effective[i]?.id ?? nextSideId(built),
      ...(effective[i]?.name ? { name: effective[i].name } : {}),
      playerIds,
    }], []));
  }
  const emptySides = effective.filter((side) => side.playerIds.length === 0);
  const chcp = (p: Player) => Math.round(getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis, nine));

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      {/* Count the sides from the DATA, always. This used to hard-code "(2 vs 2)" for any two-side
          game, which was true while two sides meant two pairs — and became a lie the moment an
          uneven split was reachable: five players split 3–2 read "Sides (2 vs 2)" directly above a
          highlighted "3 v 2" button. Caught in a screenshot, not by a test. */}
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        Sides ({counts.join(' vs ')})
      </h2>
      {/* F-037: say what game this MAKES, in the words golfers use. Craig found the sides
          step and still wasn't sure he'd built a 2v2 — "Sides (2 vs 2)" names the mechanism,
          "a 2 v 2 match" names the game. Derived from the data like the header, so an uneven
          or multi-side split describes itself the same way and can't drift into a lie. */}
      <p className="text-sm text-gray-500 mb-4">
        This makes it a <span className="font-medium text-gray-700">{counts.join(' v ')}</span>
        {counts.length === 2 ? ' match' : ` game — ${counts.length} sides, each playing the others`}.
        Assign each player to a side. Seeded to balance handicaps — adjust as you like.
      </p>

      {/* F-020 option C: PROPOSE the splits instead of picking one silently.
          `defaultSubTeams` special-cases exactly four players and otherwise alternates low/high,
          so five became 3 v 2 with nothing on screen admitting a choice had been made — when 3v2,
          2v2-plus-a-solo and five singles are all legitimate and only the group knows which
          (§5.ao). Same control as the Groups step, so there's one pattern for "the app proposes,
          you adjust". Hidden when only one shape fits, since a lone button is noise. */}
      {shapeOptions.length > 1 && (
        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <p className="text-sm font-medium text-gray-800 mb-1">How do the sides split?</p>
          <p className="text-xs text-gray-500 mb-3">
            Balanced by handicap whichever you pick — then move anyone below.
          </p>
          <div className="flex flex-wrap gap-2">
            {shapeOptions.map((shape) => {
              const isCurrent = shape.length === currentShape.length
                && shape.every((n, i) => n === currentShape[i]);
              return (
                <button
                  key={shape.join('-')}
                  type="button"
                  onClick={() => applySideShape(shape)}
                  className={`min-h-[44px] rounded-md border px-4 py-2 text-sm font-medium ${
                    isCurrent
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                  }`}
                >
                  {shape.join(' v ')}
                  <span className={`ml-1.5 text-xs ${isCurrent ? 'text-green-100' : 'text-gray-500'}`}>
                    {shape.length} side{shape.length === 1 ? '' : 's'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
        {players.map((p) => {
          const mine = sideIdOf(p.id);
          // flex-wrap so the F-043 chain panel (opened from the CHcp chip) can drop to
          // its own full-width line under the row.
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-x-2 px-4 py-3">
              <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">{p.name}</span>
              {course && (
                <HandicapChip
                  player={p}
                  course={course}
                  allowance={handicapAllowance}
                  basis={handicapBasis}
                  nine={nine}
                  chipClassName="flex-shrink-0 text-xs text-gray-400 tabular-nums"
                >
                  CHcp {chcp(p)}
                </HandicapChip>
              )}
              <div className="flex gap-1.5 ml-auto">
                {effective.map((side) => (
                  <button
                    key={side.id}
                    type="button"
                    onClick={() => assign(p.id, side.id)}
                    className={`w-9 h-9 rounded-full text-sm font-bold transition ${
                      mine === side.id ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {side.id.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional custom names, one field per side that exists (F-014). Collapsed by default —
          the board already reads "Craig & Jym", so almost nobody opens this. */}
      <SideNames sides={effective} players={players} onChangeAction={setSides} idPrefix="wizard-side-name" />

      {/* Add / remove a side. Hidden behind nothing, but deliberately below the assignment
          list: two sides is the default and most groups never touch this. */}
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={addSide}
          disabled={effective.length >= players.length}
          className="text-sm font-medium text-green-700 hover:text-green-900 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add a side
        </button>
        {effective.length > 2 && (
          <button
            type="button"
            onClick={() => removeSide(effective[effective.length - 1].id)}
            className="text-sm font-medium text-gray-500 hover:text-gray-800"
          >
            Remove side {effective[effective.length - 1].id.toUpperCase()}
          </button>
        )}
      </div>

      {!balanced && (
        <p className="text-xs text-amber-700 mt-2">
          Sides are uneven ({counts.join(' vs ')}). That works — handicaps still apply per player — but
          it is worth a look before you start.
        </p>
      )}
      {unassigned.length > 0 && (
        <p className="text-xs text-amber-700 mt-2">
          {unassigned.map((p) => p.name.split(' ')[0]).join(', ')} {unassigned.length === 1 ? 'is' : 'are'} not on a side yet.
        </p>
      )}

      <button
        onClick={onNext}
        disabled={emptySides.length > 0 || unassigned.length > 0}
        className="mt-6 w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Review &amp; Create
      </button>
    </div>
  );
}

