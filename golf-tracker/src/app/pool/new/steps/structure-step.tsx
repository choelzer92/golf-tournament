'use client';

import { useState, useEffect } from 'react';
import { isAppOwner } from '@/lib/invite-gate';
import { getCreatorGhin } from '@/lib/pool-identity';
import { type RosterGroup, hydrateGroups, getGroupById } from '@/lib/roster-groups';
import { getFormats, getGroupFormats } from '@/lib/pool-formats';
import { GAME_MODES, modeFits } from '@/lib/game-modes';
import {
  structureOptionId,
  structureOptionsFor,
  type StructureOption,
  type StructureShape,
} from '@/lib/game-structure';

// Step 2 of the wizard — "How do you want to compete?" (§5.bk, plan §3.1 / §6).
//
// ONE question: the shape of the game — N teams of K, or everyone for themselves. The old step
// here was a picker over two containers ("Pool (foursomes vs foursomes)" vs "Sides / Match" vs
// the individual modes) whose difference the owner could not tell apart (§5.bk). The container is
// now the ROUTER's business (lib/game-structure.ts); nothing on this screen names one.
//
// Saved formats stay a choice at this step (§5.av): picking one fills everything and turns the
// next steps into confirmations (F-021).
export function StructureStep({
  name, setName,
  playerCount,
  structure, setStructure,
  sourceGroupId,
  appliedFormat, formatDirty, onFormatEdited, summaryLine,
  onFormatChosen, onFormatCleared,
  onNext, onBack,
}: {
  name: string; setName: (s: string) => void;
  playerCount: number;
  structure: StructureShape | undefined;
  /** User picked a shape. The page resets scoring/money defaults for it and drops stale sides. */
  setStructure: (shape: StructureShape) => void;
  sourceGroupId: string | undefined;
  appliedFormat: string | undefined;
  formatDirty: boolean;
  onFormatEdited: () => void;
  /** The F-021 one-line summary of the applied format (game · stakes · handicaps). */
  summaryLine: string;
  onFormatChosen: (f: RosterGroup) => void;
  onFormatCleared: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  // §5.av: saved formats are CHOICES here, not a detour before it.
  const [formats, setFormats] = useState<RosterGroup[]>([]);
  useEffect(() => {
    hydrateGroups({ viewerGhin: getCreatorGhin(), isOwner: isAppOwner() })
      .then(() => setFormats(getFormats()))
      .catch(() => {});
  }, []);
  // F-046: the chosen group's usual games lead, labeled as the group's.
  const sourceGroup = sourceGroupId ? getGroupById(sourceGroupId) : null;
  const groupFormats = sourceGroup ? getGroupFormats(sourceGroup) : [];
  const groupFormatIds = new Set(groupFormats.map((f) => f.id));
  const libraryFormats = formats.filter((f) => !groupFormatIds.has(f.id));
  const allPickerFormats = [...groupFormats, ...libraryFormats];
  const appliedFormatEntry =
    appliedFormat !== undefined && name.trim() === appliedFormat
      ? allPickerFormats.find((f) => f.name === appliedFormat)
      : undefined;

  function pickFormat(value: string) {
    if (!value) { if (appliedFormat) onFormatCleared(); return; }
    const f = allPickerFormats.find((x) => x.id === value.slice('format:'.length));
    if (f) onFormatChosen(f);
  }

  const options = structureOptionsFor(playerCount);
  const primary = options.filter((o) => o.primary);
  const other = options.filter((o) => !o.primary);
  const [showOther, setShowOther] = useState(false);
  // F-080: with a style applied, the card IS the confirmation — the select hides behind a link
  // until someone wants another style, so the format's name is on screen once, not twice.
  const [pickingAnother, setPickingAnother] = useState(false);
  const showPicker = allPickerFormats.length > 0 && (!appliedFormat || pickingAnother);
  const currentId = structure ? structureOptionId(structure) : null;
  // An uneven shape already chosen (from a draft, or the recommendation at 5/7) must be visible.
  const otherOpen = showOther || other.some((o) => o.id === currentId);

  // "Everyone for themselves" needs an individual mode that fits the field — those top out at
  // four. §4.8 of the plan: say so, don't hide it.
  const soloFits = GAME_MODES.some((m) => m.category === 'individual' && modeFits(m, playerCount));

  function choose(o: StructureOption) {
    if (o.kind === 'solo' && !soloFits) return;
    if (appliedFormat && o.id !== currentId) onFormatEdited();
    setStructure({ kind: o.kind, teamSizes: o.teamSizes });
  }

  const canProceed = name.trim().length > 0 && structure !== undefined;

  function row(o: StructureOption) {
    const disabled = o.kind === 'solo' && !soloFits;
    const selected = o.id === currentId;
    return (
      <label
        key={o.id}
        className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 min-h-[44px] ${
          disabled ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
            : selected ? 'border-green-600 bg-green-50 cursor-pointer'
            : 'border-gray-300 bg-white hover:border-green-400 cursor-pointer'
        }`}
      >
        <input
          type="radio"
          name="structure"
          value={o.id}
          checked={selected}
          disabled={disabled}
          onChange={() => choose(o)}
          className="mt-1 h-4 w-4 accent-green-700"
          aria-label={o.label}
        />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>
            {o.label}
            {o.recommended && !disabled && <span className="ml-2 text-xs font-normal text-green-700">the usual</span>}
            {disabled && <span className="ml-2 text-xs font-normal text-gray-400">needs 2–4 players</span>}
          </span>
          <span className={`block text-xs ${disabled ? 'text-gray-400' : 'text-gray-500'}`}>{o.detail}</span>
        </span>
      </label>
    );
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">How do you want to compete?</h2>
        <span className="text-sm text-gray-500">{playerCount} player{playerCount === 1 ? '' : 's'}</span>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        {/* The name lives in the F-021 card when a format was applied — never two inputs bound
            to one value. */}
        {!appliedFormat && (
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">What should we call it?</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Saturday Pool"
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
        )}

        {/* F-021 / §5.ax — an applied format is a CONFIRMATION. The title is an input, always:
            rename it and it's a new style, the original untouched. */}
        {appliedFormat && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-xs font-medium text-green-800">Your saved game style</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Game style name"
              className="mt-0.5 w-full bg-transparent text-base font-semibold text-gray-900 border-0 border-b border-transparent px-0 py-0 focus:border-green-500 focus:outline-none focus:ring-0"
            />
            <p className="mt-1 text-xs text-gray-700">{summaryLine}</p>
            {formatDirty && appliedFormat !== name.trim() && (
              <p className="mt-1 text-xs text-gray-500">↳ based on {appliedFormat}</p>
            )}
            {formatDirty && appliedFormat === name.trim() && (
              <p className="mt-1 text-xs text-amber-700">
                Changed from your saved {appliedFormat} — rename it above to keep both.
              </p>
            )}
            <p className="mt-2 text-xs text-gray-600">
              Everything is already set — change anything below to fork it.{' '}
              <button type="button" onClick={() => { setPickingAnother(false); onFormatCleared(); }} className="font-medium text-green-700 hover:underline">Start fresh</button>
              {allPickerFormats.length > 1 && !pickingAnother && (
                <>
                  {' · '}
                  <button type="button" onClick={() => setPickingAnother(true)} className="font-medium text-green-700 hover:underline">Pick another style</button>
                </>
              )}
            </p>
          </div>
        )}

        {/* §5.av / F-046: saved styles, the group's first. A native select: one control, works on
            every phone. Empty when nothing is saved — a first-time user sees only the question. */}
        {showPicker && (
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">{appliedFormat ? 'Pick another saved game style' : 'Or play a saved game style'}</label>
            <select
              value={appliedFormatEntry ? `format:${appliedFormatEntry.id}` : ''}
              onChange={(e) => { setPickingAnother(false); pickFormat(e.target.value); }}
              aria-label="Saved game style"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="">{appliedFormatEntry ? 'Start fresh instead' : 'Pick a saved style…'}</option>
              {sourceGroup && groupFormats.length > 0 && (
                <optgroup label={`${sourceGroup.name} plays`}>
                  {groupFormats.map((f) => (
                    <option key={f.id} value={`format:${f.id}`}>{f.name}</option>
                  ))}
                </optgroup>
              )}
              {libraryFormats.length > 0 && (
                <optgroup label={groupFormats.length > 0 ? 'Other saved games' : 'Your saved games'}>
                  {libraryFormats.map((f) => (
                    <option key={f.id} value={`format:${f.id}`}>{f.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        )}

        {/* THE question. Even shapes first (and the recommendation, even when it's uneven — five
            players are 3 + 2); every other split under one reveal (§5.bm Q3). */}
        <div className={appliedFormat || allPickerFormats.length > 0 ? 'pt-2 border-t' : ''}>
          <p className="text-sm font-medium text-gray-800 mb-2">Teams or singles?</p>
          <div className="space-y-2" role="radiogroup" aria-label="How do you want to compete?">
            {primary.map(row)}
            {otherOpen && other.map(row)}
          </div>
          {other.length > 0 && !otherOpen && (
            <button
              type="button"
              onClick={() => setShowOther(true)}
              className="mt-2 text-sm font-medium text-green-700 hover:text-green-900"
            >
              Other split… <span className="text-xs font-normal text-gray-500">({other.map((o) => o.teamSizes.join(' + ')).slice(0, 2).join(', ')}{other.length > 2 ? ', …' : ''})</span>
            </button>
          )}
          {/* F-041: "Stableford" names a scoring system, not only the 2–4 player game. Say where
              the scoring lives on for a field the individual modes can't hold. */}
          {!soloFits && playerCount > 4 && (
            <p className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800">
              {playerCount} players can still score Stableford — as teams: pick a split above and choose Stableford points on the next step.
            </p>
          )}
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="mt-6 w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Scoring
      </button>
    </div>
  );
}
