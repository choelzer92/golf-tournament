'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { GameScore } from '@/lib/game-state';
import type { Tournament, TournamentRound, RoundMatchup } from '@/lib/tournament-state';
import { loadTournament, loadGameScores, fetchGameScores, computeStandings, fetchTournament, subscribeToTournament, subscribeToScores } from '@/lib/tournament-state';
import { computeLiveMatchStatus, computeSplitMatchStatuses, computeNassauStatus, computeHoleWinners, getHoleDataForRound, getPlayerStrokesForHole, computePlayerStablefordPoints, recomputeMatchResult, getTeamStablefordForHole } from '@/lib/live-scoring';
import type { NassauStatus, HoleWinner, SplitMatchup } from '@/lib/live-scoring';
import { resolveStablefordScale } from '@/lib/formats';

export default function ScoreboardPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [scoreTick, setScoreTick] = useState(0);

  useEffect(() => {
    const cached = loadTournament(id);
    if (cached) setTournament(cached);
    fetchTournament(id).then((t) => {
      if (t) setTournament(t);
      else if (!cached) router.push('/dashboard');
    });
    const channel = subscribeToTournament(id, (t) => setTournament(t));
    return () => { channel.unsubscribe(); };
  }, [id, router]);

  // Subscribe to score changes for all in-progress matchups
  useEffect(() => {
    if (!tournament) return;
    const inProgressMatchups = tournament.rounds
      .flatMap((r) => r.matchups)
      .filter((m) => m.gameId && !m.result);

    if (inProgressMatchups.length === 0) return;

    // Fetch latest scores for in-progress matchups, then trigger re-render
    Promise.all(inProgressMatchups.map((m) => fetchGameScores(m.id))).then(() => {
      setScoreTick((t) => t + 1);
    });

    const channels = inProgressMatchups.map((m) =>
      subscribeToScores(m.id, () => setScoreTick((t) => t + 1))
    );
    return () => { channels.forEach((ch) => ch.unsubscribe()); };
  }, [tournament?.rounds.map((r) => r.matchups.filter((m) => m.gameId && !m.result).map((m) => m.id)).flat().join(',')]);

  if (!tournament) return null;

  const standings = computeStandings(tournament);
  const teamA = tournament.teams[0];
  const teamB = tournament.teams[1];

  // Compute live provisional standings: finalized + in-progress hole wins
  let liveA = standings.teamAPoints;
  let liveB = standings.teamBPoints;
  const hasLiveMatches = tournament.rounds.some((r) =>
    r.matchups.some((m) => m.gameId && !m.result)
  );
  if (hasLiveMatches) {
    for (const round of tournament.rounds) {
      for (const matchup of round.matchups) {
        if (!matchup.gameId || matchup.result) continue;
        const scores = loadGameScores(matchup.id);
        if (!scores || !Array.isArray(scores) || scores.length === 0) continue;

        const splitStatuses = computeSplitMatchStatuses(scores, matchup, round, tournament);
        if (splitStatuses) {
          for (const sm of splitStatuses) {
            const pts = sm.type === 'team'
              ? { win: round.pointsForWin, tie: round.pointsForTie }
              : { win: round.splitFormat?.pointsForWin ?? round.pointsForWin, tie: round.splitFormat?.pointsForTie ?? round.pointsForTie };
            liveA += sm.status.holesWonA * pts.win + sm.status.holesTied * pts.tie;
            liveB += sm.status.holesWonB * pts.win + sm.status.holesTied * pts.tie;
          }
        } else {
          const liveResult = recomputeMatchResult(scores, matchup, round, tournament);
          if (liveResult) {
            liveA += liveResult.pointsTeamA;
            liveB += liveResult.pointsTeamB;
          }
        }
      }
    }
  }

  const activeRounds = tournament.rounds.filter((r) => r.status === 'in-progress');
  const completedRounds = tournament.rounds.filter((r) => r.status === 'completed');

  return (
    <div className="min-h-full bg-gray-900">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">{tournament.name}</h1>
          <button onClick={() => router.push(`/tournament/${id}`)} className="text-sm text-green-300 hover:text-white">
            Back
          </button>
        </div>
      </header>

      {/* Cumulative standings */}
      <div className="bg-gradient-to-b from-green-900 to-gray-900 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-sm text-blue-300 font-medium">{teamA.name}</p>
              <p className="text-5xl font-black text-white">{liveA}</p>
            </div>
            <div className="text-3xl text-green-600 font-light">—</div>
            <div className="text-center">
              <p className="text-sm text-red-300 font-medium">{teamB.name}</p>
              <p className="text-5xl font-black text-white">{liveB}</p>
            </div>
          </div>
          {liveA !== liveB && (
            <p className="text-center text-green-400 text-sm mt-2 font-medium">
              {liveA > liveB ? teamA.name : teamB.name} leads by {Math.abs(liveA - liveB)}
              {hasLiveMatches && ' (provisional)'}
            </p>
          )}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Active rounds — show first */}
        {activeRounds.map((round) => (
          <div key={round.id} className="space-y-3">
            <RoundScoreboard round={round} tournament={tournament} scoreTick={scoreTick} />
            {round.bonuses.some((b) => b.type.startsWith('nassau')) && (
              <NassauPanel round={round} tournament={tournament} />
            )}
          </div>
        ))}

        {/* Completed rounds */}
        {completedRounds.map((round) => (
          <div key={round.id} className="space-y-3">
            <RoundScoreboard round={round} tournament={tournament} scoreTick={scoreTick} />
            {round.bonuses.some((b) => b.type.startsWith('nassau')) && (
              <NassauPanel round={round} tournament={tournament} />
            )}
          </div>
        ))}

        {activeRounds.length === 0 && completedRounds.length === 0 && (
          <p className="text-center text-gray-500 py-8">No matches in progress or completed yet.</p>
        )}
      </main>
    </div>
  );
}

