'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { Tournament, SideGame } from '@/lib/tournament-state';
import type { GameScore, Player } from '@/lib/game-state';
import { loadTournament, loadGameScores, fetchTournament, fetchGameScores, subscribeToTournament, subscribeToScores, saveTournament, saveGameScores } from '@/lib/tournament-state';
import { computeSideGameResult, computeSideGamePlayerDetails } from '@/lib/side-game';
import type { SideGameResult, SideGameTeamDetail, SideGameHoleResult } from '@/lib/side-game';

export default function SideGamesPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [result, setResult] = useState<SideGameResult | null>(null);
  const [teamDetails, setTeamDetails] = useState<SideGameTeamDetail[]>([]);
  const [showSetup, setShowSetup] = useState(false);
  const [editing, setEditing] = useState(false);

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

  // Fetch and subscribe to scores for all relevant matchups
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
      setResult(computeSideGameResult(sideGame!, allScores));
      setTeamDetails(computeSideGamePlayerDetails(sideGame!, allScores));
    }

    Promise.all(ids.map((mid) => fetchGameScores(mid))).then(recompute);

    const channels = ids.map((mid) =>
      subscribeToScores(mid, () => recompute())
    );
    return () => { channels.forEach((ch) => ch.unsubscribe()); };
  }, [sideGame?.id]);

  if (!tournament) return null;

  if (!sideGame) {
    return (
      <div className="min-h-full bg-gray-50">
        <Header tournament={tournament} router={router} />
        <main className="max-w-3xl mx-auto px-4 py-6">
          {showSetup ? (
            <SetupForm tournament={tournament} onCreated={(t) => { setTournament(t); setShowSetup(false); }} />
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No side games configured yet.</p>
              <button
                onClick={() => setShowSetup(true)}
                className="bg-green-700 hover:bg-green-600 text-white font-medium px-4 py-2 rounded-lg text-sm"
              >
                Create Side Game
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50">
      <Header tournament={tournament} router={router} />
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {result && result.thruHole > 0 ? (
          <>
            <div className="flex justify-end">
              <button
                onClick={() => router.push(`/tournament/${tournament.id}/side-games/scoreboard`)}
                className="text-sm text-green-700 hover:text-green-900 font-medium"
              >
                Live Scoreboard →
              </button>
            </div>
            <Leaderboard result={result} sideGame={sideGame} />
            <PayoutSummary payouts={result.payouts} entry={sideGame.nassauConfig.entryPerTeam} sideGame={sideGame} />
            <NassauBreakdown result={result} sideGame={sideGame} teamDetails={teamDetails} />
          </>
        ) : (
          <div className="text-center py-8 text-gray-500 text-sm">
            No scores yet. Scores will appear as Round 3 matchups are played.
          </div>
        )}

        <ScoreEntryButton sideGame={sideGame} tournament={tournament} router={router} />

        {editing && (
          <SideGameEditor
            sideGame={sideGame}
            tournament={tournament}
            onSave={(updated) => { saveTournament(updated); setTournament(updated); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        )}

        {/* Admin actions */}
        <div className="flex gap-2 pt-4 border-t">
          <button
            onClick={() => setEditing(!editing)}
            className="text-xs text-green-700 hover:text-green-900 font-medium"
          >
            {editing ? 'Cancel Edit' : 'Edit Settings'}
          </button>
          <button
            onClick={() => {
              if (!confirm('Reset all scores for the outside pair?')) return;
              saveGameScores(sideGame.ownMatchupId, []);
              window.location.reload();
            }}
            className="text-xs text-gray-400 hover:text-red-600"
          >
            Reset Outside Scores
          </button>
          <button
            onClick={() => {
              if (!confirm('Delete this side game entirely?')) return;
              const updated = { ...tournament, sideGames: [] };
              saveTournament(updated);
              setTournament(updated);
            }}
            className="text-xs text-gray-400 hover:text-red-600"
          >
            Delete Side Game
          </button>
        </div>
      </main>
    </div>
  );
}

function Header({ tournament, router }: { tournament: Tournament; router: any }) {
  return (
    <header className="bg-green-800 text-white shadow">
      <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Side Games</h1>
          <p className="text-xs text-green-200">{tournament.name}</p>
        </div>
        <button onClick={() => router.push(`/tournament/${tournament.id}`)} className="text-sm text-green-200 hover:text-white">
          Back
        </button>
      </div>
    </header>
  );
}

function Leaderboard({ result, sideGame }: { result: SideGameResult; sideGame: SideGame }) {
  const overallLeg = result.nassauLegs.find((l) => l.leg === 'overall');
  if (!overallLeg) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Flight Leaderboard</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">#</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Team</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Front</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Back</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 bg-gray-100">Total</th>
            </tr>
          </thead>
          <tbody>
            {overallLeg.rankings.map((r) => (
              <tr key={r.teamId} className="border-b last:border-0">
                <td className="px-3 py-2 text-gray-500">{r.place}</td>
                <td className="px-3 py-2 font-medium text-gray-900">{r.teamName}</td>
                <td className="text-right px-3 py-2 text-gray-700">
                  {result.nassauLegs[0].rankings.find((x) => x.teamId === r.teamId)?.points ?? 0}
                </td>
                <td className="text-right px-3 py-2 text-gray-700">
                  {result.nassauLegs[1].rankings.find((x) => x.teamId === r.teamId)?.points ?? 0}
                </td>
                <td className="text-right px-3 py-2 font-bold bg-gray-50">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 text-xs text-gray-400 border-t">
          Thru hole {result.thruHole} · {sideGame.teams.length} teams · {sideGame.teams.length - 1} pts available/hole
        </div>
      </div>
    </section>
  );
}


function PayoutSummary({ payouts, entry, sideGame }: { payouts: SideGameResult['payouts']; entry: number; sideGame: SideGame }) {
  // Compute per-person amounts
  const personPayouts: { id: string; name: string; amount: number }[] = [];
  for (const p of payouts) {
    const team = sideGame.teams.find((t) => t.id === p.teamId);
    if (!team) continue;
    const playerCount = team.playerIds.length || 1;
    const perPerson = p.total / playerCount;
    for (const pid of team.playerIds) {
      const player = sideGame.players.find((pl) => pl.id === pid);
      personPayouts.push({ id: pid, name: player?.name || 'Unknown', amount: perPerson });
    }
  }
  personPayouts.sort((a, b) => b.amount - a.amount);

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Payouts</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Team</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Front</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Back</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Overall</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 bg-gray-100">Net</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.teamId} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium text-gray-900">{p.teamName}</td>
                <td className={`text-right px-3 py-2 ${p.front > 0 ? 'text-green-700' : p.front < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {formatPayout(p.front)}
                </td>
                <td className={`text-right px-3 py-2 ${p.back > 0 ? 'text-green-700' : p.back < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {formatPayout(p.back)}
                </td>
                <td className={`text-right px-3 py-2 ${p.overall > 0 ? 'text-green-700' : p.overall < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {formatPayout(p.overall)}
                </td>
                <td className={`text-right px-3 py-2 font-bold bg-gray-50 ${p.total > 0 ? 'text-green-700' : p.total < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {formatPayout(p.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 text-xs text-gray-400 border-t">
          ${entry}/team/leg · 1st wins pot · 2nd gets money back · 3rd+ pay
        </div>
      </div>

      {/* Per-person breakdown */}
      <div className="bg-white rounded-lg shadow overflow-hidden mt-3">
        <div className="px-3 py-2 bg-gray-50 border-b">
          <h3 className="text-sm font-medium text-gray-700">Per Person</h3>
        </div>
        <div className="divide-y">
          {personPayouts.map((p) => (
            <div key={p.id} className="px-3 py-2 flex items-center justify-between">
              <span className="text-sm text-gray-900">{p.name}</span>
              <span className={`text-sm font-bold ${p.amount > 0 ? 'text-green-700' : p.amount < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {formatPayout(p.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NassauBreakdown({ result, sideGame, teamDetails }: { result: SideGameResult; sideGame: SideGame; teamDetails: SideGameTeamDetail[] }) {
  const [expandedLeg, setExpandedLeg] = useState<string | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const legs: { key: 'front' | 'back' | 'overall'; label: string; holes: SideGameHoleResult[] }[] = [
    { key: 'front', label: 'Front 9', holes: result.holes.filter((h) => h.holeNumber <= 9) },
    { key: 'back', label: 'Back 9', holes: result.holes.filter((h) => h.holeNumber > 9) },
    { key: 'overall', label: 'Overall (18)', holes: result.holes },
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Nassau Breakdown</h2>
      <div className="space-y-2">
        {legs.map(({ key, label, holes }) => {
          const leg = result.nassauLegs.find((l) => l.leg === key);
          if (!leg) return null;
          const leader = leg.rankings[0];
          const isClose = leg.rankings.length > 1 && leader.points === leg.rankings[1].points;
          const isExpanded = expandedLeg === key;

          return (
            <div key={key} className="bg-white rounded-lg shadow overflow-hidden">
              <button
                onClick={() => { setExpandedLeg(isExpanded ? null : key); setExpandedTeam(null); }}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">{label}</span>
                  <span className={`text-sm ${isClose ? 'text-gray-500' : 'text-green-700 font-medium'}`}>
                    {isClose ? 'Tied' : `${leader.teamName} leads (${leader.points} pts)`}
                  </span>
                </div>
                <span className="text-gray-400 text-sm">{isExpanded ? '▾' : '▸'}</span>
              </button>

              {isExpanded && (
                <div className="border-t">
                  {/* Team rankings with expandable scorecards */}
                  {leg.rankings.map((r) => {
                    const isTeamExpanded = expandedTeam === `${key}-${r.teamId}`;
                    const teamDetail = teamDetails.find((td) => td.teamId === r.teamId);
                    const teamHoleData = holes;

                    return (
                      <div key={r.teamId} className="border-b last:border-0">
                        <button
                          onClick={() => setExpandedTeam(isTeamExpanded ? null : `${key}-${r.teamId}`)}
                          className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500 w-4">{r.place}.</span>
                            <span className="text-sm font-medium text-gray-900">{r.teamName}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-gray-700">{r.points} pts</span>
                            <span className={`text-xs font-medium ${r.payout > 0 ? 'text-green-700' : r.payout < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                              {formatPayout(r.payout)}
                            </span>
                            <span className="text-gray-400 text-xs">{isTeamExpanded ? '▾' : '▸'}</span>
                          </div>
                        </button>

                        {isTeamExpanded && (
                          <div className="px-4 pb-3 pt-1">
                            {/* Team best net per hole */}
                            <div className="overflow-x-auto mb-2">
                              <table className="text-xs w-full">
                                <thead>
                                  <tr className="text-gray-500">
                                    <th className="text-left px-1 py-1 font-medium">Hole</th>
                                    {teamHoleData.map((h) => (
                                      <th key={h.holeNumber} className="text-center px-1 py-1 font-medium min-w-[24px]">{h.holeNumber}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td className="px-1 py-1 font-medium text-gray-700">Net</td>
                                    {teamHoleData.map((h) => {
                                      const net = h.teamBestNets[r.teamId];
                                      const pts = h.teamPoints[r.teamId] ?? 0;
                                      const maxPts = Math.max(...sideGame.teams.map((t) => h.teamPoints[t.id] ?? 0));
                                      const isWinner = pts > 0 && pts === maxPts;
                                      return (
                                        <td key={h.holeNumber} className={`text-center px-1 py-1 ${isWinner ? 'font-bold text-green-700' : 'text-gray-700'}`}>
                                          {net ?? '-'}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                  <tr>
                                    <td className="px-1 py-1 font-medium text-gray-500">Pts</td>
                                    {teamHoleData.map((h) => {
                                      const pts = h.teamPoints[r.teamId] ?? 0;
                                      return (
                                        <td key={h.holeNumber} className={`text-center px-1 py-1 ${pts > 0 ? 'text-green-600 font-medium' : 'text-gray-300'}`}>
                                          {pts > 0 ? (pts % 1 === 0 ? pts : pts.toFixed(1)) : '-'}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            {/* Individual player scores */}
                            {teamDetail && (
                              <div className="overflow-x-auto border-t pt-2">
                                <table className="text-xs w-full">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <th className="text-left px-1 py-1 font-medium min-w-[60px]">Player</th>
                                      {teamHoleData.map((h) => (
                                        <th key={h.holeNumber} className="text-center px-1 py-1 font-medium min-w-[24px]">{h.holeNumber}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {teamDetail.players.map((player) => {
                                      const playerHoles = key === 'front' ? player.holes.filter((h) => h.holeNumber <= 9)
                                        : key === 'back' ? player.holes.filter((h) => h.holeNumber > 9)
                                        : player.holes;
                                      return (
                                        <tr key={player.playerId}>
                                          <td className="px-1 py-1 text-gray-800 font-medium whitespace-nowrap">
                                            {player.playerName.split(' ')[0]}
                                            <span className="text-[10px] text-gray-400 ml-0.5">({Math.round(player.playingHcap)})</span>
                                          </td>
                                          {playerHoles.map((h) => (
                                            <td key={h.holeNumber} className={`text-center px-1 py-1 ${h.isBestNet ? 'font-bold text-green-700' : 'text-gray-700'}`}>
                                              {h.gross != null ? (
                                                <span>
                                                  {h.gross}
                                                  {h.strokes > 0 && <span className="text-[8px] text-blue-500 align-super">{'•'.repeat(h.strokes)}</span>}
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
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}


function ScoreEntryButton({ sideGame, tournament, router }: { sideGame: SideGame; tournament: Tournament; router: any }) {
  const outsideTeam = sideGame.teams.find((t) => !t.linkedMatchupId);
  if (!outsideTeam) return null;

  const outsidePlayers = sideGame.players.filter((p) => outsideTeam.playerIds.includes(p.id));

  function launchScoring() {
    const setup = {
      formatId: 'match-play',
      teamMode: 'individual',
      course: sideGame.course,
      players: outsidePlayers,
      handicapAllowance: sideGame.handicapAllowance,
      holesPlaying: '18' as const,
      strokeMethod: sideGame.strokeMethod,
      handicapBasis: 'course' as const,
      formatSettings: {},
      matchupId: sideGame.ownMatchupId,
    };

    sessionStorage.setItem('game_setup', JSON.stringify(setup));
    sessionStorage.setItem('game_tournament_context', JSON.stringify({
      tournamentId: tournament.id,
      roundId: sideGame.linkedRoundId,
      matchupId: sideGame.ownMatchupId,
      sideGameMode: true,
    }));
    router.push('/game/play');
  }

  return (
    <section className="pt-2">
      <button
        onClick={launchScoring}
        className="w-full bg-green-700 hover:bg-green-600 text-white font-medium py-3 rounded-lg text-sm"
      >
        Enter Scores — {outsidePlayers.map((p) => p.name.split(' ')[0]).join(' & ')}
      </button>
    </section>
  );
}


// --- Setup Form ---

function SetupForm({ tournament, onCreated }: { tournament: Tournament; onCreated: (t: Tournament) => void }) {
  const [name, setName] = useState('Day 3 Flight');
  const [entry, setEntry] = useState('10');
  const [allowance, setAllowance] = useState('90');
  const [selectedRoundId, setSelectedRoundId] = useState(tournament.rounds[tournament.rounds.length - 1]?.id || '');
  const [outsidePlayers, setOutsidePlayers] = useState<{ name: string; handicap: string; teeId: string }[]>([
    { name: '', handicap: '', teeId: '' },
    { name: '', handicap: '', teeId: '' },
  ]);
  const [outsideTeamName, setOutsideTeamName] = useState('');
  const [payoutSplit, setPayoutSplit] = useState('80, 20');
  const [playerTees, setPlayerTees] = useState<Record<string, number | undefined>>({});

  const round = tournament.rounds.find((r) => r.id === selectedRoundId);
  const teeSets = round?.course?.teeSets || [];
  const defaultTeeId = round?.defaultTeeId || teeSets[0]?.id;

  function create() {
    if (!round) return;

    const sideGameId = crypto.randomUUID();
    const ownMatchupId = `side-${sideGameId.slice(0, 8)}`;

    // Build teams from the round's matchups
    const teams: SideGame['teams'] = [];
    const allPlayers: Player[] = [];

    for (const matchup of round.matchups) {
      // Team A side of matchup
      const teamAPlayers = tournament.players.filter((p) => matchup.teamAPlayerIds.includes(p.id));
      if (teamAPlayers.length > 0) {
        teams.push({
          id: `${matchup.id}-a`,
          name: teamAPlayers.map((p) => p.name.split(' ')[0]).join('/'),
          playerIds: matchup.teamAPlayerIds,
          linkedMatchupId: matchup.id,
        });
        allPlayers.push(...teamAPlayers.map((p) => ({
          ...p,
          teeSetId: playerTees[p.id] ?? p.teeSetId,
        })));
      }

      // Team B side of matchup
      const teamBPlayers = tournament.players.filter((p) => matchup.teamBPlayerIds.includes(p.id));
      if (teamBPlayers.length > 0) {
        teams.push({
          id: `${matchup.id}-b`,
          name: teamBPlayers.map((p) => p.name.split(' ')[0]).join('/'),
          playerIds: matchup.teamBPlayerIds,
          linkedMatchupId: matchup.id,
        });
        allPlayers.push(...teamBPlayers.map((p) => ({
          ...p,
          teeSetId: playerTees[p.id] ?? p.teeSetId,
        })));
      }
    }

    // Outside pair
    const outsidePlayerObjs: Player[] = outsidePlayers
      .filter((p) => p.name.trim())
      .map((p) => ({
        id: crypto.randomUUID(),
        name: p.name.trim(),
        handicapIndex: parseFloat(p.handicap) || null,
        teeSetId: p.teeId ? Number(p.teeId) : undefined,
      }));

    if (outsidePlayerObjs.length > 0) {
      teams.push({
        id: `outside-${sideGameId.slice(0, 8)}`,
        name: outsideTeamName.trim() || outsidePlayerObjs.map((p) => p.name.split(' ')[0]).join('/'),
        playerIds: outsidePlayerObjs.map((p) => p.id),
        linkedMatchupId: null,
      });
      allPlayers.push(...outsidePlayerObjs);
    }

    const parsedSplit = payoutSplit.split(',').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
    const sideGame: SideGame = {
      id: sideGameId,
      name,
      linkedRoundId: round.id,
      course: round.course,
      teams,
      players: allPlayers,
      ownMatchupId,
      nassauConfig: { entryPerTeam: parseFloat(entry) || 10, payoutSplit: parsedSplit.length > 0 ? parsedSplit : undefined },
      handicapAllowance: parseFloat(allowance) || 100,
      strokeMethod: 'full',
      status: 'active',
    };

    const updated = { ...tournament, sideGames: [...(tournament.sideGames || []), sideGame] };
    saveTournament(updated);
    onCreated(updated);
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Create Side Game</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Game Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Linked Round</label>
        <select value={selectedRoundId} onChange={(e) => setSelectedRoundId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
          {tournament.rounds.map((r) => (
            <option key={r.id} value={r.id}>{r.dayLabel || r.name}</option>
          ))}
        </select>
      </div>

      {round && (
        <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
          <p className="font-medium mb-1">Teams from round:</p>
          {round.matchups.map((m) => {
            const teamA = tournament.players.filter((p) => m.teamAPlayerIds.includes(p.id));
            const teamB = tournament.players.filter((p) => m.teamBPlayerIds.includes(p.id));
            return (
              <div key={m.id} className="text-xs text-gray-500">
                {teamA.map((p) => p.name.split(' ')[0]).join('/')} · {teamB.map((p) => p.name.split(' ')[0]).join('/')}
              </div>
            );
          })}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Outside Players (additional twosome)</label>
        {outsidePlayers.map((p, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              placeholder="Name"
              value={p.name}
              onChange={(e) => { const arr = [...outsidePlayers]; arr[i] = { ...arr[i], name: e.target.value }; setOutsidePlayers(arr); }}
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Hcp"
              value={p.handicap}
              onChange={(e) => { const arr = [...outsidePlayers]; arr[i] = { ...arr[i], handicap: e.target.value }; setOutsidePlayers(arr); }}
              className="w-16 border rounded-lg px-3 py-2 text-sm"
            />
            {teeSets.length > 0 && (
              <select
                value={p.teeId || ''}
                onChange={(e) => { const arr = [...outsidePlayers]; arr[i] = { ...arr[i], teeId: e.target.value }; setOutsidePlayers(arr); }}
                className="w-24 border rounded-lg px-2 py-2 text-sm"
              >
                <option value="">Default</option>
                {teeSets.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
        ))}
        <input
          placeholder="Team name (optional)"
          value={outsideTeamName}
          onChange={(e) => setOutsideTeamName(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {round && teeSets.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tee Assignments (tournament players)</label>
          <p className="text-xs text-gray-400 mb-2">Override from round default ({teeSets.find((t) => t.id === defaultTeeId)?.name || 'Unknown'})</p>
          <div className="space-y-1">
            {round.matchups.flatMap((m) => [...m.teamAPlayerIds, ...m.teamBPlayerIds]).map((pid) => {
              const player = tournament.players.find((p) => p.id === pid);
              if (!player) return null;
              return (
                <div key={pid} className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 flex-1">{player.name}</span>
                  <select
                    value={playerTees[pid] ?? ''}
                    onChange={(e) => setPlayerTees({ ...playerTees, [pid]: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-28 border rounded px-2 py-1 text-xs"
                  >
                    <option value="">Default</option>
                    {teeSets.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.totalYardage}y)</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Entry $/team/leg</label>
          <input value={entry} onChange={(e) => setEntry(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Handicap %</label>
          <input value={allowance} onChange={(e) => setAllowance(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Payout Split (% of pot)</label>
        <input value={payoutSplit} onChange={(e) => setPayoutSplit(e.target.value)} placeholder="80, 20" className="w-full border rounded-lg px-3 py-2 text-sm" />
        <p className="text-xs text-gray-400 mt-1">Comma-separated: 1st %, 2nd %, etc. Rest get nothing. Default: 100 (winner take all)</p>
      </div>

      <button onClick={create} className="w-full bg-green-700 hover:bg-green-600 text-white font-medium py-2.5 rounded-lg text-sm">
        Create Flight Game
      </button>
    </div>
  );
}

function SideGameEditor({ sideGame, tournament, onSave, onCancel }: {
  sideGame: SideGame;
  tournament: Tournament;
  onSave: (t: Tournament) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(sideGame.name);
  const [entry, setEntry] = useState(String(sideGame.nassauConfig.entryPerTeam));
  const [allowance, setAllowance] = useState(String(sideGame.handicapAllowance));
  const [payoutSplit, setPayoutSplit] = useState(sideGame.nassauConfig.payoutSplit?.join(', ') || '80, 20');
  const [playerTees, setPlayerTees] = useState<Record<string, number | undefined>>(() => {
    const map: Record<string, number | undefined> = {};
    for (const p of sideGame.players) {
      if (p.teeSetId) map[p.id] = p.teeSetId;
    }
    return map;
  });

  const teeSets = sideGame.course?.teeSets || [];
  const round = tournament.rounds.find((r) => r.id === sideGame.linkedRoundId);
  const defaultTeeId = round?.defaultTeeId || teeSets[0]?.id;

  function save() {
    const updatedPlayers = sideGame.players.map((p) => ({
      ...p,
      teeSetId: playerTees[p.id] ?? p.teeSetId,
    }));

    const parsedSplit = payoutSplit.split(',').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
    const updatedSideGame: SideGame = {
      ...sideGame,
      name,
      nassauConfig: { entryPerTeam: parseFloat(entry) || 10, payoutSplit: parsedSplit.length > 0 ? parsedSplit : undefined },
      handicapAllowance: parseFloat(allowance) || 100,
      players: updatedPlayers,
    };

    const updated = {
      ...tournament,
      sideGames: (tournament.sideGames || []).map((sg) =>
        sg.id === sideGame.id ? updatedSideGame : sg
      ),
    };
    onSave(updated);
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Edit Side Game</h3>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Game Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Entry $/team/leg</label>
          <input value={entry} onChange={(e) => setEntry(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Handicap %</label>
          <input value={allowance} onChange={(e) => setAllowance(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Payout Split (% of pot)</label>
        <input value={payoutSplit} onChange={(e) => setPayoutSplit(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
        <p className="text-xs text-gray-400 mt-1">1st %, 2nd %, etc. Default: 100 (winner take all)</p>
      </div>

      {teeSets.length > 1 && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Player Tees</label>
          <div className="space-y-1">
            {sideGame.players.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="text-sm text-gray-700 w-28 truncate">{p.name.split(' ')[0]}</span>
                <select
                  value={playerTees[p.id] ?? defaultTeeId ?? ''}
                  onChange={(e) => setPlayerTees({ ...playerTees, [p.id]: e.target.value ? Number(e.target.value) : undefined })}
                  className="flex-1 border rounded px-2 py-1 text-sm"
                >
                  {teeSets.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.gender === 'F' ? ' (W)' : ''}{t.id === defaultTeeId ? ' — default' : ''}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={save} className="w-full bg-green-700 hover:bg-green-600 text-white font-medium py-2 rounded-lg text-sm">
        Save Changes
      </button>
    </div>
  );
}

function formatPayout(amount: number): string {
  if (amount === 0) return '-';
  return `${amount > 0 ? '+' : ''}$${Math.abs(amount)}`;
}
