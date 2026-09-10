'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { sendFeedback } from '@/lib/feedback';
import { getCreatorGhin, getCreatorName } from '@/lib/pool-identity';

// The in-app feedback box (Craig, 2026-09-10): a header button that opens a
// bottom sheet with one textarea and a Send. Placement rule from Craig:
// "easy to find, but doesn't complicate things or cover things up" — so it's
// a header text button alongside the others, never a floating overlay that
// sits on top of scores. No categories, no required fields; identity comes
// from pool-identity (share-link players have a stored name too).
export function FeedbackButton({ gameId, className }: {
  gameId?: string | null;
  className?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!note.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await sendFeedback({
        note,
        authorGhin: getCreatorGhin(),
        authorName: getCreatorName() ?? '',
        gameId: gameId ?? null,
        path: pathname ?? '',
      });
      setNote('');
      setSent(true);
      // A visible "thanks" beat, then the sheet gets out of the way.
      setTimeout(() => { setSent(false); setOpen(false); }, 1200);
    } catch {
      setErr("Didn't send — try again?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? 'text-sm font-medium text-green-200 hover:text-white'}
      >
        💬 Feedback
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-xl sm:rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {sent ? (
              <p className="text-center text-green-700 font-medium py-6">Thanks — got it! 🙌</p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-bold text-gray-900">Feedback</h2>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-gray-400 hover:text-gray-700 text-xl leading-none"
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Anything — a bug, a confusing screen, a game you wish this had.
                </p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={4}
                  autoFocus
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
                <button
                  onClick={submit}
                  disabled={!note.trim() || busy}
                  className="mt-3 w-full rounded-md bg-green-700 px-4 py-2.5 text-white font-medium hover:bg-green-800 disabled:opacity-50"
                >
                  {busy ? 'Sending…' : 'Send'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
