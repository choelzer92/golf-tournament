'use client';

import { useState, useEffect } from 'react';
import type { PoolJunkValues, PoolMoneyMode } from '@/lib/pool-game';
import { getAccessLevel } from '@/lib/invite-gate';
import { getCreatorGhin } from '@/lib/pool-identity';
import { type RosterGroup, hydrateGroups, getGroupById } from '@/lib/roster-groups';
import { getFormats, getGroupFormats } from '@/lib/pool-formats';
import { teamModeForFormat, TEAM_FORMAT_OPTIONS, type ScoreBasis, type TeamFormat } from '@/lib/game-modes/team-scoring';
import { unusedSideNameKeys } from '@/lib/game-modes/sides';
import { TEAM_MODES } from '@/lib/formats';
import { GAME_MODES, getGameMode, defaultSettings, playerRangeSentence, fitBadge, fitExplanation, modeFits, formatSummaryLine, type SettingsBag } from '@/lib/game-modes';
import { ModeSettingsEditor } from '@/components/mode-settings-editor';

export function DetailsStep({
  name, setName,
  gameMode, setGameMode, modeSettings, setModeSettings,
  entryPerPlayer, setEntryPerPlayer, handicapAllowance, setHandicapAllowance,
  strokeMethod, setStrokeMethod,
  handicapBasis, setHandicapBasis,
  positionSplitText, setPositionSplitText,
  junkValues, setJunkValues, teamFormat, setTeamFormat, teamScoreBasis, setTeamScoreBasis,
  moneyMode, setMoneyMode, matchLegs, setMatchLegs, matchJunkPerPoint, setMatchJunkPerPoint,
  onFormatChosen, onFormatCleared,
  playerCount, sourceGroupId,
  appliedFormat, formatDirty, onFormatEdited,
  onNext, onBack,
}: {
  name: string; setName: (s: string) => void;
  gameMode: string | undefined; setGameMode: (v: string | undefined) => void;
  modeSettings: SettingsBag; setModeSettings: (v: SettingsBag) => void;
  entryPerPlayer: string; setEntryPerPlayer: (s: string) => void;
  handicapAllowance: string; setHandicapAllowance: (s: string) => void;
  strokeMethod: 'full' | 'off-the-low'; setStrokeMethod: (v: 'full' | 'off-the-low') => void;
  handicapBasis: 'course' | 'index'; setHandicapBasis: (v: 'course' | 'index') => void;
  positionSplitText: string; setPositionSplitText: (s: string) => void;
  junkValues: PoolJunkValues; setJunkValues: (v: PoolJunkValues) => void;
  teamFormat: TeamFormat; setTeamFormat: (v: TeamFormat) => void;
  teamScoreBasis: ScoreBasis; setTeamScoreBasis: (v: ScoreBasis) => void;
  moneyMode: PoolMoneyMode; setMoneyMode: (v: PoolMoneyMode) => void;
  matchLegs: { front: string; back: string; overall: string };
  setMatchLegs: (v: { front: string; back: string; overall: string }) => void;
  matchJunkPerPoint: string; setMatchJunkPerPoint: (s: string) => void;
  /** §5.av: a saved format picked from the game picker — fills everything. */
  onFormatChosen: (f: RosterGroup) => void;
  /** §5.av: a raw mode picked while a format was applied — configure fresh. */
  onFormatCleared: () => void;
  /** How many players are in the field. Real by the time this step renders (§5.au — the
      field comes first), so every F-020 fit annotation has something true to say. */
  playerCount: number;
  /** F-046: the group chosen on the field step (game.sourceGroupId), or undefined. The group
      knows its usual games (defaults.formatIds) — they must lead the picker HERE, at the
      moment of choosing, not sit unlabeled in the flat library list. */
  sourceGroupId: string | undefined;
  /** The saved format this game started from, or undefined when built from scratch. When set, this
      step shows a SUMMARY with per-section [Change] instead of ~15 fields (F-021, §5.ax). */
  appliedFormat: string | undefined;
  /** True once any of the format's values has been edited — turns the title into "rename to fork". */
  formatDirty: boolean;
  /** Called on the first edit to a format-owned value. */
  onFormatEdited: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const selectedMode = getGameMode(gameMode);

  // §5.av: saved formats are CHOICES AT THE GAME STEP, not a detour before it. The library
  // stored whole styles all along, but its only entry point was a button on /pool — invisible
  // at the moment of choosing a game, so every round re-answered ~15 questions.
  // (The group question lives on the FIELD step, which now comes first — §5.au.)
  const [formats, setFormats] = useState<RosterGroup[]>([]);
  useEffect(() => {
    hydrateGroups({ viewerGhin: getCreatorGhin(), isOwner: getAccessLevel() === 'full' })
      .then(() => setFormats(getFormats()))
      .catch(() => {});
  }, []);

  // F-046: the group chosen on the field step knows its usual games (defaults.formatIds) —
  // they lead the picker HERE, labeled as the group's, instead of sitting unlabeled in the
  // flat library list. Craig saved "Friday game" for the Friday group and still had to go
  // hunting for it at the moment the group was already chosen. Resolved from the same
  // hydrated cache as `formats` (the setFormats above re-renders once it lands); deduped out
  // of the library list so nothing appears twice.
  const sourceGroup = sourceGroupId ? getGroupById(sourceGroupId) : null;
  const groupFormats = sourceGroup ? getGroupFormats(sourceGroup) : [];
  const groupFormatIds = new Set(groupFormats.map((f) => f.id));
  const libraryFormats = formats.filter((f) => !groupFormatIds.has(f.id));
  // Everything pickable, group formats first. pickGame and the applied-format lookup search
  // THIS list, so a group-attached format missing from the personal library still resolves.
  const allPickerFormats = [...groupFormats, ...libraryFormats];

  // What the game <select> shows. An applied, un-forked format IS the answer to "which game
  // are you playing?" — so the select names it, whichever way it was applied (this picker or
  // a seed from the library/group page). Once renamed into a fork it's a new style, and the
  // select falls back to the underlying mode.
  const appliedFormatEntry =
    appliedFormat !== undefined && name.trim() === appliedFormat
      ? allPickerFormats.find((f) => f.name === appliedFormat)
      : undefined;
  const gamePickerValue = appliedFormatEntry ? `format:${appliedFormatEntry.id}` : (gameMode ?? 'pool');

  // F-021: which sections the user has EXPANDED by hand. Nothing is ever unreachable — every
  // section has its own [Change] button.
  //
  // Stored as "opened by hand", not "is open", because `useState(!appliedFormat)` was wrong: the
  // format seed is consumed in a mount effect in the parent, so on the first render appliedFormat is
  // still undefined and every section initialised OPEN — the panel rendered and closed nothing. A
  // derived value can't be seeded from a prop that arrives later.
  const [openedGame, setOpenedGame] = useState(false);
  const [openedMoney, setOpenedMoney] = useState(false);
  const [openedHandicaps, setOpenedHandicaps] = useState(false);
  // With no format applied this step is exactly as it always was: everything visible.
  const showModeSettings = !appliedFormat || openedGame;
  const showMoney = !appliedFormat || openedMoney;
  const showHandicaps = !appliedFormat || openedHandicaps;
  const setShowModeSettings = setOpenedGame;
  const setShowMoney = setOpenedMoney;
  const setShowHandicaps = setOpenedHandicaps;

  // Any registered game mode (individual OR 2v2 within-group) is a single-group
  // game: it renders ITS OWN options (via the mode's settings schema) and does
  // NOT use the classic team-pool "Game Type / pot / match / junk / ball" block.
  // Only the classic foursome-vs-foursome pool (no gameMode) uses that block.
  const isRegisteredMode = !!selectedMode;
  // Pick a game type: a saved format (fills everything — §5.av), the classic team
  // pool, or one of the registered games. Selecting a raw mode seeds its norm
  // defaults into modeSettings — and configures FRESH, dropping any applied format.
  function pickGame(value: string) {
    if (value.startsWith('format:')) {
      const f = allPickerFormats.find((x) => x.id === value.slice('format:'.length));
      if (f) onFormatChosen(f);
      return;
    }
    if (appliedFormat) onFormatCleared();
    const id = value === 'pool' ? undefined : value;
    setGameMode(id);
    const mode = getGameMode(id);
    if (mode) {
      setModeSettings(defaultSettings(mode.settings));
      // A registered mode carries its own money settings and hides the classic
      // pot/match toggle. Clear any stale 'match' (e.g. from a prior draft) so it
      // can't leak into the review/hub as a contradictory head-to-head warning.
      setMoneyMode('pot');
    }
  }
  // (The old three-entry `ballOptions` list is gone — TEAM_FORMAT_OPTIONS is its superset,
  // and the first three entries save identically to the legacy path.)

  // USGA recommended handicap allowance for the format being played. The tables
  // already live in lib/formats.ts (TEAM_MODES.usgaAllowance, plus per-format
  // overrides) but the wizard never surfaced them — so an organizer had to know
  // that four-ball is 85% and a scramble is tiered. Craig asked for these to be
  // shown per format.
  //
  // Returns null when there's no single recommended number (scramble is tiered by
  // team size, so quoting one figure would be wrong).
  const usgaRec: { pct: number; note: string } | null = (() => {
    if (isRegisteredMode && selectedMode) {
      // 2v2 modes carry their own allowance semantics in modeSettings; the classic
      // per-format table doesn't apply cleanly, so stay silent rather than guess.
      if (selectedMode.category === 'team-within-group') return null;
      return { pct: 95, note: 'USGA suggests 95% for individual stroke play' };
    }
    // The allowance follows the FORMAT — a scramble is nothing like four-ball. Read it from
    // the one table in lib/formats.ts (TEAM_MODES[].usgaAllowance) rather than repeating the
    // percentages here, so the two can't drift.
    const mode = TEAM_MODES.find((m) => m.id === teamModeForFormat(teamFormat));
    if (!mode) return null;
    // Scramble is tiered by team size (35/15, 20/15/10, …), so no single figure is right.
    if (mode.usgaAllowance === 'tiered') return null;
    const pct = mode.usgaAllowance;
    if (teamFormat === 'net-and-gross' || teamFormat === 'two-best-net' || teamFormat === 'two-best-gross') {
      // Two-ball formats are four-ball; the USGA number differs between match and stroke
      // play, and the classic pool has always quoted 85% for the stroke-play pool.
      // F-044: the two numbers differ because head-to-head IS match play and the pot IS stroke
      // play — say which toggle answer drove the number, or the 85↔90 flip looks like a glitch.
      return moneyMode === 'match'
        ? { pct: 90, note: 'USGA suggests 90% for four-ball match play (head-to-head)' }
        : { pct: 85, note: 'USGA suggests 85% for four-ball stroke play (pot — two scores counting)' };
    }
    return { pct, note: `USGA suggests ${pct}% for ${mode.name.toLowerCase()}` };
  })();
  const usgaApplied = usgaRec !== null && Math.round(parseFloat(handicapAllowance)) === usgaRec.pct;

  const canProceed = name.trim().length > 0;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">What are you playing?</h2>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        {/* The name lives in the F-021 summary panel when a format was applied — TWO inputs bound
            to the same value is the kind of thing only a screenshot shows. */}
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

        {/* Game picker: classic team pool, or a registered individual game.
            Choosing an individual game reveals only that game's options below. */}
        <div className="pt-2 border-t">
          <label className="block text-sm font-medium text-gray-800 mb-1">Which game are you playing?</label>
          <select
            value={gamePickerValue}
            onChange={(e) => pickGame(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            {/* §5.av: SAVED FORMATS FIRST — "the game style you chose is usable forever".
                Picking one fills everything below; the raw modes stay for a new style.
                F-046: the chosen group's usual games lead, labeled as the group's. */}
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
            <optgroup label={allPickerFormats.length > 0 ? 'Start a new style' : 'Game types'}>
            <option value="pool">Pool (foursomes vs foursomes)</option>
            {GAME_MODES.map((m) => {
              // F-020: annotate each game with how it fits the field you actually have. The badge
              // is null until there IS a field, so a first pass through the wizard looks exactly
              // as it always did rather than marking every game with a cross.
              //
              // The label carries it because this is a native <select> — options can't hold
              // styled children, and a listbox rebuilt for badges would be a bigger bet on this
              // screen than F-020 asked for (option A's mistake). Text in the label works on
              // every phone and with a screen reader.
              const badge = fitBadge(m, playerCount);
              return (
                <option key={m.id} value={m.id}>
                  {m.name}{badge ? ` — ${badge}` : ''}
                </option>
              );
            })}
            </optgroup>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {appliedFormatEntry
              ? 'Your saved style — everything below is already set.'
              : selectedMode
              ? `${selectedMode.description} ${playerRangeSentence(selectedMode)}`
              : 'The classic buy-in pool or head-to-head match across foursomes.'}
          </p>
          {/* The one thing the old flow never said HERE: this game can't be played by this field.
              It used to wait until the review step, five steps on. Not disabled — the organizer may
              be about to add the missing player — but it can no longer be a surprise at the end. */}
          {fitExplanation(selectedMode, playerCount) && (
            <p className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
              {fitExplanation(selectedMode, playerCount)}
              {' '}
              {(() => {
                // Point at what WOULD work, so the constraint arrives with an option attached
                // rather than as a dead end. §5.ao: guidance, not validation.
                const alternatives = GAME_MODES.filter((m) => modeFits(m, playerCount)).map((m) => m.name);
                // F-041: the mode NAME is also a scoring system's name, and the golfer reads
                // "Stableford — 4 too many" as "this app can't play Stableford with 8". The pool
                // scores any field Stableford (its Strokes/Stableford toggle), and Sides/Match
                // carries the same toggle to 8 — so when the refused mode's SCORING lives on in
                // a structure that fits, say that instead of just listing other game names.
                const scoringCarriers: Record<string, string> = {
                  'stableford-ind': 'Stableford', quota: 'points-to-quota',
                };
                const scoring = selectedMode ? scoringCarriers[selectedMode.id] : undefined;
                if (scoring && playerCount > selectedMode!.playersMax) {
                  const sides = getGameMode('team-2v2');
                  const sidesFit = sides && modeFits(sides, playerCount);
                  return `${playerCount} players can still score ${scoring} — as a team Pool (see "How is the hole scored?")${sidesFit ? ' or as Sides / Match' : ''}.`;
                }
                return alternatives.length > 0
                  ? `${alternatives.length === 1 ? 'This one fits' : 'These fit'} ${playerCount}: ${alternatives.join(', ')}.`
                  : `A team pool works with any number.`;
              })()}
            </p>
          )}
          {/* F-033: with 2–3 players and the classic pool selected, the screen fills with
              foursomes settings and nothing says six other games fit this field — the fit
              badges live inside the CLOSED dropdown, so a friend opened this exact screen
              and concluded 1v1/3-player games didn't exist. Same guidance-not-validation
              posture (§5.ao) as the warning above, which never fires for the pool because
              the pool fits any count; the default stays Pool. */}
          {!selectedMode && !appliedFormatEntry && playerCount > 0 && playerCount <= 3 && (() => {
            const fitting = GAME_MODES.filter((m) => modeFits(m, playerCount)).map((m) => m.name);
            return fitting.length > 0 ? (
              <p className="mt-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800">
                With {playerCount} player{playerCount === 1 ? '' : 's'} you can also play: {fitting.join(', ')} — all in the list above.
              </p>
            ) : null;
          })()}
        </div>

        {/* F-021 / §5.ax — WHEN A FORMAT WAS APPLIED, THIS IS A CONFIRMATION, NOT A FORM.
            A saved format answers ~15 questions in one tap, and step 1 used to re-ask every one:
            21 controls, 15 labels, 1900px of scroll, every value already correct. §5.e asked for
            "questions become confirmations" back in August; this is it.

            Nothing is hidden — each [Change] reveals the very same fields, per section, so the taps
            are only spent by someone actually changing something. And editing anything turns the
            TITLE into the affordance: rename it and it's a new style, with the original left
            untouched (§5.ax part 4 — formats are attached to groups, so silently rewriting one
            would change what a whole group sees next week). */}
        {appliedFormat && (
          <div className="pt-2 border-t">
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-green-800">Your saved game style</p>
                  {/* The title is an INPUT, always — that's what makes "call it something else"
                      the natural next move rather than a buried option. */}
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Game style name"
                    className="mt-0.5 w-full bg-transparent text-base font-semibold text-gray-900 border-0 border-b border-transparent px-0 py-0 focus:border-green-500 focus:outline-none focus:ring-0"
                  />
                  <p className="mt-1 text-xs text-gray-700">
                    {formatSummaryLine(selectedMode, modeSettings, parseFloat(entryPerPlayer) || 0, {
                      allowance: parseFloat(handicapAllowance) || 100,
                      strokeMethod,
                      handicapBasis,
                    })}
                  </p>
                  {/* Say where it came from once it has diverged, so "based on Saturday Nassau" is
                      visible rather than the user wondering what they've broken. */}
                  {formatDirty && appliedFormat !== name.trim() && (
                    <p className="mt-1 text-xs text-gray-500">↳ based on {appliedFormat}</p>
                  )}
                  {formatDirty && appliedFormat === name.trim() && (
                    <p className="mt-1 text-xs text-amber-700">
                      Changed from your saved {appliedFormat} — rename it above to keep both.
                    </p>
                  )}
                </div>
              </div>
              {/* Per-section reveal (§5.ax part 3). One button that reopened all 15 would just be
                  today's screen with an extra tap. */}
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  { key: 'game', label: 'Game', on: showModeSettings, set: setShowModeSettings, when: isRegisteredMode },
                  { key: 'money', label: 'Money', on: showMoney, set: setShowMoney, when: !isRegisteredMode },
                  { key: 'hcap', label: 'Handicaps', on: showHandicaps, set: setShowHandicaps, when: true },
                ] as const).filter((s) => s.when).map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => s.set(!s.on)}
                    className={`min-h-[36px] rounded-md border px-3 py-1.5 text-xs font-medium ${
                      s.on
                        ? 'border-green-600 bg-white text-green-800'
                        : 'border-green-300 bg-white text-green-700 hover:bg-green-100'
                    }`}
                  >
                    {s.on ? `Hide ${s.label}` : `Change ${s.label}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Game options for ANY registered mode — individual AND 2v2 within-group
            (2v2's Team format / Hole score / Compare-by / Money live here). */}
        {isRegisteredMode && selectedMode && showModeSettings && (
          <div className="pt-2 border-t">
            <label className="block text-sm font-medium text-gray-800 mb-2">{selectedMode.name} options</label>
            <ModeSettingsEditor
              schema={selectedMode.settings}
              values={modeSettings}
              onChangeAction={(key, value) => { onFormatEdited(); setModeSettings({ ...modeSettings, [key]: value }); }}
              /* This step runs BEFORE sides are chosen, so the side count isn't known yet —
                 hide the C-F name fields here (two sides is the default) and let the hub's
                 editor, which does know, show the ones a game actually has. */
              hideKeys={unusedSideNameKeys(2)}
            />
          </div>
        )}

        {!isRegisteredMode && showMoney && (
        <div className="pt-2 border-t">
          {/* F-042: ask this as STRUCTURE, not payment mechanics. "Everyone buys in" vs "Two
              teams, head-to-head" made Craig ask what the difference even was — the real
              question is whether all the teams compete for one pot or exactly two face off.
              The money mechanics follow from that answer and the helper text still states them. */}
          <label className="block text-sm font-medium text-gray-800 mb-1">Who competes against whom?</label>
          <div className="flex gap-2">
            {([
              { v: 'pot', label: 'All teams, for a pot' },
              { v: 'match', label: 'Two teams, head-to-head' },
            ] as const).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setMoneyMode(v)}
                className={`flex-1 min-h-[44px] rounded-md border px-3 py-2.5 text-sm font-medium ${
                  moneyMode === v
                    ? 'border-green-600 bg-green-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {moneyMode === 'match'
              ? 'Two foursomes only. Nobody buys in — the losing side pays the winners a set amount for each leg and each bonus point.'
              : 'Every player pays in. The pot is split across the front nine, back nine, overall, and bonuses, and paid out by finishing place.'}
          </p>
        </div>
        )}

        {showHandicaps && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">How much handicap counts?</label>
            <input
              type="number"
              inputMode="decimal"
              value={handicapAllowance}
              onChange={(e) => { onFormatEdited(); setHandicapAllowance(e.target.value); }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            {/* State the CONSEQUENCE in strokes, not the percentage — anything under
                100 also narrows the gap between players, which is the real reason
                groups use it. */}
            <p className="text-xs text-gray-500 mt-1">
              {(() => {
                const pct = parseFloat(handicapAllowance);
                if (isNaN(pct) || pct === 100) return '100% — everyone plays their full handicap.';
                return `${pct}% — an 18 handicap plays off ${Math.round(18 * pct / 100)}, an 8 off ${Math.round(8 * pct / 100)}. Lower percentages pull players closer together.`;
              })()}
            </p>
            {/* The USGA's recommendation for THIS format. Advisory, never forced —
                plenty of groups deliberately play 100%. */}
            {usgaRec && (
              <p className="text-xs mt-1">
                {usgaApplied ? (
                  <span className="text-green-700">✓ {usgaRec.note}.</span>
                ) : (
                  <>
                    <span className="text-gray-500">{usgaRec.note}. </span>
                    <button
                      type="button"
                      onClick={() => setHandicapAllowance(String(usgaRec.pct))}
                      className="font-medium text-green-700 underline hover:text-green-900"
                    >
                      Use {usgaRec.pct}%
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        )}

        {showHandicaps && (
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Who gets strokes?</label>
          <div className="flex gap-2">
            {([
              // The real terms, not explanations of them — golfers know these words, and
              // "explaining what classic golf terms mean" reads wrong (Craig 2026-09-10).
              // The helper text under the control still states the consequence.
              { v: 'full', label: 'Full handicap' },
              { v: 'off-the-low', label: 'Off the low' },
            ] as const).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => { onFormatEdited(); setStrokeMethod(v); }}
                className={`flex-1 min-h-[44px] rounded-md border px-3 py-2.5 text-sm font-medium ${
                  strokeMethod === v
                    ? 'border-green-600 bg-green-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {strokeMethod === 'off-the-low'
              ? 'The best player in the field plays off scratch and everyone else plays the difference — so a 12 facing a 4 gets 8 strokes, not 12.'
              : 'Everyone keeps their own strokes — a 12 gets 12 and a 4 gets 4, regardless of who else is playing.'}
          </p>
        </div>
        )}

        {showHandicaps && (
        <div className="pt-2 border-t">
          <label className="block text-sm font-medium text-gray-800 mb-1">How many strokes change hands?</label>
          <div className="flex gap-2">
            {([
              { v: 'course', label: 'Course handicap' },
              { v: 'index', label: 'Handicap index' },
            ] as const).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => { onFormatEdited(); setHandicapBasis(v); }}
                className={`flex-1 min-h-[44px] rounded-md border px-3 py-2.5 text-sm font-medium ${
                  handicapBasis === v
                    ? 'border-green-600 bg-green-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {handicapBasis === 'index'
              ? 'Strokes come straight from the difference in index — an 8 gives a 2 exactly 6 strokes, on any course.'
              : 'Slope-adjusted, so a harder course spreads players further apart — an 8 vs a 2 might play off 7 or 8 strokes instead of 6.'}
          </p>
        </div>
        )}


        {!isRegisteredMode && (
        <div className="pt-2 border-t">
          <label className="block text-sm font-medium text-gray-800 mb-1">Which scores count for the team?</label>
          {/* ONE picker for the hole rule. The first three options are the classic ball
              selections and save exactly as before (no teamFormat); the rest are the formats
              F-006 added. Same control, more possibilities — not a second screen. */}
          <select
            value={teamFormat}
            onChange={(e) => setTeamFormat(e.target.value as TeamFormat)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            {TEAM_FORMAT_OPTIONS.map((opt) => (
              <option key={opt.format} value={opt.format}>{opt.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {TEAM_FORMAT_OPTIONS.find((o) => o.format === teamFormat)?.hint}
          </p>

          <label className="block text-sm font-medium text-gray-800 mt-3 mb-1">How is the hole scored?</label>
          <div className="flex gap-2">
            {([
              { v: 'stroke' as ScoreBasis, label: 'Strokes' },
              { v: 'stableford' as ScoreBasis, label: 'Stableford points' },
            ]).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setTeamScoreBasis(v)}
                // Same classes as the money / strokes toggles above: solid green when
                // selected, and a 44px min height for a thumb. See UI_CONVENTIONS.md.
                className={`flex-1 min-h-[44px] rounded-md border px-3 py-2.5 text-sm font-medium ${
                  teamScoreBasis === v
                    ? 'border-green-600 bg-green-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {teamScoreBasis === 'stableford'
              ? 'Points off par per ball — birdie 3, par 2, bogey 1. Most points wins.'
              : 'Add the strokes. Lowest total wins, as usual.'}
          </p>
        </div>
        )}
      </div>

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="mt-6 w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Select Course
      </button>
    </div>
  );
}

