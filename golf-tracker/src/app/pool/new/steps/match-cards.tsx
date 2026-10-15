'use client';

import { useState } from 'react';
import type { Player } from '@/lib/game-state';
import { formatHandicap } from '@/lib/game-state';
import { sideNameFrom } from '@/lib/game-modes/team-game';
import { TeeTimePicker } from '@/components/tee-time-picker';

// The match cards (§5.de, layout A of .claude/plans/matchup-visual.md): one card per tee group,
// saying who plays whom. Since §5.dh they are THE team editor on the teams step:
// - a tap only swaps: tap a player, then any other player, and they trade places (across teams too);
// - team names are typed in the legend; the captain wears a "C" (chosen in the Captains panel);
// - team sizes are step 2's, so nothing here adds, removes or resizes a team.
// The handicaps are the game's own playing handicaps (§5.dg), so they match the scorecard. Colours
// are placeholders until the branding session.

const STRIPES = ['border-l-green-600', 'border-l-sky-600', 'border-l-amber-500', 'border-l-fuchsia-600', 'border-l-slate-500', 'border-l-rose-600'];
const DOTS = ['bg-green-600', 'bg-sky-600', 'bg-amber-500', 'bg-fuchsia-600', 'bg-slate-500', 'bg-rose-600'];

export interface CardTeam {
  id: string;
  /** What the board calls the team: the typed name, else the players' ("Craig & Jym"). */
  name: string;
  /** The typed name, '' when none. */
  typedName: string;
  playerIds: string[];
  captainId?: string;
}
export interface CardGroup { id: string; name: string; playerIds: string[]; singles?: string[][]; teeTime?: string }

