'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { PoolGame, PoolTeamDetail } from '@/lib/pool-game';
import type { TeeSetOption } from '@/lib/game-state';
import { loadPoolGame, fetchPoolGame, computePoolPlayerDetails, distinctRankingsForPlayers } from '@/lib/pool-game';

// Fully DRAWN scorecard — a real HTML grid where every value (par, stroke index,
// stroke dots, blank score boxes) lives inside a real table cell, so nothing can
// misalign the way the old PDF-overlay approach did on iOS Safari. It's styled to
// look like a real club card (green masthead, Hole / OUT / IN / TOTAL columns,
// Yardage / Par / Handicap rows, blank player rows) and is built from the course's
// own GHIN tee data, so it works at any course. Two cards per printed page.

const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];

// Group the foursomes into pairs so each printed page holds exactly two cards.
// Pairing at the data level (rather than a per-card page-break rule) is what makes
// "2 per page" reliable in landscape: we force a page break AFTER each pair, so the
// browser can never decide to fit only one.
function chunkPairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

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

  const pages = chunkPairs(details);

  return (
    <div className="min-h-full bg-gray-200">
      {/*
        Print LANDSCAPE with exactly two cards per page. The reliable recipe here
        is: group the foursomes into PAIRS, force a page break AFTER each pair, and
        keep each card intact (break-inside: avoid). We deliberately do NOT pin the
        pair to a fixed height (e.g. 100vh) — in print that can measure slightly
        taller than the printable area and shove the 2nd card onto its own page,
        which is exactly the "only one per page" bug the user hit. Two compact
        landscape cards fit a sheet on their own, so natural height is both correct
        and safe. Legacy `page-break-*` aliases included for Safari.
      */}
      <style>{`
        @media print {
          @page { size: landscape; margin: 0.3in; }
          body { background: white; }
          .sc-page { break-after: page; page-break-after: always; break-inside: avoid; page-break-inside: avoid; }
          .sc-page:last-child { break-after: auto; page-break-after: auto; }
          .sc-slot { break-inside: avoid; page-break-inside: avoid; }
          .sc-slot + .sc-slot { margin-top: 0.22in; }
        }
      `}</style>

      {/* Toolbar (hidden on print) */}
      <div className="print:hidden bg-green-800 text-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{game.name} — Scorecards</h1>
            <p className="text-xs text-green-200">
              {game.teams.length} foursome{game.teams.length === 1 ? '' : 's'} · 2 cards per page (landscape)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} className="rounded-md bg-white text-green-800 px-4 py-1.5 text-sm font-semibold hover:bg-green-50">Print</button>
            <button onClick={() => router.push(`/pool/${id}`)} className="text-sm text-green-200 hover:text-white">Back</button>
          </div>
        </div>
      </div>

      {/* On-screen tip so it's obvious the printout is set up for landscape. */}
      <div className="print:hidden max-w-5xl mx-auto px-4 pt-3">
        <p className="text-xs text-gray-500">
          Set your print dialog to <span className="font-semibold text-gray-700">Landscape</span> — the page is laid out for two cards per sheet.
        </p>
      </div>

      <div className="max-w-5xl mx-auto p-3 space-y-4 print:p-0 print:space-y-0 print:max-w-none">
        {pages.length === 0 ? (
          <p className="text-center text-gray-500 py-10 bg-white rounded-lg">No foursomes to print yet.</p>
        ) : (
          pages.map((pair, pageIdx) => (
            <div key={pageIdx} className="sc-page space-y-4 print:space-y-0">
              {pair.map((team) => (
                <div key={team.teamId} className="sc-slot">
                  <DrawnScorecard game={game} team={team} />
                </div>
              ))}
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

  // Short tee label — strip a trailing "(W)" so men's/women's versions of the
  // same tee share one label (their yardages are identical).
  const shortName = (name: string) => name.replace(/\s*\(w\)\s*$/i, '').trim();

  // Yardage rows: dedupe by the actual yardage sequence. A men's tee and its
  // women's counterpart (e.g. "3 Stars" / "3 Stars (W)") have IDENTICAL yardages,
  // so they collapse into one row (labeled "3 Stars"); genuinely different tee
  // lengths still get their own row.
  const yardageGroups: { tee: TeeSetOption; names: string[] }[] = [];
  {
    const byKey = new Map<string, number>();
    for (const t of tees) {
      const key = [...t.holes].sort((a, b) => a.number - b.number).map((h) => h.yardage).join(',');
      const idx = byKey.get(key);
      if (idx != null) {
        const base = shortName(t.name);
        if (!yardageGroups[idx].names.includes(base)) yardageGroups[idx].names.push(base);
      } else {
        byKey.set(key, yardageGroups.length);
        yardageGroups.push({ tee: t, names: [shortName(t.name)] });
      }
    }
  }

  // Handicap rankings differ by gender even when yardage doesn't, so DEDUPE them
  // separately to distinct rankings (labeled "Men"/"Women" when clean). Spring
  // Creek → one "Men" ranking + one "Women".
  const rankings = distinctRankingsForPlayers(game, team.players.map((p) => p.playerId));

  // Par comes off any tee (par is identical across tees on a course).
  const parByNum = new Map((tees[0]?.holes ?? []).map((h) => [h.number, h.par]));
  const par = (n: number) => parByNum.get(n) ?? null;
  const sum = (nums: number[], f: (n: number) => number | null) =>
    nums.reduce((s, n) => s + (f(n) ?? 0), 0);

  const teeNameOf = (playerId: string) =>
    game.course?.teeSets.find((t) => t.id === game.players.find((p) => p.id === playerId)?.teeSetId)?.name ?? null;

  const dateStr = new Date(game.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  // Column classes shared by header + body so everything lines up. Print-friendly:
  // light gray shading only (no color), thin borders. Name column is wider.
  const holeCell = 'w-[3.9%] text-center border border-gray-400';
  const sumCell = 'w-[4.5%] text-center border border-gray-400 bg-gray-100 font-semibold';
  const nameCell = 'w-[15%] border border-gray-400 px-1';

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

      {/* An 18-hole card is inherently wide. On a narrow phone it would squeeze
          the columns until yardages wrap and the grid looks jumbled, so give it a
          real minimum width and let the screen scroll sideways — legible, and it
          matches the printout. On print, drop the min-width so it lays out to the
          full page (where every column has ample room). */}
      <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[44rem] print:min-w-0 table-fixed border-collapse text-[10px] leading-none">
        <thead>
          {/* Faint-gray header (not black) so it's cheap to print repeatedly. */}
          <tr className="bg-gray-100 text-gray-900">
            <th className={`${nameCell} text-left py-1 font-semibold`}>Hole</th>
            {FRONT.map((n) => <th key={n} className={`${holeCell} py-1 font-semibold`}>{n}</th>)}
            <th className={`${sumCell} py-1 !bg-gray-200`}>OUT</th>
            {BACK.map((n) => <th key={n} className={`${holeCell} py-1 font-semibold`}>{n}</th>)}
            <th className={`${sumCell} py-1 !bg-gray-200`}>IN</th>
            <th className={`${sumCell} py-1 !bg-gray-200`}>TOT</th>
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
          {/* A yardage row per distinct tee length (men's + women's versions of a
              tee share yardage, so they collapse into one labeled row). */}
          {yardageGroups.map(({ tee: t, names }) => {
            const byNum = new Map(t.holes.map((h) => [h.number, h]));
            const yds = (n: number) => byNum.get(n)?.yardage ?? null;
            return (
              <tr key={t.id} className="text-gray-600">
                <td className={`${nameCell} py-0.5 text-[9px] font-semibold`}>{names.join(' / ')} · yds</td>
                {FRONT.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{yds(n) ?? ''}</td>)}
                <td className={`${sumCell} py-0.5`}>{sum(FRONT, yds) || ''}</td>
                {BACK.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{yds(n) ?? ''}</td>)}
                <td className={`${sumCell} py-0.5`}>{sum(BACK, yds) || ''}</td>
                <td className={`${sumCell} py-0.5`}>{sum([...FRONT, ...BACK], yds) || ''}</td>
              </tr>
            );
          })}
          {/* Handicap (stroke-index) rows — deduped to distinct rankings, so
              Spring Creek shows just "Men" and "Women" rather than one per tee. */}
          {rankings.map((r) => {
            const si = (n: number) => r.strokeIndexByHole[n] ?? null;
            return (
              <tr key={r.label} className="text-gray-500">
                <td className={`${nameCell} py-0.5 text-[9px] font-medium`}>{r.label} · hcp</td>
                {FRONT.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{si(n) ?? ''}</td>)}
                <td className={`${sumCell} py-0.5`} />
                {BACK.map((n) => <td key={n} className={`${holeCell} py-0.5`}>{si(n) ?? ''}</td>)}
                <td className={`${sumCell} py-0.5`} />
                <td className={`${sumCell} py-0.5`} />
              </tr>
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
                    <div className="text-[8px] text-gray-500 font-medium leading-tight truncate">{shortName(tn)}{game.players.find((p) => p.id === pl.playerId)?.gender === 'F' ? ' (W)' : ''}</div>
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
      </div>

      <div className="px-3 py-1 text-[8px] text-gray-500 border-t border-gray-300">
        • = a stroke on that hole (off each player&apos;s own tee). Best 1 net + 1 gross per foursome.
      </div>
    </div>
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
