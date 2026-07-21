'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { GameScore } from '@/lib/game-state';
import { loadGameScores, fetchGameScores, subscribeToScores, onVisibilityRefetch } from '@/lib/tournament-state';
import type { PoolGame, PoolResult, PoolTeamDetail, PoolLegKey } from '@/lib/pool-game';
import {
  loadPoolGame,
  fetchPoolGame,
  subscribeToPoolGame,
  computePoolResult,
  computePoolPlayerDetails,
} from '@/lib/pool-game';

const LEG_LABELS: Record<PoolLegKey, string> = {
  front: 'Front 9',
  back: 'Back 9',
  overall: 'Overall 18',
  junk: 'Junk',
};

export default function PoolLeaderboardPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [game, setGame] = useState<PoolGame | null>(null);
  const [result, setResult] = useState<PoolResult | null>(null);
  const [teamDetails, setTeamDetails] = useState<PoolTeamDetail[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

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

  // Multi-matchup score sync: fetch + realtime + visibility + poll
  useEffect(() => {
    if (!game) return;

    const ids = Array.from(new Set(game.teams.map((t) => t.matchupId)));

    function recompute() {
      const allScores = new Map<string, GameScore[]>();
      for (const mid of ids) {
        const cached = loadGameScores(mid);
        if (cached) allScores.set(mid, cached);
      }
      setResult(computePoolResult(game!, allScores));
      setTeamDetails(computePoolPlayerDetails(game!, allScores));
    }

    Promise.all(ids.map((mid) => fetchGameScores(mid))).then(recompute);

    const channels = ids.map((mid) => subscribeToScores(mid, () => recompute()));
    const removeVisibility = onVisibilityRefetch(ids, recompute);
    const interval = setInterval(() => {
      Promise.all(ids.map((mid) => fetchGameScores(mid))).then(recompute);
    }, 30000);

    return () => {
      channels.forEach((ch) => ch.unsubscribe());
      removeVisibility();
      clearInterval(interval);
    };
  }, [game?.id, game?.teams.map((t) => t.matchupId).join(',')]);

  if (!game) return null;

  if (!result || result.thruHole === 0) {
    return (
      <div className="min-h-full bg-gray-900">
        <header className="bg-gray-800 text-white shadow-lg">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-lg font-bold">{game.name}</h1>
            <button onClick={() => router.push(`/pool/${id}`)} className="text-sm text-gray-400 hover:text-white">Back</button>
          </div>
        </header>
        <div className="text-center py-12 text-gray-500">No scores yet.</div>
      </div>
    );
  }

  const frontLeg = result.legs.find((l) => l.leg === 'front');
  const backLeg = result.legs.find((l) => l.leg === 'back');
  const overallLeg = result.legs.find((l) => l.leg === 'overall');
  if (!overallLeg) return null;

  const frontHoles = result.holeScores.filter((h) => h.holeNumber <= 9);
  const backHoles = result.holeScores.filter((h) => h.holeNumber > 9);
  const rankedTeams = overallLeg.standings;

  // Junk breakdown ranked by total desc
  const rankedJunk = [...result.junkDetails].sort((a, b) => b.total - a.total);

  return (
    <div className="min-h-full bg-gray-900">
      <header className="bg-gray-800 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{game.name}</h1>
            <p className="text-xs text-gray-400">Thru hole {result.thruHole}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/game/play')}
              className="text-sm text-yellow-300 hover:text-yellow-100 font-medium"
            >
              Scorecard
            </button>
            <button onClick={() => router.push(`/pool/${id}`)} className="text-sm text-gray-400 hover:text-white">Back</button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-2 py-4 space-y-4">
        {/* Per-hole grid: every team's team score per hole (lowest is best) */}
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
                  const frontTotal = frontLeg?.standings.find((x) => x.teamId === r.teamId)?.total ?? 0;
                  const backTotal = backLeg?.standings.find((x) => x.teamId === r.teamId)?.total ?? 0;

                  return (
                    <tr key={r.teamId} className={`${idx > 0 ? 'border-t border-gray-700/30' : ''}`}>
                      <td className="px-2 py-1.5 sticky left-0 bg-gray-800">
                        <div className={`font-medium ${r.place === 1 ? 'text-white' : 'text-gray-300'}`}>
                          <span className="text-gray-500">{r.place || '-'}.</span> {r.teamName}
                        </div>
                      </td>
                      {frontHoles.map((h) => {
                        const score = h.teamScores[r.teamId];
                        const lowOnHole = lowScoreOnHole(h.teamScores);
                        const isLow = score !== null && score === lowOnHole;
                        return (
                          <td key={h.holeNumber} className="text-center px-1 py-1.5">
                            <div className={`${isLow ? 'font-bold text-green-400' : 'text-gray-300'}`}>
                              {score ?? '-'}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-center px-1.5 py-1.5 bg-gray-750">
                        <div className="font-bold text-gray-200">{frontTotal || '-'}</div>
                      </td>
                      {backHoles.map((h) => {
                        const score = h.teamScores[r.teamId];
                        const lowOnHole = lowScoreOnHole(h.teamScores);
                        const isLow = score !== null && score === lowOnHole;
                        return (
                          <td key={h.holeNumber} className="text-center px-1 py-1.5">
                            <div className={`${isLow ? 'font-bold text-green-400' : 'text-gray-300'}`}>
                              {score ?? '-'}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-center px-1.5 py-1.5 bg-gray-750">
                        <div className="font-bold text-gray-200">{backTotal || '-'}</div>
                      </td>
                      <td className="text-center px-1.5 py-1.5 bg-gray-750">
                        <div className="font-bold text-white">{r.total || '-'}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[10px] text-gray-500 border-t border-gray-700">
            Team score = best net + best gross per hole · lowest total wins
          </div>
        </div>

        {/* 4-pot payout board */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-700">
            <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Pots</p>
          </div>
          <div className="divide-y divide-gray-700/30">
            {result.legs.map((leg) => {
              const winners = leg.standings.filter((s) => s.place === 1);
              return (
                <div key={leg.leg} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-200">{LEG_LABELS[leg.leg]}</p>
                    <p className="text-[10px] text-gray-500">${Math.round(leg.subPot)} pot</p>
                  </div>
                  <div className="text-right">
                    {winners.length > 0 ? (
                      winners.map((w) => (
                        <div key={w.teamId} className="text-sm">
                          <span className="text-white font-medium">{w.teamName}</span>
                          <span className="text-green-400 font-medium ml-2">+${Math.round(w.payout)}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-gray-500">TBD</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-team junk breakdown */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-700">
            <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Junk Breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700/50">
                  <th className="text-left px-3 py-1.5 font-medium">Team</th>
                  <th className="text-center px-2 py-1.5 font-medium">Bird</th>
                  <th className="text-center px-2 py-1.5 font-medium">Eagle</th>
                  <th className="text-center px-2 py-1.5 font-medium">Alb</th>
                  <th className="text-center px-2 py-1.5 font-medium">Hug</th>
                  <th className="text-center px-2 py-1.5 font-medium">CTP</th>
                  <th className="text-center px-3 py-1.5 font-bold text-gray-400">Total</th>
                </tr>
              </thead>
              <tbody>
                {rankedJunk.map((j, idx) => (
                  <tr key={j.teamId} className={`${idx > 0 ? 'border-t border-gray-700/30' : ''}`}>
                    <td className="px-3 py-1.5 text-gray-300 font-medium whitespace-nowrap">{j.teamName}</td>
                    <td className="text-center px-2 py-1.5 text-gray-300">{j.birdies || '-'}</td>
                    <td className="text-center px-2 py-1.5 text-gray-300">{j.eagles || '-'}</td>
                    <td className="text-center px-2 py-1.5 text-gray-300">{j.albatrosses || '-'}</td>
                    <td className="text-center px-2 py-1.5 text-gray-300">{j.groupHugs || '-'}</td>
                    <td className="text-center px-2 py-1.5 text-gray-300">{j.ctps || '-'}</td>
                    <td className="text-center px-3 py-1.5 font-bold text-green-300">{j.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expandable: click a team for individual player gross scores */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-700">
            <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Player Details</p>
          </div>
          {rankedTeams.map((r) => {
            const isTeamExpanded = expandedTeam === r.teamId;
            const teamDetail = teamDetails.find((td) => td.teamId === r.teamId);
            const payout = result.payouts.find((p) => p.teamId === r.teamId);

            return (
              <div key={r.teamId} className="border-b border-gray-700/30 last:border-0">
                <button
                  onClick={() => setExpandedTeam(isTeamExpanded ? null : r.teamId)}
                  className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-750"
                >
                  <span className="text-sm text-gray-300">{r.teamName}</span>
                  <div className="flex items-center gap-2">
                    {payout && payout.net !== 0 && (
                      <span className={`text-xs font-medium ${payout.net > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {payout.net > 0 ? '+' : ''}${Math.round(payout.net)}
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
                        {teamDetail.players.map((player) => {
                          const isCaptain = game.teams.find((t) => t.id === r.teamId)?.captainId === player.playerId;
                          return (
                          <tr key={player.playerId}>
                            <td className="px-1 py-1 text-gray-300 font-medium whitespace-nowrap sticky left-0 bg-gray-800">
                              {isCaptain && <span className="text-[9px] font-bold text-green-400 mr-0.5" title="Captain">(C)</span>}
                              {player.playerName.split(' ')[0]}
                              <span className="text-[10px] text-gray-500 ml-0.5">({Math.round(player.playingHcap)})</span>
                            </td>
                            {player.holes.filter((h) => h.holeNumber <= 9).map((h) => (
                              <td key={h.holeNumber} className="text-center px-1 py-1 text-gray-300">
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
                              <td key={h.holeNumber} className="text-center px-1 py-1 text-gray-300">
                                {h.gross != null ? (
                                  <span>
                                    {h.gross}
                                    {h.strokes > 0 && <span className="text-[8px] text-blue-400 align-super">{'•'.repeat(h.strokes)}</span>}
                                  </span>
                                ) : '-'}
                              </td>
                            ))}
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Per-person payouts */}
        <div className="bg-gray-800 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Per Person</p>
            <p className="text-[10px] text-gray-500">${Math.round(result.pot)} pot</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {result.payouts.flatMap((p) => {
              const team = game.teams.find((t) => t.id === p.teamId);
              if (!team) return [];
              return team.playerIds.map((pid) => {
                const player = game.players.find((pl) => pl.id === pid);
                return { name: player?.name.split(' ')[0] || '?', amount: p.perPersonNet, id: pid };
              });
            }).sort((a, b) => b.amount - a.amount).map((p) => (
              <span key={p.id} className={`text-sm ${p.amount > 0 ? 'text-green-400 font-medium' : p.amount < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                {p.name}: {p.amount > 0 ? '+' : ''}${Math.round(p.amount)}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function lowScoreOnHole(teamScores: Record<string, number | null>): number | null {
  let low: number | null = null;
  for (const s of Object.values(teamScores)) {
    if (s === null) continue;
    if (low === null || s < low) low = s;
  }
  return low;
}
