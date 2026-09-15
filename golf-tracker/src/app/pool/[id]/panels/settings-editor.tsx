'use client';

import { useState, useEffect } from 'react';
import { type Player } from '@/lib/game-state';
import { type PoolGame, type PoolJunkValues, type PoolMoneyMode, getPar3Holes, defaultSubTeams, DEFAULT_MATCH_CONFIG, DEFAULT_MATCH_POINTS, DEFAULT_JUNK_VALUES, poolSplitDollarsForTeams, dollarsToPotSplit } from '@/lib/pool-game';
import { formatOfGame, isOneBall, persistedTeamScoring, TEAM_FORMAT_OPTIONS, type ScoreBasis, type TeamFormat } from '@/lib/game-modes/team-scoring';
import { LEGACY_SIDE_NAME_KEYS, fromLegacySubTeams, nextSideId, persistedSides, sideMembers, sideOfPlayer, sidesOfGame, type GameSide } from '@/lib/game-modes/sides';
import { fetchGameScores } from '@/lib/tournament-state';
import { getGameMode, GAME_MODES, defaultSettings, type SettingsBag, type SettingValue } from '@/lib/game-modes';
import { ModeSettingsEditor } from '@/components/mode-settings-editor';
import { SideNames } from '@/components/side-names';
import { NumberField } from './shared';

// Edit an EXISTING game's settings in place (no rebuild). Mirrors the wizard's
// Details step, gated by money mode, and saves every change straight onto the
// game so the leaderboard/scorecards recompute live. Team building, tees, and
// the field are edited elsewhere (EditFoursomes) — this is money + scoring only.
// How a 9-hole game figures handicaps. This was settable in the create wizard
// but nowhere afterward, so a game created with the wrong basis couldn't be
// corrected — and the two bases give materially different strokes, so it's not a
// setting you want frozen at creation.
export function NineBasisField({ game, onSave }: { game: PoolGame; onSave: (g: PoolGame) => void }) {
  if (!game.holesPlaying || game.holesPlaying === '18') return null;
  const basis = game.nineHandicapBasis ?? '18';
  const nine = game.holesPlaying === 'front9' ? 'front' : 'back';
  return (
    <div>
      <label className="block text-sm font-medium text-gray-800 mb-1">9-hole handicap</label>
      <select
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        value={basis}
        onChange={(e) => onSave({ ...game, nineHandicapBasis: e.target.value as '18' | '9' })}
      >
        <option value="18">Half of 18-hole (casual)</option>
        <option value="9">9-hole USGA</option>
      </select>
      <p className="text-xs text-gray-500 mt-1">
        {basis === '18'
          ? `Full 18-hole course handicap, with strokes falling on the ${nine} nine by the regular 18-hole stroke index — so each player gets roughly half their strokes.`
          : `The tee's ${nine}-nine rating with each handicap halved, and the stroke index re-ranked 1–9. Technically correct, less common casually.`}
      </p>
    </div>
  );
}

