'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { type GameSetup, type Player, parseGhinIndex } from '@/lib/game-state';
import { type PoolGame, type PoolTeam, type PoolTeamDetail, loadPoolGame, fetchPoolGame, savePoolGame, subscribeToPoolGame, getPoolPlayingHandicap, gameNineBasis, computePoolPlayerDetails, defaultSubTeams, shareTokenMatches } from '@/lib/pool-game';
import { isOneBall, teamModeForFormat } from '@/lib/game-modes/team-scoring';
import { fromLegacySubTeams, sideOfPlayer, sidesOfGame } from '@/lib/game-modes/sides';
import { getAccessLevel } from '@/lib/invite-gate';
import { getCreatorName } from '@/lib/pool-identity';
import { getGameMode } from '@/lib/game-modes';
import { FeedbackButton } from '@/components/feedback-box';
import { GhinLoginModal } from '@/components/ghin-login-modal';
import { upsertRosterPlayer } from '@/lib/roster';
import { getToken } from './panels/shared';
import { HandicapRefresh, FieldLowBanner, TeamBuildSummaryCard, FoursomeCard } from './panels/summary-cards';
import { SaveFormatModal, SharePanel } from './panels/share-panel';
import { GameSettingsEditor, CtpEditor } from './panels/settings-editor';
import { MoneySummary, GuestSettleUp, GameCloseOut } from './panels/money-panels';
import { EditFoursomes, OversizedGroupPrompt, WolfRotationEditor } from './panels/field-editor';

