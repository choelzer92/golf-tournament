'use client';

// Screen Wake Lock for an active round. Without this the phone sleeps in your
// pocket between shots, which fires `visibilitychange` and stops the GPS watch
// (see use-geo.ts) — so the next shot logs against a stale-or-missing fix and
// silently yields no distance. Holding the lock while a round is `playing`
// keeps the screen (and therefore the warm fix) alive.
//
// The platform RELEASES the lock automatically whenever the page is hidden, so
// re-requesting on `visibilitychange` is required, not optional — a one-shot
// request would die the first time you switch apps and never come back.
//
// Progressive enhancement: unsupported browsers report 'unsupported' and the
// round still works exactly as before (the fallback is a slower cold fix).

import { useCallback, useEffect, useRef, useState } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', cb: () => void) => void;
}
interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

export type WakeLockStatus = 'idle' | 'active' | 'unsupported' | 'denied';

function getWakeLock(): WakeLockLike | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { wakeLock?: WakeLockLike };
  return nav.wakeLock ?? null;
}

export function useWakeLock(active: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>('idle');
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  const release = useCallback(() => {
    const s = sentinel.current;
    sentinel.current = null;
    if (s && !s.released) s.release().catch(() => { /* already gone */ });
  }, []);

  const acquire = useCallback(async () => {
    const wakeLock = getWakeLock();
    if (!wakeLock) {
      setStatus('unsupported');
      return;
    }
    if (sentinel.current && !sentinel.current.released) return; // already held
    try {
      const s = await wakeLock.request('screen');
      sentinel.current = s;
      setStatus('active');
      // The platform drops the lock on hide; reflect that so the UI isn't lying.
      s.addEventListener('release', () => {
        if (sentinel.current === s) sentinel.current = null;
        setStatus((prev) => (prev === 'active' ? 'idle' : prev));
      });
    } catch {
      // Throws if the document isn't visible or the user/OS refuses.
      setStatus('denied');
    }
  }, []);

  useEffect(() => {
    if (!active) {
      release();
      setStatus((prev) => (prev === 'active' ? 'idle' : prev));
      return;
    }
    const sync = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') void acquire();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      release();
    };
  }, [active, acquire, release]);

  return status;
}
