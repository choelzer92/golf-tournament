'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { GameScore } from '@/lib/game-state';
import type { Tournament, TournamentRound, RoundMatchup } from '@/lib/tournament-state';
import { loadTournament, loadGameScores, fetchGameScores, computeStandings, fetchTournament, subscribeToTournament, subscribeToScores } from '@/lib/tournament-state';
import { computeLiveMatchStatus, computeNassauStatus, computeHoleWinners, getHoleDataForRound, getPlayerStrokesForHole, computePlayerStablefordPoints } from '@/lib/live-scoring';
import type { NassauStatus, HoleWinner } from '@/lib/live-scoring';

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
        const status = computeLiveMatchStatus(scores, matchup, round, tournament);
        if (status) {
          liveA += status.holesWonA * round.pointsForWin + status.holesTied * round.pointsForTie;
          liveB += status.holesWonB * round.pointsForWin + status.holesTied * round.pointsForTie;
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

  const liveStatus = (!matchup.result && matchup.gameId && savedScores && savedScores.length > 0)
    ? computeLiveMatchStatus(savedScores, matchup, round, tournament)
    : null;

  const livePointsA = liveStatus ? liveStatus.holesWonA * round.pointsForWin + liveStatus.holesTied * round.pointsForTie : 0;
  const livePointsB = liveStatus ? liveStatus.holesWonB * round.pointsForWin + liveStatus.holesTied * round.pointsForTie : 0;

  const statusLabel = matchup.result
    ? matchup.result.summary
    : liveStatus
      ? `${livePointsA} — ${livePointsB} (thru ${liveStatus.thru})`
      : matchup.gameId ? 'In Progress' : 'Not Started';

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
          </div>
          <div className="ml-4 text-right shrink-0">
            {matchup.result ? (
              <>
                <p className="text-sm font-bold text-gray-300">
                  <span className="text-blue-300">{matchup.result.pointsTeamA}</span>
                  {' — '}
                  <span className="text-red-300">{matchup.result.pointsTeamB}</span>
                </p>
                <p className="text-[10px] text-gray-500">{matchup.result.summary}</p>
              </>
            ) : liveStatus ? (
              <>
                <p className="text-sm font-bold text-gray-300">
                  <span className="text-blue-300">{livePointsA}</span>
                  {' — '}
                  <span className="text-red-300">{livePointsB}</span>
                </p>
                <p className="text-[10px] text-gray-500">thru {liveStatus.thru}</p>
              </>
            ) : (
              <p className="text-xs text-gray-400">{statusLabel}</p>
            )}
            <span className="text-gray-600 text-xs">{expanded ? '▾' : '▸'}</span>
          </div>
        </div>
      </button>

      {expanded && savedScores && holeData.length > 0 && (() => {
        const holeWinners = computeHoleWinners(savedScores, matchup, round, tournament);

        function getTeamBestNets(teamPlayerIds: string[], hole: { number: number; par: number; handicap: number }) {
          const nets: number[] = [];
          for (const pid of teamPlayerIds) {
            const sc = savedScores!.find((s) => s.playerId === pid && s.hole === hole.number);
            if (!sc) continue;
            const strokes = getPlayerStrokesForHole(pid, hole.handicap, hole.number, matchup, round, tournament);
            nets.push(sc.grossScore - strokes);
          }
          return nets.sort((a, b) => a - b).slice(0, 2);
        }

        return (
        <div className="mt-3 overflow-x-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="text-gray-500">
                <th className="px-2 py-1 text-left font-medium sticky left-0 bg-gray-800">Hole</th>
                {holeData.map((h) => {
                  const w = holeWinners.get(h.number);
                  const bg = w === 'A' ? 'bg-blue-900/30' : w === 'B' ? 'bg-red-900/30' : '';
                  return <th key={h.number} className={`px-1 py-1 text-center font-medium min-w-[22px] ${bg}`}>{h.number}</th>;
                })}
                <th className="px-2 py-1 text-center font-medium">Tot</th>
              </tr>
              <tr className="text-gray-600 border-b border-gray-700">
                <td className="px-2 py-0.5 text-left font-medium sticky left-0 bg-gray-800">Par</td>
                {holeData.map((h) => {
                  const w = holeWinners.get(h.number);
                  const bg = w === 'A' ? 'bg-blue-900/30' : w === 'B' ? 'bg-red-900/30' : '';
                  return <td key={h.number} className={`px-1 py-0.5 text-center ${bg}`}>{h.par}</td>;
                })}
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
                      const colBg = w === 'A' ? 'bg-blue-900/30' : w === 'B' ? 'bg-red-900/30' : '';
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
                        <td key={h.number} className={`px-1 py-1 text-center ${scoreColorClass} ${colBg}`}>
                          {score ? (
                            <span className={`inline-flex items-center justify-center w-5 h-5 text-[11px] ${decoration}`}>{score}</span>
                          ) : '–'}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-bold text-white">
                      {total || '–'}
                      {total > 0 && isStableford ? (
                        <span className="ml-0.5 text-[10px] text-green-400">{stbPts}pts</span>
                      ) : total > 0 ? (
                        <span className={`ml-0.5 text-[10px] ${diff > 0 ? 'text-blue-400' : diff < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                          {diff > 0 ? `+${diff}` : diff === 0 ? 'E' : diff}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {/* Team A best-two-nets row */}
              <tr className="border-t-2 border-blue-500/50">
                <td className="px-2 py-1 font-bold text-blue-400 sticky left-0 bg-gray-800 text-[10px]">
                  {tournament.teams[0].name}
                </td>
                {holeData.map((h) => {
                  const nets = getTeamBestNets(matchup.teamAPlayerIds, h);
                  const w = holeWinners.get(h.number);
                  const colBg = w === 'A' ? 'bg-blue-900/30' : w === 'B' ? 'bg-red-900/30' : '';
                  return (
                    <td key={h.number} className={`px-1 py-1 text-center text-blue-300 font-medium ${colBg}`}>
                      {nets.length >= 2 ? nets[0] + nets[1] : '–'}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center font-bold text-blue-300">
                  {holeData.reduce((sum, h) => {
                    const nets = getTeamBestNets(matchup.teamAPlayerIds, h);
                    return sum + (nets.length >= 2 ? nets[0] + nets[1] : 0);
                  }, 0) || '–'}
                </td>
              </tr>
              {/* Team B best-two-nets row */}
              <tr className="border-t border-red-500/50">
                <td className="px-2 py-1 font-bold text-red-400 sticky left-0 bg-gray-800 text-[10px]">
                  {tournament.teams[1].name}
                </td>
                {holeData.map((h) => {
                  const nets = getTeamBestNets(matchup.teamBPlayerIds, h);
                  const w = holeWinners.get(h.number);
                  const colBg = w === 'A' ? 'bg-blue-900/30' : w === 'B' ? 'bg-red-900/30' : '';
                  return (
                    <td key={h.number} className={`px-1 py-1 text-center text-red-300 font-medium ${colBg}`}>
                      {nets.length >= 2 ? nets[0] + nets[1] : '–'}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center font-bold text-red-300">
                  {holeData.reduce((sum, h) => {
                    const nets = getTeamBestNets(matchup.teamBPlayerIds, h);
                    return sum + (nets.length >= 2 ? nets[0] + nets[1] : 0);
                  }, 0) || '–'}
                </td>
              </tr>
              {/* Hole winner row */}
              <tr className="border-t border-gray-600">
                <td className="px-2 py-0.5 text-[10px] text-gray-500 sticky left-0 bg-gray-800">Won</td>
                {holeData.map((h) => {
                  const w = holeWinners.get(h.number);
                  const colBg = w === 'A' ? 'bg-blue-900/30' : w === 'B' ? 'bg-red-900/30' : '';
                  return (
                    <td key={h.number} className={`px-1 py-0.5 text-center text-[10px] font-bold ${colBg} ${
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

  const allScores: GameScore[] = [];
  for (const matchup of round.matchups) {
    const scores = loadGameScores(matchup.id);
    if (scores && Array.isArray(scores)) allScores.push(...scores);
  }

  if (round.matchups.length === 0) return null;
  const matchup = round.matchups[0];
  const nassau = computeNassauStatus(allScores, matchup, round, tournament);
  if (!nassau) return null;

  function NassauSide({ label, side }: { label: string; side: { holesWonA: number; holesWonB: number; holesTied: number; thru: number } }) {
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
        <span className={`text-xs font-medium ${statusColor} w-24 text-right`}>
          {side.thru > 0 ? status : '–'}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl px-4 py-3">
      <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider mb-1">Nassau</p>
      <NassauSide label="Front 9" side={nassau.front} />
      <NassauSide label="Back 9" side={nassau.back} />
      <div className="border-t border-gray-700 mt-1 pt-1">
        <NassauSide label="Overall" side={nassau.overall} />
      </div>
    </div>
  );
}
