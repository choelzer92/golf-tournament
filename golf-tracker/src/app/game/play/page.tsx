'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { GameSetup, GameScore, Player } from '@/lib/game-state';
import { calcCourseHandicap } from '@/lib/game-state';
import { isOneBallFormat, isTeamMode, resolveStablefordScale } from '@/lib/formats';
import type { TournamentGameContext, Tournament } from '@/lib/tournament-state';
import { loadTournament, saveTournament, saveGameScores, cacheGameScores, loadGameScores, fetchGameScores, fetchTournament, computeStandings, computeBonuses, computeProjectedBonuses, subscribeToScores, onVisibilityRefetch } from '@/lib/tournament-state';
import { computeLiveMatchStatus, recomputeMatchResult, getHoleDataForRound, computeSplitMatchStatuses, type SplitMatchup } from '@/lib/live-scoring';
import { computeSideGameResult } from '@/lib/side-game';
import type { SideGameResult } from '@/lib/side-game';
import type { PoolGame } from '@/lib/pool-game';
import { loadPoolGame, fetchPoolGame, savePoolGame, subscribeToPoolGame } from '@/lib/pool-game';

interface PoolGameContext {
  poolGameId: string;
  matchupId: string;
}

export default function PlayGamePage() {
  const router = useRouter();
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [scores, setScores] = useState<GameScore[]>([]);
  const [remoteScores, setRemoteScores] = useState<GameScore[]>([]);
  const [currentHole, setCurrentHole] = useState(1);
  const [tournamentCtx, setTournamentCtx] = useState<TournamentGameContext | null>(null);
  const [teamNames, setTeamNames] = useState<{ A: string; B: string }>({ A: 'Team A', B: 'Team B' });
  const [strokesExpanded, setStrokesExpanded] = useState(false);
  const [otherMatchupTick, setOtherMatchupTick] = useState(0);
  const [isSideGame, setIsSideGame] = useState(false);
  const [poolCtx, setPoolCtx] = useState<PoolGameContext | null>(null);
  const [poolGame, setPoolGame] = useState<PoolGame | null>(null);
  const didAutoJump = useRef(false);
  const remoteScoresRef = useRef<GameScore[]>([]);

  useEffect(() => {
    const data = sessionStorage.getItem('game_setup');
    if (!data) {
      router.push('/game/new');
      return;
    }
    const parsed = JSON.parse(data) as GameSetup;
    setSetup(parsed);

    const ctxRaw = sessionStorage.getItem('game_tournament_context');
    if (ctxRaw) {
      const ctx = JSON.parse(ctxRaw) as TournamentGameContext;
      const ctxParsed = JSON.parse(ctxRaw);
      if (ctxParsed.sideGameMode) setIsSideGame(true);
      setTournamentCtx(ctx);
      const t = loadTournament(ctx.tournamentId);
      if (t) {
        setTeamNames({ A: t.teams[0].name, B: t.teams[1].name });
      } else {
        fetchTournament(ctx.tournamentId).then((t) => {
          if (t) setTeamNames({ A: t.teams[0].name, B: t.teams[1].name });
        });
      }
    }

    // Pool money game: self-contained N-foursome pool (no 2-team tournament).
    const poolRaw = sessionStorage.getItem('game_pool_context');
    if (poolRaw) {
      const pctx = JSON.parse(poolRaw) as PoolGameContext;
      setPoolCtx(pctx);
      const cached = loadPoolGame(pctx.poolGameId);
      if (cached) setPoolGame(cached);
      fetchPoolGame(pctx.poolGameId).then((g) => { if (g) setPoolGame(g); });
    }

    // Load previously saved scores for this matchup
    if (parsed.matchupId) {
      const cached = loadGameScores(parsed.matchupId);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setScores(cached);
      }
      fetchGameScores(parsed.matchupId).then((saved) => {
        if (saved && Array.isArray(saved) && saved.length > 0) {
          setScores(saved);
        }
      });
    }

    // Fetch scores for all other active matchups in the tournament (for projections)
    if (ctxRaw) {
      const ctx = JSON.parse(ctxRaw) as TournamentGameContext;
      const t = loadTournament(ctx.tournamentId);
      if (t) {
        for (const round of t.rounds) {
          for (const m of round.matchups) {
            if (m.gameId && !m.result && m.id !== parsed.matchupId) {
              fetchGameScores(m.id);
            }
          }
        }
      } else {
        fetchTournament(ctx.tournamentId).then((t) => {
          if (!t) return;
          for (const round of t.rounds) {
            for (const m of round.matchups) {
              if (m.gameId && !m.result && m.id !== parsed.matchupId) {
                fetchGameScores(m.id);
              }
            }
          }
        });
      }
    }

    const startHole = parsed.holesPlaying === 'back9' ? 10 : 1;
    setCurrentHole(startHole);
  }, [router]);

  // Jump to first unscored hole on resume
  useEffect(() => {
    if (didAutoJump.current || !setup || scores.length === 0) return;
    didAutoJump.current = true;

    const tee = setup.course?.teeSets.find((t) => String(t.id) === String(setup.course?.selectedTeeId)) || setup.course?.teeSets[0];
    const allHoles = (tee?.holes || []).sort((a, b) => a.number - b.number);
    let playingHoles = allHoles;
    if (setup.holesPlaying === 'front9') playingHoles = allHoles.filter((h) => h.number <= 9);
    else if (setup.holesPlaying === 'back9') playingHoles = allHoles.filter((h) => h.number > 9);

    const playersToCheck = setup.scoringTeam
      ? setup.players.filter((p) => p.team === setup.scoringTeam)
      : setup.players;

    for (const hole of playingHoles) {
      const allScored = playersToCheck.every((p) =>
        scores.some((s) => s.playerId === p.id && s.hole === hole.number)
      );
      if (!allScored) {
        setCurrentHole(hole.number);
        return;
      }
    }
    // All holes scored — stay on last hole
    if (playingHoles.length > 0) {
      setCurrentHole(playingHoles[playingHoles.length - 1].number);
    }
  }, [setup, scores]);

  // Keep the pool game fresh (CTP picks from other foursomes) while scoring.
  useEffect(() => {
    if (!poolCtx) return;
    const channel = subscribeToPoolGame(poolCtx.poolGameId, (g) => setPoolGame(g));
    return () => { channel.unsubscribe(); };
  }, [poolCtx]);

  function mergeScores(local: GameScore[], remote: GameScore[]): GameScore[] {
    const map = new Map<string, GameScore>();
    for (const s of remote) map.set(`${s.playerId}_${s.hole}`, s);
    for (const s of local) map.set(`${s.playerId}_${s.hole}`, s);
    return Array.from(map.values());
  }

  // Cache scores immediately on every change so navigation doesn't lose data,
  // but debounce the server write to avoid rapid-fire upserts
  useEffect(() => {
    if (!setup?.matchupId || scores.length === 0) return;
    const matchupId = setup.matchupId;
    const merged = mergeScores(scores, remoteScoresRef.current);
    cacheGameScores(matchupId, merged);
    const ownedPlayerIds = setup.scoringTeam
      ? setup.players.filter((p) => p.team === setup.scoringTeam).map((p) => p.id)
      : undefined;
    const timeout = setTimeout(() => {
      saveGameScores(matchupId, merged, ownedPlayerIds);
    }, 400);
    return () => clearTimeout(timeout);
  }, [setup?.matchupId, scores]);

  // Realtime subscription for remote team's scores
  // + poll every 15s and on tab resume as fallback for dropped WebSocket
  useEffect(() => {
    if (!setup?.scoringTeam || !setup?.matchupId) return;
    const matchupId = setup.matchupId;
    const localPlayerIds = new Set(
      setup.players.filter((p) => p.team === setup.scoringTeam).map((p) => p.id)
    );

    function applyRemote(allScores: any) {
      if (!Array.isArray(allScores)) return;
      const remote = allScores.filter((s: GameScore) => !localPlayerIds.has(s.playerId));
      remoteScoresRef.current = remote;
      setRemoteScores(remote);
    }

    const channel = subscribeToScores(matchupId, applyRemote);

    const pollInterval = setInterval(() => {
      fetchGameScores(matchupId).then((allScores) => {
        if (allScores) applyRemote(allScores);
      });
    }, 15000);

    const cleanupVisibility = onVisibilityRefetch([matchupId], () => {
      fetchGameScores(matchupId).then((allScores) => {
        if (allScores) applyRemote(allScores);
      });
    });

    return () => { channel.unsubscribe(); clearInterval(pollInterval); cleanupVisibility(); };
  }, [setup?.scoringTeam, setup?.matchupId, setup?.players]);

  // Subscribe to other active matchups in the tournament for live overview updates
  // + re-fetch on tab/app resume to catch missed events while idle
  // + poll every 30s as fallback for dropped WebSocket connections on mobile
  useEffect(() => {
    if (!tournamentCtx || !setup?.matchupId) return;
    const tournament = loadTournament(tournamentCtx.tournamentId);
    if (!tournament) return;

    const otherMatchupIds = tournament.rounds
      .flatMap((r) => r.matchups)
      .filter((m) => m.gameId && !m.result && m.id !== setup.matchupId)
      .map((m) => m.id);

    if (otherMatchupIds.length === 0) return;

    const channels = otherMatchupIds.map((mid) =>
      subscribeToScores(mid, () => setOtherMatchupTick((t) => t + 1))
    );

    const cleanupVisibility = onVisibilityRefetch(otherMatchupIds, () => setOtherMatchupTick((t) => t + 1));

    const pollInterval = setInterval(() => {
      Promise.all(otherMatchupIds.map((mid) => fetchGameScores(mid))).then(() => {
        setOtherMatchupTick((t) => t + 1);
      });
    }, 30000);

    return () => { channels.forEach((ch) => ch.unsubscribe()); cleanupVisibility(); clearInterval(pollInterval); };
  }, [tournamentCtx?.tournamentId, setup?.matchupId]);

  if (!setup) return null;

  // Derive team mode — fallback for older saved games without teamMode field
  const baseTeamMode = setup.teamMode || (setup.formatId === 'scramble' ? 'scramble' : setup.formatId === 'alternate-shot' ? 'alternate-shot' : setup.players.some((p) => p.team) ? 'best-ball' : 'individual');
  // Split format: use back-9 config when current hole > 9
  const isBackNine = currentHole > 9;
  const teamMode = (setup.splitFormat && isBackNine) ? setup.splitFormat.teamMode : baseTeamMode;
  const oneBall = isOneBallFormat(teamMode);
  const hasTeamScoring = isTeamMode(teamMode);

  const defaultTee = setup.course?.teeSets.find((t) => String(t.id) === String(setup.course?.selectedTeeId)) || setup.course?.teeSets[0];
  const holes = getHolesForSetup(setup);

  const sortedPlayers = [...setup.players].sort((a, b) => {
    const teamOrder = (t?: 'A' | 'B') => t === 'A' ? 0 : t === 'B' ? 1 : 2;
    return teamOrder(a.team) - teamOrder(b.team);
  });

  // Players to show on scorecard (filtered by scoringTeam if set)
  const visiblePlayers = setup.scoringTeam
    ? sortedPlayers.filter((p) => p.team === setup.scoringTeam)
    : sortedPlayers;

  function getPlayerTee(player: Player) {
    if (player.teeSetId) {
      return setup!.course?.teeSets.find((t) => t.id === player.teeSetId) || defaultTee;
    }
    return defaultTee;
  }

  function getHolesForSetup(s: GameSetup) {
    const allHoles = defaultTee?.holes.sort((a, b) => a.number - b.number) || Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, yardage: 0, handicap: i + 1 }));
    let subset = allHoles;
    if (s.holesPlaying === 'front9') subset = allHoles.filter((h) => h.number <= 9);
    else if (s.holesPlaying === 'back9') subset = allHoles.filter((h) => h.number > 9);

    if (s.holesPlaying !== '18') {
      const ranked = [...subset].sort((a, b) => a.handicap - b.handicap);
      const rankMap = new Map(ranked.map((h, i) => [h.number, i + 1]));
      return subset.map((h) => ({ ...h, handicap: rankMap.get(h.number)! }));
    }

    // Split format: re-rank each 9 independently (1-9) so strokes distribute over 9 holes
    if (s.splitFormat) {
      const front = allHoles.filter((h) => h.number <= 9);
      const back = allHoles.filter((h) => h.number > 9);
      const frontRanked = [...front].sort((a, b) => a.handicap - b.handicap);
      const backRanked = [...back].sort((a, b) => a.handicap - b.handicap);
      const rankMap = new Map<number, number>();
      frontRanked.forEach((h, i) => rankMap.set(h.number, i + 1));
      backRanked.forEach((h, i) => rankMap.set(h.number, i + 1));
      return subset.map((h) => ({ ...h, handicap: rankMap.get(h.number)! }));
    }

    return subset;
  }

  function getActiveAllowance(holeNumber?: number): number {
    if (setup!.splitFormat && (holeNumber ? holeNumber > 9 : isBackNine)) {
      return setup!.splitFormat.handicapAllowance ?? 100;
    }
    return setup!.handicapAllowance ?? 100;
  }

  function getActiveStrokeMethod(holeNumber?: number): 'full' | 'off-the-low' {
    if (setup!.splitFormat && (holeNumber ? holeNumber > 9 : isBackNine)) {
      return setup!.splitFormat.strokeMethod ?? 'off-the-low';
    }
    return setup!.strokeMethod ?? 'off-the-low';
  }

  function getPlayerEffectiveHcap(player: Player, holeNumber?: number): number {
    if (!player.handicapIndex) return 0;
    const allowance = getActiveAllowance(holeNumber);
    const is9 = setup!.holesPlaying === 'front9' || setup!.holesPlaying === 'back9' || !!setup!.splitFormat;

    if (setup!.handicapBasis === 'index') {
      const index = is9 ? player.handicapIndex / 2 : player.handicapIndex;
      return index * (allowance / 100);
    }

    const playerTee = getPlayerTee(player);
    if (!playerTee) return 0;

    if (is9) {
      // 9-hole course handicap = (Index / 2) × (9-hole Slope / 113) + (9-hole CR - 9-hole Par)
      const ratingType = setup!.splitFormat
        ? ((holeNumber ? holeNumber > 9 : isBackNine) ? 'Back' : 'Front')
        : (setup!.holesPlaying === 'front9' ? 'Front' : 'Back');
      const rating = playerTee.ratings?.find((r) => r.type === ratingType);

      if (rating && rating.slopeRating && rating.courseRating) {
        const par = (playerTee.holes || [])
          .filter((h) => ratingType === 'Front' ? h.number <= 9 : h.number > 9)
          .reduce((sum, h) => sum + h.par, 0) || Math.round(playerTee.totalPar / 2);
        const result = calcCourseHandicap(player.handicapIndex / 2, rating.slopeRating, rating.courseRating, par)
          * (allowance / 100);
        return isNaN(result) ? 0 : result;
      }

      // Fallback: halve the 18-hole course handicap
      const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
      if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) return 0;
      const full = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar)
        * (allowance / 100);
      return isNaN(full) ? 0 : full / 2;
    }

    // 18-hole course handicap
    const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
    if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) return 0;
    const result = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar)
      * (allowance / 100);
    return isNaN(result) ? 0 : result;
  }

  function getPlayerRawCourseHandicap(player: Player): number {
    if (!player.handicapIndex) return 0;
    const is9 = setup!.holesPlaying === 'front9' || setup!.holesPlaying === 'back9' || !!setup!.splitFormat;

    if (setup!.handicapBasis === 'index') {
      return is9 ? player.handicapIndex / 2 : player.handicapIndex;
    }

    const playerTee = getPlayerTee(player);
    if (!playerTee) return 0;

    if (is9) {
      const ratingType = setup!.splitFormat
        ? (isBackNine ? 'Back' : 'Front')
        : setup!.holesPlaying === 'front9' ? 'Front' : 'Back';
      const rating = playerTee.ratings?.find((r) => r.type === ratingType);
      if (rating && rating.slopeRating && rating.courseRating) {
        const par = (playerTee.holes || [])
          .filter((h) => ratingType === 'Front' ? h.number <= 9 : h.number > 9)
          .reduce((sum, h) => sum + h.par, 0) || Math.round(playerTee.totalPar / 2);
        const result = calcCourseHandicap(player.handicapIndex / 2, rating.slopeRating, rating.courseRating, par);
        return isNaN(result) ? 0 : result;
      }
      const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
      if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) return 0;
      const full = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar);
      return isNaN(full) ? 0 : full / 2;
    }

    const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
    if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) return 0;
    const result = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar);
    return isNaN(result) ? 0 : result;
  }

  function getScrambleTeamHandicap(teamPlayers: Player[]): number {
    const courseHandicaps = teamPlayers
      .map((p) => getPlayerRawCourseHandicap(p))
      .sort((a, b) => a - b);

    const allowance = setup!.handicapAllowance ?? -1;
    if (allowance >= 0) {
      // Flat % override: sum course handicaps × allowance
      const sum = courseHandicaps.reduce((s, h) => s + h, 0);
      return Math.round(sum * (allowance / 100));
    }

    // USGA Tiered (default)
    const multipliers = courseHandicaps.length === 2 ? [0.35, 0.15]
      : courseHandicaps.length === 3 ? [0.30, 0.20, 0.10]
      : [0.25, 0.20, 0.15, 0.10];

    return Math.round(courseHandicaps.reduce((sum, hcap, i) => sum + hcap * (multipliers[i] || 0), 0));
  }

  function getAlternateShotTeamHandicap(teamPlayers: Player[]): number {
    const courseHandicaps = teamPlayers
      .map((p) => getPlayerRawCourseHandicap(p))
      .sort((a, b) => a - b);

    const allowance = (setup!.handicapAllowance ?? 50) / 100;
    if (courseHandicaps.length < 2) return Math.round((courseHandicaps[0] || 0) * allowance);
    // USGA: 60% of low handicap + 40% of high handicap, then apply allowance (default 50%)
    const combined = courseHandicaps[0] * 0.6 + courseHandicaps[1] * 0.4;
    return Math.round(combined * allowance);
  }

  function getTeamHandicapForFormat(teamPlayers: Player[]): number {
    if (teamMode === 'scramble') return getScrambleTeamHandicap(teamPlayers);
    if (teamMode === 'alternate-shot') return getAlternateShotTeamHandicap(teamPlayers);
    return 0;
  }

  function getTeamStrokesOnHole(teamPlayers: Player[], holeHandicap: number): number {
    const teamHcap = getTeamHandicapForFormat(teamPlayers);
    if (teamHcap <= 0) return 0;

    const numHoles = holes.length;
    if (teamHcap >= numHoles * 2) return 2;
    if (teamHcap > numHoles) {
      if (holeHandicap <= teamHcap - numHoles) return 2;
      return 1;
    }
    if (holeHandicap <= teamHcap) return 1;
    return 0;
  }

  function getPlayingHandicap(player: Player, holeNumber?: number): number {
    const hcap = getPlayerEffectiveHcap(player, holeNumber);
    if (getActiveStrokeMethod(holeNumber) === 'full') return hcap;

    // Off the low: determine the comparison pool
    let pool = setup!.players;

    // Split format back 9 with pairings: off the low of just the 1v1 pair
    if (setup!.splitFormat?.pairings && (holeNumber ? holeNumber > 9 : isBackNine)) {
      const pairing = setup!.splitFormat.pairings.find((p) => p.playerIds.includes(player.id));
      if (pairing) {
        pool = setup!.players.filter((p) => pairing.playerIds.includes(p.id));
      }
    }

    const allHcaps = pool.map((p) => getPlayerEffectiveHcap(p, holeNumber));
    const lowest = Math.min(...allHcaps);
    return hcap - lowest;
  }

  function getPlayerStrokesOnHole(player: Player, holeHandicap: number, holeNumber?: number): number {
    const rawHcap = getPlayingHandicap(player, holeNumber);
    const playingHcap = Math.round(rawHcap);
    const numHoles = setup!.splitFormat ? 9 : holes.length;

    if (playingHcap === 0) return 0;

    // Negative handicap: player gives strokes back on hardest holes
    if (playingHcap < 0) {
      const absHcap = Math.abs(playingHcap);
      if (absHcap >= numHoles * 2) return -2;
      if (absHcap > numHoles) {
        if (holeHandicap <= absHcap - numHoles) return -2;
        return -1;
      }
      if (holeHandicap <= absHcap) return -1;
      return 0;
    }

    // Positive handicap: player receives strokes
    if (playingHcap >= numHoles * 2) return 2;
    if (playingHcap > numHoles) {
      if (holeHandicap <= playingHcap - numHoles) return 2;
      return 1;
    }
    if (holeHandicap <= playingHcap) return 1;
    return 0;
  }

  function getScore(playerId: string, hole: number): number | null {
    const s = scores.find((sc) => sc.playerId === playerId && sc.hole === hole);
    if (s) return s.grossScore;
    // Check remote scores for the other team's data
    const r = remoteScores.find((sc) => sc.playerId === playerId && sc.hole === hole);
    return r ? r.grossScore : null;
  }

  function setScore(playerId: string, hole: number, gross: number) {
    setScores((prev) => {
      const filtered = prev.filter((s) => !(s.playerId === playerId && s.hole === hole));
      return [...filtered, { playerId, hole, grossScore: gross }];
    });
  }

  function incrementScore(playerId: string, hole: number) {
    const current = getScore(playerId, hole);
    const holePar = holes.find((h) => h.number === hole)?.par || 4;
    const newScore = current ? current + 1 : holePar;
    setScore(playerId, hole, newScore);
  }

  function decrementScore(playerId: string, hole: number) {
    const current = getScore(playerId, hole);
    if (current && current > 1) {
      setScore(playerId, hole, current - 1);
    }
  }

  const currentHoleData = holes.find((h) => h.number === currentHole);
  const isFirstHole = currentHole === holes[0]?.number;
  const isLastHole = currentHole === holes[holes.length - 1]?.number;

  function nextHole() {
    const idx = holes.findIndex((h) => h.number === currentHole);
    if (idx < holes.length - 1) setCurrentHole(holes[idx + 1].number);
  }

  function prevHole() {
    const idx = holes.findIndex((h) => h.number === currentHole);
    if (idx > 0) setCurrentHole(holes[idx - 1].number);
  }

  function getTotalScore(playerId: string): number {
    return scores.filter((s) => s.playerId === playerId).reduce((sum, s) => sum + s.grossScore, 0);
  }

  function getTotalNet(playerId: string): number {
    let total = 0;
    for (const hole of holes) {
      const gross = getScore(playerId, hole.number);
      if (gross) {
        const player = setup!.players.find((p) => p.id === playerId)!;
        const strokes = getPlayerStrokesOnHole(player, hole.handicap, hole.number);
        total += gross - strokes;
      }
    }
    return total;
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-lg mx-auto px-4 py-1.5 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold">{setup.course?.courseName || 'Game'}</h1>
          </div>
          <div className="flex items-center gap-3">
            {tournamentCtx && !isSideGame && (
              <button
                onClick={() => router.push(`/tournament/${tournamentCtx.tournamentId}/scoreboard`)}
                className="text-sm text-green-200 hover:text-white font-medium"
              >
                Scoreboard
              </button>
            )}
            {isSideGame && tournamentCtx && (
              <button
                onClick={() => router.push(`/tournament/${tournamentCtx.tournamentId}/side-games/scoreboard`)}
                className="text-sm text-green-200 hover:text-white font-medium"
              >
                Leaderboard
              </button>
            )}
            {poolCtx && (
              <button
                onClick={() => router.push(`/pool/${poolCtx.poolGameId}/leaderboard`)}
                className="text-sm text-green-200 hover:text-white font-medium"
              >
                Leaderboard
              </button>
            )}
            <button
              onClick={() => {
                if (poolCtx) {
                  router.push(`/pool/${poolCtx.poolGameId}`);
                } else if (tournamentCtx && isSideGame) {
                  router.push(`/tournament/${tournamentCtx.tournamentId}/side-games`);
                } else if (tournamentCtx) {
                  router.push(`/tournament/${tournamentCtx.tournamentId}`);
                } else {
                  router.push('/dashboard');
                }
              }}
              className="text-sm text-green-200 hover:text-white"
            >
              {tournamentCtx || poolCtx ? 'Back' : 'End'}
            </button>
          </div>
        </div>
      </header>

      <div className="bg-green-900 text-green-200 text-[10px] text-center py-0.5">
        {(() => {
          const parts: string[] = [];
          const formatNames: Record<string, string> = {
            'stableford': 'Stableford',
            'stroke-play': 'Stroke Play',
            'match-play': 'Match Play',
            'nassau': 'Nassau',
            'skins': 'Skins',
            'scramble': 'Scramble',
            'alternate-shot': 'Alternate Shot',
          };
          const activeFormatId = (setup.splitFormat && isBackNine) ? setup.splitFormat.formatId : setup.formatId;
          const activeAllowance = (setup.splitFormat && isBackNine) ? (setup.splitFormat.handicapAllowance ?? 100) : (setup.handicapAllowance ?? 100);
          const activeStrokeMethod = (setup.splitFormat && isBackNine) ? (setup.splitFormat.strokeMethod ?? 'off-the-low') : (setup.strokeMethod ?? 'off-the-low');
          parts.push(formatNames[activeFormatId] || activeFormatId.replace('-', ' '));

          if (oneBall) {
            if (teamMode === 'scramble') {
              parts.push(activeAllowance < 0 ? 'USGA Tiered' : `${activeAllowance}%`);
            } else {
              parts.push(`60/40 × ${activeAllowance}%`);
            }
          } else {
            if (teamMode === 'two-best-balls') {
              const variant = (setup.formatSettings?.ballSelection as string) || '1-net-1-gross';
              if (variant === '2-best-net') parts.push('Two Best Nets');
              else if (variant === '2-best-gross') parts.push('Two Best Gross');
              else parts.push('Best Net + Best Gross');
            } else if (teamMode === 'best-ball') {
              parts.push('Best Ball');
            } else if (teamMode === 'combined') {
              parts.push('Combined');
            } else if (teamMode === 'individual') {
              parts.push('Individual');
            }
            if (activeAllowance !== 100) {
              parts.push(`${activeAllowance}%`);
            }
            parts.push(activeStrokeMethod === 'off-the-low' ? 'Off the Low' : 'Full Handicap');
          }
          return parts.join(' · ');
        })()}
      </div>

      {tournamentCtx && !isSideGame && (
        <TournamentOverviewPanel tournamentCtx={tournamentCtx} currentMatchupId={tournamentCtx.matchupId} currentScores={scores} setup={setup} getScore={getScore} getPlayerStrokesOnHole={getPlayerStrokesOnHole} remoteScores={remoteScores} otherMatchupTick={otherMatchupTick} />
      )}

      {isSideGame && tournamentCtx && (
        <SideGameFlightPanel tournamentId={tournamentCtx.tournamentId} currentScores={scores} ownMatchupId={tournamentCtx.matchupId} />
      )}

      {setup.scoringTeam && remoteScores.length === 0 && !tournamentCtx && (
        <div className="bg-gray-800 text-center py-2 text-xs text-gray-400">
          Waiting for {setup.scoringTeam === 'A' ? teamNames.B : teamNames.A} to start scoring...
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-2">
        {/* Stroke allocation & handicap details */}
        <div className="mb-2">
          <button
            onClick={() => setStrokesExpanded(!strokesExpanded)}
            className="w-full flex items-center justify-between text-sm text-gray-600 hover:text-gray-900 py-1"
          >
            <span className="font-medium">Stroke Allocation</span>
            <span>{strokesExpanded ? '▾' : '▸'}</span>
          </button>
          {strokesExpanded && (
            <>
              {/* Course & rating info */}
              <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-600">
                  {(() => {
                    const is9 = setup.holesPlaying === 'front9' || setup.holesPlaying === 'back9' || !!setup.splitFormat;
                    const ratingType = setup.splitFormat
                      ? (isBackNine ? 'Back' : 'Front')
                      : setup.holesPlaying === 'front9' ? 'Front' : setup.holesPlaying === 'back9' ? 'Back' : 'Total';
                    const tee = defaultTee;
                    const rating = tee?.ratings?.find((r) => r.type === ratingType) || tee?.ratings?.find((r) => r.type === 'Total');
                    return (
                      <>
                        <span className="font-medium text-gray-800">{is9 ? `${ratingType} 9` : '18 Holes'}</span>
                        {tee && <span className="font-medium">{tee.name} ({tee.totalYardage} yds)</span>}
                        {rating && <span>CR: {rating.courseRating} · Slope: {rating.slopeRating}</span>}
                        <span>Allowance: {(() => {
                          const activeAllow = (setup.splitFormat && isBackNine) ? (setup.splitFormat.handicapAllowance ?? 100) : (setup.handicapAllowance ?? 100);
                          return teamMode === 'scramble'
                            ? (activeAllow < 0 ? 'Tiered' : `${activeAllow}%`)
                            : `${activeAllow}%`;
                        })()}</span>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Handicap breakdown */}
              <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-[10px] text-gray-500 font-medium uppercase mb-1.5">Handicap Breakdown</p>
                {oneBall ? (
                  <div className="space-y-3">
                    {[
                      { team: 'A' as const, players: sortedPlayers.filter((p) => p.team === 'A') },
                      { team: 'B' as const, players: sortedPlayers.filter((p) => p.team === 'B') },
                    ].filter(({ players: tp }) => tp.length > 0).map(({ team, players: tp }) => {
                      const sorted = [...tp].sort((a, b) => getPlayerRawCourseHandicap(a) - getPlayerRawCourseHandicap(b));
                      const isAltShot = teamMode === 'alternate-shot';
                      const multipliers = isAltShot
                        ? (sorted.length >= 2 ? [0.3, 0.2] : [0.5])
                        : sorted.length === 2 ? [0.35, 0.15]
                        : sorted.length === 3 ? [0.30, 0.20, 0.10]
                        : [0.25, 0.20, 0.15, 0.10];
                      const posLabels = isAltShot ? ['Low (60%×50%)', 'High (40%×50%)'] : ['A (low)', 'B', 'C', 'D (high)'];

                      return (
                        <div key={team}>
                          <p className={`text-[11px] font-bold mb-1 ${team === 'A' ? 'text-blue-700' : 'text-red-700'}`}>
                            {teamNames[team]} — Team Hcap: {getTeamHandicapForFormat(tp)}
                          </p>
                          <div className="space-y-0.5">
                            {sorted.map((p, i) => (
                              <div key={p.id} className="text-[11px] text-gray-600 flex flex-wrap gap-x-2">
                                <span className="font-medium">{p.name.split(' ')[0]}</span>
                                <span>CH: {getPlayerRawCourseHandicap(p).toFixed(1)}</span>
                                <span>× {((multipliers[i] || 0) * 100).toFixed(0)}% ({posLabels[i] || ''})</span>
                                <span>= {(getPlayerRawCourseHandicap(p) * (multipliers[i] || 0)).toFixed(1)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {sortedPlayers.map((player) => {
                      const playerTee = getPlayerTee(player);
                      const is9 = setup.holesPlaying === 'front9' || setup.holesPlaying === 'back9' || !!setup.splitFormat;
                      const ratingType = setup.splitFormat
                        ? (isBackNine ? 'Back' : 'Front')
                        : setup.holesPlaying === 'front9' ? 'Front'
                        : setup.holesPlaying === 'back9' ? 'Back' : 'Total';
                      const nineHoleRating = playerTee?.ratings?.find((r) => r.type === ratingType);
                      const totalRating = playerTee?.ratings?.find((r) => r.type === 'Total');
                      const usedRating = (is9 ? nineHoleRating : totalRating) || totalRating;
                      const usingFallback = is9 && !nineHoleRating;
                      const teamColor = player.team === 'A' ? 'text-blue-700' : player.team === 'B' ? 'text-red-700' : 'text-gray-800';
                      const indexUsed = is9 ? (player.handicapIndex ?? 0) / 2 : player.handicapIndex;

                      return (
                        <div key={player.id} className="text-[11px] text-gray-600 flex flex-wrap gap-x-3">
                          <span className={`font-medium ${teamColor}`}>{player.name.split(' ')[0]}</span>
                          <span>Index: {player.handicapIndex ?? '–'}{is9 ? ` (÷2=${indexUsed?.toFixed(1)})` : ''}</span>
                          {usingFallback && <span className="text-amber-600">Using: 18-hole÷2</span>}
                          <span>Slope: {usedRating?.slopeRating ?? '–'}</span>
                          <span>CR: {usedRating?.courseRating ?? '–'}</span>
                          <span>CH: {getPlayerEffectiveHcap(player).toFixed(1)}</span>
                          <span className="font-bold">Plays: {getPlayingHandicap(player).toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Stroke dots table */}
              <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-2 py-1 text-left text-gray-500 font-medium sticky left-0 bg-gray-50">{oneBall ? 'Team' : 'Player'}</th>
                      {holes.map((h) => (
                        <th key={h.number} className="px-1.5 py-1 text-center text-gray-500 font-medium min-w-[24px]">{h.number}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {oneBall ? (
                      [
                        { team: 'A' as const, players: sortedPlayers.filter((p) => p.team === 'A') },
                        { team: 'B' as const, players: sortedPlayers.filter((p) => p.team === 'B') },
                      ].filter(({ players: tp }) => tp.length > 0).map(({ team, players: tp }) => (
                        <tr key={team} className="border-t border-gray-100">
                          <td className={`px-2 py-1 font-medium whitespace-nowrap sticky left-0 bg-white ${team === 'A' ? 'text-blue-700' : 'text-red-700'}`}>
                            {teamNames[team]} ({getTeamHandicapForFormat(tp)})
                          </td>
                          {holes.map((h) => {
                            const strokes = getTeamStrokesOnHole(tp, h.handicap);
                            return (
                              <td key={h.number} className="px-1.5 py-1 text-center">
                                {strokes > 0 && <span className="text-orange-600">{'●'.repeat(strokes)}</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ) : (
                      sortedPlayers.map((player) => (
                        <tr key={player.id} className="border-t border-gray-100">
                          <td className={`px-2 py-1 font-medium whitespace-nowrap sticky left-0 bg-white ${player.team === 'A' ? 'text-blue-700' : player.team === 'B' ? 'text-red-700' : 'text-gray-700'}`}>{player.name.split(' ')[0]}</td>
                          {holes.map((h) => {
                            const strokes = getPlayerStrokesOnHole(player, h.handicap, h.number);
                            return (
                              <td key={h.number} className="px-1.5 py-1 text-center">
                                {strokes > 0 && <span className="text-orange-600">{'●'.repeat(strokes)}</span>}
                                {strokes < 0 && <span className="text-purple-600">{'○'.repeat(Math.abs(strokes))}</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Hole navigation */}
        <div className="flex items-center justify-between mb-2">
          <button onClick={prevHole} disabled={isFirstHole} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 disabled:opacity-30 text-lg font-bold text-gray-700">
            ‹
          </button>
          <div className="text-center">
            <p className="text-xl font-bold text-gray-900">Hole {currentHole}</p>
            <p className="text-xs text-gray-600">
              Par {currentHoleData?.par} · {currentHoleData?.yardage} yds · Hdcp {currentHoleData?.handicap}
            </p>
          </div>
          <button onClick={nextHole} disabled={isLastHole} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 disabled:opacity-30 text-lg font-bold text-gray-700">
            ›
          </button>
        </div>

        {/* Closest to the pin — pool game, par 3s only. Last team to claim it holds it. */}
        {poolCtx && poolGame && currentHoleData?.par === 3 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-3">
            <p className="text-xs font-semibold text-emerald-800 mb-2">
              📍 Closest to the pin — who&apos;s inside on hole {currentHole}?
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {visiblePlayers.map((player) => {
                const isWinner = poolGame.ctpWinners?.[currentHole] === player.id;
                return (
                  <button
                    key={player.id}
                    onClick={() => setCtpWinner(currentHole, isWinner ? null : player.id)}
                    className={`px-3 h-9 rounded-full text-sm font-medium transition ${
                      isWinner ? 'bg-emerald-600 text-white' : 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    {player.name.split(' ')[0]}
                  </button>
                );
              })}
              <button
                onClick={() => setCtpWinner(currentHole, null)}
                className={`px-3 h-9 rounded-full text-sm font-medium transition ${
                  !poolGame.ctpWinners?.[currentHole] ? 'bg-gray-300 text-gray-700' : 'bg-white border border-gray-300 text-gray-500 hover:bg-gray-100'
                }`}
              >
                None
              </button>
            </div>
            <p className="text-[11px] text-emerald-700 mt-1.5">Adds to your team&apos;s junk points. Editable later on the pool page.</p>
          </div>
        )}

        {/* Score entry */}
        <div className="space-y-3 mb-6">
          {oneBall ? (
            // One ball per team: one score entry per team
            [
              { team: 'A' as const, players: visiblePlayers.filter((p) => p.team === 'A'), color: 'border-l-blue-500', labelColor: 'text-blue-600' },
              { team: 'B' as const, players: visiblePlayers.filter((p) => p.team === 'B'), color: 'border-l-red-500', labelColor: 'text-red-600' },
            ].filter(({ players: tp }) => tp.length > 0).map(({ team, players: tp, color, labelColor }) => {
              const representativeId = tp[0].id;
              const gross = getScore(representativeId, currentHole);
              const strokes = currentHoleData ? getTeamStrokesOnHole(tp, currentHoleData.handicap) : 0;
              const net = gross ? gross - strokes : null;
              const par = currentHoleData?.par || 4;
              const scoreToPar = net !== null ? net - par : null;

              const low = Math.max(1, par - 3);
              const scoreOptions = Array.from({ length: par + 5 - low }, (_, i) => low + i);

              return (
                <div key={team} className={`bg-white rounded-lg shadow p-4 border-l-4 ${color}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-gray-900">
                      <span className={`font-bold ${labelColor}`}>{teamNames[team]}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        ({tp.map((p) => p.name.split(' ')[0]).join(', ')})
                      </span>
                      {strokes > 0 && (
                        <span className="ml-1 text-xs text-orange-600">
                          {'●'.repeat(strokes)}
                        </span>
                      )}
                    </p>
                    {net !== null && (
                      <p className={`text-xs font-medium ${scoreToPar! < 0 ? 'text-red-600' : scoreToPar! > 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                        Net: {net} ({scoreToPar! > 0 ? '+' : ''}{scoreToPar})
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {scoreOptions.map((score) => (
                      <button
                        key={score}
                        onClick={() => {
                          // Set same score for all players on the team
                          tp.forEach((p) => setScore(p.id, currentHole, score));
                        }}
                        className={`w-9 h-9 rounded-full text-sm font-bold transition ${
                          gross === score
                            ? 'bg-green-700 text-white'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            // Normal formats: one score entry per player
            visiblePlayers.map((player) => {
              const gross = getScore(player.id, currentHole);
              const strokes = currentHoleData ? getPlayerStrokesOnHole(player, currentHoleData.handicap, currentHole) : 0;
              const net = gross ? gross - strokes : null;
              const par = currentHoleData?.par || 4;
              const scoreToPar = net !== null ? net - par : null;

              const low = Math.max(1, par - 3);
              const scoreOptions = Array.from({ length: par + 5 - low }, (_, i) => low + i);

              const teamColor = player.team === 'A' ? 'border-l-blue-500'
                : player.team === 'B' ? 'border-l-red-500'
                : 'border-l-transparent';
              const teamLabelColor = player.team === 'A' ? 'text-blue-600'
                : player.team === 'B' ? 'text-red-600'
                : '';
              const teamDisplayName = player.team ? teamNames[player.team] : null;

              return (
                <div key={player.id} className={`bg-white rounded-lg shadow p-4 border-l-4 ${teamColor}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-gray-900">
                      {player.name}
                      {teamDisplayName && <span className={`ml-1.5 text-[10px] font-bold ${teamLabelColor}`}>{teamDisplayName}</span>}
                      {strokes > 0 && (
                        <span className="ml-1 text-xs text-orange-600">
                          {'●'.repeat(strokes)}
                        </span>
                      )}
                    </p>
                    {net !== null && (
                      <p className={`text-xs font-medium ${scoreToPar! < 0 ? 'text-red-600' : scoreToPar! > 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                        Net: {net} ({scoreToPar! > 0 ? '+' : ''}{scoreToPar})
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {scoreOptions.map((score) => (
                      <button
                        key={score}
                        onClick={() => setScore(player.id, currentHole, score)}
                        className={`w-9 h-9 rounded-full text-sm font-bold transition ${
                          gross === score
                            ? 'bg-green-700 text-white'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Scorecard */}
        {(() => {
          const is18 = setup.holesPlaying === '18';
          const frontHoles = holes.filter((h) => h.number <= 9);
          const backHoles = holes.filter((h) => h.number > 9);
          const autoSide: 'front' | 'back' = currentHole <= 9 ? 'front' : 'back';
          const viewSide = is18 ? autoSide : (setup.holesPlaying === 'front9' ? 'front' : 'back');
          const visibleHoles = viewSide === 'front' ? frontHoles : backHoles;
          const otherHoles = viewSide === 'front' ? backHoles : frontHoles;
          const hasOtherSide = is18 && otherHoles.length > 0;

          const teamAPlayers = sortedPlayers.filter((p) => p.team === 'A');
          const teamBPlayers = sortedPlayers.filter((p) => p.team === 'B');
          const noTeamPlayers = sortedPlayers.filter((p) => !p.team);
          const hasTeams = teamAPlayers.length > 0 && teamBPlayers.length > 0;

          const formatId = setup.formatId;
          const isStablefordFormat = formatId === 'stableford';
          const tournamentRound = tournamentCtx ? loadTournament(tournamentCtx.tournamentId)?.rounds.find((r) => r.id === tournamentCtx.roundId) : null;
          const isMatchPlayScoring = tournamentRound ? tournamentRound.scoringMethod === 'match-play' : (formatId === 'match-play' || formatId === 'skins' || formatId === 'nassau');
          const isScramble = teamMode === 'scramble';
          const isAlternateShot = teamMode === 'alternate-shot';

          function getTeamNet(teamPlayers: Player[], hole: { number: number; par: number; handicap: number }): number | null {
            // Determine active team mode for this hole (split-format aware)
            const holeTeamMode = (setup!.splitFormat && hole.number > 9) ? setup!.splitFormat.teamMode : baseTeamMode;
            const holeIsScramble = holeTeamMode === 'scramble';
            const holeIsAlternateShot = holeTeamMode === 'alternate-shot';

            if (holeIsScramble) {
              const firstWithScore = teamPlayers.find((p) => getScore(p.id, hole.number) !== null);
              if (!firstWithScore) return null;
              const gross = getScore(firstWithScore.id, hole.number)!;
              const strokes = getTeamStrokesOnHole(teamPlayers, hole.handicap);
              return gross - strokes;
            }
            if (holeIsAlternateShot) {
              const firstWithScore = teamPlayers.find((p) => getScore(p.id, hole.number) !== null);
              if (!firstWithScore) return null;
              const gross = getScore(firstWithScore.id, hole.number)!;
              const strokes = getPlayerStrokesOnHole(firstWithScore, hole.handicap, hole.number);
              return gross - strokes;
            }
            if (holeTeamMode === 'combined') {
              let total = 0;
              let anyScored = false;
              for (const p of teamPlayers) {
                const gross = getScore(p.id, hole.number);
                if (gross === null) continue;
                anyScored = true;
                const strokes = getPlayerStrokesOnHole(p, hole.handicap, hole.number);
                total += gross - strokes;
              }
              return anyScored ? total : null;
            }
            if (holeTeamMode === 'two-best-balls') {
              const activeSettings = (setup!.splitFormat && hole.number > 9)
                ? setup!.splitFormat.formatSettings
                : setup!.formatSettings;
              const variant = (activeSettings?.ballSelection as string) || '1-net-1-gross';
              const playerScores: { id: string; gross: number; net: number }[] = [];
              for (const p of teamPlayers) {
                const gross = getScore(p.id, hole.number);
                if (gross === null) continue;
                const strokes = getPlayerStrokesOnHole(p, hole.handicap, hole.number);
                playerScores.push({ id: p.id, gross, net: gross - strokes });
              }
              if (playerScores.length < 2) return null;

              if (variant === '2-best-net') {
                const sorted = [...playerScores].sort((a, b) => a.net - b.net);
                return sorted[0].net + sorted[1].net;
              }
              if (variant === '2-best-gross') {
                const sorted = [...playerScores].sort((a, b) => a.gross - b.gross);
                return sorted[0].gross + sorted[1].gross;
              }
              // 1-net-1-gross: best net from one player + best gross from a different player
              let bestTotal = Infinity;
              for (let i = 0; i < playerScores.length; i++) {
                for (let j = 0; j < playerScores.length; j++) {
                  if (i === j) continue;
                  const total = playerScores[i].net + playerScores[j].gross;
                  if (total < bestTotal) bestTotal = total;
                }
              }
              return bestTotal;
            }
            // Default: best-ball (best net)
            let best: number | null = null;
            for (const p of teamPlayers) {
              const gross = getScore(p.id, hole.number);
              if (gross === null) continue;
              const strokes = getPlayerStrokesOnHole(p, hole.handicap, hole.number);
              const net = gross - strokes;
              if (best === null || net < best) best = net;
            }
            return best;
          }

          function getPlayerGrossForHoles(playerId: string, holeSet: typeof holes): number {
            return holeSet.reduce((sum, h) => sum + (getScore(playerId, h.number) ?? 0), 0);
          }

          const stablefordScale = resolveStablefordScale(setup.formatSettings);
          function stablefordPts(net: number, par: number): number {
            const diff = net - par;
            if (diff <= -3) return stablefordScale.albatrossOrBetter;
            if (diff === -2) return stablefordScale.eagle;
            if (diff === -1) return stablefordScale.birdie;
            if (diff === 0) return stablefordScale.par;
            if (diff === 1) return stablefordScale.bogey;
            return stablefordScale.doubleOrWorse;
          }

          function getTeamStableford(teamPlayers: Player[], h: { number: number; par: number; handicap: number }): number | null {
            if (teamMode === 'combined') {
              let total = 0;
              let anyScored = false;
              for (const p of teamPlayers) {
                const gross = getScore(p.id, h.number);
                if (gross === null) continue;
                anyScored = true;
                const strokes = getPlayerStrokesOnHole(p, h.handicap, h.number);
                total += stablefordPts(gross - strokes, h.par);
              }
              return anyScored ? total : null;
            }
            const net = getTeamNet(teamPlayers, h);
            if (net === null) return null;
            return stablefordPts(net, h.par);
          }

          function getMatchStatus(forTeam: 'A' | 'B') {
            if (isMatchPlayScoring) {
              let teamAWins = 0;
              let teamBWins = 0;
              for (const h of holes) {
                if (isStablefordFormat) {
                  const stbA = getTeamStableford(teamAPlayers, h);
                  const stbB = getTeamStableford(teamBPlayers, h);
                  if (stbA === null || stbB === null) continue;
                  if (stbA > stbB) teamAWins++;
                  else if (stbB > stbA) teamBWins++;
                } else {
                  const netA = getTeamNet(teamAPlayers, h);
                  const netB = getTeamNet(teamBPlayers, h);
                  if (netA === null || netB === null) continue;
                  if (netA < netB) teamAWins++;
                  else if (netB < netA) teamBWins++;
                }
              }
              const diff = teamAWins - teamBWins;
              if (diff === 0) return { label: 'AS', color: 'text-gray-600 bg-gray-200' };
              if (forTeam === 'A') {
                return diff > 0
                  ? { label: `${diff} UP`, color: 'text-blue-800 bg-blue-100' }
                  : { label: `${Math.abs(diff)} DN`, color: 'text-blue-800 bg-blue-100' };
              }
              return diff < 0
                ? { label: `${Math.abs(diff)} UP`, color: 'text-red-800 bg-red-100' }
                : { label: `${diff} DN`, color: 'text-red-800 bg-red-100' };
            } else {
              if (isStablefordFormat) {
                const totalA = holes.reduce((s, h) => s + (getTeamStableford(teamAPlayers, h) ?? 0), 0);
                const totalB = holes.reduce((s, h) => s + (getTeamStableford(teamBPlayers, h) ?? 0), 0);
                const scoredA = holes.some((h) => getTeamStableford(teamAPlayers, h) !== null);
                const scoredB = holes.some((h) => getTeamStableford(teamBPlayers, h) !== null);
                if (!scoredA || !scoredB) return { label: '–', color: 'text-gray-400 bg-gray-100' };
                const diff = totalA - totalB;
                if (diff === 0) return { label: 'T', color: 'text-gray-600 bg-gray-200' };
                if (forTeam === 'A') {
                  return diff > 0
                    ? { label: `${diff} ahead`, color: 'text-blue-800 bg-blue-100' }
                    : { label: `${Math.abs(diff)} back`, color: 'text-blue-800 bg-blue-100' };
                }
                return diff < 0
                  ? { label: `${Math.abs(diff)} ahead`, color: 'text-red-800 bg-red-100' }
                  : { label: `${Math.abs(diff)} back`, color: 'text-red-800 bg-red-100' };
              }
              const totalA = holes.reduce((s, h) => s + (getTeamNet(teamAPlayers, h) ?? 0), 0);
              const totalB = holes.reduce((s, h) => s + (getTeamNet(teamBPlayers, h) ?? 0), 0);
              const scoredA = holes.some((h) => getTeamNet(teamAPlayers, h) !== null);
              const scoredB = holes.some((h) => getTeamNet(teamBPlayers, h) !== null);
              if (!scoredA || !scoredB) return { label: '–', color: 'text-gray-400 bg-gray-100' };
              const diff = totalA - totalB;
              if (diff === 0) return { label: 'T', color: 'text-gray-600 bg-gray-200' };
              if (forTeam === 'A') {
                return diff < 0
                  ? { label: `${Math.abs(diff)} ahead`, color: 'text-blue-800 bg-blue-100' }
                  : { label: `${diff} back`, color: 'text-blue-800 bg-blue-100' };
              }
              return diff > 0
                ? { label: `${diff} ahead`, color: 'text-red-800 bg-red-100' }
                : { label: `${Math.abs(diff)} back`, color: 'text-red-800 bg-red-100' };
            }
          }

          return (
            <div className="bg-white rounded-lg shadow">
              {/* Side toggle for 18-hole rounds */}
              {is18 && (
                <div className="flex border-b border-gray-200">
                  <button
                    onClick={() => setCurrentHole(frontHoles[0]?.number || 1)}
                    className={`flex-1 text-xs font-medium py-1.5 text-center transition ${viewSide === 'front' ? 'text-green-700 border-b-2 border-green-700' : 'text-gray-400'}`}
                  >
                    Out (1–9)
                  </button>
                  <button
                    onClick={() => setCurrentHole(backHoles[0]?.number || 10)}
                    className={`flex-1 text-xs font-medium py-1.5 text-center transition ${viewSide === 'back' ? 'text-green-700 border-b-2 border-green-700' : 'text-gray-400'}`}
                  >
                    In (10–18)
                  </button>
                </div>
              )}

              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-1.5 text-left text-gray-500 font-medium">#</th>
                    {visibleHoles.map((h) => (
                      <th key={h.number} className={`w-[28px] py-1.5 text-center font-medium ${h.number === currentHole ? 'text-green-700 bg-yellow-50' : 'text-gray-500'}`}>{h.number}</th>
                    ))}
                    {hasOtherSide && <th className="px-1.5 py-1.5 text-center text-gray-500 font-medium border-l border-gray-200">{viewSide === 'front' ? 'In' : 'Out'}</th>}
                    <th className="px-1.5 py-1.5 text-center text-gray-700 font-bold border-l border-gray-200">Tot</th>
                  </tr>
                  <tr>
                    <td className="px-2 py-0.5 text-left text-gray-300 font-medium">Yds</td>
                    {visibleHoles.map((h) => (
                      <td key={h.number} className={`py-0.5 text-center text-gray-300 ${h.number === currentHole ? 'bg-yellow-50' : ''}`}>{h.yardage || ''}</td>
                    ))}
                    {hasOtherSide && <td className="px-1.5 py-0.5 text-center text-gray-300 border-l border-gray-200">{otherHoles.reduce((s, h) => s + (h.yardage || 0), 0)}</td>}
                    <td className="px-1.5 py-0.5 text-center text-gray-400 border-l border-gray-200">{holes.reduce((s, h) => s + (h.yardage || 0), 0)}</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-0.5 text-left text-gray-400 font-medium">Par</td>
                    {visibleHoles.map((h) => (
                      <td key={h.number} className={`py-0.5 text-center text-gray-400 ${h.number === currentHole ? 'bg-yellow-50' : ''}`}>{h.par}</td>
                    ))}
                    {hasOtherSide && <td className="px-1.5 py-0.5 text-center text-gray-400 border-l border-gray-200">{otherHoles.reduce((s, h) => s + h.par, 0)}</td>}
                    <td className="px-1.5 py-0.5 text-center text-gray-500 font-medium border-l border-gray-200">{holes.reduce((s, h) => s + h.par, 0)}</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="px-2 py-0.5 text-left text-gray-300 font-medium">Hcp</td>
                    {visibleHoles.map((h) => (
                      <td key={h.number} className={`py-0.5 text-center text-gray-300 ${h.number === currentHole ? 'bg-yellow-50' : ''}`}>{h.handicap}</td>
                    ))}
                    {hasOtherSide && <td className="px-1.5 py-0.5 text-center text-gray-300 border-l border-gray-200"></td>}
                    <td className="px-1.5 py-0.5 text-center border-l border-gray-200"></td>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlayers.map((player, idx) => {
                    const teamNameColor = player.team === 'A' ? 'text-blue-700'
                      : player.team === 'B' ? 'text-red-700' : 'text-gray-800';
                    const prevPlayer = idx > 0 ? visiblePlayers[idx - 1] : null;
                    const showTeamLabel = player.team && (!prevPlayer || prevPlayer.team !== player.team);
                    const totalGross = getTotalScore(player.id);
                    const otherGross = hasOtherSide ? getPlayerGrossForHoles(player.id, otherHoles) : 0;
                    const scoredHoles = holes.filter((h) => getScore(player.id, h.number) !== null);
                    const scoredPar = scoredHoles.reduce((s, h) => s + h.par, 0);
                    const totalStrokes = (isScramble || isAlternateShot)
                      ? scoredHoles.reduce((s, h) => s + getTeamStrokesOnHole(player.team === 'A' ? teamAPlayers : teamBPlayers, h.handicap), 0)
                      : scoredHoles.reduce((s, h) => s + getPlayerStrokesOnHole(player, h.handicap, h.number), 0);
                    const netTotal = totalGross - totalStrokes;
                    const diff = scoredHoles.length > 0 ? netTotal - scoredPar : 0;
                    const playerStablefordTotal = isStablefordFormat
                      ? scoredHoles.reduce((s, h) => {
                          const gross = getScore(player.id, h.number)!;
                          const strokes = (isScramble || isAlternateShot)
                            ? getTeamStrokesOnHole(player.team === 'A' ? teamAPlayers : teamBPlayers, h.handicap)
                            : getPlayerStrokesOnHole(player, h.handicap, h.number);
                          return s + stablefordPts(gross - strokes, h.par);
                        }, 0)
                      : 0;

                    return (
                      <tr key={player.id} className={showTeamLabel && idx > 0 ? 'border-t-2 border-gray-300' : 'border-t border-gray-100'}>
                        <td className={`px-2 py-1.5 font-medium whitespace-nowrap ${teamNameColor}`}>
                          {player.name.split(' ')[0]}
                          {showTeamLabel && <span className="ml-1 text-[9px] opacity-50 font-normal">{teamNames[player.team!]}</span>}
                        </td>
                        {visibleHoles.map((h) => {
                          const score = getScore(player.id, h.number);
                          const strokes = (isScramble || isAlternateShot)
                            ? getTeamStrokesOnHole(player.team === 'A' ? teamAPlayers : teamBPlayers, h.handicap)
                            : getPlayerStrokesOnHole(player, h.handicap, h.number);
                          const netScore = score !== null ? score - strokes : null;
                          const netToPar = netScore !== null ? netScore - h.par : null;
                          const isCurrent = h.number === currentHole;
                          const strokeBg = strokes > 0 ? 'bg-green-100' : '';
                          const currentBg = isCurrent ? 'bg-yellow-50' : '';
                          const bgClass = strokes > 0 ? strokeBg : currentBg;
                          const colorClass = score === null ? 'text-gray-300'
                            : score <= h.par - 2 ? 'text-yellow-600 font-bold'
                            : score === h.par - 1 ? 'text-red-600 font-bold'
                            : score === h.par ? 'text-gray-700'
                            : score === h.par + 1 ? 'text-blue-600'
                            : 'text-blue-800 font-bold';

                          // Net score decorations: circles for under par, squares for over par
                          let decoration = '';
                          if (netToPar !== null) {
                            if (netToPar <= -2) decoration = 'ring-2 ring-offset-1 ring-yellow-500 rounded-full';
                            else if (netToPar === -1) decoration = 'ring-1 ring-offset-1 ring-red-500 rounded-full';
                            else if (netToPar === 1) decoration = 'ring-1 ring-offset-1 ring-blue-400 rounded-sm';
                            else if (netToPar >= 2) decoration = 'ring-2 ring-offset-1 ring-blue-500 rounded-sm';
                          }

                          return (
                            <td key={h.number} className={`py-1.5 text-center ${colorClass} ${bgClass}`}>
                              {score !== null ? (
                                <span className={`inline-flex items-center justify-center w-5 h-5 text-[11px] ${decoration}`}>{score}</span>
                              ) : '–'}
                            </td>
                          );
                        })}
                        {hasOtherSide && (
                          <td className="px-1.5 py-1.5 text-center text-gray-500 font-medium border-l border-gray-200">
                            {otherGross || '–'}
                          </td>
                        )}
                        <td className="px-1.5 py-1.5 text-center font-bold text-gray-900 border-l border-gray-200">
                          {totalGross || '–'}
                          {scoredHoles.length > 0 && isStablefordFormat ? (
                            <span className="ml-0.5 text-[9px] text-green-600">{playerStablefordTotal}pts</span>
                          ) : scoredHoles.length > 0 ? (
                            <span className={`ml-0.5 text-[9px] ${diff > 0 ? 'text-blue-500' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              {diff > 0 ? `+${diff}` : diff === 0 ? 'E' : diff}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Team net/stableford rows */}
                  {hasTeams && [
                    { players: teamAPlayers, label: teamNames.A, color: 'text-blue-700', team: 'A' as const },
                    { players: teamBPlayers, label: teamNames.B, color: 'text-red-700', team: 'B' as const },
                  ].map(({ players: tp, label, color, team }) => {
                    const getHoleValue = isStablefordFormat ? (h: typeof holes[0]) => getTeamStableford(tp, h) : (h: typeof holes[0]) => getTeamNet(tp, h);
                    const visTotal = visibleHoles.reduce((s, h) => s + (getHoleValue(h) ?? 0), 0);
                    const otherTotal = hasOtherSide ? otherHoles.reduce((s, h) => s + (getHoleValue(h) ?? 0), 0) : 0;
                    const totalValue = holes.reduce((s, h) => s + (getHoleValue(h) ?? 0), 0);
                    const scoredAny = holes.some((h) => getHoleValue(h) !== null);
                    const matchStatus = getMatchStatus(team);

                    return (
                      <tr key={team} className="border-t border-gray-200 bg-gray-50">
                        <td className={`px-2 py-1 font-bold text-[10px] whitespace-nowrap ${color}`}>{label}{isStablefordFormat ? ' pts' : ''}</td>
                        {visibleHoles.map((h) => {
                          const val = getHoleValue(h);
                          const isCurrent = h.number === currentHole;
                          return (
                            <td key={h.number} className={`py-1 text-center font-bold ${color} ${isCurrent ? 'bg-yellow-50' : ''}`}>
                              {val ?? '–'}
                            </td>
                          );
                        })}
                        {hasOtherSide && (
                          <td className={`px-1.5 py-1 text-center font-bold border-l border-gray-200 ${color}`}>
                            {otherTotal || '–'}
                          </td>
                        )}
                        <td className="px-1.5 py-1 text-center border-l border-gray-200">
                          <span className={`font-bold ${color}`}>{scoredAny ? totalValue : '–'}</span>
                          {scoredAny && (
                            <span className={`ml-1 text-[9px] font-bold px-1 py-0.5 rounded ${matchStatus.color}`}>
                              {matchStatus.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* Hole dots */}
        <div className="mt-4 flex flex-wrap gap-1 justify-center">
          {holes.map((hole) => {
            const isOneBall = oneBall;
            const allScored = isOneBall
              ? [visiblePlayers.filter((p) => p.team === 'A'), visiblePlayers.filter((p) => p.team === 'B')]
                  .filter((tp) => tp.length > 0)
                  .every((tp) => tp.some((p) => getScore(p.id, hole.number) !== null))
              : visiblePlayers.every((p) => getScore(p.id, hole.number) !== null);
            const isCurrent = hole.number === currentHole;
            return (
              <button
                key={hole.number}
                onClick={() => setCurrentHole(hole.number)}
                className={`w-7 h-7 rounded-full text-xs font-medium ${
                  isCurrent
                    ? 'bg-green-700 text-white'
                    : allScored
                    ? 'bg-green-200 text-green-800'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {hole.number}
              </button>
            );
          })}
        </div>

        {/* Finish Game */}
        <button
          onClick={finishGame}
          className="mt-6 w-full rounded-md bg-green-900 px-4 py-3 text-white font-bold hover:bg-green-950"
        >
          Finish Game
        </button>
      </main>
    </div>
  );

  function getTeamTotalNet(teamPlayers: Player[]): number {
    const isScramble = teamMode === 'scramble';
    if (isScramble) {
      let total = 0;
      for (const hole of holes) {
        const firstWithScore = teamPlayers.find((p) => getScore(p.id, hole.number) !== null);
        if (!firstWithScore) continue;
        const gross = getScore(firstWithScore.id, hole.number)!;
        const strokes = getTeamStrokesOnHole(teamPlayers, hole.handicap);
        total += gross - strokes;
      }
      return total;
    }
    // For non-scramble team formats, sum each player's net
    let total = 0;
    for (const player of teamPlayers) {
      total += getTotalNet(player.id);
    }
    return total;
  }

  function computeMatchPlayResult(
    teamAPlayers: Player[],
    teamBPlayers: Player[],
    holeSet: typeof holes,
    pointsWin: number,
    pointsTie: number,
    pointsLoss: number
  ): { winningTeamId: string | null; pointsTeamA: number; pointsTeamB: number; summary: string } {
    let teamAHolesWon = 0;
    let teamBHolesWon = 0;
    let holesTied = 0;
    const isStableford = setup!.formatId === 'stableford';

    for (const h of holeSet) {
      if (isStableford) {
        const stbA = getTeamStablefordForFinish(teamAPlayers, h);
        const stbB = getTeamStablefordForFinish(teamBPlayers, h);
        if (stbA === null || stbB === null) continue;
        if (stbA > stbB) teamAHolesWon++;
        else if (stbB > stbA) teamBHolesWon++;
        else holesTied++;
      } else {
        const netA = getTeamNetForFinish(teamAPlayers, h);
        const netB = getTeamNetForFinish(teamBPlayers, h);
        if (netA === null || netB === null) continue;
        if (netA < netB) teamAHolesWon++;
        else if (netB < netA) teamBHolesWon++;
        else holesTied++;
      }
    }

    const pointsTeamA = teamAHolesWon * pointsWin + holesTied * pointsTie;
    const pointsTeamB = teamBHolesWon * pointsWin + holesTied * pointsTie;

    let winningTeamId: string | null = null;
    if (pointsTeamA > pointsTeamB) winningTeamId = 'team-a';
    else if (pointsTeamB > pointsTeamA) winningTeamId = 'team-b';

    const tieNote = holesTied > 0 ? ` · ${holesTied} tied` : '';
    return {
      winningTeamId,
      pointsTeamA,
      pointsTeamB,
      summary: `${pointsTeamA}–${pointsTeamB} (${teamAHolesWon}W-${teamBHolesWon}W${tieNote})`,
    };
  }

  function stablefordPtsForFinish(net: number, par: number): number {
    const scale = resolveStablefordScale(setup!.formatSettings);
    const diff = net - par;
    if (diff <= -3) return scale.albatrossOrBetter;
    if (diff === -2) return scale.eagle;
    if (diff === -1) return scale.birdie;
    if (diff === 0) return scale.par;
    if (diff === 1) return scale.bogey;
    return scale.doubleOrWorse;
  }

  function getTeamStablefordForFinish(teamPlayers: Player[], hole: { number: number; par: number; handicap: number }): number | null {
    const holeTeamMode = (setup!.splitFormat && hole.number > 9) ? setup!.splitFormat.teamMode : baseTeamMode;
    if (holeTeamMode === 'combined') {
      let total = 0;
      let anyScored = false;
      for (const p of teamPlayers) {
        const gross = getScore(p.id, hole.number);
        if (gross === null) continue;
        anyScored = true;
        const strokes = getPlayerStrokesOnHole(p, hole.handicap, hole.number);
        total += stablefordPtsForFinish(gross - strokes, hole.par);
      }
      return anyScored ? total : null;
    }
    const net = getTeamNetForFinish(teamPlayers, hole);
    if (net === null) return null;
    return stablefordPtsForFinish(net, hole.par);
  }

  function computeStrokePlayResult(
    teamAPlayers: Player[],
    teamBPlayers: Player[],
    holeSet: typeof holes,
    pointsWin: number,
    pointsTie: number,
    pointsLoss: number
  ): { winningTeamId: string | null; pointsTeamA: number; pointsTeamB: number; summary: string } {
    const isStableford = setup!.formatId === 'stableford';

    if (isStableford) {
      const teamAPts = holeSet.reduce((s, h) => s + (getTeamStablefordForFinish(teamAPlayers, h) ?? 0), 0);
      const teamBPts = holeSet.reduce((s, h) => s + (getTeamStablefordForFinish(teamBPlayers, h) ?? 0), 0);

      let winningTeamId: string | null = null;
      if (teamAPts > teamBPts) winningTeamId = 'team-a';
      else if (teamBPts > teamAPts) winningTeamId = 'team-b';

      const pointsTeamA = winningTeamId === 'team-a' ? pointsWin
        : winningTeamId === null ? pointsTie : pointsLoss;
      const pointsTeamB = winningTeamId === 'team-b' ? pointsWin
        : winningTeamId === null ? pointsTie : pointsLoss;

      return {
        winningTeamId,
        pointsTeamA,
        pointsTeamB,
        summary: `${teamAPts} — ${teamBPts} (stableford pts)`,
      };
    }

    const teamANet = holeSet.reduce((s, h) => s + (getTeamNetForFinish(teamAPlayers, h) ?? 0), 0);
    const teamBNet = holeSet.reduce((s, h) => s + (getTeamNetForFinish(teamBPlayers, h) ?? 0), 0);

    let winningTeamId: string | null = null;
    if (teamANet < teamBNet) winningTeamId = 'team-a';
    else if (teamBNet < teamANet) winningTeamId = 'team-b';

    const pointsTeamA = winningTeamId === 'team-a' ? pointsWin
      : winningTeamId === null ? pointsTie : pointsLoss;
    const pointsTeamB = winningTeamId === 'team-b' ? pointsWin
      : winningTeamId === null ? pointsTie : pointsLoss;

    return {
      winningTeamId,
      pointsTeamA,
      pointsTeamB,
      summary: `${teamANet} — ${teamBNet} (net)`,
    };
  }

  // Inline reference to getTeamNet for finishGame scope (uses the closure from the scorecard IIFE)
  function getTeamNetForFinish(teamPlayers: Player[], hole: { number: number; par: number; handicap: number }): number | null {
    const holeTeamMode = (setup!.splitFormat && hole.number > 9) ? setup!.splitFormat.teamMode : baseTeamMode;
    if (holeTeamMode === 'scramble') {
      const firstWithScore = teamPlayers.find((p) => getScore(p.id, hole.number) !== null);
      if (!firstWithScore) return null;
      const gross = getScore(firstWithScore.id, hole.number)!;
      const strokes = getTeamStrokesOnHole(teamPlayers, hole.handicap);
      return gross - strokes;
    }
    if (holeTeamMode === 'alternate-shot') {
      const firstWithScore = teamPlayers.find((p) => getScore(p.id, hole.number) !== null);
      if (!firstWithScore) return null;
      const gross = getScore(firstWithScore.id, hole.number)!;
      const strokes = getPlayerStrokesOnHole(firstWithScore, hole.handicap, hole.number);
      return gross - strokes;
    }
    if (holeTeamMode === 'combined') {
      let total = 0;
      let anyScored = false;
      for (const p of teamPlayers) {
        const gross = getScore(p.id, hole.number);
        if (gross === null) continue;
        anyScored = true;
        const strokes = getPlayerStrokesOnHole(p, hole.handicap, hole.number);
        total += gross - strokes;
      }
      return anyScored ? total : null;
    }
    if (holeTeamMode === 'two-best-balls') {
      const activeSettings = (setup!.splitFormat && hole.number > 9)
        ? setup!.splitFormat.formatSettings
        : setup!.formatSettings;
      const variant = (activeSettings?.ballSelection as string) || '1-net-1-gross';
      const playerScores: { id: string; gross: number; net: number }[] = [];
      for (const p of teamPlayers) {
        const gross = getScore(p.id, hole.number);
        if (gross === null) continue;
        const strokes = getPlayerStrokesOnHole(p, hole.handicap, hole.number);
        playerScores.push({ id: p.id, gross, net: gross - strokes });
      }
      if (playerScores.length < 2) return null;
      if (variant === '2-best-net') {
        const sorted = [...playerScores].sort((a, b) => a.net - b.net);
        return sorted[0].net + sorted[1].net;
      }
      if (variant === '2-best-gross') {
        const sorted = [...playerScores].sort((a, b) => a.gross - b.gross);
        return sorted[0].gross + sorted[1].gross;
      }
      let bestTotal = Infinity;
      for (let i = 0; i < playerScores.length; i++) {
        for (let j = 0; j < playerScores.length; j++) {
          if (i === j) continue;
          const total = playerScores[i].net + playerScores[j].gross;
          if (total < bestTotal) bestTotal = total;
        }
      }
      return bestTotal;
    }
    let best: number | null = null;
    for (const p of teamPlayers) {
      const gross = getScore(p.id, hole.number);
      if (gross === null) continue;
      const strokes = getPlayerStrokesOnHole(p, hole.handicap, hole.number);
      const net = gross - strokes;
      if (best === null || net < best) best = net;
    }
    return best;
  }

  function setCtpWinner(hole: number, playerId: string | null) {
    if (!poolGame) return;
    // Read the latest persisted pool game so we don't clobber another foursome's CTP picks.
    const latest = loadPoolGame(poolGame.id) || poolGame;
    const updated: PoolGame = {
      ...latest,
      ctpWinners: { ...latest.ctpWinners, [hole]: playerId },
    };
    savePoolGame(updated);
    setPoolGame(updated);
  }

  async function finishGame() {
    if (!confirm('Finish this game and lock scores? This cannot be undone.')) return;

    // Pool money game: just persist this foursome's scores and return to the hub.
    // Pool standings/payouts are computed on the leaderboard from all foursomes.
    if (poolCtx) {
      saveGameScores(poolCtx.matchupId, scores);
      sessionStorage.removeItem('game_setup');
      sessionStorage.removeItem('game_pool_context');
      router.push(`/pool/${poolCtx.poolGameId}`);
      return;
    }

    if (tournamentCtx) {
      // Side game mode: just save scores and navigate back
      const ctxRaw = sessionStorage.getItem('game_tournament_context');
      const ctxParsed = ctxRaw ? JSON.parse(ctxRaw) : null;
      if (ctxParsed?.sideGameMode) {
        saveGameScores(tournamentCtx.matchupId, scores);
        sessionStorage.removeItem('game_setup');
        sessionStorage.removeItem('game_tournament_context');
        router.push(`/tournament/${tournamentCtx.tournamentId}/side-games`);
        return;
      }

      const tournament = loadTournament(tournamentCtx.tournamentId);
      if (tournament) {
        const round = tournament.rounds.find((r) => r.id === tournamentCtx.roundId);
        if (round) {
          const matchup = round.matchups.find((m) => m.id === tournamentCtx.matchupId);
          if (matchup) {
            // When scoring only one team, use all players from the matchup for result computation
            const allPlayers = tournament.players.filter((p) => matchup.playerIds.includes(p.id)).map((p) => ({
              ...p,
              team: (matchup.teamAPlayerIds.includes(p.id) ? 'A' : 'B') as 'A' | 'B',
            }));
            const teamAPlayers = allPlayers.filter((p) => matchup.teamAPlayerIds.includes(p.id));
            const teamBPlayers = allPlayers.filter((p) => matchup.teamBPlayerIds.includes(p.id));

            // Fetch latest scores from server to ensure we have all players' data
            const serverScores = await fetchGameScores(tournamentCtx.matchupId);
            const allScores = setup!.scoringTeam
              ? mergeScores(scores, Array.isArray(serverScores) ? serverScores : [])
              : scores;

            // Validate all players have scores for all holes before finalizing
            const requiredHoleNumbers = holes.map((h) => h.number);
            const missingPlayers: string[] = [];
            for (const player of allPlayers) {
              const playerScores = allScores.filter((s: GameScore) => s.playerId === player.id);
              const scoredHoles = new Set(playerScores.map((s: GameScore) => s.hole));
              const missing = requiredHoleNumbers.filter((h) => !scoredHoles.has(h));
              if (missing.length > 0) {
                missingPlayers.push(`${player.name.split(' ')[0]} (holes ${missing.join(', ')})`);
              }
            }
            if (missingPlayers.length > 0) {
              alert(`Cannot finish — missing scores:\n${missingPlayers.join('\n')}`);
              return;
            }

            // Save complete scores
            saveGameScores(tournamentCtx.matchupId, allScores);

            let pointsTeamA = 0;
            let pointsTeamB = 0;
            let winningTeamId: string | null = null;
            let summary = '';

            if (setup!.splitFormat) {
              // Split format: compute front 9 and back 9 separately
              const frontHoles = holes.filter((h) => h.number <= 9);
              const backHoles = holes.filter((h) => h.number > 9);

              const frontIsMatch = round.scoringMethod === 'match-play';
              const backIsMatch = setup!.splitFormat.scoringMethod === 'match-play';

              const frontResult = frontIsMatch
                ? computeMatchPlayResult(teamAPlayers, teamBPlayers, frontHoles, round.pointsForWin, round.pointsForTie, round.pointsForLoss)
                : computeStrokePlayResult(teamAPlayers, teamBPlayers, frontHoles, round.pointsForWin, round.pointsForTie, round.pointsForLoss);

              // Back 9: if individual with pairings, compute each 1v1 separately
              const backPtsWin = setup!.splitFormat.pointsForWin ?? round.pointsForWin;
              const backPtsTie = setup!.splitFormat.pointsForTie ?? round.pointsForTie;
              const backPtsLoss = setup!.splitFormat.pointsForLoss ?? round.pointsForLoss;

              let backPointsA = 0;
              let backPointsB = 0;
              const backSummaries: string[] = [];

              if (setup!.splitFormat.teamMode === 'individual' && setup!.splitFormat.pairings && setup!.splitFormat.pairings.length > 0) {
                for (const pairing of setup!.splitFormat.pairings) {
                  const pA = allPlayers.find((p) => p.id === pairing.playerIds[0] && matchup.teamAPlayerIds.includes(p.id))
                    || allPlayers.find((p) => p.id === pairing.playerIds[1] && matchup.teamAPlayerIds.includes(p.id));
                  const pB = allPlayers.find((p) => p.id === pairing.playerIds[0] && matchup.teamBPlayerIds.includes(p.id))
                    || allPlayers.find((p) => p.id === pairing.playerIds[1] && matchup.teamBPlayerIds.includes(p.id));
                  if (!pA || !pB) continue;

                  const pairResult = backIsMatch
                    ? computeMatchPlayResult([pA], [pB], backHoles, backPtsWin, backPtsTie, backPtsLoss)
                    : computeStrokePlayResult([pA], [pB], backHoles, backPtsWin, backPtsTie, backPtsLoss);

                  backPointsA += pairResult.pointsTeamA;
                  backPointsB += pairResult.pointsTeamB;
                  const winnerName = pairResult.winningTeamId === 'team-a' ? pA.name.split(' ')[0]
                    : pairResult.winningTeamId === 'team-b' ? pB.name.split(' ')[0] : 'Tied';
                  backSummaries.push(`${pA.name.split(' ')[0]}v${pB.name.split(' ')[0]}: ${winnerName}`);
                }
              } else {
                const backResult = backIsMatch
                  ? computeMatchPlayResult(teamAPlayers, teamBPlayers, backHoles, backPtsWin, backPtsTie, backPtsLoss)
                  : computeStrokePlayResult(teamAPlayers, teamBPlayers, backHoles, backPtsWin, backPtsTie, backPtsLoss);
                backPointsA = backResult.pointsTeamA;
                backPointsB = backResult.pointsTeamB;
                backSummaries.push(backResult.summary);
              }

              pointsTeamA = frontResult.pointsTeamA + backPointsA;
              pointsTeamB = frontResult.pointsTeamB + backPointsB;
              winningTeamId = pointsTeamA > pointsTeamB ? 'team-a'
                : pointsTeamB > pointsTeamA ? 'team-b' : null;
              summary = `Front: ${frontResult.summary} · Back: ${backSummaries.join(', ')}`;
            } else if (round.scoringMethod === 'match-play') {
              const result = computeMatchPlayResult(teamAPlayers, teamBPlayers, holes, round.pointsForWin, round.pointsForTie, round.pointsForLoss);
              pointsTeamA = result.pointsTeamA;
              pointsTeamB = result.pointsTeamB;
              winningTeamId = result.winningTeamId;
              summary = result.summary;
            } else {
              const result = computeStrokePlayResult(teamAPlayers, teamBPlayers, holes, round.pointsForWin, round.pointsForTie, round.pointsForLoss);
              pointsTeamA = result.pointsTeamA;
              pointsTeamB = result.pointsTeamB;
              winningTeamId = result.winningTeamId;
              summary = result.summary;
            }

            // Apply margin-based tournament points for stableford stroke-play
            if (round.tournamentPointMode === 'margin-based' && round.formatId === 'stableford' && round.scoringMethod === 'stroke-play') {
              const baseline = round.marginBaseline ?? 9;
              const divisor = round.marginDivisor ?? (round.teamMode === 'combined' ? 4 : 2);
              const match = summary.match(/^(\d+)\s*[—–]\s*(\d+)/);
              if (match) {
                const margin = Math.abs(Number(match[1]) - Number(match[2]));
                const delta = Math.round((margin / divisor) * 2) / 2;
                if (winningTeamId === 'team-a') {
                  pointsTeamA = Math.min(baseline * 2, baseline + delta);
                  pointsTeamB = Math.max(0, baseline - delta);
                } else if (winningTeamId === 'team-b') {
                  pointsTeamB = Math.min(baseline * 2, baseline + delta);
                  pointsTeamA = Math.max(0, baseline - delta);
                } else {
                  pointsTeamA = baseline;
                  pointsTeamB = baseline;
                }
              }
            }

            matchup.result = { winningTeamId, pointsTeamA, pointsTeamB, summary };
            matchup.gameId = crypto.randomUUID();

            // Recompute match-winner bonus from all completed matchups
            for (let i = 0; i < round.bonuses.length; i++) {
              const bonus = round.bonuses[i];
              if (bonus.type === 'match-winner' && bonus.scope === 'per-matchup') {
                let aWins = 0;
                let bWins = 0;
                let ties = 0;
                const details: string[] = [];
                for (const m of round.matchups) {
                  if (!m.result) continue;

                  // Split format with individual pairings: count each sub-match separately
                  if (setup!.splitFormat && setup!.splitFormat.teamMode === 'individual' && setup!.splitFormat.pairings && setup!.splitFormat.pairings.length > 0) {
                    const mScores = loadGameScores(m.id);
                    if (mScores && Array.isArray(mScores)) {
                      const mAllPlayers = tournament.players.filter((p) => m.playerIds.includes(p.id));
                      const mTeamA = mAllPlayers.filter((p) => m.teamAPlayerIds.includes(p.id));
                      const mTeamB = mAllPlayers.filter((p) => m.teamBPlayerIds.includes(p.id));
                      const fHoles = holes.filter((h) => h.number <= 9);
                      const bHoles = holes.filter((h) => h.number > 9);

                      // Front 9 team sub-match
                      const fResult = computeMatchPlayResult(mTeamA, mTeamB, fHoles, round.pointsForWin, round.pointsForTie, round.pointsForLoss);
                      if (fResult.winningTeamId === 'team-a') aWins++;
                      else if (fResult.winningTeamId === 'team-b') bWins++;
                      else ties++;
                      details.push(`${m.groupLabel} F9: ${fResult.winningTeamId === 'team-a' ? tournament.teams[0].name : fResult.winningTeamId === 'team-b' ? tournament.teams[1].name : 'Tied'}`);

                      // Back 9 individual sub-matches
                      for (const pairing of setup!.splitFormat.pairings) {
                        const pA = mAllPlayers.find((p) => p.id === pairing.playerIds[0] && m.teamAPlayerIds.includes(p.id))
                          || mAllPlayers.find((p) => p.id === pairing.playerIds[1] && m.teamAPlayerIds.includes(p.id));
                        const pB = mAllPlayers.find((p) => p.id === pairing.playerIds[0] && m.teamBPlayerIds.includes(p.id))
                          || mAllPlayers.find((p) => p.id === pairing.playerIds[1] && m.teamBPlayerIds.includes(p.id));
                        if (!pA || !pB) continue;
                        const pResult = computeMatchPlayResult([pA], [pB], bHoles, round.splitFormat?.pointsForWin ?? round.pointsForWin, round.splitFormat?.pointsForTie ?? round.pointsForTie, round.splitFormat?.pointsForLoss ?? round.pointsForLoss);
                        if (pResult.winningTeamId === 'team-a') aWins++;
                        else if (pResult.winningTeamId === 'team-b') bWins++;
                        else ties++;
                        const winner = pResult.winningTeamId === 'team-a' ? pA.name.split(' ')[0]
                          : pResult.winningTeamId === 'team-b' ? pB.name.split(' ')[0] : 'Tied';
                        details.push(`${pA.name.split(' ')[0]}v${pB.name.split(' ')[0]}: ${winner}`);
                      }
                    }
                  } else {
                    if (m.result.winningTeamId === 'team-a') aWins++;
                    else if (m.result.winningTeamId === 'team-b') bWins++;
                    else ties++;
                    const label = m.result.winningTeamId === 'team-a' ? tournament.teams[0].name
                      : m.result.winningTeamId === 'team-b' ? tournament.teams[1].name : 'Tied';
                    details.push(`${m.groupLabel}: ${label}`);
                  }
                }
                round.bonuses[i] = { ...bonus, result: { winningTeamId: undefined, teamAWins: aWins, teamBWins: bWins, ties, detail: details.join(' · ') } };
              }
            }

            // If all matchups are done, compute round-level bonuses
            const allDone = round.matchups.every((m) => m.result !== null);
            if (allDone) {
              round.status = 'completed';
              // Clear non-match-winner bonuses so computeBonuses recalculates them fresh
              round.bonuses = round.bonuses.map((b) =>
                b.type === 'match-winner' ? b : { ...b, result: undefined }
              );
              round.bonuses = computeBonuses(round, tournament);
            }

            saveTournament(tournament);
          }
        }
      }
      sessionStorage.removeItem('game_tournament_context');
      router.push(`/tournament/${tournamentCtx.tournamentId}`);
    } else {
      router.push('/dashboard');
    }
  }
}

function TeamMatchStatus({
  setup, scores, holes, tournamentCtx, getScore, getPlayerStrokesOnHole,
}: {
  setup: GameSetup;
  scores: GameScore[];
  holes: { number: number; par: number; handicap: number }[];
  tournamentCtx: TournamentGameContext;
  getScore: (playerId: string, hole: number) => number | null;
  getPlayerStrokesOnHole: (player: Player, holeHandicap: number, holeNumber?: number) => number;
}) {
  const tournament = loadTournament(tournamentCtx.tournamentId);
  if (!tournament) return null;

  const round = tournament.rounds.find((r) => r.id === tournamentCtx.roundId);
  if (!round) return null;

  const matchup = round.matchups.find((m) => m.id === tournamentCtx.matchupId);
  if (!matchup) return null;

  const teamAPlayers = setup.players.filter((p) => matchup.teamAPlayerIds.includes(p.id));
  const teamBPlayers = setup.players.filter((p) => matchup.teamBPlayerIds.includes(p.id));
  const teamAName = tournament.teams[0].name;
  const teamBName = tournament.teams[1].name;

  function stablefordPoints(net: number, par: number): number {
    const scale = resolveStablefordScale(setup.formatSettings);
    const diff = net - par;
    if (diff <= -3) return scale.albatrossOrBetter;
    if (diff === -2) return scale.eagle;
    if (diff === -1) return scale.birdie;
    if (diff === 0) return scale.par;
    if (diff === 1) return scale.bogey;
    return scale.doubleOrWorse;
  }

  function getTeamNetOnHole(teamPlayers: Player[], hole: { number: number; par: number; handicap: number }): number | null {
    const holeTeamMode = (setup.splitFormat && hole.number > 9) ? setup.splitFormat.teamMode : (setup.teamMode || 'best-ball');

    if (holeTeamMode === 'scramble' || holeTeamMode === 'alternate-shot') {
      const firstWithScore = teamPlayers.find((p) => getScore(p.id, hole.number) !== null);
      if (!firstWithScore) return null;
      const gross = getScore(firstWithScore.id, hole.number)!;
      const strokes = getPlayerStrokesOnHole(firstWithScore, hole.handicap, hole.number);
      return gross - strokes;
    }
    if (holeTeamMode === 'combined') {
      let total = 0;
      let anyScored = false;
      for (const p of teamPlayers) {
        const gross = getScore(p.id, hole.number);
        if (gross === null) continue;
        anyScored = true;
        const strokes = getPlayerStrokesOnHole(p, hole.handicap, hole.number);
        total += gross - strokes;
      }
      return anyScored ? total : null;
    }
    // best-ball
    let best: number | null = null;
    for (const p of teamPlayers) {
      const gross = getScore(p.id, hole.number);
      if (gross === null) continue;
      const strokes = getPlayerStrokesOnHole(p, hole.handicap, hole.number);
      const net = gross - strokes;
      if (best === null || net < best) best = net;
    }
    return best;
  }

  const isStableford = setup.formatId === 'stableford';

  function getTeamStablefordOnHole(teamPlayers: Player[], hole: { number: number; par: number; handicap: number }): number | null {
    const holeTeamMode = (setup.splitFormat && hole.number > 9) ? setup.splitFormat.teamMode : (setup.teamMode || 'best-ball');
    if (holeTeamMode === 'combined') {
      let total = 0;
      let anyScored = false;
      for (const p of teamPlayers) {
        const gross = getScore(p.id, hole.number);
        if (gross === null) continue;
        anyScored = true;
        const strokes = getPlayerStrokesOnHole(p, hole.handicap, hole.number);
        total += stablefordPoints(gross - strokes, hole.par);
      }
      return anyScored ? total : null;
    }
    const net = getTeamNetOnHole(teamPlayers, hole);
    if (net === null) return null;
    return stablefordPoints(net, hole.par);
  }

  const isStrokePlayStableford = isStableford && round.scoringMethod === 'stroke-play';

  let ptsA = 0;
  let ptsB = 0;
  let stablefordTotalA = 0;
  let stablefordTotalB = 0;

  if (isStrokePlayStableford) {
    for (const hole of holes) {
      const stbA = getTeamStablefordOnHole(teamAPlayers, hole);
      const stbB = getTeamStablefordOnHole(teamBPlayers, hole);
      if (stbA !== null) stablefordTotalA += stbA;
      if (stbB !== null) stablefordTotalB += stbB;
    }
    if (round.tournamentPointMode === 'margin-based') {
      const baseline = round.marginBaseline ?? 9;
      const divisor = round.marginDivisor ?? (round.teamMode === 'combined' ? 4 : 2);
      const margin = Math.abs(stablefordTotalA - stablefordTotalB);
      const delta = Math.round((margin / divisor) * 2) / 2;
      if (stablefordTotalA > stablefordTotalB) {
        ptsA = Math.min(baseline * 2, baseline + delta);
        ptsB = Math.max(0, baseline - delta);
      } else if (stablefordTotalB > stablefordTotalA) {
        ptsB = Math.min(baseline * 2, baseline + delta);
        ptsA = Math.max(0, baseline - delta);
      } else {
        ptsA = baseline;
        ptsB = baseline;
      }
    } else {
      if (stablefordTotalA > stablefordTotalB) { ptsA = round.pointsForWin; ptsB = round.pointsForLoss; }
      else if (stablefordTotalB > stablefordTotalA) { ptsB = round.pointsForWin; ptsA = round.pointsForLoss; }
      else { ptsA = round.pointsForTie; ptsB = round.pointsForTie; }
    }
  } else {
    let teamAHolesWon = 0;
    let teamBHolesWon = 0;
    let holesTied = 0;

    for (const hole of holes) {
      if (isStableford) {
        const stbA = getTeamStablefordOnHole(teamAPlayers, hole);
        const stbB = getTeamStablefordOnHole(teamBPlayers, hole);
        if (stbA === null || stbB === null) continue;
        if (stbA > stbB) teamAHolesWon++;
        else if (stbB > stbA) teamBHolesWon++;
        else holesTied++;
      } else {
        const netA = getTeamNetOnHole(teamAPlayers, hole);
        const netB = getTeamNetOnHole(teamBPlayers, hole);
        if (netA === null || netB === null) continue;
        if (netA < netB) teamAHolesWon++;
        else if (netB < netA) teamBHolesWon++;
        else holesTied++;
      }
    }
    ptsA = teamAHolesWon * round.pointsForWin + holesTied * round.pointsForTie;
    ptsB = teamBHolesWon * round.pointsForWin + holesTied * round.pointsForTie;
  }

  // Compute overall tournament total (finalized + all live matches)
  const standings = computeStandings(tournament);
  let totalA = standings.teamAPoints;
  let totalB = standings.teamBPoints;
  const matchScores: { label: string; a: number | string; b: number | string; isCurrent: boolean }[] = [];

  for (const r of tournament.rounds) {
    for (const m of r.matchups) {
      if (!m.gameId || m.result) continue;
      let mA: number;
      let mB: number;
      let mLabel: string | undefined;
      if (m.id === matchup.id) {
        mA = ptsA;
        mB = ptsB;
        if (isStrokePlayStableford) mLabel = `${stablefordTotalA}–${stablefordTotalB} pts`;
      } else {
        const mScores = loadGameScores(m.id);
        if (!mScores || mScores.length === 0) continue;
        const liveResult = recomputeMatchResult(mScores, m, r, tournament);
        if (!liveResult) continue;
        mA = liveResult.pointsTeamA;
        mB = liveResult.pointsTeamB;
      }
      totalA += mA;
      totalB += mB;
      const aNames = tournament.players.filter((p) => m.teamAPlayerIds.includes(p.id)).map((p) => p.name.split(' ')[0]).join('/');
      const bNames = tournament.players.filter((p) => m.teamBPlayerIds.includes(p.id)).map((p) => p.name.split(' ')[0]).join('/');
      matchScores.push({ label: mLabel || `${aNames} vs ${bNames}`, a: mLabel ? mA : mA, b: mLabel ? mB : mB, isCurrent: m.id === matchup.id });
    }
  }

  return (
    <div className="bg-green-950 text-white py-2 px-4">
      {isStrokePlayStableford ? (
        <div className="text-center">
          <div className="font-bold text-sm">
            <span className="text-blue-300">{teamAName} {stablefordTotalA}</span>
            <span className="mx-2 text-green-500">—</span>
            <span className="text-red-300">{teamBName} {stablefordTotalB}</span>
          </div>
          <p className="text-[10px] text-gray-400">stableford pts · tournament: {ptsA}–{ptsB}</p>
        </div>
      ) : (
        <div className="text-center font-bold text-sm">
          <span className="text-blue-300">{teamAName} {totalA}</span>
          <span className="mx-2 text-green-500">—</span>
          <span className="text-red-300">{teamBName} {totalB}</span>
        </div>
      )}
      {matchScores.length > 0 && !isStrokePlayStableford && (
        <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-[10px] text-gray-400">
          {matchScores.map((ms, i) => (
            <span key={i} className={ms.isCurrent ? 'text-green-300' : ''}>
              {ms.label}: <span className="text-blue-300">{ms.a}</span>–<span className="text-red-300">{ms.b}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SideGameFlightPanel({ tournamentId, currentScores, ownMatchupId }: {
  tournamentId: string;
  currentScores: GameScore[];
  ownMatchupId: string;
}) {
  const [result, setResult] = useState<SideGameResult | null>(null);
  const [tick, setTick] = useState(0);
  const [flightExpanded, setFlightExpanded] = useState(false);

  useEffect(() => {
    const tournament = loadTournament(tournamentId);
    if (!tournament?.sideGames?.length) return;
    const sideGame = tournament.sideGames[0];

    const matchupIds = new Set<string>();
    for (const team of sideGame.teams) {
      if (team.linkedMatchupId) matchupIds.add(team.linkedMatchupId);
    }
    matchupIds.add(sideGame.ownMatchupId);
    const ids = Array.from(matchupIds);

    function recompute() {
      const allScores = new Map<string, GameScore[]>();
      for (const mid of ids) {
        if (mid === ownMatchupId) {
          allScores.set(mid, currentScores);
        } else {
          const cached = loadGameScores(mid);
          if (cached) allScores.set(mid, cached);
        }
      }
      setResult(computeSideGameResult(sideGame, allScores));
    }

    Promise.all(ids.filter((id) => id !== ownMatchupId).map((mid) => fetchGameScores(mid))).then(recompute);

    const channels = ids
      .filter((id) => id !== ownMatchupId)
      .map((mid) => subscribeToScores(mid, () => { setTick((t) => t + 1); }));

    return () => { channels.forEach((ch) => ch.unsubscribe()); };
  }, [tournamentId]);

  // Recompute when own scores change or tick updates
  useEffect(() => {
    const tournament = loadTournament(tournamentId);
    if (!tournament?.sideGames?.length) return;
    const sideGame = tournament.sideGames[0];

    const allScores = new Map<string, GameScore[]>();
    const matchupIds = new Set<string>();
    for (const team of sideGame.teams) {
      if (team.linkedMatchupId) matchupIds.add(team.linkedMatchupId);
    }
    matchupIds.add(sideGame.ownMatchupId);

    for (const mid of matchupIds) {
      if (mid === ownMatchupId) {
        allScores.set(mid, currentScores);
      } else {
        const cached = loadGameScores(mid);
        if (cached) allScores.set(mid, cached);
      }
    }
    setResult(computeSideGameResult(sideGame, allScores));
  }, [currentScores, tick, tournamentId]);

  if (!result || result.thruHole === 0) return null;

  const overallLeg = result.nassauLegs.find((l) => l.leg === 'overall');
  if (!overallLeg) return null;

  function abbreviateTeam(name: string): string {
    const parts = name.split('/');
    if (parts.length === 1) return parts[0].slice(0, 4);
    return parts.map((p) => p.slice(0, 3)).join('/');
  }

  return (
    <div className="bg-gray-800 px-4 py-2">
      <div className="max-w-lg mx-auto">
        <button onClick={() => setFlightExpanded((e) => !e)} className="w-full text-left">
          <div className="flex items-center gap-1">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Flight · Thru {result.thruHole}</p>
            <div className="flex gap-2 ml-auto">
              {overallLeg.rankings.map((r, i) => (
                <span key={r.teamId} className={`text-xs ${i === 0 ? 'text-green-300 font-medium' : 'text-gray-400'}`}>
                  {abbreviateTeam(r.teamName)} {r.points}
                </span>
              ))}
            </div>
            <span className="text-gray-500 text-[10px] ml-1">{flightExpanded ? '▾' : '▸'}</span>
          </div>
        </button>
        {flightExpanded && (
          <div className="mt-1.5 space-y-0.5 border-t border-gray-700 pt-1.5">
            {overallLeg.rankings.map((r, i) => (
              <div key={r.teamId} className={`flex items-center text-xs ${i === 0 ? 'text-green-300' : 'text-gray-300'}`}>
                <span className="text-gray-500 w-4">{r.place}.</span>
                <span className="flex-1">{r.teamName}</span>
                <span className="font-medium tabular-nums">{r.points} pts</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TournamentOverviewPanel({ tournamentCtx, currentMatchupId, currentScores, setup, getScore, getPlayerStrokesOnHole, remoteScores, otherMatchupTick }: {
  tournamentCtx: TournamentGameContext;
  currentMatchupId: string;
  currentScores: GameScore[];
  setup: GameSetup;
  getScore: (playerId: string, hole: number) => number | null;
  getPlayerStrokesOnHole: (player: Player, holeHandicap: number, holeNumber?: number) => number;
  remoteScores: GameScore[];
  otherMatchupTick: number;
}) {
  void otherMatchupTick; // triggers re-render when other matchups update
  const tournament = loadTournament(tournamentCtx.tournamentId);
  if (!tournament) return null;

  const standings = computeStandings(tournament);
  const teamA = tournament.teams[0];
  const teamB = tournament.teams[1];

  const currentRound = tournament.rounds.find((r) => r.id === tournamentCtx.roundId);
  const currentMatchup = currentRound?.matchups.find((m) => m.id === currentMatchupId);

  // Compute current match stableford totals for display
  const isStableford = setup.formatId === 'stableford';
  const isStrokePlayStableford = isStableford && currentRound?.scoringMethod === 'stroke-play';
  let currentStbA = 0;
  let currentStbB = 0;
  if (isStrokePlayStableford && currentMatchup) {
    const scale = resolveStablefordScale(setup.formatSettings);
    const teamAPlayers = setup.players.filter((p) => currentMatchup.teamAPlayerIds.includes(p.id));
    const teamBPlayers = setup.players.filter((p) => currentMatchup.teamBPlayerIds.includes(p.id));
    const holeTeamMode = setup.teamMode || 'best-ball';

    function teamStbForHole(teamPlayers: Player[], hole: { number: number; par: number; handicap: number }): number | null {
      if (holeTeamMode === 'combined') {
        let total = 0;
        let any = false;
        for (const p of teamPlayers) {
          const gross = getScore(p.id, hole.number);
          if (gross === null) continue;
          any = true;
          const strokes = getPlayerStrokesOnHole(p, hole.handicap, hole.number);
          const diff = (gross - strokes) - hole.par;
          total += diff <= -3 ? scale.albatrossOrBetter : diff === -2 ? scale.eagle : diff === -1 ? scale.birdie : diff === 0 ? scale.par : diff === 1 ? scale.bogey : scale.doubleOrWorse;
        }
        return any ? total : null;
      }
      let best: number | null = null;
      for (const p of teamPlayers) {
        const gross = getScore(p.id, hole.number);
        if (gross === null) continue;
        const strokes = getPlayerStrokesOnHole(p, hole.handicap, hole.number);
        const net = gross - strokes;
        if (best === null || net < best) best = net;
      }
      if (best === null) return null;
      const diff = best - hole.par;
      return diff <= -3 ? scale.albatrossOrBetter : diff === -2 ? scale.eagle : diff === -1 ? scale.birdie : diff === 0 ? scale.par : diff === 1 ? scale.bogey : scale.doubleOrWorse;
    }

    const holes = setup.course?.teeSets.find((t) => t.id === setup.course?.selectedTeeId)?.holes
      || setup.course?.teeSets[0]?.holes || [];
    const playingHoles = setup.holesPlaying === 'front9' ? holes.filter((h) => h.number <= 9)
      : setup.holesPlaying === 'back9' ? holes.filter((h) => h.number > 9) : holes;

    for (const h of playingHoles) {
      const a = teamStbForHole(teamAPlayers, h);
      const b = teamStbForHole(teamBPlayers, h);
      if (a !== null) currentStbA += a;
      if (b !== null) currentStbB += b;
    }
  }

  // Add live provisional scores from in-progress matches
  let liveA = standings.teamAPoints;
  let liveB = standings.teamBPoints;
  for (const round of tournament.rounds) {
    for (const matchup of round.matchups) {
      if (!matchup.gameId || matchup.result) continue;
      if (matchup.id === currentMatchupId) {
        // Merge local + remote scores for accurate match result
        const merged = [...remoteScores];
        for (const s of currentScores) {
          const idx = merged.findIndex((r) => r.playerId === s.playerId && r.hole === s.hole);
          if (idx >= 0) merged[idx] = s; else merged.push(s);
        }
        if (merged.length > 0 && currentRound) {
          const liveResult = recomputeMatchResult(merged, matchup, currentRound, tournament);
          if (liveResult) {
            liveA += liveResult.pointsTeamA;
            liveB += liveResult.pointsTeamB;
          }
        }
      } else {
        const scores = loadGameScores(matchup.id);
        if (!scores || scores.length === 0) continue;
        const liveResult = recomputeMatchResult(scores, matchup, round, tournament);
        if (liveResult) {
          liveA += liveResult.pointsTeamA;
          liveB += liveResult.pointsTeamB;
        }
      }
    }
  }

  // Compute projected score: project remaining holes as tied + unresolved bonuses
  let projA = liveA;
  let projB = liveB;
  for (const round of tournament.rounds) {
    for (const matchup of round.matchups) {
      if (!matchup.gameId || matchup.result) continue;
      if (round.scoringMethod !== 'match-play') continue;
      const totalHoles = getHoleDataForRound(round).length;
      if (totalHoles === 0) continue;
      let matchScores: GameScore[];
      if (matchup.id === currentMatchupId) {
        const merged = [...remoteScores];
        for (const s of currentScores) {
          const idx = merged.findIndex((r) => r.playerId === s.playerId && r.hole === s.hole);
          if (idx >= 0) merged[idx] = s;
          else merged.push(s);
        }
        matchScores = merged;
      } else {
        const loaded = loadGameScores(matchup.id);
        if (!loaded || loaded.length === 0) continue;
        matchScores = loaded;
      }
      if (matchScores.length === 0) continue;

      const splitStatuses = computeSplitMatchStatuses(matchScores, matchup, round, tournament);
      if (splitStatuses) {
        for (const sm of splitStatuses) {
          const pts = sm.type === 'team'
            ? { tie: round.pointsForTie }
            : { tie: round.splitFormat?.pointsForTie ?? round.pointsForTie };
          const smTotalHoles = sm.holes === 'front' ? Math.min(9, totalHoles) : Math.max(0, totalHoles - 9);
          const remaining = smTotalHoles - sm.status.thru;
          if (remaining > 0) {
            projA += remaining * pts.tie;
            projB += remaining * pts.tie;
          }
        }
      } else {
        const status = computeLiveMatchStatus(matchScores, matchup, round, tournament);
        if (!status) continue;
        const remaining = totalHoles - status.thru;
        if (remaining > 0) {
          projA += remaining * round.pointsForTie;
          projB += remaining * round.pointsForTie;
        }
      }
    }
  }
  // Ensure current scores are in cache before computing projected bonuses
  if (currentMatchupId && currentScores.length > 0) {
    const merged = [...remoteScores];
    for (const s of currentScores) {
      const idx = merged.findIndex((r) => r.playerId === s.playerId && r.hole === s.hole);
      if (idx >= 0) merged[idx] = s; else merged.push(s);
    }
    cacheGameScores(currentMatchupId, merged);
  }

  const decidedBonuses: { name: string; a: number; b: number; detail: string }[] = [];
  const projectedBonuses: { name: string; a: number; b: number; detail: string }[] = [];
  for (const round of tournament.rounds) {
    if (round.status !== 'in-progress') continue;

    for (const bonus of round.bonuses) {
      if (bonus.result) continue;
      if (bonus.type !== 'match-winner' || bonus.scope !== 'per-matchup') {
        const roundProjected = computeProjectedBonuses(round, tournament);
        for (const pb of roundProjected) {
          if (pb.bonusId !== bonus.id) continue;
          projA += pb.projectedTeamAPoints;
          projB += pb.projectedTeamBPoints;
          projectedBonuses.push({ name: pb.bonusName, a: pb.projectedTeamAPoints, b: pb.projectedTeamBPoints, detail: pb.detail });
        }
        continue;
      }

      // Split decided vs projected for match-winner per-matchup
      let decidedA = 0, decidedB = 0;
      let projBonusA = 0, projBonusB = 0;
      const decidedDetails: string[] = [];
      const projDetails: string[] = [];

      for (const matchup of round.matchups) {
        if (matchup.result) {
          if (matchup.result.winningTeamId === 'team-a') decidedA++;
          else if (matchup.result.winningTeamId === 'team-b') decidedB++;
          else { decidedA += 0.5; decidedB += 0.5; }
          continue;
        }
        let matchScores: GameScore[];
        if (matchup.id === currentMatchupId) {
          const merged = [...remoteScores];
          for (const s of currentScores) {
            const idx = merged.findIndex((r) => r.playerId === s.playerId && r.hole === s.hole);
            if (idx >= 0) merged[idx] = s; else merged.push(s);
          }
          matchScores = merged;
        } else {
          const loaded = loadGameScores(matchup.id);
          if (!loaded || loaded.length === 0) continue;
          matchScores = loaded;
        }

        if (round.splitFormat && round.splitFormat.teamMode === 'individual' && round.splitFormat.pairings?.length) {
          const splitStatuses = computeSplitMatchStatuses(matchScores, matchup, round, tournament);
          if (splitStatuses) {
            for (const sm of splitStatuses) {
              const totalHolesForSm = sm.holes === 'front' ? 9 : 9;
              const isComplete = sm.status.thru >= totalHolesForSm;
              const diff = sm.status.holesWonA - sm.status.holesWonB;
              const teamLabel = sm.type === 'team' ? `${matchup.groupLabel} F9` : sm.label;

              if (isComplete) {
                if (diff > 0) { decidedA++; decidedDetails.push(`${teamLabel}: ${tournament.teams[0].name}`); }
                else if (diff < 0) { decidedB++; decidedDetails.push(`${teamLabel}: ${tournament.teams[1].name}`); }
                else { decidedA += 0.5; decidedB += 0.5; decidedDetails.push(`${teamLabel}: Tied`); }
              } else if (sm.status.thru > 0) {
                if (diff > 0) { projBonusA++; projDetails.push(`${teamLabel}: ${tournament.teams[0].name}`); }
                else if (diff < 0) { projBonusB++; projDetails.push(`${teamLabel}: ${tournament.teams[1].name}`); }
                else { projBonusA += 0.5; projBonusB += 0.5; projDetails.push(`${teamLabel}: Tied`); }
              } else {
                projBonusA += 0.5; projBonusB += 0.5;
                projDetails.push(`${teamLabel}: not started`);
              }
            }
            continue;
          }
        }

        const liveResult = recomputeMatchResult(matchScores, matchup, round, tournament);
        if (liveResult) {
          if (liveResult.winningTeamId === 'team-a') { projBonusA++; projDetails.push(`${matchup.groupLabel}: ${tournament.teams[0].name}`); }
          else if (liveResult.winningTeamId === 'team-b') { projBonusB++; projDetails.push(`${matchup.groupLabel}: ${tournament.teams[1].name}`); }
          else { projBonusA += 0.5; projBonusB += 0.5; projDetails.push(`${matchup.groupLabel}: Tied`); }
        }
      }

      const decidedPtsA = decidedA * bonus.points;
      const decidedPtsB = decidedB * bonus.points;
      const projPtsA = projBonusA * bonus.points;
      const projPtsB = projBonusB * bonus.points;

      if (decidedPtsA > 0 || decidedPtsB > 0) {
        decidedBonuses.push({ name: bonus.name, a: decidedPtsA, b: decidedPtsB, detail: decidedDetails.join(' · ') });
      }
      if (projPtsA > 0 || projPtsB > 0) {
        projectedBonuses.push({ name: bonus.name, a: projPtsA, b: projPtsB, detail: projDetails.join(' · ') });
      }
      liveA += decidedPtsA;
      liveB += decidedPtsB;
      projA += decidedPtsA + projPtsA;
      projB += decidedPtsB + projPtsB;
    }
  }

  // Live match status for display in collapsed bar
  let matchStatusText: string | null = null;
  if (setup.scoringTeam && currentMatchup && currentRound) {
    const merged = [...remoteScores];
    for (const s of currentScores) {
      const idx = merged.findIndex((r) => r.playerId === s.playerId && r.hole === s.hole);
      if (idx >= 0) merged[idx] = s;
      else merged.push(s);
    }
    if (currentRound.splitFormat) {
      const splitStatuses = computeSplitMatchStatuses(merged, currentMatchup, currentRound, tournament);
      if (splitStatuses && splitStatuses.some((sm) => sm.status.thru > 0)) {
        const parts: string[] = [];
        for (const sm of splitStatuses) {
          const diff = sm.status.holesWonA - sm.status.holesWonB;
          const label = sm.type === 'team' ? 'Team' : sm.label;
          if (sm.status.thru === 0) {
            parts.push(`${label}: –`);
          } else if (diff === 0) {
            parts.push(`${label}: AS`);
          } else if (sm.type === 'team') {
            const leader = diff > 0 ? teamA.name : teamB.name;
            parts.push(`${label}: ${leader} ${Math.abs(diff)}UP`);
          } else {
            const leader = diff > 0 ? sm.playerA.name.split(' ')[0] : sm.playerB.name.split(' ')[0];
            parts.push(`${label}: ${leader} ${Math.abs(diff)}UP`);
          }
        }
        matchStatusText = parts.join(' · ');
      } else if (remoteScores.length === 0) {
        matchStatusText = `Waiting for ${setup.scoringTeam === 'A' ? teamB.name : teamA.name}...`;
      }
    } else {
      const matchStatus = computeLiveMatchStatus(merged, currentMatchup, currentRound, tournament);
      if (matchStatus && matchStatus.thru > 0) {
        const diff = matchStatus.holesWonA - matchStatus.holesWonB;
        matchStatusText = diff === 0 ? `All Square thru ${matchStatus.thru}`
          : diff > 0 ? `${teamA.name} ${diff} UP thru ${matchStatus.thru}`
          : `${teamB.name} ${-diff} UP thru ${matchStatus.thru}`;
      } else if (remoteScores.length === 0) {
        matchStatusText = `Waiting for ${setup.scoringTeam === 'A' ? teamB.name : teamA.name}...`;
      }
    }
  }

  const target = tournament.targetScore;

  // Current match result text (for non-split scoring too)
  let currentMatchText: string | null = matchStatusText;
  if (!currentMatchText && currentScores.length > 0 && currentMatchup && currentRound) {
    if (currentRound.splitFormat) {
      const merged = [...remoteScores];
      for (const s of currentScores) {
        const idx = merged.findIndex((r) => r.playerId === s.playerId && r.hole === s.hole);
        if (idx >= 0) merged[idx] = s; else merged.push(s);
      }
      const splitStatuses = computeSplitMatchStatuses(merged, currentMatchup, currentRound, tournament);
      if (splitStatuses && splitStatuses.some((sm) => sm.status.thru > 0)) {
        const parts: string[] = [];
        for (const sm of splitStatuses) {
          const diff = sm.status.holesWonA - sm.status.holesWonB;
          const label = sm.type === 'team' ? 'Team' : sm.label;
          if (sm.status.thru === 0) {
            parts.push(`${label}: –`);
          } else if (diff === 0) {
            parts.push(`${label}: AS`);
          } else if (sm.type === 'team') {
            const leader = diff > 0 ? teamA.name : teamB.name;
            parts.push(`${label}: ${leader} ${Math.abs(diff)}UP`);
          } else {
            const leader = diff > 0 ? sm.playerA.name.split(' ')[0] : sm.playerB.name.split(' ')[0];
            parts.push(`${label}: ${leader} ${Math.abs(diff)}UP`);
          }
        }
        currentMatchText = parts.join(' · ');
      }
    } else {
      const liveResult = recomputeMatchResult(currentScores, currentMatchup, currentRound, tournament);
      if (liveResult) {
        currentMatchText = liveResult.summary.replace(' (stableford pts)', ' stb').replace(' (net)', '');
      }
    }
  }

  // Project current match final score (assume remaining holes tied) + per-matchup bonuses
  let matchProjA: number | null = null;
  let matchProjB: number | null = null;
  if (currentMatchup && currentRound && currentScores.length > 0) {
    const liveResult = recomputeMatchResult(currentScores, currentMatchup, currentRound, tournament);
    if (liveResult) {
      if (currentRound.scoringMethod === 'match-play') {
        const totalHoles = getHoleDataForRound(currentRound).length;
        const splitStatuses = computeSplitMatchStatuses(currentScores, currentMatchup, currentRound, tournament);
        if (splitStatuses) {
          matchProjA = liveResult.pointsTeamA;
          matchProjB = liveResult.pointsTeamB;
          for (const sm of splitStatuses) {
            const pts = sm.type === 'team'
              ? { tie: currentRound.pointsForTie }
              : { tie: currentRound.splitFormat?.pointsForTie ?? currentRound.pointsForTie };
            const smTotalHoles = sm.holes === 'front' ? Math.min(9, totalHoles) : Math.max(0, totalHoles - 9);
            const remaining = smTotalHoles - sm.status.thru;
            if (remaining > 0) {
              matchProjA += remaining * pts.tie;
              matchProjB += remaining * pts.tie;
            }
          }
        } else {
          const status = computeLiveMatchStatus(currentScores, currentMatchup, currentRound, tournament);
          if (status && status.thru < totalHoles) {
            const remaining = totalHoles - status.thru;
            matchProjA = liveResult.pointsTeamA + remaining * currentRound.pointsForTie;
            matchProjB = liveResult.pointsTeamB + remaining * currentRound.pointsForTie;
          } else {
            matchProjA = liveResult.pointsTeamA;
            matchProjB = liveResult.pointsTeamB;
          }
        }
      } else {
        matchProjA = liveResult.pointsTeamA;
        matchProjB = liveResult.pointsTeamB;
      }
      // Add projected bonus contributions
      for (const pb of projectedBonuses) {
        matchProjA = (matchProjA ?? 0) + pb.a;
        matchProjB = (matchProjB ?? 0) + pb.b;
      }
    }
  }

  // Compute round totals (sum of all live match tournament points in this round)
  let roundPtsA = 0;
  let roundPtsB = 0;
  const awardedBonuses: { name: string; a: number; b: number; detail?: string }[] = [];
  if (currentRound) {
    for (const m of currentRound.matchups) {
      if (m.result) {
        roundPtsA += m.result.pointsTeamA;
        roundPtsB += m.result.pointsTeamB;
      } else if (m.gameId) {
        if (m.id === currentMatchupId) {
          const merged = [...remoteScores];
          for (const s of currentScores) {
            const idx = merged.findIndex((r) => r.playerId === s.playerId && r.hole === s.hole);
            if (idx >= 0) merged[idx] = s; else merged.push(s);
          }
          const liveResult = merged.length > 0
            ? recomputeMatchResult(merged, m, currentRound, tournament) : null;
          if (liveResult) { roundPtsA += liveResult.pointsTeamA; roundPtsB += liveResult.pointsTeamB; }
        } else {
          const mScores = loadGameScores(m.id);
          if (mScores && mScores.length > 0) {
            const liveResult = recomputeMatchResult(mScores, m, currentRound, tournament);
            if (liveResult) { roundPtsA += liveResult.pointsTeamA; roundPtsB += liveResult.pointsTeamB; }
          }
        }
      }
    }
    // Add finalized bonus points to round total
    for (const bonus of currentRound.bonuses) {
      if (!bonus.result) continue;
      let a = 0;
      let b = 0;
      if (bonus.scope === 'per-matchup' && (bonus.result.teamAWins != null || bonus.result.teamBWins != null)) {
        const aWins = bonus.result.teamAWins || 0;
        const bWins = bonus.result.teamBWins || 0;
        const ties = bonus.result.ties || 0;
        a = aWins * bonus.points + ties * bonus.points * 0.5;
        b = bWins * bonus.points + ties * bonus.points * 0.5;
      } else if (bonus.result.winningTeamId === teamA.id) {
        a = bonus.points;
      } else if (bonus.result.winningTeamId === teamB.id) {
        b = bonus.points;
      } else {
        a = bonus.points * 0.5;
        b = bonus.points * 0.5;
      }
      roundPtsA += a;
      roundPtsB += b;
      if (a > 0 || b > 0) {
        awardedBonuses.push({ name: bonus.name, a, b, detail: bonus.result.detail });
      }
    }
  }

  // Add decided (live-computed) bonus points to round totals
  for (const db of decidedBonuses) {
    roundPtsA += db.a;
    roundPtsB += db.b;
  }

  // Derive current match score display based on format
  let currentScoreA: string = '–';
  let currentScoreB: string = '–';
  if (isStrokePlayStableford && (currentStbA > 0 || currentStbB > 0)) {
    currentScoreA = String(currentStbA);
    currentScoreB = String(currentStbB);
  } else if (currentRound?.scoringMethod === 'match-play' && currentMatchup && currentScores.length > 0) {
    const merged = [...remoteScores];
    for (const s of currentScores) {
      const idx = merged.findIndex((r) => r.playerId === s.playerId && r.hole === s.hole);
      if (idx >= 0) merged[idx] = s; else merged.push(s);
    }
    // Split format: show points directly
    if (currentRound.splitFormat) {
      const liveResult = recomputeMatchResult(merged, currentMatchup, currentRound, tournament);
      if (liveResult) {
        currentScoreA = String(liveResult.pointsTeamA);
        currentScoreB = String(liveResult.pointsTeamB);
      }
    } else {
      const status = computeLiveMatchStatus(merged, currentMatchup, currentRound, tournament);
      if (status && status.thru > 0) {
        const diff = status.holesWonA - status.holesWonB;
        if (diff === 0) {
          currentScoreA = 'AS';
          currentScoreB = `thru ${status.thru}`;
        } else {
          const leader = diff > 0 ? 'A' : 'B';
          const up = Math.abs(diff);
          currentScoreA = leader === 'A' ? `${up} UP` : `${up} DN`;
          currentScoreB = leader === 'B' ? `${up} UP` : `${up} DN`;
        }
      }
    }
  } else if (currentMatchText) {
    const match = currentMatchText.match(/^(\d+)\s*[—–-]\s*(\d+)/);
    if (match) { currentScoreA = match[1]; currentScoreB = match[2]; }
  }

  // Round projection: current round points + remaining projected as tied
  const roundProjA = projA - liveA + roundPtsA;
  const roundProjB = projB - liveB + roundPtsB;

  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-900 border-b border-gray-700">
      <button onClick={() => setExpanded((e) => !e)} className="w-full px-4 py-1.5">
        {/* Round match points + projection */}
        <div className="relative flex items-center justify-center gap-2">
          <span className="text-[10px] font-bold text-blue-400">{teamA.name}</span>
          <span className="text-base font-black text-blue-300 tabular-nums">{roundPtsA}</span>
          <span className="text-xs text-gray-600">–</span>
          <span className="text-base font-black text-red-300 tabular-nums">{roundPtsB}</span>
          <span className="text-[10px] font-bold text-red-400">{teamB.name}</span>
          {currentRound && (
            <span className="absolute right-0 text-[9px] text-gray-500 whitespace-nowrap">(proj {roundProjA}–{roundProjB})</span>
          )}
        </div>
        {/* Current match stableford or status (hidden for split format — details in expanded view) */}
        {isStrokePlayStableford && (currentStbA > 0 || currentStbB > 0) ? (
          <p className="text-center text-[10px] text-gray-400 mt-0.5">
            This match: <span className="text-blue-300">{currentStbA}</span>–<span className="text-red-300">{currentStbB}</span> stb
          </p>
        ) : currentMatchText && !currentRound?.splitFormat ? (
          <p className="text-center text-[10px] text-gray-400 mt-0.5">{currentMatchText}</p>
        ) : null}
      </button>

      {/* Expanded: bonuses + tournament totals */}
      {expanded && (
        <div className="border-t border-gray-800 px-4 py-1.5 space-y-1">
          {/* Individual match scores (multi-matchup rounds) */}
          {currentRound && currentRound.matchups.length > 1 && currentRound.splitFormat && (() => {
            const matchWinnerBonus = currentRound.bonuses.find((b) => b.type === 'match-winner' && b.scope === 'per-matchup');
            const allSubMatches: { sm: SplitMatchup; matchupId: string; mTeamANames: string; mTeamBNames: string }[] = [];
            for (const m of currentRound.matchups) {
              const mTeamANames = tournament.players.filter((p) => m.teamAPlayerIds.includes(p.id)).map((p) => p.name.split(' ')[0]).join('/');
              const mTeamBNames = tournament.players.filter((p) => m.teamBPlayerIds.includes(p.id)).map((p) => p.name.split(' ')[0]).join('/');
              let matchScores: GameScore[] | null = null;
              if (m.id === currentMatchupId) {
                const merged = [...remoteScores];
                for (const s of currentScores) {
                  const idx = merged.findIndex((r) => r.playerId === s.playerId && r.hole === s.hole);
                  if (idx >= 0) merged[idx] = s; else merged.push(s);
                }
                matchScores = merged;
              } else if (m.gameId) {
                matchScores = loadGameScores(m.id);
              }
              const splitStatuses = matchScores && matchScores.length > 0
                ? computeSplitMatchStatuses(matchScores, m, currentRound, tournament) : null;
              if (splitStatuses) {
                for (const sm of splitStatuses) {
                  allSubMatches.push({ sm, matchupId: m.id, mTeamANames, mTeamBNames });
                }
              }
            }

            // Sort: front 9 first, then back 9; within each group, current matchup first
            allSubMatches.sort((a, b) => {
              const aFront = a.sm.holes === 'front' ? 0 : 1;
              const bFront = b.sm.holes === 'front' ? 0 : 1;
              if (aFront !== bFront) return aFront - bFront;
              const aCurrent = a.matchupId === currentMatchupId ? 0 : 1;
              const bCurrent = b.matchupId === currentMatchupId ? 0 : 1;
              return aCurrent - bCurrent;
            });

            if (allSubMatches.length === 0) return null;

            return (
              <div className="space-y-0.5">
                {allSubMatches.map(({ sm, matchupId, mTeamANames, mTeamBNames }) => {
                  const pts = sm.type === 'team'
                    ? { win: currentRound.pointsForWin, tie: currentRound.pointsForTie }
                    : { win: currentRound.splitFormat?.pointsForWin ?? currentRound.pointsForWin, tie: currentRound.splitFormat?.pointsForTie ?? currentRound.pointsForTie };
                  const scoreA = sm.status.holesWonA * pts.win + sm.status.holesTied * pts.tie;
                  const scoreB = sm.status.holesWonB * pts.win + sm.status.holesTied * pts.tie;
                  const nameA = sm.type === 'team' ? mTeamANames : sm.playerA.name.split(' ')[0];
                  const nameB = sm.type === 'team' ? mTeamBNames : sm.playerB.name.split(' ')[0];
                  const labelSuffix = sm.type === 'team' ? 'F9' : 'B9';

                  const isComplete = sm.status.thru >= 9;
                  let bonusText: string | null = null;
                  let bonusColorA = '';
                  let bonusColorB = '';
                  if (matchWinnerBonus && isComplete) {
                    const diff = sm.status.holesWonA - sm.status.holesWonB;
                    if (diff > 0) { bonusText = `+${matchWinnerBonus.points}`; bonusColorA = 'text-green-400'; }
                    else if (diff < 0) { bonusText = `+${matchWinnerBonus.points}`; bonusColorB = 'text-green-400'; }
                    else { bonusText = `+${matchWinnerBonus.points * 0.5}`; bonusColorA = 'text-yellow-400'; bonusColorB = 'text-yellow-400'; }
                  }

                  return (
                    <div key={`${matchupId}-${sm.label}`} className="flex items-baseline text-[10px]">
                      <div className="flex-1 text-right min-w-0 flex items-baseline justify-end gap-0.5">
                        <span className="whitespace-nowrap text-blue-300">{nameA}</span>
                        {bonusColorA && <span className={`text-[8px] ${bonusColorA}`}>{bonusText}</span>}
                      </div>
                      <div className="flex items-baseline justify-center gap-1 px-1.5 shrink-0">
                        <span className="font-bold tabular-nums w-4 text-right text-blue-300">{sm.status.thru > 0 ? scoreA : '–'}</span>
                        <span className="text-gray-600">–</span>
                        <span className="font-bold tabular-nums w-4 text-left text-red-300">{sm.status.thru > 0 ? scoreB : '–'}</span>
                      </div>
                      <div className="flex-1 text-left min-w-0 flex items-baseline gap-0.5">
                        {bonusColorB && <span className={`text-[8px] ${bonusColorB}`}>{bonusText}</span>}
                        <span className="whitespace-nowrap text-red-300">{nameB}</span>
                      </div>
                      <span className="text-[8px] text-gray-600 ml-0.5">{labelSuffix}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Individual match scores: non-split rounds */}
          {currentRound && currentRound.matchups.length > 1 && !currentRound.splitFormat && (
            <div className="space-y-0.5">
              {currentRound.matchups.map((m) => {
                const mTeamANames = tournament.players.filter((p) => m.teamAPlayerIds.includes(p.id)).map((p) => p.name.split(' ')[0]).join('/');
                const mTeamBNames = tournament.players.filter((p) => m.teamBPlayerIds.includes(p.id)).map((p) => p.name.split(' ')[0]).join('/');
                let mScoreA = '–';
                let mScoreB = '–';
                if (m.id === currentMatchupId) {
                  mScoreA = currentScoreA;
                  mScoreB = currentScoreB;
                } else if (m.result) {
                  mScoreA = String(m.result.pointsTeamA);
                  mScoreB = String(m.result.pointsTeamB);
                } else if (m.gameId) {
                  const mScores = loadGameScores(m.id);
                  if (mScores && mScores.length > 0) {
                    const liveResult = recomputeMatchResult(mScores, m, currentRound, tournament);
                    if (liveResult) {
                      mScoreA = String(liveResult.pointsTeamA);
                      mScoreB = String(liveResult.pointsTeamB);
                    }
                  }
                }
                return (
                  <div key={m.id} className="flex items-baseline text-[10px]">
                    <div className="flex-1 text-right min-w-0">
                      <span className="whitespace-nowrap text-blue-300">{mTeamANames}</span>
                    </div>
                    <div className="flex items-baseline justify-center gap-1 px-1.5 shrink-0">
                      <span className="font-bold tabular-nums w-5 text-right text-blue-300">{mScoreA}</span>
                      <span className="text-gray-600">–</span>
                      <span className="font-bold tabular-nums w-5 text-left text-red-300">{mScoreB}</span>
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <span className="whitespace-nowrap text-red-300">{mTeamBNames}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bonuses: combined by name with projected portion shown inline */}
          {(decidedBonuses.length > 0 || awardedBonuses.length > 0 || projectedBonuses.length > 0) && (() => {
            const combined = new Map<string, { a: number; b: number; projA: number; projB: number }>();
            for (const ab of awardedBonuses) {
              const entry = combined.get(ab.name) || { a: 0, b: 0, projA: 0, projB: 0 };
              entry.a += ab.a; entry.b += ab.b;
              combined.set(ab.name, entry);
            }
            for (const db of decidedBonuses) {
              const entry = combined.get(db.name) || { a: 0, b: 0, projA: 0, projB: 0 };
              entry.a += db.a; entry.b += db.b;
              combined.set(db.name, entry);
            }
            for (const pb of projectedBonuses) {
              const entry = combined.get(pb.name) || { a: 0, b: 0, projA: 0, projB: 0 };
              entry.projA += pb.a; entry.projB += pb.b;
              combined.set(pb.name, entry);
            }
            return (
              <div className="space-y-0.5">
                <p className="text-[9px] text-gray-500 uppercase tracking-wider text-center">Bonuses</p>
                {[...combined.entries()].map(([name, { a, b, projA: pA, projB: pB }]) => (
                  <div key={name} className="flex items-baseline flex-nowrap text-[9px]">
                    <div className="flex-1 flex items-baseline justify-end gap-1 min-w-0">
                      <span className="text-gray-400 whitespace-nowrap">{name}</span>
                      <span className="text-blue-300">{a}</span>
                      {pA > 0 && <span className="text-blue-300/50">({a + pA})</span>}
                    </div>
                    <span className="text-gray-600 mx-1 flex-shrink-0">–</span>
                    <div className="flex-1 flex items-baseline justify-start gap-1 min-w-0">
                      <span className="text-red-300">{b}</span>
                      {pB > 0 && <span className="text-red-300/50">({b + pB})</span>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Tournament total */}
          <div className="flex items-baseline flex-nowrap text-[10px] pt-0.5 border-t border-gray-800">
            <div className="flex-1 flex items-baseline justify-end gap-1 min-w-0">
              <span className="text-gray-500 uppercase tracking-wider whitespace-nowrap">Tourn</span>
              <span className="font-bold text-blue-300">{liveA}</span>
              <span className="text-blue-300/60 text-[9px]">({projA})</span>
            </div>
            <span className="text-gray-600 mx-1 flex-shrink-0">–</span>
            <div className="flex-1 flex items-baseline justify-start gap-1 min-w-0">
              <span className="font-bold text-red-300">{liveB}</span>
              <span className="text-red-300/60 text-[9px]">({projB})</span>
              {target && target > 0 && (
                <span className="text-[9px] text-gray-500 whitespace-nowrap">· {target} to win</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


