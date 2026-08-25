'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { PoolGame } from '@/lib/pool-game';
import { loadPoolGame, fetchPoolGame, computePoolPlayerDetails } from '@/lib/pool-game';
import { getGameMode } from '@/lib/game-modes';
import { sidesOfGame, sideOfPlayer } from '@/lib/game-modes/sides';
import { sideNameFrom } from '@/lib/game-modes/team-game';

// A clean teams sheet the organizer can screenshot or print and send out —
// replacing the spreadsheet he used to make by hand. Foursomes in their set
// send-out order, each with its tee time and players listed low→high with the
// STROKES they get for this game (allowance + off-the-low applied — the low man
// shows 0). Deliberately plain so it looks good as a phone screenshot.
//
// F-019: for a SIDE game this sheet has to carry BOTH axes, because they're
// independent and the sheet is what goes to the people who aren't holding the
// phone. Craig, looking at the 3-side version: "Shouldnt we break down the teams
// sheet by tee time/teams?" — the groups were there, the sides were not, so the
// sheet showed who walks together and said nothing about who's playing whom.
// Each name now carries its side, and a SIDES block lists them, so a partner in
// the other foursome is visible rather than implied.

export default function PoolTeamsPage() {
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

  // Strokes RECEIVED this game per player (not raw course handicap): sum each
  // player's per-hole strokes from the pool detail, which already applies the
  // handicap allowance and off-the-low baseline — matching the hub + scorecard.
  const strokesByPlayer = useMemo(() => {
    const map = new Map<string, number>();
    if (!game) return map;
    for (const team of computePoolPlayerDetails(game, new Map())) {
      for (const pl of team.players) {
        map.set(pl.playerId, pl.holes.reduce((s, h) => s + h.strokes, 0));
      }
    }
    return map;
  }, [game]);

  if (!game) return null;

  const course = game.course;
  const dateStr = new Date(game.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const teeNameOf = (playerId: string) =>
    course?.teeSets.find((t) => t.id === game.players.find((p) => p.id === playerId)?.teeSetId)?.name?.replace(/\s*\(w\)\s*$/i, '').trim() ?? null;

  // The MONEY axis, for a side game only. A classic pool has no sides and gets exactly the sheet
  // it always had.
  const isSideGame = getGameMode(game.gameMode)?.category === 'team-within-group';
  const sides = isSideGame ? sidesOfGame(game) : [];
  const sideNameOf = (sideId: string) => {
    const s = sides.find((x) => x.id === sideId);
    return s ? sideNameFrom(game.players, s.playerIds, s.id, s.name) : null;
  };
  // Which side a player is on, or null for a guest playing no money (F-019 supports that).
  const sideLabelFor = (playerId: string) => {
    const s = sideOfPlayer(sides, playerId);
    return s ? sideNameOf(s.id) : null;
  };

  // A group is a "foursome" only when it holds four. §5.al + UI_CONVENTIONS §2: never print
  // "foursome" for a group that isn't one — a threesome called a foursome makes a golfer distrust
  // the whole sheet. A side game says "groups" throughout, since its money unit is the side.
  const groupCount = game.teams.length;
  const allFour = game.teams.every((t) => t.playerIds.length === 4);
  const groupWord = isSideGame || !allFour
    ? `group${groupCount === 1 ? '' : 's'}`
    : `foursome${groupCount === 1 ? '' : 's'}`;
  const anyCaptain = game.teams.some((t) => t.captainId);

  return (
    <div className="min-h-full bg-gray-100">
      <style>{`@media print { @page { size: portrait; margin: 0.4in; } body { background: white; } }`}</style>

      {/* Toolbar (hidden on print/screenshot) */}
      <div className="print:hidden bg-green-800 text-white">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{game.name} — Teams</h1>
            <p className="text-xs text-green-200">Screenshot or print to send out</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} className="rounded-md bg-white text-green-800 px-4 py-1.5 text-sm font-semibold hover:bg-green-50">Print</button>
            <button onClick={() => router.push(`/pool/${id}`)} className="text-sm text-green-200 hover:text-white">Back</button>
          </div>
        </div>
      </div>

      <div className="mx-auto p-3 print:p-0">
        {/* Sheet header */}
        <div className="mb-3 border-b-2 border-gray-800 pb-2">
          <h2 className="text-lg font-bold text-gray-900">{game.name}</h2>
          <p className="text-xs text-gray-600">
            {course?.courseName ?? ''}{course?.courseName ? ' · ' : ''}{dateStr}
          </p>
        </div>

        {game.teams.length === 0 ? (
          <p className="text-center text-gray-500 py-10">No foursomes set yet.</p>
        ) : (
          // All foursomes side by side so one screenshot captures every team.
          // 2-up on a phone (a 4-foursome pool becomes a tidy 2×2), more columns
          // as the screen widens.
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 items-start">
            {game.teams.map((team) => {
              // Captain first, then by strokes received this game (low→high).
              const orderedIds = [...team.playerIds].sort((a, b) => {
                if (a === team.captainId) return -1;
                if (b === team.captainId) return 1;
                return (strokesByPlayer.get(a) ?? 0) - (strokesByPlayer.get(b) ?? 0);
              });
              return (
                <div key={team.id} className="rounded-lg border border-gray-300 bg-white overflow-hidden" style={{ breakInside: 'avoid' }}>
                  <div className="px-2 py-1 bg-gray-100 border-b border-gray-300">
                    <p className="font-bold text-gray-900 text-sm leading-tight truncate">{team.name}</p>
                    {team.teeTime && <p className="text-xs font-semibold text-gray-600 leading-tight">{team.teeTime}</p>}
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {orderedIds.map((pid) => {
                      const p = game.players.find((x) => x.id === pid);
                      if (!p) return null;
                      const strokes = strokesByPlayer.get(pid) ?? 0;
                      const tn = teeNameOf(pid);
                      const isCaptain = pid === team.captainId;
                      // F-019: the player's SIDE, printed on their row. Without it the sheet shows
                      // only who walks together, and the money grouping — the thing the group
                      // actually argues about — is invisible on the page that gets sent out.
                      const sideLabel = sideLabelFor(pid);
                      return (
                        <li key={pid} className="flex items-baseline gap-1 px-2 py-1">
                          <span className="flex-1 min-w-0 text-xs text-gray-900 truncate">
                            {isCaptain && <span className="mr-0.5 font-bold text-green-700" title="Captain">(C)</span>}
                            {p.name}
                            {sideLabel && (
                              <span className="ml-1 text-[9px] text-gray-500" title="Side">{sideLabel}</span>
                            )}
                          </span>
                          {tn && <span className="text-[9px] text-gray-400 flex-shrink-0">{tn}</span>}
                          <span className="flex-shrink-0 text-xs font-semibold text-gray-700 tabular-nums" title="Strokes received this game">
                            {strokes}
                          </span>
                        </li>
                      );
                    })}
                    {orderedIds.length === 0 && <li className="px-2 py-1 text-[10px] text-gray-400">No players.</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {/* THE MONEY AXIS, as its own block (F-019). The boxes above say who WALKS together; this
            says who's PLAYING each other, and the two need not line up — a partner is often in the
            other group, which is exactly what a sheet organised only by tee time can't show.
            Absent for a classic pool, which has no sides. */}
        {sides.length > 0 && (
          <div className="mt-3 rounded-lg border border-gray-300 bg-white overflow-hidden" style={{ breakInside: 'avoid' }}>
            <div className="px-2 py-1 bg-gray-100 border-b border-gray-300">
              <p className="font-bold text-gray-900 text-sm leading-tight">Sides</p>
              <p className="text-[9px] text-gray-500 leading-tight">Who plays whom — partners may be in different groups.</p>
            </div>
            <ul className="divide-y divide-gray-100">
              {sides.map((side) => {
                // Which group each member walks with, so a crossing side reads at a glance.
                const members = side.playerIds.map((pid) => {
                  const p = game.players.find((x) => x.id === pid);
                  const gi = game.teams.findIndex((t) => t.playerIds.includes(pid));
                  return { name: p?.name ?? 'Unknown', group: gi >= 0 ? game.teams[gi].name : null };
                });
                return (
                  <li key={side.id} className="px-2 py-1">
                    <p className="text-xs font-semibold text-gray-900">{sideNameOf(side.id)}</p>
                    <p className="text-[10px] text-gray-600">
                      {members.map((m, i) => (
                        <span key={i}>
                          {i > 0 && ' · '}
                          {m.name}
                          {/* Only worth printing when there IS more than one group. */}
                          {game.teams.length > 1 && m.group && (
                            <span className="text-gray-400"> ({m.group})</span>
                          )}
                        </span>
                      ))}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Anyone in a group but on no side — a guest along for the round, not the money (F-019).
            Named explicitly so nobody wonders whether the sheet forgot them. */}
        {sides.length > 0 && (() => {
          const onASide = new Set(sides.flatMap((s) => s.playerIds));
          const guests = game.players.filter((p) => !onASide.has(p.id));
          if (guests.length === 0) return null;
          return (
            <p className="mt-1.5 text-[10px] text-gray-500">
              Playing along, not on a side: {guests.map((p) => p.name).join(', ')}
            </p>
          );
        })()}

        <p className="mt-3 text-[10px] text-gray-400">
          {game.players.length} players · {groupCount} {groupWord}
          {anyCaptain && ' · (C) = captain'}
          {' · number after each name = strokes this game'}
        </p>
      </div>
    </div>
  );
}
