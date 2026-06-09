'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { Tournament } from '@/lib/tournament-state';
import { loadTournament, fetchTournament, loadGameScores, fetchGameScores, computeStandings } from '@/lib/tournament-state';
import { computePlayerStablefordPoints, computePlayerNetTotal, computeSplitMatchStatuses } from '@/lib/live-scoring';
import type { GameScore } from '@/lib/game-state';

interface RoundRecap {
  roundIndex: number;
  title: string;
  scoreA: number;
  scoreB: number;
  teamAName: string;
  teamBName: string;
  runningA: number;
  runningB: number;
  headlines: string[];
  callouts: { player: string; line: string; type: 'hero' | 'choke' | 'neutral' }[];
}

function generateRecaps(tournament: Tournament): RoundRecap[] {
  const recaps: RoundRecap[] = [];
  const standings = computeStandings(tournament);
  let runningA = 0;
  let runningB = 0;

  for (let i = 0; i < tournament.rounds.length; i++) {
    const round = tournament.rounds[i];
    if (round.status !== 'completed') continue;

    const roundResult = standings.roundResults.find((r) => r.roundId === round.id);
    if (!roundResult) continue;

    runningA += roundResult.teamAPoints;
    runningB += roundResult.teamBPoints;

    const teamAName = tournament.teams[0].name;
    const teamBName = tournament.teams[1].name;
    const headlines: string[] = [];
    const callouts: RoundRecap['callouts'] = [];

    const diff = roundResult.teamAPoints - roundResult.teamBPoints;
    const winner = diff > 0 ? teamAName : diff < 0 ? teamBName : null;
    const margin = Math.abs(diff);

    if (winner) {
      if (margin >= 8) {
        headlines.push(`${winner} absolutely demolished the other side. ${margin.toFixed(1)}-point round win. That's not a golf match, that's an eviction.`);
      } else if (margin >= 4) {
        headlines.push(`${winner} took the round convincingly, ${roundResult.teamAPoints.toFixed(1)}-${roundResult.teamBPoints.toFixed(1)}. Clear statement.`);
      } else {
        headlines.push(`${winner} edges it ${roundResult.teamAPoints.toFixed(1)}-${roundResult.teamBPoints.toFixed(1)}. Close - but close doesn't get you points back.`);
      }
    } else {
      headlines.push(`Split. ${roundResult.teamAPoints.toFixed(1)}-${roundResult.teamBPoints.toFixed(1)}. Both teams walk away feeling like they left something out there.`);
    }

    const overallLead = runningA - runningB;
    if (Math.abs(overallLead) > 0) {
      const leader = overallLead > 0 ? teamAName : teamBName;
      const trail = Math.abs(overallLead);
      headlines.push(`${leader} lead ${runningA > runningB ? runningA.toFixed(1) : runningB.toFixed(1)}-${runningA > runningB ? runningB.toFixed(1) : runningA.toFixed(1)} overall. ${trail >= 8 ? 'That\'s a lot of ground to make up.' : trail >= 4 ? 'Manageable deficit, but the pressure is real.' : 'Still anyone\'s tournament.'}`);
    } else {
      headlines.push(`Tied ${runningA.toFixed(1)}-${runningB.toFixed(1)} overall. Everything still to play for.`);
    }

    for (const matchup of round.matchups) {
      if (!matchup.result) continue;
      const scores: GameScore[] | null = loadGameScores(matchup.id);
      if (!scores || scores.length === 0) continue;

      const allPlayerIds = [...matchup.teamAPlayerIds, ...matchup.teamBPlayerIds];

      if (round.formatId === 'stableford') {
        const playerPoints: { name: string; pts: number; team: 'A' | 'B' }[] = [];
        for (const pid of allPlayerIds) {
          const player = tournament.players.find((p) => p.id === pid);
          if (!player) continue;
          const pts = computePlayerStablefordPoints(scores, pid, matchup, round, tournament);
          const team = matchup.teamAPlayerIds.includes(pid) ? 'A' as const : 'B' as const;
          playerPoints.push({ name: player.name.split(' ')[0], pts, team });
        }
        playerPoints.sort((a, b) => b.pts - a.pts);

        if (playerPoints.length > 0) {
          const best = playerPoints[0];
          callouts.push({
            player: best.name,
            line: `${best.name} put up ${best.pts} stableford points. Carried ${best.team === 'A' ? teamAName : teamBName} on his back.`,
            type: 'hero',
          });

          const worst = playerPoints[playerPoints.length - 1];
          if (worst.pts < best.pts - 6) {
            callouts.push({
              player: worst.name,
              line: `${worst.name} carded ${worst.pts} points. That's not a bad round - that's a liability. Your partner had to play 2v1 because of you.`,
              type: 'choke',
            });
          }
        }
      }

      if (round.formatId === 'match-play' && !round.splitFormat) {
        const playerNets: { name: string; net: number; team: 'A' | 'B' }[] = [];
        for (const pid of allPlayerIds) {
          const player = tournament.players.find((p) => p.id === pid);
          if (!player) continue;
          const net = computePlayerNetTotal(scores, pid, matchup, round, tournament);
          if (net === null) continue;
          const team = matchup.teamAPlayerIds.includes(pid) ? 'A' as const : 'B' as const;
          playerNets.push({ name: player.name.split(' ')[0], net, team });
        }
        playerNets.sort((a, b) => a.net - b.net);

        if (playerNets.length > 0) {
          const best = playerNets[0];
          callouts.push({
            player: best.name,
            line: `${best.name} shot a net ${best.net}. Best individual round in the group. That's the guy you want on your side.`,
            type: 'hero',
          });

          const worst = playerNets[playerNets.length - 1];
          if (worst.net > best.net + 8) {
            callouts.push({
              player: worst.name,
              line: `${worst.name} posted a net ${worst.net}. Even with strokes, that's rough. Your team needed you and you weren't there.`,
              type: 'choke',
            });
          }
        }
      }

      if (round.splitFormat && round.splitFormat.pairings) {
        const splitStatuses = computeSplitMatchStatuses(scores, matchup, round, tournament);
        if (splitStatuses) {
          for (const sm of splitStatuses) {
            if (sm.type !== 'individual') continue;
            const wonA = sm.status.holesWonA;
            const wonB = sm.status.holesWonB;
            const nameA = sm.playerA.name.split(' ')[0];
            const nameB = sm.playerB.name.split(' ')[0];

            if (wonA >= 7) {
              callouts.push({
                player: nameA,
                line: `${nameA} went ${wonA}-${wonB} against ${nameB}. Absolute clinic. ${nameB} got his lunch money taken.`,
                type: 'hero',
              });
              callouts.push({
                player: nameB,
                line: `${nameB} got boat-raced ${wonB}-${wonA} by ${nameA}. That's the kind of loss that keeps you up at night.`,
                type: 'choke',
              });
            } else if (wonB >= 7) {
              callouts.push({
                player: nameB,
                line: `${nameB} went ${wonB}-${wonA} against ${nameA}. Dominant. ${nameA} had no answer.`,
                type: 'hero',
              });
              callouts.push({
                player: nameA,
                line: `${nameA} got demolished ${wonA}-${wonB} by ${nameB}. Your team needed you and you folded.`,
                type: 'choke',
              });
            } else if (wonA >= 6) {
              callouts.push({
                player: nameA,
                line: `${nameA} handled ${nameB} ${wonA}-${wonB}. Comfortable win. Never really in doubt.`,
                type: 'hero',
              });
            } else if (wonB >= 6) {
              callouts.push({
                player: nameB,
                line: `${nameB} took care of ${nameA} ${wonB}-${wonA}. Professional job.`,
                type: 'hero',
              });
            } else if (Math.abs(wonA - wonB) <= 1) {
              callouts.push({
                player: `${nameA}/${nameB}`,
                line: `${nameA} vs ${nameB}: ${wonA}-${wonB}. War. Neither guy gave an inch. This is what the back 9 is about.`,
                type: 'neutral',
              });
            }
          }

          const front = splitStatuses.find((s) => s.type === 'team');
          if (front) {
            const fDiff = front.status.holesWonA - front.status.holesWonB;
            if (Math.abs(fDiff) >= 4) {
              const frontWinner = fDiff > 0 ? teamAName : teamBName;
              headlines.push(`${frontWinner} won the front 9 best ball ${fDiff > 0 ? front.status.holesWonA : front.status.holesWonB}-${fDiff > 0 ? front.status.holesWonB : front.status.holesWonA}. Set the tone early.`);
            }
          }
        }
      }
    }

    recaps.push({
      roundIndex: i,
      title: round.dayLabel,
      scoreA: roundResult.teamAPoints,
      scoreB: roundResult.teamBPoints,
      teamAName,
      teamBName,
      runningA,
      runningB,
      headlines,
      callouts,
    });
  }

  return recaps;
}

