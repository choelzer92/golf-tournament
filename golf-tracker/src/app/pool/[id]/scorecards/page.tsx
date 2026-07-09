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

// The distinct tees actually being played in this foursome, most-used first
// (tie-break: longer yardage first). Men's and women's tees differ in BOTH
// yardage and hole handicap, so the card prints a yardage row and a handicap
// row for each — not just one. Falls back to the course default tee for any
// player who has none. (Stroke DOTS are computed off each player's own tee.)
function groupTees(game: PoolGame, playerIds: string[]): TeeSetOption[] {
  const tees = game.course?.teeSets ?? [];
  if (tees.length === 0) return [];
  const byId = new Map(tees.map((t) => [t.id, t]));
  const fallbackId = game.course?.selectedTeeId ?? tees[0]?.id ?? null;
  const counts = new Map<number, number>();
  for (const pid of playerIds) {
    const teeId = game.players.find((p) => p.id === pid)?.teeSetId;
    const id = teeId != null && byId.has(teeId) ? teeId : fallbackId;
    if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const used = [...counts.keys()].map((id) => byId.get(id)).filter((t): t is TeeSetOption => !!t);
  used.sort((a, b) => (counts.get(b.id)! - counts.get(a.id)!) || (b.totalYardage - a.totalYardage));
  return used;
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
  const tees = groupTees(game, team.players.map((p) => p.playerId));

  // Par comes off any tee (par is identical across tees on a course).
  const parByNum = new Map((tees[0]?.holes ?? []).map((h) => [h.number, h.par]));
  const par = (n: number) => parByNum.get(n) ?? null;
  const sum = (nums: number[], f: (n: number) => number | null) =>
    nums.reduce((s, n) => s + (f(n) ?? 0), 0);

  // Short tee label for the yardage/handicap row headers and the player pills —
  // strips a trailing "(W)" the wizard appended so the row reads cleanly.
  const shortTee = (name: string) => name.replace(/\s*\(w\)\s*$/i, '').trim();
  const teeNameOf = (playerId: string) =>
    game.course?.teeSets.find((t) => t.id === game.players.find((p) => p.id === playerId)?.teeSetId)?.name ?? null;

  const dateStr = new Date(game.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  // Column classes shared by header + body so everything lines up. Print-friendly:
  // light gray shading only (no color), thin borders. Name column is wider.
  const holeCell = 'w-[3.9%] text-center border border-gray-400';
  const sumCell = 'w-[4.5%] text-center border border-gray-400 bg-gray-100 font-semibold';
  const nameCell = 'w-[15%] border border-gray-400 px-1';

  const teeLabel = (t: TeeSetOption) => `${shortTee(t.name)}${t.gender === 'F' ? ' (W)' : ''}`;

  return (
    <div className="bg-white shadow print:shadow-none rounded-lg print:rounded-none overflow-hidden border border-gray-400">
      {/* Masthead — plain (print-friendly, no color fill) */}
      <div className="px-3 py-2 flex items-end justify-between border-b-2 border-gray-800">
        <div>
          <p className="text-base font-bold leading-tight text-gray-900">{game.course?.courseName ?? 'Scorecard'}</p>
          <p className="text-[11px] text-gray-500 leading-tight">{game.name} · {dateStr}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold leading-tight text-gray-900">{poolTeam?.name}</p>
          {poolTeam?.teeTime && <p className="text-[11px] text-gray-500 leading-tight">Tee time {poolTeam.teeTime}</p>}
        </div>
      </div>

      <table className="w-full table-fixed border-collapse text-[10px] leading-none">
        <thead>
          <tr className="bg-gray-800 text-white">
            <th className={`${nameCell} text-left py-1 font-semibold border-gray-800`}>Hole</th>
            {FRONT.map((n) => <th key={n} className={`${holeCell} py-1 font-semibold border-gray-700`}>{n}</th>)}
            <th className={`${sumCell} py-1 !bg-gray-900 !text-white border-gray-900`}>OUT</th>
            {BACK.map((n) => <th key={n} className={`${holeCell} py-1 font-semibold border-gray-700`}>{n}</th>)}
            <th className={`${sumCell} py-1 !bg-gray-900 !text-white border-gray-900`}>IN</th>
            <th className={`${sumCell} py-1 !bg-gray-900 !text-white border-gray-900`}>TOT</th>
          </tr>
        </thead>
        <tbody className="text-gray-800">
          {/* Par (identical across tees) */}
          <tr className="bg-gray-50 font-semibold">
            <td className={`${nameCell} py-0.5`}>Par</td>
            {FRONT.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{par(n) ?? ''}</td>)}
            <td className={`${sumCell} py-0.5`}>{sum(FRONT, par) || ''}</td>
            {BACK.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{par(n) ?? ''}</td>)}
            <td className={`${sumCell} py-0.5`}>{sum(BACK, par) || ''}</td>
            <td className={`${sumCell} py-0.5`}>{sum([...FRONT, ...BACK], par) || ''}</td>
          </tr>
          {/* Yardage + Handicap rows for EACH distinct tee/gender in the group */}
          {tees.map((t) => {
            const byNum = new Map(t.holes.map((h) => [h.number, h]));
            const yds = (n: number) => byNum.get(n)?.yardage ?? null;
            const si = (n: number) => byNum.get(n)?.handicap ?? null;
            return (
              <FragmentTeeRows
                key={t.id}
                label={teeLabel(t)}
                yds={yds}
                si={si}
                sum={sum}
                holeCell={holeCell}
                sumCell={sumCell}
                nameCell={nameCell}
              />
            );
          })}
          {/* One blank scoring row per player, with stroke dots on stroke holes */}
          {team.players.map((pl) => {
            const strokesOn = (n: number) => pl.holes.find((h) => h.holeNumber === n)?.strokes ?? 0;
            const tn = teeNameOf(pl.playerId);
            return (
              <tr key={pl.playerId} className="h-9">
                <td className={`${nameCell} py-0.5 align-middle`}>
                  <div className="font-semibold text-gray-900 text-[10px] leading-tight truncate">{pl.playerName}</div>
                  {tn && (
                    <div className="text-[8px] text-gray-500 font-medium leading-tight truncate">{shortTee(tn)}{game.players.find((p) => p.id === pl.playerId)?.gender === 'F' ? ' (W)' : ''}</div>
                  )}
                </td>
                {FRONT.map((n) => <ScoreBox key={n} className={holeCell} strokes={strokesOn(n)} />)}
                <td className={`${sumCell} bg-white`} />
                {BACK.map((n) => <ScoreBox key={n} className={holeCell} strokes={strokesOn(n)} />)}
                <td className={`${sumCell} bg-white`} />
                <td className={`${sumCell} bg-white`} />
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="px-3 py-1 text-[8px] text-gray-500 border-t border-gray-300">
        • = a stroke on that hole (off each player&apos;s own tee). Best 1 net + 1 gross per foursome.
      </div>
    </div>
  );
}

// A yardage row + a handicap (stroke-index) row for one tee. Rendered per
// distinct tee so a mixed men's/women's group sees both sets of numbers.
function FragmentTeeRows({ label, yds, si, sum, holeCell, sumCell, nameCell }: {
  label: string;
  yds: (n: number) => number | null;
  si: (n: number) => number | null;
  sum: (nums: number[], f: (n: number) => number | null) => number;
  holeCell: string;
  sumCell: string;
  nameCell: string;
}) {
  return (
    <>
      <tr className="text-gray-600">
        <td className={`${nameCell} py-0.5 text-[9px] font-semibold`}>{label} · yds</td>
        {FRONT.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{yds(n) ?? ''}</td>)}
        <td className={`${sumCell} py-0.5`}>{sum(FRONT, yds) || ''}</td>
        {BACK.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{yds(n) ?? ''}</td>)}
        <td className={`${sumCell} py-0.5`}>{sum(BACK, yds) || ''}</td>
        <td className={`${sumCell} py-0.5`}>{sum([...FRONT, ...BACK], yds) || ''}</td>
      </tr>
      <tr className="text-gray-500">
        <td className={`${nameCell} py-0.5 text-[9px] font-medium`}>{label} · hcp</td>
        {FRONT.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{si(n) ?? ''}</td>)}
        <td className={`${sumCell} py-0.5`} />
        {BACK.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{si(n) ?? ''}</td>)}
        <td className={`${sumCell} py-0.5`} />
        <td className={`${sumCell} py-0.5`} />
      </tr>
    </>
  );
}

// A blank box to write a score, with stroke dots pinned to the upper-right. The
// dots live INSIDE the real cell (relative/absolute), so they can never drift out
// of the box the way the old percentage overlay did. Dots are black for clean
// printing (no color).
function ScoreBox({ strokes, className }: { strokes: number; className: string }) {
  return (
    <td className={`${className} relative align-middle h-9`}>
      {strokes > 0 && (
        <span className="absolute top-[1px] right-[2px] leading-none text-gray-900 font-bold text-[9px]">
          {'•'.repeat(strokes)}
        </span>
      )}
    </td>
  );
}
