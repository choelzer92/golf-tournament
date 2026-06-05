'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { FORMATS } from '@/lib/formats';
import type { Tournament, TournamentRound } from '@/lib/tournament-state';
import type { GameScore } from '@/lib/game-state';
import { loadTournament, saveTournament, loadGameScores, computeStandings, exportTournament, fetchTournament, fetchGameScores, subscribeToTournament, subscribeToScores } from '@/lib/tournament-state';
import { computeLiveMatchStatus } from '@/lib/live-scoring';

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
  const [scoreTick, setScoreTick] = useState(0);
  useEffect(() => {
    if (!tournament) return;
    const inProgressMatchups = tournament.rounds
      .flatMap((r) => r.matchups)
      .filter((m) => m.gameId && !m.result);

    if (inProgressMatchups.length === 0) return;

    Promise.all(inProgressMatchups.map((m) => fetchGameScores(m.id))).then(() => {
      setScoreTick((t) => t + 1);
    });

    const channels = inProgressMatchups.map((m) =>
      subscribeToScores(m.id, () => setScoreTick((t) => t + 1))
    );
    return () => { channels.forEach((ch) => ch.unsubscribe()); };
  }, [tournament?.rounds.map((r) => r.matchups.filter((m) => m.gameId && !m.result).map((m) => m.id)).flat().join(',')]);

  const [editingTeams, setEditingTeams] = useState(false);
  const [teamANameEdit, setTeamANameEdit] = useState('');
  const [teamBNameEdit, setTeamBNameEdit] = useState('');

  if (!tournament) return null;

  const standings = computeStandings(tournament);
  const teamA = tournament.teams[0];
  const teamB = tournament.teams[1];

  function saveTeamNames() {
    const updated: Tournament = {
      ...tournament!,
      teams: [
        { ...tournament!.teams[0], name: teamANameEdit },
        { ...tournament!.teams[1], name: teamBNameEdit },
      ],
    };
    saveTournament(updated);
    setTournament(updated);
    setEditingTeams(false);
  }

  // Compute live provisional standings
  let liveA = standings.teamAPoints;
  let liveB = standings.teamBPoints;
  for (const round of tournament.rounds) {
    for (const matchup of round.matchups) {
      if (!matchup.gameId || matchup.result) continue;
      const scores: GameScore[] | null = loadGameScores(matchup.id);
      if (!scores || scores.length === 0) continue;
      const status = computeLiveMatchStatus(scores, matchup, round, tournament);
      if (status) {
        liveA += status.holesWonA * round.pointsForWin + status.holesTied * round.pointsForTie;
        liveB += status.holesWonB * round.pointsForWin + status.holesTied * round.pointsForTie;
      }
    }
  }

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
              {editingTeams ? (
                <input
                  value={teamANameEdit}
                  onChange={(e) => setTeamANameEdit(e.target.value)}
                  className="text-sm bg-green-800 border border-green-600 rounded px-2 py-1 text-white text-center w-28"
                />
              ) : (
                <p className="text-sm text-green-300">{teamA.name}</p>
              )}
              <p className="text-4xl font-bold">{liveA}</p>
            </div>
            <div className="text-2xl text-green-500 font-light">—</div>
            <div className="text-center">
              {editingTeams ? (
                <input
                  value={teamBNameEdit}
                  onChange={(e) => setTeamBNameEdit(e.target.value)}
                  className="text-sm bg-green-800 border border-green-600 rounded px-2 py-1 text-white text-center w-28"
                />
              ) : (
                <p className="text-sm text-green-300">{teamB.name}</p>
              )}
              <p className="text-4xl font-bold">{liveB}</p>
            </div>
          </div>
          {editingTeams ? (
            <div className="flex justify-center gap-2 mt-2">
              <button onClick={saveTeamNames} className="text-xs bg-green-600 hover:bg-green-500 px-3 py-1 rounded">Save</button>
              <button onClick={() => setEditingTeams(false)} className="text-xs text-green-300 hover:text-white px-3 py-1">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setEditingTeams(true)} className="block mx-auto mt-2 text-xs text-green-400 hover:text-white">
              Edit team names
            </button>
          )}
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
            <button
              onClick={() => {
                const url = `${window.location.origin}/tournament/${id}`;
                navigator.clipboard.writeText(url).then(() => {
                  alert('Link copied! Share it with your group.');
                });
              }}
              className="text-sm bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg font-medium transition"
            >
              Share Link
            </button>
            <button
              onClick={() => {
                const wizardData = {
                  name: `${tournament.name} (Copy)`,
                  teamAName: 'Team A',
                  teamBName: 'Team B',
                  players: [],
                  teamAssignments: {},
                  rounds: tournament.rounds.map((r) => ({
                    id: crypto.randomUUID(),
                    name: r.name,
                    dayLabel: r.dayLabel,
                    formatId: r.formatId,
                    teamMode: r.teamMode,
                    course: r.course,
                    holesPlaying: r.holesPlaying,
                    groupingMode: r.groupingMode,
                    scoringMethod: r.scoringMethod,
                    pointsForWin: r.pointsForWin,
                    pointsForTie: r.pointsForTie,
                    pointsForLoss: r.pointsForLoss,
                    handicapAllowance: r.handicapAllowance,
                    strokeMethod: r.strokeMethod,
                    handicapBasis: r.handicapBasis,
                    defaultTeeId: r.defaultTeeId,
                    formatSettings: r.formatSettings,
                    splitFormat: r.splitFormat,
                    bonuses: r.bonuses.map((b) => ({ ...b, id: crypto.randomUUID(), result: undefined })),
                    order: r.order,
                  })),
                  step: 'roster',
                };
                sessionStorage.setItem('tournament_wizard_draft', JSON.stringify(wizardData));
                router.push('/tournament/new');
              }}
              className="text-sm bg-green-950 hover:bg-green-800 text-green-200 px-4 py-2 rounded-lg font-medium transition"
            >
              Duplicate Format
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

        <RosterEditor tournament={tournament} onSave={(updated) => { saveTournament(updated); setTournament(updated); }} />
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

