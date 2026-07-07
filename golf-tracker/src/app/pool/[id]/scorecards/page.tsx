'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { PoolGame, PoolTeamDetail } from '@/lib/pool-game';
import { loadPoolGame, fetchPoolGame, computePoolPlayerDetails, getPoolPlayingHandicap } from '@/lib/pool-game';

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

  // Stroke allocation per player (off their own tee). No scores needed.
  const details = useMemo(() => (game ? computePoolPlayerDetails(game, new Map()) : []), [game]);

  if (!game) return null;

  const holeNums = Array.from({ length: 18 }, (_, i) => i + 1);
  const front = holeNums.slice(0, 9);
  const back = holeNums.slice(9);

  // Par + stroke index come from the course (par is tee-independent; SI shown is
  // the default tee's — each player's dots use their own tee, computed already).
  const tee = game.course?.teeSets.find((t) => t.id === game.course?.selectedTeeId) || game.course?.teeSets[0];
  const holeInfo = new Map((tee?.holes || []).map((h) => [h.number, h]));
  const parOf = (n: number) => holeInfo.get(n)?.par ?? '';
  const sumPar = (nums: number[]) => nums.reduce((s, n) => s + (holeInfo.get(n)?.par ?? 0), 0);

  return (
    <div className="min-h-full bg-gray-100">
      {/* On-screen toolbar (hidden when printing) */}
      <div className="print:hidden bg-green-800 text-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{game.name} — Scorecards</h1>
            <p className="text-xs text-green-200">{game.teams.length} foursome{game.teams.length === 1 ? '' : 's'} · one card per page</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} className="rounded-md bg-white text-green-800 px-4 py-1.5 text-sm font-semibold hover:bg-green-50">
              Print
            </button>
            <button onClick={() => router.push(`/pool/${id}`)} className="text-sm text-green-200 hover:text-white">Back</button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 pb-3 text-xs text-green-100">
          Dots (● / ●●) mark the holes each player receives a stroke, based on their tee. Boxes are blank to write scores.
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-6 print:space-y-0 print:p-0">
        {details.map((team, idx) => {
          const poolTeam = game.teams.find((t) => t.id === team.teamId);
          return (
            <div key={team.teamId} className={`bg-white rounded-lg shadow print:shadow-none print:rounded-none ${idx > 0 ? 'print:break-before-page' : ''}`}>
              <Card
                game={game}
                team={team}
                teeTime={poolTeam?.teeTime}
                front={front}
                back={back}
                parOf={parOf}
                sumPar={sumPar}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({
  game, team, teeTime, front, back, parOf, sumPar,
}: {
  game: PoolGame;
  team: PoolTeamDetail;
  teeTime?: string;
  front: number[];
  back: number[];
  parOf: (n: number) => number | string;
  sumPar: (nums: number[]) => number;
}) {
  const teeNameOf = (playerId: string) => {
    const p = game.players.find((x) => x.id === playerId);
    return game.course?.teeSets.find((t) => t.id === p?.teeSetId)?.name ?? '';
  };
  const chcpOf = (playerId: string) => {
    const p = game.players.find((x) => x.id === playerId);
    return p && game.course ? Math.round(getPoolPlayingHandicap(p, game.course, game.handicapAllowance)) : null;
  };
  const strokesOn = (holes: PoolTeamDetail['players'][number]['holes'], n: number) =>
    holes.find((h) => h.holeNumber === n)?.strokes ?? 0;

  // A 9-hole block of columns: hole numbers, par, then a total column.
  const th = 'border border-gray-400 text-center text-[10px] font-semibold px-1 py-0.5';
  const td = 'border border-gray-400 text-center text-xs px-1 py-1 h-7';

  function HoleHeader({ holes, totLabel }: { holes: number[]; totLabel: string }) {
    return (
      <>
        {holes.map((n) => <th key={n} className={`${th} w-7`}>{n}</th>)}
        <th className={`${th} w-9 bg-gray-100`}>{totLabel}</th>
      </>
    );
  }

  return (
    <div className="p-4">
      {/* Header band — recreates the course card masthead */}
      <div className="bg-green-800 text-white rounded-t-md px-4 py-2 flex items-baseline justify-between">
        <div>
          <p className="text-lg font-bold tracking-wide">SPRING CREEK</p>
          <p className="text-[10px] text-green-200 uppercase tracking-widest">Golf Club · Gordonsville, VA</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">{team.teamName}</p>
          {teeTime && <p className="text-[10px] text-green-200">Tee {teeTime}</p>}
        </div>
      </div>

      <table className="w-full border-collapse table-fixed">
        <thead>
          {/* Front nine header */}
          <tr className="bg-green-50">
            <th className={`${th} text-left w-40`}>HOLE</th>
            <HoleHeader holes={front} totLabel="OUT" />
            <HoleHeader holes={back} totLabel="IN" />
            <th className={`${th} w-10 bg-gray-200`}>TOT</th>
          </tr>
          <tr>
            <th className={`${th} text-left`}>PAR</th>
            {front.map((n) => <th key={n} className={th}>{parOf(n)}</th>)}
            <th className={`${th} bg-gray-100`}>{sumPar(front)}</th>
            {back.map((n) => <th key={n} className={th}>{parOf(n)}</th>)}
            <th className={`${th} bg-gray-100`}>{sumPar(back)}</th>
            <th className={`${th} bg-gray-200`}>{sumPar([...front, ...back])}</th>
          </tr>
        </thead>
        <tbody>
          {team.players.map((pl) => {
            const tn = teeNameOf(pl.playerId);
            const chcp = chcpOf(pl.playerId);
            const cell = (n: number) => {
              const s = strokesOn(pl.holes, n);
              return (
                <td key={n} className={td}>
                  {s > 0 && <span className="text-green-700 font-bold align-top text-[9px] leading-none">{'•'.repeat(s)}</span>}
                </td>
              );
            };
            return (
              <tr key={pl.playerId}>
                <td className="border border-gray-400 px-1 py-1 h-7 text-xs">
                  <span className="font-semibold text-gray-900">{pl.playerName}</span>
                  <span className="text-[9px] text-gray-500 ml-1">{tn}{chcp !== null ? ` (${chcp})` : ''}</span>
                </td>
                {front.map(cell)}
                <td className={`${td} bg-gray-50`}></td>
                {back.map(cell)}
                <td className={`${td} bg-gray-50`}></td>
                <td className={`${td} bg-gray-100`}></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-[9px] text-gray-400 mt-1">
        {game.handicapAllowance}% handicap{game.strokeMethod === 'off-the-low' ? ' · off the low' : ''} · dots mark strokes received (off each player&apos;s tee)
      </p>
    </div>
  );
}
