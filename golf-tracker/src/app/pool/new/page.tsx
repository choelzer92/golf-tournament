'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Player, CourseSelection } from '@/lib/game-state';
import { PoolShareButton } from '@/components/pool-share';
import { getCreatorGhin } from '@/lib/pool-identity';
import {
  type PoolGame,
  type PoolTeam,
  type PoolJunkValues,
  type PoolMoneyMode,
  type PoolMatchConfig,
  ZERO_JUNK_VALUES,
  junkIsOff,
  foldJunkIntoOverall,
  DEFAULT_MATCH_CONFIG,
  savePoolGame,
  poolSplitDollarsForTeams,
  dollarsToPotSplit,
  type CustomBonus,
  defaultSubTeams,
} from '@/lib/pool-game';
import {
  getRosterPlayerByGhin,
  getRosterPlayerById,
  upsertRosterPlayer,
} from '@/lib/roster';
import { pickTeeForPlayer, teeRankInPool } from '@/lib/tee-pick';
import {
  type RosterGroup,
  type GroupDefaults,
  getGroupById,
} from '@/lib/roster-groups';
import { saveFormat } from '@/lib/pool-formats';
import {
  formatOfGame,
  persistedTeamScoring,
  type ScoreBasis,
  type TeamFormat,
} from '@/lib/game-modes/team-scoring';
import {
  fromLegacySubTeams,
  persistedSides,
  sidesOfGame,
  type GameSide,
} from '@/lib/game-modes/sides';
import { getGameMode, type SettingsBag } from '@/lib/game-modes';
// The wizard's steps, one file each (context economy, 2026-09-14): page.tsx keeps
// the state + step routing; every step component lives in ./steps/.
import { type PotDollars, proposePlayingGroups } from './steps/shared';
import { DetailsStep } from './steps/details-step';
import { CourseStep } from './steps/course-step';
import { FieldStep } from './steps/field-step';
import { TeesStep } from './steps/tees-step';
import { PlayingGroupsStep } from './steps/playing-groups-step';
import { TeamsStep } from './steps/teams-step';
import { SubTeamsStep } from './steps/sub-teams-step';
import { CreateStep } from './steps/create-step';

const WIZARD_KEY = 'pool_wizard_draft';
// Set by the Format Library's "Start a game" to preconfigure the wizard once.
const FORMAT_SEED_KEY = 'pool_format_seed';

// §5.au: the FIELD comes first — count → game → money → settings. Information order
// follows dependency: the game picker can annotate fit (F-020) and money can show real
// dollars only once the count is known, so nothing is asked before what it depends on.
// 'groups' is the PLAYING-GROUP step, shown only for a side game whose field is too big to walk
// together (F-019). 'teams' then holds the SIDES for a side game and the foursomes for a pool —
// the two axes are separate steps because they're separate questions (§5.an).
type Step = 'field' | 'details' | 'course' | 'tees' | 'groups' | 'teams' | 'create';

function parsePositionSplit(text: string): number[] {
  const parsed = text
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n));
  return parsed.length > 0 ? parsed : [100];
}

