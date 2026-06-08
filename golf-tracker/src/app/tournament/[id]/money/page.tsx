'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { Tournament } from '@/lib/tournament-state';
import { loadTournament, fetchTournament, fetchGameScores, subscribeToTournament, subscribeToScores } from '@/lib/tournament-state';
import { computeMoneyLedger, getMoneyGamePlayingHandicap, computeRoundPlayerDetails, getPlayerDisplayName } from '@/lib/money-games';
import type { MoneyLedger, RoundNassauResult, SkinsResult, RoundPlayerDetails, PlayerRoundDetail } from '@/lib/money-games';

export default function MoneySettlementPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [ledger, setLedger] = useState<MoneyLedger | null>(null);

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

  // Fetch all scores for all matchups
  useEffect(() => {
    if (!tournament) return;
    const matchupIds = tournament.rounds.flatMap((r) => r.matchups.map((m) => m.id));
    Promise.all(matchupIds.map((mid) => fetchGameScores(mid))).then(() => {
      setLedger(computeMoneyLedger(tournament));
    });

    const channels = matchupIds.map((mid) =>
      subscribeToScores(mid, () => setLedger(computeMoneyLedger(tournament)))
    );
    return () => { channels.forEach((ch) => ch.unsubscribe()); };
  }, [tournament]);

  if (!tournament) return null;

  const mg = tournament.moneyGames;
  if (!mg) {
    return (
      <div className="min-h-full bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">No money games configured for this tournament.</p>
          <button onClick={() => router.push(`/tournament/${id}`)} className="text-green-700 font-medium">
            Back to Tournament
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Money Games</h1>
            <p className="text-xs text-green-200">{tournament.name}</p>
          </div>
          <button onClick={() => router.push(`/tournament/${id}`)} className="text-sm text-green-200 hover:text-white">
            Back
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Settlement Table */}
        {ledger && ledger.players.length > 0 && (
          <SettlementTable ledger={ledger} tournament={tournament} />
        )}

        {/* Nassau Details */}
        {ledger && ledger.nassauDetails.length > 0 && (
          <NassauDetails details={ledger.nassauDetails} tournament={tournament} />
        )}

        {/* Skins Details */}
        {ledger && ledger.skinsDetails && (
          <SkinsDetails result={ledger.skinsDetails} tournament={tournament} />
        )}

        {/* Handicap Reference */}
        {ledger && (
          <HandicapReference tournament={tournament} />
        )}

        {/* Detailed Breakdown */}
        {ledger && (
          <DetailBreakdown tournament={tournament} ledger={ledger} />
        )}
      </main>
    </div>
  );
}

