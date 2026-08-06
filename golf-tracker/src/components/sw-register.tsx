'use client';

// Registers the service worker (public/sw.js) so the app can boot with no
// signal. Renders nothing.
//
// Registration is deferred to `load` and wrapped in a catch: if it fails for
// any reason the app must behave exactly as it did before — a service worker is
// an enhancement for on-course use, never a requirement for the pool and
// tournament flows that share this layout.

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // Dev registers a different SW story (and Next's dev assets aren't hashed
    // the same way) — only register in production to avoid confusing caching
    // while working locally.
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* unsupported, blocked, or insecure context — app works unchanged */
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
