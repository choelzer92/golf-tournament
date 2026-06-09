'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { Tournament } from '@/lib/tournament-state';
import { loadTournament, fetchTournament, loadGameScores, fetchGameScores, computeStandings } from '@/lib/tournament-state';
import { computePlayerStablefordPoints, computePlayerNetTotal, computeSplitMatchStatuses } from '@/lib/live-scoring';
import type { GameScore } from '@/lib/game-state';

const HOGS_DAWGS_CONTENT = {
  tagline: 'Three Rounds. 140 Points. No Excuses.',
  intro: [
    'Eight guys have been talking shit for months. Time to back it up.',
    'Three days. Three courses. Formats designed to expose every weakness you\'ve been hiding behind your handicap. By the time you reach the back 9 at Glenmore, there\'s no partner to carry you, no team net to mask that you choked on 14, no "we\'ll get \'em next hole." Just you, your game, and the guy across from you who wants to watch you crumble.',
    'Somebody\'s walking away from this weekend quiet. Let\'s find out who.',
  ],
  rounds: [
    {
      title: 'DAY 1 - OLD TRAIL',
      subtitle: 'Stableford | Combined 2v2 | 18 Holes | 40 pts',
      description: [
        'Both scores count. Every hole. No hiding. Your partner can\'t carry you when both numbers go on the board.',
        'Net scoring means your strokes are loaded. A par with a stroke is a net birdie - that\'s 3 points. A birdie with a stroke is a net eagle - 4 points. This format rewards guys who attack with strokes in their pocket and punishes anyone who plays scared.',
      ],
      detail: 'Double or worse: 0 | Bogey: 1 | Par: 2 | Birdie: 3 | Eagle: 4 | Albatross: 5',
      intensity: [
        'Margin-based tournament points - the more you win by, the more you take. A 1-point stableford win barely moves the needle. An 8-point beatdown? That\'s a statement. That\'s your team putting a foot on the other side\'s throat on Day 1 and daring them to do something about it.',
        'Full handicap. Full strokes. No excuses about not getting enough shots. You\'re getting every stroke you\'re entitled to. Now go earn some points with them.',
      ],
      bonuses: [
        'Match Winner (+1 pt per matchup) - Win your 2v2 and your team takes an extra point.',
        'Best Individual Stableford (+1 pt per matchup) - Want to be the hero? Put up the best individual round in your foursome. Your team gets rewarded for your performance. No pressure.',
      ],
    },
    {
      title: 'DAY 2 - SPRING CREEK',
      subtitle: 'Match Play | 1-Net-1-Gross | 4v4 | 18 Holes | 40 pts',
      description: [
        'Your four against their four. Separate tee times, live scoring through the app. You\'re playing with your boys but fighting the other group hole by hole in real time.',
        'Each hole: your side\'s best net + best gross (different players) combined versus theirs. 2 pts for a win. 1 for a halve. 0 for a loss.',
        '90% off the low across all 8. Enterlin plays scratch.',
      ],
      intensity: [
        'You\'re going to be checking the app after every hole. Watching their scores post. Watching holes slip away. Or watching your squad gut-punch them from a different tee time. There\'s something uniquely brutal about losing a hole to a group you can\'t even see - and knowing they\'re celebrating without you.',
        'This is the depth round. One guy can\'t carry a 4v4 over 18 holes. If somebody on your team is mailing it in, the other side is eating those holes alive. Every player matters. Every hole matters. There is no garbage time.',
      ],
      bonuses: [
        'Nassau - Front 9 (+1 pt) - Win the front and you take a point. Lose it? That\'s a point you\'re never getting back.',
        'Nassau - Back 9 (+1 pt) - Same for the back.',
        'Nassau - Overall (+1 pt) - And the 18.',
        'Best Individual Net (+1 pt) - Lowest net across all 8 players. The single best round of the day. One point. Big bragging rights.',
      ],
    },
    {
      title: 'DAY 3 - GLENMORE',
      subtitle: 'Split Format | 18 Holes | 60 pts',
      description: [
        'The biggest day. The most points. And the format designed to find out who\'s built for pressure and who wilts when nobody can bail them out.',
      ],
      sections: [
        {
          title: 'FRONT 9 - Best Ball (2v2)',
          points: '20 pts',
          lines: [
            'Last time you have a partner. Best net counts. One of you just needs to make a number.',
            '1 pt for a win. 0.5 for a halve. 90% off the low.',
            'Match Winner Bonus (+1 pt per matchup) - Win the front and pocket a bonus before the real chaos starts.',
          ],
        },
        {
          title: 'BACK 9 - Individual Match Play (1v1)',
          points: '40 pts',
          lines: [
            'Then the music stops. Partners disappear. Four 1v1 grudge matches. Nine holes. You and him.',
            '100% off the low within each pair. 1 pt per hole won. 0.5 halved. Up to 10 pts per match.',
            'Match Winner Bonus (+1 pt per pairing) - Win your match, earn your team another point. Lose it, and live with knowing you\'re the reason the other team is celebrating.',
          ],
        },
      ],
    },
  ],
  matchups: [
    {
      playerA: 'Bodner',
      handicapA: '8.5',
      playerB: 'Enterlin',
      handicapB: '4.6',
      callout: 'The alpha match. Dead even after strokes. Bodner bombs it off the tee and thinks distance is a personality trait. Problem is, the guy sprays it like a garden hose when the pressure hits and spends half his round punching out sideways pretending that was the plan. Jake - congrats on being the lowest index in the field and still somehow finding ways to go completely ghost for 3-hole stretches when it matters. You hit fairways, sure, but you also have the clutch gene of a man who reads putts while his hands shake. This match comes down to who chokes less. Bodner is going to give away at least 2 holes to mental errors. Jake is going to three-putt at least twice because he can\'t commit to a read. Whoever has their meltdown last wins.',
    },
    {
      playerA: 'Ross',
      handicapA: '21',
      playerB: 'Casey',
      handicapB: '12.8',
      callout: 'Even match after strokes and that\'s a problem for both of them. Ross has a documented ability to turn a simple bogey into a triple with one swing. The man can go from "net par incoming" to "where\'d that ball go" faster than anyone in this field. His brain turns off mid-backswing and the ball goes places golf balls aren\'t supposed to go. Casey plays the most boring golf imaginable and calls it "consistent." Par-bogey-par-bogey until everyone falls asleep watching. Then he\'ll bogey three in a row because his mental game has the structural integrity of wet cardboard. Ross is going to hand away at least 2 holes gift-wrapped with a bow on top. Casey is soft enough to hand them right back. This match is a race to see who can give away a lead faster.',
    },
    {
      playerA: 'Smith',
      handicapA: '10.7',
      playerB: 'Hoelzer',
      handicapB: '9.6',
      callout: 'Basically scratch against each other. No edge. No excuse. Just two guys who both think they\'re a 6-handicap trapped in a 10-handicap\'s body - and neither one can explain why they still shoot 82 every week. Smith talks a big game but has a habit of sleepwalking through holes like he forgot there are points on the line, then waking up on 7 wondering where the round went. Hoelzer will grind his face off all day but puts together hero swings and blowup holes in the same breath like his brain and his body are playing different courses. One of you is going to sit at dinner watching the other one relive this match shot by shot for the next 6 months. Both of you are terrified it\'s you. It should be.',
    },
    {
      playerA: 'Burns',
      handicapA: '15.5',
      playerB: 'Lacy',
      handicapB: '11',
      callout: 'Dead even after strokes and this is where it gets ugly. Burns has the short game of a man trying to chip with a shovel. He\'ll stripe one 250 down the middle looking like a tour pro and then 4-putt from 20 feet like it\'s his first day holding a putter. His touch around the greens belongs in a horror movie. Lacy is the guy who tells you he "could\'ve gone low today" after every single round and somehow never does. He\'ll look locked in for 4 holes then card three straight bogeys right when his team needs him most because he can\'t handle the feeling of being in a lead. Burns will donate holes with his wedge. Lacy will donate them right back with his brain. This match is going to be a beautiful disaster.',
    },
  ],
  closer: {
    title: 'WHY THE BACK 9 CHANGES EVERYTHING',
    lines: [
      '40 of the tournament\'s 140 points are decided in four 1v1 matches over 9 holes. That\'s not a tiebreaker - that\'s nearly a third of the entire tournament compressed into the final stretch.',
      'Down 6 going into the back? One dominant individual performance - one guy going 8-2 - erases it completely. If the rest of your team holds serve, you just came back from the dead.',
      'Up 6 and feeling safe? You shouldn\'t be. Four matches hemorrhaging points simultaneously is violent math. One bad stretch from two of your guys and that lead is gone before you reach 15.',
      'The team that wins this tournament will be the one where all four guys deliver on the back 9. Not three guys and a passenger. All four. One weak link - one guy who mails in holes 10-13 - and you\'re handing the other side a cushion they can ride home.',
      'So ask yourself: when your team needs you on the back 9, with the tournament on the line, with your guy staring you down on every tee - are you the one who delivers? Or are you the one your teammates are going to be thinking about in the car ride home?',
    ],
  },
  finalWords: [
    'Day 1 sets the tone. Day 2 tests your depth. Day 3 exposes you.',
    '140 points. Nothing decided until the last putt drops on 18 at Glenmore.',
  ],
};

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

    // Player-level analysis
    for (const matchup of round.matchups) {
      if (!matchup.result) continue;
      const scores: GameScore[] | null = loadGameScores(matchup.id);
      if (!scores || scores.length === 0) continue;

      const allPlayerIds = [...matchup.teamAPlayerIds, ...matchup.teamBPlayerIds];

      if (round.formatId === 'stableford') {
        // Stableford: find best and worst individual
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
        // Match play: find best individual net
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

      // Split format: analyze individual matchups on back 9
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

          // Front 9 team result
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

export default function TournamentHypePage() {
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
        // Fetch all completed matchup scores
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

  const content = HOGS_DAWGS_CONTENT;
  const recaps = scoresLoaded ? generateRecaps(tournament) : [];

  return (
    <div className="min-h-full bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push(`/tournament/${id}`)}
            className="text-sm text-gray-400 hover:text-white"
          >
            Back
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black tracking-tight mb-2">{tournament.name.toUpperCase()}</h1>
          <p className="text-lg text-gray-400 font-medium">{tournament.teams[0].name} vs. {tournament.teams[1].name}</p>
          <p className="text-sm text-yellow-500 font-bold mt-3 tracking-wide">{content.tagline}</p>
        </div>

        {/* Intro */}
        <div className="mb-12 space-y-4">
          {content.intro.map((line, i) => (
            <p key={i} className="text-gray-300 leading-relaxed">{line}</p>
          ))}
        </div>

        {/* Post-round recaps */}
        {recaps.length > 0 && (
          <div className="mb-16">
            <h2 className="text-2xl font-black text-center mb-2 text-red-500">WHAT'S HAPPENED SO FAR</h2>
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
          </div>
        )}

        {/* Rounds */}
        <div className="space-y-12 mb-16">
          {content.rounds.map((round, i) => (
            <div key={i} className="border-l-4 border-green-600 pl-5">
              <h2 className="text-2xl font-black mb-1">{round.title}</h2>
              <p className="text-sm text-green-400 font-medium mb-4">{round.subtitle}</p>

              {round.description.map((line, j) => (
                <p key={j} className="text-gray-300 mb-2">{line}</p>
              ))}

              {round.detail && (
                <p className="text-sm font-mono text-yellow-400 bg-gray-900 rounded px-3 py-2 my-3 inline-block">{round.detail}</p>
              )}

              {round.intensity && round.intensity.map((line, j) => (
                <p key={j} className="text-gray-300 mb-2 font-medium">{line}</p>
              ))}

              {round.sections && round.sections.map((section, j) => (
                <div key={j} className="mt-6 ml-2 border-l-2 border-gray-700 pl-4">
                  <h3 className="text-lg font-bold text-white">{section.title} <span className="text-sm text-green-400 font-medium ml-2">{section.points}</span></h3>
                  {section.lines.map((line, k) => (
                    <p key={k} className="text-gray-300 mt-1">{line}</p>
                  ))}
                </div>
              ))}

              {round.bonuses && (
                <div className="mt-4 bg-gray-900 rounded-lg px-4 py-3">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">Bonuses</p>
                  {round.bonuses.map((b, j) => (
                    <p key={j} className="text-sm text-gray-300">{b}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Individual Matchups */}
        <div className="mb-16">
          <h2 className="text-2xl font-black text-center mb-2">THE BACK 9 PAIRINGS</h2>
          <p className="text-center text-gray-500 text-sm mb-8">Where tournaments are won and lost</p>

          <div className="space-y-6">
            {content.matchups.map((m, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-center flex-1">
                    <p className="text-lg font-bold text-blue-400">{m.playerA}</p>
                    <p className="text-xs text-gray-500">{m.handicapA} HI</p>
                  </div>
                  <div className="text-xl font-black text-gray-600 px-4">vs</div>
                  <div className="text-center flex-1">
                    <p className="text-lg font-bold text-red-400">{m.playerB}</p>
                    <p className="text-xs text-gray-500">{m.handicapB} HI</p>
                  </div>
                </div>
                <p className="text-sm text-gray-400 italic leading-relaxed">{m.callout}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Closer */}
        <div className="mb-12 border-t border-gray-800 pt-8">
          <h2 className="text-xl font-black mb-4">{content.closer.title}</h2>
          {content.closer.lines.map((line, i) => (
            <p key={i} className="text-gray-300 mb-3 leading-relaxed">{line}</p>
          ))}
        </div>

        {/* Final */}
        <div className="text-center py-8 border-t border-gray-800">
          {content.finalWords.map((line, i) => (
            <p key={i} className="text-gray-300 mb-2 font-medium">{line}</p>
          ))}
          <p className="text-2xl font-black text-yellow-500 mt-6">LET'S FUCKING GO.</p>
        </div>
      </main>
    </div>
  );
}