export default function NewPoolGamePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('field');
  const [hydrated, setHydrated] = useState(false);

  // Details
  const [name, setName] = useState('');
  // F-034: the name value a GROUP auto-filled (survives the draft), so a later group
  // pick can tell a stale courtesy-fill from something the organizer typed. A name
  // that matches this is replaceable; any other non-empty name is hand-typed and kept.
  const [autoNamedFrom, setAutoNamedFrom] = useState<string | undefined>(undefined);
  // Game mode: undefined = classic team pool (pot/match). A registry id
  // ('nines'|'skins'|'quota'|...) = an INDIVIDUAL game scored within one group.
  const [gameMode, setGameMode] = useState<string | undefined>(undefined);
  const [modeSettings, setModeSettings] = useState<SettingsBag>({});
  // Within-group side games only: the sides' player-id lists. N sides (F-006); persisted as
  // the legacy {a,b} shape whenever there are exactly two, via persistedSides().
  const [sides, setSides] = useState<GameSide[] | undefined>(undefined);
  const [entryPerPlayer, setEntryPerPlayer] = useState('25');
  const [handicapAllowance, setHandicapAllowance] = useState('100');
  const [strokeMethod, setStrokeMethod] = useState<'full' | 'off-the-low'>('off-the-low');
  // Handicap basis: 'course' (off the tee, default) or 'index' (raw handicap index).
  const [handicapBasis, setHandicapBasis] = useState<'course' | 'index'>('course');
  // Pot legs in dollars; null until the Review step auto-fills from team count.
  // `potEdited` guards the auto-fill from clobbering a manual override.
  const [potDollars, setPotDollars] = useState<PotDollars | null>(null);
  const [potEdited, setPotEdited] = useState(false);
  const [positionSplitText, setPositionSplitText] = useState('100');
  // F-045 (§5.bg): a fresh classic pool plays no bonuses — junk starts at zero
  // behind an "Add bonuses" affordance on the money step. Saved formats restore
  // whatever they saved (applyGroupDefaults), so the Warriors' game keeps its junk.
  const [junkValues, setJunkValues] = useState<PoolJunkValues>({ ...ZERO_JUNK_VALUES });
  // Manual bonuses this game plays (sandies, barkies, …) — the ones the app can't read off
  // a scorecard, so a scorer taps them per hole. Empty = the game plays none, which is
  // every game today. Seeded from a group's saved set when one is chosen.
  const [customBonuses, setCustomBonuses] = useState<CustomBonus[]>([]);
  // How a foursome's hole score is made (F-006). ONE picker, always defined — the legacy
  // three-option `ballSelection` dropdown was a subset of this list, and keeping both would
  // ask the same question twice. `ballSelection` is DERIVED at save time by
  // persistedTeamScoring, which stores an ordinary stroke game the legacy way (no
  // teamFormat) so it computes down the snapshot-pinned path and settles exactly as every
  // game before it.
  const [teamFormat, setTeamFormat] = useState<TeamFormat>('net-and-gross');
  const [teamScoreBasis, setTeamScoreBasis] = useState<ScoreBasis>('stroke');
  const ballSelection = persistedTeamScoring(teamFormat, teamScoreBasis).ballSelection;
  // Money mode: 'pot' = classic buy-in pool (JY); 'match' = 2-foursome head-to-head.
  const [moneyMode, setMoneyMode] = useState<PoolMoneyMode>('pot');
  // Match-mode config (per-player $/leg + junk $/point). Stored as strings for the
  // inputs; parsed at create time.
  const [matchLegs, setMatchLegs] = useState({ front: '10', back: '10', overall: '10' });
  const [matchJunkPerPoint, setMatchJunkPerPoint] = useState('5');

  // Course
  const [course, setCourse] = useState<CourseSelection | null>(null);
  // Holes played (default 18). A nine restricts scoring/legs/scorecard to it.
  const [holesPlaying, setHolesPlaying] = useState<'18' | 'front9' | 'back9'>('18');
  // 9-hole handicap basis (default '18' = the common casual method; '9' = USGA-proper).
  const [nineHandicapBasis, setNineHandicapBasis] = useState<'18' | '9'>('18');
  // The USGA nine in effect, mirroring gameNineBasis() for a game that doesn't
  // exist yet. Every handicap the wizard DISPLAYS has to use this, or the numbers
  // shown while building won't match what the game plays off once created.
  const wizardNine: 'front9' | 'back9' | null =
    holesPlaying !== '18' && nineHandicapBasis === '9' ? holesPlaying : null;

  // Field
  const [players, setPlayers] = useState<Player[]>([]);
  // The saved group this game was created FROM (a seed from /home/groups/[id], or
  // the FieldStep "Load group" picker). Stamped onto the game as sourceGroupId so
  // stats/ledger can attribute it exactly. Absent = made outside a group.
  const [sourceGroupId, setSourceGroupId] = useState<string | undefined>(undefined);
  // True once a FORMAT seed has been applied (group page's format picker, the library, or
  // the game picker itself). Tells the FieldStep group-seed loader to bring in members
  // WITHOUT re-applying the group's own default settings (which would clobber the format).
  //
  // A REF, not state (§5.au): the field step is now the FIRST step, so its mount effect
  // starts hydrating before this page's own mount effect has consumed the format seed —
  // a prop snapshot would read a stale false in the loader's async continuation. The ref
  // is written synchronously and read at load time.
  const formatSeedAppliedRef = useRef(false);
  function markFormatSeedApplied(v: boolean) {
    formatSeedAppliedRef.current = v;
  }
  // F-021: the NAME of the saved format this game started from, or undefined when configured from
  // scratch. Drives step 1's summary-instead-of-form. `formatDirty` flips the first time any of the
  // format's own values is edited, which is what turns the title into "rename to fork" (§5.ax).
  const [appliedFormat, setAppliedFormat] = useState<string | undefined>(undefined);
  const [formatDirty, setFormatDirty] = useState(false);

  // Teams
  const [teams, setTeams] = useState<PoolTeam[]>([]);
  // Pairing locks — groups of player IDs the organizer wants kept on the same
  // team through auto-balance (e.g. "Corky + Larry Grist").
  const [lockedGroups, setLockedGroups] = useState<string[][]>([]);
  // Captains — one player id per team slot, anchoring the balance. Auto-picked
  // (lowest course handicaps) in the Teams step, reassignable there.
  const [captainIds, setCaptainIds] = useState<string[]>([]);
  // Balance the NON-captain players only (default on): evens the other three per
  // team and lets captain strokes ride as the edge — best for 1 net + 1 gross.
  const [balanceExcludeCaptains, setBalanceExcludeCaptains] = useState(true);
  // Whether teams are built around captains at all (default on, so JY's pot game
  // and every existing flow is unchanged). Off = plain balance by handicap with
  // no captain role — for games that don't want captains.
  const [useCaptains, setUseCaptains] = useState(true);
  // How the current teams were built (method + settings snapshot), recorded onto
  // the game so the read-only hub can show "how these teams were built".
  const [teamBuild, setTeamBuild] = useState<PoolGame['teamBuild']>(undefined);

  // Category of the picked game (from the registry). Individual + within-group
  // are both single-group flows; within-group additionally needs sub-team setup.
  const modeCategory = getGameMode(gameMode)?.category;
  const isSingleGroup = modeCategory === 'individual' || modeCategory === 'team-within-group';
  const isWithinGroup = modeCategory === 'team-within-group';

  // F-019: a side game's PLAYING GROUPS are chosen separately from its sides, because a partner
  // may be in the other foursome. More than four players cannot walk together, so they need real
  // tee groups — and then the wizard asks for them (the 'groups' step) before asking for sides.
  //
  // At four or fewer this is false and nothing changes: the ordinary 2v2 keeps its exact flow and
  // gains no taps, which is the point (an option that appears when it can't matter is the
  // "exposed complexity" the north star argues against). §5.ao: the app proposes, you adjust.
  const needsPlayingGroups = isWithinGroup && players.length > 4;

  // Hydrate wizard draft on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(WIZARD_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (typeof data.name === 'string') setName(data.name);
        if (typeof data.autoNamedFrom === 'string') setAutoNamedFrom(data.autoNamedFrom);
        if (typeof data.entryPerPlayer === 'string') setEntryPerPlayer(data.entryPerPlayer);
        if (typeof data.handicapAllowance === 'string') setHandicapAllowance(data.handicapAllowance);
        if (data.strokeMethod === 'full' || data.strokeMethod === 'off-the-low') setStrokeMethod(data.strokeMethod);
        if (data.handicapBasis === 'course' || data.handicapBasis === 'index') setHandicapBasis(data.handicapBasis);
        if (typeof data.balanceExcludeCaptains === 'boolean') setBalanceExcludeCaptains(data.balanceExcludeCaptains);
        if (typeof data.useCaptains === 'boolean') setUseCaptains(data.useCaptains);
        if (data.potDollars) { setPotDollars(data.potDollars); setPotEdited(!!data.potEdited); }
        if (typeof data.positionSplitText === 'string') setPositionSplitText(data.positionSplitText);
        if (data.junkValues) setJunkValues(data.junkValues);
        // A draft may predate the format picker and carry only `ballSelection`; read either
        // shape back into the one picker.
        if (data.teamFormat || data.ballSelection) {
          setTeamFormat(formatOfGame({ teamFormat: data.teamFormat, ballSelection: data.ballSelection }));
        }
        if (data.teamScoreBasis === 'stroke' || data.teamScoreBasis === 'stableford') {
          setTeamScoreBasis(data.teamScoreBasis);
        }
        if (data.moneyMode === 'pot' || data.moneyMode === 'match') setMoneyMode(data.moneyMode);
        if (data.matchLegs) setMatchLegs(data.matchLegs);
        if (typeof data.matchJunkPerPoint === 'string') setMatchJunkPerPoint(data.matchJunkPerPoint);
        if (typeof data.gameMode === 'string') setGameMode(data.gameMode);
        if (data.modeSettings && typeof data.modeSettings === 'object') setModeSettings(data.modeSettings);
        if (data.course) setCourse(data.course);
        if (data.holesPlaying === '18' || data.holesPlaying === 'front9' || data.holesPlaying === 'back9') setHolesPlaying(data.holesPlaying);
        if (data.nineHandicapBasis === '18' || data.nineHandicapBasis === '9') setNineHandicapBasis(data.nineHandicapBasis);
        // Intentionally NOT restoring players/teams/step: the day's field is a
        // fresh per-game selection (the roster is the durable store), so every
        // new game starts with nobody selected. Name/course/config still restore.
      }
    } catch {}
    // Seed from a Format Library entry (set by the library's "Start a game" or
    // the group page's format picker). Applied AFTER the draft so a chosen
    // format wins; consumed once. Records that a format was applied so a group
    // seed loading members later doesn't clobber it with the group's own default.
    try {
      const seedRaw = sessionStorage.getItem(FORMAT_SEED_KEY);
      if (seedRaw) {
        sessionStorage.removeItem(FORMAT_SEED_KEY);
        const seed = JSON.parse(seedRaw) as { name?: string; defaults?: GroupDefaults };
        if (seed.name && seed.name.trim()) { setName(seed.name); setAppliedFormat(seed.name.trim()); }
        if (seed.defaults) applyGroupDefaults(seed.defaults);
        markFormatSeedApplied(true);
      }
    } catch {}
    setHydrated(true);
  }, []);

  // Auto-save wizard draft on every change
  useEffect(() => {
    if (!hydrated) return;
    sessionStorage.setItem(WIZARD_KEY, JSON.stringify({
      name, autoNamedFrom, entryPerPlayer, handicapAllowance, strokeMethod, handicapBasis, balanceExcludeCaptains, useCaptains, potDollars, potEdited, positionSplitText,
      junkValues, ballSelection, teamFormat, teamScoreBasis, moneyMode, matchLegs, matchJunkPerPoint, gameMode, modeSettings, course, players, teams, teamBuild, step, sides,
      holesPlaying, nineHandicapBasis,
    }));
  }, [hydrated, name, autoNamedFrom, entryPerPlayer, handicapAllowance, strokeMethod, handicapBasis, balanceExcludeCaptains, useCaptains, potDollars, potEdited, positionSplitText,
      junkValues, ballSelection, teamFormat, teamScoreBasis, moneyMode, matchLegs, matchJunkPerPoint, gameMode, modeSettings, course, players, teams, teamBuild, step, sides,
      holesPlaying, nineHandicapBasis]);

  // The current format settings, packaged as a group's defaults (for "save field
  // as a group"). Only the format — the member list is saved separately.
  function currentGroupDefaults(): GroupDefaults {
    return {
      moneyMode,
      junkValues,
      entryPerPlayer: parseFloat(entryPerPlayer) || 0,
      positionSplitText,
      matchConfig: buildMatchConfig(),
      handicapAllowance: parseFloat(handicapAllowance) || 100,
      strokeMethod,
      handicapBasis,
      // Save the format the same way a game stores it: an ordinary stroke game keeps only
      // `ballSelection`, so a saved group stays readable by any older client.
      ...persistedTeamScoring(teamFormat, teamScoreBasis),
      useCaptains,
      // Game mode + its settings (so a saved group/format restores the game type).
      gameMode,
      modeSettings: gameMode ? modeSettings : undefined,
      sides,
    };
  }

  // Apply a group's saved format defaults to the wizard (used when loading a
  // group). Missing fields are left untouched.
  function applyGroupDefaults(d: GroupDefaults | null) {
    if (!d) return;
    if (d.moneyMode === 'pot' || d.moneyMode === 'match') setMoneyMode(d.moneyMode);
    if (d.junkValues) setJunkValues(d.junkValues);
    if (typeof d.entryPerPlayer === 'number') setEntryPerPlayer(String(d.entryPerPlayer));
    if (typeof d.positionSplitText === 'string') setPositionSplitText(d.positionSplitText);
    if (d.matchConfig) {
      setMatchLegs({
        front: String(d.matchConfig.legDollars.front),
        back: String(d.matchConfig.legDollars.back),
        overall: String(d.matchConfig.legDollars.overall),
      });
      setMatchJunkPerPoint(String(d.matchConfig.junkPerPoint));
    }
    if (typeof d.handicapAllowance === 'number') setHandicapAllowance(String(d.handicapAllowance));
    if (d.customBonuses) setCustomBonuses(d.customBonuses);
    if (d.strokeMethod === 'full' || d.strokeMethod === 'off-the-low') setStrokeMethod(d.strokeMethod);
    if (d.handicapBasis === 'course' || d.handicapBasis === 'index') setHandicapBasis(d.handicapBasis);
    // A group saved before the format picker carries only `ballSelection`; either shape
    // reads back into the one picker.
    if (d.teamFormat || d.ballSelection) {
      setTeamFormat(formatOfGame({ teamFormat: d.teamFormat, ballSelection: d.ballSelection }));
    }
    if (d.teamScoreBasis === 'stroke' || d.teamScoreBasis === 'stableford') setTeamScoreBasis(d.teamScoreBasis);
    if (typeof d.useCaptains === 'boolean') setUseCaptains(d.useCaptains);
    // Game mode + settings (restore a saved individual/2v2/decision game). Only
    // set gameMode when present so a plain player-group (no mode) stays classic.
    if (typeof d.gameMode === 'string') setGameMode(d.gameMode);
    if (d.modeSettings && typeof d.modeSettings === 'object') setModeSettings(d.modeSettings);
    // Restore either shape: a draft saved before N sides holds subTeams, a newer one holds
    // sides. Both normalize to the same thing — and `sidesOfGame` also absorbs a saved FORMAT's
    // legacy side<Letter>Name settings (F-014), so a format saved before names moved off the
    // settings bag still brings its names in.
    if ((Array.isArray(d.sides) && d.sides.length > 0) || d.subTeams) {
      setSides(sidesOfGame({
        sides: d.sides as GameSide[] | undefined,
        subTeams: d.subTeams,
        modeSettings: d.modeSettings,
      }));
    }
  }

  // §5.av: a saved format chosen IN the game picker. Same effect as arriving with a
  // FORMAT_SEED_KEY seed — name, settings, the F-021 summary — but applied in place,
  // at the moment of choosing a game, instead of via a detour through the library.
  function chooseFormat(f: RosterGroup) {
    setName(f.name);
    setAppliedFormat(f.name.trim());
    setFormatDirty(false);
    applyGroupDefaults(f.defaults);
    // applyGroupDefaults leaves gameMode untouched when the format doesn't carry one —
    // right for a plain player-group, wrong here: a classic-pool format must actually
    // switch the wizard back to classic, not inherit whatever mode was selected.
    if (typeof f.defaults?.gameMode !== 'string') setGameMode(undefined);
    // A group seed loading members later must not clobber this with the group's own defaults.
    markFormatSeedApplied(true);
  }

  // §5.av: picking a raw mode after a format means "configure fresh" — drop the summary
  // and its name, back to the ordinary form. (Tweaking a format's VALUES is different:
  // that keeps the summary and invites a rename — §5.ax.)
  function clearAppliedFormat() {
    if (appliedFormat && name.trim() === appliedFormat) setName('');
    setAppliedFormat(undefined);
    setFormatDirty(false);
    markFormatSeedApplied(false);
  }

  // §5.au: the field is built BEFORE the course is chosen, so players start with no tee.
  // Once a course lands (or changes), give everyone whose tee isn't on this course their
  // usual one — same resolution as adding a player used to get when the course came first.
  useEffect(() => {
    if (!course) return;
    setPlayers((prev) => prev.map((p) => {
      if (course.teeSets.some((t) => t.id === p.teeSetId)) return p;
      const rp = (p.ghinNumber != null ? getRosterPlayerByGhin(p.ghinNumber) : undefined) ?? getRosterPlayerById(p.id);
      return { ...p, teeSetId: pickTeeForPlayer(course, p.gender, rp?.defaultTeeName ?? null, rp?.defaultTeeRank) };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course]);

  // Parse the match-config inputs into a PoolMatchConfig (per-player $/leg + junk
  // $/point), falling back to the defaults for any blank/invalid field.
  function buildMatchConfig(): PoolMatchConfig {
    const num = (s: string, d: number) => (s.trim() === '' || isNaN(parseFloat(s)) ? d : parseFloat(s));
    return {
      legDollars: {
        front: num(matchLegs.front, DEFAULT_MATCH_CONFIG.legDollars.front),
        back: num(matchLegs.back, DEFAULT_MATCH_CONFIG.legDollars.back),
        overall: num(matchLegs.overall, DEFAULT_MATCH_CONFIG.legDollars.overall),
      },
      junkPerPoint: num(matchJunkPerPoint, DEFAULT_MATCH_CONFIG.junkPerPoint),
    };
  }

  // §5.ax part 4: "Save this format" on the review step. Same shape as
  // formatFromGame (pool-formats.ts), built from wizard state instead of a saved
  // game — mode + settings + money + handicap rule, never players or course.
  async function saveCurrentFormat() {
    await saveFormat(name || 'Format', {
      kind: 'format',
      gameMode,
      modeSettings: gameMode ? modeSettings : undefined,
      ...(isWithinGroup && sides && sides.length > 0 ? persistedSides(sides) : {}),
      moneyMode,
      junkValues,
      customBonuses: customBonuses.length > 0 ? customBonuses : undefined,
      entryPerPlayer: parseFloat(entryPerPlayer) || 0,
      ...persistedTeamScoring(teamFormat, teamScoreBasis),
      handicapAllowance: parseFloat(handicapAllowance) || 100,
      strokeMethod,
      handicapBasis,
      matchConfig: moneyMode === 'match' ? buildMatchConfig() : undefined,
    });
  }

  function createPoolGame() {
    const id = crypto.randomUUID();
    // Effective dollar split: manual override if set, else the standard for this
    // team count. Stored as pot fractions (compute engine multiplies by the pot).
    const enteredDollars = potDollars
      ? { front: parseFloat(potDollars.front) || 0, back: parseFloat(potDollars.back) || 0, overall: parseFloat(potDollars.overall) || 0, junk: parseFloat(potDollars.junk) || 0 }
      : poolSplitDollarsForTeams(teams.length);
    // F-045 (§5.bg): no bonuses in this game → the junk quarter folds into
    // OVERALL at creation, whatever the split fields held. This is the guard the
    // money math relies on, not the UI's field-hiding.
    const effectiveDollars = junkIsOff(junkValues) ? foldJunkIntoOverall(enteredDollars) : enteredDollars;
    const game: PoolGame = {
      id,
      name: name || 'Pool Game',
      createdAt: new Date().toISOString(),
      course,
      players,
      teams,
      // ballSelection + (teamFormat, teamScoreBasis) as one decision. An ordinary stroke
      // game gets NO teamFormat, so it computes down the legacy path whose math is pinned by
      // the golden snapshots in pool-game.test.ts — new games settle exactly as old ones.
      ...persistedTeamScoring(teamFormat, teamScoreBasis),
      moneyMode,
      // Only carry match config when the game IS a match, so pot games stay clean.
      matchConfig: moneyMode === 'match' ? buildMatchConfig() : undefined,
      entryPerPlayer: parseFloat(entryPerPlayer) || 0,
      handicapAllowance: parseFloat(handicapAllowance) || 100,
      strokeMethod,
      handicapBasis,
      balanceExcludeCaptains,
      useCaptains,
      potSplit: dollarsToPotSplit(effectiveDollars),
      positionSplit: parsePositionSplit(positionSplitText),
      junkValues,
      customBonuses: customBonuses.length > 0 ? customBonuses : undefined,
      ctpWinners: {},
      // Individual game mode + its chosen option values (absent for classic pool).
      gameMode,
      modeSettings: gameMode ? modeSettings : undefined,
      // Within-group side games only. persistedSides emits the LEGACY {a,b} shape at exactly
      // two unnamed sides, so an ordinary 2v2 saves exactly as it always has and computes down
      // the snapshot-pinned path; three or more opts in to `sides`. See game-modes/sides.ts.
      ...(isWithinGroup && sides && sides.length > 0 ? persistedSides(sides) : {}),
      status: 'active',
      // 9-hole support (absent/'18' = full 18, every existing game). nineHandicapBasis
      // only matters when a nine is chosen.
      holesPlaying,
      nineHandicapBasis: holesPlaying === '18' ? undefined : nineHandicapBasis,
      handicapsRefreshedAt: new Date().toISOString(),
      createdByGhin: getCreatorGhin() ?? undefined,
      // Exact stats/ledger link when this game was built from a saved group.
      sourceGroupId,
      // Persist pairing locks onto the game so they can be reused/edited when the
      // organizer reopens it (locks live on the game, not just the wizard).
      lockedGroups: lockedGroups.length > 0 ? lockedGroups : undefined,
      teamBuild,
    };

    // Remember each player's tee for next time — whatever they're actually
    // playing here, auto-picked or manually chosen. Saved by NAME (exact match)
    // AND by RELATIVE RANK (the cross-course fallback), so their usual tee
    // follows them to courses whose tee names differ. Without this, a player
    // whose tee was never manually toggled reverts to the gender default.
    for (const p of players) {
      const teeName = course?.teeSets.find((t) => t.id === p.teeSetId)?.name;
      if (!teeName) continue;
      upsertRosterPlayer({
        id: p.id,
        ghinNumber: p.ghinNumber ?? null,
        name: p.name,
        handicapIndex: p.handicapIndex,
        gender: p.gender ?? null,
        defaultTeeName: teeName,
        defaultTeeRank: teeRankInPool(course, p.gender ?? undefined, p.teeSetId),
      });
    }

    savePoolGame(game);
    sessionStorage.removeItem(WIZARD_KEY);
    router.push('/pool/' + game.id);
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">New Game</h1>
          <div className="flex items-center gap-4">
            <PoolShareButton className="text-sm text-green-200 hover:text-white font-medium" label="Share" />
            <button onClick={() => router.push('/pool')} className="text-sm text-green-200 hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <StepIndicator current={step} course={course} individualGame={modeCategory === 'individual'} withinGroup={isWithinGroup} playingGroups={needsPlayingGroups} />

        {step === 'details' && (
          <DetailsStep
            // §5.au: the field is built FIRST, so the count is real by the time the picker
            // renders and every F-020 fit badge has something true to say.
            playerCount={players.length}
            // F-046: the group chosen on the field step, so its usual games lead the picker.
            sourceGroupId={sourceGroupId}
            // F-021: when a saved format was applied, step 1 confirms rather than re-asks.
            appliedFormat={appliedFormat}
            formatDirty={formatDirty}
            onFormatEdited={() => setFormatDirty(true)}
            name={name}
            setName={setName}
            gameMode={gameMode}
            setGameMode={setGameMode}
            modeSettings={modeSettings}
            setModeSettings={setModeSettings}
            entryPerPlayer={entryPerPlayer}
            setEntryPerPlayer={setEntryPerPlayer}
            handicapAllowance={handicapAllowance}
            setHandicapAllowance={setHandicapAllowance}
            strokeMethod={strokeMethod}
            setStrokeMethod={setStrokeMethod}
            handicapBasis={handicapBasis}
            setHandicapBasis={setHandicapBasis}
            positionSplitText={positionSplitText}
            setPositionSplitText={setPositionSplitText}
            junkValues={junkValues}
            setJunkValues={setJunkValues}
            teamFormat={teamFormat}
            setTeamFormat={setTeamFormat}
            teamScoreBasis={teamScoreBasis}
            setTeamScoreBasis={setTeamScoreBasis}
            moneyMode={moneyMode}
            setMoneyMode={setMoneyMode}
            matchLegs={matchLegs}
            setMatchLegs={setMatchLegs}
            matchJunkPerPoint={matchJunkPerPoint}
            setMatchJunkPerPoint={setMatchJunkPerPoint}
            // §5.av: saved formats are choices at the game step — picking one fills
            // everything; picking a raw mode afterwards configures fresh.
            onFormatChosen={chooseFormat}
            onFormatCleared={clearAppliedFormat}
            onNext={() => setStep('course')}
            onBack={() => setStep('field')}
          />
        )}

        {step === 'course' && (
          <CourseStep
            course={course}
            setCourse={setCourse}
            holesPlaying={holesPlaying}
            setHolesPlaying={setHolesPlaying}
            nineHandicapBasis={nineHandicapBasis}
            setNineHandicapBasis={setNineHandicapBasis}
            onNext={() => setStep('tees')}
            onBack={() => setStep('details')}
          />
        )}

        {step === 'field' && (
          <FieldStep
            course={course}
            players={players}
            setPlayers={setPlayers}
            handicapAllowance={parseFloat(handicapAllowance) || 100}
            handicapBasis={handicapBasis}
            nine={wizardNine}
            getGroupDefaults={currentGroupDefaults}
            applyGroupDefaults={applyGroupDefaults}
            // Loading a group also names the game when nothing was typed — the same courtesy
            // the old step-1 chips extended, now that the field IS step 1. Functional update:
            // a group seed loads asynchronously, so `name` here can be a stale '' from the
            // first render even after a format seed has already named the game.
            // F-034: a name that came from an EARLIER group auto-fill (this tab's draft
            // included) is replaceable; only a name the organizer typed survives the switch.
            onGroupLoaded={(id) => {
              setSourceGroupId(id);
              const g = getGroupById(id);
              if (!g) return;
              setName((prev) => (prev.trim() && prev.trim() !== autoNamedFrom ? prev : g.name));
              setAutoNamedFrom(g.name.trim());
            }}
            preselectedGroupId={sourceGroupId}
            formatSeedAppliedRef={formatSeedAppliedRef}
            // §5.au: the field leads, so the game comes next.
            nextLabel="Choose Game"
            onNext={() => setStep('details')}
          />
        )}

        {step === 'tees' && (
          <TeesStep
            course={course}
            players={players}
            setPlayers={setPlayers}
            handicapAllowance={parseFloat(handicapAllowance) || 100}
            handicapBasis={handicapBasis}
            nine={wizardNine}
            // An INDIVIDUAL game skips team-building entirely and goes straight to money, so the
            // button has to say that rather than promise a step that never comes.
            nextLabel={modeCategory === 'individual' ? 'Money' : needsPlayingGroups ? 'Groups' : isWithinGroup ? 'Sides' : 'Teams'}
            onBack={() => setStep('course')}
            onNext={() => {
              // Single-group games (individual + 2v2) run as ONE team holding every
              // player. Auto-build it now. Individual → straight to Create;
              // within-group → the SubTeamsStep (shown in the 'teams' slot).
              if (isSingleGroup) {
                // A side game too big to walk together gets REAL playing groups, proposed
                // balanced and adjustable on the 'groups' step (F-019). Everything else keeps
                // the single "Group" holding the whole field — the shape every existing game has.
                setTeams(needsPlayingGroups
                  ? proposePlayingGroups(players, course, parseFloat(handicapAllowance) || 100, handicapBasis)
                  : [{
                    id: crypto.randomUUID(),
                    name: 'Group',
                    playerIds: players.map((p) => p.id),
                    matchupId: crypto.randomUUID(),
                  }]);
                if (isWithinGroup) {
                  setSides((prev) => prev && prev.length > 0
                    ? prev
                    : fromLegacySubTeams(defaultSubTeams(players.map((p) => p.id), players, course, parseFloat(handicapAllowance) || 100, handicapBasis)));
                  setStep(needsPlayingGroups ? 'groups' : 'teams');
                } else {
                  setStep('create');
                }
              } else {
                setStep('teams');
              }
            }}
          />
        )}

        {/* F-019: WHO WALKS WITH WHOM — a side game's tee sheet, asked separately from its sides.
            Reuses the classic pool's TeamsStep verbatim (it already does exactly this: balanced
            proposal, drag between groups, tee time per group, reorder, add/remove) rather than
            growing a second editor for the same question. Captains are off: a side game's money
            has no captain role, and the panel would be noise. */}
        {step === 'groups' && needsPlayingGroups && (
          <PlayingGroupsStep
            course={course}
            players={players}
            teams={teams}
            setTeams={setTeams}
            handicapAllowance={parseFloat(handicapAllowance) || 100}
            handicapBasis={handicapBasis}
            nine={wizardNine}
            onNext={() => setStep('teams')}
            onBack={() => setStep('tees')}
          />
        )}

        {step === 'teams' && isWithinGroup && (
          <SubTeamsStep
            players={players}
            course={course}
            handicapAllowance={parseFloat(handicapAllowance) || 100}
            handicapBasis={handicapBasis}
            nine={wizardNine}
            sides={sides}
            setSides={setSides}
            onNext={() => setStep('create')}
            // Back goes to the groups step when there is one, so the wizard's back button
            // retraces the way in rather than skipping a step the organizer just filled in.
            onBack={() => setStep(needsPlayingGroups ? 'groups' : 'tees')}
          />
        )}

        {step === 'teams' && !isWithinGroup && (
          <TeamsStep
            course={course}
            players={players}
            setPlayers={setPlayers}
            teams={teams}
            setTeams={setTeams}
            lockedGroups={lockedGroups}
            setLockedGroups={setLockedGroups}
            captainIds={captainIds}
            setCaptainIds={setCaptainIds}
            excludeCaptains={balanceExcludeCaptains}
            setExcludeCaptains={setBalanceExcludeCaptains}
            useCaptains={useCaptains}
            setUseCaptains={setUseCaptains}
            teamBuild={teamBuild}
            setTeamBuild={setTeamBuild}
            handicapAllowance={parseFloat(handicapAllowance) || 100}
            handicapBasis={handicapBasis}
            nine={wizardNine}
            onNext={() => setStep('create')}
            onBack={() => setStep('tees')}
          />
        )}

        {step === 'create' && (
          <CreateStep
            name={name || 'Pool Game'}
            entryPerPlayer={parseFloat(entryPerPlayer) || 0}
            players={players}
            teams={teams}
            course={course}
            handicapAllowance={parseFloat(handicapAllowance) || 100}
            potDollars={potDollars}
            setPotDollars={setPotDollars}
            potEdited={potEdited}
            setPotEdited={setPotEdited}
            moneyMode={moneyMode}
            matchConfig={buildMatchConfig()}
            handicapBasis={handicapBasis}
            nine={wizardNine}
            holesPlaying={holesPlaying}
            gameMode={gameMode}
            entryPerPlayerText={entryPerPlayer}
            setEntryPerPlayer={setEntryPerPlayer}
            positionSplitText={positionSplitText}
            setPositionSplitText={setPositionSplitText}
            junkValues={junkValues}
            setJunkValues={setJunkValues}
            customBonuses={customBonuses}
            setCustomBonuses={setCustomBonuses}
            matchLegs={matchLegs}
            setMatchLegs={setMatchLegs}
            matchJunkPerPoint={matchJunkPerPoint}
            setMatchJunkPerPoint={setMatchJunkPerPoint}
            sides={sides}
            modeSettings={modeSettings}
            strokeMethod={strokeMethod}
            onSaveFormat={saveCurrentFormat}
            onCreate={createPoolGame}
            onBack={() => setStep(modeCategory === 'individual' ? 'tees' : 'teams')}
          />
        )}
      </main>
    </div>
  );
}

function StepIndicator({ current, course, individualGame, withinGroup, playingGroups }: { current: Step; course: CourseSelection | null; individualGame?: boolean; withinGroup?: boolean; playingGroups?: boolean }) {
  // §5.au: the FIELD leads. Course follows the game (a nine vs 18 depends on what's
  // being played), and tees close the loop once both course and players exist.
  const steps = [
    { key: 'field', label: 'Players' },
    { key: 'details', label: 'Game' },
    { key: 'course', label: course?.courseName || 'Course' },
    { key: 'tees', label: 'Tees' },
    // A side game whose field is too big to walk together picks its playing groups first, then
    // its sides — two steps because they're two independent questions (F-019, §5.an). Absent for
    // every other flow, so nothing else gains a step.
    ...(playingGroups ? [{ key: 'groups', label: 'Groups' }] : []),
    // Individual games skip team-building entirely; 2v2 within-group replaces it
    // with a "Sides" step; classic pool keeps "Teams".
    ...(individualGame ? [] : [{ key: 'teams', label: withinGroup ? 'Sides' : 'Teams' }]),
    { key: 'create', label: 'Money' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-2 mb-6 text-sm">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded ${i <= currentIdx ? 'bg-green-700 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-gray-300">&rarr;</span>}
        </div>
      ))}
    </div>
  );
}

// The side game's stakes, in a sentence (F-018). A review step that shows the pairings but not
// what they're playing for is only half a confirmation.
//
// Says WHO PAYS WHOM, not just the numbers, because that's the part a group argues about
// afterwards — and at 3+ sides it isn't obvious: each leg is collected from every side behind
// (DECISIONS.md §5.aj), so a $10 front nine is $10 per opponent, not $10 total.
