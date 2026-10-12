// A handicap index box with a "+" chip beside it (F-100 A, §5.bw). The iPhone decimal keypad has
// no sign key, so a plus index ("+2.1", better than scratch) could only arrive by GHIN import. The
// chip flips the sign of whatever is typed, and keeps the number pad for everyone else.
//
// The box holds TEXT as golfers write it ("+2.1"); callers read it with parseGhinIndex, which
// stores a plus index negative (−2.1). That negative is the value every engine computes with;
// "+" is only its spelling (§5.bx).

import { MAX_HANDICAP_INDEX } from '@/lib/game-state';

export function toggleIndexSign(raw: string): string {
  const s = raw.trim();
  if (s.startsWith('+') || s.startsWith('-')) return s.slice(1);
  return `+${s}`;
}

/** A typed index above the WHS maximum (54.0), which is capped when it's read (`parseGhinIndex`). */
export function isOverMaxIndex(raw: string): boolean {
  const s = raw.trim();
  if (s.startsWith('+') || s.startsWith('-')) return false;
  const n = parseFloat(s);
  return !isNaN(n) && n > MAX_HANDICAP_INDEX;
}

export function isPlusText(raw: string): boolean {
  const s = raw.trim();
  return s.startsWith('+') || (s.startsWith('-') && s.length > 1);
}

export function HandicapIndexInput({
  value,
  onChange,
  onCommit,
  onKeyDown,
  placeholder = 'HCP',
  inputClassName = '',
  title,
  autoFocus,
  ariaLabel = 'Handicap index',
}: {
  value: string;
  onChange: (next: string) => void;
  /** Called on blur and after the sign is flipped — for boxes that save as they go. */
  onCommit?: (next: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  inputClassName?: string;
  title?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const plus = isPlusText(value);
  return (
    <span className="inline-flex items-stretch gap-1">
      <button
        type="button"
        onClick={() => {
          const next = toggleIndexSign(value);
          onChange(next);
          onCommit?.(next);
        }}
        aria-pressed={plus}
        aria-label="Plus handicap (better than scratch)"
        title="Plus handicap: better than scratch, gives strokes back"
        className={`min-w-[2rem] rounded-md border px-1.5 text-sm font-bold ${plus ? 'border-purple-400 bg-purple-50 text-purple-700' : 'border-gray-300 bg-white text-gray-400'}`}
      >
        +
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit ? (e) => onCommit(e.target.value) : undefined}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        title={title}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={inputClassName}
      />
      {isOverMaxIndex(value) && (
        <span className="self-center whitespace-nowrap text-xs text-amber-700" role="note">Max 54.0</span>
      )}
    </span>
  );
}