// Pick a tee for a player, STRICTLY within their gender — mirrors the wizard
// (src/app/pool/new/page.tsx). A course's men's and women's tees can share a
// name/yardage yet carry different ratings and hole stroke-index, so we only
// ever choose from tees whose own gender matches the player.
export default function PoolHubPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [game, setGame] = useState<PoolGame | null>(null);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [savingFormat, setSavingFormat] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  // Share-link (pool) visitors don't have the dashboard; give them "New Game" instead.
  const [poolOnly, setPoolOnly] = useState(false);
  useEffect(() => { setPoolOnly(getAccessLevel() === 'pool'); }, []);
  // F-048: the invite gate only SHAPE-checks a ?key= (it runs before game data
  // exists) and defers real validation to this page. Capture the key once on
  // mount; it's checked against the loaded game below. Owners (full access)
  // never carry keys and are never blocked.
  const [urlKey, setUrlKey] = useState<string | null>(null);
  useEffect(() => {
    try { setUrlKey(new URLSearchParams(window.location.search).get('key')); } catch { /* ignore */ }
  }, []);
  // F-049: who the app thinks you are — shown in the header so a share-link
  // player isn't left inferring their identity from which buttons are missing.
  const [viewerName, setViewerName] = useState<string | null>(null);
  useEffect(() => { setViewerName(getCreatorName()); }, []);

  useEffect(() => {
    const cached = loadPoolGame(id);
    if (cached) setGame(cached);
    fetchPoolGame(id).then((g) => {
      if (g) setGame(g);
      else if (!cached) router.push('/dashboard');
    });
    const channel = subscribeToPoolGame(id, (g) => setGame(g));
    return () => { channel.unsubscribe(); };
  }, [id, router]);

  // Stroke allocation per team/player/hole — no scores needed, so pass an empty
  // map. Memoized on the game object (recomputes only when the game changes).
  const teamDetails = useMemo<PoolTeamDetail[]>(
    () => (game ? computePoolPlayerDetails(game, new Map()) : []),
    [game]
  );

  if (!game) return null;

  // F-048: a pool-access visitor arriving with a key that matches NEITHER this
  // game's token nor the legacy constant got here on a fabricated or stale
  // link — say so instead of opening someone's game. (No key at all is fine:
  // in-app navigation drops the query string once access is granted.)
  if (poolOnly && urlKey && !shareTokenMatches(game, urlKey)) {
    return (
      <div className="min-h-full bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-bold text-gray-900">This link isn&apos;t valid for this game</h1>
          <p className="mt-2 text-sm text-gray-600">
            It may have been mistyped or replaced. Ask the organizer to send a fresh
            scoring link from the game&apos;s Share panel.
          </p>
        </div>
      </div>
    );
  }

  function playersForTeam(team: PoolTeam): Player[] {
    return team.playerIds
      .map((pid) => game!.players.find((p) => p.id === pid))
      .filter((p): p is Player => !!p);
  }

  function detailForTeam(teamId: string): PoolTeamDetail | undefined {
    return teamDetails.find((d) => d.teamId === teamId);
  }

  function persist(updated: PoolGame) {
    savePoolGame(updated);
    setGame(updated);
  }

  // Re-pull this game's players' handicap indexes from GHIN (for the "set up
  // yesterday, handicaps changed overnight" case). Updates indexes in place,
  // stamps the refresh time, and returns how many changed. Also writes fresh
  // indexes back to the roster so future games start current.
  async function refreshGameHandicaps(): Promise<{ ok: boolean; changed: number }> {
    const token = getToken();
    if (!token || !game) return { ok: false, changed: 0 }; // no token -> needs login
    const now = new Date().toISOString();
    let changed = 0;
    let authFailed = false;
    const players = await Promise.all(game.players.map(async (p) => {
      if (p.ghinNumber == null) return p;
      try {
        const res = await fetch('/api/ghin/golfer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, ghin_number: p.ghinNumber }),
        });
        if (!res.ok) { authFailed = true; return p; } // expired/invalid token
        const { golfer } = await res.json();
        const hi = parseGhinIndex(golfer?.handicap_index ?? golfer?.hi_value);
        if (hi === null) return p;
        if (hi !== p.handicapIndex) changed++;
        upsertRosterPlayer({
          id: p.id, ghinNumber: p.ghinNumber, name: p.name,
          handicapIndex: hi, gender: p.gender ?? null, defaultTeeName: null, hcapUpdatedAt: now,
        });
        return { ...p, handicapIndex: hi };
      } catch { authFailed = true; return p; }
    }));
    // Only stamp/persist if we actually got data (don't fake a refresh on failure).
    if (authFailed && changed === 0) return { ok: false, changed: 0 };
    persist({ ...game, players, handicapsRefreshedAt: now });
    return { ok: true, changed };
  }

  function enterScores(team: PoolTeam) {
    let players = playersForTeam(team);
    const strokeMethod = game!.strokeMethod || 'full';

    // For off-the-low, compute the field-low playing handicap across the WHOLE
    // field and pass it as a fixed baseline, so this foursome's scorecard nets
    // match the pool leaderboard (which also subtracts the field low).
    let offTheLowBaseline: number | undefined;
    if (strokeMethod === 'off-the-low' && game!.players.length > 0) {
      // Pass the game's USGA nine (null on 18 or the casual 18-hole basis) so the
      // baseline is on the SAME SCALE as the handicaps the scorecard computes.
      // Omitting it produced an 18-hole baseline subtracted from a 9-hole
      // handicap, which is how the card came to show "Plays: −1.03" for the low
      // man (his 9-hole 1.80 minus an 18-hole 2.70). Strokes were always right —
      // buildHcapMap passes the nine — but the displayed number was not.
      const nine = gameNineBasis(game!);
      offTheLowBaseline = Math.min(
        ...game!.players.map((p) =>
          getPoolPlayingHandicap(p, game!.course, game!.handicapAllowance, game!.handicapBasis, nine))
      );
    }

    // Base setup: a normal per-player pool scorecard (best-ball/combined/individual
    // games need nothing more — the leaderboard folds sides at compute time).
    let teamMode: GameSetup['teamMode'] = 'two-best-balls';
    let handicapAllowance = game!.handicapAllowance;

    // A side game: ALWAYS tag each player with their side (.team) so the
    // scorecard shows who's on which side. Previously only the one-ball formats
    // were tagged, so a 2v2 best-ball/combined round gave no on-card indication
    // of the sides at all — you had to open the leaderboard to find out.
    //
    // teamMode is set to the side-scoring rule that MATCHES the leaderboard's
    // compute (team-game.ts sideNet): best-ball = low net of the side, combined =
    // both nets added. Getting this right matters — leaving it at the default
    // 'two-best-balls' would have drawn a 1-net-1-gross team row that no 2v2
    // format actually uses. Scramble / alternate-shot additionally enter ONE ball
    // per side, and their format-specific allowance makes the play page's
    // team-handicap DISPLAY match the leaderboard (scramble uses -1 for USGA
    // tiered; alt-shot uses its % of the 60/40 combined).
    const mode = getGameMode(game!.gameMode);
    if (mode?.category === 'team-within-group') {
      const fmt = String(game!.modeSettings?.format ?? 'best-ball');
      const storedSides = sidesOfGame(game!);
      const sides = storedSides.length > 0
        ? storedSides
        : fromLegacySubTeams(defaultSubTeams(game!.players.map((p) => p.id), game!.players, game!.course, game!.handicapAllowance, game!.handicapBasis));
      // The SCORECARD's team slot is a two-value field (Player.team: 'A' | 'B', read at ~27
      // sites in game/play/page.tsx), so it can only express two sides. With THREE or more we
      // deliberately tag nobody rather than tagging the first two: a partial tagging would draw
      // an A-vs-B team row and match badge for a game that isn't A vs B, which is exactly the
      // class of defect F-006 already hit twice (the card playing a different game from the
      // engine, DECISIONS.md §5.aa). Untagged means the card shows per-player entry with no team
      // row — honest and incomplete rather than confident and wrong. The leaderboard still
      // settles and displays all N sides. Widening the card is tracked as its own finding.
      if (sides.length <= 2) {
        players = players.map((p) => {
          const sideId = sideOfPlayer(sides, p.id)?.id;
          return { ...p, team: sideId === sides[0]?.id ? 'A' : sideId === sides[1]?.id ? 'B' : undefined };
        });
      }
      if (fmt === 'scramble' || fmt === 'alternate-shot') {
        teamMode = fmt;
        handicapAllowance = fmt === 'scramble' ? -1 : Number(game!.modeSettings?.altShotAllowance ?? 50);
      } else {
        // Per-player entry; the side's hole score folds at display/compute time.
        teamMode = fmt === 'combined' ? 'combined' : 'best-ball';
      }
    }

    // GENERALIZED TEAM FORMAT (F-006). A classic pool used to hard-code teamMode
    // 'two-best-balls' and pass only ballSelection, so a scramble or Stableford pool handed
    // the scorecard a rule it wasn't playing. Two things went wrong, both verified:
    //
    //  1. Scramble money depended on the ORDER of team.playerIds. teamNetOnHole reads the
    //     first member who has a score — right when one ball is entered (all members share
    //     the gross), but the card did PER-PLAYER entry, so the team score became whoever was
    //     listed first: the same round paid +$75 or −$75 on a 4-player reorder.
    //  2. The card's team row (hard-coded 1-net-1-gross) contradicted the payout — scramble
    //     hole 1 was 4 to the engine and 9 on the card; Stableford drew strokes where the
    //     money counted points.
    //
    // Craig's call: one-ball formats enter ONE shared team score (as the 2v2 mode already
    // does), and the team row comes from the same engine the money uses.
    const poolFormat = game!.teamFormat;
    if (poolFormat) {
      teamMode = teamModeForFormat(poolFormat);
      // Tag the whole foursome as ONE side, for EVERY generalized format — not just the
      // one-ball ones. The card's team row and the one-ball entry UI both group by
      // player.team, so an untagged foursome gets no team row at all: a multi-ball
      // Stableford pool would have scored with no sight of the number it's settled on.
      players = players.map((p) => ({ ...p, team: 'A' as const }));
      if (isOneBall(poolFormat)) {
        // Match the leaderboard's team handicap: scramble is USGA tiered (-1 is the play
        // page's sentinel for that), alternate shot is 50% of the 60/40 combined.
        handicapAllowance = poolFormat === 'scramble' ? -1 : 50;
      }
    }

    const setup: GameSetup = {
      formatId: 'stroke-play',
      teamMode,
      course: game!.course,
      players,
      handicapAllowance,
      // Carry the pool game's holes selection so the scorecard shows only the
      // played nine. NOTE: the play page's getHolesForSetup re-ranks stroke
      // indexes 1–9 whenever holesPlaying !== '18' — correct for the USGA 9-hole
      // basis; for the 18-hole basis the SCORING engine (getGameHoles) keeps the
      // 18-hole indexes, so the scorecard's per-hole "Hdcp" label may differ from
      // where strokes actually fall. Strokes/money come from the engine, not this
      // label. (Aligning the play-page label to the basis is a display follow-up.)
      holesPlaying: game!.holesPlaying ?? '18',
      strokeMethod,
      handicapBasis: game!.handicapBasis ?? 'course',
      // ballSelection stays for legacy games and older readers; teamFormat/teamScoreBasis
      // let the card draw the row the money engine will actually score.
      formatSettings: {
        ballSelection: game!.ballSelection,
        ...(game!.teamFormat ? { teamFormat: game!.teamFormat } : {}),
        ...(game!.teamScoreBasis ? { teamScoreBasis: game!.teamScoreBasis } : {}),
        // The foursome's own name, so a one-ball card says "Team 1" rather than the generic
        // "Team A" the 2v2 sides use. Rides formatSettings (a string bag) like ballSelection,
        // so no GameSetup schema change.
        poolTeamName: team.name,
      },
      matchupId: team.matchupId,
      offTheLowBaseline,
    };

    sessionStorage.setItem('game_setup', JSON.stringify(setup));
    sessionStorage.setItem('game_pool_context', JSON.stringify({ poolGameId: game!.id, matchupId: team.matchupId }));
    sessionStorage.removeItem('game_tournament_context');
    router.push('/game/play');
  }

  const pot = game.players.length * game.entryPerPlayer;

  // A single-group game (2v2 / skins / Wolf / …) is ONE foursome named "Group",
  // so the classic "Pool Money Game · N foursomes" subtitle read
  // "Pool Money Game · 1 foursomes" — mislabeled AND unpluralized. Name the game
  // mode instead, and pluralize the foursome count for the real pool. ("Pool"
  // here is the FORMAT name, like Skins or Wolf — §5.az.)
  const hubMode = getGameMode(game.gameMode);
  const isSingleGroupHub = hubMode
    ? hubMode.category === 'individual' || hubMode.category === 'team-within-group'
    : false;
  const teamCount = game.teams.length;
  const hubSubtitle = isSingleGroupHub
    ? `${hubMode!.name} · ${game.players.length} player${game.players.length === 1 ? '' : 's'}`
      // F-019: a side game can now tee off in several groups, and how many tee times there are is
      // the first thing an organizer wants confirmed. Only added when there's more than one, so
      // the ordinary 2v2 subtitle is untouched.
      + (teamCount > 1 ? ` · ${teamCount} groups` : '')
    : `Pool · ${teamCount} foursome${teamCount === 1 ? '' : 's'}`;

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{game.name}</h1>
            <p className="text-xs text-green-200">{hubSubtitle}</p>
            {/* F-049: say who the app thinks you are. A guest on a scoring link
                has no other cue; an identified viewer sees their own name. The
                owner-without-login case shows nothing — the controls say it. */}
            {viewerName ? (
              <p className="text-[11px] text-green-300">Viewing as {viewerName}</p>
            ) : poolOnly ? (
              <p className="text-[11px] text-green-300">Viewing as guest · scoring link</p>
            ) : null}
          </div>
          {/* THE LINE IS READ-ONLY vs MUTATING, not organizer vs guest.
              A share-link player is in a money game: they're entitled to SEE
              everything — the money structure, the handicap basis, how the teams
              were built. So MoneySummary, FieldLowBanner and TeamBuildSummaryCard
              all stay visible below.
              What they must not do is CHANGE it for everyone else: Edit rebuilds
              teams, Close out ends the round for all four foursomes, GHIN refresh
              needs a token they don't have. Those are hidden. */}
          <div className="flex items-center gap-4">
            {/* Feedback is for EVERYONE in the game — the share-link friend
                using the app mid-round is exactly who we want to hear from. */}
            <FeedbackButton gameId={game.id} />
            {/* F-056: Share is READ-ONLY spreading of a link the guest already
                holds, so it sits outside the poolOnly guard. Save format and
                Edit mutate shared state and stay owner-side of the line. */}
            <button
              onClick={() => setSharing(true)}
              className="text-sm font-medium text-green-200 hover:text-white"
            >
              Share
            </button>
            {!poolOnly && (
              <>
                <button
                  onClick={() => setSavingFormat(true)}
                  className="text-sm font-medium text-green-200 hover:text-white"
                >
                  Save format
                </button>
                <button
                  onClick={() => setEditing((e) => !e)}
                  className={`text-sm font-medium ${editing ? 'text-white' : 'text-green-200 hover:text-white'}`}
                >
                  {editing ? 'Done editing' : 'Edit'}
                </button>
              </>
            )}
            <button onClick={() => router.push(poolOnly ? '/pool' : '/dashboard')} className="text-sm text-green-200 hover:text-white">
              {poolOnly ? 'My Games' : 'Dashboard'}
            </button>
          </div>
        </div>
      </header>

      {sharing && <SharePanel game={game} onSave={persist} onClose={() => setSharing(false)} />}

      {savingFormat && <SaveFormatModal game={game} onClose={() => setSavingFormat(false)} />}

      <GhinLoginModal
        open={showLogin}
        onCloseAction={() => setShowLogin(false)}
        onDoneAction={() => { setShowLogin(false); refreshGameHandicaps(); }}
      />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Leaderboard + Teams + Scorecards CTAs */}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => router.push(`/pool/${id}/leaderboard`)}
            className="text-sm bg-green-700 hover:bg-green-600 text-white px-5 py-2.5 rounded-lg font-medium transition"
          >
            Leaderboard
          </button>
          <button
            onClick={() => router.push(`/pool/${id}/teams`)}
            className="text-sm bg-white border border-green-700 text-green-700 hover:bg-green-50 px-5 py-2.5 rounded-lg font-medium transition"
          >
            Teams
          </button>
          <button
            onClick={() => router.push(`/pool/${id}/scorecards`)}
            className="text-sm bg-white border border-green-700 text-green-700 hover:bg-green-50 px-5 py-2.5 rounded-lg font-medium transition"
          >
            Scorecards
          </button>
        </div>

        {/* Handicap refresh — re-pull from GHIN (e.g. teams set up the night
            before, indexes changed overnight) and offer to re-balance. Organizer
            only: a share-link guest has no GHIN token, so it could only ever fail
            for them. */}
        {!poolOnly && (
          <HandicapRefresh game={game} onRefresh={refreshGameHandicaps} onRebalance={() => setEditing(true)} onNeedsLogin={() => setShowLogin(true)} />
        )}

        {/* Field-low banner — explains how the low man sets everyone's strokes */}
        <FieldLowBanner game={game} />

        {/* Money summary — becomes an editor while in edit mode */}
        {editing ? <GameSettingsEditor game={game} onSave={persist} /> : <MoneySummary game={game} pot={pot} />}

        {/* Foursome cards — a single-group game has just the one "Group" card, so
            "Foursomes" over it reads wrong. */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">{isSingleGroupHub ? 'Players' : 'Foursomes'}</h2>
          {editing ? (
            <EditFoursomes game={game} onSave={persist} />
          ) : (
            <div className="space-y-3">
              {/* "How these teams were built" is about balancing N foursomes —
                  nothing to explain when the game IS one group. */}
              {game.teams.length > 0 && !isSingleGroupHub && <TeamBuildSummaryCard game={game} />}
              {game.teams.map((team) => (
                <FoursomeCard
                  key={team.id}
                  team={team}
                  players={playersForTeam(team)}
                  game={game}
                  detail={detailForTeam(team.id)}
                  onEnterScores={() => enterScores(team)}
                />
              ))}
              {game.teams.length === 0 && (
                <p className="text-center text-gray-500 py-8">
                  {isSingleGroupHub ? 'No players configured yet.' : 'No foursomes configured yet.'}
                </p>
              )}
            </div>
          )}
        </section>

        {/* F-032: a completed game answers "who pays whom" for EVERYONE — a guest in
            the parking lot needs the transfer list as much as the organizer (who gets
            it inside the close-out panel below). */}
        {poolOnly && game.status === 'completed' && <GuestSettleUp game={game} />}

        {/* Organizer-only surfaces. A guest tapping "Close out game" would end the
            round for every foursome, and CTP/Wolf setup is the organizer's job. */}
        {!poolOnly && (
          <>
            {/* F-019: a group that has outgrown a tee slot. Craig's call — PROMPT, defaulting to
                keep, never a silent re-split of a round already being scored. */}
            <OversizedGroupPrompt game={game} onSave={persist} />

            {/* Wolf rotation editor — only for Wolf games. */}
            {game.gameMode === 'wolf' && <WolfRotationEditor game={game} onSave={persist} />}

            {/* CTP editor / finalize surface */}
            <CtpEditor game={game} onSave={persist} />

            {/* Close out / reopen — the explicit lifecycle control. */}
            <GameCloseOut game={game} onSave={persist} />
          </>
        )}
      </main>
    </div>
  );
}