/** "8:10 AM" → minutes after midnight; unset or unreadable sorts last. */
function teeMinutes(t: string | undefined): number {
  const m = (t ?? '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return Number.POSITIVE_INFINITY;
  const h = Number(m[1]) % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return h * 60 + Number(m[2]);
}

export function MatchCards({ players, hcapOf, teams, groups, versus, onSwapAction, onTeeTimeAction, onRenameAction }: {
  players: Player[];
  /** The player's playing handicap, exactly as the game computes it (unrounded). */
  hcapOf: (playerId: string) => number;
  /** The money teams, in board order (their colour is their index). */
  teams: CardTeam[];
  /** The tee groups. A team that is its own foursome is one card with one team. */
  groups: CardGroup[];
  /** Two teams in one card play each other ("v"); off when pairs merely share a foursome. */
  versus: boolean;
  onSwapAction: (a: string, b: string) => void;
  onTeeTimeAction: (groupIndex: number, value: string) => void;
  onRenameAction: (teamIndex: number, name: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const teamIndexOf = new Map<string, number>();
  teams.forEach((t, i) => t.playerIds.forEach((id) => teamIndexOf.set(id, i)));
  const captains = new Set(teams.map((t) => t.captainId).filter((id): id is string => !!id));
  const nameOf = (id: string) => sideNameFrom(players, [id], 'x', undefined, true);
  const shown = (id: string) => formatHandicap(Math.round(hcapOf(id)));
  // A team's total is the sum of the numbers on its chips, each what that player plays off, so the
  // legend always adds up to what's shown (F-062: it reads "combined HCP").
  const total = (ids: string[]) => ids.reduce((s, id) => s + Math.round(hcapOf(id)), 0);

  function tap(id: string) {
    if (picked === null) { setPicked(id); return; }
    if (picked !== id) onSwapAction(picked, id);
    setPicked(null);
  }

  function dot(teamIdx: number) {
    return <span className={`inline-block h-2 w-2 shrink-0 rounded-full align-middle ${DOTS[teamIdx % DOTS.length]}`} aria-hidden />;
  }

  function chip(id: string) {
    const on = picked === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => tap(id)}
        aria-pressed={on}
        aria-label={nameOf(id)}
        data-team={teamIndexOf.get(id)}
        className={`rounded-md border px-2 py-1 text-sm min-h-[36px] ${
          on ? 'border-green-700 bg-green-700 text-white' : 'border-gray-300 bg-white text-gray-900 hover:border-green-500'
        }`}
      >
        {captains.has(id) && (
          <span className={`mr-1 rounded-full px-1 text-[10px] font-bold ${on ? 'bg-white text-green-800' : 'bg-green-700 text-white'}`} title="Captain">C</span>
        )}
        {nameOf(id)} <span className={on ? 'text-green-100' : 'text-gray-500'}>{shown(id)}</span>
      </button>
    );
  }

  // As the design note reads it: the side with the higher handicap total, and by how much.
  function balance(aIdx: number, a: string[], bIdx: number, b: string[]) {
    const d = total(a) - total(b);
    if (d === 0) return 'even';
    return <>{dot(d > 0 ? aIdx : bIdx)} +{Math.abs(d)}</>;
  }

  // Cards follow the tee sheet's order once times are set (unset last, else as built).
  const order = groups.map((g, i) => ({ g, i })).sort((x, y) => teeMinutes(x.g.teeTime) - teeMinutes(y.g.teeTime) || x.i - y.i);

  return (
    <div className="space-y-3" data-testid="match-cards">
      {/* The legend: each team's colour, its name (typed here) and its combined HCP. */}
      <div className="space-y-1.5" data-testid="team-totals">
        {teams.map((t, i) => (
          <div key={t.id} className="flex items-center gap-2">
            {dot(i)}
            <input
              type="text"
              value={t.typedName}
              placeholder={t.name}
              aria-label={`Team ${i + 1} name`}
              onChange={(e) => onRenameAction(i, e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-semibold shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <span className="shrink-0 text-xs text-gray-600">combined HCP {formatHandicap(total(t.playerIds))}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        {picked ? `Now tap who ${nameOf(picked)} swaps with.` : 'Tap two players to swap them.'}
      </p>
      {order.map(({ g, i: gi }) => {
        // A card's rows: each stored single (one v one), else each team present, in order.
        const present = [...new Set(g.playerIds.map((id) => teamIndexOf.get(id) ?? -1))].filter((t) => t >= 0);
        const rows = present.map((t) => ({ t, ids: g.playerIds.filter((id) => teamIndexOf.get(id) === t) }));
        const vsRows = versus && rows.length === 2;
        return (
          <div key={g.id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm" data-testid="match-card">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-900">{g.name}</span>
              <TeeTimePicker value={g.teeTime ?? ''} onChangeAction={(v) => onTeeTimeAction(gi, v)} />
            </div>
            {g.singles && g.singles.length > 0 ? (
              <div className="space-y-2">
                {g.singles.map(([x, y]) => (
                  <div key={`${x}-${y}`} className="flex flex-wrap items-center gap-1" data-testid="card-single">
                    {dot(teamIndexOf.get(x) ?? 0)}
                    {chip(x)}
                    <span className="px-1 text-xs text-gray-400">v</span>
                    {dot(teamIndexOf.get(y) ?? 0)}
                    {chip(y)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {rows.map((r, ri) => (
                  <div key={r.t}>
                    {ri > 0 && vsRows && <p className="pl-3 text-xs text-gray-400">v</p>}
                    <div className={`border-l-4 pl-2 ${STRIPES[r.t % STRIPES.length]}`}>
                      {/* A card that is one whole team says which. */}
                      {rows.length === 1 && <p className="text-xs font-medium text-gray-600">{teams[r.t]?.name}</p>}
                      <div className={`${rows.length === 1 ? 'mt-1 ' : ''}flex flex-wrap gap-1`}>{r.ids.map(chip)}</div>
                    </div>
                  </div>
                ))}
                {vsRows && (
                  <p className="text-right text-xs text-gray-500" data-testid="card-balance">
                    {balance(rows[0].t, rows[0].ids, rows[1].t, rows[1].ids)}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
