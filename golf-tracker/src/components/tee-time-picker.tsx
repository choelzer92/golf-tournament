'use client';

import { useMemo } from 'react';

// Tee-time entry as two dropdowns — hour (with AM/PM) and minute in 10-min
// increments — instead of a free-text HH:MM box. On a phone these open the
// native scroll-wheel picker, so the organizer just spins to a time (no typing,
// no format mistakes). Stores a clean canonical string like "7:40 AM", which is
// what the hub, teams sheet, and scorecards display.

// Golf-friendly hour range, 5 AM through 7 PM (stored as 24h internally).
const HOURS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const MINUTES = [0, 10, 20, 30, 40, 50];

function to12(h24: number): { h: number; mer: 'AM' | 'PM' } {
  const mer = h24 >= 12 ? 'PM' : 'AM';
  let h = h24 % 12;
  if (h === 0) h = 12;
  return { h, mer };
}

function hourLabel(h24: number): string {
  const { h, mer } = to12(h24);
  return `${h} ${mer}`;
}

function fmt(h24: number, min: number): string {
  const { h, mer } = to12(h24);
  return `${h}:${String(min).padStart(2, '0')} ${mer}`;
}

// Best-effort parse of the stored string back into hour/minute so the dropdowns
// reflect it. Handles "7:40 AM", "7:40" (no meridiem → morning golf assumed,
// with 1–4 treated as afternoon), and 24h like "13:40".
function parse(value: string): { h24: number; min: number } | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = m[3]?.toUpperCase();
  if (mer === 'PM' && h < 12) h += 12;
  else if (mer === 'AM' && h === 12) h = 0;
  else if (!mer && h >= 1 && h <= 4) h += 12; // no meridiem, 1–4 → afternoon
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h24: h, min };
}

export function TeeTimePicker({ value, onChangeAction, className }: {
  value: string;
  onChangeAction: (v: string) => void;
  className?: string;
}) {
  const parsed = useMemo(() => parse(value || ''), [value]);
  const h24 = parsed?.h24 ?? null;
  const min = parsed?.min ?? null;

  // Include the current value in the options if it falls outside the standard
  // set, so an existing time always displays (never silently dropped).
  const hourOptions = useMemo(() => {
    const opts = [...HOURS];
    if (h24 != null && !opts.includes(h24)) { opts.push(h24); opts.sort((a, b) => a - b); }
    return opts;
  }, [h24]);
  const minOptions = useMemo(() => {
    const opts = [...MINUTES];
    if (min != null && !opts.includes(min)) { opts.push(min); opts.sort((a, b) => a - b); }
    return opts;
  }, [min]);

  const selectCls = 'rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <select
        value={h24 ?? ''}
        onChange={(e) => {
          if (e.target.value === '') { onChangeAction(''); return; }
          onChangeAction(fmt(parseInt(e.target.value, 10), min ?? 0));
        }}
        className={selectCls}
        aria-label="Tee time hour"
      >
        <option value="">Hour</option>
        {hourOptions.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
      </select>
      <span className="text-gray-400">:</span>
      <select
        value={min ?? ''}
        onChange={(e) => { if (h24 != null) onChangeAction(fmt(h24, parseInt(e.target.value, 10))); }}
        disabled={h24 == null}
        className={`${selectCls} disabled:opacity-50`}
        aria-label="Tee time minutes"
      >
        <option value="">Min</option>
        {minOptions.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
      </select>
    </div>
  );
}
