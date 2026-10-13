'use client';

// "Part of an event?" on the Review step (§5.cv Q2). An event is several ordinary games
// played as one, paying cumulative money at the end (lib/series.ts). The usual answer is No,
// so it's one quiet row until someone opens it; "Start an event" and "Add round N" open it
// already chosen.

import type { SeriesSummary } from '@/lib/series';

export type EventChoice =
  | { kind: 'none' }
  | { kind: 'new'; name: string; date: string }
  | { kind: 'add'; seriesId: string; date: string };
// `date` is '' when not set: a date is OPTIONAL (§5.dc) and only groups the event's columns.

export function EventField({ choice, setChoice, events, defaultName }: {
  choice: EventChoice;
  setChoice: (c: EventChoice) => void;
  /** Events this organizer already runs, newest first. */
  events: SeriesSummary[];
  /** What a blank name becomes: the game and course (§5.cz). */
  defaultName: string;
}) {
  const radio = 'h-4 w-4 border-gray-300 text-green-600 focus:ring-green-500';
  return (
    <fieldset className="mt-6 rounded-lg border border-gray-200 bg-white p-3" data-testid="event-field">
      <legend className="px-1 text-sm font-medium text-gray-800">Part of an event?</legend>
      <p className="text-xs text-gray-500">
        An event is several rounds (a trip, a member-guest) whose money adds up and settles at the end.
      </p>
      <div className="mt-2 space-y-2 text-sm text-gray-800">
        <label className="flex items-center gap-2">
          <input type="radio" name="event" className={radio} checked={choice.kind === 'none'}
            onChange={() => setChoice({ kind: 'none' })} />
          No, just this game
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="event" className={radio} checked={choice.kind === 'new'}
            onChange={() => setChoice({ kind: 'new', name: '', date: '' })} />
          Start a new event: this is round 1
        </label>
        {events.map((e) => (
          <label key={e.id} className="flex items-center gap-2">
            <input type="radio" name="event" className={radio}
              checked={choice.kind === 'add' && choice.seriesId === e.id}
              onChange={() => setChoice({ kind: 'add', seriesId: e.id, date: '' })} />
            Add to {e.name} as round {e.roundCount + 1}
          </label>
        ))}
      </div>
      {choice.kind === 'new' && (
        <label className="mt-3 block text-sm">
          <span className="block text-xs font-medium text-gray-600">Event name</span>
          <input
            value={choice.name}
            onChange={(ev) => setChoice({ ...choice, name: ev.target.value })}
            placeholder={defaultName || 'e.g. Myrtle Beach 2026'}
            aria-label="Event name"
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
      )}
      {choice.kind !== 'none' && (
        <label className="mt-3 block text-sm">
          <span className="block text-xs font-medium text-gray-600">Date (optional)</span>
          {/* §5.dc: set up the rounds, then play them. Rounds run in set-up order; a date only puts
              a day header over the rounds that share it. */}
          <input
            type="date"
            aria-label="Date (optional)"
            value={choice.date}
            onChange={(ev) => setChoice({ ...choice, date: ev.target.value })}
            className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
      )}
    </fieldset>
  );
}
