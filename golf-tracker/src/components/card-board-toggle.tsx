'use client';

import { useRouter } from 'next/navigation';

// F-030: the scorecard ↔ leaderboard switch was a low-contrast text link in each
// header's corner, visually identical to "Back" beside it — mechanically 1 tap each
// way with state preserved, but nothing signaled it was the primary toggle (Craig:
// "it isn't intuitive to switch back and forth… a cleaner button to switch"). One
// segmented pill, same position and look on BOTH screens, so the pair reads as two
// views of one game rather than two pages that happen to link to each other.
//
// A gesture (swipe) was considered and rejected: swipe already means prev/next hole
// on the card, and an invisible affordance can't fix a discoverability finding.

export function CardBoardToggle({ active, cardHref, boardHref }: {
  active: 'card' | 'board';
  cardHref: string;
  boardHref: string;
}) {
  const router = useRouter();
  // Colors are neutral (white-on-translucent) so the pill sits on the scorecard's
  // green header and the leaderboard's gray one without a per-surface variant.
  const seg = (isActive: boolean) =>
    `px-2.5 py-1 text-xs font-medium rounded-full transition ${
      isActive ? 'bg-white text-gray-900' : 'text-white/80 hover:text-white'
    }`;
  return (
    <div className="flex items-center rounded-full bg-black/25 p-0.5" role="tablist" aria-label="Card or standings">
      <button role="tab" aria-selected={active === 'card'} className={seg(active === 'card')}
        onClick={() => { if (active !== 'card') router.push(cardHref); }}>
        Card
      </button>
      <button role="tab" aria-selected={active === 'board'} className={seg(active === 'board')}
        onClick={() => { if (active !== 'board') router.push(boardHref); }}>
        Standings
      </button>
    </div>
  );
}
