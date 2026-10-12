'use client';

// The event a round belongs to (§5.cv), shown on that round's hub: which round this is, one
// tap to the event's standings, and, for the organizer, "+ Add round N" (Q4: on every round's
// hub, live or finished). Never rendered on an ordinary game.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hydratePoolGames, getSeriesRounds, type PoolGame } from '@/lib/pool-game';
import { RERUN_SEED_KEY, EVENT_SEED_KEY, type EventSeed } from '@/lib/group-seed';

/** "+ Add round N": the round to copy goes in as a Run it back (§5.cm), plus the event. */
export function startNextRound(router: ReturnType<typeof useRouter>, copyFromGameId: string, seriesId: string) {
  // A stale wizard draft must not mix into the new round.
  sessionStorage.removeItem('pool_wizard_draft');
  sessionStorage.setItem(RERUN_SEED_KEY, copyFromGameId);
  const seed: EventSeed = { mode: 'add', seriesId };
  sessionStorage.setItem(EVENT_SEED_KEY, JSON.stringify(seed));
  router.push('/pool/new');
}

export function EventBanner({ game, organizer }: { game: PoolGame; organizer: boolean }) {
  const router = useRouter();
  const [rounds, setRounds] = useState<PoolGame[]>([]);
  const seriesId = game.series?.id;

  useEffect(() => {
    if (!seriesId) return;
    setRounds(getSeriesRounds(seriesId));
    hydratePoolGames().then(() => setRounds(getSeriesRounds(seriesId))).catch(() => {});
  }, [seriesId, game.status]);

  if (!game.series || !seriesId) return null;
  const count = Math.max(rounds.length, 1);
  const index = rounds.findIndex((r) => r.id === game.id);
  const latest = rounds[rounds.length - 1]?.series?.name ?? game.series.name;

  return (
    <section className="rounded-lg border border-green-200 bg-green-50 px-4 py-3" data-testid="event-banner">
      <p className="text-xs font-medium uppercase tracking-wide text-green-800">Event</p>
      <p className="text-sm font-semibold text-gray-900">
        {latest} · Round {index >= 0 ? index + 1 : game.series.seq} of {count}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => router.push('/event/' + seriesId)}
          className="rounded-md border border-green-700 bg-white px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100"
        >
          Event standings
        </button>
        {organizer && (
          <button
            type="button"
            onClick={() => startNextRound(router, game.id, seriesId)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:border-green-400"
          >
            + Add round {count + 1}
          </button>
        )}
      </div>
    </section>
  );
}