export function GameSettingsEditor({ game, onSave }: { game: PoolGame; onSave: (g: PoolGame) => void }) {
  const isMatch = (game.moneyMode ?? 'pot') === 'match';
  const junk = game.junkValues ?? DEFAULT_JUNK_VALUES;
  const matchCfg = game.matchConfig ?? DEFAULT_MATCH_CONFIG;

  // ONE BALL MEANS ONE SCORE, so a game that already has PER-PLAYER scores can't become a
  // scramble or alternate shot mid-round: those scores were entered under a format where
  // each member plays their own ball, and a one-ball format has no honest way to read four
  // different numbers as one team score. A pool has a single format for all 18 holes (there
  // is no PoolGame equivalent of a tournament's splitFormat), so there's no declared
  // exception to allow for.
  //
  // Without this the payout depended on the ORDER of playerIds: the same round settled +$75
  // or -$75 after reordering four names. The engine now takes the minimum so order can never
  // matter, but the real fix is not creating the divergence in the first place.
  const [hasScores, setHasScores] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set(game.teams.map((t) => t.matchupId)));
    Promise.all(ids.map((mid) => fetchGameScores(mid))).then((all) => {
      if (cancelled) return;
      setHasScores(all.some((s) => Array.isArray(s) && s.length > 0));
    });
    return () => { cancelled = true; };
  }, [game]);
  const lockOneBall = hasScores && !isOneBall(formatOfGame(game));

  const junkFields: { key: keyof PoolJunkValues; label: string }[] = [
    { key: 'birdie', label: 'Birdie' },
    { key: 'eagle', label: 'Eagle' },
    { key: 'albatross', label: 'Albatross' },
    { key: 'groupHug', label: 'Group Hug' },
    { key: 'ctp', label: 'CTP' },
  ];

  // Switching money mode: seed sensible defaults for the target mode's fields if
  // they're missing, so the game is immediately valid either way.
  function setMoneyMode(mode: PoolMoneyMode) {
    if (mode === 'match') {
      onSave({ ...game, moneyMode: 'match', matchConfig: game.matchConfig ?? { ...DEFAULT_MATCH_CONFIG } });
    } else {
      onSave({ ...game, moneyMode: 'pot' });
    }
  }

  const inputCls = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  // Single-group game (9s / skins / quota / 2v2 / …): name + handicap fields +
  // the mode's own toggleable options (+ a Sides editor for 2v2). No pot/match/
  // ball/team settings apply.
  const indMode = getGameMode(game.gameMode);
  if (indMode && (indMode.category === 'individual' || indMode.category === 'team-within-group')) {
    const isWithinGroup = indMode.category === 'team-within-group';
    const modeSettings = game.modeSettings ?? defaultSettings(indMode.settings);
    const setModeSetting = (key: string, value: SettingValue) =>
      onSave({ ...game, modeSettings: { ...modeSettings, [key]: value } });

    // ONE BALL MEANS ONE SCORE, in the 2v2 editor too. The classic pool's format picker below
    // has had this guard since §5.ac, but this branch returns before reaching it, so a scored
    // 2v2 game could still be switched to scramble / alternate shot — re-creating exactly the
    // divergent per-member scores that rule exists to prevent (F-012). Same reasoning, same
    // wording as the pool side; the engine's min() is the backstop, this is the closed door.
    const lockModeOption = (settingKey: string, optionValue: string): string | null => {
      if (!isWithinGroup || settingKey !== 'format' || !hasScores) return null;
      const current = String(modeSettings.format ?? 'best-ball');
      const oneBall = (f: string) => f === 'scramble' || f === 'alternate-shot';
      // Already playing a one-ball format? Staying on one is fine — the scores are shared.
      if (oneBall(current)) return null;
      return oneBall(optionValue) ? 'needs a fresh game' : null;
    };
    // The same rule, said on the page. A disabled <option> can't be seen until the dropdown
    // is opened, so without this the 2v2 editor silently refused a tap while the classic
    // pool's picker explained itself — the two halves of one rule reading differently on
    // screen is the drift this project's audit exists to catch. Wording matches the pool's.
    const lockModeNote = (settingKey: string): string | null =>
      lockModeOption(settingKey, 'scramble')
        ? 'Scramble and alternate shot enter ONE score for the side. This game already has '
          + 'scores entered per player, so switching now would leave two different numbers on '
          + 'a hole that can only have one. Start a new game to play a scramble.'
        : null;
    // The game's sides, normalized — a legacy {a,b} game reads as two sides with the ids 'a'
    // and 'b', so nothing about an existing 2v2 changes here.
    const storedSides = sidesOfGame(game);
    const sides: GameSide[] = storedSides.length > 0
      ? storedSides
      : fromLegacySubTeams(defaultSubTeams(game.players.map((p) => p.id), game.players, game.course, game.handicapAllowance, game.handicapBasis));

    // Save a side collection back onto the game. persistedSides writes the LEGACY shape at
    // exactly two unnamed sides, so an ordinary 2v2 never leaves the snapshot-pinned
    // representation; three or more opts in. The `sides`/`subTeams` pair is cleared first so a
    // game that drops from three sides to two doesn't keep a stale `sides` field that would
    // take precedence over the {a,b} it just wrote.
    const saveSides = (next: GameSide[]) => {
      // Drop the legacy `side<Letter>Name` keys on write (F-014). They were absorbed into each
      // side's own `name` when the game was read, so leaving them would mean two sources of truth
      // — and clearing a name in the editor would silently resurrect the old one on next load.
      const settings = { ...(game.modeSettings ?? {}) };
      let strippedAny = false;
      for (const key of LEGACY_SIDE_NAME_KEYS) {
        if (key in settings) { delete settings[key]; strippedAny = true; }
      }
      onSave({
        ...game,
        subTeams: undefined,
        sides: undefined,
        ...persistedSides(next),
        ...(strippedAny ? { modeSettings: settings } : {}),
      });
    };

    const assignSide = (pid: string, sideId: string) => {
      // Tapping the side a player is ALREADY on is a no-op — return early rather than
      // filter-then-push, which silently moved them to the end of the array. Nothing on
      // screen changed, but under a one-ball format the side's score was read from the
      // first member, so that invisible reorder moved real money (F-012). The engine now
      // takes the minimum, and this keeps the stored order stable regardless.
      if (sideMembers(sides, sideId).includes(pid)) return;
      saveSides(sides.map((side) => ({
        ...side,
        playerIds: side.id === sideId
          ? [...side.playerIds.filter((x) => x !== pid), pid]
          : side.playerIds.filter((x) => x !== pid),
      })));
    };
    const addSide = () => saveSides([...sides, { id: nextSideId(sides), playerIds: [] }]);
    // Removing a side UNASSIGNS its players rather than guessing a new pairing for them.
    const removeSide = (sideId: string) => saveSides(sides.filter((s) => s.id !== sideId));

    // Switch this game to a different mode WITHOUT losing scores (they're gross,
    // stored per player — every mode recomputes from them). Money RESETS to the
    // new game's natural default (Skins → $ per skin, Low Total → pot, etc.), so
    // switching never leaves an odd combo like Nassau-on-skins. Game-neutral
    // shared settings (e.g. scoreBasis net/gross) DO carry over. Only same-
    // structure targets are offered (all registered modes are single-group:
    // individual or 2v2); switching to 2v2 seeds balanced sides.
    const playerCount = game.players.length;
    const switchTargets = GAME_MODES.filter(
      (m) => playerCount >= m.playersMin && playerCount <= m.playersMax,
    );
    // Money-specific keys — reset these to the target's default on a switch.
    const MONEY_KEYS = new Set([
      'moneyModel', 'dollarsPerPoint', 'dollarsPerStroke', 'skinValue',
      'entryPerPlayer', 'nassauSplit', 'nassauFront', 'nassauBack', 'nassauTotal',
    ]);
    const changeMode = (newId: string) => {
      if (newId === game.gameMode) return;
      const target = getGameMode(newId);
      if (!target) return;
      const seeded = defaultSettings(target.settings);
      // Carry over shared NON-money keys (e.g. scoreBasis); money seeds fresh from
      // the target's defaults so each game uses its natural money model.
      const carried: SettingsBag = { ...seeded };
      for (const k of Object.keys(seeded)) {
        if (!MONEY_KEYS.has(k) && modeSettings[k] !== undefined) carried[k] = modeSettings[k];
      }
      const updated: PoolGame = { ...game, gameMode: newId, modeSettings: carried };
      // A side game needs sides; seed a balanced default if we don't already have them (in
      // either storage shape — sidesOfGame reads both).
      if (target.category === 'team-within-group' && sidesOfGame(updated).length === 0) {
        updated.subTeams = defaultSubTeams(game.players.map((p) => p.id), game.players, game.course, game.handicapAllowance, game.handicapBasis);
      }
      // Wolf-family per-hole decisions don't transfer to a different game.
      if (newId !== 'wolf') delete updated.wolfDecisions;
      onSave(updated);
    };
    return (
      <section className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 bg-gray-100 border-b">
          <h2 className="font-semibold text-gray-900">Game Settings</h2>
          <p className="text-xs text-gray-500">{indMode.name} · changes save immediately and update the leaderboard.</p>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Game name</label>
            <input className={inputCls} value={game.name} onChange={(e) => onSave({ ...game, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Game</label>
            <select className={inputCls} value={game.gameMode ?? ''} onChange={(e) => changeMode(e.target.value)}>
              {switchTargets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-1">Change the game any time — scores already entered carry over and recompute. Money resets to the new game&apos;s usual setup, so double-check it.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Handicap allowance (%)</label>
              <NumberField className={inputCls} value={game.handicapAllowance} fallback={100}
                onCommit={(n) => onSave({ ...game, handicapAllowance: n })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Handicap strokes</label>
              <select className={inputCls} value={game.strokeMethod ?? 'full'} onChange={(e) => onSave({ ...game, strokeMethod: e.target.value as 'full' | 'off-the-low' })}>
                <option value="full">Full handicap</option>
                <option value="off-the-low">Off the low</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Handicap basis</label>
            <select className={inputCls} value={game.handicapBasis ?? 'course'} onChange={(e) => onSave({ ...game, handicapBasis: e.target.value as 'course' | 'index' })}>
              <option value="course">Course handicap (off the tee)</option>
              <option value="index">Player handicap index</option>
            </select>
          </div>
          <NineBasisField game={game} onSave={onSave} />
          <div className="pt-2 border-t">
            <p className="text-sm font-semibold text-gray-800 mb-2">{indMode.name} options</p>
            <ModeSettingsEditor
              schema={indMode.settings}
              values={modeSettings}
              onChangeAction={setModeSetting}
              lockOptionAction={lockModeOption}
              lockNoteAction={lockModeNote}
              /* No hideKeys any more: side names left the settings schema (F-014), so there is
                 nothing here to hide. That's the point — the old arrangement needed every
                 consumer to remember, and one of three didn't. */
            />
          </div>
          {isWithinGroup && (
            <div className="pt-2 border-t">
              <p className="text-sm font-semibold text-gray-800 mb-2">Sides</p>
              <div className="divide-y divide-gray-100 rounded-md border border-gray-200">
                {game.players.map((p) => {
                  const s = sideOfPlayer(sides, p.id)?.id ?? null;
                  return (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2">
                      <span className="text-sm text-gray-800">{p.name}</span>
                      <div className="flex gap-1.5">
                        {sides.map((side) => (
                          <button
                            key={side.id}
                            type="button"
                            onClick={() => assignSide(p.id, side.id)}
                            className={`w-8 h-8 rounded-full text-xs font-bold transition ${
                              s === side.id ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
              {/* Add / remove a side mid-round. Two sides stays the default and most games
                  never touch this; a group splitting into three pairs at the turn can. */}
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={addSide}
                  disabled={sides.length >= game.players.length}
                  className="text-xs font-medium text-green-700 hover:text-green-900 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + Add a side
                </button>
                {sides.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeSide(sides[sides.length - 1].id)}
                    className="text-xs font-medium text-gray-500 hover:text-gray-800"
                  >
                    Remove side {sides[sides.length - 1].id.toUpperCase()}
                  </button>
                )}
              </div>
              {game.players.some((p) => !sideOfPlayer(sides, p.id)) && (
                <p className="text-xs text-amber-700 mt-1">
                  {game.players.filter((p) => !sideOfPlayer(sides, p.id)).map((p) => p.name.split(' ')[0]).join(', ')} not
                  on a side — their scores won&apos;t count toward any side until you assign them.
                </p>
              )}
              {/* Optional custom names, one field per side that exists (F-014). Same component
                  the wizard uses, so the two can't drift — which is exactly how the old
                  settings-bag arrangement went wrong. */}
              <SideNames sides={sides} players={game.players} onChangeAction={saveSides} idPrefix="hub-side-name" />
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-4 py-3 bg-gray-100 border-b">
        <h2 className="font-semibold text-gray-900">Game Settings</h2>
        <p className="text-xs text-gray-500">Changes save immediately and update the leaderboard.</p>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Game name</label>
          <input className={inputCls} value={game.name} onChange={(e) => onSave({ ...game, name: e.target.value })} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Game type</label>
          <div className="flex gap-2">
            {([{ v: 'pot', label: 'Pool (pot split)' }, { v: 'match', label: 'Head-to-head match' }] as const).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setMoneyMode(v)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                  (game.moneyMode ?? 'pot') === v ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {isMatch && game.teams.length !== 2 && (
            <p className="text-xs text-amber-700 mt-1">Head-to-head needs exactly two foursomes — this game has {game.teams.length}.</p>
          )}
        </div>

        {/* The hole rule, as ONE picker over the full format list. This editor already let an
            organizer change ball selection mid-round; it now covers the F-006 formats too.
            Without this, a Stableford game edited here would show a control that silently did
            nothing — teamFormat takes precedence over ballSelection wherever both are read. */}
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Which scores count for the team?</label>
          <select
            className={inputCls}
            value={formatOfGame(game)}
            onChange={(e) => {
              const next = e.target.value as TeamFormat;
              // Guard the handler too, not just the <option disabled>: a disabled option can
              // still be selected programmatically, and this one changes how money settles.
              if (lockOneBall && isOneBall(next)) return;
              onSave({ ...game, ...persistedTeamScoring(next, game.teamScoreBasis ?? 'stroke') });
            }}
          >
            {TEAM_FORMAT_OPTIONS.map((o) => (
              <option
                key={o.format}
                value={o.format}
                disabled={lockOneBall && isOneBall(o.format)}
              >
                {o.label}{lockOneBall && isOneBall(o.format) ? ' — needs a fresh game' : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {TEAM_FORMAT_OPTIONS.find((o) => o.format === formatOfGame(game))?.hint}
          </p>
          {lockOneBall && (
            <p className="text-xs text-amber-700 mt-1">
              Scramble and alternate shot enter ONE score for the team. This game already has
              scores entered per player, so switching now would leave four different numbers
              on a hole that can only have one. Start a new game to play a scramble.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">How is the hole scored?</label>
          <select
            className={inputCls}
            value={game.teamScoreBasis ?? 'stroke'}
            onChange={(e) => onSave({
              ...game,
              ...persistedTeamScoring(formatOfGame(game), e.target.value as ScoreBasis),
            })}
          >
            <option value="stroke">Strokes — lowest total wins</option>
            <option value="stableford">Stableford points — most points wins</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Handicap allowance (%)</label>
            <NumberField className={inputCls} value={game.handicapAllowance} fallback={100}
              onCommit={(n) => onSave({ ...game, handicapAllowance: n })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Handicap strokes</label>
            <select className={inputCls} value={game.strokeMethod ?? 'full'} onChange={(e) => onSave({ ...game, strokeMethod: e.target.value as 'full' | 'off-the-low' })}>
              <option value="full">Full handicap</option>
              <option value="off-the-low">Off the low</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Handicap basis</label>
          <select className={inputCls} value={game.handicapBasis ?? 'course'} onChange={(e) => onSave({ ...game, handicapBasis: e.target.value as 'course' | 'index' })}>
            <option value="course">Course handicap (off the tee)</option>
            <option value="index">Player handicap index</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {(game.handicapBasis ?? 'course') === 'index'
              ? 'Strokes come straight from each player’s handicap index × allowance (no slope/rating conversion).'
              : 'Strokes use each player’s course handicap off their tee (slope/rating adjusted).'}
          </p>
        </div>

        <NineBasisField game={game} onSave={onSave} />

        {isMatch ? (
          <div className="border-t pt-3">
            {/* How each leg (front/back/overall) is WON between the two foursomes.
                Money settlement (below) is identical either way. */}
            <p className="text-sm font-semibold text-gray-800 mb-2">Leg scoring</p>
            <div className="flex gap-2 mb-1">
              {([
                { v: 'stroke' as const, label: 'Stroke (lower total)' },
                { v: 'holes' as const, label: 'Match play (holes won)' },
              ]).map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onSave({ ...game, matchConfig: {
                    ...matchCfg,
                    scoring: v,
                    pointsPerHole: matchCfg.pointsPerHole ?? { ...DEFAULT_MATCH_POINTS },
                  } })}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                    (matchCfg.scoring ?? 'stroke') === v ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {(matchCfg.scoring ?? 'stroke') === 'holes'
                ? 'Each leg goes to whoever wins more holes head-to-head (lower team score wins the hole) — like regular match play. Money is unchanged: winning a leg pays the amount below.'
                : 'Each leg goes to the lower net-to-par total across its holes.'}
            </p>

            {(matchCfg.scoring ?? 'stroke') === 'holes' && (
              <div className="mb-3">
                <label className="block text-xs text-gray-600 font-medium mb-1">Points per hole (display only)</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'win' as const, label: 'Win', fallback: 1 },
                    { key: 'tie' as const, label: 'Tie', fallback: 0.5 },
                    { key: 'loss' as const, label: 'Loss', fallback: 0 },
                  ]).map(({ key, label, fallback }) => (
                    <div key={key}>
                      <label className="block text-[11px] text-gray-500 font-medium mb-1">{label}</label>
                      <NumberField className={inputCls + ' text-center'}
                        value={(matchCfg.pointsPerHole ?? DEFAULT_MATCH_POINTS)[key]} fallback={fallback}
                        onCommit={(n) => onSave({ ...game, matchConfig: {
                          ...matchCfg,
                          pointsPerHole: { ...(matchCfg.pointsPerHole ?? DEFAULT_MATCH_POINTS), [key]: n },
                        } })} />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">The leg is always won by more holes; points just set how the match score reads (e.g. 5½–3½).</p>
              </div>
            )}

            <p className="text-sm font-semibold text-gray-800 mb-2">Match payouts ($ / player)</p>
            <div className="grid grid-cols-3 gap-2">
              {(['front', 'back', 'overall'] as const).map((key) => (
                <div key={key}>
                  <label className="block text-xs text-gray-600 font-medium mb-1 capitalize">{key === 'overall' ? 'Overall' : key + ' 9'}</label>
                  <NumberField className={inputCls + ' text-center'} value={matchCfg.legDollars[key]} fallback={10}
                    onCommit={(n) => onSave({ ...game, matchConfig: { ...matchCfg, legDollars: { ...matchCfg.legDollars, [key]: n } } })} />
                </div>
              ))}
            </div>
            <div className="mt-2">
              <label className="block text-xs text-gray-600 font-medium mb-1">Junk ($ / point of margin)</label>
              <NumberField className={inputCls + ' text-center w-32'} value={matchCfg.junkPerPoint} fallback={5}
                onCommit={(n) => onSave({ ...game, matchConfig: { ...matchCfg, junkPerPoint: n } })} />
            </div>
          </div>
        ) : (
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-800">Pot split ($ per pot)</p>
              <button
                type="button"
                onClick={() => onSave({ ...game, potSplit: dollarsToPotSplit(poolSplitDollarsForTeams(game.teams.length)) })}
                className="text-xs text-green-700 hover:text-green-900 font-medium"
              >
                Reset to standard
              </button>
            </div>
            <PotSplitEditor game={game} onSave={onSave} />
          </div>
        )}

        <div className="border-t pt-3">
          <p className="text-sm font-semibold text-gray-800 mb-2">Junk values (points)</p>
          <div className="grid grid-cols-5 gap-2">
            {junkFields.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-gray-600 font-medium mb-1">{label}</label>
                <NumberField className={inputCls + ' text-center'} value={junk[key]} fallback={0}
                  onCommit={(n) => onSave({ ...game, junkValues: { ...junk, [key]: n } })} />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t pt-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              checked={!!game.hideHolesUntilAllFinish}
              onChange={(e) => onSave({ ...game, hideHolesUntilAllFinish: e.target.checked })}
            />
            <span>
              <span className="block text-sm font-medium text-gray-800">Hide holes until all groups finish</span>
              <span className="block text-xs text-gray-500">The leaderboard reveals a hole only after every foursome has completed it — so a later group can&apos;t see the standings before they play. Scorecards are unaffected.</span>
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}

// Pot split editor — the four legs in DOLLARS, converted to the stored pot
// fractions on every edit. Shows the buy-in pot for reference; dollars need not
// sum exactly (fractions normalize), but a mismatch hint keeps it honest.
export function PotSplitEditor({ game, onSave }: { game: PoolGame; onSave: (g: PoolGame) => void }) {
  const pot = game.players.length * game.entryPerPlayer;
  const legDollars = { front: pot * game.potSplit.front, back: pot * game.potSplit.back, overall: pot * game.potSplit.overall, junk: pot * game.potSplit.junk };
  const fields: { key: keyof typeof legDollars; label: string }[] = [
    { key: 'front', label: 'Front 9' },
    { key: 'back', label: 'Back 9' },
    { key: 'overall', label: 'Overall' },
    { key: 'junk', label: 'Junk' },
  ];
  const inputCls = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  function setLeg(key: keyof typeof legDollars, n: number) {
    const next = { ...legDollars, [key]: n };
    onSave({ ...game, potSplit: dollarsToPotSplit(next) });
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {fields.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-xs text-gray-600 font-medium mb-1">{label}</label>
            <NumberField className={inputCls} value={Math.round(legDollars[key])} fallback={0} onCommit={(n) => setLeg(key, n)} />
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-1">Buy-in pot: {game.players.length} × ${game.entryPerPlayer} = ${Math.round(pot)}. Dollars are split into shares; they don&apos;t have to add up exactly.</p>
    </>
  );
}

export function CtpEditor({ game, onSave }: { game: PoolGame; onSave: (g: PoolGame) => void }) {
  const par3Holes = getPar3Holes(game.course);
  if (par3Holes.length === 0) return null;
  // F-045: CTP surfaces only when it's part of this game's bonuses. Absent
  // junkValues = pre-setting game that played the classic defaults (CTP on).
  if ((game.junkValues ?? DEFAULT_JUNK_VALUES).ctp === 0) return null;

  function setWinner(hole: number, playerId: string | null) {
    const updated: PoolGame = {
      ...game,
      ctpWinners: { ...game.ctpWinners, [hole]: playerId },
    };
    onSave(updated);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Closest to the Pin</h2>
      <p className="text-xs text-gray-400 mb-3">Set the CTP winner on each par 3. Counts toward that team&apos;s junk total.</p>
      <div className="space-y-3">
        {par3Holes.map((hole) => {
          const currentId = game.ctpWinners?.[hole] ?? null;
          const currentPlayer = currentId ? game.players.find((p) => p.id === currentId) : null;
          return (
            <div key={hole} className="bg-white rounded-lg shadow p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-gray-900">Hole {hole}</p>
                <span className="text-xs text-gray-500">
                  {currentPlayer ? currentPlayer.name.split(' ')[0] : 'No winner'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setWinner(hole, null)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${
                    currentId === null
                      ? 'bg-gray-700 text-white border-gray-700'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  None
                </button>
                {game.players.map((p) => {
                  const isSelected = currentId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setWinner(hole, p.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border ${
                        isSelected
                          ? 'bg-green-700 text-white border-green-700'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {p.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
