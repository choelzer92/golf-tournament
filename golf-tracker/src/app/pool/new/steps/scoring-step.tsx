'use client';

import { useState } from 'react';
import { teamModeForFormat, TEAM_FORMAT_OPTIONS, type ScoreBasis, type TeamFormat } from '@/lib/game-modes/team-scoring';
import { TEAM_MODES } from '@/lib/formats';
import {
  GAME_MODES, getGameMode, defaultSettings, playerRangeSentence, fitBadge, fitExplanation, modeFits, type SettingsBag,
} from '@/lib/game-modes';
import { ModeSettingsEditor } from '@/components/mode-settings-editor';
import { type CompareBy, type StructureShape, structureLabel } from '@/lib/game-structure';

// Step 3 of the wizard — "How is it scored?" (plan §3.2).
//
// Container-neutral. For teams: how a team's hole score forms (format), what it's expressed as
// (strokes / Stableford points) and how teams are compared (18-hole total / hole by hole). For
// everyone-for-themselves: the individual game and its options. Handicaps live here for both,
// with the USGA recommendation keyed on the FORMAT and compare-by, never on a container.
export function ScoringStep({
  structure, playerCount,
  gameMode, setGameMode, modeSettings, setModeSettings,
  teamFormat, setTeamFormat, teamScoreBasis, setTeamScoreBasis, compareBy, setCompareBy,
  formatUnavailable,
  handicapAllowance, setHandicapAllowance, strokeMethod, setStrokeMethod, handicapBasis, setHandicapBasis,
  appliedFormat, formatDirty, onFormatEdited, name, setName, summaryLine,
  onNext, onBack,
}: {
  structure: StructureShape;
  playerCount: number;
  /** Solo only: the individual mode id. */
  gameMode: string | undefined; setGameMode: (v: string | undefined) => void;
  modeSettings: SettingsBag; setModeSettings: (v: SettingsBag) => void;
  teamFormat: TeamFormat; setTeamFormat: (v: TeamFormat) => void;
  teamScoreBasis: ScoreBasis; setTeamScoreBasis: (v: ScoreBasis) => void;
  compareBy: CompareBy; setCompareBy: (v: CompareBy) => void;
  /** Why a format can't be played by THIS structure (from the router), or null when it can. */
  formatUnavailable: (f: TeamFormat) => string | null;
  handicapAllowance: string; setHandicapAllowance: (s: string) => void;
  strokeMethod: 'full' | 'off-the-low'; setStrokeMethod: (v: 'full' | 'off-the-low') => void;
  handicapBasis: 'course' | 'index'; setHandicapBasis: (v: 'course' | 'index') => void;
  appliedFormat: string | undefined;
  formatDirty: boolean;
  onFormatEdited: () => void;
  /** The F-021 card (title + summary) repeats here so an edit's consequence — "Changed from your
      saved …, rename to keep both" — is visible where the edit happens. */
  name: string; setName: (s: string) => void;
  summaryLine: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const isSolo = structure.kind === 'solo';
  const singles = !isSolo && structure.teamSizes.every((k) => k === 1);
  const selectedMode = isSolo ? getGameMode(gameMode) : undefined;
  const individualModes = GAME_MODES.filter((m) => m.category === 'individual');

  // F-021: with a format applied, sections are confirmations until opened by hand.
  const [openedGame, setOpenedGame] = useState(false);
  const [openedHandicaps, setOpenedHandicaps] = useState(false);
  const showGame = !appliedFormat || openedGame;
  const showHandicaps = !appliedFormat || openedHandicaps;

  function pickMode(id: string) {
    const mode = getGameMode(id);
    if (!mode || !modeFits(mode, playerCount)) return;
    if (appliedFormat) onFormatEdited();
    setGameMode(id);
    setModeSettings(defaultSettings(mode.settings));
  }

  // USGA recommended allowance for what's being played. Advisory, never forced. Keyed on the
  // format and compare-by (plan §1): two-ball formats are four-ball, 90% hole by hole / 85% on
  // total; singles hole by hole is 100% (F-064 opt A); individual stroke play 95%; scramble is
  // tiered by team size so no single figure is right.
  const usgaRec: { pct: number; note: string } | null = (() => {
    if (isSolo) return selectedMode ? { pct: 95, note: 'USGA suggests 95% for individual stroke play' } : null;
    if (singles) {
      return compareBy === 'match'
        ? { pct: 100, note: 'USGA suggests 100% for singles match play' }
        : { pct: 95, note: 'USGA suggests 95% for singles stroke play' };
    }
    const mode = TEAM_MODES.find((m) => m.id === teamModeForFormat(teamFormat));
    if (!mode || mode.usgaAllowance === 'tiered') return null;
    if (teamFormat === 'net-and-gross' || teamFormat === 'two-best-net' || teamFormat === 'two-best-gross') {
      return compareBy === 'match'
        ? { pct: 90, note: 'USGA suggests 90% for four-ball match play (hole by hole)' }
        : { pct: 85, note: 'USGA suggests 85% for four-ball stroke play (18-hole total — two scores counting)' };
    }
    return { pct: mode.usgaAllowance, note: `USGA suggests ${mode.usgaAllowance}% for ${mode.name.toLowerCase()}` };
  })();
  const usgaApplied = usgaRec !== null && Math.round(parseFloat(handicapAllowance)) === usgaRec.pct;

  const canProceed = isSolo ? !!selectedMode && modeFits(selectedMode, playerCount) : formatUnavailable(teamFormat) === null;
  const toggle = (on: boolean) => `flex-1 min-h-[44px] rounded-md border px-3 py-2.5 text-sm font-medium ${
    on ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
  }`;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">How is it scored?</h2>
        <span className="text-sm text-gray-500">{structureLabel(structure)}</span>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
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
          </div>
        )}
        {appliedFormat && (
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'game', label: 'Game', on: showGame, set: setOpenedGame },
              { key: 'hcap', label: 'Handicaps', on: showHandicaps, set: setOpenedHandicaps },
            ] as const).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => s.set(!s.on)}
                className={`min-h-[36px] rounded-md border px-3 py-1.5 text-xs font-medium ${
                  s.on ? 'border-green-600 bg-white text-green-800' : 'border-green-300 bg-white text-green-700 hover:bg-green-100'
                }`}
              >
                {s.on ? `Hide ${s.label}` : `Change ${s.label}`}
              </button>
            ))}
          </div>
        )}

        {/* EVERYONE FOR THEMSELVES: the individual games, each annotated with fit (F-020). */}
        {isSolo && showGame && (
          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">Which game?</p>
            <div className="space-y-2" role="radiogroup" aria-label="Which game?">
              {individualModes.map((m) => {
                const fits = modeFits(m, playerCount);
                const badge = fitBadge(m, playerCount);
                const selected = gameMode === m.id;
                return (
                  <label
                    key={m.id}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 min-h-[44px] ${
                      !fits ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                        : selected ? 'border-green-600 bg-green-50 cursor-pointer'
                        : 'border-gray-300 bg-white hover:border-green-400 cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="solo-mode"
                      value={m.id}
                      checked={selected}
                      disabled={!fits}
                      onChange={() => pickMode(m.id)}
                      className="mt-1 h-4 w-4 accent-green-700"
                      aria-label={m.name}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium ${fits ? 'text-gray-900' : 'text-gray-400'}`}>
                        {m.name}{badge ? <span className={`ml-2 text-xs font-normal ${fits ? 'text-green-700' : 'text-gray-400'}`}>{badge}</span> : null}
                      </span>
                      <span className={`block text-xs ${fits ? 'text-gray-500' : 'text-gray-400'}`}>{m.description} {playerRangeSentence(m)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {fitExplanation(selectedMode, playerCount) && (
              <p className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                {fitExplanation(selectedMode, playerCount)}
              </p>
            )}
          </div>
        )}

        {isSolo && selectedMode && showGame && (
          <div className="pt-2 border-t">
            <label className="block text-sm font-medium text-gray-800 mb-2">{selectedMode.name} options</label>
            <ModeSettingsEditor
              schema={selectedMode.settings}
              values={modeSettings}
              onChangeAction={(key, value) => { onFormatEdited(); setModeSettings({ ...modeSettings, [key]: value }); }}
            />
          </div>
        )}

        {/* TEAMS: format × basis × compare-by. Labels kept from the classic pool's pickers. */}
        {!isSolo && showGame && (
          <div>
            {!singles && (
              <>
                <label className="block text-sm font-medium text-gray-800 mb-1">Which scores count for the team?</label>
                <select
                  value={teamFormat}
                  onChange={(e) => { onFormatEdited(); setTeamFormat(e.target.value as TeamFormat); }}
                  aria-label="Which scores count for the team?"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  {TEAM_FORMAT_OPTIONS.map((opt) => {
                    const why = formatUnavailable(opt.format);
                    return (
                      <option key={opt.format} value={opt.format} disabled={why !== null}>
                        {opt.label}{why ? ' — not with this split' : ''}
                      </option>
                    );
                  })}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {TEAM_FORMAT_OPTIONS.find((o) => o.format === teamFormat)?.hint}
                </p>
                {/* Honest residue of two engines (plan §3.4): a format this split can't play says why. */}
                {formatUnavailable(teamFormat) && (
                  <p className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                    {formatUnavailable(teamFormat)}
                  </p>
                )}
              </>
            )}

            <label className={`block text-sm font-medium text-gray-800 mb-1 ${singles ? '' : 'mt-3'}`}>How is the hole scored?</label>
            <div className="flex gap-2">
              {([
                { v: 'stroke' as ScoreBasis, label: 'Strokes' },
                { v: 'stableford' as ScoreBasis, label: 'Stableford points' },
              ]).map(({ v, label }) => (
                <button key={v} type="button" onClick={() => { onFormatEdited(); setTeamScoreBasis(v); }} className={toggle(teamScoreBasis === v)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {teamScoreBasis === 'stableford'
                ? 'Points off par per ball — birdie 3, par 2, bogey 1. Most points wins.'
                : 'Add the strokes. Lowest total wins, as usual.'}
            </p>

            <label className="block text-sm font-medium text-gray-800 mt-3 mb-1">Decide by</label>
            <div className="flex gap-2">
              {([
                { v: 'total' as CompareBy, label: '18-hole total' },
                { v: 'match' as CompareBy, label: 'Hole by hole' },
              ]).map(({ v, label }) => (
                <button key={v} type="button" onClick={() => { onFormatEdited(); setCompareBy(v); }} className={toggle(compareBy === v)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {compareBy === 'match'
                ? 'Win each hole; the front, back and overall each go to whoever won more holes.'
                : 'Compare the totals over the holes played. Front, back and overall are shown either way.'}
            </p>
          </div>
        )}

        {showHandicaps && (
          <div className="pt-2 border-t">
            <label className="block text-sm font-medium text-gray-800 mb-1">How much handicap counts?</label>
            <input
              type="number"
              inputMode="decimal"
              value={handicapAllowance}
              onChange={(e) => { onFormatEdited(); setHandicapAllowance(e.target.value); }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              {(() => {
                const pct = parseFloat(handicapAllowance);
                if (isNaN(pct) || pct === 100) return '100% — everyone plays their full handicap.';
                return `${pct}% — an 18 handicap plays off ${Math.round(18 * pct / 100)}, an 8 off ${Math.round(8 * pct / 100)}. Lower percentages pull players closer together.`;
              })()}
            </p>
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
        )}

        {showHandicaps && (
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Who gets strokes?</label>
            <div className="flex gap-2">
              {([
                { v: 'full', label: 'Full handicap' },
                { v: 'off-the-low', label: 'Off the low' },
              ] as const).map(({ v, label }) => (
                <button key={v} type="button" onClick={() => { onFormatEdited(); setStrokeMethod(v); }} className={toggle(strokeMethod === v)}>
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
                <button key={v} type="button" onClick={() => { onFormatEdited(); setHandicapBasis(v); }} className={toggle(handicapBasis === v)}>
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
