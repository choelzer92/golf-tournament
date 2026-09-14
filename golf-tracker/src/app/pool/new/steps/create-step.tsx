'use client';

import { useState, useEffect } from 'react';
import type { CourseSelection, Player } from '@/lib/game-state';
import {
  type PoolTeam,
  type PoolJunkValues,
  type PoolMoneyMode,
  type PoolMatchConfig,
  type CustomBonus,
  COMMON_BONUSES,
  DEFAULT_JUNK_VALUES,
  ZERO_JUNK_VALUES,
  junkIsOff,
  foldJunkIntoOverall,
  getPoolPlayingHandicap,
  poolSplitDollarsForTeams,
} from '@/lib/pool-game';
import type { GameSide } from '@/lib/game-modes/sides';
import { getGameMode, fitExplanation, formatSummaryLine, type SettingsBag } from '@/lib/game-modes';
import { sideNameFrom, allSidesAreSolo } from '@/lib/game-modes/team-game';
import { type PotDollars, foldJunkStrings, legDollarsToStrings, potDollarsTotal } from './shared';

function sideMoneySummary(settings: SettingsBag, sideCount: number): string {
  const num = (key: string, fallback: number) => {
    const v = settings[key];
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return isNaN(n) ? fallback : n;
  };
  const model = String(settings.moneyModel ?? 'legs');
  const many = sideCount > 2;
  switch (model) {
    case 'pot': {
      const buyIn = num('sideBuyIn', 20);
      const split = String(settings.potSplit ?? '100');
      // §5.ag: the ante is PER SIDE whatever its size, which is the surprising part worth saying.
      return `$${buyIn} per side in the pot ($${buyIn * sideCount} total) — `
        + `${split === '100' ? 'best side takes it all' : `paid ${split} down the order`}. `
        + 'Each side antes the same, whatever its size.';
    }
    case 'per-hole': {
      const d = num('dollarsPerHole', 2);
      return `$${d} a hole won${many ? ', against each other side' : ''}.`;
    }
    case 'per-point': {
      const d = num('dollarsPerPoint', 1);
      return `$${d} per point of margin${many ? ', against each other side' : ''}.`;
    }
    default: {
      const f = num('legFront', 10), b = num('legBack', 10), o = num('legOverall', 10);
      return `$${f} front / $${b} back / $${o} overall`
        + (many ? ' — each leg paid to the winner by every side behind.' : '.');
    }
  }
}

// Bonus (junk) fields, shared by the wizard steps that render them. Labels spell out
// what each bonus IS — "Group Hug" and "CTP" are insider terms a first-time user
// can't act on, and a label you can't understand is worse than one you can't find.
const JUNK_FIELDS: { key: keyof PoolJunkValues; label: string; hint: string }[] = [
  { key: 'birdie', label: 'Birdie', hint: '1 under' },
  { key: 'eagle', label: 'Eagle', hint: '2 under' },
  { key: 'albatross', label: 'Albatross', hint: '3 under' },
  { key: 'groupHug', label: 'All par', hint: 'whole team' },
  { key: 'ctp', label: 'Closest', hint: 'on par 3s' },
];

