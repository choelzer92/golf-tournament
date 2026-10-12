'use client';

// "Part of an event?" on the Review step (§5.cv Q2). An event is several ordinary games
// played as one, paying cumulative money at the end (lib/series.ts). The usual answer is No,
// so it's one quiet row until someone opens it; "Start an event" and "Add round N" open it
// already chosen.

import { shortDate, type SeriesSummary } from '@/lib/series';

export type EventChoice =
  | { kind: 'none' }
  | { kind: 'new'; name: string; date: string }
  | { kind: 'add'; seriesId: string; date: string };

export function EventField({ choice, setChoice, events, today }: {
  choice: EventChoice;
  setChoice: (c: EventChoice) => void;
  /** Events this organizer already runs, newest first. */
  events: SeriesSummary[];
  today: string;
}) {
  const adding = choice.kind === 'add' ? events.find((e) => e.id === choice.seriesId) : undefined;
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
            onChange={() => setChoice({ kind: 'new', name: '', date: today })} />
          Start a new event: this is round 1
        </label>
        {events.map((e) => (
          <label key={e.id} className="flex items-center gap-2">
            <input type="radio" name="event" className={radio}
              checked={choice.kind === 'add' && choice.seriesId === e.id}
              onChange={() => setChoice({ kind: 'add', seriesId: e.id, date: e.nextDate })} />
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
            placeholder="e.g. Myrtle Beach 2026"
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
      )}
      {choice.kind !== 'none' && (
        <label className="mt-3 block text-sm">
          <span className="block text-xs font-medium text-gray-600">Date of this round</span>
          <input
            type="date"
            value={choice.date}
            onChange={(ev) => setChoice({ ...choice, date: ev.target.value || choice.date })}
            className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          {adding && (
            <span className="mt-1 block text-xs text-gray-500">
              Its last round was {shortDate(adding.lastDate)}. Playing 36 that day? Set the same date.
            </span>
          )}
        </label>
      )}
    </fieldset>
  );
}
