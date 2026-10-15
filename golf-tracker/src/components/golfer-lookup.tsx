'use client';

// Look up ANY golfer's Handicap Index on GHIN, by name or by GHIN number (§5.cw d, fix 3).
// Read-only: it shows what GHIN says and writes nothing (not the roster, not who you are,
// F-110). Adding someone to a game or group is the add-player panel's job.

import { useState } from 'react';
import { formatHandicapIndex, parseGhinIndex } from '@/lib/game-state';

interface Found { ghin: number | null; name: string; index: number | null; club: string }

const inputCls =
  'rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';
const btnCls = 'whitespace-nowrap rounded-md bg-green-700 px-4 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50';

function toFound(g: Record<string, unknown>): Found {
  const n = Number(g.ghin ?? g.ghin_number ?? g.id);
  const clubs = g.clubs as { club_name?: string }[] | undefined;
  return {
    ghin: isNaN(n) ? null : n,
    name: `${g.first_name ?? ''} ${g.last_name ?? ''}`.trim(),
    index: parseGhinIndex((g.handicap_index ?? g.hi_value) as string),
    club: String(g.club_name ?? clubs?.[0]?.club_name ?? ''),
  };
}

export function GolferLookup({ getTokenAction }: { getTokenAction: () => string | null }) {
  const [last, setLast] = useState('');
  const [first, setFirst] = useState('');
  const [state, setState] = useState('VA');
  const [number, setNumber] = useState('');
  const [results, setResults] = useState<Found[] | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  async function run(path: string, body: Record<string, unknown>, pick: (data: Record<string, unknown>) => Record<string, unknown>[]) {
    const token = getTokenAction();
    if (!token) { setNote('Sign in to GHIN first, then try again.'); return; }
    setLoading(true);
    setNote('');
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) });
      const data = await res.json();
      if (!res.ok) { setResults([]); setNote(data.error || 'Not found.'); return; }
      const found = pick(data).map(toFound);
      setResults(found);
      if (found.length === 0) setNote('No golfers found. Check the spelling and state.');
    } catch {
      setResults([]);
      setNote('Lookup failed. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3" data-testid="golfer-lookup">
      <form
        className="flex gap-2 flex-wrap"
        onSubmit={(e) => { e.preventDefault(); void run('/api/ghin/search-golfer', { first_name: first, last_name: last, state }, (d) => (d.golfers as Record<string, unknown>[]) || []); }}
      >
        <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" aria-label="Last name" className={`${inputCls} flex-1 min-w-[8rem]`} />
        <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First (optional)" aria-label="First name" className={`${inputCls} flex-1 min-w-[8rem]`} />
        <input value={state} onChange={(e) => setState(e.target.value.toUpperCase())} maxLength={2} aria-label="State" className={`${inputCls} w-16`} />
        <button type="submit" disabled={loading || !last.trim()} className={btnCls}>Search</button>
      </form>
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); void run('/api/ghin/golfer', { ghin_number: Number(number) }, (d) => (d.golfer ? [d.golfer as Record<string, unknown>] : [])); }}
      >
        <input value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Or a GHIN #" aria-label="GHIN number" className={`${inputCls} flex-1`} />
        <button type="submit" disabled={loading || !number} className={btnCls}>Look up</button>
      </form>
      {note && <p className="text-sm text-gray-600">{note}</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100" aria-label="Golfers found">
          {results.map((g, i) => (
            <li key={`${g.ghin ?? 'x'}-${i}`} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="font-medium text-gray-900">{g.name || 'Unknown'}</span>
                <span className="block text-xs text-gray-500 truncate">
                  {g.ghin != null ? `GHIN ${g.ghin}` : ''}{g.club ? ` · ${g.club}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs text-gray-500">Index</span>
                <span className="font-semibold tabular-nums text-gray-900">{g.index == null ? '–' : formatHandicapIndex(g.index)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
