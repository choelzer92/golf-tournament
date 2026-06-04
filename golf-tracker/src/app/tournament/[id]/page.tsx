'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { FORMATS } from '@/lib/formats';
import type { Tournament, TournamentRound } from '@/lib/tournament-state';
import { loadTournament, saveTournament, computeStandings, exportTournament, fetchTournament, fetchGameScores, subscribeToTournament, subscribeToScores } from '@/lib/tournament-state';

export default function TournamentHubPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);

  useEffect(() => {
    const cached = loadTournament(id);
    if (cached) {
      setTournament(cached);
    }
    fetchTournament(id).then((t) => {
      if (t) setTournament(t);
      else if (!cached) router.push('/dashboard');
    });
    const channel = subscribeToTournament(id, (t) => setTournament(t));
    return () => { channel.unsubscribe(); };
  }, [id, router]);

  // Subscribe to live score changes to update standings in real-time
  useEffect(() => {
    if (!tournament) return;
    const inProgressMatchups = tournament.rounds
      .flatMap((r) => r.matchups)
      .filter((m) => m.gameId && !m.result);

    if (inProgressMatchups.length === 0) return;

    inProgressMatchups.forEach((m) => fetchGameScores(m.id));

    const channels = inProgressMatchups.map((m) =>
      subscribeToScores(m.id, () => setTournament((t) => t ? { ...t } : t))
    );
    return () => { channels.forEach((ch) => ch.unsubscribe()); };
  }, [tournament?.rounds.map((r) => r.matchups.filter((m) => m.gameId && !m.result).map((m) => m.id)).flat().join(',')]);

  if (!tournament) return null;

  const standings = computeStandings(tournament);
  const teamA = tournament.teams[0];
  const teamB = tournament.teams[1];

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{tournament.name}</h1>
            <p className="text-xs text-green-200">Team Event</p>
          </div>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-green-200 hover:text-white">
            Dashboard
          </button>
        </div>
      </header>

      {/* Scoreboard */}
      <div className="bg-green-900 text-white py-6">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <p className="text-sm text-green-300">{teamA.name}</p>
              <p className="text-4xl font-bold">{standings.teamAPoints}</p>
            </div>
            <div className="text-2xl text-green-500 font-light">—</div>
            <div className="text-center">
              <p className="text-sm text-green-300">{teamB.name}</p>
              <p className="text-4xl font-bold">{standings.teamBPoints}</p>
            </div>
          </div>
          <div className="text-center mt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => router.push(`/tournament/${id}/scoreboard`)}
              className="text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition"
            >
              Live Scoreboard
            </button>
            <button
              onClick={() => {
                const json = exportTournament(id);
                if (!json) return;
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${tournament.name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-sm bg-green-950 hover:bg-green-800 text-green-200 px-4 py-2 rounded-lg font-medium transition"
            >
              Export
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Rounds</h2>

        <div className="space-y-3 mb-6">
          {tournament.rounds.map((round) => (
            <RoundCard
              key={round.id}
              round={round}
              tournamentId={id}
              standings={standings}
              router={router}
            />
          ))}
        </div>

        {tournament.rounds.length === 0 && (
          <p className="text-center text-gray-500 py-8">No rounds scheduled yet.</p>
        )}
      </main>
    </div>
  );
}

function RoundCard({
  round, tournamentId, standings, router,
}: {
  round: TournamentRound;
  tournamentId: string;
  standings: ReturnType<typeof computeStandings>;
  router: ReturnType<typeof useRouter>;
}) {
  const format = FORMATS.find((f) => f.id === round.formatId);
  const roundResult = standings.roundResults.find((r) => r.roundId === round.id);
  const completedMatchups = round.matchups.filter((m) => m.result).length;
  const totalMatchups = round.matchups.length;

  return (
    <button
      onClick={() => router.push(`/tournament/${tournamentId}/round/${round.id}`)}
      className="w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="font-medium text-gray-900">{round.dayLabel}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          round.status === 'completed' ? 'bg-green-100 text-green-800' :
          round.status === 'in-progress' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-600'
        }`}>
          {round.status === 'in-progress' ? `${completedMatchups}/${totalMatchups}` : round.status}
        </span>
      </div>
      <p className="text-sm text-gray-600">
        {format?.name || round.formatId}
        {' · '}{round.holesPlaying === '18' ? '18H' : '9H'}
        {round.course ? ` · ${round.course.courseName}` : ''}
      </p>
      {roundResult && (roundResult.teamAPoints > 0 || roundResult.teamBPoints > 0) && (
        <p className="text-sm font-medium text-green-700 mt-1">
          {roundResult.teamAPoints} — {roundResult.teamBPoints}
        </p>
      )}
    </button>
  );
}