function RosterEditor({ tournament, onSave }: { tournament: Tournament; onSave: (t: Tournament) => void }) {
  const teamA = tournament.teams[0];
  const teamB = tournament.teams[1];
  const teamAPlayers = tournament.players.filter((p) => teamA.playerIds.includes(p.id));
  const teamBPlayers = tournament.players.filter((p) => teamB.playerIds.includes(p.id));
  const hasMatchups = tournament.rounds.some((r) => r.matchups.length > 0);

  function moveToB(playerId: string) {
    const updated: Tournament = {
      ...tournament,
      teams: [
        { ...teamA, playerIds: teamA.playerIds.filter((id) => id !== playerId) },
        { ...teamB, playerIds: [...teamB.playerIds, playerId] },
      ],
      // Clear matchups since team composition changed
      rounds: tournament.rounds.map((r) => ({ ...r, matchups: [] })),
    };
    onSave(updated);
  }

  function moveToA(playerId: string) {
    const updated: Tournament = {
      ...tournament,
      teams: [
        { ...teamA, playerIds: [...teamA.playerIds, playerId] },
        { ...teamB, playerIds: teamB.playerIds.filter((id) => id !== playerId) },
      ],
      // Clear matchups since team composition changed
      rounds: tournament.rounds.map((r) => ({ ...r, matchups: [] })),
    };
    onSave(updated);
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Roster</h2>
      {hasMatchups && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded p-2 mb-3">
          Moving players will reset matchups since team composition changes.
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="font-medium text-blue-900 mb-2">{teamA.name} ({teamAPlayers.length})</p>
          {teamAPlayers.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-1">
              <span className="text-sm text-blue-800">
                {p.name} {p.handicapIndex !== null && <span className="text-blue-500">({p.handicapIndex})</span>}
              </span>
              <button
                onClick={() => moveToB(p.id)}
                className="text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2 py-0.5 rounded"
              >
                → {teamB.name}
              </button>
            </div>
          ))}
          {teamAPlayers.length === 0 && <p className="text-sm text-blue-400">No players</p>}
        </div>
        <div className="bg-red-50 rounded-lg p-3">
          <p className="font-medium text-red-900 mb-2">{teamB.name} ({teamBPlayers.length})</p>
          {teamBPlayers.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-1">
              <span className="text-sm text-red-800">
                {p.name} {p.handicapIndex !== null && <span className="text-red-500">({p.handicapIndex})</span>}
              </span>
              <button
                onClick={() => moveToA(p.id)}
                className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-0.5 rounded"
              >
                → {teamA.name}
              </button>
            </div>
          ))}
          {teamBPlayers.length === 0 && <p className="text-sm text-red-400">No players</p>}
        </div>
      </div>
    </section>
  );
}
