'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { TwoBestBallsVariant } from '@/lib/formats';
import type { Player, CourseSelection, TeeSetOption } from '@/lib/game-state';
import { parseGhinIndex } from '@/lib/game-state';
import { PoolShareButton } from '@/components/pool-share';
import { GhinLoginModal } from '@/components/ghin-login-modal';
import { PairingLocks } from '@/components/pairing-locks';
import { CaptainsPanel } from '@/components/captains-panel';
import { TeeTimePicker } from '@/components/tee-time-picker';
import { saveGhinIdentity, getCreatorGhin } from '@/lib/pool-identity';
import { getAccessLevel } from '@/lib/invite-gate';
import {
  type PoolGame,
  type PoolTeam,
  type PoolJunkValues,
  type PoolMoneyMode,
  type PoolMatchConfig,
  DEFAULT_JUNK_VALUES,
  DEFAULT_MATCH_CONFIG,
  savePoolGame,
  getPoolPlayingHandicap,
  poolSplitDollarsForTeams,
  dollarsToPotSplit,
  balanceTeamsWithCaptains,
  balanceTeamsWithLocks,
  pickCaptains,
  sortPlayerIdsByHcap,
  orderPlayerIdsWithCaptain,
  teeOptionsForPlayer,
  defaultSubTeams,
} from '@/lib/pool-game';
import {
  type RosterPlayer,
  hydrateRoster,
  searchRoster,
  getRoster,
  getRosterPlayerByGhin,
  getRosterPlayerById,
  upsertRosterPlayer,
  refreshRosterHandicaps,
  getOldestHcapRefresh,
} from '@/lib/roster';
import { pickTeeForPlayer, teeRankInPool } from '@/lib/tee-pick';
import {
  type RosterGroup,
  type GroupDefaults,
  hydrateGroups,
  getGroups,
  getGroupById,
  upsertGroup,
} from '@/lib/roster-groups';
import { POOL_GROUP_SEED_KEY } from '@/lib/group-seed';
import { GAME_MODES, getGameMode, defaultSettings, type SettingsBag, type SettingValue } from '@/lib/game-modes';
import { ModeSettingsEditor } from '@/components/mode-settings-editor';

const WIZARD_KEY = 'pool_wizard_draft';
// Set by the Format Library's "Start a game" to preconfigure the wizard once.
const FORMAT_SEED_KEY = 'pool_format_seed';

type Step = 'details' | 'course' | 'field' | 'tees' | 'teams' | 'create';

function getToken() {
  return sessionStorage.getItem('ghin_token');
}

// Pick a tee for a player, STRICTLY within their gender. This matters because a
// course's men's and women's tees can share a name AND yardage yet carry
// different course ratings/slopes and different hole stroke-index (verified live
// at Spring Creek). Assigning a woman a men's tee id would silently corrupt her
// handicap, so we only ever choose from tees whose own gender matches the player.
// Priority: remembered tee name (within gender) -> gender default -> first
// same-gender tee -> course default.
// Pot legs entered in DOLLARS (front/back/overall/junk), held as strings so the
// inputs stay editable. Auto-filled from the team-count table but overridable.
interface PotDollars {
  front: string;
  back: string;
  overall: string;
  junk: string;
}

function legDollarsToStrings(d: { front: number; back: number; overall: number; junk: number }): PotDollars {
  return { front: String(d.front), back: String(d.back), overall: String(d.overall), junk: String(d.junk) };
}

function potDollarsTotal(d: PotDollars): number {
  return (parseFloat(d.front) || 0) + (parseFloat(d.back) || 0) + (parseFloat(d.overall) || 0) + (parseFloat(d.junk) || 0);
}

function parsePositionSplit(text: string): number[] {
  const parsed = text
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n));
  return parsed.length > 0 ? parsed : [100];
}

