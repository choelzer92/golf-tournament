'use client';

import { useState } from 'react';

export function getToken() {
  return sessionStorage.getItem('ghin_token');
}

export function timeAgo(iso?: string): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

// A number input that lets you FULLY type (including clearing the box) without
// the value snapping back to a default mid-edit. It keeps a local text draft
// while focused and commits the parsed number on blur (or Enter). Committing an
// empty/invalid entry falls back to `fallback`. Fixes the bug where binding a
// numeric field straight to saved state + coercing on every keystroke made the
// value un-editable (clearing it to retype instantly reset it).
export function NumberField({
  value, onCommit, fallback, className, placeholder,
}: {
  value: number;
  onCommit: (n: number) => void;
  fallback: number;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const commit = () => {
    if (draft === null) return;
    const parsed = draft.trim() === '' || isNaN(parseFloat(draft)) ? fallback : parseFloat(draft);
    setDraft(null);
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}