export function CreateStep({
  name, entryPerPlayer, players, teams, course, handicapAllowance, potDollars, setPotDollars, potEdited, setPotEdited,
  moneyMode, matchConfig, handicapBasis, nine, holesPlaying, gameMode,
  entryPerPlayerText, setEntryPerPlayer, positionSplitText, setPositionSplitText,
  junkValues, setJunkValues, customBonuses, setCustomBonuses,
  matchLegs, setMatchLegs, matchJunkPerPoint, setMatchJunkPerPoint,
  sides, modeSettings, strokeMethod, onSaveFormat,
  onCreate, onBack,
}: {
  name: string;
  entryPerPlayer: number;
  players: Player[];
  teams: PoolTeam[];
  course: CourseSelection | null;
  handicapAllowance: number;
  potDollars: PotDollars | null;
  setPotDollars: (d: PotDollars | null) => void;
  potEdited: boolean;
  setPotEdited: (b: boolean) => void;
  moneyMode: PoolMoneyMode;
  matchConfig: PoolMatchConfig;
  handicapBasis: 'course' | 'index';
  nine: 'front9' | 'back9' | null;
  holesPlaying: '18' | 'front9' | 'back9';
  gameMode: string | undefined;
  // Money questions moved here from step 1: the pot can only be shown in real
  // dollars once the team count is known, so this is where they belong.
  entryPerPlayerText: string;
  setEntryPerPlayer: (v: string) => void;
  positionSplitText: string;
  setPositionSplitText: (v: string) => void;
  junkValues: PoolJunkValues;
  setJunkValues: (v: PoolJunkValues) => void;
  customBonuses: CustomBonus[];
  setCustomBonuses: (v: CustomBonus[]) => void;
  matchLegs: { front: string; back: string; overall: string };
  setMatchLegs: (v: { front: string; back: string; overall: string }) => void;
  matchJunkPerPoint: string;
  setMatchJunkPerPoint: (v: string) => void;
  // Side games only (F-018): the sides and their chosen options, so the review step can confirm
  // the thing the game is actually about instead of listing every player in one run.
  sides: GameSide[] | undefined;
  modeSettings: SettingsBag;
  strokeMethod: 'full' | 'off-the-low';
  onSaveFormat: () => Promise<void>;
  onCreate: () => void; onBack: () => void;
}) {
  const mode = getGameMode(gameMode);
  const isIndividual = mode?.category === 'individual' || mode?.category === 'team-within-group';
  const isWithinGroupReview = mode?.category === 'team-within-group';
  const isMatch = moneyMode === 'match';
  // "Save this format" (§5.ax part 4) — local button state only; the save itself is the parent's.
  const [savingFormat, setSavingFormat] = useState(false);
  const [savedFormat, setSavedFormat] = useState(false);
  const playerById = new Map(players.map((p) => [p.id, p]));
  const pot = players.length * entryPerPlayer;
  const teeNameOf = (p: Player) => course?.teeSets.find((t) => t.id === p.teeSetId)?.name ?? null;

  // F-045 (§5.bg): bonuses are OFF on a fresh classic pool and live behind an
  // "Add bonuses" affordance. `junkShown` (opened, or a saved format restored
  // nonzero values) drives the junk grid AND the junk pot-split field; the
  // money itself is guarded at creation, where an all-zero junk config folds
  // the junk dollars into OVERALL.
  const [bonusesOpened, setBonusesOpened] = useState(() => !junkIsOff(junkValues));
  const junkShown = bonusesOpened || !junkIsOff(junkValues);

  // Auto-fill the dollar split from the team-count standard, unless the user has
  // edited it. Re-runs if the number of teams changes or bonuses toggle.
  useEffect(() => {
    if (potEdited) return;
    const std = poolSplitDollarsForTeams(teams.length);
    setPotDollars(legDollarsToStrings(junkShown ? std : foldJunkIntoOverall(std)));
  }, [teams.length, potEdited, setPotDollars, junkShown]);

  const effective: PotDollars = potDollars ?? legDollarsToStrings(poolSplitDollarsForTeams(teams.length));
  const splitTotal = potDollarsTotal(effective);
  const balanced = Math.abs(splitTotal - pot) < 0.01;

  function addBonuses() {
    setJunkValues({ ...DEFAULT_JUNK_VALUES });
    setBonusesOpened(true);
  }
  function removeBonuses() {
    setJunkValues({ ...ZERO_JUNK_VALUES });
    setBonusesOpened(false);
    // A hand-edited split keeps its numbers, minus the junk leg (folded into
    // overall). An untouched one re-fills from the standard via the effect.
    if (potEdited) setPotDollars(foldJunkStrings(effective));
  }

  // A 9-hole game has no front/back split — the whole non-junk pot rides on one
  // leg over the nine played (computePoolResult collapses them the same way). So
  // don't ASK for front/back amounts that can never pay out.
  const nineOnly = holesPlaying !== '18';
  // The junk leg is asked about only when the game plays bonuses (F-045).
  const potFields: { key: keyof PotDollars; label: string }[] = [
    ...(nineOnly
      ? [{ key: 'overall', label: holesPlaying === 'front9' ? 'Front 9' : 'Back 9' } as const]
      : [
          { key: 'front', label: 'Front 9' } as const,
          { key: 'back', label: 'Back 9' } as const,
          { key: 'overall', label: 'Overall' } as const,
        ]),
    ...(junkShown ? [{ key: 'junk', label: 'Junk' } as const] : []),
  ];

  function setLeg(key: keyof PotDollars, value: string) {
    setPotEdited(true);
    setPotDollars({ ...effective, [key]: value });
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {/* A JS STRING, not JSX text — so "&amp;" would render literally as five characters.
            (The `Next: Review &amp; Create` button labels below are real JSX text and are
            correctly escaped there.) Caught in a screenshot; invisible in the code. */}
        {isIndividual ? 'Review & create' : "What's it worth?"}
      </h2>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <p className="text-sm text-gray-500">{isIndividual ? mode!.name : 'Pool'}</p>
          <p className="text-lg font-bold text-gray-900">{name}</p>
          {isIndividual && <p className="text-xs text-gray-500 mt-0.5">{mode!.description}</p>}
          {/* THE STAKES (F-026). For an individual/within-group game the money lives in step 1's
              mode settings, so this last screen showed no dollar figure at all — the one number
              the group on the first tee wants confirmed. Same tested summary as step 1. */}
          {isIndividual && (
            <div className="mt-1 flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-green-800">
                {formatSummaryLine(mode, modeSettings, entryPerPlayer, {
                  allowance: handicapAllowance,
                  strokeMethod,
                  handicapBasis,
                })}
              </p>
              {/* §5.ax part 4: the summary line IS the format — offer to keep it, right here. */}
              <button
                type="button"
                onClick={() => { setSavingFormat(true); onSaveFormat().then(() => setSavedFormat(true)).finally(() => setSavingFormat(false)); }}
                disabled={savingFormat || savedFormat}
                className="flex-shrink-0 text-xs font-medium text-green-700 hover:text-green-900 disabled:opacity-60"
              >
                {savedFormat ? 'Format saved ✓' : savingFormat ? 'Saving…' : 'Save this format'}
              </button>
            </div>
          )}
        </div>

        {isIndividual ? (
          <div className="pt-2 border-t">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-xs text-gray-500">Players</p>
                <p className="text-lg font-bold text-gray-900">{players.length}</p>
              </div>
              <div>
                {/* "Group size" was wrong twice over: it's the count the GAME needs (measured
                    against the whole field, 2026-08-26), and since F-019 a side game's field can
                    span several groups, so nothing here describes a group. */}
                <p className="text-xs text-gray-500">This game needs</p>
                <p className="text-lg font-bold text-gray-900">
                  {mode!.playersMin === mode!.playersMax ? mode!.playersMin : `${mode!.playersMin}–${mode!.playersMax}`}
                </p>
              </div>
            </div>
            {fitExplanation(mode, players.length) && (
              <p className="text-xs text-amber-700 mt-2">
                {/* No "go back to Field" any more: F-020's point is that the constraint is stated
                    at the moment of choosing, so by here it should never be a surprise. */}
                {fitExplanation(mode, players.length)}
              </p>
            )}
          </div>
        ) : (
        <div className="grid grid-cols-3 gap-3 pt-2 border-t text-center">
          <div>
            <p className="text-xs text-gray-500">Players</p>
            <p className="text-lg font-bold text-gray-900">{players.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Teams</p>
            <p className="text-lg font-bold text-gray-900">{teams.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{isMatch ? 'Type' : 'Total Pot'}</p>
            <p className="text-lg font-bold text-green-700">{isMatch ? 'Match' : `$${pot}`}</p>
          </div>
        </div>
        )}

        {/* WHAT'S IT WORTH — the money questions live here, not on step 1, because
            the pot can only be shown in real dollars once the field and team count
            are known. */}
        {!isMatch && !isIndividual && (
        <div className="pt-2 border-t">
          <label className="block text-sm font-medium text-gray-800 mb-1">Buy-in per player ($)</label>
          <input
            type="number"
            inputMode="decimal"
            value={entryPerPlayerText}
            onChange={(e) => setEntryPerPlayer(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            {players.length} player{players.length === 1 ? '' : 's'} × ${entryPerPlayerText || 0} = <span className="font-semibold text-green-700">${pot}</span> in the pot.
          </p>
        </div>
        )}

        {!isMatch && !isIndividual && (
        <div className="pt-2 border-t">
          <label className="block text-sm font-medium text-gray-800 mb-1">Who gets paid?</label>
          <input
            type="text"
            value={positionSplitText}
            onChange={(e) => setPositionSplitText(e.target.value)}
            placeholder="e.g. 100 or 70, 30"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Share of each pot by finishing place. <span className="font-medium">100</span> = winner takes all · <span className="font-medium">70, 30</span> = 1st and 2nd split it.
          </p>
        </div>
        )}
        {/* MANUAL bonuses — the ones no scorecard can reveal, so a scorer taps them per
            hole while playing. Off unless chosen: a group that doesn't play barkies gets
            no extra taps and no extra chrome on the scoring screen. */}
        {!isIndividual && (
        <div className="pt-2 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-1">Extra bonuses to track by hand</p>
          <p className="text-xs text-gray-500 mb-2">
            These can&apos;t be worked out from a score, so whoever&apos;s scoring taps them on the hole.
            Skip them entirely if your group doesn&apos;t play them.
          </p>
          <div className="flex flex-wrap gap-2">
            {COMMON_BONUSES.map((b) => {
              const chosen = customBonuses.find((c) => c.id === b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() =>
                    setCustomBonuses(chosen
                      ? customBonuses.filter((c) => c.id !== b.id)
                      : [...customBonuses, { ...b }])
                  }
                  title={b.hint}
                  className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium ${
                    chosen
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                  }`}
                >
                  {chosen ? '✓ ' : ''}{b.label}
                  <span className={`ml-1 text-xs ${chosen ? 'text-green-100' : 'text-gray-400'}`}>{b.hint}</span>
                </button>
              );
            })}
          </div>
          {customBonuses.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {customBonuses.map((b) => (
                <div key={b.id}>
                  <label className="block text-xs text-gray-600 font-medium mb-1">{b.label} (points)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={b.points}
                    onChange={(e) =>
                      setCustomBonuses(customBonuses.map((c) =>
                        c.id === b.id ? { ...c, points: Number(e.target.value) } : c))
                    }
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* F-045 (§5.bg): bonuses are an ADDED choice, not a default — a fresh pool
            shows one button; the grid (and the junk pot leg) appear only when the
            game plays them. A saved format with junk restores with the grid open. */}
        {!isIndividual && !junkShown && (
        <div className="pt-2 border-t">
          <button
            type="button"
            onClick={addBonuses}
            className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-green-400"
          >
            + Add bonuses
            <span className="ml-1 text-xs text-gray-400">birdies, eagles, closest to the pin…</span>
          </button>
        </div>
        )}
        {!isIndividual && junkShown && (
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-800">Bonus points for good holes</p>
            <button
              type="button"
              onClick={removeBonuses}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              Remove bonuses
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-2">These add to a team&apos;s bonus total. Set any to 0 to skip it.</p>
          <div className="grid grid-cols-5 gap-2">
            {JUNK_FIELDS.map(({ key, label, hint }) => (
              <div key={key}>
                <label className="block text-xs text-gray-600 font-medium">{label}</label>
                <span className="block text-[10px] text-gray-400 mb-1">{hint}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={junkValues[key]}
                  onChange={(e) => setJunkValues({ ...junkValues, [key]: Number(e.target.value) })}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            ))}
          </div>
        </div>
        )}
        {!isMatch && !isIndividual && (
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-800">Pot Split ($ per pot)</p>
            {potEdited && (
              <button
                onClick={() => {
                  setPotEdited(false);
                  const std = poolSplitDollarsForTeams(teams.length);
                  setPotDollars(legDollarsToStrings(junkShown ? std : foldJunkIntoOverall(std)));
                }}
                className="text-xs text-green-700 hover:text-green-900 font-medium"
              >
                Reset to standard
              </button>
            )}
          </div>
          {/* F-044: the defaults come from a table of the organizer's historical splits by team
              count — and read as arbitrary hard-coding when nothing says so. Craig read his OWN
              numbers as "weird". Name the source; the fields stay editable either way. */}
          {!potEdited && (
            <p className="text-xs text-gray-500 mb-2">
              The usual split for {teams.length} team{teams.length === 1 ? '' : 's'} — edit any leg to change it.
            </p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {potFields.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-gray-600 font-medium mb-1">{label}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={effective[key]}
                  onChange={(e) => setLeg(key, e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            ))}
          </div>
          <p className={`text-xs mt-1 ${balanced ? 'text-gray-500' : 'text-amber-600'}`}>
            Split total: ${splitTotal} vs pot ${pot}{balanced ? ' ✓' : ' — should match the pot'}
          </p>
        </div>
        )}

        {/* Classic pot/match money UI applies ONLY to the classic team pool. A
            registered game mode (individual OR 2v2-within-group) carries its own
            money settings, so it must never render this block — otherwise a stale
            moneyMode:'match' from a prior draft shows a contradictory "needs two
            foursomes" warning over a self-contained single-group game. */}
        {isMatch && !isIndividual && (
        <div className="pt-2 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-2">Match Payouts ($ / player)</p>
          {/* On a nine there is only one score leg (see potFields above), so show
              that leg and junk rather than three legs, two of which never pay. */}
          <div className={`grid ${nineOnly ? 'grid-cols-2' : 'grid-cols-4'} gap-2 text-center`}>
            {nineOnly ? (
              <div>
                <p className="text-xs text-gray-500">{holesPlaying === 'front9' ? 'Front 9' : 'Back 9'}</p>
                <p className="text-sm font-bold text-gray-900">${matchConfig.legDollars.overall}</p>
              </div>
            ) : (
              <>
                <div><p className="text-xs text-gray-500">Front 9</p><p className="text-sm font-bold text-gray-900">${matchConfig.legDollars.front}</p></div>
                <div><p className="text-xs text-gray-500">Back 9</p><p className="text-sm font-bold text-gray-900">${matchConfig.legDollars.back}</p></div>
                <div><p className="text-xs text-gray-500">Overall</p><p className="text-sm font-bold text-gray-900">${matchConfig.legDollars.overall}</p></div>
              </>
            )}
            <div><p className="text-xs text-gray-500">Junk / pt</p><p className="text-sm font-bold text-gray-900">${matchConfig.junkPerPoint}</p></div>
          </div>
          {teams.length !== 2 && (
            <p className="text-xs text-amber-700 mt-2">
              Head-to-head needs exactly two foursomes — you have {teams.length}. Go back and make two teams, or switch to Pool (pot split).
            </p>
          )}
        </div>
        )}

        {/* THE SIDES (F-018). The last screen before money changes hands used to say only
            "Players 6 · Group size 4–8 · Foursomes" over one flat list of six names — not how
            many sides, not who was with whom, not the stakes. Confirming who's paired with whom is
            the whole job of a review step, and it was the one thing it didn't show.

            "Foursomes" is also simply the wrong word here (§5.al: say "side" in a side game). */}
        {isWithinGroupReview && sides && sides.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-semibold text-gray-800 mb-2">
              Sides ({sides.map((s) => s.playerIds.length).join(' vs ')})
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {sides.map((side) => {
                const sideLabel = sideNameFrom(players, side.playerIds, side.id, side.name, allSidesAreSolo(sides));
                // When a side IS one player and hasn't been given a custom name, its label and its
                // only member are the same string — so the box printed "Craig" with "Craig" under
                // it. Show the heading only when it says something the member list doesn't.
                const soloName = side.playerIds.length === 1
                  ? playerById.get(side.playerIds[0])?.name
                  : undefined;
                const headingIsRedundant = soloName !== undefined && sideLabel === soloName.split(' ')[0];
                return (
                  <div key={side.id} className="rounded-lg border border-gray-200 p-2">
                  {!headingIsRedundant && (
                    <p className="text-sm font-medium text-gray-900 mb-1">
                      {/* Named exactly as the board will name it — same resolver, so the review
                          can't promise a label the leaderboard won't use. */}
                      {sideLabel}
                    </p>
                  )}
                  {side.playerIds.map((pid) => {
                    const p = playerById.get(pid);
                    if (!p) return null;
                    const chcp = course
                      ? Math.round(getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis, nine))
                      : null;
                    return (
                      <div key={pid} className="flex items-center gap-2 text-sm text-gray-600 py-0.5">
                        <span className="truncate min-w-0 flex-1">{p.name}</span>
                        {chcp !== null && (
                          <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700 tabular-nums" title="Course handicap on this tee">
                            {chcp}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                );
              })}
            </div>
            {/* The stakes, in words. A review step that shows the pairings but not what they're
                playing for is only half a confirmation. */}
            <p className="text-xs text-gray-500 mt-2">{sideMoneySummary(modeSettings, sides.length)}</p>
            {players.some((p) => !sides.some((s) => s.playerIds.includes(p.id))) && (
              <p className="text-xs text-amber-700 mt-1">
                {players.filter((p) => !sides.some((s) => s.playerIds.includes(p.id)))
                  .map((p) => p.name.split(' ')[0]).join(', ')} not on a side yet.
              </p>
            )}
          </div>
        )}

        {/* WHO'S PLAYING (F-025). An individual game (skins, Wolf, quota…) used to fall through
            to the classic-pool block below and print "Foursomes" over a card named "Group" with a
            combined CHcp — a number that means team balance in a pool and nothing in skins. Same
            class as F-018 (one axis fixed, the other left behind): individual games get the same
            treatment — the section reads "Players", each player shows their own handicap, and a
            per-group card appears only when there are several playing groups to confirm. */}
        {!isWithinGroupReview && isIndividual && (
        <div className="pt-2 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-2">Players</p>
          <div className={teams.length > 1 ? 'grid gap-2 sm:grid-cols-2' : ''}>
            {(teams.length > 1 ? teams : [null]).map((team) => {
              const ids = team ? team.playerIds : players.map((p) => p.id);
              const rows = ids.map((pid) => {
                const p = playerById.get(pid);
                if (!p) return null;
                const chcp = course ? Math.round(getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis, nine)) : null;
                const tee = teeNameOf(p);
                return (
                  <div key={pid} className="flex items-center gap-2 text-sm text-gray-600 py-0.5">
                    <span className="truncate min-w-0 flex-1">{p.name}</span>
                    {tee && <span className="flex-shrink-0 text-xs text-gray-400">{tee}</span>}
                    {chcp !== null && (
                      <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700 tabular-nums" title="Course handicap on this tee">
                        {chcp}
                      </span>
                    )}
                  </div>
                );
              });
              return team ? (
                <div key={team.id} className="rounded-lg border border-gray-200 p-2">
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    {team.name}
                    {team.teeTime ? <span className="ml-2 text-xs text-gray-500">{team.teeTime}</span> : null}
                  </p>
                  {rows}
                </div>
              ) : (
                <div key="all-players">{rows}</div>
              );
            })}
          </div>
        </div>
        )}

        {!isWithinGroupReview && !isIndividual && (
        <div className="pt-2 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-2">Foursomes</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {teams.map((team) => {
              const combined = team.playerIds.reduce((s, pid) => {
                const p = playerById.get(pid);
                return p && course ? s + getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis, nine) : s;
              }, 0);
              return (
                <div key={team.id} className="rounded-lg border border-gray-200 p-2">
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">
                      {team.name}
                      {team.teeTime ? <span className="ml-2 text-xs text-gray-500">{team.teeTime}</span> : null}
                    </p>
                    {course && <span className="text-xs text-gray-500">CHcp {Math.round(combined)}</span>}
                  </div>
                  {team.playerIds.map((pid) => {
                    const p = playerById.get(pid);
                    if (!p) return null;
                    const chcp = course ? Math.round(getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis, nine)) : null;
                    const tee = teeNameOf(p);
                    return (
                      <div key={pid} className="flex items-center gap-2 text-sm text-gray-600 py-0.5">
                        <span className="truncate min-w-0 flex-1">{p.name}</span>
                        {tee && <span className="flex-shrink-0 text-xs text-gray-400">{tee}</span>}
                        {chcp !== null && (
                          <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700 tabular-nums" title="Course handicap on this tee">
                            {chcp}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      <button
        onClick={onCreate}
        className="mt-6 w-full rounded-md bg-green-700 px-4 py-3 text-white font-bold text-lg hover:bg-green-800"
      >
        Create Game
      </button>
    </div>
  );
}
