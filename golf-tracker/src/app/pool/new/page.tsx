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
  sortPlayerIdsByHcap,
} from '@/lib/pool-game';
// The §5.bk collapse: the wizard asks STRUCTURE, SCORING and MONEY in plain words; the router
// picks the container (classic pool / sides engine / individual mode) by capability (§5.bm Q1).
import {
  type StructureShape,
  type StructureDraft,
  type CompareBy,
  type MoneyModel,
  routeContainer,
  moneyModelsFor,
  routedFields,
  defaultTeeSheetFacts,
  teeSheetFacts,
  proposeTeeGroups,
  structureForDefaults,
  recommendedStructure,
  structureOptionId,
  structureOptionLabel,
} from '@/lib/game-structure';
import { sideNameFrom, allSidesAreSolo } from '@/lib/game-modes/team-game';
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
  persistedSides,
  sidesOfGame,
  type GameSide,
} from '@/lib/game-modes/sides';
import { getGameMode, defaultSettings, formatSummaryLine, GAME_MODES, modeFits, type SettingsBag } from '@/lib/game-modes';
// The wizard's steps, one file each (context economy, 2026-09-14): page.tsx keeps
// the state + step routing; every step component lives in ./steps/.
import { type PotDollars } from './steps/shared';
import { StructureStep } from './steps/structure-step';
import { ScoringStep } from './steps/scoring-step';
import { CourseStep } from './steps/course-step';
import { FieldStep } from './steps/field-step';
import { TeesStep } from './steps/tees-step';
import { PlayingGroupsStep } from './steps/playing-groups-step';
import { TeamsStep } from './steps/teams-step';
import { CreateStep } from './steps/create-step';

const WIZARD_KEY = 'pool_wizard_draft';
// Set by the Format Library's "Start a game" to preconfigure the wizard once.
const FORMAT_SEED_KEY = 'pool_format_seed';