function generateTournamentSummary(tournament: Tournament, recaps: RoundRecap[]): string[] {
  if (recaps.length === 0) return [];

  const allCompleted = tournament.rounds.every((r) => r.status === 'completed');
  if (!allCompleted) return [];

  const standings = computeStandings(tournament);
  const teamAName = tournament.teams[0].name;
  const teamBName = tournament.teams[1].name;
  const totalA = standings.teamAPoints;
  const totalB = standings.teamBPoints;
  const lines: string[] = [];

  if (totalA > totalB) {
    const margin = totalA - totalB;
    if (margin >= 15) {
      lines.push(`${teamAName} wins. Decisively. ${totalA.toFixed(1)}-${totalB.toFixed(1)}. That wasn't a tournament - that was a statement.`);
    } else if (margin >= 6) {
      lines.push(`${teamAName} takes it ${totalA.toFixed(1)}-${totalB.toFixed(1)}. Comfortable, but ${teamBName} made them earn it.`);
    } else {
      lines.push(`${teamAName} holds on ${totalA.toFixed(1)}-${totalB.toFixed(1)}. That was way closer than anyone expected.`);
    }
  } else if (totalB > totalA) {
    const margin = totalB - totalA;
    if (margin >= 15) {
      lines.push(`${teamBName} wins. Decisively. ${totalB.toFixed(1)}-${totalA.toFixed(1)}. That wasn't a tournament - that was a statement.`);
    } else if (margin >= 6) {
      lines.push(`${teamBName} takes it ${totalB.toFixed(1)}-${totalA.toFixed(1)}. Comfortable, but ${teamAName} made them earn it.`);
    } else {
      lines.push(`${teamBName} holds on ${totalB.toFixed(1)}-${totalA.toFixed(1)}. That was way closer than anyone expected.`);
    }
  } else {
    lines.push(`Tied ${totalA.toFixed(1)}-${totalB.toFixed(1)}. After all that - dead even. Nobody's buying dinner tonight.`);
  }

  const allCallouts = recaps.flatMap((r) => r.callouts);
  const heroCount: Record<string, number> = {};
  const chokeCount: Record<string, number> = {};
  for (const c of allCallouts) {
    if (c.type === 'hero') heroCount[c.player] = (heroCount[c.player] || 0) + 1;
    if (c.type === 'choke') chokeCount[c.player] = (chokeCount[c.player] || 0) + 1;
  }

  const mvp = Object.entries(heroCount).sort((a, b) => b[1] - a[1])[0];
  if (mvp && mvp[1] >= 2) {
    lines.push(`Tournament MVP: ${mvp[0]}. Showed up ${mvp[1]} times when it mattered.`);
  }

  const goat = Object.entries(chokeCount).sort((a, b) => b[1] - a[1])[0];
  if (goat && goat[1] >= 2) {
    lines.push(`Most likely to hear about this for years: ${goat[0]}. Featured in ${goat[1]} lowlights. That's a legacy.`);
  }

  return lines;
}