function SettlementTable({ ledger, tournament }: { ledger: MoneyLedger; tournament: Tournament }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Settlement</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Player</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Rds</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Nassau</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Skins</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 bg-gray-100">Net</th>
            </tr>
          </thead>
          <tbody>
            {ledger.players.map((p) => {
              const isTeamA = p.teamId === tournament.teams[0].id;
              return (
                <tr key={p.playerId} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <span className={`font-medium ${isTeamA ? 'text-blue-800' : 'text-red-800'}`}>
                      {p.playerName.split(' ')[0]}
                    </span>
                    {p.moneyHandicap != null && (
                      <span className="text-xs text-gray-400 ml-1">({Math.round(p.moneyHandicap)})</span>
                    )}
                  </td>
                  <td className="text-right px-3 py-2 text-gray-500">{p.roundsPlayed}</td>
                  <td className={`text-right px-3 py-2 ${p.nassauResult > 0 ? 'text-green-700' : p.nassauResult < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {p.nassauResult > 0 ? '+' : ''}{p.nassauResult !== 0 ? `$${Math.abs(p.nassauResult)}` : '-'}
                  </td>
                  <td className={`text-right px-3 py-2 ${p.skinsResult > 0 ? 'text-green-700' : p.skinsResult < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {p.skinsResult > 0 ? '+' : ''}{p.skinsResult !== 0 ? `$${Math.abs(Math.round(p.skinsResult))}` : '-'}
                  </td>
                  <td className={`text-right px-3 py-2 font-bold bg-gray-50 ${p.netResult > 0 ? 'text-green-700' : p.netResult < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {p.netResult > 0 ? '+' : ''}{p.netResult !== 0 ? `$${Math.abs(Math.round(p.netResult))}` : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NassauDetails({ details, tournament }: { details: RoundNassauResult[]; tournament: Tournament }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Team Nassau — Round Breakdown</h2>
      <div className="space-y-3">
        {details.map((rd) => (
          <div key={rd.roundId} className="bg-white rounded-lg shadow p-4">
            <p className="font-medium text-gray-800 mb-2">{rd.roundName}</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <LegRow label="Front 9" leg={rd.front} tournament={tournament} />
              <LegRow label="Back 9" leg={rd.back} tournament={tournament} />
              <LegRow label="Overall" leg={rd.overall} tournament={tournament} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LegRow({ label, leg, tournament }: { label: string; leg: { teamATotal: number; teamBTotal: number; winner: 'A' | 'B' | 'push' }; tournament: Tournament }) {
  const winnerName = leg.winner === 'A' ? tournament.teams[0].name
    : leg.winner === 'B' ? tournament.teams[1].name : 'Push';
  const winColor = leg.winner === 'A' ? 'text-blue-700' : leg.winner === 'B' ? 'text-red-700' : 'text-gray-500';

  return (
    <>
      <span className="text-gray-600">{label}</span>
      <span className="text-center text-gray-800">{leg.teamATotal} — {leg.teamBTotal}</span>
      <span className={`text-right font-medium ${winColor}`}>{winnerName}</span>
    </>
  );
}

function SkinsDetails({ result, tournament }: { result: SkinsResult; tournament: Tournament }) {
  const sortedPlayers = [...result.playerSkins.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([pid, count]) => ({
      name: getPlayerDisplayName(pid, tournament.players),
      count,
      value: count * result.skinValue,
    }));

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Individual Skins</h2>
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between text-sm text-gray-600 mb-3">
          <span>Pot: ${Math.round(result.totalPot)}</span>
          <span>{result.skinsAwarded} skins won</span>
          <span>${result.skinValue.toFixed(2)}/skin</span>
        </div>

        {sortedPlayers.length > 0 ? (
          <div className="space-y-1">
            {sortedPlayers.map((p) => (
              <div key={p.name} className="flex justify-between text-sm">
                <span className="text-gray-800 font-medium">{p.name}</span>
                <span className="text-green-700">{p.count} skins (+${Math.round(p.value)})</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No skins won yet.</p>
        )}

        {/* Hole-by-hole skins grid */}
        <details className="mt-4">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Hole-by-hole detail</summary>
          <div className="mt-2 overflow-x-auto">
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(18, minmax(28px, 1fr))' }}>
              {result.holes.map((hole, i) => {
                const winnerInitial = hole.winner
                  ? tournament.players.find((p) => p.id === hole.winner)?.name?.split(' ')[0]?.[0] || '?'
                  : null;
                const winnerFull = hole.winner ? getPlayerDisplayName(hole.winner, tournament.players) : null;
                return (
                  <div
                    key={i}
                    className={`text-center text-xs py-1 rounded ${
                      hole.winner ? 'bg-green-100 text-green-800 font-bold' :
                      hole.carryover ? 'bg-yellow-50 text-yellow-700' :
                      'bg-gray-50 text-gray-400'
                    }`}
                    title={`R${hole.roundIndex + 1} H${hole.holeNumber}: ${hole.winner ? `Won by ${winnerFull}` : hole.carryover ? 'Carry' : 'Push'}`}
                  >
                    {hole.winner ? winnerInitial : hole.carryover ? 'C' : '-'}
                  </div>
                );
              })}
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}

function DetailBreakdown({ tournament, ledger }: { tournament: Tournament; ledger: MoneyLedger }) {
  const mg = tournament.moneyGames;
  if (!mg) return null;

  const nassauAllowance = mg.teamNassau?.allowance ?? 100;
  const skinsAllowance = mg.skins?.allowance;
  const roundDetails = tournament.rounds
    .map((round) => computeRoundPlayerDetails(round, tournament, nassauAllowance))
    .filter((d): d is RoundPlayerDetails => d !== null);

  const skinsRoundDetails = skinsAllowance != null && skinsAllowance !== nassauAllowance
    ? tournament.rounds
        .map((round) => computeRoundPlayerDetails(round, tournament, skinsAllowance))
        .filter((d): d is RoundPlayerDetails => d !== null)
    : null;

  if (roundDetails.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Per-Round Player Scorecard Grid */}
      {roundDetails.map((rd) => (
        <RoundScorecardGrid key={rd.roundId} details={rd} tournament={tournament} />
      ))}

      {/* Stroke Allocation Reference */}
      {roundDetails.length > 0 && (
        <StrokeAllocationTable
          roundDetails={roundDetails}
          skinsRoundDetails={skinsRoundDetails}
          nassauAllowance={nassauAllowance}
          skinsAllowance={skinsAllowance ?? null}
          tournament={tournament}
        />
      )}

      {/* Skins Hole-by-Hole Detail */}
      {ledger.skinsDetails && (
        <SkinsHoleDetail result={ledger.skinsDetails} tournament={tournament} />
      )}
    </div>
  );
}

function RoundScorecardGrid({ details, tournament }: { details: RoundPlayerDetails; tournament: Tournament }) {
  const teamA = tournament.teams[0];
  const teamB = tournament.teams[1];
  const teamAPlayers = details.players.filter((p) => p.teamId === teamA.id);
  const teamBPlayers = details.players.filter((p) => p.teamId === teamB.id);

  const holes = details.players[0]?.holes ?? [];
  const frontHoles = holes.filter((h) => h.holeNumber <= 9);
  const backHoles = holes.filter((h) => h.holeNumber > 9);
  const hasFront = frontHoles.length > 0;
  const hasBack = backHoles.length > 0;

  function sumRange(player: PlayerRoundDetail, start: number, end: number, field: 'gross' | 'net') {
    return player.holes
      .filter((h) => h.holeNumber >= start && h.holeNumber <= end)
      .reduce((sum, h) => sum + (h[field] ?? 0), 0);
  }



  function TeamBestNetRow({ label, bestNets, opponentBestNets, teamColor }: { label: string; bestNets: (number | null)[]; opponentBestNets: (number | null)[]; teamColor: string }) {
    return (
      <tr className="border-t border-gray-700 bg-gray-750">
        <td className={`px-2 py-1 text-xs font-bold ${teamColor} sticky left-0 bg-gray-800`}>{label} Best</td>
        {holes.map((h, i) => {
          const val = bestNets[i];
          const opp = opponentBestNets[i];
          let cellColor = 'text-gray-300';
          if (val !== null && opp !== null) {
            if (val < opp) cellColor = 'text-green-400';
            else if (val > opp) cellColor = 'text-red-400';
          }
          return (
            <td key={h.holeNumber} className={`text-center text-xs py-1 ${cellColor} font-bold`}>
              {val ?? ''}
            </td>
          );
        })}
        {hasFront && (
          <td className="text-center text-xs py-1 font-bold text-gray-200 border-l border-gray-600">
            {holes.filter((_, idx) => details.players[0].holes[idx].holeNumber <= 9).reduce((s, _, idx) => s + (bestNets[idx] ?? 0), 0)}
          </td>
        )}
        {hasBack && (
          <td className="text-center text-xs py-1 font-bold text-gray-200 border-l border-gray-600">
            {holes.filter((_, idx) => details.players[0].holes[idx].holeNumber > 9).reduce((s, _, idx) => s + (bestNets[idx] ?? 0), 0)}
          </td>
        )}
        <td className="text-center text-xs py-1 font-bold text-gray-200 border-l border-gray-600">
          {bestNets.reduce<number>((s, v) => s + (v ?? 0), 0)}
        </td>
      </tr>
    );
  }

  function PlayerRow({ player, teamColor }: { player: PlayerRoundDetail; teamColor: string }) {
    const frontGross = sumRange(player, 1, 9, 'gross');
    const backGross = sumRange(player, 10, 18, 'gross');
    const frontNet = sumRange(player, 1, 9, 'net');
    const backNet = sumRange(player, 10, 18, 'net');

    return (
      <tr className="border-t border-gray-700/50">
        <td className={`px-2 py-1 text-xs font-medium ${teamColor} whitespace-nowrap sticky left-0 bg-gray-800`}>
          {player.playerName.split(' ')[0]}
          <span className="text-gray-500 ml-1 text-[10px]">({Math.round(player.playingHcap)})</span>
        </td>
        {player.holes.map((h) => {
          const isBest = h.isBestNet;
          const hasStroke = h.strokes > 0;
          return (
            <td key={h.holeNumber} className={`text-center text-xs py-1 relative ${isBest ? 'bg-green-900/40 font-bold text-green-300' : 'text-gray-300'}`}>
              {h.gross !== null ? (
                <div className="leading-tight">
                  <span className={h.gross < h.par ? 'text-red-400' : h.gross > h.par ? '' : 'text-gray-200'}>
                    {h.gross}
                  </span>
                  {hasStroke && (
                    <span className="text-yellow-500 text-[8px] align-super ml-px">{h.strokes > 1 ? '••' : '•'}</span>
                  )}
                  <div className="text-[10px] text-gray-500">{h.net}</div>
                </div>
              ) : (
                <span className="text-gray-600">-</span>
              )}
            </td>
          );
        })}
        {hasFront && (
          <td className="text-center text-xs py-1 border-l border-gray-600">
            <div className="font-medium text-gray-200">{frontGross || '-'}</div>
            <div className="text-[10px] text-gray-500">{frontNet || '-'}</div>
          </td>
        )}
        {hasBack && (
          <td className="text-center text-xs py-1 border-l border-gray-600">
            <div className="font-medium text-gray-200">{backGross || '-'}</div>
            <div className="text-[10px] text-gray-500">{backNet || '-'}</div>
          </td>
        )}
        <td className="text-center text-xs py-1 border-l border-gray-600 font-bold">
          <div className="text-gray-200">{(frontGross + backGross) || '-'}</div>
          <div className="text-[10px] text-gray-400">{(frontNet + backNet) || '-'}</div>
        </td>
      </tr>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{details.roundName} — Player Scorecard</h2>
      <div className="bg-gray-800 rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-gray-900">
              <th className="px-2 py-1 text-left text-xs text-gray-400 font-medium sticky left-0 bg-gray-900">Hole</th>
              {holes.map((h) => (
                <th key={h.holeNumber} className="text-center text-xs text-gray-400 font-medium py-1 w-8">{h.holeNumber}</th>
              ))}
              {hasFront && <th className="text-center text-xs text-gray-400 font-medium py-1 border-l border-gray-600">Out</th>}
              {hasBack && <th className="text-center text-xs text-gray-400 font-medium py-1 border-l border-gray-600">In</th>}
              <th className="text-center text-xs text-gray-400 font-medium py-1 border-l border-gray-600">Tot</th>
            </tr>
            <tr className="bg-gray-900 border-b border-gray-700">
              <td className="px-2 py-0.5 text-[10px] text-gray-500 sticky left-0 bg-gray-900">Par</td>
              {holes.map((h) => (
                <td key={h.holeNumber} className="text-center text-[10px] text-gray-500 py-0.5">{h.par}</td>
              ))}
              {hasFront && <td className="text-center text-[10px] text-gray-500 py-0.5 border-l border-gray-600">{frontHoles.reduce((s, h) => s + h.par, 0)}</td>}
              {hasBack && <td className="text-center text-[10px] text-gray-500 py-0.5 border-l border-gray-600">{backHoles.reduce((s, h) => s + h.par, 0)}</td>}
              <td className="text-center text-[10px] text-gray-500 py-0.5 border-l border-gray-600">{holes.reduce((s, h) => s + h.par, 0)}</td>
            </tr>
          </thead>
          <tbody>
            {/* Team A players */}
            {teamAPlayers.map((p) => (
              <PlayerRow key={p.playerId} player={p} teamColor="text-blue-400" />
            ))}
            <TeamBestNetRow label={teamA.name} bestNets={details.teamABestNets} opponentBestNets={details.teamBBestNets} teamColor="text-blue-300" />

            {/* Spacer */}
            <tr><td colSpan={holes.length + 4} className="h-2 bg-gray-800"></td></tr>

            {/* Team B players */}
            {teamBPlayers.map((p) => (
              <PlayerRow key={p.playerId} player={p} teamColor="text-red-400" />
            ))}
            <TeamBestNetRow label={teamB.name} bestNets={details.teamBBestNets} opponentBestNets={details.teamABestNets} teamColor="text-red-300" />
          </tbody>
        </table>
        <div className="px-3 py-2 text-[10px] text-gray-500 border-t border-gray-700">
          <span className="text-yellow-500">•</span> = stroke received &nbsp; <span className="bg-green-900/40 text-green-300 px-1 rounded">highlighted</span> = team best net
        </div>
      </div>
    </section>
  );
}

function StrokeAllocationTable({ roundDetails, skinsRoundDetails, nassauAllowance, skinsAllowance, tournament }: {
  roundDetails: RoundPlayerDetails[];
  skinsRoundDetails: RoundPlayerDetails[] | null;
  nassauAllowance: number;
  skinsAllowance: number | null;
  tournament: Tournament;
}) {
  const showBoth = skinsRoundDetails !== null && skinsAllowance !== null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Stroke Allocation</h2>
      <div className="space-y-3">
        {roundDetails.map((rd, ri) => {
          const skinsRd = skinsRoundDetails?.[ri];
          return (
            <div key={rd.roundId} className="bg-gray-800 rounded-lg shadow p-4">
              <p className="font-medium text-gray-200 text-sm mb-2">{rd.roundName}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-700">
                    <th className="text-left pb-1 font-medium">Player</th>
                    <th className="text-right pb-1 font-medium">Nassau ({nassauAllowance}%)</th>
                    <th className="text-left pb-1 pl-3 font-medium">Holes</th>
                    {showBoth && (
                      <>
                        <th className="text-right pb-1 pl-3 font-medium">Skins ({skinsAllowance}%)</th>
                        <th className="text-left pb-1 pl-3 font-medium">Holes</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rd.players.map((p) => {
                    const isTeamA = p.teamId === tournament.teams[0].id;
                    const skinsPlayer = skinsRd?.players.find((sp) => sp.playerId === p.playerId);
                    return (
                      <tr key={p.playerId} className="border-t border-gray-700/50">
                        <td className={`py-1 text-xs font-medium ${isTeamA ? 'text-blue-400' : 'text-red-400'}`}>
                          {p.playerName.split(' ')[0]}
                        </td>
                        <td className="text-right text-xs text-gray-300 py-1">{Math.round(p.playingHcap)}</td>
                        <td className="text-left pl-3 text-xs text-gray-400 py-1">
                          {p.strokeHoles.length > 0 ? p.strokeHoles.join(', ') : <span className="text-gray-600">none</span>}
                        </td>
                        {showBoth && (
                          <>
                            <td className="text-right pl-3 text-xs text-gray-300 py-1">{skinsPlayer ? Math.round(skinsPlayer.playingHcap) : '-'}</td>
                            <td className="text-left pl-3 text-xs text-gray-400 py-1">
                              {skinsPlayer && skinsPlayer.strokeHoles.length > 0 ? skinsPlayer.strokeHoles.join(', ') : <span className="text-gray-600">none</span>}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SkinsHoleDetail({ result, tournament }: { result: SkinsResult; tournament: Tournament }) {
  const allPlayerIds = [...new Set(result.holes.flatMap((h) => h.playerScores.map((s) => s.playerId)))];
  const players = allPlayerIds.map((pid) => ({
    id: pid,
    name: getPlayerDisplayName(pid, tournament.players),
  }));

  if (players.length === 0 || result.holes.length === 0) return null;

  let runningPot = 0;
  const holesWithPot = result.holes.map((hole) => {
    runningPot++;
    const pot = runningPot;
    if (hole.winner) runningPot = 0;
    return { ...hole, pot };
  });

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Skins — Hole-by-Hole</h2>
      <div className="bg-gray-800 rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[500px]">
          <thead>
            <tr className="bg-gray-900">
              <th className="px-2 py-1 text-left text-xs text-gray-400 font-medium">Hole</th>
              <th className="px-2 py-1 text-center text-xs text-gray-400 font-medium">Par</th>
              {players.map((p) => (
                <th key={p.id} className="px-2 py-1 text-center text-xs text-gray-400 font-medium">{p.name}</th>
              ))}
              <th className="px-2 py-1 text-center text-xs text-gray-400 font-medium">Pot</th>
              <th className="px-2 py-1 text-center text-xs text-gray-400 font-medium">Winner</th>
            </tr>
          </thead>
          <tbody>
            {holesWithPot.map((hole, i) => {
              const winnerName = hole.winner
                ? players.find((p) => p.id === hole.winner)?.name || '?'
                : null;
              return (
                <tr key={i} className={`border-t border-gray-700/50 ${hole.winner ? 'bg-green-900/20' : ''}`}>
                  <td className="px-2 py-1 text-xs text-gray-300">
                    R{hole.roundIndex + 1} H{hole.holeNumber}
                  </td>
                  <td className="text-center text-xs text-gray-500 py-1">{hole.par}</td>
                  {players.map((p) => {
                    const score = hole.playerScores.find((s) => s.playerId === p.id);
                    const isWinner = hole.winner === p.id;
                    let display = '-';
                    let color = 'text-gray-600';
                    if (score) {
                      const val = score.netToPar;
                      display = val === 0 ? 'E' : val > 0 ? `+${val}` : `${val}`;
                      color = isWinner ? 'text-green-400 font-bold' : val < 0 ? 'text-red-400' : val > 0 ? 'text-gray-400' : 'text-gray-300';
                    }
                    return (
                      <td key={p.id} className={`text-center text-xs py-1 ${color} ${isWinner ? 'bg-green-900/30 rounded' : ''}`}>
                        {display}
                      </td>
                    );
                  })}
                  <td className="text-center text-xs py-1 text-yellow-400 font-medium">
                    {hole.pot > 1 ? hole.pot : ''}
                  </td>
                  <td className="text-center text-xs py-1">
                    {winnerName ? (
                      <span className="text-green-400 font-bold">{winnerName}</span>
                    ) : hole.carryover ? (
                      <span className="text-yellow-500">C</span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HandicapReference({ tournament }: { tournament: Tournament }) {
  const mg = tournament.moneyGames;
  if (!mg) return null;

  const nassauAllowance = mg.teamNassau?.allowance;
  const skinsAllowance = mg.skins?.allowance;

  const rounds = tournament.rounds.filter((r) => r.course);
  if (rounds.length === 0) return null;

  const players = tournament.players.sort((a, b) => (a.handicapIndex ?? 0) - (b.handicapIndex ?? 0));

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Money Game Strokes</h2>
      <div className="space-y-3">
        {rounds.map((round) => (
          <div key={round.id} className="bg-white rounded-lg shadow p-4">
            <p className="font-medium text-gray-800 text-sm mb-2">
              {round.dayLabel} — {round.course?.courseName}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b">
                  <th className="text-left pb-1 font-medium">Player</th>
                  <th className="text-right pb-1 font-medium">Index</th>
                  <th className="text-right pb-1 font-medium">Course</th>
                  {nassauAllowance != null && <th className="text-right pb-1 font-medium">Nassau ({nassauAllowance}%)</th>}
                  {skinsAllowance != null && <th className="text-right pb-1 font-medium">Skins ({skinsAllowance}%)</th>}
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const courseHcap = getMoneyGamePlayingHandicap(p, round, 100);
                  const nassauHcap = nassauAllowance != null ? getMoneyGamePlayingHandicap(p, round, nassauAllowance) : null;
                  const skinsHcap = skinsAllowance != null ? getMoneyGamePlayingHandicap(p, round, skinsAllowance) : null;
                  const isTeamA = tournament.teams[0].playerIds.includes(p.id);
                  return (
                    <tr key={p.id}>
                      <td className={`py-0.5 ${isTeamA ? 'text-blue-800' : 'text-red-800'}`}>
                        {p.name.split(' ')[0]}
                      </td>
                      <td className="text-right text-gray-500">{p.handicapIndex ?? '-'}</td>
                      <td className="text-right text-gray-600">{courseHcap.toFixed(1)}</td>
                      {nassauAllowance != null && (
                        <td className="text-right text-gray-800 font-medium">{nassauHcap != null ? Math.round(nassauHcap) : '-'}</td>
                      )}
                      {skinsAllowance != null && (
                        <td className="text-right text-gray-800 font-medium">{skinsHcap != null ? Math.round(skinsHcap) : '-'}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
