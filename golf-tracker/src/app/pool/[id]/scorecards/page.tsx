'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { PoolGame, PoolTeamDetail } from '@/lib/pool-game';
import type { TeeSetOption } from '@/lib/game-state';
import { loadPoolGame, fetchPoolGame, computePoolPlayerDetails } from '@/lib/pool-game';

// Fully DRAWN scorecard — a real HTML grid where every value (par, stroke index,
// stroke dots, blank score boxes) lives inside a real table cell, so nothing can
// misalign the way the old PDF-overlay approach did on iOS Safari. It's styled to
// look like a real club card (green masthead, Hole / OUT / IN / TOTAL columns,
// Yardage / Par / Handicap rows, blank player rows) and is built from the course's
// own GHIN tee data, so it works at any course. Two cards per printed page.

const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];

// The tee whose Par / Yardage / Handicap header rows the card prints. Prefer the
// course default, else the tee most of the foursome is playing, else the first.
// (Per-player stroke DOTS are still computed off each player's OWN tee, so a
// mixed men's/women's group is handled correctly regardless of this choice.)
function referenceTee(game: PoolGame, playerIds: string[]): TeeSetOption | null {
  const tees = game.course?.teeSets ?? [];
  if (tees.length === 0) return null;
  const byId = new Map(tees.map((t) => [t.id, t]));
  const counts = new Map<number, number>();
  for (const pid of playerIds) {
    const teeId = game.players.find((p) => p.id === pid)?.teeSetId;
    if (teeId != null && byId.has(teeId)) counts.set(teeId, (counts.get(teeId) ?? 0) + 1);
  }
  const mostCommon = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return (
    (game.course?.selectedTeeId != null ? byId.get(game.course.selectedTeeId) : undefined) ??
    (mostCommon != null ? byId.get(mostCommon) : undefined) ??
    tees[0]
  );
}

