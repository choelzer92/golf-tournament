'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { GameSetup, Player } from '@/lib/game-state';
import type { PoolGame, PoolTeam } from '@/lib/pool-game';
import {
  loadPoolGame,
  fetchPoolGame,
  savePoolGame,
  subscribeToPoolGame,
  getPoolPlayingHandicap,
  getPar3Holes,
} from '@/lib/pool-game';

export default function PoolHubPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [game, setGame] = useState<PoolGame | null>(null);

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

  if (!game) return null;

  function playersForTeam(team: PoolTeam): Player[] {
    return team.playerIds
      .map((pid) => game!.players.find((p) => p.id === pid))
      .filter((p): p is Player => !!p);
  }

  function enterScores(team: PoolTeam) {
    const players = playersForTeam(team);
    const setup: GameSetup = {
      formatId: 'stroke-play',
      teamMode: 'two-best-balls',
      course: game!.course,
      players,
      handicapAllowance: game!.handicapAllowance,
      holesPlaying: '18',
      strokeMethod: 'full',
      handicapBasis: 'course',
      formatSettings: { ballSelection: game!.ballSelection },
      matchupId: team.matchupId,
    };

    sessionStorage.setItem('game_setup', JSON.stringify(setup));
    sessionStorage.setItem('game_pool_context', JSON.stringify({ poolGameId: game!.id, matchupId: team.matchupId }));
    sessionStorage.removeItem('game_tournament_context');
    router.push('/game/play');
  }

  const pot = game.players.length * game.entryPerPlayer;

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{game.name}</h1>
            <p className="text-xs text-green-200">Pool Money Game · {game.teams.length} foursomes</p>
          </div>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-green-200 hover:text-white">
            Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Leaderboard CTA */}
        <div className="flex justify-center">
          <button
            onClick={() => router.push(`/pool/${id}/leaderboard`)}
            className="text-sm bg-green-700 hover:bg-green-600 text-white px-5 py-2.5 rounded-lg font-medium transition"
          >
            Leaderboard
          </button>
        </div>

        {/* Money summary */}
        <MoneySummary game={game} pot={pot} />

        {/* Foursome cards */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Foursomes</h2>
          <div className="space-y-3">
            {game.teams.map((team) => (
              <FoursomeCard
                key={team.id}
                team={team}
                players={playersForTeam(team)}
                game={game}
                onEnterScores={() => enterScores(team)}
              />
            ))}
            {game.teams.length === 0 && (
              <p className="text-center text-gray-500 py-8">No foursomes configured yet.</p>
            )}
          </div>
        </section>

        {/* CTP editor / finalize surface */}
        <CtpEditor game={game} onSave={(updated) => { savePoolGame(updated); setGame(updated); }} />
      </main>
    </div>
  );
}

function MoneySummary({ game, pot }: { game: PoolGame; pot: number }) {
  const rows: { label: string; amount: number }[] = [
    { label: 'Front 9', amount: pot * game.potSplit.front },
    { label: 'Back 9', amount: pot * game.potSplit.back },
    { label: 'Overall 18', amount: pot * game.potSplit.overall },
    { label: 'Junk', amount: pot * game.potSplit.junk },
  ];

  return (
    <section>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 bg-gray-100 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Pot</h2>
          <span className="text-sm text-gray-600">
            {game.players.length} × ${game.entryPerPlayer} = <span className="font-bold text-gray-900">${Math.round(pot)}</span>
          </span>
        </div>
        <div className="grid grid-cols-4 divide-x divide-gray-100">
          {rows.map((r) => (
            <div key={r.label} className="px-2 py-3 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">{r.label}</p>
              <p className="text-lg font-bold text-green-700">${Math.round(r.amount)}</p>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 text-xs text-gray-400 border-t">
          Winner-take-all per pot · lowest team total wins · {game.handicapAllowance}% handicap
        </div>
      </div>
    </section>
  );
}

function FoursomeCard({
  team,
  players,
  game,
  onEnterScores,
}: {
  team: PoolTeam;
  players: Player[];
  game: PoolGame;
  onEnterScores: () => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-gray-900">{team.name}</p>
        {team.teeTime && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{team.teeTime}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
        {players.map((p) => (
          <span key={p.id} className="text-sm text-gray-700">
            {p.name.split(' ')[0]}
            <span className="text-xs text-gray-400 ml-0.5">
              ({Math.round(getPoolPlayingHandicap(p, game.course, game.handicapAllowance))})
            </span>
          </span>
        ))}
      </div>
      <button
        onClick={onEnterScores}
        className="w-full bg-green-700 hover:bg-green-600 text-white font-medium py-2.5 rounded-lg text-sm"
      >
        Enter Scores
      </button>
    </div>
  );
}

function CtpEditor({ game, onSave }: { game: PoolGame; onSave: (g: PoolGame) => void }) {
  const par3Holes = getPar3Holes(game.course);
  if (par3Holes.length === 0) return null;

  function setWinner(hole: number, playerId: string | null) {
    const updated: PoolGame = {
      ...game,
      ctpWinners: { ...game.ctpWinners, [hole]: playerId },
    };
    onSave(updated);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Closest to the Pin</h2>
      <p className="text-xs text-gray-400 mb-3">Set the CTP winner on each par 3. Contributes to the junk pot.</p>
      <div className="space-y-3">
        {par3Holes.map((hole) => {
          const currentId = game.ctpWinners?.[hole] ?? null;
          const currentPlayer = currentId ? game.players.find((p) => p.id === currentId) : null;
          return (
            <div key={hole} className="bg-white rounded-lg shadow p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-gray-900">Hole {hole}</p>
                <span className="text-xs text-gray-500">
                  {currentPlayer ? currentPlayer.name.split(' ')[0] : 'No winner'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setWinner(hole, null)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${
                    currentId === null
                      ? 'bg-gray-700 text-white border-gray-700'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  None
                </button>
                {game.players.map((p) => {
                  const isSelected = currentId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setWinner(hole, p.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border ${
                        isSelected
                          ? 'bg-green-700 text-white border-green-700'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {p.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