export default function TournamentRecapPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [scoresLoaded, setScoresLoaded] = useState(false);

  useEffect(() => {
    const cached = loadTournament(id);
    if (cached) setTournament(cached);
    fetchTournament(id).then((t) => {
      if (t) {
        setTournament(t);
        const completedMatchups = t.rounds
          .filter((r) => r.status === 'completed')
          .flatMap((r) => r.matchups.filter((m) => m.result));
        Promise.all(completedMatchups.map((m) => fetchGameScores(m.id))).then(() => {
          setScoresLoaded(true);
        });
      }
    });
  }, [id]);

  if (!tournament) return null;

  const recaps = scoresLoaded ? generateRecaps(tournament) : [];
  const summary = scoresLoaded ? generateTournamentSummary(tournament, recaps) : [];

  if (recaps.length === 0) {
    return (
      <div className="min-h-full bg-gray-950 text-white">
        <header className="border-b border-gray-800">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <button onClick={() => router.push(`/tournament/${id}`)} className="text-sm text-gray-400 hover:text-white">
              Back
            </button>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">No Recaps Yet</h1>
          <p className="text-gray-400">Round recaps will appear here as rounds are completed.</p>
        </main>
      </div>
    );
  }

  const lastRecap = recaps[recaps.length - 1];

  return (
    <div className="min-h-full bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <button onClick={() => router.push(`/tournament/${id}`)} className="text-sm text-gray-400 hover:text-white">
            Back
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black tracking-tight mb-2">{tournament.name.toUpperCase()}</h1>
          <p className="text-lg text-gray-400 font-medium">{tournament.teams[0].name} vs. {tournament.teams[1].name}</p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <span className="text-3xl font-black text-blue-400">{lastRecap.runningA.toFixed(1)}</span>
            <span className="text-xl text-gray-600">-</span>
            <span className="text-3xl font-black text-red-400">{lastRecap.runningB.toFixed(1)}</span>
          </div>
        </div>

        {/* Tournament Summary (only when all rounds complete) */}
        {summary.length > 0 && (
          <div className="mb-12 bg-yellow-950 border border-yellow-800 rounded-lg p-5">
            <h2 className="text-xl font-black text-yellow-400 mb-3">FINAL VERDICT</h2>
            {summary.map((line, i) => (
              <p key={i} className="text-gray-200 mb-2 font-medium">{line}</p>
            ))}
          </div>
        )}

        {/* Round-by-round recaps */}
        <h2 className="text-2xl font-black text-center mb-2 text-red-500">
          {summary.length > 0 ? 'ROUND BY ROUND' : "WHAT'S HAPPENED SO FAR"}
        </h2>
        <p className="text-center text-gray-500 text-sm mb-8">The receipts don't lie</p>

        <div className="space-y-8">
          {recaps.map((recap) => (
            <div key={recap.roundIndex} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <div className="bg-gray-800 px-5 py-3 flex items-center justify-between">
                <p className="font-bold text-white">{recap.title}</p>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-black ${recap.scoreA > recap.scoreB ? 'text-blue-400' : recap.scoreA < recap.scoreB ? 'text-gray-500' : 'text-gray-300'}`}>{recap.scoreA.toFixed(1)}</span>
                  <span className="text-gray-600">-</span>
                  <span className={`text-lg font-black ${recap.scoreB > recap.scoreA ? 'text-red-400' : recap.scoreB < recap.scoreA ? 'text-gray-500' : 'text-gray-300'}`}>{recap.scoreB.toFixed(1)}</span>
                </div>
              </div>

              <div className="px-5 py-4 space-y-3">
                {recap.headlines.map((h, i) => (
                  <p key={i} className="text-gray-300 text-sm font-medium">{h}</p>
                ))}

                {recap.callouts.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-gray-800 pt-3">
                    {recap.callouts.map((c, i) => (
                      <div key={i} className={`text-sm px-3 py-2 rounded ${
                        c.type === 'hero' ? 'bg-green-950 border border-green-800 text-green-300' :
                        c.type === 'choke' ? 'bg-red-950 border border-red-800 text-red-300' :
                        'bg-gray-800 border border-gray-700 text-gray-300'
                      }`}>
                        {c.line}
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-xs text-gray-500 pt-2 border-t border-gray-800">
                  Overall: {recap.teamAName} {recap.runningA.toFixed(1)} - {recap.runningB.toFixed(1)} {recap.teamBName}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