export default function PoolScorecardsPage() {
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
  }, [id, router]);

  const details = useMemo(() => (game ? computePoolPlayerDetails(game, new Map()) : []), [game]);

  if (!game) return null;

  return (
    <div className="min-h-full bg-gray-200">
      {/* Portrait print; two cards stack per page (page-break handled per card). */}
      <style>{`@media print { @page { size: portrait; margin: 0.35in; } body { background: white; } }`}</style>

      {/* Toolbar (hidden on print) */}
      <div className="print:hidden bg-green-800 text-white">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{game.name} — Scorecards</h1>
            <p className="text-xs text-green-200">
              {game.teams.length} foursome{game.teams.length === 1 ? '' : 's'} · 2 cards per page
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} className="rounded-md bg-white text-green-800 px-4 py-1.5 text-sm font-semibold hover:bg-green-50">Print</button>
            <button onClick={() => router.push(`/pool/${id}`)} className="text-sm text-green-200 hover:text-white">Back</button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-3 space-y-4 print:p-0 print:space-y-0 print:max-w-none">
        {details.length === 0 ? (
          <p className="text-center text-gray-500 py-10 bg-white rounded-lg">No foursomes to print yet.</p>
        ) : (
          details.map((team, idx) => (
            // Two cards per page: break before every 2nd card; keep each intact.
            <div
              key={team.teamId}
              className={idx % 2 === 0 && idx > 0 ? 'print:break-before-page' : ''}
              style={{ breakInside: 'avoid' }}
            >
              <DrawnScorecard game={game} team={team} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DrawnScorecard({ game, team }: { game: PoolGame; team: PoolTeamDetail }) {
  const poolTeam = game.teams.find((t) => t.id === team.teamId);
  const tee = referenceTee(game, team.players.map((p) => p.playerId));
  const holeByNum = new Map((tee?.holes ?? []).map((h) => [h.number, h]));

  const par = (n: number) => holeByNum.get(n)?.par ?? null;
  const si = (n: number) => holeByNum.get(n)?.handicap ?? null;
  const yds = (n: number) => holeByNum.get(n)?.yardage ?? null;
  const sum = (nums: number[], f: (n: number) => number | null) =>
    nums.reduce((s, n) => s + (f(n) ?? 0), 0);

  const teeNameOf = (playerId: string) =>
    game.course?.teeSets.find((t) => t.id === game.players.find((p) => p.id === playerId)?.teeSetId)?.name ?? null;

  const dateStr = new Date(game.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  // Column classes shared by header + body so everything lines up. OUT/IN/TOT are
  // shaded like a real card; the name column is wider to fit name + tee.
  const holeCell = 'w-[3.9%] text-center border border-gray-300';
  const sumCell = 'w-[4.5%] text-center border border-gray-300 bg-gray-100 font-semibold';
  const nameCell = 'w-[15%] border border-gray-300 px-1';

  return (
    <div className="bg-white shadow print:shadow-none rounded-lg print:rounded-none overflow-hidden border border-gray-300">
      {/* Masthead — green like the club card */}
      <div className="bg-green-800 text-white px-3 py-2 flex items-end justify-between">
        <div>
          <p className="text-base font-bold leading-tight">{game.course?.courseName ?? 'Scorecard'}</p>
          <p className="text-[11px] text-green-200 leading-tight">
            {game.name} · {dateStr}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold leading-tight">{poolTeam?.name}</p>
          {poolTeam?.teeTime && <p className="text-[11px] text-green-200 leading-tight">Tee time {poolTeam.teeTime}</p>}
        </div>
      </div>

      <table className="w-full table-fixed border-collapse text-[10px] leading-none">
        <thead>
          <tr className="bg-green-700 text-white">
            <th className={`${nameCell} text-left py-1 font-semibold`}>Hole</th>
            {FRONT.map((n) => <th key={n} className={`${holeCell} py-1 font-semibold`}>{n}</th>)}
            <th className={`${sumCell} py-1 !text-white !bg-green-900`}>OUT</th>
            {BACK.map((n) => <th key={n} className={`${holeCell} py-1 font-semibold`}>{n}</th>)}
            <th className={`${sumCell} py-1 !text-white !bg-green-900`}>IN</th>
            <th className={`${sumCell} py-1 !text-white !bg-green-900`}>TOT</th>
          </tr>
        </thead>
        <tbody className="text-gray-800">
          {/* Yardage (reference tee) */}
          <tr className="text-gray-500">
            <td className={`${nameCell} py-0.5 text-[9px] font-medium`}>{tee?.name ? `${tee.name} yds` : 'Yards'}</td>
            {FRONT.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{yds(n) ?? ''}</td>)}
            <td className={`${sumCell} py-0.5`}>{sum(FRONT, yds) || ''}</td>
            {BACK.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{yds(n) ?? ''}</td>)}
            <td className={`${sumCell} py-0.5`}>{sum(BACK, yds) || ''}</td>
            <td className={`${sumCell} py-0.5`}>{sum([...FRONT, ...BACK], yds) || ''}</td>
          </tr>
          {/* Par */}
          <tr className="bg-gray-50 font-semibold">
            <td className={`${nameCell} py-0.5`}>Par</td>
            {FRONT.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{par(n) ?? ''}</td>)}
            <td className={`${sumCell} py-0.5`}>{sum(FRONT, par) || ''}</td>
            {BACK.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{par(n) ?? ''}</td>)}
            <td className={`${sumCell} py-0.5`}>{sum(BACK, par) || ''}</td>
            <td className={`${sumCell} py-0.5`}>{sum([...FRONT, ...BACK], par) || ''}</td>
          </tr>
          {/* Handicap (stroke index) */}
          <tr className="text-gray-500">
            <td className={`${nameCell} py-0.5 text-[9px] font-medium`}>Handicap</td>
            {FRONT.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{si(n) ?? ''}</td>)}
            <td className={`${sumCell} py-0.5`} />
            {BACK.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{si(n) ?? ''}</td>)}
            <td className={`${sumCell} py-0.5`} />
            <td className={`${sumCell} py-0.5`} />
          </tr>
          {/* One blank scoring row per player, with stroke dots on stroke holes */}
          {team.players.map((pl) => {
            const strokesOn = (n: number) => pl.holes.find((h) => h.holeNumber === n)?.strokes ?? 0;
            const tn = teeNameOf(pl.playerId);
            return (
              <tr key={pl.playerId} className="h-9">
                <td className={`${nameCell} py-0.5 align-middle`}>
                  <div className="font-semibold text-gray-900 text-[10px] leading-tight truncate">{pl.playerName}</div>
                  {tn && (
                    <div className="mt-0.5 leading-none">
                      <span className="inline-block rounded-sm bg-green-100 text-green-800 font-semibold px-1 py-[1px] text-[8px] whitespace-nowrap">
                        {tn}
                      </span>
                    </div>
                  )}
                </td>
                {FRONT.map((n) => <ScoreBox key={n} className={holeCell} strokes={strokesOn(n)} />)}
                <td className={`${sumCell} bg-gray-50`} />
                {BACK.map((n) => <ScoreBox key={n} className={holeCell} strokes={strokesOn(n)} />)}
                <td className={`${sumCell} bg-gray-50`} />
                <td className={`${sumCell} bg-gray-50`} />
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="px-3 py-1 text-[8px] text-gray-400 border-t border-gray-200">
        • = a stroke on that hole (off each player&apos;s own tee). Best 1 net + 1 gross per foursome.
      </div>
    </div>
  );
}

// A blank box to write a score, with stroke dots pinned to the upper-right. The
// dots live INSIDE the real cell (relative/absolute), so they can never drift out
// of the box the way the old percentage overlay did.
function ScoreBox({ strokes, className }: { strokes: number; className: string }) {
  return (
    <td className={`${className} relative align-middle h-8`}>
      {strokes > 0 && (
        <span className="absolute top-[1px] right-[2px] leading-none text-green-700 font-bold text-[9px]">
          {'•'.repeat(strokes)}
        </span>
      )}
    </td>
  );
}
