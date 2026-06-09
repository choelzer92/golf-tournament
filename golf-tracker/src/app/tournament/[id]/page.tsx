'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { FORMATS } from '@/lib/formats';
import type { Tournament, TournamentRound } from '@/lib/tournament-state';
import type { GameScore } from '@/lib/game-state';
import { loadTournament, saveTournament, loadGameScores, computeStandings, exportTournament, fetchTournament, fetchGameScores, subscribeToTournament, subscribeToScores } from '@/lib/tournament-state';
import type { TournamentMoneyGames } from '@/lib/tournament-state';
import { computeLiveMatchStatus, recomputeMatchResult } from '@/lib/live-scoring';

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
  const [editingDisplay, setEditingDisplay] = useState(false);
  const [displayModeEdit, setDisplayModeEdit] = useState<'points-race' | 'ryder-cup'>('points-race');
  const [targetScoreEdit, setTargetScoreEdit] = useState('');

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

  function saveDisplaySettings() {
    const updated: Tournament = {
      ...tournament!,
      displayMode: displayModeEdit,
      targetScore: targetScoreEdit ? parseFloat(targetScoreEdit) : undefined,
    };
    saveTournament(updated);
    setTournament(updated);
    setEditingDisplay(false);
  }

  // Compute live provisional standings
  let liveA = standings.teamAPoints;
  let liveB = standings.teamBPoints;
  for (const round of tournament.rounds) {
    for (const matchup of round.matchups) {
      if (!matchup.gameId || matchup.result) continue;
      const scores: GameScore[] | null = loadGameScores(matchup.id);
      if (!scores || scores.length === 0) continue;
      if (round.formatId === 'stableford' && round.scoringMethod === 'stroke-play') {
        const result = recomputeMatchResult(scores, matchup, round, tournament);
        if (result) {
          liveA += result.pointsTeamA;
          liveB += result.pointsTeamB;
        }
      } else {
        const status = computeLiveMatchStatus(scores, matchup, round, tournament);
        if (status) {
          liveA += status.holesWonA * round.pointsForWin + status.holesTied * round.pointsForTie;
          liveB += status.holesWonB * round.pointsForWin + status.holesTied * round.pointsForTie;
        }
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
          {/* Target progress bar */}
          {tournament.targetScore && tournament.targetScore > 0 && (
            <div className="mt-4 max-w-md mx-auto">
              <div className="relative h-2.5 bg-green-950 rounded-full overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, (liveA / (tournament.targetScore * 2)) * 100)}%` }}
                />
                <div
                  className="absolute right-0 top-0 h-full bg-red-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, (liveB / (tournament.targetScore * 2)) * 100)}%` }}
                />
                <div className="absolute top-0 h-full w-0.5 bg-yellow-400" style={{ left: '50%' }} />
              </div>
              <div className="flex justify-between mt-1 text-xs">
                <span className={`font-medium ${liveA >= tournament.targetScore ? 'text-yellow-300' : 'text-green-300'}`}>
                  {liveA >= tournament.targetScore ? 'WINS' : `needs ${tournament.targetScore - liveA}`}
                </span>
                <span className="text-green-500">{tournament.targetScore} to win</span>
                <span className={`font-medium ${liveB >= tournament.targetScore ? 'text-yellow-300' : 'text-green-300'}`}>
                  {liveB >= tournament.targetScore ? 'WINS' : `needs ${tournament.targetScore - liveB}`}
                </span>
              </div>
            </div>
          )}

          {editingTeams ? (
            <div className="flex justify-center gap-2 mt-2">
              <button onClick={saveTeamNames} className="text-xs bg-green-600 hover:bg-green-500 px-3 py-1 rounded">Save</button>
              <button onClick={() => setEditingTeams(false)} className="text-xs text-green-300 hover:text-white px-3 py-1">Cancel</button>
            </div>
          ) : (
            <div className="flex justify-center gap-3 mt-2">
              <button onClick={() => { setTeamANameEdit(teamA.name); setTeamBNameEdit(teamB.name); setEditingTeams(true); }} className="text-xs text-green-400 hover:text-white">
                Edit team names
              </button>
              <button onClick={() => { setDisplayModeEdit(tournament.displayMode || 'points-race'); setTargetScoreEdit(tournament.targetScore ? String(tournament.targetScore) : ''); setEditingDisplay(true); }} className="text-xs text-green-400 hover:text-white">
                Display settings
              </button>
            </div>
          )}

          {editingDisplay && (
            <div className="mt-3 bg-gray-800 border border-green-600 rounded-lg p-3 max-w-sm mx-auto">
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setDisplayModeEdit('points-race')}
                  className={`flex-1 text-xs py-1.5 rounded ${displayModeEdit === 'points-race' ? 'bg-green-600 text-white' : 'bg-green-800 text-green-300'}`}
                >
                  Points Race
                </button>
                <button
                  onClick={() => setDisplayModeEdit('ryder-cup')}
                  className={`flex-1 text-xs py-1.5 rounded ${displayModeEdit === 'ryder-cup' ? 'bg-green-600 text-white' : 'bg-green-800 text-green-300'}`}
                >
                  Ryder Cup
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-green-300">Target:</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={targetScoreEdit}
                  onChange={(e) => setTargetScoreEdit(e.target.value)}
                  placeholder={displayModeEdit === 'ryder-cup' ? '16.5' : '70.5'}
                  className="w-20 text-xs bg-green-800 border border-green-600 rounded px-2 py-1 text-white"
                />
              </div>
              <div className="flex justify-center gap-2 mt-2">
                <button onClick={saveDisplaySettings} className="text-xs bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-white">Save</button>
                <button onClick={() => setEditingDisplay(false)} className="text-xs text-green-300 hover:text-white px-3 py-1">Cancel</button>
              </div>
            </div>
          )}

          <div className="text-center mt-4 flex flex-wrap items-center justify-center gap-3">
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
          <div className="mt-3 flex items-center justify-center gap-4">
            <button
              onClick={() => router.push(`/tournament/${id}/hype`)}
              className="text-xs text-yellow-400 hover:text-yellow-200 font-bold transition"
            >
              Tournament Preview
            </button>
            <button
              onClick={() => router.push(`/tournament/${id}/rules`)}
              className="text-xs text-green-400 hover:text-white transition"
            >
              Scoring Rules & Format Guide
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <MoneyGamesConfig tournament={tournament} onSave={(updated) => { saveTournament(updated); setTournament(updated); }} />

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  function moveToB(playerId: string) {
    const updated: Tournament = {
      ...tournament,
      teams: [
        { ...teamA, playerIds: teamA.playerIds.filter((id) => id !== playerId) },
        { ...teamB, playerIds: [...teamB.playerIds, playerId] },
      ],
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
      rounds: tournament.rounds.map((r) => ({ ...r, matchups: [] })),
    };
    onSave(updated);
  }

  function startEditHandicap(player: { id: string; handicapIndex: number | null }) {
    setEditingId(player.id);
    setEditValue(player.handicapIndex != null ? String(player.handicapIndex) : '');
  }

  function saveHandicap() {
    if (!editingId) return;
    const newIndex = editValue.trim() === '' ? null : parseFloat(editValue);
    const updated: Tournament = {
      ...tournament,
      players: tournament.players.map((p) =>
        p.id === editingId ? { ...p, handicapIndex: newIndex } : p
      ),
    };
    onSave(updated);
    setEditingId(null);
  }

  function renderPlayer(p: typeof tournament.players[0], colorClass: string, hcapColorClass: string) {
    return (
      <div key={p.id} className="flex items-center justify-between py-1">
        <span className={`text-sm ${colorClass}`}>
          {p.name}{' '}
          {editingId === p.id ? (
            <span className="inline-flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveHandicap(); if (e.key === 'Escape') setEditingId(null); }}
                autoFocus
                className="w-14 text-xs border rounded px-1 py-0.5"
              />
              <button onClick={saveHandicap} className="text-xs text-green-700 font-medium">ok</button>
            </span>
          ) : (
            <button
              onClick={() => startEditHandicap(p)}
              className={`${hcapColorClass} hover:underline`}
              title="Tap to edit handicap"
            >
              {p.handicapIndex !== null ? `(${p.handicapIndex})` : '(-)'}
            </button>
          )}
        </span>
      </div>
    );
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
            <div key={p.id}>
              {renderPlayer(p, 'text-blue-800', 'text-blue-500')}
              <div className="flex justify-end">
                <button
                  onClick={() => moveToB(p.id)}
                  className="text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2 py-0.5 rounded"
                >
                  → {teamB.name}
                </button>
              </div>
            </div>
          ))}
          {teamAPlayers.length === 0 && <p className="text-sm text-blue-400">No players</p>}
        </div>
        <div className="bg-red-50 rounded-lg p-3">
          <p className="font-medium text-red-900 mb-2">{teamB.name} ({teamBPlayers.length})</p>
          {teamBPlayers.map((p) => (
            <div key={p.id}>
              {renderPlayer(p, 'text-red-800', 'text-red-500')}
              <div className="flex justify-end">
                <button
                  onClick={() => moveToA(p.id)}
                  className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-0.5 rounded"
                >
                  → {teamA.name}
                </button>
              </div>
            </div>
          ))}
          {teamBPlayers.length === 0 && <p className="text-sm text-red-400">No players</p>}
        </div>
      </div>
    </section>
  );
}