export default function NewPoolGamePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('details');
  const [hydrated, setHydrated] = useState(false);

  // Details
  const [name, setName] = useState('');
  // Game mode: undefined = classic team pool (pot/match). A registry id
  // ('nines'|'skins'|'quota'|...) = an INDIVIDUAL game scored within one group.
  const [gameMode, setGameMode] = useState<string | undefined>(undefined);
  const [modeSettings, setModeSettings] = useState<SettingsBag>({});
  // 2v2 within-group games only: the two sides' player-id lists.
  const [subTeams, setSubTeams] = useState<{ a: string[]; b: string[] } | undefined>(undefined);
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
  const [junkValues, setJunkValues] = useState<PoolJunkValues>({ ...DEFAULT_JUNK_VALUES });
  const [ballSelection, setBallSelection] = useState<TwoBestBallsVariant>('1-net-1-gross');
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

  // Field
  const [players, setPlayers] = useState<Player[]>([]);
  // The saved group this game was created FROM (a seed from /home/groups/[id], or
  // the FieldStep "Load group" picker). Stamped onto the game as sourceGroupId so
  // stats/ledger can attribute it exactly. Absent = made outside a group.
  const [sourceGroupId, setSourceGroupId] = useState<string | undefined>(undefined);

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

  // Hydrate wizard draft on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(WIZARD_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (typeof data.name === 'string') setName(data.name);
        if (typeof data.entryPerPlayer === 'string') setEntryPerPlayer(data.entryPerPlayer);
        if (typeof data.handicapAllowance === 'string') setHandicapAllowance(data.handicapAllowance);
        if (data.strokeMethod === 'full' || data.strokeMethod === 'off-the-low') setStrokeMethod(data.strokeMethod);
        if (data.handicapBasis === 'course' || data.handicapBasis === 'index') setHandicapBasis(data.handicapBasis);
        if (typeof data.balanceExcludeCaptains === 'boolean') setBalanceExcludeCaptains(data.balanceExcludeCaptains);
        if (typeof data.useCaptains === 'boolean') setUseCaptains(data.useCaptains);
        if (data.potDollars) { setPotDollars(data.potDollars); setPotEdited(!!data.potEdited); }
        if (typeof data.positionSplitText === 'string') setPositionSplitText(data.positionSplitText);
        if (data.junkValues) setJunkValues(data.junkValues);
        if (data.ballSelection) setBallSelection(data.ballSelection);
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
    // Seed from a Format Library entry (set by the library's "Start a game").
    // Applied AFTER the draft so a chosen format wins; consumed once.
    try {
      const seedRaw = sessionStorage.getItem(FORMAT_SEED_KEY);
      if (seedRaw) {
        sessionStorage.removeItem(FORMAT_SEED_KEY);
        const seed = JSON.parse(seedRaw) as { name?: string; defaults?: GroupDefaults };
        if (seed.name && seed.name.trim()) setName(seed.name);
        if (seed.defaults) applyGroupDefaults(seed.defaults);
      }
    } catch {}
    setHydrated(true);
  }, []);

  // Auto-save wizard draft on every change
  useEffect(() => {
    if (!hydrated) return;
    sessionStorage.setItem(WIZARD_KEY, JSON.stringify({
      name, entryPerPlayer, handicapAllowance, strokeMethod, handicapBasis, balanceExcludeCaptains, useCaptains, potDollars, potEdited, positionSplitText,
      junkValues, ballSelection, moneyMode, matchLegs, matchJunkPerPoint, gameMode, modeSettings, course, players, teams, teamBuild, step,
      holesPlaying, nineHandicapBasis,
    }));
  }, [hydrated, name, entryPerPlayer, handicapAllowance, strokeMethod, handicapBasis, balanceExcludeCaptains, useCaptains, potDollars, potEdited, positionSplitText,
      junkValues, ballSelection, moneyMode, matchLegs, matchJunkPerPoint, gameMode, modeSettings, course, players, teams, teamBuild, step,
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
      ballSelection,
      useCaptains,
      // Game mode + its settings (so a saved group/format restores the game type).
      gameMode,
      modeSettings: gameMode ? modeSettings : undefined,
      subTeams,
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
    if (d.strokeMethod === 'full' || d.strokeMethod === 'off-the-low') setStrokeMethod(d.strokeMethod);
    if (d.handicapBasis === 'course' || d.handicapBasis === 'index') setHandicapBasis(d.handicapBasis);
    if (d.ballSelection) setBallSelection(d.ballSelection);
    if (typeof d.useCaptains === 'boolean') setUseCaptains(d.useCaptains);
    // Game mode + settings (restore a saved individual/2v2/decision game). Only
    // set gameMode when present so a plain player-group (no mode) stays classic.
    if (typeof d.gameMode === 'string') setGameMode(d.gameMode);
    if (d.modeSettings && typeof d.modeSettings === 'object') setModeSettings(d.modeSettings);
    if (d.subTeams && Array.isArray(d.subTeams.a) && Array.isArray(d.subTeams.b)) setSubTeams(d.subTeams);
  }

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

  function createPoolGame() {
    const id = crypto.randomUUID();
    // Effective dollar split: manual override if set, else the standard for this
    // team count. Stored as pot fractions (compute engine multiplies by the pot).
    const effectiveDollars = potDollars
      ? { front: parseFloat(potDollars.front) || 0, back: parseFloat(potDollars.back) || 0, overall: parseFloat(potDollars.overall) || 0, junk: parseFloat(potDollars.junk) || 0 }
      : poolSplitDollarsForTeams(teams.length);
    const game: PoolGame = {
      id,
      name: name || 'Pool Game',
      createdAt: new Date().toISOString(),
      course,
      players,
      teams,
      ballSelection,
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
      ctpWinners: {},
      // Individual game mode + its chosen option values (absent for classic pool).
      gameMode,
      modeSettings: gameMode ? modeSettings : undefined,
      // 2v2 within-group only: the two sides.
      subTeams: isWithinGroup ? subTeams : undefined,
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
          <h1 className="text-xl font-bold">New Pool Game</h1>
          <div className="flex items-center gap-4">
            <PoolShareButton className="text-sm text-green-200 hover:text-white font-medium" label="Share" />
            <button onClick={() => router.push('/pool')} className="text-sm text-green-200 hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <StepIndicator current={step} course={course} individualGame={modeCategory === 'individual'} withinGroup={isWithinGroup} />

        {step === 'details' && (
          <DetailsStep
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
            ballSelection={ballSelection}
            setBallSelection={setBallSelection}
            moneyMode={moneyMode}
            setMoneyMode={setMoneyMode}
            matchLegs={matchLegs}
            setMatchLegs={setMatchLegs}
            matchJunkPerPoint={matchJunkPerPoint}
            setMatchJunkPerPoint={setMatchJunkPerPoint}
            onNext={() => setStep('course')}
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
            onNext={() => setStep('field')}
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
            getGroupDefaults={currentGroupDefaults}
            applyGroupDefaults={applyGroupDefaults}
            onGroupLoaded={setSourceGroupId}
            onNext={() => setStep('tees')}
            onBack={() => setStep('course')}
          />
        )}

        {step === 'tees' && (
          <TeesStep
            course={course}
            players={players}
            setPlayers={setPlayers}
            handicapAllowance={parseFloat(handicapAllowance) || 100}
            handicapBasis={handicapBasis}
            onNext={() => {
              // Single-group games (individual + 2v2) run as ONE team holding every
              // player. Auto-build it now. Individual → straight to Create;
              // within-group → the SubTeamsStep (shown in the 'teams' slot).
              if (isSingleGroup) {
                setTeams([{
                  id: crypto.randomUUID(),
                  name: 'Group',
                  playerIds: players.map((p) => p.id),
                  matchupId: crypto.randomUUID(),
                }]);
                if (isWithinGroup) {
                  setSubTeams((prev) => prev ?? defaultSubTeams(players.map((p) => p.id), players, course, parseFloat(handicapAllowance) || 100, handicapBasis));
                  setStep('teams');
                } else {
                  setStep('create');
                }
              } else {
                setStep('teams');
              }
            }}
            onBack={() => setStep('field')}
          />
        )}

        {step === 'teams' && isWithinGroup && (
          <SubTeamsStep
            players={players}
            course={course}
            handicapAllowance={parseFloat(handicapAllowance) || 100}
            handicapBasis={handicapBasis}
            subTeams={subTeams}
            setSubTeams={setSubTeams}
            onNext={() => setStep('create')}
            onBack={() => setStep('tees')}
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
            gameMode={gameMode}
            onCreate={createPoolGame}
            onBack={() => setStep(modeCategory === 'individual' ? 'tees' : 'teams')}
          />
        )}
      </main>
    </div>
  );
}

function StepIndicator({ current, course, individualGame, withinGroup }: { current: Step; course: CourseSelection | null; individualGame?: boolean; withinGroup?: boolean }) {
  const steps = [
    { key: 'details', label: 'Details' },
    { key: 'course', label: course?.courseName || 'Course' },
    { key: 'field', label: 'Field' },
    { key: 'tees', label: 'Tees' },
    // Individual games skip team-building entirely; 2v2 within-group replaces it
    // with a "Sides" step; classic pool keeps "Teams".
    ...(individualGame ? [] : [{ key: 'teams', label: withinGroup ? 'Sides' : 'Teams' }]),
    { key: 'create', label: 'Create' },
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

function DetailsStep({
  name, setName,
  gameMode, setGameMode, modeSettings, setModeSettings,
  entryPerPlayer, setEntryPerPlayer, handicapAllowance, setHandicapAllowance,
  strokeMethod, setStrokeMethod,
  handicapBasis, setHandicapBasis,
  positionSplitText, setPositionSplitText,
  junkValues, setJunkValues, ballSelection, setBallSelection,
  moneyMode, setMoneyMode, matchLegs, setMatchLegs, matchJunkPerPoint, setMatchJunkPerPoint,
  onNext,
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
  ballSelection: TwoBestBallsVariant; setBallSelection: (v: TwoBestBallsVariant) => void;
  moneyMode: PoolMoneyMode; setMoneyMode: (v: PoolMoneyMode) => void;
  matchLegs: { front: string; back: string; overall: string };
  setMatchLegs: (v: { front: string; back: string; overall: string }) => void;
  matchJunkPerPoint: string; setMatchJunkPerPoint: (s: string) => void;
  onNext: () => void;
}) {
  const selectedMode = getGameMode(gameMode);
  // Any registered game mode (individual OR 2v2 within-group) is a single-group
  // game: it renders ITS OWN options (via the mode's settings schema) and does
  // NOT use the classic team-pool "Game Type / pot / match / junk / ball" block.
  // Only the classic foursome-vs-foursome pool (no gameMode) uses that block.
  const isRegisteredMode = !!selectedMode;
  // Pick a game type: classic team pool, or one of the registered individual
  // games. Selecting an individual game seeds its norm defaults into modeSettings.
  function pickGame(id: string | undefined) {
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
  const junkFields: { key: keyof PoolJunkValues; label: string }[] = [
    { key: 'birdie', label: 'Birdie' },
    { key: 'eagle', label: 'Eagle' },
    { key: 'albatross', label: 'Albatross' },
    { key: 'groupHug', label: 'Group Hug' },
    { key: 'ctp', label: 'CTP' },
  ];

  const ballOptions: { value: TwoBestBallsVariant; label: string }[] = [
    { value: '1-net-1-gross', label: '1 Net + 1 Gross (different players)' },
    { value: '2-best-net', label: '2 Best Net' },
    { value: '2-best-gross', label: '2 Best Gross' },
  ];

  const canProceed = name.trim().length > 0;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Pool Game Details</h2>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Game Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Saturday Pool"
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        {/* Game picker: classic team pool, or a registered individual game.
            Choosing an individual game reveals only that game's options below. */}
        <div className="pt-2 border-t">
          <label className="block text-sm font-medium text-gray-800 mb-1">Game</label>
          <select
            value={gameMode ?? 'pool'}
            onChange={(e) => pickGame(e.target.value === 'pool' ? undefined : e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            <option value="pool">Team Pool (foursomes vs foursomes)</option>
            {GAME_MODES.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {selectedMode
              ? `${selectedMode.description} Played within a single group of ${selectedMode.playersMin}–${selectedMode.playersMax}.`
              : 'The classic buy-in pool or head-to-head match across foursomes.'}
          </p>
        </div>

        {/* Game options for ANY registered mode — individual AND 2v2 within-group
            (2v2's Team format / Hole score / Compare-by / Money live here). */}
        {isRegisteredMode && selectedMode && (
          <div className="pt-2 border-t">
            <label className="block text-sm font-medium text-gray-800 mb-2">{selectedMode.name} options</label>
            <ModeSettingsEditor
              schema={selectedMode.settings}
              values={modeSettings}
              onChangeAction={(key, value) => setModeSettings({ ...modeSettings, [key]: value })}
            />
          </div>
        )}

        {!isRegisteredMode && (
        <div className="pt-2 border-t">
          <label className="block text-sm font-medium text-gray-800 mb-1">Game Type</label>
          <div className="flex gap-2">
            {([
              { v: 'pot', label: 'Pool (pot split)' },
              { v: 'match', label: 'Head-to-head match' },
            ] as const).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setMoneyMode(v)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
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
              ? 'Two foursomes head-to-head. Each leg pays a fixed amount per player; junk pays a set amount per point of margin. No buy-in.'
              : 'Everyone buys in to one pot, split into front / back / overall / junk and paid out by finishing place.'}
          </p>
        </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          {moneyMode === 'pot' && !isRegisteredMode && (
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Entry ($ / player)</label>
            <input
              type="number"
              inputMode="decimal"
              value={entryPerPlayer}
              onChange={(e) => setEntryPerPlayer(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Handicap Allowance (%)</label>
            <input
              type="number"
              inputMode="decimal"
              value={handicapAllowance}
              onChange={(e) => setHandicapAllowance(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Handicap Strokes</label>
          <div className="flex gap-2">
            {([
              { v: 'full', label: 'Full handicap' },
              { v: 'off-the-low', label: 'Off the low' },
            ] as const).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setStrokeMethod(v)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
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
              ? 'Lowest-handicap player in the field plays to scratch; everyone else plays the difference.'
              : 'Every player uses their full course handicap × allowance.'}
          </p>
        </div>

        <div className="pt-2 border-t">
          <label className="block text-sm font-medium text-gray-800 mb-1">Handicap Basis</label>
          <div className="flex gap-2">
            {([
              { v: 'course', label: 'Course handicap' },
              { v: 'index', label: 'Player index' },
            ] as const).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setHandicapBasis(v)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
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
              ? 'Play off each player’s raw handicap index × allowance (no slope/rating conversion).'
              : 'Play off each player’s course handicap from their tee (slope/rating adjusted).'}
          </p>
        </div>

        {moneyMode === 'pot' && !isRegisteredMode && (
        <div className="pt-2 border-t">
          <p className="text-xs text-gray-500">Pot split (front / back / overall / junk) is set on the final step — it fills in automatically from the number of teams.</p>
        </div>
        )}

        {moneyMode === 'pot' && !isRegisteredMode && (
        <div className="pt-2 border-t">
          <label className="block text-sm font-medium text-gray-800 mb-1">Position Split</label>
          <input
            type="text"
            value={positionSplitText}
            onChange={(e) => setPositionSplitText(e.target.value)}
            placeholder="e.g. 100 or 70, 30"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Percent of each sub-pot per finishing place. &quot;100&quot; = winner-take-all; &quot;70, 30&quot; = 1st/2nd.
          </p>
        </div>
        )}

        {moneyMode === 'match' && (
        <div className="pt-2 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-2">Match Payouts ($ / player)</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'front' as const, label: 'Front 9' },
              { key: 'back' as const, label: 'Back 9' },
              { key: 'overall' as const, label: 'Overall' },
            ]).map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-gray-600 font-medium mb-1">{label}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={matchLegs[key]}
                  onChange={(e) => setMatchLegs({ ...matchLegs, [key]: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <label className="block text-xs text-gray-600 font-medium mb-1">Junk ($ / point of margin)</label>
            <input
              type="number"
              inputMode="decimal"
              value={matchJunkPerPoint}
              onChange={(e) => setMatchJunkPerPoint(e.target.value)}
              className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Each player on the losing side pays this per junk point of difference. With ${matchJunkPerPoint || '5'}/point, a birdie is worth ${(parseFloat(matchJunkPerPoint) || 5) * (junkValues.birdie || 1)}, an eagle ${(parseFloat(matchJunkPerPoint) || 5) * (junkValues.eagle || 2)}.
            </p>
          </div>
          <p className="text-xs text-amber-700 mt-2">Head-to-head is for exactly two foursomes. For three or more teams, use Pool (pot split).</p>
        </div>
        )}

        {!isRegisteredMode && (
        <div className="pt-2 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-2">Junk Values (points)</p>
          <div className="grid grid-cols-5 gap-2">
            {junkFields.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-gray-600 font-medium mb-1">{label}</label>
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

        {!isRegisteredMode && (
        <div className="pt-2 border-t">
          <label className="block text-sm font-medium text-gray-800 mb-1">Team Ball Selection</label>
          <select
            value={ballSelection}
            onChange={(e) => setBallSelection(e.target.value as TwoBestBallsVariant)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            {ballOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Per-hole team score for each foursome.</p>
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

function CourseStep({
  course, setCourse, holesPlaying, setHolesPlaying, nineHandicapBasis, setNineHandicapBasis, onNext, onBack,
}: {
  course: CourseSelection | null;
  setCourse: (c: CourseSelection | null) => void;
  holesPlaying: '18' | 'front9' | 'back9';
  setHolesPlaying: (v: '18' | 'front9' | 'back9') => void;
  nineHandicapBasis: '18' | '9';
  setNineHandicapBasis: (v: '18' | '9') => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [searchName, setSearchName] = useState('');
  const [searchState, setSearchState] = useState('VA');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [noToken, setNoToken] = useState(false);
  const [ghinUser, setGhinUser] = useState('');
  const [ghinPass, setGhinPass] = useState('');
  const [authError, setAuthError] = useState('');

  async function quickAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/ghin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ghinUser, password: ghinPass }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'Login failed');
        return;
      }
      sessionStorage.setItem('ghin_token', data.token);
      // Capture the organizer's GHIN identity so games they create are tied to
      // them (their "My Pool Games" history). Persisted to local storage too so
      // it survives a tab close.
      if (data.golfer) saveGhinIdentity(data.golfer);
      setNoToken(false);
    } catch {
      setAuthError('Connection error');
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) { setNoToken(true); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/ghin/courses/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: searchName, state: searchState }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.courses || []);
      } else {
        sessionStorage.removeItem('ghin_token');
        setNoToken(true);
        setError(data.error || 'Search failed — try logging in again');
      }
    } catch {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  }

  async function selectCourse(courseResult: any) {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch('/api/ghin/courses/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, course_id: courseResult.CourseID }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }

      const courseData = data.course;
      const allTeeSets: TeeSetOption[] = (courseData.TeeSets || []).map((ts: any) => ({
        id: ts.TeeSetRatingId,
        name: ts.TeeSetRatingName,
        gender: ts.Gender === 'Female' ? 'F' as const : 'M' as const,
        totalYardage: ts.TotalYardage,
        totalPar: ts.TotalPar,
        ratings: (ts.Ratings || []).map((r: any) => ({
          type: r.RatingType,
          courseRating: r.CourseRating,
          slopeRating: r.SlopeRating,
        })),
        holes: (ts.Holes || []).map((h: any) => ({
          number: h.Number,
          par: h.Par,
          yardage: h.Length,
          handicap: h.Allocation,
        })),
      }));
      const mensTeeSets = allTeeSets.filter((t) => t.gender === 'M');
      const womensTeeSets = allTeeSets.filter((t) => t.gender === 'F');
      // Suffix women's tees with (W), but idempotently — never produce "(W) (W)"
      // if GHIN already includes it.
      const teeSets = mensTeeSets.length > 0
        ? [...mensTeeSets, ...womensTeeSets.map((t) => ({ ...t, name: /\(w\)/i.test(t.name) ? t.name : `${t.name} (W)` }))]
        : allTeeSets;

      setCourse({
        courseId: courseResult.CourseID,
        courseName: courseResult.CourseName || courseData.CourseName,
        city: courseResult.City || courseData.CourseCity || '',
        state: courseResult.State || courseData.CourseState || '',
        teeSets,
        selectedTeeId: teeSets[0]?.id || null,
      });
      setResults([]);
    } catch {
      setError('Failed to load course');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Course</h2>

      {noToken && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4 space-y-2">
          <p className="text-sm text-amber-800 font-medium">Log in to GHIN to search courses</p>
          <form onSubmit={quickAuth} className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={ghinUser}
              onChange={(e) => setGhinUser(e.target.value)}
              placeholder="GHIN email"
              className="flex-1 min-w-[140px] rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            <input
              type="password"
              value={ghinPass}
              onChange={(e) => setGhinPass(e.target.value)}
              placeholder="Password"
              className="flex-1 min-w-[140px] rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            <button type="submit" className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white font-medium hover:bg-amber-700">
              Login
            </button>
          </form>
          {authError && <p className="text-xs text-red-600">{authError}</p>}
        </div>
      )}

      <form onSubmit={search} className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          placeholder="Course name"
          className="flex-1 min-w-[200px] rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <input
          type="text"
          value={searchState}
          onChange={(e) => setSearchState(e.target.value.toUpperCase())}
          placeholder="State"
          maxLength={2}
          className="w-20 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <button type="submit" disabled={loading} className="rounded-md bg-green-700 px-4 py-2 text-white font-medium hover:bg-green-800 disabled:opacity-50">
          {loading ? '...' : 'Search'}
        </button>
      </form>

      {error && <p className="text-red-600 mb-4 text-sm">{error}</p>}

      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
          <ul className="divide-y divide-gray-200">
            {results.map((c: any) => (
              <li key={c.CourseID}>
                <button onClick={() => selectCourse(c)} disabled={loading} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition">
                  <p className="font-medium text-gray-900">{c.CourseName}</p>
                  <p className="text-sm text-gray-500">{c.FacilityName} — {c.City}, {c.State}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {course && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium text-gray-900">{course.courseName}</p>
              <p className="text-sm text-gray-500">{course.city}{course.city && course.state ? ', ' : ''}{course.state}</p>
            </div>
            <button onClick={() => setCourse(null)} className="text-red-500 hover:text-red-700 text-sm">
              Clear
            </button>
          </div>
          {course.teeSets.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Tee</label>
              <select
                value={course.selectedTeeId || ''}
                onChange={(e) => setCourse({ ...course, selectedTeeId: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                {course.teeSets.map((ts) => (
                  <option key={ts.id} value={ts.id}>
                    {ts.name} ({ts.totalYardage} yds)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Holes played. 18 (default) keeps the classic front/back/overall pot
              split; a nine puts the whole pot on the nine and reveals the
              handicap-basis choice below. */}
          <div className="mt-4 pt-3 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-1">Holes</label>
            <div className="flex gap-2">
              {([
                { v: '18', label: '18 holes' },
                { v: 'front9', label: 'Front 9' },
                { v: 'back9', label: 'Back 9' },
              ] as const).map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setHolesPlaying(v)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                    holesPlaying === v ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {holesPlaying !== '18' && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">9-hole handicap</label>
                <div className="flex gap-2">
                  {([
                    { v: '18', label: 'Half of 18-hole' },
                    { v: '9', label: '9-hole (USGA)' },
                  ] as const).map(({ v, label }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setNineHandicapBasis(v)}
                      className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                        nineHandicapBasis === v ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {nineHandicapBasis === '18'
                    ? 'Most casual games: take each player’s full 18-hole course handicap and give strokes on this nine using the regular 18-hole stroke index (so a player gets roughly half their strokes).'
                    : 'USGA-proper: use the tee’s 9-hole rating with the handicap halved, and re-rank the stroke index 1–9 for this nine. More technically correct, less common casually.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!course}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Build Field
      </button>
    </div>
  );
}

function FieldStep({
  course, players, setPlayers, handicapAllowance, handicapBasis, getGroupDefaults, applyGroupDefaults, onGroupLoaded, onNext, onBack,
}: {
  course: CourseSelection | null;
  players: Player[]; setPlayers: (p: Player[]) => void;
  handicapAllowance: number;
  handicapBasis: 'course' | 'index';
  getGroupDefaults: () => GroupDefaults;
  applyGroupDefaults: (d: GroupDefaults | null) => void;
  onGroupLoaded: (groupId: string) => void;
  onNext: () => void; onBack: () => void;
}) {
  const [rosterQuery, setRosterQuery] = useState('');
  const [rosterResults, setRosterResults] = useState<RosterPlayer[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');

  const [ghinInput, setGhinInput] = useState('');
  const [ghinLoading, setGhinLoading] = useState(false);
  const [ghinError, setGhinError] = useState('');

  const [nameInput, setNameInput] = useState('');
  const [handicapInput, setHandicapInput] = useState('');
  const [genderInput, setGenderInput] = useState<'M' | 'F'>('M');

  // GHIN name search
  const [gsFirst, setGsFirst] = useState('');
  const [gsLast, setGsLast] = useState('');
  const [gsState, setGsState] = useState('VA');
  const [gsResults, setGsResults] = useState<any[]>([]);
  const [gsLoading, setGsLoading] = useState(false);
  const [gsSearched, setGsSearched] = useState(false);
  const [gsNote, setGsNote] = useState('');

  // Shown when a GHIN call fails (token expired). Re-login, then retry via retryRef.
  const [showLogin, setShowLogin] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);

  // Saved groups (organizer's "home base" rosters + format defaults).
  const [groups, setGroups] = useState<RosterGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [saveGroupName, setSaveGroupName] = useState('');
  const [groupNote, setGroupNote] = useState('');
  // The group currently loaded as today's roster context. When set, the player
  // picker shows this group's members up top ("who's playing today") and tucks
  // the rest of the roster behind an "Add someone else" toggle — so you pick a
  // day's field FROM the group instead of scrolling the whole saved-player pool.
  const [activeGroupId, setActiveGroupId] = useState('');
  const [showOtherPlayers, setShowOtherPlayers] = useState(false);

  useEffect(() => {
    // Scope the roster to this organizer (owner sees all; others see the shared
    // base roster plus their own saved players).
    hydrateRoster({ viewerGhin: getCreatorGhin(), isOwner: getAccessLevel() === 'full' }).then(async () => {
      setRosterResults(searchRoster(''));
      // Groups share the same viewer scope. Best-effort — fails soft to empty.
      hydrateGroups({ viewerGhin: getCreatorGhin(), isOwner: getAccessLevel() === 'full' })
        .then(() => {
          setGroups(getGroups());
          // A group seed from /home/groups/[id] "Start casual round": load that
          // group now (course is already chosen on this step, so tees resolve)
          // and consume the seed so it applies exactly once.
          try {
            const seededGroupId = sessionStorage.getItem(POOL_GROUP_SEED_KEY);
            if (seededGroupId) {
              sessionStorage.removeItem(POOL_GROUP_SEED_KEY);
              loadGroup(seededGroupId);
            }
          } catch {}
        })
        .catch(() => {});
      // Auto-refresh from GHIN if the roster's handicaps are stale (>24h) or
      // never refreshed — so new games start current without hammering GHIN
      // every time. Manual "Refresh handicaps" is always available too.
      const token = getToken();
      if (!token) return;
      const oldest = getOldestHcapRefresh();
      const staleMs = 24 * 60 * 60 * 1000;
      const isStale = oldest === null || (Date.now() - new Date(oldest).getTime()) > staleMs;
      if (!isStale) return;
      setRefreshing(true);
      setRefreshNote('Refreshing handicaps from GHIN…');
      try {
        const changed = await refreshRosterHandicaps(token);
        setRosterResults(searchRoster(rosterQuery));
        setRefreshNote(changed > 0 ? `Updated ${changed} handicap${changed === 1 ? '' : 's'} from GHIN.` : 'Handicaps up to date.');
      } catch {
        setRefreshNote('Could not refresh from GHIN — using saved handicaps.');
      } finally {
        setRefreshing(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshRoster(query: string) {
    setRosterQuery(query);
    setRosterResults(searchRoster(query));
  }

  // Load a group: REPLACE today's field with the group's members (looked up in
  // the roster and given a tee), and apply the group's saved format defaults.
  function loadGroup(groupId: string) {
    // Prefer the group cache (populated by hydrateGroups) over the `groups`
    // React state, so a seed can load a group in the same tick hydration
    // finishes — before setGroups has re-rendered. Falls back to state.
    const group = getGroupById(groupId) ?? groups.find((g) => g.id === groupId);
    if (!group) return;
    const loaded: Player[] = [];
    let missing = 0;
    for (const pid of group.playerIds) {
      const rp = getRosterPlayerById(pid);
      if (!rp) { missing++; continue; }
      loaded.push({
        id: rp.id,
        name: rp.name,
        handicapIndex: rp.handicapIndex,
        gender: rp.gender ?? undefined,
        ghinNumber: rp.ghinNumber ?? undefined,
        teeSetId: pickTeeForPlayer(course, rp.gender ?? undefined, rp.defaultTeeName, rp.defaultTeeRank),
      });
    }
    setPlayers(loaded);
    applyGroupDefaults(group.defaults);
    onGroupLoaded(groupId);         // stamp the game's sourceGroupId (exact stats link)
    setActiveGroupId(groupId);      // the picker now centers on this group
    setShowOtherPlayers(false);
    setGroupNote(
      `Loaded “${group.name}” — ${loaded.length} player${loaded.length === 1 ? '' : 's'} pre-selected${missing > 0 ? ` (${missing} no longer on the roster)` : ''}. Uncheck anyone sitting out, or add others below.`
    );
  }

  // Save the current field + format as a group (new, or overwrite one by the same
  // name in this organizer's scope). Store each player's CANONICAL ROSTER id, not
  // the field id: a GHIN-added field player gets a fresh UUID, but the roster
  // dedupes by GHIN and keeps its own id — so we resolve by GHIN here, else fall
  // back to the field id (matches for manual/no-GHIN adds). Without this, loading
  // the group would miss every GHIN-added player (only their random field id was
  // stored, which no roster row has).
  async function saveAsGroup() {
    const name = saveGroupName.trim();
    if (name.length === 0 || players.length === 0) return;
    const existing = groups.find((g) => g.name.trim().toLowerCase() === name.toLowerCase());
    const rosterIds: string[] = [];
    for (const p of players) {
      const canonical = p.ghinNumber != null ? getRosterPlayerByGhin(p.ghinNumber)?.id : getRosterPlayerById(p.id)?.id;
      const id = canonical ?? p.id;
      if (!rosterIds.includes(id)) rosterIds.push(id); // dedupe (e.g. same person added twice)
    }
    const group: RosterGroup = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      ownerGhin: existing?.ownerGhin ?? getCreatorGhin(),
      playerIds: rosterIds,
      defaults: getGroupDefaults(),
    };
    await upsertGroup(group);
    setGroups(getGroups());
    setSaveGroupName('');
    setGroupNote(`Saved “${name}” — ${players.length} player${players.length === 1 ? '' : 's'}.`);
  }

  const existingGhins = new Set(players.map((p) => p.ghinNumber).filter((g): g is number => g != null));

  function addRosterPlayer(rp: RosterPlayer) {
    if (rp.ghinNumber != null && existingGhins.has(rp.ghinNumber)) return;
    const newPlayer: Player = {
      id: rp.id,
      name: rp.name,
      handicapIndex: rp.handicapIndex,
      gender: rp.gender ?? undefined,
      ghinNumber: rp.ghinNumber ?? undefined,
      teeSetId: pickTeeForPlayer(course, rp.gender ?? undefined, rp.defaultTeeName, rp.defaultTeeRank),
    };
    const nextPlayers = [...players, newPlayer];
    setPlayers(nextPlayers);

    // Auto-refresh: pull this player's current index from GHIN so every new
    // game uses up-to-date handicaps. Non-blocking — updates in place on return.
    const token = getToken();
    if (token && rp.ghinNumber != null) {
      fetch('/api/ghin/golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ghin_number: rp.ghinNumber }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const hi = parseGhinIndex(data?.golfer?.handicap_index ?? data?.golfer?.hi_value);
          if (hi === null || hi === rp.handicapIndex) return;
          setPlayers(nextPlayers.map((p) => (p.id === rp.id ? { ...p, handicapIndex: hi } : p)));
          upsertRosterPlayer({ ...rp, handicapIndex: hi });
        })
        .catch(() => { /* keep the cached index on any failure */ });
    }
  }

  async function doRefreshRoster() {
    const token = getToken();
    if (!token) { setRefreshNote('Log in via the Course step to refresh from GHIN.'); return; }
    setRefreshing(true);
    setRefreshNote('');
    try {
      const count = await refreshRosterHandicaps(token);
      refreshRoster(rosterQuery);
      // Reflect any updated indexes on players already in this field.
      const updated = getRoster();
      setPlayers(players.map((p) => {
        const rp = updated.find((r) => r.ghinNumber != null && r.ghinNumber === p.ghinNumber);
        return rp && rp.handicapIndex != null ? { ...p, handicapIndex: rp.handicapIndex } : p;
      }));
      setRefreshNote(count > 0 ? `Updated ${count} handicap${count === 1 ? '' : 's'} from GHIN.` : 'Handicaps already current.');
    } catch {
      setRefreshNote('Refresh failed — check your connection.');
    } finally {
      setRefreshing(false);
    }
  }

  async function addByGhin() {
    if (!ghinInput) return;
    const token = getToken();
    if (!token) { retryRef.current = addByGhin; setShowLogin(true); return; }
    setGhinLoading(true);
    setGhinError('');
    try {
      const res = await fetch('/api/ghin/golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ghin_number: Number(ghinInput) }),
      });
      const data = await res.json();
      if (!res.ok) { retryRef.current = addByGhin; setShowLogin(true); return; }
      const golfer = data.golfer;
      const hi = parseGhinIndex(golfer.handicap_index ?? golfer.hi_value);
      const ghinGender = (golfer.gender || golfer.Gender || '').toLowerCase();
      const gender: 'M' | 'F' = ghinGender === 'female' || ghinGender === 'f' ? 'F' : 'M';
      const ghinNumber = Number(ghinInput);
      const rememberedRp = getRosterPlayerByGhin(ghinNumber);
      const newPlayer: Player = {
        id: crypto.randomUUID(),
        name: `${golfer.first_name} ${golfer.last_name}`,
        handicapIndex: hi,
        gender,
        ghinNumber,
        teeSetId: pickTeeForPlayer(course, gender, rememberedRp?.defaultTeeName ?? null, rememberedRp?.defaultTeeRank),
      };
      setPlayers([...players, newPlayer]);
      upsertRosterPlayer({
        id: newPlayer.id,
        ghinNumber,
        name: newPlayer.name,
        handicapIndex: newPlayer.handicapIndex,
        gender,
        defaultTeeName: null,
      });
      setGhinInput('');
      refreshRoster(rosterQuery);
    } catch {
      setGhinError('Network error');
    } finally {
      setGhinLoading(false);
    }
  }

  function addManual() {
    if (!nameInput) return;
    const id = crypto.randomUUID();
    const handicapIndex = handicapInput ? parseFloat(handicapInput) : null;
    const newPlayer: Player = {
      id,
      name: nameInput,
      handicapIndex,
      gender: genderInput,
      teeSetId: pickTeeForPlayer(course, genderInput, null),
    };
    setPlayers([...players, newPlayer]);
    upsertRosterPlayer({
      id,
      ghinNumber: null,
      name: nameInput,
      handicapIndex,
      gender: genderInput,
      defaultTeeName: null,
    });
    setNameInput('');
    setHandicapInput('');
  }

  async function searchGhinByName() {
    // GHIN name search requires a last name AND a state to return results.
    if (!gsLast.trim()) { setGsNote('Enter a last name to search.'); return; }
    if (!gsState.trim()) { setGsNote('Enter a state (e.g. VA) — GHIN requires it to search by name.'); return; }
    const token = getToken();
    if (!token) { retryRef.current = searchGhinByName; setShowLogin(true); return; }
    setGsLoading(true);
    setGsSearched(false);
    setGsNote('');
    try {
      const res = await fetch('/api/ghin/search-golfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, first_name: gsFirst, last_name: gsLast, state: gsState }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGsResults([]);
        retryRef.current = searchGhinByName;
        setShowLogin(true);
        return;
      }
      const golfers: any[] = data.golfers || [];
      setGsResults(golfers);
      setGsSearched(true);
      if (golfers.length === 0) {
        setGsNote(`No golfers named "${gsLast}" found in ${gsState.toUpperCase()}. Check spelling/state, or add by GHIN #.`);
      }
    } catch {
      setGsResults([]);
      setGsNote('Search failed — check your connection or add by GHIN #');
    } finally {
      setGsLoading(false);
    }
  }

  function addGhinSearchResult(g: any) {
    const ghinNumber = Number(g.ghin ?? g.id);
    if (!isNaN(ghinNumber) && existingGhins.has(ghinNumber)) return;
    const hi = parseGhinIndex(g.handicap_index ?? g.hi_value);
    const ghinGender = (g.gender || g.Gender || '').toLowerCase();
    const gender: 'M' | 'F' = ghinGender === 'female' || ghinGender === 'f' ? 'F' : 'M';
    const id = crypto.randomUUID();
    const rememberedRp = !isNaN(ghinNumber) ? getRosterPlayerByGhin(ghinNumber) : null;
    const newPlayer: Player = {
      id,
      name: `${g.first_name ?? ''} ${g.last_name ?? ''}`.trim(),
      handicapIndex: hi,
      gender,
      ghinNumber: isNaN(ghinNumber) ? undefined : ghinNumber,
      teeSetId: pickTeeForPlayer(course, gender, rememberedRp?.defaultTeeName ?? null, rememberedRp?.defaultTeeRank),
    };
    setPlayers([...players, newPlayer]);
    upsertRosterPlayer({
      id,
      ghinNumber: isNaN(ghinNumber) ? null : ghinNumber,
      name: newPlayer.name,
      handicapIndex: newPlayer.handicapIndex,
      gender,
      defaultTeeName: null,
    });
    refreshRoster(rosterQuery);
  }

  function removePlayer(id: string) {
    setPlayers(players.filter((p) => p.id !== id));
  }

  function changePlayerTee(id: string, teeSetId: number) {
    setPlayers(players.map((p) => (p.id === id ? { ...p, teeSetId } : p)));
    // Remember this tee for next time — by NAME (exact) and by RELATIVE RANK
    // (cross-course fallback), so their usual tee follows them to other courses.
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
        defaultTeeRank: teeRankInPool(course, player.gender ?? undefined, teeSetId),
      });
    }
  }

  const fieldIds = new Set(players.map((p) => p.id));

  const canProceed = players.length >= 2;

  return (
    <div>
      <GhinLoginModal
        open={showLogin}
        onCloseAction={() => setShowLogin(false)}
        onDoneAction={() => { setShowLogin(false); const r = retryRef.current; retryRef.current = null; r?.(); }}
      />
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Build Field ({players.length})</h2>

      {/* Groups — load a saved group (members + format) or save the current field */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">Groups</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-2 flex-1">
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="">{groups.length ? 'Load a group…' : 'No groups saved yet'}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.playerIds.length})</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => selectedGroupId && loadGroup(selectedGroupId)}
              disabled={!selectedGroupId}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              Load
            </button>
          </div>
          <div className="flex gap-2 flex-1">
            <input
              type="text"
              value={saveGroupName}
              onChange={(e) => setSaveGroupName(e.target.value)}
              placeholder="Save current field as…"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={saveAsGroup}
              disabled={saveGroupName.trim().length === 0 || players.length === 0}
              className="rounded-md border border-green-700 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
        {groupNote && <p className="text-xs text-gray-500 mt-2">{groupNote}</p>}
        <p className="text-xs text-gray-400 mt-1">Loading a group pre-selects its members below (and applies its saved game settings) — then just uncheck anyone sitting out.</p>
      </div>

      {/* Saved roster — alphabetical checklist, tap to add/remove today's field */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-800">
            Choose who&apos;s playing
            <span className="ml-2 text-xs font-normal text-gray-500">{players.length} selected</span>
          </p>
          <div className="flex items-center gap-3">
            {(players.length > 0 || activeGroupId) && (
              <button
                onClick={() => { setPlayers([]); setActiveGroupId(''); setShowOtherPlayers(false); setGroupNote(''); }}
                className="text-xs text-gray-500 hover:text-red-600 font-medium"
                title="Deselect everyone, clear the loaded group, and start fresh"
              >
                Clear
              </button>
            )}
            <button
              onClick={doRefreshRoster}
              disabled={refreshing}
              className="text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-50"
              title="Re-pull current handicap indexes from GHIN for all saved players"
            >
              {refreshing ? 'Refreshing…' : '↻ Refresh handicaps'}
            </button>
          </div>
        </div>
        {refreshNote && <p className="text-xs text-gray-500 mb-2">{refreshNote}</p>}
        <input
          type="text"
          value={rosterQuery}
          onChange={(e) => refreshRoster(e.target.value)}
          placeholder="Filter by name…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        {(() => {
          // Reusable row renderer so the group section and the "everyone else"
          // section look identical.
          const row = (rp: RosterPlayer) => {
            const inField = fieldIds.has(rp.id);
            return (
              <li key={rp.id}>
                <button
                  onClick={() => (inField ? removePlayer(rp.id) : addRosterPlayer(rp))}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 ${inField ? 'bg-green-50' : ''}`}
                >
                  <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${inField ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white'}`}>
                    {inField ? '✓' : ''}
                  </span>
                  <span className="flex-1 font-medium text-gray-900">{rp.name}</span>
                  <span className="text-xs text-gray-500">
                    {rp.handicapIndex ?? '—'}{rp.gender ? ` · ${rp.gender}` : ''}
                  </span>
                </button>
              </li>
            );
          };

          if (rosterResults.length === 0) {
            return <p className="mt-2 text-xs text-gray-500">No saved players{rosterQuery ? ' match' : ' yet'}. Add by GHIN # or manually below.</p>;
          }

          // When a group is loaded, split the roster into that group's members
          // (shown up top — "who's playing today") and everyone else (collapsed
          // behind a toggle). No active group → the plain full list as before.
          const activeGroup = activeGroupId ? groups.find((g) => g.id === activeGroupId) : null;
          if (!activeGroup) {
            return (
              <ul className="mt-2 max-h-80 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-100">
                {rosterResults.map(row)}
              </ul>
            );
          }
          const memberIds = new Set(activeGroup.playerIds);
          const members = rosterResults.filter((rp) => memberIds.has(rp.id));
          const others = rosterResults.filter((rp) => !memberIds.has(rp.id));
          return (
            <div className="mt-2 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{activeGroup.name} · {members.length}</p>
              <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-100">
                {members.length > 0 ? members.map(row) : <li className="px-3 py-2 text-xs text-gray-500">No group members match this filter.</li>}
              </ul>
              <button
                type="button"
                onClick={() => setShowOtherPlayers((v) => !v)}
                className="text-xs font-medium text-green-700 hover:text-green-900"
              >
                {showOtherPlayers ? '▾ Hide other players' : `▸ Add someone else (${others.length})`}
              </button>
              {showOtherPlayers && (
                <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-100">
                  {others.length > 0 ? others.map(row) : <li className="px-3 py-2 text-xs text-gray-500">Everyone else is already in the field or filtered out.</li>}
                </ul>
              )}
            </div>
          );
        })()}
      </div>

      {/* Add by GHIN # + manual */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">Add by GHIN #</p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={ghinInput}
            onChange={(e) => setGhinInput(e.target.value)}
            placeholder="GHIN number"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <button
            onClick={addByGhin}
            disabled={ghinLoading || !ghinInput}
            className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
          >
            {ghinLoading ? '...' : 'Add'}
          </button>
        </div>
        {ghinError && <p className="text-xs text-red-600 mt-1">{ghinError}</p>}

        <div className="mt-3 pt-3 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-2">Or add manually</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Name"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <input
              type="text"
              inputMode="decimal"
              value={handicapInput}
              onChange={(e) => setHandicapInput(e.target.value)}
              placeholder="HCP"
              className="w-16 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={() => setGenderInput(genderInput === 'M' ? 'F' : 'M')}
              className={`w-9 rounded-md border text-sm font-bold py-2 ${genderInput === 'M' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-pink-300 bg-pink-50 text-pink-700'}`}
            >
              {genderInput}
            </button>
            <button
              onClick={addManual}
              disabled={!nameInput}
              className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* GHIN name search */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-0.5">Search GHIN by name</p>
        <p className="text-xs text-gray-500 mb-2">Last name and state required. First name optional to narrow it down.</p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={gsFirst}
            onChange={(e) => setGsFirst(e.target.value)}
            placeholder="First (optional)"
            className="flex-1 min-w-[100px] rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <input
            type="text"
            value={gsLast}
            onChange={(e) => setGsLast(e.target.value)}
            placeholder="Last name"
            className="flex-1 min-w-[100px] rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <input
            type="text"
            value={gsState}
            onChange={(e) => setGsState(e.target.value.toUpperCase())}
            placeholder="ST"
            maxLength={2}
            className="w-14 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <button
            onClick={searchGhinByName}
            disabled={gsLoading || !gsLast.trim() || !gsState.trim()}
            className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
          >
            {gsLoading ? '...' : 'Search GHIN'}
          </button>
        </div>
        {gsNote && <p className="text-xs text-gray-500 mt-2">{gsNote}</p>}
        {gsSearched && gsResults.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-y-auto divide-y divide-gray-100">
            {gsResults.map((g: any, i: number) => (
              <li key={g.ghin ?? g.id ?? i}>
                <button
                  onClick={() => addGhinSearchResult(g)}
                  className="w-full text-left px-2 py-1.5 hover:bg-gray-50 rounded"
                >
                  <span className="text-sm font-medium text-gray-900">
                    {g.first_name} {g.last_name}
                  </span>
                  <span className="text-xs text-gray-500 ml-2">
                    {g.handicap_index ?? g.hi_value ?? '—'}
                    {g.gender ? ` · ${g.gender}` : ''}
                    {g.club_name ? ` · ${g.club_name}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Field list */}
      {players.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
          <ul className="divide-y divide-gray-200">
            {players.map((player) => {
              const courseHcap = course ? Math.round(getPoolPlayingHandicap(player, course, handicapAllowance, handicapBasis)) : null;
              return (
                <li key={player.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {player.name}
                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${player.gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                          {player.gender || 'M'}
                        </span>
                      </p>
                      <p className="text-sm text-gray-500">
                        Index: {player.handicapIndex ?? 'N/A'}
                        {courseHcap !== null && (
                          <span className="ml-2 text-green-700">Course HCP: {courseHcap}</span>
                        )}
                      </p>
                    </div>
                    <button onClick={() => removePlayer(player.id)} className="text-red-500 hover:text-red-700 text-sm">
                      Remove
                    </button>
                  </div>
                  {course && course.teeSets.length > 1 && (
                    <div className="mt-2">
                      <select
                        value={player.teeSetId || ''}
                        onChange={(e) => changePlayerTee(player.id, Number(e.target.value))}
                        className="text-sm rounded-md border border-gray-300 px-2 py-1 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                      >
                        {teeOptionsForPlayer(course, player).map((ts) => (
                          <option key={ts.id} value={ts.id}>
                            {ts.name} ({ts.totalYardage} yds)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Set Teams
      </button>
    </div>
  );
}

function makeTeam(index: number, playerIds: string[], captainId?: string): PoolTeam {
  return {
    id: crypto.randomUUID(),
    name: `Team ${index + 1}`,
    playerIds,
    matchupId: crypto.randomUUID(),
    teeTime: '',
    captainId,
  };
}

// Visual "who's playing from where" step: players grouped by their assigned tee,
// tap a player to move them to a different (same-gender) tee. Purely for setting/
// reviewing tees before forming teams — tees remain editable in the Teams step too.
function TeesStep({
  course, players, setPlayers, handicapAllowance, handicapBasis, onNext, onBack,
}: {
  course: CourseSelection | null;
  players: Player[]; setPlayers: (p: Player[]) => void;
  handicapAllowance: number;
  handicapBasis: 'course' | 'index';
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
                  const hcap = course ? Math.round(getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis)) : null;
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
        Next: Teams
      </button>
    </div>
  );
}

function TeamsStep({
  course, players, setPlayers, teams, setTeams, lockedGroups, setLockedGroups, captainIds, setCaptainIds,
  excludeCaptains, setExcludeCaptains, useCaptains, setUseCaptains, teamBuild, setTeamBuild, handicapAllowance, handicapBasis, onNext, onBack,
}: {
  course: CourseSelection | null;
  players: Player[]; setPlayers: (p: Player[]) => void;
  teams: PoolTeam[]; setTeams: (t: PoolTeam[]) => void;
  lockedGroups: string[][]; setLockedGroups: (g: string[][]) => void;
  captainIds: string[]; setCaptainIds: (ids: string[]) => void;
  excludeCaptains: boolean; setExcludeCaptains: (v: boolean) => void;
  useCaptains: boolean; setUseCaptains: (v: boolean) => void;
  teamBuild: PoolGame['teamBuild']; setTeamBuild: (b: PoolGame['teamBuild']) => void;
  handicapAllowance: number;
  handicapBasis: 'course' | 'index';
  onNext: () => void; onBack: () => void;
}) {
  function hcapOf(p: Player): number {
    return course ? getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis) : (p.handicapIndex ?? 0);
  }

  const numTeams = Math.max(1, Math.ceil(players.length / 4));

  // Auto-pick captains (lowest course handicaps, honoring locks) whenever the
  // field or team count changes and no captains have been set yet. Prunes any
  // captain who left the field. The organizer can still reassign any slot.
  useEffect(() => {
    if (!useCaptains) return; // no captains this game — skip auto-pick entirely
    const present = new Set(players.map((p) => p.id));
    const kept = captainIds.filter((id) => id && present.has(id));
    const needsAutopick = kept.length === 0 && players.length >= numTeams;
    if (needsAutopick) {
      const picks = pickCaptains(players, course, handicapAllowance, numTeams, lockedGroups, handicapBasis);
      setCaptainIds(Array.from({ length: numTeams }, (_, i) => picks[i] ?? ''));
    } else if (kept.length !== captainIds.length || captainIds.length !== numTeams) {
      // Trim/pad to numTeams and drop departed players, preserving existing picks.
      const deduped: string[] = [];
      for (const id of kept) if (!deduped.includes(id)) deduped.push(id);
      setCaptainIds(Array.from({ length: numTeams }, (_, i) => deduped[i] ?? ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, numTeams]);

  function changePlayerTee(id: string, teeSetId: number) {
    setPlayers(players.map((p) => (p.id === id ? { ...p, teeSetId } : p)));
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

  // The lowest course handicap on a team becomes its captain when we don't have
  // an explicit pick for the slot (e.g. plain auto-generate).
  function lowestHcapId(ids: string[]): string | undefined {
    return sortPlayerIdsByHcap(ids, players, course, handicapAllowance, handicapBasis)[0];
  }

  // Flag the current build as hand-adjusted after a move/make-captain, so the
  // read-only summary reads "hand-adjusted after". Nothing built yet → 'manual'.
  function markAdjusted() {
    setTeamBuild({ ...(teamBuild ?? { method: 'manual' }), adjustedAfter: true });
  }

  // Auto-generate: sequential foursomes, each sorted low->high, lowest = captain.
  function autoGenerate() {
    const groups: string[][] = [];
    for (let i = 0; i < players.length; i += 4) {
      groups.push(players.slice(i, i + 4).map((p) => p.id));
    }
    setTeams(groups.map((ids, i) => {
      const sorted = sortPlayerIdsByHcap(ids, players, course, handicapAllowance, handicapBasis);
      return makeTeam(i, sorted, useCaptains ? sorted[0] : undefined);
    }));
    setTeamBuild({ method: 'sequential', adjustedAfter: false });
  }

  // Auto-balance the field into even-handicap teams, honoring pairing locks.
  // With captains ON: each captain anchors a slot and the rest balance around
  // them (captain-first ordering). With captains OFF: plain even balance, no
  // captain role at all — each team just listed low->high.
  function autoBalance() {
    if (!useCaptains) {
      const groups = balanceTeamsWithLocks(players, numTeams, hcapOf, lockedGroups);
      setTeams(groups.map((ids, i) => {
        const ordered = sortPlayerIdsByHcap(ids, players, course, handicapAllowance, handicapBasis);
        return makeTeam(i, ordered); // no captainId
      }));
      setTeamBuild({
        method: 'balanced',
        excludeCaptains: false,
        hadCaptains: false,
        hadLocks: lockedGroups.some((g) => g.length >= 2),
        adjustedAfter: false,
      });
      return;
    }
    const captainByTeam = Array.from({ length: numTeams }, (_, i) => captainIds[i] || undefined);
    const groups = balanceTeamsWithCaptains(players, numTeams, hcapOf, captainByTeam, lockedGroups, excludeCaptains);
    setTeams(groups.map((ids, i) => {
      const captainId = captainByTeam[i] && ids.includes(captainByTeam[i]!) ? captainByTeam[i] : lowestHcapId(ids);
      const ordered = orderPlayerIdsWithCaptain(ids, captainId, players, course, handicapAllowance, handicapBasis);
      return makeTeam(i, ordered, captainId);
    }));
    // Snapshot the settings used, so the read-only summary reflects the actual
    // build rather than the live toggle later.
    setTeamBuild({
      method: 'balanced',
      excludeCaptains,
      hadCaptains: captainByTeam.some(Boolean),
      hadLocks: lockedGroups.some((g) => g.length >= 2),
      adjustedAfter: false,
    });
  }

  function movePlayer(playerId: string, fromTeamId: string, toTeamId: string) {
    if (fromTeamId === toTeamId) return;
    setTeams(teams.map((t) => {
      if (t.id === fromTeamId) {
        const remaining = t.playerIds.filter((id) => id !== playerId);
        // If the captain left, the next-lowest handicap takes over the slot.
        const captainId = t.captainId === playerId ? sortPlayerIdsByHcap(remaining, players, course, handicapAllowance, handicapBasis)[0] : t.captainId;
        return { ...t, playerIds: remaining, captainId };
      }
      if (t.id === toTeamId) {
        return { ...t, playerIds: orderPlayerIdsWithCaptain([...t.playerIds, playerId], t.captainId, players, course, handicapAllowance, handicapBasis) };
      }
      return t;
    }));
    markAdjusted();
  }

  // Make a player the captain of their team (moves them to the top of the list).
  // Also mirrors the pick into the captainIds slot for that team so the Captains
  // panel stays in sync.
  function makeCaptain(teamId: string, playerId: string) {
    const idx = teams.findIndex((t) => t.id === teamId);
    setTeams(teams.map((t) => (
      t.id === teamId
        ? { ...t, captainId: playerId, playerIds: orderPlayerIdsWithCaptain(t.playerIds, playerId, players, course, handicapAllowance, handicapBasis) }
        : t
    )));
    if (idx >= 0) {
      const next = [...captainIds];
      // Drop this player from any other slot, then set this team's slot.
      for (let i = 0; i < next.length; i++) if (next[i] === playerId) next[i] = '';
      next[idx] = playerId;
      setCaptainIds(next);
    }
    markAdjusted();
  }

  function renameTeam(teamId: string, newName: string) {
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, name: newName } : t)));
  }

  function setTeeTime(teamId: string, teeTime: string) {
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, teeTime } : t)));
  }

  // Reorder teams (send-out order): move one team up or down the list.
  function moveTeam(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= teams.length) return;
    const next = [...teams];
    [next[index], next[j]] = [next[j], next[index]];
    setTeams(next);
  }

  // Order teams by tee time (blank times sink to the bottom).
  function sortTeamsByTeeTime() {
    const next = [...teams].sort((a, b) => {
      const ta = (a.teeTime || '').trim(), tb = (b.teeTime || '').trim();
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return ta.localeCompare(tb);
    });
    setTeams(next);
  }

  function addTeam() {
    setTeams([...teams, makeTeam(teams.length, [])]);
  }

  function removeTeam(teamId: string) {
    const removed = teams.find((t) => t.id === teamId);
    if (!removed) return;
    const remaining = teams.filter((t) => t.id !== teamId);
    // Push orphaned players onto the first remaining team (if any).
    if (removed.playerIds.length > 0 && remaining.length > 0) {
      remaining[0] = { ...remaining[0], playerIds: sortPlayerIdsByHcap([...remaining[0].playerIds, ...removed.playerIds], players, course, handicapAllowance, handicapBasis) };
    }
    setTeams(remaining);
  }

  const assignedIds = new Set(teams.flatMap((t) => t.playerIds));
  const unassigned = players.filter((p) => !assignedIds.has(p.id));

  function teamCombinedHcap(team: PoolTeam): number {
    return team.playerIds.reduce((sum, id) => {
      const p = players.find((x) => x.id === id);
      return p ? sum + hcapOf(p) : sum;
    }, 0);
  }

  const canProceed = teams.length > 0 && teams.some((t) => t.playerIds.length > 0) && unassigned.length === 0;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Set Teams</h2>

      {/* Team-building style: captains (default) vs plain balance by handicap. */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">Team Building</p>
        <div className="flex gap-2">
          {([
            { v: true, label: 'Use captains' },
            { v: false, label: 'No captains' },
          ] as const).map(({ v, label }) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setUseCaptains(v)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                useCaptains === v
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {useCaptains
            ? 'Each team gets a captain (lowest handicaps by default); the rest balance around them.'
            : 'Teams are balanced by handicap with no captain role.'}
        </p>
      </div>

      {/* Captains — the primary way to build teams. One captain per team (lowest
          course handicaps by default), each anchoring an even balance around
          them. The apply button lives in the panel. */}
      {useCaptains && (
      <div className="mb-4">
        <CaptainsPanel
          players={players}
          course={course}
          handicapAllowance={handicapAllowance}
          handicapBasis={handicapBasis}
          numTeams={numTeams}
          captainIds={captainIds}
          setCaptainIdsAction={setCaptainIds}
          excludeCaptains={excludeCaptains}
          setExcludeCaptainsAction={setExcludeCaptains}
          onApplyAction={autoBalance}
        />
      </div>
      )}

      {/* Pairing locks — keep chosen players on the same team through balancing.
          Applying the lock IS auto-balance (around captains), wired right into
          the box so it's one obvious action. */}
      <div className="mb-4">
        <PairingLocks
          players={players}
          lockedGroups={lockedGroups}
          setLockedGroupsAction={setLockedGroups}
          onApplyAction={autoBalance}
        />
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        <button
          onClick={autoBalance}
          className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800"
        >
          {useCaptains ? 'Balance around captains' : 'Balance teams by handicap'}
        </button>
        <button
          onClick={autoGenerate}
          className="rounded-md border border-green-700 px-3 py-2 text-sm text-green-700 font-medium hover:bg-green-50"
        >
          Auto-generate foursomes
        </button>
        <button
          onClick={addTeam}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 font-medium hover:bg-gray-100"
        >
          + Add team
        </button>
        {teams.length > 1 && (
          <button
            onClick={sortTeamsByTeeTime}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 font-medium hover:bg-gray-100"
          >
            Order by tee time
          </button>
        )}
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4">
          <p className="text-sm text-amber-800 font-medium mb-1">
            Unassigned ({unassigned.length}) — generate teams or add them below
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <span key={p.id} className="rounded-full bg-white border border-amber-300 px-2 py-0.5 text-xs text-amber-800">
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {teams.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center text-gray-500 mb-4">
          <p className="text-sm">No teams yet. Use a button above to build foursomes.</p>
        </div>
      ) : (
        <div className="grid gap-3 mb-4 sm:grid-cols-2">
          {teams.map((team, teamIdx) => (
            <div key={team.id} className="bg-white rounded-lg shadow p-3">
              <div className="flex items-center gap-2 mb-2">
                {/* Reorder controls — the order teams are sent out in */}
                <div className="flex flex-col leading-none">
                  <button
                    onClick={() => moveTeam(teamIdx, -1)}
                    disabled={teamIdx === 0}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs"
                    title="Move team up"
                  >▲</button>
                  <button
                    onClick={() => moveTeam(teamIdx, 1)}
                    disabled={teamIdx === teams.length - 1}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs"
                    title="Move team down"
                  >▼</button>
                </div>
                <input
                  type="text"
                  value={team.name}
                  onChange={(e) => renameTeam(team.id, e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-semibold shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <button
                  onClick={() => removeTeam(team.id)}
                  className="text-red-500 hover:text-red-700 text-sm px-1"
                  title="Remove team"
                >
                  &times;
                </button>
              </div>

              <div className="mb-2">
                <label className="block text-xs text-gray-500 mb-1">Tee time</label>
                <TeeTimePicker value={team.teeTime || ''} onChangeAction={(v) => setTeeTime(team.id, v)} />
              </div>

              <p className="text-xs text-gray-500 mb-2">
                {team.playerIds.length} player{team.playerIds.length === 1 ? '' : 's'}
                {course ? ` · combined HCP ${Math.round(teamCombinedHcap(team))}` : ''}
              </p>

              <ul className="space-y-1">
                {team.playerIds.map((pid) => {
                  const p = players.find((x) => x.id === pid);
                  if (!p) return null;
                  const hcap = course ? Math.round(hcapOf(p)) : null;
                  const isCaptain = team.captainId === pid;
                  return (
                    <li key={pid} className={`rounded px-2 py-2 ${isCaptain ? 'bg-green-50 ring-1 ring-green-200' : 'bg-gray-50'}`}>
                      {/* Line 1: who + their course handicap */}
                      <div className="flex items-center gap-2">
                        {isCaptain && (
                          <span className="flex-shrink-0 rounded-full bg-green-700 text-white text-[10px] font-bold px-1.5 py-0.5" title="Captain">C</span>
                        )}
                        <span className="text-sm font-medium text-gray-900 truncate min-w-0 flex-1">{p.name}</span>
                        {hcap !== null && (
                          <span
                            className="flex-shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-semibold text-gray-700 tabular-nums"
                            title="Course handicap on this tee"
                          >
                            {hcap}
                          </span>
                        )}
                      </div>
                      {/* Line 2: clearly-labeled controls with real tap targets */}
                      <div className="mt-1.5 flex items-end gap-2 flex-wrap">
                        {useCaptains && !isCaptain && (
                          <button
                            onClick={() => makeCaptain(team.id, pid)}
                            className="rounded-md border border-green-600 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                            title="Make this player the team captain"
                          >
                            Make captain
                          </button>
                        )}
                        {teams.length > 1 && (
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Move to</span>
                            <select
                              value={team.id}
                              onChange={(e) => movePlayer(pid, team.id, e.target.value)}
                              className="text-sm rounded-md border border-gray-300 px-2 py-1 shadow-sm focus:border-green-500 focus:outline-none bg-white"
                              title="Move this player to another team"
                            >
                              {teams.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        {course && course.teeSets.length > 1 && (
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tee</span>
                            <select
                              value={p.teeSetId ?? ''}
                              onChange={(e) => changePlayerTee(pid, Number(e.target.value))}
                              className="text-sm rounded-md border border-gray-300 px-2 py-1 shadow-sm focus:border-green-500 focus:outline-none bg-white"
                              title="Tee"
                            >
                              {teeOptionsForPlayer(course, p).map((ts) => (
                                <option key={ts.id} value={ts.id}>{ts.name}</option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    </li>
                  );
                })}
                {team.playerIds.length === 0 && (
                  <li className="text-xs text-gray-400 px-2 py-1">Empty — move players here.</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Review &amp; Create
      </button>
    </div>
  );
}

// 2v2 within-group: assign the group's players to Side A or Side B. Seeded from
// a balanced default (low+high vs the two middle). Each player is exactly one side.
function SubTeamsStep({
  players, course, handicapAllowance, handicapBasis, subTeams, setSubTeams, onNext, onBack,
}: {
  players: Player[];
  course: CourseSelection | null;
  handicapAllowance: number;
  handicapBasis: 'course' | 'index';
  subTeams: { a: string[]; b: string[] } | undefined;
  setSubTeams: (v: { a: string[]; b: string[] }) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const effective = subTeams ?? defaultSubTeams(players.map((p) => p.id), players, course, handicapAllowance, handicapBasis);
  const sideOf = (id: string): 'a' | 'b' | null =>
    effective.a.includes(id) ? 'a' : effective.b.includes(id) ? 'b' : null;

  function assign(id: string, side: 'a' | 'b') {
    const a = effective.a.filter((x) => x !== id);
    const b = effective.b.filter((x) => x !== id);
    (side === 'a' ? a : b).push(id);
    setSubTeams({ a, b });
  }

  const balanced = effective.a.length === effective.b.length;
  const chcp = (p: Player) => Math.round(getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis));

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Sides (2 vs 2)</h2>
      <p className="text-sm text-gray-500 mb-4">Assign each player to a side. Seeded to balance handicaps — adjust as you like.</p>

      <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
        {players.map((p) => {
          const s = sideOf(p.id);
          return (
            <div key={p.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-800">
                {p.name}
                {course && <span className="ml-2 text-xs text-gray-400">CHcp {chcp(p)}</span>}
              </span>
              <div className="flex gap-1.5">
                {(['a', 'b'] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => assign(p.id, side)}
                    className={`w-9 h-9 rounded-full text-sm font-bold transition ${
                      s === side ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {side.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {!balanced && (
        <p className="text-xs text-amber-700 mt-2">Sides are uneven ({effective.a.length} vs {effective.b.length}). 2v2 works best with two on each side.</p>
      )}

      <button
        onClick={onNext}
        disabled={effective.a.length === 0 || effective.b.length === 0}
        className="mt-6 w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next: Review &amp; Create
      </button>
    </div>
  );
}

function CreateStep({
  name, entryPerPlayer, players, teams, course, handicapAllowance, potDollars, setPotDollars, potEdited, setPotEdited,
  moneyMode, matchConfig, handicapBasis, gameMode, onCreate, onBack,
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
  gameMode: string | undefined;
  onCreate: () => void; onBack: () => void;
}) {
  const mode = getGameMode(gameMode);
  const isIndividual = mode?.category === 'individual' || mode?.category === 'team-within-group';
  const isMatch = moneyMode === 'match';
  const playerById = new Map(players.map((p) => [p.id, p]));
  const pot = players.length * entryPerPlayer;
  const teeNameOf = (p: Player) => course?.teeSets.find((t) => t.id === p.teeSetId)?.name ?? null;

  // Auto-fill the dollar split from the team-count standard, unless the user has
  // edited it. Re-runs if the number of teams changes.
  useEffect(() => {
    if (potEdited) return;
    setPotDollars(legDollarsToStrings(poolSplitDollarsForTeams(teams.length)));
  }, [teams.length, potEdited, setPotDollars]);

  const effective: PotDollars = potDollars ?? legDollarsToStrings(poolSplitDollarsForTeams(teams.length));
  const splitTotal = potDollarsTotal(effective);
  const balanced = Math.abs(splitTotal - pot) < 0.01;

  const potFields: { key: keyof PotDollars; label: string }[] = [
    { key: 'front', label: 'Front 9' },
    { key: 'back', label: 'Back 9' },
    { key: 'overall', label: 'Overall' },
    { key: 'junk', label: 'Junk' },
  ];

  function setLeg(key: keyof PotDollars, value: string) {
    setPotEdited(true);
    setPotDollars({ ...effective, [key]: value });
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Review &amp; Create</h2>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <p className="text-sm text-gray-500">{isIndividual ? mode!.name : 'Pool Game'}</p>
          <p className="text-lg font-bold text-gray-900">{name}</p>
          {isIndividual && <p className="text-xs text-gray-500 mt-0.5">{mode!.description}</p>}
        </div>

        {isIndividual ? (
          <div className="pt-2 border-t">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-xs text-gray-500">Players</p>
                <p className="text-lg font-bold text-gray-900">{players.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Group size</p>
                <p className="text-lg font-bold text-gray-900">{mode!.playersMin}–{mode!.playersMax}</p>
              </div>
            </div>
            {(players.length < mode!.playersMin || players.length > mode!.playersMax) && (
              <p className="text-xs text-amber-700 mt-2">
                {mode!.name} is played in a single group of {mode!.playersMin}–{mode!.playersMax} players — you have {players.length}. Go back to Field to adjust.
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

        {!isMatch && !isIndividual && (
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-800">Pot Split ($ per pot)</p>
            {potEdited && (
              <button
                onClick={() => { setPotEdited(false); setPotDollars(legDollarsToStrings(poolSplitDollarsForTeams(teams.length))); }}
                className="text-xs text-green-700 hover:text-green-900 font-medium"
              >
                Reset to standard
              </button>
            )}
          </div>
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
          <div className="grid grid-cols-4 gap-2 text-center">
            <div><p className="text-xs text-gray-500">Front 9</p><p className="text-sm font-bold text-gray-900">${matchConfig.legDollars.front}</p></div>
            <div><p className="text-xs text-gray-500">Back 9</p><p className="text-sm font-bold text-gray-900">${matchConfig.legDollars.back}</p></div>
            <div><p className="text-xs text-gray-500">Overall</p><p className="text-sm font-bold text-gray-900">${matchConfig.legDollars.overall}</p></div>
            <div><p className="text-xs text-gray-500">Junk / pt</p><p className="text-sm font-bold text-gray-900">${matchConfig.junkPerPoint}</p></div>
          </div>
          {teams.length !== 2 && (
            <p className="text-xs text-amber-700 mt-2">
              Head-to-head needs exactly two foursomes — you have {teams.length}. Go back and make two teams, or switch to Pool (pot split).
            </p>
          )}
        </div>
        )}

        <div className="pt-2 border-t">
          <p className="text-sm font-semibold text-gray-800 mb-2">Foursomes</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {teams.map((team) => {
              const combined = team.playerIds.reduce((s, pid) => {
                const p = playerById.get(pid);
                return p && course ? s + getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis) : s;
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
                    const chcp = course ? Math.round(getPoolPlayingHandicap(p, course, handicapAllowance, handicapBasis)) : null;
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
      </div>

      <button
        onClick={onCreate}
        className="mt-6 w-full rounded-md bg-green-700 px-4 py-3 text-white font-bold text-lg hover:bg-green-800"
      >
        Create Pool Game
      </button>
    </div>
  );
}