// §5.au: the FIELD comes first — count → structure → scoring → course → tees → teams → money.
// Information order follows dependency: the structure step can annotate fit (F-020) and money
// can show real dollars only once the count is known, so nothing is asked before what it
// depends on. 'structure' asks "How do you want to compete?" (§5.bk); 'scoring' how it's
// scored; 'teams' builds the money teams for EVERY split on one step (F-071 — pairs and the
// 2v2 included; a 1 v 1 skips it, F-079); 'groups' is the PLAYING-GROUP step that follows,
// shown only when teams smaller than a foursome need real tee groups (F-019) — two axes, two
// questions (§5.an).
type Step = 'field' | 'structure' | 'scoring' | 'course' | 'tees' | 'groups' | 'teams' | 'create';
// Draft v2 (plan §4.4): a v1 draft (no version) is discarded, never migrated — a wrong
// migration would create an impossible game (§5.ac), and players/teams/step never restored anyway.
const DRAFT_VERSION = 2;

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
  // THE STRUCTURE (§5.bk): N teams of K, or everyone for themselves. Undefined until step 2
  // pre-selects the §5.bk recommendation (or a saved format's shape). Never stored on the game —
  // derived back by structureOf() (§5.ac).
  const [structure, setStructure] = useState<StructureShape | undefined>(undefined);
  // How teams are compared: 18-hole total or hole by hole (a match). Container-neutral.
  const [compareBy, setCompareBy] = useState<CompareBy>('total');
  // The money model in one vocabulary (plan §3.4). The router turns it into the classic
  // pot/match or the sides engine's model; the user never sees a container.
  const [moneyModel, setMoneyModel] = useState<MoneyModel>('pot');
  // Classic-pool money mode, DERIVED: fixed legs are the classic 'match'; everything else pots.
  const moneyMode: PoolMoneyMode = moneyModel === 'legs' ? 'match' : 'pot';
  // True once scoring/money values came from somewhere real (a draft, a format, a group), so an
  // automatic structure pick doesn't overwrite them with the shape's defaults.
  const scoringSetRef = useRef(false);
  // The last applied format/group's shape source, so the structure can be derived once the
  // field is known (a seed applies before any player exists).
  const formatShapeRef = useRef<{ gameMode?: string; sides?: GameSide[]; subTeams?: { a: string[]; b: string[] } } | null>(null);
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
  // F-071: teams that SHARE foursomes (pairs, the 2v2, 2 + 2 + 1) are built on the same TeamsStep
  // as the pool's, held here in the step's own shape; leaving the step derives `sides` from them
  // and lays the tee sheet (`proposeTeeGroups`, partners together). Never persisted — like
  // `teams`, the day's build is a fresh per-game answer.
  const [sideTeams, setSideTeams] = useState<PoolTeam[]>([]);
  // Captains for shared-foursome teams: a role the sides engine never records, so it's off by
  // default for pairs and on for triples (F-071 A: "when K ≥ 3 or on request"); the toggle on the
  // step is the request. Separate from the pool's `useCaptains` so a saved format's choice for
  // the classic pool is never clobbered by a pairs game.
  const [sideCaptains, setSideCaptainsState] = useState(false);
  const sideCaptainsTouched = useRef(false);
  const setSideCaptains = (v: boolean) => { sideCaptainsTouched.current = true; setSideCaptainsState(v); };

  // ---- The routing layer (lib/game-structure.ts) reads the wizard's answers -------------------
  const isSolo = structure?.kind === 'solo';
  // Every team is its own tee group under the default tee sheet (two teams of 4, 3 + 3 + 2, 3 + 2):
  // those games build their teams with the foursome builder (captains, locks, methods) and the
  // teams ARE the tee sheet. Smaller teams (pairs, singles) share foursomes: the sides editor.
  const alignedFlow = !!structure && structure.kind === 'teams' && defaultTeeSheetFacts(structure.teamSizes).aligned;
  const isWithinGroup = !!structure && structure.kind === 'teams' && !alignedFlow;
  // F-019: teams that share foursomes need REAL tee groups once more than four can't walk
  // together; the 'groups' step asks (proposed partners-together, §5.bm Q2). At four or fewer
  // nothing is asked — the ordinary 2v2 keeps its exact flow.
  const needsPlayingGroups = isWithinGroup && players.length > 4;
  // The shape the router sees: the sides as actually built when the organizer has adjusted them,
  // else the chosen structure.
  const sidesShape = sides && sides.length > 0 ? sides.map((s) => s.playerIds.length) : null;
  const shapeNow: StructureShape = structure
    ? (isWithinGroup && sidesShape ? { kind: 'teams', teamSizes: sidesShape } : structure)
    : { kind: 'teams', teamSizes: [] };
  const teeFacts = isSolo
    ? { aligned: false, teamsTogether: true }
    : alignedFlow
      ? { aligned: true, teamsTogether: true }
      : (sides && sides.length > 0 && teams.length > 0
        ? teeSheetFacts(sides.map((s) => s.playerIds), teams.map((t) => t.playerIds))
        : defaultTeeSheetFacts(shapeNow.teamSizes));
  const draft: StructureDraft = {
    structure: shapeNow,
    soloMode: isSolo ? gameMode : undefined,
    scoring: { format: teamFormat, basis: teamScoreBasis, compareBy },
    ...teeFacts,
    moneyModel,
    // The classic pot carries its front/back/overall legs itself; a shared-foursome pot is one prize.
    bonuses: {
      junk: !junkIsOff(junkValues) || modeSettings.junkEnabled === true,
      ctp: junkValues.ctp > 0,
      custom: customBonuses.length > 0,
    },
    // Captains are how the foursome builder works, not a rule of the game — the sides engine
    // simply doesn't record them (plan §2, accepted for Phase 1), so they never block a route.
    captains: false,
    hideHolesUntilAllFinish: false,
  };
  const route = structure ? routeContainer(draft) : { container: 'unexpressible' as const, reason: 'Pick how you want to compete.' };
  const container = route.container;
  const moneyOptions = structure ? moneyModelsFor(draft) : [];
  // Why a team format can't be played by this structure under ANY money model (else null).
  // Bonuses are left out: they're the money step's question, answered (or dropped) there.
  function formatUnavailable(format: TeamFormat): string | null {
    if (!structure || structure.kind !== 'teams') return null;
    const options = moneyModelsFor({ ...draft, scoring: { ...draft.scoring!, format }, bonuses: {} });
    if (options.some((o) => o.available)) return null;
    const first = options[0]?.route;
    return first && first.container === 'unexpressible' ? first.reason : 'Not available for this split.';
  }
  // What a saved format / group default records for this game: the ROUTED mode and settings.
  // Defaults first, so the summary and the engine read the same numbers the stakes editor shows
  // (a bag missing `sideBuyIn` used to make the summary fall back to the per-player buy-in).
  const sidesSettings: SettingsBag = {
    ...defaultSettings(getGameMode('team-2v2')?.settings ?? []),
    ...modeSettings,
    format: teamFormat, scoring: teamScoreBasis, result: compareBy, moneyModel,
  };
  const savedGameMode = container === 'individual' ? gameMode : container === 'sides' ? 'team-2v2' : undefined;
  const savedModeSettings = container === 'individual' ? modeSettings : container === 'sides' ? sidesSettings : undefined;
  // The F-021 one-line summary of what's configured (game · stakes · handicaps).
  const summaryLine = formatSummaryLine(
    getGameMode(savedGameMode),
    savedModeSettings ?? modeSettings,
    parseFloat(entryPerPlayer) || 0,
    { allowance: parseFloat(handicapAllowance) || 100, strokeMethod, handicapBasis },
  );

  // Pick a structure. A USER pick resets scoring + money to the shape's defaults (today's pool for
  // aligned teams: best net + best gross, strokes, total, pot — the golden path; a match for
  // shared-foursome teams and singles). An automatic pick (the §5.bk recommendation, a format's
  // shape) only sets defaults when nothing real has been chosen yet.
  function pickStructure(shape: StructureShape, source: 'user' | 'auto') {
    const changed = !structure || structureOptionId(structure) !== structureOptionId(shape);
    setStructure(shape);
    if (!changed) return;
    setSides(undefined);
    setTeams([]);
    setSideTeams([]);
    setTeamBuild(undefined);
    if (shape.kind === 'solo') {
      const mode = getGameMode(gameMode);
      if (!mode || mode.category !== 'individual' || !modeFits(mode, players.length)) {
        const first = GAME_MODES.find((m) => m.category === 'individual' && modeFits(m, players.length));
        setGameMode(first?.id);
        setModeSettings(first ? defaultSettings(first.settings) : {});
      }
      return;
    }
    setGameMode(undefined);
    if (source === 'user' && appliedFormat) { setFormatDirty(true); return; }
    // A team game starts from the sides engine's own defaults — never the individual mode's bag
    // left behind by an earlier pick (a skins $5 skin value once leaked into a 1 v 1's summary).
    if (source === 'user' || !scoringSetRef.current) setModeSettings(defaultSettings(getGameMode('team-2v2')?.settings ?? []));
    if (source === 'auto' && scoringSetRef.current) return;
    const singles = shape.teamSizes.every((k) => k === 1);
    if (defaultTeeSheetFacts(shape.teamSizes).aligned) {
      setTeamFormat('net-and-gross'); setTeamScoreBasis('stroke'); setCompareBy('total'); setMoneyModel('pot');
    } else if (singles) {
      setTeamFormat('best-ball'); setTeamScoreBasis('stroke'); setCompareBy('match'); setMoneyModel('legs');
    } else {
      setTeamFormat('best-ball'); setTeamScoreBasis('stableford'); setCompareBy('match'); setMoneyModel('legs');
    }
  }

  // Entering the structure step with nothing chosen: a saved format/group's shape if one was
  // applied, else the §5.bk recommendation — pre-selected, never forced.
  useEffect(() => {
    if (step !== 'structure' || structure || players.length < 2) return;
    const fromDefaults = formatShapeRef.current ? structureForDefaults(formatShapeRef.current, players.length) : null;
    const shape = fromDefaults ?? recommendedStructure(players.length);
    if (shape) pickStructure(shape, 'auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, structure, players.length]);

  // The field changed under a chosen structure (Back to Players, someone added): a shape that no
  // longer adds up is dropped, and the step above re-picks. Players are never restored from a
  // draft, so this waits for a real field.
  useEffect(() => {
    if (!structure || players.length < 2) return;
    if (structure.teamSizes.reduce((s, k) => s + k, 0) !== players.length) setStructure(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.length]);

  // A format the current split can't play (a two-ball format on a team of one — F-072 gave the
  // sides engine every other format) falls back to best ball, which every split can.
  useEffect(() => {
    if (structure?.kind === 'teams' && formatUnavailable(teamFormat) !== null && teamFormat !== 'best-ball') setTeamFormat('best-ball');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure, teamFormat, sides, teams]);

  // Hydrate wizard draft on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(WIZARD_KEY);
      const data = saved ? JSON.parse(saved) : null;
      if (data && data.draftVersion === DRAFT_VERSION) {
        if (data.structure && (data.structure.kind === 'solo' || data.structure.kind === 'teams') && Array.isArray(data.structure.teamSizes)) {
          setStructure(data.structure);
        }
        if (data.compareBy === 'total' || data.compareBy === 'match') setCompareBy(data.compareBy);
        if (data.moneyModel === 'pot' || data.moneyModel === 'legs' || data.moneyModel === 'per-hole' || data.moneyModel === 'per-point') setMoneyModel(data.moneyModel);
        scoringSetRef.current = true;
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
      draftVersion: DRAFT_VERSION, structure, compareBy, moneyModel,
      name, autoNamedFrom, entryPerPlayer, handicapAllowance, strokeMethod, handicapBasis, balanceExcludeCaptains, useCaptains, potDollars, potEdited, positionSplitText,
      junkValues, ballSelection, teamFormat, teamScoreBasis, moneyMode, matchLegs, matchJunkPerPoint, gameMode, modeSettings, course, players, teams, teamBuild, step, sides,
      holesPlaying, nineHandicapBasis,
    }));
  }, [hydrated, structure, compareBy, moneyModel, name, autoNamedFrom, entryPerPlayer, handicapAllowance, strokeMethod, handicapBasis, balanceExcludeCaptains, useCaptains, potDollars, potEdited, positionSplitText,
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
      // The ROUTED game mode + its settings (so a saved group/format restores the game type).
      gameMode: savedGameMode,
      modeSettings: savedModeSettings,
      sides: container === 'sides' ? sides : undefined,
    };
  }

  // Apply a group's saved format defaults to the wizard (used when loading a
  // group). Missing fields are left untouched.
  function applyGroupDefaults(d: GroupDefaults | null) {
    if (!d) return;
    scoringSetRef.current = true;
    if (d.moneyMode === 'pot' || d.moneyMode === 'match') setMoneyModel(d.moneyMode === 'match' ? 'legs' : 'pot');
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
    // A saved SIDES game (team-2v2) kept its scoring and money in the settings bag; read them
    // back into the neutral scoring/money answers the collapsed wizard asks.
    const sidesMode = getGameMode(d.gameMode);
    if (sidesMode?.category === 'team-within-group') {
      // A format stores only the keys it set; the mode's defaults fill the rest, exactly as the
      // engine and the summary line read them.
      const s = { ...defaultSettings(sidesMode.settings), ...(d.modeSettings ?? {}) };
      if (typeof s.format === 'string') setTeamFormat(s.format as TeamFormat);
      if (s.scoring === 'stroke' || s.scoring === 'stableford') setTeamScoreBasis(s.scoring);
      if (s.result === 'total' || s.result === 'match') setCompareBy(s.result);
      if (s.moneyModel === 'pot' || s.moneyModel === 'legs' || s.moneyModel === 'per-hole' || s.moneyModel === 'per-point') setMoneyModel(s.moneyModel);
    }
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
    // The STRUCTURE a saved format implies (plan §4.3): derived now if the field is known, else
    // when the structure step opens with players in hand.
    formatShapeRef.current = { gameMode: d.gameMode, sides: d.sides as GameSide[] | undefined, subTeams: d.subTeams };
    if (players.length >= 2) {
      const shape = structureForDefaults(formatShapeRef.current, players.length);
      if (shape) setStructure(shape);
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
      gameMode: savedGameMode,
      modeSettings: savedModeSettings,
      ...(container === 'sides' && sides && sides.length > 0 ? persistedSides(sides) : {}),
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
    // THE ROUTER decides the container (§5.bm Q1): the classic pool (gameMode absent), the sides
    // engine ('team-2v2' + sides) or an individual mode. routedFields writes exactly the fields
    // that land a game in its container — through persistedTeamScoring / persistedSides, so an
    // ordinary stroke pool still saves with NO teamFormat (the golden-snapshot path) and an
    // ordinary two-side game still saves as legacy subTeams.
    if (container === 'unexpressible') return;
    const teamIds = container === 'sides' ? (sides ?? []).map((s) => s.playerIds) : teams.map((t) => t.playerIds);
    const routed = routedFields(draft, route, teamIds, modeSettings, { sides: container === 'sides' ? sides : undefined, junkValues });
    const game: PoolGame = {
      id,
      name: name || 'Pool Game',
      createdAt: new Date().toISOString(),
      course,
      players,
      teams,
      // Required legacy field; the classic route overrides it below via routedFields.
      ballSelection: '1-net-1-gross',
      ...routed,
      // The wizard's own values win over routedFields' defaults for these.
      moneyMode: container === 'classic' ? moneyMode : undefined,
      // Only carry match config when the game IS a classic match, so pot games stay clean.
      matchConfig: container === 'classic' && moneyMode === 'match' ? buildMatchConfig() : undefined,
      entryPerPlayer: parseFloat(entryPerPlayer) || 0,
      handicapAllowance: parseFloat(handicapAllowance) || 100,
      strokeMethod,
      handicapBasis,
      potSplit: dollarsToPotSplit(effectiveDollars),
      positionSplit: parsePositionSplit(positionSplitText),
      junkValues,
      customBonuses: customBonuses.length > 0 ? customBonuses : undefined,
      ctpWinners: {},
      hideHolesUntilAllFinish: undefined,
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
      lockedGroups: container === 'classic' && lockedGroups.length > 0 ? lockedGroups : undefined,
      teamBuild: container === 'classic' ? teamBuild : undefined,
      useCaptains: container === 'classic' ? useCaptains : undefined,
      balanceExcludeCaptains: container === 'classic' ? balanceExcludeCaptains : undefined,
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
        <StepIndicator current={step} course={course} solo={isSolo || (isWithinGroup && !!structure && structure.teamSizes.every((k) => k === 1))} playingGroups={needsPlayingGroups} />

        {step === 'structure' && (
          <StructureStep
            // §5.au: the field is built FIRST, so the count is real by the time this step
            // renders and every F-020 fit annotation has something true to say.
            playerCount={players.length}
            // F-046: the group chosen on the field step, so its usual games lead.
            sourceGroupId={sourceGroupId}
            // F-021: when a saved format was applied, this step confirms rather than re-asks.
            appliedFormat={appliedFormat}
            formatDirty={formatDirty}
            onFormatEdited={() => setFormatDirty(true)}
            summaryLine={summaryLine}
            name={name}
            setName={setName}
            structure={structure}
            setStructure={(shape) => pickStructure(shape, 'user')}
            // §5.av: saved formats are choices at the game step — picking one fills
            // everything; picking a shape afterwards edits the format (§5.ax).
            onFormatChosen={chooseFormat}
            onFormatCleared={clearAppliedFormat}
            onNext={() => setStep('scoring')}
            onBack={() => setStep('field')}
          />
        )}

        {step === 'scoring' && structure && (
          <ScoringStep
            structure={structure}
            playerCount={players.length}
            gameMode={gameMode}
            setGameMode={setGameMode}
            modeSettings={modeSettings}
            setModeSettings={setModeSettings}
            teamFormat={teamFormat}
            setTeamFormat={setTeamFormat}
            teamScoreBasis={teamScoreBasis}
            setTeamScoreBasis={setTeamScoreBasis}
            compareBy={compareBy}
            setCompareBy={setCompareBy}
            formatUnavailable={formatUnavailable}
            handicapAllowance={handicapAllowance}
            setHandicapAllowance={setHandicapAllowance}
            strokeMethod={strokeMethod}
            setStrokeMethod={setStrokeMethod}
            handicapBasis={handicapBasis}
            setHandicapBasis={setHandicapBasis}
            appliedFormat={appliedFormat}
            formatDirty={formatDirty}
            onFormatEdited={() => setFormatDirty(true)}
            name={name}
            setName={setName}
            summaryLine={summaryLine}
            onNext={() => setStep('course')}
            onBack={() => setStep('structure')}
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
            onBack={() => setStep('scoring')}
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
            onNext={() => setStep('structure')}
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
            // F-071/F-079: every split builds on one Teams step; a 1 v 1 has nothing to build and
            // goes straight to money like an individual game.
            nextLabel={isSolo || (isWithinGroup && structure!.teamSizes.every((k) => k === 1)) ? 'Money' : 'Teams'}
            onBack={() => setStep('course')}
            onNext={() => {
              const singleGroup = () => [{
                id: crypto.randomUUID(),
                name: 'Group',
                playerIds: players.map((p) => p.id),
                matchupId: crypto.randomUUID(),
              }];
              if (isSolo) {
                // Everyone for themselves: one group holding the whole field (individual modes
                // top out at four), straight to money.
                setTeams(singleGroup());
                setStep('create');
                return;
              }
              if (alignedFlow) {
                // Every team is its own tee group: the foursome builder makes teams AND tee sheet.
                setStep('teams');
                return;
              }
              // Teams that share foursomes (F-071): the SAME teams step builds them. A structure
              // that already decides membership — every team is one player, the 1 v 1 — has nothing
              // to ask (F-079): the sides are the players and the field walks as one group.
              const present = new Set(players.map((p) => p.id));
              if (structure!.teamSizes.every((k) => k === 1)) {
                setSides(players.map((p, i) => ({ id: String.fromCharCode(97 + i), playerIds: [p.id] })));
                setSideTeams([]);
                setTeams(singleGroup());
                setStep('create');
                return;
              }
              // Someone left the field since the teams were built: drop them, keep the rest.
              const pruned = sideTeams.map((t) => ({ ...t, playerIds: t.playerIds.filter((id) => present.has(id)) }));
              if (pruned.some((t, i) => t.playerIds.length !== sideTeams[i].playerIds.length)) setSideTeams(pruned);
              // Sides from a saved format hold another day's players; the router must not read them.
              if (sides && !sides.every((s) => s.playerIds.every((id) => present.has(id)))) setSides(undefined);
              if (!sideCaptainsTouched.current) setSideCaptainsState(Math.max(...structure!.teamSizes) >= 3);
              setStep('teams');
            }}
          />
        )}

        {/* F-071: teams that share foursomes — the pool's TeamsStep in money-teams mode (no tee
            times or send-out order here; those belong to the tee sheet). Leaving it derives the
            sides (ids a, b, c… by position, names kept when typed) and lays the tee sheet with
            partners together (§5.bm Q2); the groups step follows only when the field can't walk
            as one. */}
        {step === 'teams' && isWithinGroup && structure && (
          <TeamsStep
            mode="money-teams"
            course={course}
            players={players}
            setPlayers={setPlayers}
            teams={sideTeams}
            setTeams={setSideTeams}
            lockedGroups={lockedGroups}
            setLockedGroups={setLockedGroups}
            captainIds={captainIds}
            setCaptainIds={setCaptainIds}
            excludeCaptains={balanceExcludeCaptains}
            setExcludeCaptains={setBalanceExcludeCaptains}
            useCaptains={sideCaptains}
            setUseCaptains={setSideCaptains}
            teamBuild={teamBuild}
            setTeamBuild={setTeamBuild}
            teamSizes={structure.teamSizes}
            subtitle={(() => {
              const label = structureOptionLabel(structure, players.length).label;
              return needsPlayingGroups
                ? `${label}. Partners walk together — who tees off with whom comes next.`
                : `${label} — everyone walks as one group.`;
            })()}
            // The board's name for an unnamed team ("Craig & Jym"), so leaving the box blank
            // promises what will actually show (same resolver as the review and the leaderboard).
            namePlaceholder={(team, i) => sideNameFrom(
              players, team.playerIds, String.fromCharCode(97 + i), undefined,
              allSidesAreSolo(sideTeams.map((t, j) => ({ id: String.fromCharCode(97 + j), playerIds: t.playerIds }))),
            )}
            nextLabel={needsPlayingGroups ? 'Next: Groups' : 'Next: Review & Create'}
            handicapAllowance={parseFloat(handicapAllowance) || 100}
            handicapBasis={handicapBasis}
            nine={wizardNine}
            onBack={() => setStep('tees')}
            onNext={() => {
              const built = sideTeams.filter((t) => t.playerIds.length > 0);
              const nextSides: GameSide[] = built.map((t, i) => ({
                id: String.fromCharCode(97 + i),
                ...(t.name.trim() ? { name: t.name.trim() } : {}),
                playerIds: t.playerIds,
              }));
              const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
              // Coming back through with the same teams keeps the tee sheet the organizer may have
              // dragged; different teams get a fresh partners-together proposal.
              const sameSides = !!sides && sides.length === nextSides.length
                && sides.every((s, i) => sameSet(s.playerIds, nextSides[i].playerIds));
              const teamsCoverField = teams.length > 0 && sameSet(teams.flatMap((t) => t.playerIds), players.map((p) => p.id));
              setSides(nextSides);
              if (!(sameSides && teamsCoverField)) {
                setTeams(needsPlayingGroups
                  ? proposeTeeGroups(built.map((t) => t.playerIds)).map((playerIds, i) => ({
                    id: crypto.randomUUID(),
                    name: `Group ${i + 1}`,
                    playerIds: sortPlayerIdsByHcap(playerIds, players, course, parseFloat(handicapAllowance) || 100, handicapBasis),
                    matchupId: crypto.randomUUID(),
                    teeTime: '',
                  }))
                  : [{ id: crypto.randomUUID(), name: 'Group', playerIds: players.map((p) => p.id), matchupId: crypto.randomUUID() }]);
              }
              setStep(needsPlayingGroups ? 'groups' : 'create');
            }}
          />
        )}

        {/* F-019: WHO WALKS WITH WHOM — a side game's tee sheet, asked separately from its teams.
            Reuses the classic pool's TeamsStep verbatim (it already does exactly this: balanced
            proposal, drag between groups, tee time per group, reorder, add/remove) rather than
            growing a second editor for the same question. Captains are off: a side game's money
            has no captain role, and the panel would be noise. After F-071 it comes AFTER the
            teams, so its shape buttons re-pack whole teams (partners together). */}
        {step === 'groups' && needsPlayingGroups && (
          <PlayingGroupsStep
            course={course}
            players={players}
            teams={teams}
            setTeams={setTeams}
            partnerTeams={(sides ?? []).map((s) => s.playerIds)}
            handicapAllowance={parseFloat(handicapAllowance) || 100}
            handicapBasis={handicapBasis}
            nine={wizardNine}
            onNext={() => setStep('create')}
            onBack={() => setStep('teams')}
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
            // The structure's shape (2 × 4, 3 + 3 + 2): team count and sizes come from step 2.
            teamSizes={shapeNow.teamSizes}
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
            // The routed container and the money models the router allows for THIS game, each
            // with its reason when refused (plan §3.4 — one vocabulary, honest gaps).
            container={container}
            blockedReason={route.container === 'unexpressible' ? route.reason : null}
            moneyModel={moneyModel}
            setMoneyModel={setMoneyModel}
            moneyOptions={moneyOptions}
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
            modeSettings={container === 'sides' ? sidesSettings : modeSettings}
            setModeSettings={(v) => setModeSettings({ ...modeSettings, ...v })}
            strokeMethod={strokeMethod}
            onSaveFormat={saveCurrentFormat}
            onCreate={createPoolGame}
            onBack={() => setStep(isSolo ? 'tees' : 'teams')}
          />
        )}
      </main>
    </div>
  );
}

function StepIndicator({ current, course, solo, playingGroups }: { current: Step; course: CourseSelection | null; solo?: boolean; playingGroups?: boolean }) {
  // §5.au: the FIELD leads. Structure and scoring follow (§5.bk), then course (a nine vs 18
  // depends on what's being played), and tees close the loop once both course and players exist.
  const steps = [
    { key: 'field', label: 'Players' },
    { key: 'structure', label: 'Compete' },
    { key: 'scoring', label: 'Scoring' },
    { key: 'course', label: course?.courseName || 'Course' },
    { key: 'tees', label: 'Tees' },
    // F-071: every split builds its teams on ONE step. Everyone-for-themselves (and a 1 v 1,
    // whose membership the structure already decided) skips it.
    ...(solo ? [] : [{ key: 'teams', label: 'Teams' }]),
    // Teams that share foursomes and can't all walk together then pick their tee groups — a
    // second step because it's an independent question (F-019, §5.an). Absent for every other
    // flow, so nothing else gains a step.
    ...(playingGroups ? [{ key: 'groups', label: 'Groups' }] : []),
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