function MoneyGamesConfig({ tournament, onSave }: { tournament: Tournament; onSave: (t: Tournament) => void }) {
  const [expanded, setExpanded] = useState(false);
  const mg = tournament.moneyGames;

  const [nassauEnabled, setNassauEnabled] = useState(!!mg?.teamNassau);
  const [frontAmt, setFrontAmt] = useState(String(mg?.teamNassau?.frontAmount ?? 10));
  const [backAmt, setBackAmt] = useState(String(mg?.teamNassau?.backAmount ?? 10));
  const [overallAmt, setOverallAmt] = useState(String(mg?.teamNassau?.overallAmount ?? 5));
  const [nassauAllowance, setNassauAllowance] = useState(String(mg?.teamNassau?.allowance ?? 75));

  const [skinsEnabled, setSkinsEnabled] = useState(!!mg?.skins);
  const [antePerRound, setAntePerRound] = useState(String(mg?.skins?.antePerRound ?? 20));
  const [carryover, setCarryover] = useState(mg?.skins?.carryover ?? true);
  const [skinsAllowance, setSkinsAllowance] = useState(String(mg?.skins?.allowance ?? 50));

  function save() {
    const moneyGames: TournamentMoneyGames = {};
    if (nassauEnabled) {
      moneyGames.teamNassau = {
        frontAmount: parseFloat(frontAmt) || 10,
        backAmount: parseFloat(backAmt) || 10,
        overallAmount: parseFloat(overallAmt) || 5,
        method: 'best-net',
        allowance: parseFloat(nassauAllowance) || 75,
      };
    }
    if (skinsEnabled) {
      moneyGames.skins = {
        antePerRound: parseFloat(antePerRound) || 20,
        carryover,
        crossRound: true,
        basis: 'net-to-par',
        allowance: parseFloat(skinsAllowance) || 50,
      };
    }
    onSave({ ...tournament, moneyGames: (nassauEnabled || skinsEnabled) ? moneyGames : undefined });
    setExpanded(false);
  }

  const router = useRouter();

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-gray-900">Money Games</h2>
        <div className="flex gap-2">
          {mg && (
            <button
              onClick={() => router.push(`/tournament/${tournament.id}/money`)}
              className="text-xs bg-green-100 text-green-800 hover:bg-green-200 px-3 py-1 rounded-full font-medium"
            >
              View Settlement
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-green-700 hover:text-green-900 font-medium"
          >
            {expanded ? 'Cancel' : mg ? 'Edit' : 'Configure'}
          </button>
        </div>
      </div>

      {!expanded && mg && (
        <div className="bg-white rounded-lg shadow p-3 text-sm text-gray-700">
          {mg.teamNassau && (
            <p>Team Nassau: ${mg.teamNassau.frontAmount}/${mg.teamNassau.backAmount}/${mg.teamNassau.overallAmount} (front/back/overall) · {mg.teamNassau.allowance}% handicap</p>
          )}
          {mg.skins && (
            <p>Skins: ${mg.skins.antePerRound}/round · {mg.skins.carryover ? 'carryover' : 'no carryover'} · {mg.skins.allowance}% handicap</p>
          )}
        </div>
      )}

      {!expanded && !mg && (
        <p className="text-sm text-gray-400">No money games configured.</p>
      )}

      {expanded && (
        <div className="bg-white rounded-lg shadow p-4 space-y-4">
          {/* Team Nassau */}
          <div>
            <label className="flex items-center gap-2 font-medium text-gray-800 text-sm">
              <input type="checkbox" checked={nassauEnabled} onChange={(e) => setNassauEnabled(e.target.checked)} className="rounded" />
              Team Nassau (best net per hole)
            </label>
            {nassauEnabled && (
              <div className="mt-2 ml-6 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Front 9 ($)</label>
                  <input type="text" inputMode="decimal" value={frontAmt} onChange={(e) => setFrontAmt(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Back 9 ($)</label>
                  <input type="text" inputMode="decimal" value={backAmt} onChange={(e) => setBackAmt(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Overall ($)</label>
                  <input type="text" inputMode="decimal" value={overallAmt} onChange={(e) => setOverallAmt(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Allowance (%)</label>
                  <input type="text" inputMode="decimal" value={nassauAllowance} onChange={(e) => setNassauAllowance(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                </div>
              </div>
            )}
          </div>

          {/* Skins */}
          <div>
            <label className="flex items-center gap-2 font-medium text-gray-800 text-sm">
              <input type="checkbox" checked={skinsEnabled} onChange={(e) => setSkinsEnabled(e.target.checked)} className="rounded" />
              Individual Skins (net-to-par)
            </label>
            {skinsEnabled && (
              <div className="mt-2 ml-6 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Ante per round ($)</label>
                  <input type="text" inputMode="decimal" value={antePerRound} onChange={(e) => setAntePerRound(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Allowance (%)</label>
                  <input type="text" inputMode="decimal" value={skinsAllowance} onChange={(e) => setSkinsAllowance(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={carryover} onChange={(e) => setCarryover(e.target.checked)} className="rounded" />
                    Carryover on ties
                  </label>
                </div>
              </div>
            )}
          </div>

          <button onClick={save} className="w-full bg-green-700 hover:bg-green-600 text-white text-sm font-medium py-2 rounded-lg">
            Save Money Games
          </button>
        </div>
      )}
    </section>
  );
}
