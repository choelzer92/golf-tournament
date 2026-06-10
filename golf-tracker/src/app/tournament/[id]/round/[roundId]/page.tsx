'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { FORMATS, TEAM_MODES, getTeamModeConfig, getUsgaAllowance, getUsgaStrokeMethod } from '@/lib/formats';
import type { TeamMode } from '@/lib/formats';
import type { Player, GameSetup, GameScore } from '@/lib/game-state';
import type { Tournament, TournamentRound, RoundMatchup, RoundBonus, BonusType, SplitFormatConfig, SplitPairing } from '@/lib/tournament-state';
import { loadTournament, saveTournament, loadGameScores, saveGameScores, fetchGameScores, computeBonuses, fetchTournament, subscribeToTournament, subscribeToScores } from '@/lib/tournament-state';
import { recomputeMatchResult, getPlayerStrokesForHole, computePlayerStablefordPoints, computeSplitMatchStatuses } from '@/lib/live-scoring';

export default function RoundDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;
  const roundId = params.roundId as string;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [round, setRound] = useState<TournamentRound | null>(null);
  const [selectedA, setSelectedA] = useState<string[]>([]);
  const [selectedB, setSelectedB] = useState<string[]>([]);
  const [editingSettings, setEditingSettings] = useState(false);
  const [sittingOut, setSittingOut] = useState<Set<string>>(new Set());
  const [teamSelectMatchup, setTeamSelectMatchup] = useState<RoundMatchup | null>(null);
  const [scoreTick, setScoreTick] = useState(0);

  useEffect(() => {
    const cached = loadTournament(tournamentId);
    if (cached) {
      setTournament(cached);
      const r = cached.rounds.find((r) => r.id === roundId);
      if (r) setRound(r);
    }
    fetchTournament(tournamentId).then((t) => {
      if (!t) { if (!cached) router.push('/dashboard'); return; }
      setTournament(t);
      const r = t.rounds.find((r) => r.id === roundId);
      if (r) setRound(r);
      else if (!cached) router.push(`/tournament/${tournamentId}`);
    });
    const channel = subscribeToTournament(tournamentId, (t) => {
      setTournament(t);
      const r = t.rounds.find((r) => r.id === roundId);
      if (r) setRound(r);
    });
    return () => { channel.unsubscribe(); };
  }, [tournamentId, roundId, router]);

  // Subscribe to score changes for in-progress matchups
  useEffect(() => {
    if (!round) return;
    const inProgress = round.matchups.filter((m) => m.gameId && !m.result);
    if (inProgress.length === 0) return;
    inProgress.forEach((m) => fetchGameScores(m.id));
    const channels = inProgress.map((m) =>
      subscribeToScores(m.id, () => setScoreTick((t) => t + 1))
    );
    return () => { channels.forEach((ch) => ch.unsubscribe()); };
  }, [round?.matchups.filter((m) => m.gameId && !m.result).map((m) => m.id).join(',')]);

  if (!tournament || !round) return null;

  const format = FORMATS.find((f) => f.id === round.formatId);
  const teamA = tournament.teams[0];
  const teamB = tournament.teams[1];
  const teamAPlayers = tournament.players.filter((p) => teamA.playerIds.includes(p.id));
  const teamBPlayers = tournament.players.filter((p) => teamB.playerIds.includes(p.id));

  const assignedPlayerIds = new Set(round.matchups.flatMap((m) => m.playerIds));
  const unassignedA = teamAPlayers.filter((p) => !assignedPlayerIds.has(p.id) && !sittingOut.has(p.id));
  const unassignedB = teamBPlayers.filter((p) => !assignedPlayerIds.has(p.id) && !sittingOut.has(p.id));
  const sittingOutA = teamAPlayers.filter((p) => sittingOut.has(p.id) && !assignedPlayerIds.has(p.id));
  const sittingOutB = teamBPlayers.filter((p) => sittingOut.has(p.id) && !assignedPlayerIds.has(p.id));

  function toggleSelectA(playerId: string) {
    setSelectedA((prev) => prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]);
  }

  function toggleSelectB(playerId: string) {
    setSelectedB((prev) => prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]);
  }

  function createManualMatchup() {
    if (selectedA.length === 0 && selectedB.length === 0) return;
    const newMatchup: RoundMatchup = {
      id: crypto.randomUUID(),
      groupLabel: `Group ${round!.matchups.length + 1}`,
      playerIds: [...selectedA, ...selectedB],
      teamAPlayerIds: selectedA,
      teamBPlayerIds: selectedB,
      gameId: null,
      result: null,
    };
    updateRound({ ...round!, matchups: [...round!.matchups, newMatchup] });
    setSelectedA([]);
    setSelectedB([]);
  }

  const canCreateMatchup = selectedA.length > 0 || selectedB.length > 0;

  function updateRound(updatedRound: TournamentRound) {
    const updatedTournament = {
      ...tournament!,
      rounds: tournament!.rounds.map((r) => r.id === roundId ? updatedRound : r),
    };
    setTournament(updatedTournament);
    setRound(updatedRound);
    saveTournament(updatedTournament);
  }

  function autoSuggestMatchups() {
    const sortedA = [...unassignedA].sort((a, b) => (a.handicapIndex ?? 99) - (b.handicapIndex ?? 99));
    const sortedB = [...unassignedB].sort((a, b) => (a.handicapIndex ?? 99) - (b.handicapIndex ?? 99));

    const newMatchups: RoundMatchup[] = [...round!.matchups];

    if (round!.groupingMode === 'cross-team') {
      const count = Math.min(sortedA.length, sortedB.length);
      for (let i = 0; i < count; i += 2) {
        const aPlayers = sortedA.slice(i, i + 2);
        const bPlayers = sortedB.slice(i, i + 2);
        if (aPlayers.length === 0 || bPlayers.length === 0) break;
        newMatchups.push({
          id: crypto.randomUUID(),
          groupLabel: `Group ${newMatchups.length + 1}`,
          playerIds: [...aPlayers, ...bPlayers].map((p) => p.id),
          teamAPlayerIds: aPlayers.map((p) => p.id),
          teamBPlayerIds: bPlayers.map((p) => p.id),
          gameId: null,
          result: null,
        });
      }
    } else {
      // Same-team grouping: pair team A groups with team B groups for head-to-head
      const groupSize = 4;
      const aGroups: Player[][] = [];
      const bGroups: Player[][] = [];
      for (let i = 0; i < sortedA.length; i += groupSize) aGroups.push(sortedA.slice(i, i + groupSize));
      for (let i = 0; i < sortedB.length; i += groupSize) bGroups.push(sortedB.slice(i, i + groupSize));
      const count = Math.min(aGroups.length, bGroups.length);
      for (let i = 0; i < count; i++) {
        newMatchups.push({
          id: crypto.randomUUID(),
          groupLabel: `Group ${newMatchups.length + 1}`,
          playerIds: [...aGroups[i], ...bGroups[i]].map((p) => p.id),
          teamAPlayerIds: aGroups[i].map((p) => p.id),
          teamBPlayerIds: bGroups[i].map((p) => p.id),
          gameId: null,
          result: null,
        });
      }
    }

    updateRound({ ...round!, matchups: newMatchups, status: 'pending' });
  }

  function removeMatchup(matchupId: string) {
    updateRound({
      ...round!,
      matchups: round!.matchups.filter((m) => m.id !== matchupId),
    });
  }

  function launchGame(matchup: RoundMatchup, scoringTeam?: 'A' | 'B' | 'all') {
    const isMultiGroup = matchup.teamAPlayerIds.length > 2 && matchup.teamBPlayerIds.length > 2
      && matchup.playerIds.length > 4;

    if (isMultiGroup && scoringTeam === undefined) {
      setTeamSelectMatchup(matchup);
      return;
    }

    const actualScoringTeam = scoringTeam === 'all' ? undefined : scoringTeam;

    // Reload fresh from storage to ensure we have latest settings
    const freshTournament = loadTournament(tournamentId);
    const freshRound = freshTournament?.rounds.find((r) => r.id === roundId) || round!;

    const allMatchupPlayers = (freshTournament || tournament!).players.filter((p) => matchup.playerIds.includes(p.id)).map((p) => ({ ...p }));
    const teeId = freshRound.defaultTeeId || freshRound.course?.teeSets[0]?.id || null;

    allMatchupPlayers.forEach((p) => {
      const override = freshRound.playerTeeOverrides?.[p.id];
      if (override) {
        p.teeSetId = override;
      } else if (p.gender === 'F' && freshRound.course) {
        const defaultTee = freshRound.course.teeSets.find((t) => t.id === teeId);
        const womensTee = freshRound.course.teeSets.find((t) => t.gender === 'F' && t.name === defaultTee?.name?.replace(' (W)', ''))
          || freshRound.course.teeSets.find((t) => t.gender === 'F');
        p.teeSetId = womensTee?.id || teeId || undefined;
      } else {
        p.teeSetId = teeId || undefined;
      }
    });

    const teamMode = freshRound.teamMode || format?.defaultTeamMode || 'individual';
    if (teamMode !== 'individual') {
      allMatchupPlayers.forEach((p) => {
        p.team = matchup.teamAPlayerIds.includes(p.id) ? 'A' : 'B';
      });
    }

    const setup: GameSetup = {
      formatId: freshRound.formatId,
      teamMode,
      course: freshRound.course ? { ...freshRound.course, selectedTeeId: teeId } : null,
      players: allMatchupPlayers,
      handicapAllowance: freshRound.handicapAllowance,
      holesPlaying: freshRound.holesPlaying,
      strokeMethod: freshRound.strokeMethod,
      handicapBasis: freshRound.handicapBasis,
      formatSettings: freshRound.formatSettings || {},
      ...(freshRound.splitFormat && {
        splitFormat: {
          formatId: freshRound.splitFormat.formatId,
          teamMode: freshRound.splitFormat.teamMode,
          scoringMethod: freshRound.splitFormat.scoringMethod,
          pointsForWin: freshRound.splitFormat.pointsForWin,
          pointsForTie: freshRound.splitFormat.pointsForTie,
          pointsForLoss: freshRound.splitFormat.pointsForLoss,
          handicapAllowance: freshRound.splitFormat.handicapAllowance,
          strokeMethod: freshRound.splitFormat.strokeMethod,
          formatSettings: freshRound.splitFormat.formatSettings,
          pairings: freshRound.splitFormat.pairings,
        },
      }),
      scoringTeam: actualScoringTeam,
      matchupId: matchup.id,
    };

    sessionStorage.setItem('game_setup', JSON.stringify(setup));
    sessionStorage.setItem('game_tournament_context', JSON.stringify({
      tournamentId,
      roundId,
      matchupId: matchup.id,
    }));

    // Mark matchup as in-progress
    const updatedMatchups = round!.matchups.map((m) =>
      m.id === matchup.id && !m.gameId ? { ...m, gameId: crypto.randomUUID() } : m
    );
    updateRound({ ...round!, matchups: updatedMatchups, status: 'in-progress' });
    router.push('/game/play');
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{round.dayLabel}</h1>
            <p className="text-xs text-green-200">{format?.name} · {round.holesPlaying === '18' ? '18H' : '9H'}</p>
          </div>
          <button onClick={() => router.push(`/tournament/${tournamentId}`)} className="text-sm text-green-200 hover:text-white">
            Back
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Round settings */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          {!editingSettings ? (
            <>
              <div className="grid grid-cols-2 text-center text-sm">
                <div>
                  <p className="text-xs text-gray-500">Scoring</p>
                  <p className="font-medium text-gray-900">{round.scoringMethod === 'match-play' ? 'Match Play' : 'Stroke Play'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Points</p>
                  <p className="font-medium text-gray-900">W:{round.pointsForWin} T:{round.pointsForTie} L:{round.pointsForLoss}</p>
                </div>
              </div>
              {round.course && (
                <p className="text-sm text-gray-600 text-center mt-2 pt-2 border-t">{round.course.courseName}</p>
              )}
              <div className="mt-2 flex items-center justify-between">
                <button
                  onClick={() => setEditingSettings(true)}
                  className="text-xs text-green-700 hover:text-green-900 font-medium"
                >
                  Edit Round Settings
                </button>
                {round.course && (
                  <button
                    onClick={() => router.push(`/tournament/${tournamentId}/round/${roundId}/course-adjustments`)}
                    className="text-xs text-gray-400 hover:text-gray-600 font-medium"
                  >
                    Course Adjustments
                  </button>
                )}
              </div>
            </>
          ) : (
            <RoundSettingsEditor
              round={round}
              players={tournament!.players}
              onSave={(updated) => { updateRound(updated); setEditingSettings(false); }}
              onCancel={() => setEditingSettings(false)}
            />
          )}
        </div>

        {/* Matchup assignment */}
        {(unassignedA.length > 0 || unassignedB.length > 0 || sittingOutA.length > 0 || sittingOutB.length > 0) && (
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">Assign Matchups</h3>
              {(unassignedA.length > 0 || unassignedB.length > 0) && (
                <button
                  onClick={autoSuggestMatchups}
                  className="text-sm bg-green-700 text-white px-3 py-1.5 rounded-md hover:bg-green-800"
                >
                  Auto-assign All
                </button>
              )}
            </div>

            {/* All vs All — one matchup with all remaining players */}
            {unassignedA.length > 0 && unassignedB.length > 0 && (
              <div className="mb-3 p-3 rounded-lg border-2 border-dashed border-green-300 bg-green-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-900">
                      All vs All ({unassignedA.length}v{unassignedB.length})
                    </p>
                    <p className="text-xs text-green-700">
                      One matchup, all players — score per tee time on separate devices
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const allAIds = unassignedA.map((p) => p.id);
                      const allBIds = unassignedB.map((p) => p.id);
                      const newMatchup: RoundMatchup = {
                        id: crypto.randomUUID(),
                        groupLabel: `All vs All`,
                        playerIds: [...allAIds, ...allBIds],
                        teamAPlayerIds: allAIds,
                        teamBPlayerIds: allBIds,
                        gameId: null,
                        result: null,
                      };
                      updateRound({ ...round!, matchups: [...round!.matchups, newMatchup] });
                    }}
                    className="px-4 py-2 rounded-md bg-green-700 text-white text-sm font-medium hover:bg-green-800"
                  >
                    Create
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 mb-3">Tap players to select, then tap &quot;Create Group&quot;. Long-press or use &times; to sit a player out.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-bold text-blue-700 mb-1">{teamA.name}</p>
                <div className="space-y-1">
                  {unassignedA.map((p) => {
                    const isSelected = selectedA.includes(p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-1">
                        <button
                          onClick={() => toggleSelectA(p.id)}
                          className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-blue-50 text-gray-700 hover:bg-blue-100'
                          }`}
                        >
                          {p.name} <span className={isSelected ? 'text-blue-200' : 'text-gray-400'}>({p.handicapIndex ?? '—'})</span>
                        </button>
                        <button
                          onClick={() => setSittingOut((prev) => new Set([...prev, p.id]))}
                          className="text-xs text-gray-400 hover:text-red-500 px-1"
                          title="Sit out this round"
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-red-700 mb-1">{teamB.name}</p>
                <div className="space-y-1">
                  {unassignedB.map((p) => {
                    const isSelected = selectedB.includes(p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-1">
                        <button
                          onClick={() => toggleSelectB(p.id)}
                          className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition ${
                            isSelected
                              ? 'bg-red-600 text-white'
                              : 'bg-red-50 text-gray-700 hover:bg-red-100'
                          }`}
                        >
                          {p.name} <span className={isSelected ? 'text-red-200' : 'text-gray-400'}>({p.handicapIndex ?? '—'})</span>
                        </button>
                        <button
                          onClick={() => setSittingOut((prev) => new Set([...prev, p.id]))}
                          className="text-xs text-gray-400 hover:text-red-500 px-1"
                          title="Sit out this round"
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {(sittingOutA.length > 0 || sittingOutB.length > 0) && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-medium text-gray-500 mb-1.5">Sitting out this round:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...sittingOutA, ...sittingOutB].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSittingOut((prev) => { const next = new Set(prev); next.delete(p.id); return next; })}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-xs text-gray-600 hover:bg-gray-200"
                    >
                      {p.name}
                      <span className="text-green-600 font-bold">+</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canCreateMatchup && (
              <button
                onClick={createManualMatchup}
                className="mt-3 w-full rounded-md bg-green-700 px-4 py-2 text-white text-sm font-medium hover:bg-green-800"
              >
                Create Group ({selectedA.length + selectedB.length} players)
              </button>
            )}
          </div>
        )}

        {/* Matchup cards */}
        {round.matchups.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">Matchups ({round.matchups.length})</h3>
            {round.matchups.map((matchup) => (
              <MatchupCard
                key={matchup.id}
                matchup={matchup}
                tournament={tournament!}
                round={round}
                onLaunch={() => launchGame(matchup)}
                onResume={() => launchGame(matchup)}
                onRemove={() => removeMatchup(matchup.id)}
                onEdit={() => {
                  // Clear the result so finishGame can re-save, but keep the gameId
                  const updatedMatchups = round.matchups.map((m) =>
                    m.id === matchup.id ? { ...m, result: null } : m
                  );
                  // Reset bonuses that depend on match results
                  const updatedBonuses = round.bonuses.map((b) => ({ ...b, result: undefined }));
                  updateRound({ ...round, matchups: updatedMatchups, bonuses: updatedBonuses, status: 'in-progress' });
                  launchGame(matchup);
                }}
                onReset={() => {
                  if (!confirm('Reset all scores for this matchup? This cannot be undone.')) return;
                  saveGameScores(matchup.id, []);
                  const newMatchupId = crypto.randomUUID();
                  const updatedMatchups = round.matchups.map((m) =>
                    m.id === matchup.id ? { ...m, id: newMatchupId, gameId: null, result: null } : m
                  );
                  const updatedBonuses = round.bonuses.map((b) => ({ ...b, result: undefined }));
                  const anyInProgress = updatedMatchups.some((m) => m.gameId && !m.result);
                  updateRound({ ...round, matchups: updatedMatchups, bonuses: updatedBonuses, status: anyInProgress ? 'in-progress' : 'pending' });
                }}
              />
            ))}
          </div>
        )}

        {/* Split format 1v1 pairing UI */}
        {round.splitFormat && round.splitFormat.teamMode === 'individual' && round.matchups.length > 0 && (
          <SplitPairingSection
            round={round}
            tournament={tournament}
            onUpdate={(pairings) => updateRound({
              ...round,
              splitFormat: { ...round.splitFormat!, pairings },
            })}
          />
        )}

        {/* Recompute results button */}
        {round.status === 'completed' && (
          <div className="mb-4">
            <button
              onClick={async () => {
                // Fetch all scores first (they may not be in cache for completed matches)
                await Promise.all(round.matchups.filter((m) => m.result).map((m) => fetchGameScores(m.id)));

                const updated = { ...round };
                // Reset ALL bonus results so computeBonuses will recompute them
                updated.bonuses = updated.bonuses.map((b) => ({ ...b, result: undefined }));
                for (const matchup of updated.matchups) {
                  if (!matchup.result) continue;
                  const scores = loadGameScores(matchup.id);
                  if (!scores || scores.length === 0) continue;
                  const newResult = recomputeMatchResult(scores, matchup, updated, tournament);
                  if (newResult) {
                    matchup.result = newResult;
                  }
                }
                // Recompute all bonuses (including match-winner with split format support)
                updated.bonuses = computeBonuses(updated, tournament);
                updateRound(updated);
              }}
              className="w-full text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-4 py-2 hover:bg-yellow-100 transition"
            >
              Recompute All Results
            </button>
          </div>
        )}

        {/* Bonus results display */}
        {round.status === 'completed' && round.bonuses.some((b) => b.result) && (
          <BonusResultsSection round={round} tournament={tournament} />
        )}

        {/* Bonuses */}
        <BonusConfigSection
          round={round}
          onUpdate={(bonuses) => updateRound({ ...round, bonuses })}
        />
      </main>

      {/* Team selection overlay for multi-group matchups */}
      {teamSelectMatchup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Which team are you scoring?</h3>
            <p className="text-sm text-gray-500 mb-6">
              This matchup has {teamSelectMatchup.playerIds.length} players across multiple tee times.
              Select your group — scores sync live to the other device.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => { launchGame(teamSelectMatchup!, 'A'); setTeamSelectMatchup(null); }}
                className="w-full p-4 rounded-lg border-2 border-blue-200 bg-blue-50 hover:border-blue-500 hover:bg-blue-100 transition text-left"
              >
                <p className="font-bold text-blue-800">{teamA.name}</p>
                <p className="text-sm text-blue-600 mt-1">
                  {tournament!.players
                    .filter((p) => teamSelectMatchup.teamAPlayerIds.includes(p.id))
                    .map((p) => p.name.split(' ')[0])
                    .join(', ')}
                </p>
              </button>
              <button
                onClick={() => { launchGame(teamSelectMatchup!, 'B'); setTeamSelectMatchup(null); }}
                className="w-full p-4 rounded-lg border-2 border-red-200 bg-red-50 hover:border-red-500 hover:bg-red-100 transition text-left"
              >
                <p className="font-bold text-red-800">{teamB.name}</p>
                <p className="text-sm text-red-600 mt-1">
                  {tournament!.players
                    .filter((p) => teamSelectMatchup.teamBPlayerIds.includes(p.id))
                    .map((p) => p.name.split(' ')[0])
                    .join(', ')}
                </p>
              </button>
              <button
                onClick={() => { launchGame(teamSelectMatchup!, 'all'); setTeamSelectMatchup(null); }}
                className="w-full p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition text-center"
              >
                <p className="text-sm text-gray-600">Score all players on this device</p>
              </button>
            </div>
            <button
              onClick={() => setTeamSelectMatchup(null)}
              className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoundSettingsEditor({
  round, players, onSave, onCancel,
}: {
  round: TournamentRound;
  players: import('@/lib/game-state').Player[];
  onSave: (r: TournamentRound) => void;
  onCancel: () => void;
}) {
  const [groupingMode, setGroupingMode] = useState(round.groupingMode);
  const [scoringMethod, setScoringMethod] = useState(round.scoringMethod);
  const [holesPlaying, setHolesPlaying] = useState(round.holesPlaying);
  const [formatId, setFormatId] = useState(round.formatId);
  const [teamMode, setTeamMode] = useState<TeamMode>(round.teamMode || FORMATS.find((f) => f.id === round.formatId)?.defaultTeamMode || 'individual');
  const [pointsForWin, setPointsForWin] = useState(round.pointsForWin);
  const [pointsForTie, setPointsForTie] = useState(round.pointsForTie);
  const [pointsForLoss, setPointsForLoss] = useState(round.pointsForLoss);
  const [dayLabel, setDayLabel] = useState(round.dayLabel);
  const [handicapAllowance, setHandicapAllowance] = useState(round.handicapAllowance);
  const [strokeMethod, setStrokeMethod] = useState(round.strokeMethod);
  const [handicapBasis, setHandicapBasis] = useState(round.handicapBasis);
  const [defaultTeeId, setDefaultTeeId] = useState(round.defaultTeeId);
  const [formatSettings, setFormatSettings] = useState<Record<string, string | number | boolean>>(round.formatSettings || {});
  const [tournamentPointMode, setTournamentPointMode] = useState<'fixed' | 'margin-based'>(round.tournamentPointMode || 'fixed');
  const [marginDivisor, setMarginDivisor] = useState(round.marginDivisor ?? 4);
  const [marginBaseline, setMarginBaseline] = useState(round.marginBaseline ?? 9);
  const [splitEnabled, setSplitEnabled] = useState(!!round.splitFormat);
  const [splitFormatId, setSplitFormatId] = useState(round.splitFormat?.formatId || 'match-play');
  const [splitTeamMode, setSplitTeamMode] = useState<TeamMode>(round.splitFormat?.teamMode || 'individual');
  const [splitScoringMethod, setSplitScoringMethod] = useState(round.splitFormat?.scoringMethod || 'match-play');
  const [splitPointsForWin, setSplitPointsForWin] = useState(round.splitFormat?.pointsForWin ?? 1);
  const [splitPointsForTie, setSplitPointsForTie] = useState(round.splitFormat?.pointsForTie ?? 0.5);
  const [splitPointsForLoss, setSplitPointsForLoss] = useState(round.splitFormat?.pointsForLoss ?? 0);
  const [splitAllowance, setSplitAllowance] = useState(round.splitFormat?.handicapAllowance ?? 100);
  const [splitStrokeMethod, setSplitStrokeMethod] = useState(round.splitFormat?.strokeMethod || 'off-the-low');
  const [splitFormatSettings, setSplitFormatSettings] = useState<Record<string, string | number | boolean>>(round.splitFormat?.formatSettings || {});
  const [playerTeeOverrides, setPlayerTeeOverrides] = useState<Record<string, number>>(round.playerTeeOverrides || {});
  const [course, setCourse] = useState<import('@/lib/game-state').CourseSelection | null>(round.course);
  const [showCourseSearch, setShowCourseSearch] = useState(false);

  function handleCourseSelect(c: import('@/lib/game-state').CourseSelection) {
    setCourse(c);
    setDefaultTeeId(c.teeSets[0]?.id || null);
    setShowCourseSearch(false);
  }

  function handleSave() {
    const format = FORMATS.find((f) => f.id === formatId);
    const splitFormat: SplitFormatConfig | undefined = splitEnabled ? {
      formatId: splitFormatId,
      teamMode: splitTeamMode,
      scoringMethod: splitScoringMethod,
      pointsForWin: splitPointsForWin,
      pointsForTie: splitPointsForTie,
      pointsForLoss: splitPointsForLoss,
      handicapAllowance: splitAllowance,
      strokeMethod: splitStrokeMethod,
      formatSettings: splitFormatSettings,
      pairings: round.splitFormat?.pairings,
    } : undefined;
    onSave({
      ...round,
      dayLabel,
      formatId,
      teamMode,
      formatSettings,
      holesPlaying: splitEnabled ? '18' : holesPlaying,
      groupingMode,
      scoringMethod,
      pointsForWin,
      pointsForTie,
      pointsForLoss,
      tournamentPointMode,
      marginDivisor,
      marginBaseline,
      handicapAllowance,
      strokeMethod,
      handicapBasis,
      defaultTeeId,
      playerTeeOverrides: Object.keys(playerTeeOverrides).length > 0 ? playerTeeOverrides : undefined,
      course: course ? { ...course, selectedTeeId: defaultTeeId } : null,
      splitFormat,
      name: `${dayLabel} — ${format?.name || formatId}`,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Edit Round Settings</h3>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Day Label</label>
        <input
          type="text"
          value={dayLabel}
          onChange={(e) => setDayLabel(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Format</label>
        <select
          value={formatId}
          onChange={(e) => {
            const newId = e.target.value;
            setFormatId(newId);
            const f = FORMATS.find((fmt) => fmt.id === newId);
            if (f) {
              const newTeamMode = f.defaultTeamMode;
              setTeamMode(newTeamMode);
              const tmCfg = getTeamModeConfig(newTeamMode);
              setHandicapAllowance(tmCfg.usgaAllowance === 'tiered' ? -1 : tmCfg.usgaAllowance);
              setScoringMethod(f.scoringType === 'hole-by-hole' ? 'match-play' : 'stroke-play');
              setStrokeMethod(tmCfg.usgaStrokeMethod);
            }
          }}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Holes</label>
          <select
            value={holesPlaying}
            onChange={(e) => setHolesPlaying(e.target.value as '18' | 'front9' | 'back9')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            <option value="18">18</option>
            <option value="front9">Front 9</option>
            <option value="back9">Back 9</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Scoring</label>
          <select
            value={scoringMethod}
            onChange={(e) => setScoringMethod(e.target.value as 'match-play' | 'stroke-play')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            <option value="match-play">Match Play</option>
            <option value="stroke-play">Stroke Play</option>
          </select>
        </div>
      </div>

      {/* Tournament point mode */}
      {scoringMethod === 'stroke-play' && formatId === 'stableford' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tournament Points</label>
          <select
            value={tournamentPointMode}
            onChange={(e) => {
              const mode = e.target.value as 'fixed' | 'margin-based';
              setTournamentPointMode(mode);
              if (mode === 'margin-based') {
                setMarginDivisor(teamMode === 'combined' ? 4 : 2);
                setMarginBaseline(9);
              }
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            <option value="fixed">Fixed (Win/Tie/Loss)</option>
            <option value="margin-based">Margin-Based (every 2 pts = half a hole)</option>
          </select>
        </div>
      )}

      {tournamentPointMode === 'margin-based' && scoringMethod === 'stroke-play' && formatId === 'stableford' ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Baseline (half of total)</label>
            <input
              type="number"
              step="0.5"
              value={marginBaseline}
              onChange={(e) => setMarginBaseline(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Margin per hole (divisor)</label>
            <input
              type="number"
              step="1"
              value={marginDivisor}
              onChange={(e) => setMarginDivisor(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div className="col-span-2">
            <p className="text-[10px] text-gray-400">
              Tie = {marginBaseline}–{marginBaseline}. Each {marginDivisor} pts of margin = 1 tournament pt (each 2 pts = 0.5). Max = {marginBaseline * 2}–0.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Win pts</label>
            <input
              type="number"
              step="0.5"
              value={pointsForWin}
              onChange={(e) => setPointsForWin(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tie pts</label>
            <input
              type="number"
              step="0.5"
              value={pointsForTie}
              onChange={(e) => setPointsForTie(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Loss pts</label>
            <input
              type="number"
              step="0.5"
              value={pointsForLoss}
              onChange={(e) => setPointsForLoss(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
        </div>
      )}

      <div className="pt-2 border-t">
        <p className="text-xs font-medium text-gray-700 mb-2">Team Mode & Handicap</p>
        {(() => {
          const fmt = FORMATS.find((f) => f.id === formatId);
          const tmCfg = getTeamModeConfig(teamMode);
          const usgaAllow = tmCfg.usgaAllowance;
          const usgaStroke = tmCfg.usgaStrokeMethod;
          const isUsga = (usgaAllow === 'tiered' ? handicapAllowance === -1 : handicapAllowance === usgaAllow)
            && strokeMethod === usgaStroke;
          const usgaLabel = usgaAllow === 'tiered'
            ? 'Tiered (2p: 35/15, 3p: 20/15/10, 4p: 20/15/10/5)'
            : `${usgaAllow}%`;
          return (
            <div className={`flex items-center gap-2 text-[10px] rounded px-2 py-1.5 mb-2 ${
              isUsga ? 'bg-green-100 text-green-800' : 'bg-amber-50 text-amber-700'
            }`}>
              <span className="font-bold">USGA:</span>
              <span>{usgaLabel} / {usgaStroke === 'off-the-low' ? 'Off the Low' : 'Full'} for {tmCfg.name}</span>
              {!isUsga && (
                <button
                  onClick={() => {
                    setHandicapAllowance(usgaAllow === 'tiered' ? -1 : usgaAllow);
                    setStrokeMethod(usgaStroke);
                  }}
                  className="ml-auto underline font-medium"
                >
                  Reset
                </button>
              )}
            </div>
          );
        })()}

        {/* Team mode selector */}
        {(() => {
          const fmt = FORMATS.find((f) => f.id === formatId);
          if (!fmt || fmt.allowedTeamModes.length <= 1) return null;
          return (
            <div className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">Team Mode</label>
              <select
                value={teamMode}
                onChange={(e) => {
                  const newMode = e.target.value as TeamMode;
                  setTeamMode(newMode);
                  const tmCfg = getTeamModeConfig(newMode);
                  setHandicapAllowance(tmCfg.usgaAllowance === 'tiered' ? -1 : tmCfg.usgaAllowance);
                  setStrokeMethod(tmCfg.usgaStrokeMethod);
                  const newSettings = { ...formatSettings };
                  tmCfg.settings?.forEach((s) => { newSettings[s.key] = s.defaultValue; });
                  setFormatSettings(newSettings);
                  setMarginDivisor(newMode === 'combined' ? 4 : 2);
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                {fmt.allowedTeamModes.map((m) => {
                  const cfg = getTeamModeConfig(m);
                  return <option key={m} value={m}>{cfg.name}</option>;
                })}
              </select>
            </div>
          );
        })()}

        {/* Team mode settings (e.g. ball selection for two-best-balls) */}
        {(() => {
          const tmCfg = getTeamModeConfig(teamMode);
          if (!tmCfg.settings?.length) return null;
          return tmCfg.settings.map((setting) => (
            <div key={setting.key} className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">{setting.label}</label>
              <select
                value={(formatSettings[setting.key] as string) ?? setting.defaultValue}
                onChange={(e) => setFormatSettings({ ...formatSettings, [setting.key]: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                {setting.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          ));
        })()}

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Allowance</label>
            <select
              value={handicapAllowance}
              onChange={(e) => setHandicapAllowance(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {teamMode === 'scramble' && <option value={-1}>Tiered (USGA)</option>}
              {[100, 95, 90, 85, 80, 75, 50, 25, 0].map((v) => (
                <option key={v} value={v}>{v}%</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Strokes</label>
            <select
              value={strokeMethod}
              onChange={(e) => setStrokeMethod(e.target.value as 'full' | 'off-the-low')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="off-the-low">Off the Low</option>
              <option value="full">Full</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Basis</label>
            <select
              value={handicapBasis}
              onChange={(e) => setHandicapBasis(e.target.value as 'course' | 'index')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="course">Course HCP</option>
              <option value="index">Index</option>
            </select>
          </div>
        </div>
      </div>

      {!showCourseSearch ? (
        <button
          onClick={() => setShowCourseSearch(true)}
          className="text-sm text-green-700 hover:underline"
        >
          {course ? `Course: ${course.courseName}` : '+ Add course'}
        </button>
      ) : (
        <CourseSearchInline
          onSelect={handleCourseSelect}
          onCancel={() => setShowCourseSearch(false)}
        />
      )}

      {course && course.teeSets.length > 0 && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Default Tees</label>
          <select
            value={defaultTeeId || ''}
            onChange={(e) => setDefaultTeeId(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            {course.teeSets.map((ts) => (
              <option key={ts.id} value={ts.id}>{ts.name}{ts.gender === 'F' ? ' (W)' : ''} ({ts.totalYardage} yds)</option>
            ))}
          </select>
        </div>
      )}

      {course && course.teeSets.length > 1 && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Per-Player Tees</label>
          <div className="space-y-1.5">
            {players.map((p) => {
              const override = playerTeeOverrides[p.id];
              const effectiveTee = override || defaultTeeId;
              const isOverridden = override && override !== defaultTeeId;
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <span className={`text-sm w-28 truncate ${isOverridden ? 'font-medium text-green-800' : 'text-gray-600'}`}>
                    {p.name.split(' ')[0]}
                  </span>
                  <select
                    value={effectiveTee || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (val === defaultTeeId) {
                        const next = { ...playerTeeOverrides };
                        delete next[p.id];
                        setPlayerTeeOverrides(next);
                      } else {
                        setPlayerTeeOverrides({ ...playerTeeOverrides, [p.id]: val });
                      }
                    }}
                    className={`flex-1 rounded-md border px-2 py-1 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 ${
                      isOverridden ? 'border-green-400 bg-green-50' : 'border-gray-300'
                    }`}
                  >
                    {course.teeSets.map((ts) => (
                      <option key={ts.id} value={ts.id}>
                        {ts.name}{ts.gender === 'F' ? ' (W)' : ''} ({ts.totalYardage} yds)
                        {ts.id === defaultTeeId ? ' — default' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Split Format (different scoring per nine) */}
      <div className="pt-3 border-t">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-700">Split Format (different scoring per nine)</p>
          <button
            onClick={() => setSplitEnabled(!splitEnabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${splitEnabled ? 'bg-green-600' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${splitEnabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {splitEnabled && (
          <div className="pl-3 border-l-2 border-green-200 space-y-2 mt-2">
            <p className="text-xs text-gray-500">Front 9 uses settings above. Back 9 settings:</p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Format</label>
                <select
                  value={splitFormatId}
                  onChange={(e) => {
                    setSplitFormatId(e.target.value);
                    const fmt = FORMATS.find((f) => f.id === e.target.value);
                    if (fmt) setSplitTeamMode(fmt.defaultTeamMode);
                  }}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  {FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Team Mode</label>
                <select
                  value={splitTeamMode}
                  onChange={(e) => setSplitTeamMode(e.target.value as TeamMode)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  {(FORMATS.find((f) => f.id === splitFormatId)?.allowedTeamModes || []).map((m) => {
                    const cfg = getTeamModeConfig(m);
                    return <option key={m} value={m}>{cfg.name}</option>;
                  })}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Win pts</label>
                <input
                  type="number"
                  value={splitPointsForWin}
                  onChange={(e) => setSplitPointsForWin(Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm"
                  step={0.5}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tie pts</label>
                <input
                  type="number"
                  value={splitPointsForTie}
                  onChange={(e) => setSplitPointsForTie(Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm"
                  step={0.5}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Loss pts</label>
                <input
                  type="number"
                  value={splitPointsForLoss}
                  onChange={(e) => setSplitPointsForLoss(Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm"
                  step={0.5}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Allowance</label>
                <select
                  value={splitAllowance}
                  onChange={(e) => setSplitAllowance(Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm"
                >
                  {[100, 95, 90, 85, 80, 75, 50, 25, 0].map((v) => (
                    <option key={v} value={v}>{v}%</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Strokes</label>
                <select
                  value={splitStrokeMethod}
                  onChange={(e) => setSplitStrokeMethod(e.target.value as 'full' | 'off-the-low')}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm"
                >
                  <option value="off-the-low">Off the Low</option>
                  <option value="full">Full</option>
                </select>
              </div>
            </div>

            {/* Back 9 team mode settings */}
            {(() => {
              const tmCfg = getTeamModeConfig(splitTeamMode);
              if (!tmCfg.settings?.length) return null;
              return tmCfg.settings.map((setting) => (
                <div key={setting.key}>
                  <label className="block text-xs text-gray-500 mb-1">{setting.label}</label>
                  <select
                    value={(splitFormatSettings[setting.key] as string) ?? setting.defaultValue}
                    onChange={(e) => setSplitFormatSettings({ ...splitFormatSettings, [setting.key]: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm"
                  >
                    {setting.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        className="w-full rounded-md bg-green-700 px-4 py-2 text-white text-sm font-medium hover:bg-green-800"
      >
        Save Settings
      </button>
    </div>
  );
}

function MatchupCard({
  matchup, tournament, round, onLaunch, onResume, onRemove, onEdit, onReset,
}: {
  matchup: RoundMatchup;
  tournament: Tournament;
  round: TournamentRound;
  onLaunch: () => void;
  onResume: () => void;
  onRemove: () => void;
  onEdit: () => void;
  onReset: () => void;
}) {
  const [showScorecard, setShowScorecard] = useState(false);
  const [scores, setScores] = useState<GameScore[] | null>(loadGameScores(matchup.id));
  const teamAPlayers = tournament.players.filter((p) => matchup.teamAPlayerIds.includes(p.id));
  const teamBPlayers = tournament.players.filter((p) => matchup.teamBPlayerIds.includes(p.id));

  useEffect(() => {
    if (!scores) {
      fetchGameScores(matchup.id).then((data) => {
        if (data) setScores(data);
      });
    } else {
      const cached = loadGameScores(matchup.id);
      if (cached && cached !== scores) setScores(cached);
    }
  }, [matchup.id, matchup.result]);

  const savedScores = scores;

  const holeNumbers = (() => {
    if (!round.course) return [];
    const tee = round.course.teeSets.find((t) => t.id === round.defaultTeeId) || round.course.teeSets[0];
    if (!tee) return [];
    const allHoles = tee.holes.sort((a, b) => a.number - b.number);
    if (round.holesPlaying === 'front9') return allHoles.filter((h) => h.number <= 9);
    if (round.holesPlaying === 'back9') return allHoles.filter((h) => h.number > 9);
    return allHoles;
  })();

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-gray-700">{matchup.groupLabel}</p>
        {matchup.result ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">Final</span>
        ) : matchup.gameId ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">In Progress</span>
        ) : (
          <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-700">Remove</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          {teamAPlayers.map((p) => (
            <p key={p.id} className="text-sm text-blue-700">{p.name} <span className="text-gray-400 text-xs">({p.handicapIndex ?? '—'})</span></p>
          ))}
        </div>
        <div>
          {teamBPlayers.map((p) => (
            <p key={p.id} className="text-sm text-red-700">{p.name} <span className="text-gray-400 text-xs">({p.handicapIndex ?? '—'})</span></p>
          ))}
        </div>
      </div>

      {/* In-progress status bar with live score */}
      {!matchup.result && matchup.gameId && savedScores && savedScores.length > 0 && (() => {
        const liveResult = recomputeMatchResult(savedScores, matchup, round, tournament);
        const splitStatuses = computeSplitMatchStatuses(savedScores, matchup, round, tournament);
        return (
          <div className="mb-3">
            <div className="py-2 px-3 bg-yellow-50 border border-yellow-200 rounded text-center">
              {splitStatuses ? (
                <div className="space-y-1">
                  {splitStatuses.map((sm, idx) => {
                    if (sm.status.thru === 0) return null;
                    const diff = sm.status.holesWonA - sm.status.holesWonB;
                    const statusText = diff === 0 ? 'AS' : diff > 0 ? `${tournament.teams[0].name} ${diff} UP` : `${tournament.teams[1].name} ${Math.abs(diff)} UP`;
                    return (
                      <p key={idx} className="text-xs text-yellow-800 font-medium">
                        {sm.label}: {statusText} <span className="text-yellow-600">(thru {sm.status.thru})</span>
                      </p>
                    );
                  })}
                </div>
              ) : liveResult ? (
                <p className="text-xs text-yellow-800 font-medium">
                  {liveResult.pointsTeamA} — {liveResult.pointsTeamB} · {liveResult.summary}
                </p>
              ) : (
                <p className="text-xs text-yellow-800 font-medium">
                  Thru {new Set((savedScores as GameScore[]).map((s) => s.hole)).size} holes
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {matchup.result ? (
        <>
          <div className="text-center py-2 bg-gray-50 rounded">
            <p className="text-sm font-bold text-gray-900">{matchup.result.summary}</p>
            <p className="text-xs text-gray-500">{matchup.result.pointsTeamA} — {matchup.result.pointsTeamB}</p>
          </div>
          {savedScores && holeNumbers.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowScorecard(!showScorecard)}
                className="w-full text-xs text-green-700 hover:text-green-900 font-medium"
              >
                {showScorecard ? 'Hide Scorecard ▾' : 'Show Scorecard ▸'}
              </button>
              {showScorecard && (
                <div className="mt-2 overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-2 py-1 text-left text-gray-500 font-medium sticky left-0 bg-gray-100">#</th>
                        {holeNumbers.map((h) => (
                          <th key={h.number} className="px-1 py-1 text-center text-gray-500 font-medium min-w-[22px]">{h.number}</th>
                        ))}
                        <th className="px-2 py-1 text-center text-gray-500 font-medium">Tot</th>
                      </tr>
                      <tr>
                        <td className="px-2 py-0.5 text-left text-gray-400 font-medium sticky left-0 bg-white">Par</td>
                        {holeNumbers.map((h) => (
                          <td key={h.number} className="px-1 py-0.5 text-center text-gray-400">{h.par}</td>
                        ))}
                        <td className="px-2 py-0.5 text-center text-gray-500 font-medium">{holeNumbers.reduce((s, h) => s + h.par, 0)}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-0.5 text-left text-gray-300 font-medium sticky left-0 bg-white">Hcp</td>
                        {holeNumbers.map((h) => (
                          <td key={h.number} className="px-1 py-0.5 text-center text-gray-300">{h.handicap}</td>
                        ))}
                        <td className="px-2 py-0.5"></td>
                      </tr>
                    </thead>
                    <tbody>
                      {[...teamAPlayers, ...teamBPlayers].map((player) => {
                        const isTeamA = matchup.teamAPlayerIds.includes(player.id);
                        const total = holeNumbers.reduce((sum, h) => {
                          const sc = savedScores.find((s) => s.playerId === player.id && s.hole === h.number);
                          return sum + (sc?.grossScore || 0);
                        }, 0);
                        const isStableford = round.formatId === 'stableford';
                        const stablefordTotal = isStableford
                          ? computePlayerStablefordPoints(savedScores, player.id, matchup, round, tournament)
                          : 0;
                        return (
                          <tr key={player.id} className="border-t border-gray-100">
                            <td className={`px-2 py-1 font-medium whitespace-nowrap sticky left-0 bg-white ${isTeamA ? 'text-blue-700' : 'text-red-700'}`}>
                              {player.name.split(' ')[0]}
                            </td>
                            {holeNumbers.map((h) => {
                              const sc = savedScores.find((s) => s.playerId === player.id && s.hole === h.number);
                              const score = sc?.grossScore;
                              const strokes = getPlayerStrokesForHole(player.id, h.handicap, h.number, matchup, round, tournament);
                              const netScore = score ? score - strokes : null;
                              const netToPar = netScore !== null ? netScore - h.par : null;
                              const strokeBg = strokes > 0 ? 'bg-green-50' : '';
                              const colorClass = !score ? 'text-gray-300'
                                : score <= h.par - 2 ? 'text-yellow-600 font-bold'
                                : score === h.par - 1 ? 'text-red-600 font-bold'
                                : score === h.par ? 'text-gray-700'
                                : score === h.par + 1 ? 'text-blue-600'
                                : 'text-blue-800 font-bold';
                              let decoration = '';
                              if (netToPar !== null) {
                                if (netToPar <= -2) decoration = 'ring-2 ring-offset-1 ring-yellow-500 rounded-full';
                                else if (netToPar === -1) decoration = 'ring-1 ring-offset-1 ring-red-500 rounded-full';
                                else if (netToPar === 1) decoration = 'ring-1 ring-offset-1 ring-blue-400 rounded-sm';
                                else if (netToPar >= 2) decoration = 'ring-2 ring-offset-1 ring-blue-500 rounded-sm';
                              }
                              return (
                                <td key={h.number} className={`px-1 py-1 text-center ${colorClass} ${strokeBg}`}>
                                  {score ? (
                                    <span className={`inline-flex items-center justify-center w-5 h-5 text-[11px] ${decoration}`}>{score}</span>
                                  ) : '–'}
                                </td>
                              );
                            })}
                            <td className="px-2 py-1 text-center font-bold text-gray-900">
                              {total || '–'}
                              {total > 0 && isStableford ? (
                                <span className="ml-0.5 text-[9px] text-green-600">{stablefordTotal}pts</span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={onEdit}
              className="text-xs text-gray-400 hover:text-gray-600 font-medium"
            >
              Edit Scores
            </button>
            <button
              onClick={onReset}
              className="text-[10px] text-gray-300 hover:text-red-500 transition-colors"
            >
              Reset
            </button>
          </div>
        </>
      ) : matchup.gameId ? (
        <div className="space-y-1">
          <button
            onClick={onResume}
            className="w-full rounded-md bg-yellow-600 px-4 py-2 text-white text-sm font-medium hover:bg-yellow-700"
          >
            Resume Game
          </button>
          {savedScores && holeNumbers.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowScorecard(!showScorecard)}
                className="w-full text-xs text-green-700 hover:text-green-900 font-medium"
              >
                {showScorecard ? 'Hide Scorecard ▾' : 'Show Scorecard ▸'}
              </button>
              {showScorecard && (
                <div className="mt-2 overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-2 py-1 text-left text-gray-500 font-medium sticky left-0 bg-gray-100">#</th>
                        {holeNumbers.map((h) => (
                          <th key={h.number} className="px-1 py-1 text-center text-gray-500 font-medium min-w-[22px]">{h.number}</th>
                        ))}
                        <th className="px-2 py-1 text-center text-gray-500 font-medium">Tot</th>
                      </tr>
                      <tr>
                        <td className="px-2 py-0.5 text-left text-gray-400 font-medium sticky left-0 bg-white">Par</td>
                        {holeNumbers.map((h) => (
                          <td key={h.number} className="px-1 py-0.5 text-center text-gray-400">{h.par}</td>
                        ))}
                        <td className="px-2 py-0.5 text-center text-gray-500 font-medium">{holeNumbers.reduce((s, h) => s + h.par, 0)}</td>
                      </tr>
                    </thead>
                    <tbody>
                      {[...teamAPlayers, ...teamBPlayers].map((player) => {
                        const isTeamA = matchup.teamAPlayerIds.includes(player.id);
                        const total = holeNumbers.reduce((sum, h) => {
                          const sc = savedScores.find((s) => s.playerId === player.id && s.hole === h.number);
                          return sum + (sc?.grossScore || 0);
                        }, 0);
                        return (
                          <tr key={player.id} className="border-t border-gray-100">
                            <td className={`px-2 py-1 font-medium whitespace-nowrap sticky left-0 bg-white ${isTeamA ? 'text-blue-700' : 'text-red-700'}`}>
                              {player.name.split(' ')[0]}
                            </td>
                            {holeNumbers.map((h) => {
                              const sc = savedScores.find((s) => s.playerId === player.id && s.hole === h.number);
                              const score = sc?.grossScore;
                              const strokes = score ? getPlayerStrokesForHole(player.id, h.handicap, h.number, matchup, round, tournament) : 0;
                              const netScore = score ? score - strokes : null;
                              const netToPar = netScore !== null ? netScore - h.par : null;
                              const strokeBg = strokes > 0 ? 'bg-green-50' : '';
                              const colorClass = !score ? 'text-gray-300'
                                : score <= h.par - 2 ? 'text-yellow-600 font-bold'
                                : score === h.par - 1 ? 'text-red-600 font-bold'
                                : score === h.par ? 'text-gray-700'
                                : score === h.par + 1 ? 'text-blue-600'
                                : 'text-blue-800 font-bold';
                              let decoration = '';
                              if (netToPar !== null) {
                                if (netToPar <= -2) decoration = 'ring-2 ring-offset-1 ring-yellow-500 rounded-full';
                                else if (netToPar === -1) decoration = 'ring-1 ring-offset-1 ring-red-500 rounded-full';
                                else if (netToPar === 1) decoration = 'ring-1 ring-offset-1 ring-blue-400 rounded-sm';
                                else if (netToPar >= 2) decoration = 'ring-2 ring-offset-1 ring-blue-500 rounded-sm';
                              }
                              return (
                                <td key={h.number} className={`px-1 py-1 text-center ${colorClass} ${strokeBg}`}>
                                  {score ? (
                                    <span className={`inline-flex items-center justify-center w-5 h-5 text-[11px] ${decoration}`}>{score}</span>
                                  ) : '–'}
                                </td>
                              );
                            })}
                            <td className="px-2 py-1 text-center font-bold text-gray-900">
                              {total || '–'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <button
            onClick={onReset}
            className="w-full text-[10px] text-gray-300 hover:text-red-500 transition-colors"
          >
            Reset
          </button>
        </div>
      ) : (
        <button
          onClick={onLaunch}
          className="w-full rounded-md bg-green-700 px-4 py-2 text-white text-sm font-medium hover:bg-green-800"
        >
          Start Game
        </button>
      )}
    </div>
  );
}

function SplitPairingSection({
  round, tournament, onUpdate,
}: {
  round: TournamentRound;
  tournament: Tournament;
  onUpdate: (pairings: SplitPairing[]) => void;
}) {
  const pairings = round.splitFormat?.pairings || [];
  const teamA = tournament.teams[0];
  const teamB = tournament.teams[1];

  // Get all players involved in matchups
  const allMatchupPlayerIds = round.matchups.flatMap((m) => m.playerIds);
  const teamAPlayers = tournament.players.filter((p) => teamA.playerIds.includes(p.id) && allMatchupPlayerIds.includes(p.id));
  const teamBPlayers = tournament.players.filter((p) => teamB.playerIds.includes(p.id) && allMatchupPlayerIds.includes(p.id));

  const pairedAIds = new Set(pairings.map((p) => p.playerIds[0]));
  const pairedBIds = new Set(pairings.map((p) => p.playerIds[1]));
  const unpairedA = teamAPlayers.filter((p) => !pairedAIds.has(p.id));
  const unpairedB = teamBPlayers.filter((p) => !pairedBIds.has(p.id));

  function addPairing(aId: string, bId: string) {
    onUpdate([...pairings, { playerIds: [aId, bId] }]);
  }

  function removePairing(idx: number) {
    onUpdate(pairings.filter((_, i) => i !== idx));
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 mt-4">
      <h3 className="font-medium text-gray-900 mb-2">Back 9 — 1v1 Pairings</h3>
      <p className="text-xs text-gray-500 mb-3">Assign which {teamA.name} player faces which {teamB.name} player for individual match play on the back nine.</p>

      {pairings.length > 0 && (
        <div className="space-y-2 mb-3">
          {pairings.map((pairing, idx) => {
            const playerA = tournament.players.find((p) => p.id === pairing.playerIds[0]);
            const playerB = tournament.players.find((p) => p.id === pairing.playerIds[1]);
            return (
              <div key={idx} className="flex items-center justify-between p-2 rounded bg-gray-50 border border-gray-200">
                <div className="text-sm">
                  <span className="font-medium text-blue-700">{playerA?.name || '?'}</span>
                  <span className="mx-2 text-gray-400">vs</span>
                  <span className="font-medium text-red-700">{playerB?.name || '?'}</span>
                </div>
                <button onClick={() => removePairing(idx)} className="text-red-400 hover:text-red-600 text-sm">&times;</button>
              </div>
            );
          })}
        </div>
      )}

      {unpairedA.length > 0 && unpairedB.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-blue-700 mb-1">{teamA.name}</p>
            {unpairedA.map((p) => (
              <div key={p.id} className="mb-1">
                {unpairedB.map((b) => (
                  <button
                    key={`${p.id}-${b.id}`}
                    onClick={() => addPairing(p.id, b.id)}
                    className="w-full text-left px-3 py-1.5 rounded text-xs bg-gray-100 hover:bg-green-100 text-gray-700 mb-0.5"
                  >
                    {p.name.split(' ')[0]} vs {b.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {unpairedA.length === 0 && unpairedB.length === 0 && pairings.length > 0 && (
        <p className="text-xs text-green-700 font-medium">All players paired</p>
      )}
    </div>
  );
}

function BonusResultsSection({ round, tournament }: { round: TournamentRound; tournament: Tournament }) {
  const bonusesWithResults = round.bonuses.filter((b) => b.result);
  if (bonusesWithResults.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow p-4 mt-4">
      <h3 className="font-medium text-gray-900 mb-3">Bonus Results</h3>
      <div className="space-y-2">
        {bonusesWithResults.map((bonus) => {
          const isPerMatchup = bonus.scope === 'per-matchup' && (bonus.result!.teamAWins != null || bonus.result!.teamBWins != null);
          const winnerTeam = bonus.result?.winningTeamId
            ? tournament.teams.find((t) => t.id === bonus.result!.winningTeamId)
            : null;
          const teamColor = winnerTeam?.id === tournament.teams[0].id ? 'text-blue-700' : 'text-red-700';

          if (isPerMatchup) {
            const aWins = bonus.result!.teamAWins || 0;
            const bWins = bonus.result!.teamBWins || 0;
            const ties = bonus.result!.ties || 0;
            const aPts = aWins * bonus.points + ties * bonus.points * 0.5;
            const bPts = bWins * bonus.points + ties * bonus.points * 0.5;
            const leader = aPts > bPts ? tournament.teams[0] : bPts > aPts ? tournament.teams[1] : null;
            const leaderColor = leader?.id === tournament.teams[0].id ? 'text-blue-700' : 'text-red-700';

            return (
              <div key={bonus.id} className="flex items-center justify-between p-2 rounded bg-gray-50 border border-gray-200">
                <div>
                  <p className="text-sm font-medium text-gray-900">{bonus.name}</p>
                  {bonus.result?.detail && (
                    <p className="text-xs text-gray-500 mt-0.5">{bonus.result.detail}</p>
                  )}
                </div>
                <div className="text-right">
                  {leader ? (
                    <p className={`text-sm font-bold ${leaderColor}`}>{leader.name}</p>
                  ) : (
                    <p className="text-sm text-gray-500">Split</p>
                  )}
                  <p className="text-xs text-gray-400">{aPts}–{bPts} pts</p>
                </div>
              </div>
            );
          }

          return (
            <div key={bonus.id} className="flex items-center justify-between p-2 rounded bg-gray-50 border border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-900">{bonus.name}</p>
                {bonus.result?.detail && (
                  <p className="text-xs text-gray-500 mt-0.5">{bonus.result.detail}</p>
                )}
              </div>
              <div className="text-right">
                {winnerTeam ? (
                  <p className={`text-sm font-bold ${teamColor}`}>{winnerTeam.name}</p>
                ) : (
                  <p className="text-sm text-gray-500">Tied</p>
                )}
                <p className="text-xs text-gray-400">{bonus.points} pt{bonus.points !== 1 ? 's' : ''}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BONUS_PRESETS: { type: BonusType; name: string; points: number; scope: 'per-matchup' | 'per-tournament-round' }[] = [
  { type: 'match-winner', name: 'Match Winner', points: 1, scope: 'per-matchup' },
  { type: 'best-individual-stableford', name: 'Best Individual Stableford', points: 1, scope: 'per-matchup' },
  { type: 'best-individual-net', name: 'Best Individual Net', points: 1, scope: 'per-tournament-round' },
  { type: 'junk', name: 'Junk (Birdies/Eagles/Group Hugs)', points: 1, scope: 'per-tournament-round' },
];

const NASSAU_PRESETS: { type: BonusType; name: string; points: number; scope: 'per-matchup' | 'per-tournament-round' }[] = [
  { type: 'nassau-front', name: 'Nassau - Front 9', points: 2, scope: 'per-tournament-round' },
  { type: 'nassau-back', name: 'Nassau - Back 9', points: 2, scope: 'per-tournament-round' },
  { type: 'nassau-overall', name: 'Nassau - Overall', points: 1, scope: 'per-tournament-round' },
  { type: 'junk', name: 'Junk', points: 1, scope: 'per-tournament-round' },
];

function BonusConfigSection({ round, onUpdate }: { round: TournamentRound; onUpdate: (bonuses: RoundBonus[]) => void }) {
  const bonuses = round.bonuses || [];
  const [showAdd, setShowAdd] = useState(false);

  function addBonus(preset: typeof BONUS_PRESETS[number]) {
    const newBonus: RoundBonus = {
      id: crypto.randomUUID(),
      type: preset.type,
      name: preset.name,
      points: preset.points,
      scope: preset.scope,
    };
    onUpdate([...bonuses, newBonus]);
    setShowAdd(false);
  }

  function addCustomBonus() {
    const newBonus: RoundBonus = {
      id: crypto.randomUUID(),
      type: 'custom',
      name: 'Custom Bonus',
      points: 1,
      scope: 'per-matchup',
    };
    onUpdate([...bonuses, newBonus]);
    setShowAdd(false);
  }

  function removeBonus(id: string) {
    onUpdate(bonuses.filter((b) => b.id !== id));
  }

  function updateBonus(id: string, updates: Partial<RoundBonus>) {
    onUpdate(bonuses.map((b) => b.id === id ? { ...b, ...updates } : b));
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">Bonuses ({bonuses.length})</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-sm bg-green-700 text-white px-3 py-1.5 rounded-md hover:bg-green-800"
        >
          {showAdd ? 'Cancel' : 'Add Bonus'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 space-y-2">
          <button
            onClick={() => {
              const newBonuses = NASSAU_PRESETS.map((preset) => ({
                id: crypto.randomUUID(),
                type: preset.type,
                name: preset.name,
                points: preset.points,
                scope: preset.scope,
              }));
              onUpdate([...bonuses, ...newBonuses]);
              setShowAdd(false);
            }}
            className="w-full text-left p-3 rounded border-2 border-amber-200 bg-amber-50 hover:border-amber-400 hover:bg-amber-100 transition"
          >
            <p className="text-sm font-bold text-amber-900">Nassau Package</p>
            <p className="text-xs text-amber-700">Front 9 + Back 9 + Overall + Junk — aggregate team scoring across all groups</p>
          </button>
          <div className="border-t border-gray-200 pt-2">
            <p className="text-[10px] text-gray-400 uppercase font-medium mb-1.5">Individual bonuses</p>
          </div>
          {BONUS_PRESETS.map((preset) => (
            <button
              key={preset.type}
              onClick={() => addBonus(preset)}
              className="w-full text-left p-2 rounded border border-gray-200 hover:border-green-500 hover:bg-green-50 transition"
            >
              <p className="text-sm font-medium text-gray-900">{preset.name}</p>
              <p className="text-xs text-gray-500">{preset.points} pt · {preset.scope === 'per-matchup' ? 'Per matchup' : 'Across round'}</p>
            </button>
          ))}
          <button
            onClick={addCustomBonus}
            className="w-full text-left p-2 rounded border border-dashed border-gray-300 hover:border-green-500 transition"
          >
            <p className="text-sm font-medium text-gray-600">Custom Bonus...</p>
          </button>
        </div>
      )}

      {bonuses.length > 0 && (
        <div className="space-y-2">
          {bonuses.map((bonus) => (
            <div key={bonus.id} className="flex items-center gap-2 p-2 rounded bg-gray-50 border border-gray-200">
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={bonus.name}
                  onChange={(e) => updateBonus(bonus.id, { name: e.target.value })}
                  className="text-sm font-medium text-gray-900 bg-transparent border-none p-0 w-full focus:outline-none focus:ring-0"
                />
                <div className="flex items-center gap-2 mt-1">
                  <select
                    value={bonus.scope}
                    onChange={(e) => updateBonus(bonus.id, { scope: e.target.value as 'per-matchup' | 'per-tournament-round' })}
                    className="text-xs border border-gray-200 rounded px-1.5 py-0.5"
                  >
                    <option value="per-matchup">Per matchup</option>
                    <option value="per-tournament-round">Across round</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={bonus.points}
                  onChange={(e) => updateBonus(bonus.id, { points: Number(e.target.value) })}
                  className="w-12 text-center text-sm border border-gray-200 rounded px-1 py-0.5"
                  step={0.5}
                  min={0}
                />
                <span className="text-xs text-gray-500">pts</span>
              </div>
              <button
                onClick={() => removeBonus(bonus.id)}
                className="text-red-400 hover:text-red-600 text-sm"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {bonuses.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400 text-center py-2">No bonuses configured</p>
      )}
    </div>
  );
}

function getToken() {
  return sessionStorage.getItem('ghin_token');
}

function CourseSearchInline({ onSelect, onCancel }: { onSelect: (c: import('@/lib/game-state').CourseSelection) => void; onCancel: () => void }) {
  const [searchName, setSearchName] = useState('');
  const [searchState, setSearchState] = useState('VA');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [noToken, setNoToken] = useState(false);
  const [ghinUser, setGhinUser] = useState('');
  const [ghinPass, setGhinPass] = useState('');
  const [authError, setAuthError] = useState('');

  async function quickAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/ghin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ghinUser, password: ghinPass }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'Login failed');
        return;
      }
      sessionStorage.setItem('ghin_token', data.token);
      setNoToken(false);
    } catch {
      setAuthError('Connection error');
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) { setNoToken(true); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/ghin/courses/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: searchName, state: searchState }),
      });
      const data = await res.json();
      if (res.ok) setResults(data.courses || []);
    } finally {
      setLoading(false);
    }
  }

  async function selectCourse(courseResult: any) {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ghin/courses/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, course_id: courseResult.CourseID }),
      });
      const data = await res.json();
      if (!res.ok) return;
      const courseData = data.course;
      const allTeeSets: import('@/lib/game-state').TeeSetOption[] = (courseData.TeeSets || []).map((ts: any) => ({
        id: ts.TeeSetRatingId,
        name: ts.TeeSetRatingName,
        gender: ts.Gender === 'Female' ? 'F' as const : 'M' as const,
        totalYardage: ts.TotalYardage,
        totalPar: ts.TotalPar,
        ratings: (ts.Ratings || []).map((r: any) => ({
          type: r.RatingType,
          courseRating: r.CourseRating,
          slopeRating: r.SlopeRating,
        })),
        holes: (ts.Holes || []).map((h: any) => ({
          number: h.Number,
          par: h.Par,
          yardage: h.Length,
          handicap: h.Allocation,
        })),
      }));
      // Default to men's tees; keep women's available for per-player selection
      const teeSets = allTeeSets.filter((t) => t.gender === 'M');
      const womensTeeSets = allTeeSets.filter((t) => t.gender === 'F');
      const finalTeeSets = teeSets.length > 0 ? [...teeSets, ...womensTeeSets.map((t) => ({ ...t, name: `${t.name} (W)` }))] : allTeeSets;
      onSelect({
        courseId: courseResult.CourseID,
        courseName: courseResult.CourseName || courseData.CourseName,
        city: courseResult.City || courseData.CourseCity || '',
        state: courseResult.State || courseData.CourseState || '',
        teeSets: finalTeeSets,
        selectedTeeId: finalTeeSets[0]?.id || null,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-700">Search Course</p>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
      {noToken && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2 space-y-2">
          <p className="text-xs text-amber-800 font-medium">GHIN session expired — log in to search courses</p>
          <form onSubmit={quickAuth} className="flex gap-2">
            <input
              type="text"
              value={ghinUser}
              onChange={(e) => setGhinUser(e.target.value)}
              placeholder="GHIN email"
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
            />
            <input
              type="password"
              value={ghinPass}
              onChange={(e) => setGhinPass(e.target.value)}
              placeholder="Password"
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
            />
            <button type="submit" className="rounded bg-amber-600 px-2 py-1 text-xs text-white font-medium hover:bg-amber-700">
              Login
            </button>
          </form>
          {authError && <p className="text-xs text-red-600">{authError}</p>}
        </div>
      )}
      <form onSubmit={search} className="flex gap-2">
        <input
          type="text"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          placeholder="Course name"
          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <input
          type="text"
          value={searchState}
          onChange={(e) => setSearchState(e.target.value.toUpperCase())}
          placeholder="ST"
          maxLength={2}
          className="w-12 rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <button type="submit" disabled={loading} className="rounded-md bg-green-700 px-2 py-1.5 text-xs text-white font-medium hover:bg-green-800 disabled:opacity-50">
          {loading ? '...' : 'Go'}
        </button>
      </form>
      {results.length > 0 && (
        <ul className="max-h-32 overflow-y-auto divide-y divide-gray-100 text-sm">
          {results.slice(0, 5).map((c: any) => (
            <li key={c.CourseID}>
              <button onClick={() => selectCourse(c)} disabled={loading} className="w-full text-left px-2 py-1.5 hover:bg-gray-50">
                <span className="font-medium">{c.CourseName}</span>
                <span className="text-xs text-gray-500 ml-1">{c.City}, {c.State}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
