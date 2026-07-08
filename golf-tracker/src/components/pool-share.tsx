'use client';

import { useState } from 'react';
import { ORGANIZER_TOKEN } from '@/lib/invite-gate';

// Self-contained "share the organizer link" button + modal. Reused from the
// dashboard, the setup wizard, and a pool game's hub. Kept self-contained (no
// function props across the client boundary) so it can live in /components.
export function PoolShareButton({ className, label = 'Share' }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const organizerLink = `${origin}/pool?key=${ORGANIZER_TOKEN}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(organizerLink)}`;

  async function share() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: 'Create a pool game', url: organizerLink }); return; } catch { /* fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(organizerLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — user can long-press the field */ }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={className ?? 'text-sm text-green-200 hover:text-white font-medium'}>
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Share pool games</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
            </div>

            <p className="text-sm font-semibold text-gray-800">Organizer link</p>
            <p className="text-xs text-gray-500 mb-2">
              Send this to whoever runs the game. They can create and manage pool games, build teams, and make scorecards — logging into their own GHIN. It does not open the rest of your app.
            </p>
            <div className="flex gap-2">
              <input readOnly value={organizerLink} className="flex-1 min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-600" onFocus={(e) => e.currentTarget.select()} />
              <button onClick={share} className="flex-shrink-0 rounded-md bg-green-700 px-3 py-1.5 text-sm text-white font-medium hover:bg-green-800">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="mt-3 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSrc} alt="QR code — create a pool game" width={180} height={180} className="rounded-lg border border-gray-200" />
            </div>
            <p className="text-center text-[11px] text-gray-400 mt-1">Or scan to open on a phone</p>
          </div>
        </div>
      )}
    </>
  );
}