function RoundScoreboard({ round, tournament, scoreTick }: { round: TournamentRound; tournament: Tournament; scoreTick: number }) {
  const teamA = tournament.teams[0];
  const teamB = tournament.teams[1];

  let matchPtsA = 0;
  let matchPtsB = 0;
  for (const m of round.matchups) {
    if (m.result) {
      matchPtsA += m.result.pointsTeamA;
      matchPtsB += m.result.pointsTeamB;
    }
  }

  // Compute bonus points
  let bonusPtsA = 0;
  let bonusPtsB = 0;
  const bonusDetails: { name: string; a: number; b: number; detail?: string }[] = [];
  for (const bonus of round.bonuses || []) {
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
    } else if (bonus.result.winningTeamId === undefined || bonus.result.winningTeamId === null) {
      a = bonus.points * 0.5;
      b = bonus.points * 0.5;
    }
    bonusPtsA += a;
    bonusPtsB += b;
    if (a > 0 || b > 0) {
      bonusDetails.push({ name: bonus.name, a, b, detail: bonus.result.detail });
    }
  }

  const roundPtsA = matchPtsA + bonusPtsA;
  const roundPtsB = matchPtsB + bonusPtsB;

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-750 border-b border-gray-700">
        <div>
          <p className="text-white font-bold text-sm">{round.dayLabel}</p>
          <p className="text-gray-400 text-xs">{round.holesPlaying === '18' ? '18 holes' : '9 holes'}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            round.status === 'in-progress' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'
          }`}>
            {round.status === 'in-progress' ? 'LIVE' : 'FINAL'}
          </span>
          {(roundPtsA > 0 || roundPtsB > 0) && (
            <span className="text-sm font-bold text-gray-300">
              <span className="text-blue-300">{roundPtsA}</span> — <span className="text-red-300">{roundPtsB}</span>
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-gray-700">
        {round.matchups.map((matchup) => (
          <MatchupScorecard key={matchup.id} matchup={matchup} round={round} tournament={tournament} />
        ))}
      </div>

      {/* Bonus breakdown */}
      {bonusDetails.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-700 bg-gray-800/50">
          <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Bonuses</p>
          {bonusDetails.map((bd, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-0.5">
              <span className="text-gray-400">{bd.name}{bd.detail ? ` — ${bd.detail}` : ''}</span>
              <span className="text-gray-300 font-medium">
                <span className="text-blue-300">+{bd.a}</span> / <span className="text-red-300">+{bd.b}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchupScorecard({ matchup, round, tournament }: { matchup: RoundMatchup; round: TournamentRound; tournament: Tournament }) {
  const [expanded, setExpanded] = useState(false);
  const [scores, setScores] = useState<GameScore[] | null>(loadGameScores(matchup.id));

  useEffect(() => {
    fetchGameScores(matchup.id).then((s) => {
      if (s) setScores(s);
    });
    if (matchup.gameId && !matchup.result) {
      const channel = subscribeToScores(matchup.id, (s) => {
        if (Array.isArray(s)) setScores(s);
      });
      return () => { channel.unsubscribe(); };
    }
  }, [matchup.id, matchup.gameId, matchup.result]);

  const teamAPlayers = tournament.players.filter((p) => matchup.teamAPlayerIds.includes(p.id));
  const teamBPlayers = tournament.players.filter((p) => matchup.teamBPlayerIds.includes(p.id));
  const allPlayers = [...teamAPlayers, ...teamBPlayers];

  const savedScores = scores;
  const holeData = getHoleDataForRound(round);

  // Compute split match statuses for individual back 9 pairings (live or completed)
  const splitStatuses = (matchup.gameId && savedScores && savedScores.length > 0)
    ? computeSplitMatchStatuses(savedScores, matchup, round, tournament)
    : null;

  const liveStatus = (!matchup.result && matchup.gameId && savedScores && savedScores.length > 0 && !splitStatuses)
    ? computeLiveMatchStatus(savedScores, matchup, round, tournament)
    : null;

  let livePointsA = 0;
  let livePointsB = 0;
  let liveSummary = '';
  if (splitStatuses) {
    for (const sm of splitStatuses) {
      const pts = sm.type === 'team'
        ? { win: round.pointsForWin, tie: round.pointsForTie }
        : { win: round.splitFormat?.pointsForWin ?? round.pointsForWin, tie: round.splitFormat?.pointsForTie ?? round.pointsForTie };
      livePointsA += sm.status.holesWonA * pts.win + sm.status.holesTied * pts.tie;
      livePointsB += sm.status.holesWonB * pts.win + sm.status.holesTied * pts.tie;
    }
  } else if (savedScores && savedScores.length > 0 && !matchup.result) {
    const liveResult = recomputeMatchResult(savedScores, matchup, round, tournament);
    if (liveResult) {
      livePointsA = liveResult.pointsTeamA;
      livePointsB = liveResult.pointsTeamB;
      liveSummary = liveResult.summary;
    }
  }

  const isLive = !matchup.result && matchup.gameId;
  const hasLiveData = splitStatuses || (livePointsA > 0 || livePointsB > 0) || liveStatus;

  return (
    <div className="px-4 py-3">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-gray-500">{matchup.groupLabel}</span>
              {matchup.result ? (
                <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">Final</span>
              ) : matchup.gameId ? (
                <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 animate-pulse">Live</span>
              ) : null}
            </div>

            {/* Split format: show each sub-matchup */}
            {splitStatuses ? (
              <div className="space-y-1.5">
                {splitStatuses.map((sm, idx) => {
                  const pts = sm.type === 'team'
                    ? { win: round.pointsForWin, tie: round.pointsForTie }
                    : { win: round.splitFormat?.pointsForWin ?? round.pointsForWin, tie: round.splitFormat?.pointsForTie ?? round.pointsForTie };
                  const smPtsA = sm.status.holesWonA * pts.win + sm.status.holesTied * pts.tie;
                  const smPtsB = sm.status.holesWonB * pts.win + sm.status.holesTied * pts.tie;
                  const diff = sm.status.holesWonA - sm.status.holesWonB;
                  const statusText = sm.status.thru === 0 ? '–'
                    : diff === 0 ? 'AS'
                    : diff > 0 ? `${tournament.teams[0].name} ${diff} UP`
                    : `${tournament.teams[1].name} ${Math.abs(diff)} UP`;
                  return (
                    <div key={idx} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1 py-0.5 rounded ${sm.type === 'team' ? 'bg-purple-500/20 text-purple-300' : 'bg-orange-500/20 text-orange-300'}`}>
                          {sm.holes === 'front' ? 'F9' : 'B9'}
                        </span>
                        <span className="text-xs text-gray-300">{sm.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${diff > 0 ? 'text-blue-300' : diff < 0 ? 'text-red-300' : 'text-gray-400'}`}>
                          {statusText}
                        </span>
                        {sm.status.thru > 0 && (
                          <span className="text-[10px] text-gray-500">thru {sm.status.thru}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  {teamAPlayers.map((p) => (
                    <p key={p.id} className="text-sm text-blue-300 truncate">{p.name}</p>
                  ))}
                </div>
                <div>
                  {teamBPlayers.map((p) => (
                    <p key={p.id} className="text-sm text-red-300 truncate">{p.name}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="ml-4 text-right shrink-0">
            {matchup.result ? (
              <>
                {round.formatId === 'stableford' && round.scoringMethod === 'stroke-play' ? (
                  <>
                    <p className="text-sm font-bold text-gray-300">{matchup.result.summary.replace(' (stableford pts)', '')}</p>
                    <p className="text-[10px] text-gray-500">Pts: {matchup.result.pointsTeamA} — {matchup.result.pointsTeamB}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-gray-300">
                      <span className="text-blue-300">{matchup.result.pointsTeamA}</span>
                      {' — '}
                      <span className="text-red-300">{matchup.result.pointsTeamB}</span>
                    </p>
                    <p className="text-[10px] text-gray-500">{matchup.result.summary}</p>
                  </>
                )}
              </>
            ) : hasLiveData ? (
              <>
                {round.formatId === 'stableford' && round.scoringMethod === 'stroke-play' && liveSummary ? (
                  <>
                    <p className="text-sm font-bold text-gray-300">{liveSummary.replace(' (stableford pts)', '')}</p>
                    <p className="text-[10px] text-gray-500">Pts: {livePointsA} — {livePointsB}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-gray-300">
                      <span className="text-blue-300">{livePointsA}</span>
                      {' — '}
                      <span className="text-red-300">{livePointsB}</span>
                    </p>
                    {liveSummary && <p className="text-[10px] text-gray-500">{liveSummary}</p>}
                    {!liveSummary && liveStatus && <p className="text-[10px] text-gray-500">thru {liveStatus.thru}</p>}
                  </>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400">{isLive ? 'In Progress' : 'Not Started'}</p>
            )}
            <span className="text-gray-600 text-xs">{expanded ? '▾' : '▸'}</span>
          </div>
        </div>
      </button>

      {expanded && savedScores && holeData.length > 0 && (() => {
        const holeWinners = computeHoleWinners(savedScores, matchup, round, tournament);

        function getTeamNetForDisplay(teamPlayerIds: string[], hole: { number: number; par: number; handicap: number }): number | null {
          const nets: number[] = [];
          for (const pid of teamPlayerIds) {
            const sc = savedScores!.find((s) => s.playerId === pid && s.hole === hole.number);
            if (!sc) continue;
            const strokes = getPlayerStrokesForHole(pid, hole.handicap, hole.number, matchup, round, tournament);
            nets.push(sc.grossScore - strokes);
          }
          if (nets.length === 0) return null;
          nets.sort((a, b) => a - b);

          const activeTeamMode = (round.splitFormat && hole.number > 9) ? round.splitFormat.teamMode : round.teamMode;
          if (activeTeamMode === 'two-best-balls') {
            return nets.length >= 2 ? nets[0] + nets[1] : null;
          }
          if (activeTeamMode === 'combined') {
            return nets.reduce((s, n) => s + n, 0);
          }
          // best-ball, individual, scramble, alternate-shot: single best net
          return nets[0];
        }

        return (
        <div className="mt-3 overflow-x-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="text-gray-500">
                <th className="px-2 py-1 text-left font-medium sticky left-0 bg-gray-800">Hole</th>
                {holeData.map((h) => (
                  <th key={h.number} className="px-1 py-1 text-center font-medium min-w-[22px]">{h.number}</th>
                ))}
                <th className="px-2 py-1 text-center font-medium">Tot</th>
              </tr>
              <tr className="text-gray-600 border-b border-gray-700">
                <td className="px-2 py-0.5 text-left font-medium sticky left-0 bg-gray-800">Par</td>
                {holeData.map((h) => (
                  <td key={h.number} className="px-1 py-0.5 text-center">{h.par}</td>
                ))}
                <td className="px-2 py-0.5 text-center">{holeData.reduce((s, h) => s + h.par, 0)}</td>
              </tr>
            </thead>
            <tbody>
              {allPlayers.map((player) => {
                const isTeamA = matchup.teamAPlayerIds.includes(player.id);
                const total = holeData.reduce((sum, h) => {
                  const sc = savedScores.find((s) => s.playerId === player.id && s.hole === h.number);
                  return sum + (sc?.grossScore || 0);
                }, 0);
                const totalPar = holeData.reduce((s, h) => s + h.par, 0);
                const diff = total - totalPar;
                const isStableford = round.formatId === 'stableford';
                const stbPts = isStableford && total > 0
                  ? computePlayerStablefordPoints(savedScores, player.id, matchup, round, tournament)
                  : 0;
                return (
                  <tr key={player.id} className="border-t border-gray-700/50">
                    <td className={`px-2 py-1 font-medium whitespace-nowrap sticky left-0 bg-gray-800 ${isTeamA ? 'text-blue-300' : 'text-red-300'}`}>
                      {player.name.split(' ')[0]}
                    </td>
                    {holeData.map((h) => {
                      const sc = savedScores.find((s) => s.playerId === player.id && s.hole === h.number);
                      const score = sc?.grossScore;
                      const strokes = score ? getPlayerStrokesForHole(player.id, h.handicap, h.number, matchup, round, tournament) : 0;
                      const netScore = score ? score - strokes : null;
                      const netToPar = netScore !== null ? netScore - h.par : null;
                      const w = holeWinners.get(h.number);
                      const wonHole = (isTeamA && w === 'A') || (!isTeamA && w === 'B');
                      const cellBg = wonHole ? (isTeamA ? 'bg-blue-900/30' : 'bg-red-900/30') : '';
                      let decoration = '';
                      if (netToPar !== null) {
                        if (netToPar <= -2) decoration = 'ring-2 ring-offset-1 ring-offset-gray-800 ring-yellow-500 rounded-full';
                        else if (netToPar === -1) decoration = 'ring-1 ring-offset-1 ring-offset-gray-800 ring-red-400 rounded-full';
                        else if (netToPar === 1) decoration = 'ring-1 ring-offset-1 ring-offset-gray-800 ring-blue-400 rounded-sm';
                        else if (netToPar >= 2) decoration = 'ring-2 ring-offset-1 ring-offset-gray-800 ring-blue-500 rounded-sm';
                      }
                      const scoreColorClass = !score ? 'text-gray-600'
                        : netToPar! <= -2 ? 'text-yellow-400 font-bold'
                        : netToPar === -1 ? 'text-red-400 font-bold'
                        : netToPar === 0 ? 'text-gray-300'
                        : netToPar === 1 ? 'text-blue-400'
                        : 'text-blue-500 font-bold';
                      return (
                        <td key={h.number} className={`px-1 py-1 text-center ${scoreColorClass} ${cellBg}`}>
                          {score ? (
                            <span className={`inline-flex items-center justify-center w-5 h-5 text-[11px] ${decoration}`}>{score}</span>
                          ) : '–'}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-bold text-white">
                      {isStableford && total > 0 ? (
                        <><span className="text-green-400">{stbPts}</span><span className="block text-[9px] text-gray-500 font-normal">{total} gross</span></>
                      ) : total ? (
                        <>{total}<span className={`ml-0.5 text-[10px] ${diff > 0 ? 'text-blue-400' : diff < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                          {diff > 0 ? `+${diff}` : diff === 0 ? 'E' : diff}
                        </span></>
                      ) : '–'}
                    </td>
                  </tr>
                );
              })}
              {/* Team A row */}
              <tr className="border-t-2 border-blue-500/50">
                <td className="px-2 py-1 font-bold text-blue-400 sticky left-0 bg-gray-800 text-[10px]">
                  {tournament.teams[0].name}{round.formatId === 'stableford' ? ' pts' : ''}
                </td>
                {holeData.map((h) => {
                  const val = round.formatId === 'stableford'
                    ? getTeamStablefordForHole(teamAPlayers, h, savedScores, round, holeData, allPlayers)
                    : getTeamNetForDisplay(matchup.teamAPlayerIds, h);
                  const w = holeWinners.get(h.number);
                  const bg = w === 'A' ? 'bg-blue-900/30' : '';
                  return (
                    <td key={h.number} className={`px-1 py-1 text-center text-blue-300 font-medium ${bg}`}>
                      {val !== null ? val : '–'}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center font-bold text-blue-300">
                  {round.formatId === 'stableford'
                    ? holeData.reduce((sum, h) => sum + (getTeamStablefordForHole(teamAPlayers, h, savedScores, round, holeData, allPlayers) ?? 0), 0)
                    : (holeData.reduce((sum, h) => sum + (getTeamNetForDisplay(matchup.teamAPlayerIds, h) ?? 0), 0) || '–')}
                </td>
              </tr>
              {/* Team B row */}
              <tr className="border-t border-red-500/50">
                <td className="px-2 py-1 font-bold text-red-400 sticky left-0 bg-gray-800 text-[10px]">
                  {tournament.teams[1].name}{round.formatId === 'stableford' ? ' pts' : ''}
                </td>
                {holeData.map((h) => {
                  const val = round.formatId === 'stableford'
                    ? getTeamStablefordForHole(teamBPlayers, h, savedScores, round, holeData, allPlayers)
                    : getTeamNetForDisplay(matchup.teamBPlayerIds, h);
                  const w = holeWinners.get(h.number);
                  const bg = w === 'B' ? 'bg-red-900/30' : '';
                  return (
                    <td key={h.number} className={`px-1 py-1 text-center text-red-300 font-medium ${bg}`}>
                      {val !== null ? val : '–'}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center font-bold text-red-300">
                  {round.formatId === 'stableford'
                    ? holeData.reduce((sum, h) => sum + (getTeamStablefordForHole(teamBPlayers, h, savedScores, round, holeData, allPlayers) ?? 0), 0)
                    : (holeData.reduce((sum, h) => sum + (getTeamNetForDisplay(matchup.teamBPlayerIds, h) ?? 0), 0) || '–')}
                </td>
              </tr>
              {/* Hole winner row */}
              <tr className="border-t border-gray-600">
                <td className="px-2 py-0.5 text-[10px] text-gray-500 sticky left-0 bg-gray-800">Won</td>
                {holeData.map((h) => {
                  const w = holeWinners.get(h.number);
                  return (
                    <td key={h.number} className={`px-1 py-0.5 text-center text-[10px] font-bold ${
                      w === 'A' ? 'text-blue-400' : w === 'B' ? 'text-red-400' : w === 'tie' ? 'text-gray-500' : 'text-gray-700'
                    }`}>
                      {w === 'A' ? '●' : w === 'B' ? '●' : w === 'tie' ? '—' : ''}
                    </td>
                  );
                })}
                <td className="px-2 py-0.5"></td>
              </tr>
            </tbody>
          </table>
        </div>
        );
      })()}

      {expanded && !savedScores && (
        <p className="mt-3 text-xs text-gray-500 italic">No scorecard data available for this match.</p>
      )}
    </div>
  );
}

function NassauPanel({ round, tournament }: { round: TournamentRound; tournament: Tournament }) {
  const teamA = tournament.teams[0];
  const teamB = tournament.teams[1];
  const money = tournament.moneyConfig;

  const allScores: GameScore[] = [];
  for (const matchup of round.matchups) {
    const scores = loadGameScores(matchup.id);
    if (scores && Array.isArray(scores)) allScores.push(...scores);
  }

  if (round.matchups.length === 0) return null;
  const matchup = round.matchups[0];
  const nassau = computeNassauStatus(allScores, matchup, round, tournament);
  if (!nassau) return null;

  // Count gross birdies/eagles per team
  const tee = round.course?.teeSets.find((t) => t.id === round.defaultTeeId) || round.course?.teeSets[0];
  const holes = (tee?.holes || []).sort((a, b) => a.number - b.number);
  let birdiesA = 0, birdiesB = 0, eaglesA = 0, eaglesB = 0;
  const teamAIds = new Set(matchup.teamAPlayerIds);
  for (const score of allScores) {
    const hole = holes.find((h) => h.number === score.hole);
    if (!hole) continue;
    const diff = score.grossScore - hole.par;
    if (teamAIds.has(score.playerId)) {
      if (diff === -1) birdiesA++;
      else if (diff <= -2) eaglesA++;
    } else {
      if (diff === -1) birdiesB++;
      else if (diff <= -2) eaglesB++;
    }
  }

  // Compute money totals
  let moneyA = 0, moneyB = 0;
  if (money) {
    // Front
    const fDiff = nassau.front.holesWonA - nassau.front.holesWonB;
    if (fDiff > 0) { moneyA += money.nassauFront; moneyB -= money.nassauFront; }
    else if (fDiff < 0) { moneyB += money.nassauBack; moneyA -= money.nassauBack; }
    // Back
    const bDiff = nassau.back.holesWonA - nassau.back.holesWonB;
    if (bDiff > 0) { moneyA += money.nassauBack; moneyB -= money.nassauBack; }
    else if (bDiff < 0) { moneyB += money.nassauBack; moneyA -= money.nassauBack; }
    // Overall
    const oDiff = nassau.overall.holesWonA - nassau.overall.holesWonB;
    if (oDiff > 0) { moneyA += money.nassauOverall; moneyB -= money.nassauOverall; }
    else if (oDiff < 0) { moneyB += money.nassauOverall; moneyA -= money.nassauOverall; }
    // Birdies
    const birdieDiff = birdiesA - birdiesB;
    if (birdieDiff > 0) { moneyA += birdieDiff * money.birdieValue; moneyB -= birdieDiff * money.birdieValue; }
    else if (birdieDiff < 0) { moneyB += Math.abs(birdieDiff) * money.birdieValue; moneyA -= Math.abs(birdieDiff) * money.birdieValue; }
    // Eagles
    const eagleDiff = eaglesA - eaglesB;
    if (eagleDiff > 0) { moneyA += eagleDiff * money.eagleValue; moneyB -= eagleDiff * money.eagleValue; }
    else if (eagleDiff < 0) { moneyB += Math.abs(eagleDiff) * money.eagleValue; moneyA -= Math.abs(eagleDiff) * money.eagleValue; }
  }

  function NassauSide({ label, side, amount }: { label: string; side: { holesWonA: number; holesWonB: number; holesTied: number; thru: number }; amount?: number }) {
    const diff = side.holesWonA - side.holesWonB;
    const status = diff === 0 ? 'AS'
      : diff > 0 ? `${teamA.name} ${diff} UP`
      : `${teamB.name} ${Math.abs(diff)} UP`;
    const statusColor = diff === 0 ? 'text-gray-300' : diff > 0 ? 'text-blue-300' : 'text-red-300';

    return (
      <div className="flex items-center justify-between py-1.5">
        <span className="text-gray-400 font-medium text-xs w-16">{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-blue-300 font-bold text-sm">{side.holesWonA}</span>
          <span className="text-gray-600">-</span>
          <span className="text-red-300 font-bold text-sm">{side.holesWonB}</span>
        </div>
        <div className="flex items-center gap-2 w-28 justify-end">
          <span className={`text-xs font-medium ${statusColor}`}>
            {side.thru > 0 ? status : '–'}
          </span>
          {amount !== undefined && side.thru > 0 && (
            <span className="text-[10px] text-green-400 font-medium">${amount}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl px-4 py-3">
      <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider mb-1">Nassau</p>
      <NassauSide label="Front 9" side={nassau.front} amount={money?.nassauFront} />
      <NassauSide label="Back 9" side={nassau.back} amount={money?.nassauBack} />
      <div className="border-t border-gray-700 mt-1 pt-1">
        <NassauSide label="Overall" side={nassau.overall} amount={money?.nassauOverall} />
      </div>

      {/* Birdie/Eagle bonus */}
      {(birdiesA > 0 || birdiesB > 0 || eaglesA > 0 || eaglesB > 0) && (
        <div className="border-t border-gray-700 mt-2 pt-2">
          <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider mb-1">Bonuses</p>
          {(birdiesA > 0 || birdiesB > 0) && (
            <div className="flex items-center justify-between py-0.5">
              <span className="text-gray-400 text-xs">Birdies</span>
              <div className="flex items-center gap-3">
                <span className="text-blue-300 text-xs">{birdiesA}</span>
                <span className="text-gray-600">-</span>
                <span className="text-red-300 text-xs">{birdiesB}</span>
              </div>
              {money && (
                <span className={`text-[10px] font-medium ${birdiesA > birdiesB ? 'text-blue-300' : birdiesB > birdiesA ? 'text-red-300' : 'text-gray-500'}`}>
                  {birdiesA !== birdiesB ? `$${Math.abs(birdiesA - birdiesB) * money.birdieValue}` : 'push'}
                </span>
              )}
            </div>
          )}
          {(eaglesA > 0 || eaglesB > 0) && (
            <div className="flex items-center justify-between py-0.5">
              <span className="text-gray-400 text-xs">Eagles</span>
              <div className="flex items-center gap-3">
                <span className="text-blue-300 text-xs">{eaglesA}</span>
                <span className="text-gray-600">-</span>
                <span className="text-red-300 text-xs">{eaglesB}</span>
              </div>
              {money && (
                <span className={`text-[10px] font-medium ${eaglesA > eaglesB ? 'text-blue-300' : eaglesB > eaglesA ? 'text-red-300' : 'text-gray-500'}`}>
                  {eaglesA !== eaglesB ? `$${Math.abs(eaglesA - eaglesB) * money.eagleValue}` : 'push'}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Money total */}
      {money && (moneyA !== 0 || moneyB !== 0) && (
        <div className="border-t border-gray-700 mt-2 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs font-medium">Net</span>
            <span className={`text-sm font-bold ${moneyA > 0 ? 'text-blue-300' : moneyA < 0 ? 'text-red-300' : 'text-gray-300'}`}>
              {moneyA > 0 ? `${teamA.name} +$${moneyA}` : moneyB > 0 ? `${teamB.name} +$${moneyB}` : 'Even'}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5 text-right">
            ${Math.abs(moneyA) / (tournament.teams[0].playerIds.length || 4)}/player
          </p>
        </div>
      )}
    </div>
  );
}
