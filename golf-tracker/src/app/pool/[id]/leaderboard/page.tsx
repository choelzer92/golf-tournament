'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { GameScore } from '@/lib/game-state';
import { loadGameScores, fetchGameScores, subscribeToScores, onVisibilityRefetch, fetchScoreAudit, type ScoreAuditEntry } from '@/lib/tournament-state';
import type { PoolGame, PoolResult, PoolTeamDetail, PoolLegKey } from '@/lib/pool-game';
import {
  loadPoolGame,
  fetchPoolGame,
  subscribeToPoolGame,
  computePoolResult,
  computePoolPlayerDetails,
  filterConcealedScores,
  DEFAULT_MATCH_CONFIG,
} from '@/lib/pool-game';

const LEG_LABELS: Record<PoolLegKey, string> = {
  front: 'Front 9',
  back: 'Back 9',
  overall: 'Overall 18',
  junk: 'Junk',
};

export default function PoolLeaderboardPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [game, setGame] = useState<PoolGame | null>(null);
  const [result, setResult] = useState<PoolResult | null>(null);
  const [teamDetails, setTeamDetails] = useState<PoolTeamDetail[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

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

  // Multi-matchup score sync: fetch + realtime + visibility + poll
  useEffect(() => {
    if (!game) return;

    const ids = Array.from(new Set(game.teams.map((t) => t.matchupId)));

    function recompute() {
      const allScores = new Map<string, GameScore[]>();
      for (const mid of ids) {
        const cached = loadGameScores(mid);
        if (cached) allScores.set(mid, cached);
      }
      // Anti-sandbagging: when enabled, hide holes not yet finished by ALL groups.
      const visible = filterConcealedScores(game!, allScores);
      setResult(computePoolResult(game!, visible));
      setTeamDetails(computePoolPlayerDetails(game!, visible));
    }

    Promise.all(ids.map((mid) => fetchGameScores(mid))).then(recompute);

    const channels = ids.map((mid) => subscribeToScores(mid, () => recompute()));
    const removeVisibility = onVisibilityRefetch(ids, recompute);
    const interval = setInterval(() => {
      Promise.all(ids.map((mid) => fetchGameScores(mid))).then(recompute);
    }, 30000);

    return () => {
      channels.forEach((ch) => ch.unsubscribe());
      removeVisibility();
      clearInterval(interval);
    };
  }, [game?.id, game?.teams.map((t) => t.matchupId).join(',')]);

  if (!game) return null;

  if (!result || result.thruHole === 0) {
    return (
      <div className="min-h-full bg-gray-900">
        <header className="bg-gray-800 text-white shadow-lg">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-lg font-bold">{game.name}</h1>
            <button onClick={() => router.push(`/pool/${id}`)} className="text-sm text-gray-400 hover:text-white">Back</button>
          </div>
        </header>
        <div className="text-center py-12 text-gray-500">No scores yet.</div>
      </div>
    );
  }

  const frontLeg = result.legs.find((l) => l.leg === 'front');
  const backLeg = result.legs.find((l) => l.leg === 'back');
  const overallLeg = result.legs.find((l) => l.leg === 'overall');
  if (!overallLeg) return null;

  const frontHoles = result.holeScores.filter((h) => h.holeNumber <= 9);
  const backHoles = result.holeScores.filter((h) => h.holeNumber > 9);
  const rankedTeams = overallLeg.standings;

  // Junk breakdown ranked by total desc
  const rankedJunk = [...result.junkDetails].sort((a, b) => b.total - a.total);

  const isMatch = game.moneyMode === 'match';

  return (
    <div className="min-h-full bg-gray-900">
      <header className="bg-gray-800 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{game.name}</h1>
            <p className="text-xs text-gray-400">Thru hole {result.thruHole}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/game/play')}
              className="text-sm text-yellow-300 hover:text-yellow-100 font-medium"
            >
              Scorecard
            </button>
            <button onClick={() => router.push(`/pool/${id}`)} className="text-sm text-gray-400 hover:text-white">Back</button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-2 py-4 space-y-4">
        {game.hideHolesUntilAllFinish && (
          <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-200">
            Holes are hidden until <span className="font-semibold">every group</span> has finished them, so no team can see the standings before they play. Thru hole {result.thruHole}.
          </div>
        )}
        {/* Per-hole grid: every team's team score per hole (lowest is best) */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left px-2 py-1.5 font-medium sticky left-0 bg-gray-800 min-w-[70px]">Team</th>
                  {frontHoles.map((h) => (
                    <th key={h.holeNumber} className="text-center px-1 py-1.5 font-medium min-w-[24px]">{h.holeNumber}</th>
                  ))}
                  <th className="text-center px-1.5 py-1.5 font-bold text-gray-400 min-w-[28px]">F</th>
                  {backHoles.map((h) => (
                    <th key={h.holeNumber} className="text-center px-1 py-1.5 font-medium min-w-[24px]">{h.holeNumber}</th>
                  ))}
                  <th className="text-center px-1.5 py-1.5 font-bold text-gray-400 min-w-[28px]">B</th>
                  <th className="text-center px-1.5 py-1.5 font-bold text-gray-400 min-w-[32px]">Tot</th>
                </tr>
              </thead>
              <tbody>
                {rankedTeams.map((r, idx) => {
                  const frontTotal = frontLeg?.standings.find((x) => x.teamId === r.teamId)?.total ?? 0;
                  const backTotal = backLeg?.standings.find((x) => x.teamId === r.teamId)?.total ?? 0;

                  return (
                    <tr key={r.teamId} className={`${idx > 0 ? 'border-t border-gray-700/30' : ''}`}>
                      <td className="px-2 py-1.5 sticky left-0 bg-gray-800">
                        <div className={`font-medium ${r.place === 1 ? 'text-white' : 'text-gray-300'}`}>
                          <span className="text-gray-500">{r.place || '-'}.</span> {r.teamName}
                        </div>
                      </td>
                      {frontHoles.map((h) => {
                        const score = h.teamScores[r.teamId];
                        const lowOnHole = lowScoreOnHole(h.teamScores);
                        const isLow = score !== null && score === lowOnHole;
                        return (
                          <td key={h.holeNumber} className="text-center px-1 py-1.5">
                            <div className={`${isLow ? 'font-bold text-green-400' : 'text-gray-300'}`}>
                              {score ?? '-'}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-center px-1.5 py-1.5 bg-gray-750">
                        <div className="font-bold text-gray-200">{frontTotal || '-'}</div>
                      </td>
                      {backHoles.map((h) => {
                        const score = h.teamScores[r.teamId];
                        const lowOnHole = lowScoreOnHole(h.teamScores);
                        const isLow = score !== null && score === lowOnHole;
                        return (
                          <td key={h.holeNumber} className="text-center px-1 py-1.5">
                            <div className={`${isLow ? 'font-bold text-green-400' : 'text-gray-300'}`}>
                              {score ?? '-'}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-center px-1.5 py-1.5 bg-gray-750">
                        <div className="font-bold text-gray-200">{backTotal || '-'}</div>
                      </td>
                      <td className="text-center px-1.5 py-1.5 bg-gray-750">
                        <div className="font-bold text-white">{r.total || '-'}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[10px] text-gray-500 border-t border-gray-700">
            Team score = {ballSelectionCaption(game.ballSelection)} per hole · lowest total wins
          </div>
        </div>

        {/* Payout board — pot sub-pots, or head-to-head legs in match mode */}
        {isMatch ? (
          <MatchLegBoard game={game} result={result} />
        ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-700">
            <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Pots</p>
          </div>
          <div className="divide-y divide-gray-700/30">
            {result.legs.map((leg) => {
              const winners = leg.standings.filter((s) => s.place === 1);
              return (
                <div key={leg.leg} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-200">{LEG_LABELS[leg.leg]}</p>
                    <p className="text-[10px] text-gray-500">${Math.round(leg.subPot)} pot</p>
                  </div>
                  <div className="text-right">
                    {winners.length > 0 ? (
                      winners.map((w) => (
                        <div key={w.teamId} className="text-sm">
                          <span className="text-white font-medium">{w.teamName}</span>
                          <span className="text-green-400 font-medium ml-2">+${Math.round(w.payout)}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-gray-500">TBD</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Per-team junk breakdown */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-700">
            <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Junk Breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700/50">
                  <th className="text-left px-3 py-1.5 font-medium">Team</th>
                  <th className="text-center px-2 py-1.5 font-medium">Bird</th>
                  <th className="text-center px-2 py-1.5 font-medium">Eagle</th>
                  <th className="text-center px-2 py-1.5 font-medium">Alb</th>
                  <th className="text-center px-2 py-1.5 font-medium">Hug</th>
                  <th className="text-center px-2 py-1.5 font-medium">CTP</th>
                  <th className="text-center px-3 py-1.5 font-bold text-gray-400">Total</th>
                </tr>
              </thead>
              <tbody>
                {rankedJunk.map((j, idx) => (
                  <tr key={j.teamId} className={`${idx > 0 ? 'border-t border-gray-700/30' : ''}`}>
                    <td className="px-3 py-1.5 text-gray-300 font-medium whitespace-nowrap">{j.teamName}</td>
                    <td className="text-center px-2 py-1.5 text-gray-300">{j.birdies || '-'}</td>
                    <td className="text-center px-2 py-1.5 text-gray-300">{j.eagles || '-'}</td>
                    <td className="text-center px-2 py-1.5 text-gray-300">{j.albatrosses || '-'}</td>
                    <td className="text-center px-2 py-1.5 text-gray-300">{j.groupHugs || '-'}</td>
                    <td className="text-center px-2 py-1.5 text-gray-300">{j.ctps || '-'}</td>
                    <td className="text-center px-3 py-1.5 font-bold text-green-300">{j.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expandable: click a team for individual player gross scores */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-700">
            <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Player Details</p>
          </div>
          {rankedTeams.map((r) => {
            const isTeamExpanded = expandedTeam === r.teamId;
            const teamDetail = teamDetails.find((td) => td.teamId === r.teamId);
            const payout = result.payouts.find((p) => p.teamId === r.teamId);

            return (
              <div key={r.teamId} className="border-b border-gray-700/30 last:border-0">
                <button
                  onClick={() => setExpandedTeam(isTeamExpanded ? null : r.teamId)}
                  className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-750"
                >
                  <span className="text-sm text-gray-300">{r.teamName}</span>
                  <div className="flex items-center gap-2">
                    {payout && payout.net !== 0 && (
                      <span className={`text-xs font-medium ${payout.net > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {payout.net > 0 ? '+' : ''}${Math.round(payout.net)}
                      </span>
                    )}
                    <span className="text-gray-600 text-xs">{isTeamExpanded ? '▾' : '▸'}</span>
                  </div>
                </button>

                {isTeamExpanded && teamDetail && (
                  <div className="px-2 pb-3 pt-1 overflow-x-auto">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="text-gray-500">
                          <th className="text-left px-1 py-1 font-medium min-w-[60px] sticky left-0 bg-gray-800">Player</th>
                          {frontHoles.map((h) => (
                            <th key={h.holeNumber} className="text-center px-1 py-1 font-medium min-w-[24px]">{h.holeNumber}</th>
                          ))}
                          <th className="text-center px-1 py-1 min-w-[28px]"></th>
                          {backHoles.map((h) => (
                            <th key={h.holeNumber} className="text-center px-1 py-1 font-medium min-w-[24px]">{h.holeNumber}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teamDetail.players.map((player) => {
                          const isCaptain = game.teams.find((t) => t.id === r.teamId)?.captainId === player.playerId;
                          return (
                          <tr key={player.playerId}>
                            <td className="px-1 py-1 text-gray-300 font-medium whitespace-nowrap sticky left-0 bg-gray-800">
                              {isCaptain && <span className="text-[9px] font-bold text-green-400 mr-0.5" title="Captain">(C)</span>}
                              {player.playerName.split(' ')[0]}
                              <span className="text-[10px] text-gray-500 ml-0.5">({Math.round(player.playingHcap)})</span>
                            </td>
                            {player.holes.filter((h) => h.holeNumber <= 9).map((h) => (
                              <td key={h.holeNumber} className="text-center px-1 py-1 text-gray-300">
                                {h.gross != null ? (
                                  <span>
                                    {h.gross}
                                    {h.strokes > 0 && <span className="text-[8px] text-blue-400 align-super">{'•'.repeat(h.strokes)}</span>}
                                  </span>
                                ) : '-'}
                              </td>
                            ))}
                            <td className="text-center px-1 py-1 text-gray-600">|</td>
                            {player.holes.filter((h) => h.holeNumber > 9).map((h) => (
                              <td key={h.holeNumber} className="text-center px-1 py-1 text-gray-300">
                                {h.gross != null ? (
                                  <span>
                                    {h.gross}
                                    {h.strokes > 0 && <span className="text-[8px] text-blue-400 align-super">{'•'.repeat(h.strokes)}</span>}
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
            );
          })}
        </div>

        {/* Per-person payouts */}
        <div className="bg-gray-800 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Per Person</p>
            {isMatch
              ? <p className="text-[10px] text-gray-500">net win / loss</p>
              : <p className="text-[10px] text-gray-500">${Math.round(result.pot)} pot</p>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {result.payouts.flatMap((p) => {
              const team = game.teams.find((t) => t.id === p.teamId);
              if (!team) return [];
              return team.playerIds.map((pid) => {
                const player = game.players.find((pl) => pl.id === pid);
                return { name: player?.name.split(' ')[0] || '?', amount: p.perPersonNet, id: pid };
              });
            }).sort((a, b) => b.amount - a.amount).map((p) => (
              <span key={p.id} className={`text-sm ${p.amount > 0 ? 'text-green-400 font-medium' : p.amount < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                {p.name}: {p.amount > 0 ? '+' : ''}${Math.round(p.amount)}
              </span>
            ))}
          </div>
        </div>

        {/* Score change history (audit) */}
        <ScoreHistory game={game} />
      </main>
    </div>
  );
}

// Collapsible score-change audit: every entry/edit/clear across this game's
// foursomes, newest first, with old->new and a timestamp. Fetched on expand.
function ScoreHistory({ game }: { game: PoolGame }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ScoreAuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const matchupIds = Array.from(new Set(game.teams.map((t) => t.matchupId)));
  const teamByMatchup = new Map(game.teams.map((t) => [t.matchupId, t.name]));
  const nameOf = (pid: string) => game.players.find((p) => p.id === pid)?.name ?? 'Unknown';

  async function load() {
    setLoading(true);
    try {
      setEntries(await fetchScoreAudit(matchupIds));
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && entries === null) load();
  }

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const fmtVal = (v: number | null) => (v === null ? '—' : String(v));
  const changeKind = (e: ScoreAuditEntry) => (e.oldScore === null ? 'entered' : e.newScore === null ? 'cleared' : 'changed');

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <button onClick={toggle} className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-750">
        <span className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Score History</span>
        <span className="text-gray-600 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-2 pb-3">
          {loading ? (
            <p className="text-xs text-gray-500 text-center py-3">Loading…</p>
          ) : !entries || entries.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-3">No score changes recorded yet.</p>
          ) : (
            <table className="text-xs w-full">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700/50">
                  <th className="text-left px-2 py-1 font-medium">When</th>
                  <th className="text-left px-2 py-1 font-medium">Player</th>
                  <th className="text-left px-2 py-1 font-medium">Group</th>
                  <th className="text-center px-2 py-1 font-medium">Hole</th>
                  <th className="text-center px-2 py-1 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-t border-gray-700/30">
                    <td className="px-2 py-1 text-gray-400 whitespace-nowrap">{fmtTime(e.changedAt)}</td>
                    <td className="px-2 py-1 text-gray-300 whitespace-nowrap">{nameOf(e.playerId).split(' ')[0]}</td>
                    <td className="px-2 py-1 text-gray-500 whitespace-nowrap">{teamByMatchup.get(e.matchupId) ?? '—'}</td>
                    <td className="px-2 py-1 text-center text-gray-300">{e.hole}</td>
                    <td className="px-2 py-1 text-center whitespace-nowrap">
                      {changeKind(e) === 'changed' ? (
                        <span className="text-yellow-300">{fmtVal(e.oldScore)} → {fmtVal(e.newScore)}</span>
                      ) : changeKind(e) === 'cleared' ? (
                        <span className="text-red-400">cleared ({fmtVal(e.oldScore)})</span>
                      ) : (
                        <span className="text-green-400">{fmtVal(e.newScore)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// Head-to-head leg board (match mode): per leg, the two foursomes' to-par with
// the winner and the fixed $/player they take; then the junk differential. A
// tied leg (or tied junk) is a push and pays nobody.
function MatchLegBoard({ game, result }: { game: PoolGame; result: PoolResult }) {
  const cfg = game.matchConfig ?? DEFAULT_MATCH_CONFIG;
  const twoTeams = game.teams.length === 2;
  const teamName = (id: string) => game.teams.find((t) => t.id === id)?.name ?? '?';

  const scoreLegs: { key: PoolLegKey; label: string; dollars: number }[] = [
    { key: 'front', label: 'Front 9', dollars: cfg.legDollars.front },
    { key: 'back', label: 'Back 9', dollars: cfg.legDollars.back },
    { key: 'overall', label: 'Overall 18', dollars: cfg.legDollars.overall },
  ];

  // Winner of a leg by lowest toPar among teams that have played; null = push/none.
  function legWinner(leg: PoolLegKey): { winnerId: string | null; a?: PoolResult['legs'][number]['standings'][number]; b?: PoolResult['legs'][number]['standings'][number] } {
    const l = result.legs.find((x) => x.leg === leg);
    if (!l) return { winnerId: null };
    const played = l.standings.filter((s) => s.thru > 0);
    const [a, b] = l.standings;
    if (played.length < 2) return { winnerId: null, a, b };
    const sorted = [...played].sort((x, y) => x.toPar - y.toPar);
    if (sorted[0].toPar === sorted[1].toPar) return { winnerId: null, a, b };
    return { winnerId: sorted[0].teamId, a, b };
  }

  // Junk differential
  const jd = [...result.junkDetails];
  const junkWinner = jd.length === 2 && jd[0].total !== jd[1].total
    ? (jd[0].total > jd[1].total ? jd[0] : jd[1])
    : null;
  const junkMargin = jd.length === 2 ? Math.abs(jd[0].total - jd[1].total) : 0;

  if (!twoTeams) {
    return (
      <div className="bg-gray-800 rounded-xl px-4 py-3">
        <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider mb-1">Match</p>
        <p className="text-sm text-amber-400">Head-to-head needs exactly two foursomes — this game has {game.teams.length}.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-700">
        <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Match (per player)</p>
      </div>
      <div className="divide-y divide-gray-700/30">
        {scoreLegs.map(({ key, label, dollars }) => {
          const { winnerId, a, b } = legWinner(key);
          return (
            <div key={key} className="px-4 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-200">{label}</p>
                <p className="text-[10px] text-gray-500">
                  {a && b ? `${teamName(a.teamId)} ${a.thru ? a.toPar : '–'} vs ${teamName(b.teamId)} ${b.thru ? b.toPar : '–'} (to par)` : '—'}
                </p>
              </div>
              <div className="text-right text-sm">
                {winnerId ? (
                  <>
                    <span className="text-white font-medium">{teamName(winnerId)}</span>
                    <span className="text-green-400 font-medium ml-2">+${dollars}</span>
                  </>
                ) : (
                  <span className="text-xs text-gray-500">Push</span>
                )}
              </div>
            </div>
          );
        })}
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-200">Junk</p>
            <p className="text-[10px] text-gray-500">
              {jd.length === 2 ? `${teamName(jd[0].teamId)} ${jd[0].total} vs ${teamName(jd[1].teamId)} ${jd[1].total} pts` : '—'}
            </p>
          </div>
          <div className="text-right text-sm">
            {junkWinner ? (
              <>
                <span className="text-white font-medium">{junkWinner.teamName}</span>
                <span className="text-green-400 font-medium ml-2">+${junkMargin * cfg.junkPerPoint}</span>
                <span className="text-[10px] text-gray-500 ml-1">({junkMargin} × ${cfg.junkPerPoint})</span>
              </>
            ) : (
              <span className="text-xs text-gray-500">Push</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Plain-words per-hole team-score caption, matching the game's ball selection
// (was hardcoded to "best net + best gross").
function ballSelectionCaption(variant: PoolGame['ballSelection'] | undefined): string {
  switch (variant) {
    case '2-best-net': return 'best 2 net';
    case '2-best-gross': return 'best 2 gross';
    case '1-net-1-gross':
    default: return 'best net + best gross';
  }
}

function lowScoreOnHole(teamScores: Record<string, number | null>): number | null {
  let low: number | null = null;
  for (const s of Object.values(teamScores)) {
    if (s === null) continue;
    if (low === null || s < low) low = s;
  }
  return low;
}
