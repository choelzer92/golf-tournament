'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { GameSetup, GameScore, Player } from '@/lib/game-state';
import { calcCourseHandicap } from '@/lib/game-state';
import { isOneBallFormat, isTeamMode } from '@/lib/formats';
import type { TournamentGameContext, Tournament, RoundMatchup } from '@/lib/tournament-state';
import { loadTournament, saveTournament, saveGameScores, loadGameScores, fetchGameScores, fetchTournament, computeStandings, computeBonuses, subscribeToScores } from '@/lib/tournament-state';
import { computeLiveMatchStatus } from '@/lib/live-scoring';

export default function PlayGamePage() {
  const router = useRouter();
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [scores, setScores] = useState<GameScore[]>([]);
  const [remoteScores, setRemoteScores] = useState<GameScore[]>([]);
  const [currentHole, setCurrentHole] = useState(1);
  const [tournamentCtx, setTournamentCtx] = useState<TournamentGameContext | null>(null);
  const [teamNames, setTeamNames] = useState<{ A: string; B: string }>({ A: 'Team A', B: 'Team B' });
  const [strokesExpanded, setStrokesExpanded] = useState(false);
  const [showTournamentPanel, setShowTournamentPanel] = useState(false);

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

    const startHole = parsed.holesPlaying === 'back9' ? 10 : 1;
    setCurrentHole(startHole);
  }, [router]);

  // Auto-save scores on every change
  useEffect(() => {
    if (!setup?.matchupId || scores.length === 0) return;
    const matchupId = setup.matchupId;
    const merged = mergeScores(scores, remoteScores);
    saveGameScores(matchupId, merged);
  }, [setup?.matchupId, scores, remoteScores]);

  // Realtime subscription for remote team's scores
  useEffect(() => {
    if (!setup?.scoringTeam || !setup?.matchupId) return;
    const matchupId = setup.matchupId;
    const localPlayerIds = new Set(
      setup.players.filter((p) => p.team === setup.scoringTeam).map((p) => p.id)
    );

    const channel = subscribeToScores(matchupId, (allScores) => {
      if (!Array.isArray(allScores)) return;
      const remote = allScores.filter((s: GameScore) => !localPlayerIds.has(s.playerId));
      setRemoteScores(remote);
    });

    return () => { channel.unsubscribe(); };
  }, [setup?.scoringTeam, setup?.matchupId, setup?.players]);

  if (!setup) return null;

  function mergeScores(local: GameScore[], remote: GameScore[]): GameScore[] {
    const map = new Map<string, GameScore>();
    for (const s of remote) map.set(`${s.playerId}_${s.hole}`, s);
    for (const s of local) map.set(`${s.playerId}_${s.hole}`, s);
    return Array.from(map.values());
  }

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
      return Math.round(index * (allowance / 100));
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
        return isNaN(result) ? 0 : Math.round(result);
      }

      // Fallback: halve the 18-hole course handicap
      const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
      if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) return 0;
      const full = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar)
        * (allowance / 100);
      return isNaN(full) ? 0 : Math.round(full / 2);
    }

    // 18-hole course handicap
    const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
    if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) return 0;
    const result = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar)
      * (allowance / 100);
    return isNaN(result) ? 0 : Math.round(result);
  }

  function getPlayerRawCourseHandicap(player: Player): number {
    if (!player.handicapIndex) return 0;
    const is9 = setup!.holesPlaying === 'front9' || setup!.holesPlaying === 'back9';

    if (setup!.handicapBasis === 'index') {
      return is9 ? Math.round(player.handicapIndex / 2) : Math.round(player.handicapIndex);
    }

    const playerTee = getPlayerTee(player);
    if (!playerTee) return 0;

    if (is9) {
      const ratingType = setup!.holesPlaying === 'front9' ? 'Front' : 'Back';
      const rating = playerTee.ratings?.find((r) => r.type === ratingType);
      if (rating && rating.slopeRating && rating.courseRating) {
        const par = (playerTee.holes || [])
          .filter((h) => ratingType === 'Front' ? h.number <= 9 : h.number > 9)
          .reduce((sum, h) => sum + h.par, 0) || Math.round(playerTee.totalPar / 2);
        const result = calcCourseHandicap(player.handicapIndex / 2, rating.slopeRating, rating.courseRating, par);
        return isNaN(result) ? 0 : Math.round(result);
      }
      const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
      if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) return 0;
      const full = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar);
      return isNaN(full) ? 0 : Math.round(full / 2);
    }

    const totalRating = playerTee.ratings?.find((r) => r.type === 'Total');
    if (!totalRating || !totalRating.slopeRating || !totalRating.courseRating) return 0;
    const result = calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, playerTee.totalPar);
    return isNaN(result) ? 0 : Math.round(result);
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
      : courseHandicaps.length === 3 ? [0.20, 0.15, 0.10]
      : [0.20, 0.15, 0.10, 0.05];

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
    const playingHcap = getPlayingHandicap(player, holeNumber);
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
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{setup.course?.courseName || 'Game'}</h1>
            <p className="text-xs text-green-200">{setup.formatId.replace('-', ' ').toUpperCase()}</p>
          </div>
          <button
            onClick={() => {
              if (tournamentCtx) {
                router.push(`/tournament/${tournamentCtx.tournamentId}`);
              } else {
                router.push('/dashboard');
              }
            }}
            className="text-sm text-green-200 hover:text-white"
          >
            {tournamentCtx ? 'Back' : 'End'}
          </button>
        </div>
      </header>

      <div className="bg-green-900 text-green-200 text-xs text-center py-1.5">
        {oneBall ? (
          <>
            {teamMode === 'scramble'
              ? ((setup.handicapAllowance ?? -1) < 0 ? 'Scramble (USGA Tiered)' : `Scramble (${setup.handicapAllowance}% flat)`)
              : `Alt Shot (60/40 × ${setup.handicapAllowance ?? 50}%)`}{' · '}
            {teamNames.A}: {getTeamHandicapForFormat(sortedPlayers.filter((p) => p.team === 'A'))}{' · '}
            {teamNames.B}: {getTeamHandicapForFormat(sortedPlayers.filter((p) => p.team === 'B'))}
          </>
        ) : (
          <>
            {setup.handicapAllowance != null && setup.handicapAllowance !== 100
              ? `${setup.handicapAllowance}% · `
              : ''}
            {setup.strokeMethod === 'off-the-low' ? 'Off the Low' : 'Full'}{' · '}
            {sortedPlayers.map((p) => {
              const raw = getPlayerRawCourseHandicap(p);
              const effective = getPlayerEffectiveHcap(p);
              const playing = getPlayingHandicap(p);
              const name = p.name.split(' ')[0];
              return `${name}: ${p.handicapIndex ?? '–'}/${raw}/${effective}→${playing}`;
            }).join(' · ')}
          </>
        )}
      </div>

      {tournamentCtx && !setup.scoringTeam && <TeamMatchStatus setup={setup} scores={scores} holes={holes} tournamentCtx={tournamentCtx} getScore={getScore} getPlayerStrokesOnHole={getPlayerStrokesOnHole} />}

      {setup.scoringTeam && remoteScores.length > 0 && tournamentCtx && (
        <LiveMatchBanner
          setup={setup}
          localScores={scores}
          remoteScores={remoteScores}
          teamNames={teamNames}
          tournamentCtx={tournamentCtx}
        />
      )}

      {setup.scoringTeam && remoteScores.length === 0 && (
        <div className="bg-gray-800 text-center py-2 text-xs text-gray-400">
          Waiting for {setup.scoringTeam === 'A' ? teamNames.B : teamNames.A} to start scoring...
        </div>
      )}

      {tournamentCtx && (
        <div className="bg-gray-900 border-b border-gray-700">
          <button
            onClick={() => setShowTournamentPanel(!showTournamentPanel)}
            className="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-300 hover:text-white"
          >
            <span className="font-medium">Overall Tournament Standings</span>
            <span>{showTournamentPanel ? '▾' : '▸'}</span>
          </button>
          {showTournamentPanel && <TournamentOverviewPanel tournamentCtx={tournamentCtx} currentMatchupId={tournamentCtx.matchupId} />}
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-4">
        {/* Course info bar */}
        <div className="mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-600">
            {(() => {
              const is9 = setup.holesPlaying === 'front9' || setup.holesPlaying === 'back9';
              const ratingType = setup.holesPlaying === 'front9' ? 'Front' : setup.holesPlaying === 'back9' ? 'Back' : 'Total';
              const tee = defaultTee;
              const rating = tee?.ratings?.find((r) => r.type === ratingType) || tee?.ratings?.find((r) => r.type === 'Total');
              return (
                <>
                  <span className="font-medium text-gray-800">{is9 ? `${ratingType} 9` : '18 Holes'}</span>
                  {tee && <span className="font-medium">{tee.name} ({tee.totalYardage} yds)</span>}
                  {rating && <span>CR: {rating.courseRating} · Slope: {rating.slopeRating}</span>}
                  <span>Allowance: {teamMode === 'scramble'
                    ? ((setup.handicapAllowance ?? -1) < 0 ? 'Tiered' : `${setup.handicapAllowance}%`)
                    : `${setup.handicapAllowance ?? 100}%`}</span>
                </>
              );
            })()}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-500">
            {sortedPlayers.map((player) => {
              const teamColor = player.team === 'A' ? 'text-blue-700' : player.team === 'B' ? 'text-red-700' : 'text-gray-700';
              return (
                <span key={player.id}>
                  <span className={`font-medium ${teamColor}`}>{player.name.split(' ')[0]}</span>
                  {' '}CH: {getPlayerRawCourseHandicap(player)}
                </span>
              );
            })}
          </div>
        </div>

        {/* Stroke allocation overview */}
        <div className="mb-4">
          <button
            onClick={() => setStrokesExpanded(!strokesExpanded)}
            className="w-full flex items-center justify-between text-sm text-gray-600 hover:text-gray-900 py-1"
          >
            <span className="font-medium">Stroke Allocation</span>
            <span>{strokesExpanded ? '▾' : '▸'}</span>
          </button>
          {strokesExpanded && (
            <>
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
              {/* Handicap calculation detail */}
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
                        : sorted.length === 3 ? [0.20, 0.15, 0.10]
                        : [0.20, 0.15, 0.10, 0.05];
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
                                <span>CH: {getPlayerRawCourseHandicap(p)}</span>
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
                      const is9 = setup.holesPlaying === 'front9' || setup.holesPlaying === 'back9';
                      const ratingType = setup.holesPlaying === 'front9' ? 'Front'
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
                          <span>Using: {usingFallback ? 'Total÷2' : ratingType}</span>
                          <span>Slope: {usedRating?.slopeRating ?? '–'}</span>
                          <span>CR: {usedRating?.courseRating ?? '–'}</span>
                          <span>CH: {getPlayerEffectiveHcap(player)}</span>
                          <span className="font-bold">Plays: {getPlayingHandicap(player)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Hole navigation */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevHole} disabled={isFirstHole} className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-30 font-medium">
            ←
          </button>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">Hole {currentHole}</p>
            <p className="text-sm text-gray-500">
              Par {currentHoleData?.par} · {currentHoleData?.yardage} yds · Hdcp {currentHoleData?.handicap}
            </p>
          </div>
          <button onClick={nextHole} disabled={isLastHole} className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-30 font-medium">
            →
          </button>
        </div>

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

          function stablefordPts(net: number, par: number): number {
            const diff = net - par;
            if (diff <= -3) return 5;
            if (diff === -2) return 4;
            if (diff === -1) return 3;
            if (diff === 0) return 2;
            if (diff === 1) return 1;
            return 0;
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
    const diff = net - par;
    if (diff <= -3) return 5;
    if (diff === -2) return 4;
    if (diff === -1) return 3;
    if (diff === 0) return 2;
    if (diff === 1) return 1;
    return 0;
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

  function finishGame() {
    if (tournamentCtx) {
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

            // Merge local + remote scores before saving
            const allScores = setup!.scoringTeam
              ? mergeScores(scores, remoteScores)
              : scores;

            // Save scores first (needed for bonus computations)
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

              const backResult = backIsMatch
                ? computeMatchPlayResult(teamAPlayers, teamBPlayers, backHoles, setup!.splitFormat.pointsForWin ?? round.pointsForWin, setup!.splitFormat.pointsForTie ?? round.pointsForTie, setup!.splitFormat.pointsForLoss ?? round.pointsForLoss)
                : computeStrokePlayResult(teamAPlayers, teamBPlayers, backHoles, setup!.splitFormat.pointsForWin ?? round.pointsForWin, setup!.splitFormat.pointsForTie ?? round.pointsForTie, setup!.splitFormat.pointsForLoss ?? round.pointsForLoss);

              pointsTeamA = frontResult.pointsTeamA + backResult.pointsTeamA;
              pointsTeamB = frontResult.pointsTeamB + backResult.pointsTeamB;
              winningTeamId = pointsTeamA > pointsTeamB ? 'team-a'
                : pointsTeamB > pointsTeamA ? 'team-b' : null;
              summary = `Front: ${frontResult.summary} · Back: ${backResult.summary}`;
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
                  if (m.result.winningTeamId === 'team-a') aWins++;
                  else if (m.result.winningTeamId === 'team-b') bWins++;
                  else ties++;
                  const label = m.result.winningTeamId === 'team-a' ? tournament.teams[0].name
                    : m.result.winningTeamId === 'team-b' ? tournament.teams[1].name : 'Tied';
                  details.push(`${m.groupLabel}: ${label}`);
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
    const diff = net - par;
    if (diff <= -3) return 5;
    if (diff === -2) return 4;
    if (diff === -1) return 3;
    if (diff === 0) return 2;
    if (diff === 1) return 1;
    return 0;
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

  const ptsA = teamAHolesWon * round.pointsForWin + holesTied * round.pointsForTie;
  const ptsB = teamBHolesWon * round.pointsForWin + holesTied * round.pointsForTie;

  // Compute overall tournament total (finalized + all live matches)
  const standings = computeStandings(tournament);
  let totalA = standings.teamAPoints;
  let totalB = standings.teamBPoints;
  const matchScores: { label: string; a: number; b: number; isCurrent: boolean }[] = [];

  for (const r of tournament.rounds) {
    for (const m of r.matchups) {
      if (!m.gameId || m.result) continue;
      let mA: number;
      let mB: number;
      if (m.id === matchup.id) {
        mA = ptsA;
        mB = ptsB;
      } else {
        const mScores = loadGameScores(m.id);
        if (!mScores || mScores.length === 0) continue;
        const status = computeLiveMatchStatus(mScores, m, r, tournament);
        if (!status) continue;
        mA = status.holesWonA * r.pointsForWin + status.holesTied * r.pointsForTie;
        mB = status.holesWonB * r.pointsForWin + status.holesTied * r.pointsForTie;
      }
      totalA += mA;
      totalB += mB;
      const aNames = tournament.players.filter((p) => m.teamAPlayerIds.includes(p.id)).map((p) => p.name.split(' ')[0]).join('/');
      const bNames = tournament.players.filter((p) => m.teamBPlayerIds.includes(p.id)).map((p) => p.name.split(' ')[0]).join('/');
      matchScores.push({ label: `${aNames} vs ${bNames}`, a: mA, b: mB, isCurrent: m.id === matchup.id });
    }
  }

  return (
    <div className="bg-green-950 text-white py-2 px-4">
      <div className="text-center font-bold text-sm">
        <span className="text-blue-300">{teamAName} {totalA}</span>
        <span className="mx-2 text-green-500">—</span>
        <span className="text-red-300">{teamBName} {totalB}</span>
      </div>
      {matchScores.length > 0 && (
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

function TournamentOverviewPanel({ tournamentCtx, currentMatchupId }: { tournamentCtx: TournamentGameContext; currentMatchupId: string }) {
  const tournament = loadTournament(tournamentCtx.tournamentId);
  if (!tournament) return null;

  const standings = computeStandings(tournament);
  const teamA = tournament.teams[0];
  const teamB = tournament.teams[1];

  // Add live provisional scores from in-progress matches
  let liveA = standings.teamAPoints;
  let liveB = standings.teamBPoints;
  for (const round of tournament.rounds) {
    for (const matchup of round.matchups) {
      if (!matchup.gameId || matchup.result) continue;
      const scores = loadGameScores(matchup.id);
      if (!scores || scores.length === 0) continue;
      const status = computeLiveMatchStatus(scores, matchup, round, tournament);
      if (status) {
        liveA += status.holesWonA * round.pointsForWin + status.holesTied * round.pointsForTie;
        liveB += status.holesWonB * round.pointsForWin + status.holesTied * round.pointsForTie;
      }
    }
  }

  const currentRound = tournament.rounds.find((r) => r.id === tournamentCtx.roundId);
  const otherMatchups = currentRound?.matchups.filter((m) => m.id !== currentMatchupId) || [];

  return (
    <div className="px-4 pb-3 space-y-3">
      {/* Cumulative score */}
      <div className="flex items-center justify-center gap-4 py-2">
        <div className="text-center">
          <p className="text-[10px] text-blue-400 uppercase">{teamA.name}</p>
          <p className="text-2xl font-black text-white">{liveA}</p>
        </div>
        <span className="text-gray-600">—</span>
        <div className="text-center">
          <p className="text-[10px] text-red-400 uppercase">{teamB.name}</p>
          <p className="text-2xl font-black text-white">{liveB}</p>
        </div>
      </div>

      {/* All matches in this round */}
      {currentRound && currentRound.matchups.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">All Matches — {currentRound.dayLabel}</p>
          <div className="space-y-1.5">
            {currentRound.matchups.map((m) => (
              <OtherMatchupRow key={m.id} matchup={m} tournament={tournament} isCurrent={m.id === currentMatchupId} />
            ))}
          </div>
        </div>
      )}

      {/* Completed rounds summary */}
      {standings.roundResults.filter((rr) => {
        const r = tournament.rounds.find((rd) => rd.id === rr.roundId);
        return r && r.status === 'completed' && r.id !== tournamentCtx.roundId;
      }).length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Previous Rounds</p>
          {standings.roundResults.map((rr) => {
            const r = tournament.rounds.find((rd) => rd.id === rr.roundId);
            if (!r || r.status !== 'completed' || r.id === tournamentCtx.roundId) return null;
            return (
              <div key={rr.roundId} className="flex items-center justify-between text-xs text-gray-400 py-0.5">
                <span>{r.dayLabel}</span>
                <span>
                  <span className="text-blue-300">{rr.teamAPoints}</span>
                  {' — '}
                  <span className="text-red-300">{rr.teamBPoints}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OtherMatchupRow({ matchup, tournament, isCurrent }: { matchup: RoundMatchup; tournament: Tournament; isCurrent?: boolean }) {
  const teamAPlayers = tournament.players.filter((p) => matchup.teamAPlayerIds.includes(p.id));
  const teamBPlayers = tournament.players.filter((p) => matchup.teamBPlayerIds.includes(p.id));

  const teamANames = teamAPlayers.map((p) => p.name.split(' ')[0]).join('/');
  const teamBNames = teamBPlayers.map((p) => p.name.split(' ')[0]).join('/');

  let statusText: string;
  let statusColor: string;

  if (matchup.result) {
    statusText = matchup.result.summary;
    statusColor = 'text-green-400';
  } else if (matchup.gameId) {
    statusText = 'In Progress';
    statusColor = 'text-yellow-400';
  } else {
    statusText = 'Not Started';
    statusColor = 'text-gray-600';
  }

  return (
    <div className={`flex items-center justify-between rounded px-2.5 py-1.5 ${isCurrent ? 'bg-gray-700 ring-1 ring-green-600' : 'bg-gray-800'}`}>
      <div className="text-xs">
        <span className="text-blue-300">{teamANames}</span>
        <span className="text-gray-600 mx-1">vs</span>
        <span className="text-red-300">{teamBNames}</span>
        {isCurrent && <span className="ml-1.5 text-[9px] text-green-500">(you)</span>}
      </div>
      <span className={`text-[10px] font-medium ${statusColor}`}>{statusText}</span>
    </div>
  );
}

function LiveMatchBanner({
  setup,
  localScores,
  remoteScores,
  teamNames,
  tournamentCtx,
}: {
  setup: GameSetup;
  localScores: GameScore[];
  remoteScores: GameScore[];
  teamNames: { A: string; B: string };
  tournamentCtx: TournamentGameContext;
}) {
  const tournament = loadTournament(tournamentCtx.tournamentId);
  if (!tournament) return null;
  const round = tournament.rounds.find((r) => r.id === tournamentCtx.roundId);
  if (!round) return null;
  const matchup = round.matchups.find((m) => m.id === tournamentCtx.matchupId);
  if (!matchup) return null;

  const merged = [...remoteScores];
  for (const s of localScores) {
    const idx = merged.findIndex((r) => r.playerId === s.playerId && r.hole === s.hole);
    if (idx >= 0) merged[idx] = s;
    else merged.push(s);
  }

  const status = computeLiveMatchStatus(merged, matchup, round, tournament);
  if (!status || status.thru === 0) return null;

  const holesWonA = status.holesWonA;
  const holesWonB = status.holesWonB;
  const ptsA = holesWonA * round.pointsForWin + status.holesTied * round.pointsForTie;
  const ptsB = holesWonB * round.pointsForWin + status.holesTied * round.pointsForTie;

  const diff = ptsA - ptsB;
  const statusText = diff === 0 ? 'All Square'
    : diff > 0 ? `${teamNames.A} ${holesWonA - holesWonB} UP`
    : `${teamNames.B} ${holesWonB - holesWonA} UP`;

  const remoteTeam = setup.scoringTeam === 'A' ? 'B' : 'A';
  const remoteThru = new Set(remoteScores.map((s) => s.hole)).size;

  return (
    <div className="bg-green-950 text-white py-2 px-4">
      <div className="flex items-center justify-between">
        <div className="text-center flex-1">
          <span className="font-bold text-blue-300">
            {teamNames.A} {holesWonA}
          </span>
          <span className="mx-2 text-green-300">—</span>
          <span className="font-bold text-red-300">
            {teamNames.B} {holesWonB}
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs text-green-200 font-medium">{statusText}</p>
          <p className="text-[10px] text-green-400">
            Thru {status.thru} · {teamNames[remoteTeam]}: {remoteThru}H scored
          </p>
        </div>
      </div>
    </div>
  );
}
