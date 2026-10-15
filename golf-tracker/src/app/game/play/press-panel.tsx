'use client';

import { useState } from 'react';
import { removePressTap, savePressTap, type PoolGame } from '@/lib/pool-game';
import { pressIdOf, type PressLeg, type PressLine, type PressOfferLine } from '@/lib/game-modes/presses';

// PRESSES on the scorecard (DECISIONS.md §5.dj/§5.dk). The scorer taps Press for the side 2 down
// (button mode), sees every press in their match, and can remove one at any time with a note. The
// engine decides everything shown here: which bets can be pressed (`offers`) and how each press
// stands (`presses`), so the card and the money can't disagree.

const LEG_NAME: Record<PressLeg, string> = { front: 'front 9', back: 'back 9', overall: 'overall' };

export function PressPanel({
  game, mode, presses, offers, stakeDivisor, matchIds, onSavedAction,
}: {
  game: PoolGame;
  mode: 'auto' | 'button';
  /** This card's presses (its match's, in a Team → Match game). */
  presses: PressLine[];
  offers: PressOfferLine[];
  /** The stake is per team; divide by this for one player's share (null = say "a team"). */
  stakeDivisor: number | null;
  /** Team → Match: this card's match ids, so another match's removed presses aren't listed. */
  matchIds: string[] | null;
  onSavedAction: (g: PoolGame) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const keyOf = (p: { id: string; match?: string }) => `${p.match ?? ''}|${p.id}`;
  const stake = (dollars: number) => {
    const each = stakeDivisor ? dollars / stakeDivisor : dollars;
    const amount = Number.isInteger(each) ? `$${each}` : `$${each.toFixed(2)}`;
    return `${amount} ${stakeDivisor !== null ? 'a player' : 'a team'}`;
  };
  // Removed presses stay listed for the record ("a press removed" note, §5.dj).
  const removed = (game.presses ?? []).filter((t) => t.removed && (matchIds === null || (t.match !== undefined && matchIds.includes(t.match))));
  if (presses.length === 0 && offers.length === 0 && removed.length === 0) {
    return null;
  }
  return (
    <section aria-label="Presses" className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-gray-900">Presses</p>
        <p className="text-[11px] text-gray-500">{mode === 'auto' ? 'Start automatically at 2 down' : 'The side 2 down can press'}</p>
      </div>
      {offers.length > 0 && (
        <div className="mt-2 space-y-2">
          {offers.map((o) => (
            <button
              key={`${o.match ?? ''}|${o.of}|${o.by}`}
              type="button"
              onClick={() => onSavedAction(savePressTap(game, {
                of: o.of, by: o.by, fromHole: o.fromHole, ...(o.match !== undefined ? { match: o.match } : {}),
              }))}
              className="w-full min-h-[44px] rounded-md border border-green-600 bg-green-50 px-3 py-2 text-left text-sm font-medium text-green-900 hover:bg-green-100"
            >
              {o.label} (holes {o.fromHole}–{o.toHole})
            </button>
          ))}
        </div>
      )}
      {presses.length > 0 && (
        <ul className="mt-2 divide-y divide-gray-100">
          {presses.map((p) => {
            const k = keyOf(p);
            return (
              <li key={k} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-900">{p.label}</span>
                    <span className="text-gray-500"> · {LEG_NAME[p.leg]} · {stake(p.stake)}</span>
                    <span className="block text-xs text-gray-500">Pressed by {p.byName}</span>
                    <span className="block text-xs text-gray-700">{p.voided ? 'Leg voided, pays nothing' : p.status}{p.complete ? ' (final)' : ''}</span>
                  </span>
                  {confirming !== k && (
                    <button type="button" onClick={() => setConfirming(k)}
                      className="flex-shrink-0 min-h-[44px] px-2 text-xs font-medium text-gray-500 hover:text-red-700">
                      Remove
                    </button>
                  )}
                </div>
                {confirming === k && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-gray-600">Remove this press? It and its re-presses pay nothing.</span>
                    <button type="button"
                      onClick={() => { setConfirming(null); onSavedAction(removePressTap(game, p, 'Press removed on the scorecard')); }}
                      className="min-h-[44px] rounded-md border border-red-300 px-2 font-medium text-red-700 hover:bg-red-50">
                      Remove press
                    </button>
                    <button type="button" onClick={() => setConfirming(null)}
                      className="min-h-[44px] px-2 font-medium text-gray-600">
                      Keep
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {removed.length > 0 && (
        <ul className="mt-1 text-[11px] text-gray-400">
          {removed.map((t, i) => (
            <li key={`${t.match ?? ''}|${pressIdOf(t)}|${i}`}>
              A press from hole {t.fromHole} was removed
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
