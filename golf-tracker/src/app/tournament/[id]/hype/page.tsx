'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { Tournament, HypeContent } from '@/lib/tournament-state';
import { loadTournament, fetchTournament, saveTournament } from '@/lib/tournament-state';

const LEGACY_HOGS_DAWGS_HYPE: HypeContent = {
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


export default function TournamentHypePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);

  useEffect(() => {
    function migrateIfNeeded(t: Tournament): Tournament {
      if (t.hypeContent && t.hypeContent.intro) return t;
      const nameNorm = t.name.toLowerCase().replace(/[^a-z]/g, '');
      if (nameNorm.includes('hogsdawgs') || nameNorm.includes('hogsanddawgs') || nameNorm.includes('hogsvsdawgs')) {
        const updated = { ...t, hypeContent: LEGACY_HOGS_DAWGS_HYPE };
        saveTournament(updated);
        return updated;
      }
      return t;
    }

    const cached = loadTournament(id);
    if (cached) setTournament(migrateIfNeeded(cached));
    fetchTournament(id).then((t) => {
      if (t) setTournament(migrateIfNeeded(t));
    });
  }, [id]);

  if (!tournament) return null;

  const content = tournament.hypeContent;

  if (!content) {
    return (
      <div className="min-h-full bg-gray-950 text-white">
        <header className="border-b border-gray-800">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <button onClick={() => router.push(`/tournament/${id}`)} className="text-sm text-gray-400 hover:text-white">
              Back
            </button>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">No Preview Available</h1>
          <p className="text-gray-400">This tournament doesn't have a hype preview configured yet.</p>
        </main>
      </div>
    );
  }

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
        {content.matchups.length > 0 && (
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
        )}

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
