'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { Tournament } from '@/lib/tournament-state';
import type { GameScore } from '@/lib/game-state';
import { loadTournament, loadGameScores, fetchTournament, fetchGameScores, subscribeToTournament, subscribeToScores } from '@/lib/tournament-state';
import { computeSideGameResult, computeSideGamePlayerDetails } from '@/lib/side-game';
import type { SideGameResult, SideGameTeamDetail } from '@/lib/side-game';

export default function SideGameScoreboardPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [sideResult, setSideResult] = useState<SideGameResult | null>(null);
  const [teamDetails, setTeamDetails] = useState<SideGameTeamDetail[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

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

  const sideGame = tournament?.sideGames?.[0] || null;

  useEffect(() => {
    if (!sideGame) return;

    const matchupIds = new Set<string>();
    for (const team of sideGame.teams) {
      if (team.linkedMatchupId) matchupIds.add(team.linkedMatchupId);
    }
    matchupIds.add(sideGame.ownMatchupId);

    const ids = Array.from(matchupIds);

    function recompute() {
      const allScores = new Map<string, GameScore[]>();
      for (const mid of ids) {
        const cached = loadGameScores(mid);
        if (cached) allScores.set(mid, cached);
      }
      setSideResult(computeSideGameResult(sideGame!, allScores));
      setTeamDetails(computeSideGamePlayerDetails(sideGame!, allScores));
    }

    Promise.all(ids.map((mid) => fetchGameScores(mid))).then(recompute);

    const channels = ids.map((mid) =>
      subscribeToScores(mid, () => recompute())
    );
    return () => { channels.forEach((ch) => ch.unsubscribe()); };
  }, [sideGame?.id, tournament]);

  if (!tournament || !sideGame) return null;
  if (!sideResult || sideResult.thruHole === 0) {
    return (
      <div className="min-h-full bg-gray-900">
        <header className="bg-gray-800 text-white shadow-lg">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-lg font-bold">{sideGame?.name || 'Side Game'}</h1>
            <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-white">Back</button>
          </div>
        </header>
        <div className="text-center py-12 text-gray-500">No scores yet.</div>
      </div>
    );
  }

  const frontLeg = sideResult.nassauLegs.find((l) => l.leg === 'front');
  const backLeg = sideResult.nassauLegs.find((l) => l.leg === 'back');
  const overallLeg = sideResult.nassauLegs.find((l) => l.leg === 'overall');
  if (!overallLeg) return null;

  const frontHoles = sideResult.holes.filter((h) => h.holeNumber <= 9);
  const backHoles = sideResult.holes.filter((h) => h.holeNumber > 9);
  const rankedTeams = overallLeg.rankings;

  return (
    <div className="min-h-full bg-gray-900">
      <header className="bg-gray-800 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{sideGame.name}</h1>
            <p className="text-xs text-gray-400">Thru hole {sideResult.thruHole}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/game/play')}
              className="text-sm text-yellow-300 hover:text-yellow-100 font-medium"
            >
              Scorecard
            </button>
            <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-white">Back</button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-2 py-4 space-y-4">
        {/* Full scoreboard: every team's net scores + points per hole */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left px-2 py-1.5 font-medium sticky left-0 bg-gray-800 min-w-[70px]">Team</th>
                  {frontHoles.map((h) => (
                    <th key={h.holeNumber} className="text-center px-1 py-1.5 font-medium min-w-[24px]">{h.holeNumber}</th>
                  ))}
                  <th className="text-center px-1.5 py-1.5 font-bold text-gray-400 min-w-[28px]">F</th>
                  {backHoles.map((h) => (
                    <th key={h.holeNumber} className="text-center px-1 py-1.5 font-medium min-w-[24px]">{h.holeNumber}</th>
                  ))}
                  <th className="text-center px-1.5 py-1.5 font-bold text-gray-400 min-w-[28px]">B</th>
                  <th className="text-center px-1.5 py-1.5 font-bold text-gray-400 min-w-[32px]">Tot</th>
                </tr>
              </thead>
              <tbody>
                {rankedTeams.map((r, idx) => {
                  const frontPts = frontLeg?.rankings.find((x) => x.teamId === r.teamId)?.points ?? 0;
                  const backPts = backLeg?.rankings.find((x) => x.teamId === r.teamId)?.points ?? 0;

                  return (
                    <tr key={r.teamId} className={`${idx > 0 ? 'border-t border-gray-700/30' : ''}`}>
                      <td className="px-2 py-1.5 sticky left-0 bg-gray-800">
                        <div className={`font-medium ${r.place === 1 ? 'text-white' : 'text-gray-300'}`}>
                          <span className="text-gray-500">{r.place}.</span> {r.teamName}
                        </div>
                        <div className="text-[10px] text-green-500 mt-0.5">pts</div>
                      </td>
                      {frontHoles.map((h) => {
                        const net = h.teamBestNets[r.teamId];
                        const pts = h.teamPoints[r.teamId] ?? 0;
                        const maxPts = Math.max(...sideGame.teams.map((t) => h.teamPoints[t.id] ?? 0));
                        const isWinner = pts > 0 && pts === maxPts;
                        return (
                          <td key={h.holeNumber} className="text-center px-1 py-1.5">
                            <div className={`${isWinner ? 'font-bold text-green-400' : 'text-gray-300'}`}>
                              {net ?? '-'}
                            </div>
                            <div className={`text-[10px] ${pts > 0 ? 'text-green-400 font-medium' : 'text-gray-600'}`}>
                              {pts > 0 ? (pts % 1 === 0 ? pts : pts.toFixed(1)) : '-'}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-center px-1.5 py-1.5 bg-gray-750">
                        <div className="font-bold text-gray-200">
                          {frontHoles.reduce((s, h) => s + (h.teamBestNets[r.teamId] ?? 0), 0) || '-'}
                        </div>
                        <div className="text-[10px] font-bold text-green-300">{frontPts}</div>
                      </td>
                      {backHoles.map((h) => {
                        const net = h.teamBestNets[r.teamId];
                        const pts = h.teamPoints[r.teamId] ?? 0;
                        const maxPts = Math.max(...sideGame.teams.map((t) => h.teamPoints[t.id] ?? 0));
                        const isWinner = pts > 0 && pts === maxPts;
                        return (
                          <td key={h.holeNumber} className="text-center px-1 py-1.5">
                            <div className={`${isWinner ? 'font-bold text-green-400' : 'text-gray-300'}`}>
                              {net ?? '-'}
                            </div>
                            <div className={`text-[10px] ${pts > 0 ? 'text-green-400 font-medium' : 'text-gray-600'}`}>
                              {pts > 0 ? (pts % 1 === 0 ? pts : pts.toFixed(1)) : '-'}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-center px-1.5 py-1.5 bg-gray-750">
                        <div className="font-bold text-gray-200">
                          {backHoles.reduce((s, h) => s + (h.teamBestNets[r.teamId] ?? 0), 0) || '-'}
                        </div>
                        <div className="text-[10px] font-bold text-green-300">{backPts}</div>
                      </td>
                      <td className="text-center px-1.5 py-1.5 bg-gray-750">
                        <div className="font-bold text-white">
                          {sideResult.holes.reduce((s, h) => s + (h.teamBestNets[r.teamId] ?? 0), 0) || '-'}
                        </div>
                        <div className="text-[10px] font-bold text-green-300">{r.points}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expandable: click a team to see individual player gross scores */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-700">
            <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Player Details</p>
          </div>
          {rankedTeams.map((r) => {
            const isTeamExpanded = expandedTeam === r.teamId;
            const teamDetail = teamDetails.find((td) => td.teamId === r.teamId);
            const payout = sideResult.payouts.find((p) => p.teamId === r.teamId);

            return (
              <div key={r.teamId} className="border-b border-gray-700/30 last:border-0">
                <button
                  onClick={() => setExpandedTeam(isTeamExpanded ? null : r.teamId)}
                  className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-750"
                >
                  <span className="text-sm text-gray-300">{r.teamName}</span>
                  <div className="flex items-center gap-2">
                    {payout && payout.total !== 0 && (
                      <span className={`text-xs font-medium ${payout.total > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {payout.total > 0 ? '+' : ''}${payout.total}
                      </span>
                    )}
                    <span className="text-gray-600 text-xs">{isTeamExpanded ? '▾' : '▸'}</span>
                  </div>
                </button>

                {isTeamExpanded && teamDetail && (
                  <div className="px-2 pb-3 pt-1 overflow-x-auto">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="text-gray-500">
                          <th className="text-left px-1 py-1 font-medium min-w-[60px] sticky left-0 bg-gray-800">Player</th>
                          {frontHoles.map((h) => (
                            <th key={h.holeNumber} className="text-center px-1 py-1 font-medium min-w-[24px]">{h.holeNumber}</th>
                          ))}
                          <th className="text-center px-1 py-1 min-w-[28px]"></th>
                          {backHoles.map((h) => (
                            <th key={h.holeNumber} className="text-center px-1 py-1 font-medium min-w-[24px]">{h.holeNumber}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teamDetail.players.map((player) => (
                          <tr key={player.playerId}>
                            <td className="px-1 py-1 text-gray-300 font-medium whitespace-nowrap sticky left-0 bg-gray-800">
                              {player.playerName.split(' ')[0]}
                              <span className="text-[10px] text-gray-500 ml-0.5">({Math.round(player.playingHcap)})</span>
                            </td>
                            {player.holes.filter((h) => h.holeNumber <= 9).map((h) => (
                              <td key={h.holeNumber} className={`text-center px-1 py-1 ${h.isBestNet ? 'font-bold text-green-400' : 'text-gray-300'}`}>
                                {h.gross != null ? (
                                  <span>
                                    {h.gross}
                                    {h.strokes > 0 && <span className="text-[8px] text-blue-400 align-super">{'•'.repeat(h.strokes)}</span>}
                                  </span>
                                ) : '-'}
                              </td>
                            ))}
                            <td className="text-center px-1 py-1 text-gray-600">|</td>
                            {player.holes.filter((h) => h.holeNumber > 9).map((h) => (
                              <td key={h.holeNumber} className={`text-center px-1 py-1 ${h.isBestNet ? 'font-bold text-green-400' : 'text-gray-300'}`}>
                                {h.gross != null ? (
                                  <span>
                                    {h.gross}
                                    {h.strokes > 0 && <span className="text-[8px] text-blue-400 align-super">{'•'.repeat(h.strokes)}</span>}
                                  </span>
                                ) : '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Per-person payouts */}
        {sideResult.payouts.some((p) => p.total !== 0) && (
          <div className="bg-gray-800 rounded-xl px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider mb-2">Per Person</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {sideResult.payouts.flatMap((p) => {
                const team = sideGame.teams.find((t) => t.id === p.teamId);
                if (!team) return [];
                const perPerson = p.total / (team.playerIds.length || 1);
                return team.playerIds.map((pid) => {
                  const player = sideGame.players.find((pl) => pl.id === pid);
                  return { name: player?.name.split(' ')[0] || '?', amount: perPerson, id: pid };
                });
              }).sort((a, b) => b.amount - a.amount).map((p) => (
                <span key={p.id} className={`text-sm ${p.amount > 0 ? 'text-green-400 font-medium' : p.amount < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  {p.name}: {p.amount > 0 ? '+' : ''}${Math.round(p.amount)}
                </span>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
