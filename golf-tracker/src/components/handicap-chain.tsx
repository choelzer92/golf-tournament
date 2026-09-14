'use client';

import { useState, type ReactNode } from 'react';
import type { Player, CourseSelection } from '@/lib/game-state';
import { explainPlayingHandicap } from '@/lib/pool-game';

// F-043 — a handicap chip that shows its work. The number a golfer sees on the
// teams/sides/field screens is the END of a chain (index → course handicap →
// allowance → rounded once) that nowhere used to show, so verifying it against
// the GHIN app (§5.ba — the reference) meant trusting us. Tapping the chip opens
// the chain, one line per step, straight from explainPlayingHandicap — which a
// unit test pins to getPoolPlayingHandicap, so this can never show different math
// than the game charges.
//
// Rendered from inline-safe elements only (button + spans), so it can sit inside
// a <p> or a flex row. The open panel is a block/basis-full span: in a flex-wrap
// row it drops to its own line; inside a text cell it stacks under the chip.
export function HandicapChip({
  player, course, allowance, basis, nine, chipClassName, children,
}: {
  player: Player;
  course: CourseSelection | null;
  allowance: number;
  basis: 'course' | 'index';
  nine?: 'front9' | 'back9' | null;
  /** Chip styling, so each surface keeps its existing look. */
  chipClassName?: string;
  /** Chip content; defaults to the rounded playing handicap. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const chain = explainPlayingHandicap(player, course, allowance, basis, nine);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="How this number is calculated"
        className={chipClassName ?? 'flex-shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-semibold text-gray-700 tabular-nums'}
      >
        {children ?? chain.playsOff}
      </button>
      {open && (
        <span className="block basis-full w-full min-w-56 max-w-[85vw] mt-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-left font-normal normal-case">
          {chain.steps.map((s, i) => (
            <span key={i} className="flex items-baseline justify-between gap-3 py-0.5">
              <span className="text-[11px] leading-snug text-gray-500">{s.label}</span>
              <span className="text-xs font-medium text-gray-700 tabular-nums whitespace-nowrap">{s.value}</span>
            </span>
          ))}
          <span className="flex items-baseline justify-between gap-3 py-0.5 border-t border-gray-200 mt-0.5 pt-1">
            <span className="text-[11px] font-semibold text-gray-700">Plays off</span>
            <span className="text-xs font-bold text-gray-900 tabular-nums">{chain.playsOff}</span>
          </span>
          {chain.note && <span className="block text-[11px] text-amber-700 mt-1">{chain.note}</span>}
        </span>
      )}
    </>
  );
}
