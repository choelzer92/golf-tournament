'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { checkInviteCode, setAccessCookie, getAccessLevel, checkShareTokenInUrl, isPoolAllowedPath, type AccessLevel } from '@/lib/invite-gate';

export function InviteGate({ children }: { children: React.ReactNode }) {
  const [level, setLevel] = useState<AccessLevel | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // An organizer token in the URL grants 'pool' access; otherwise use the cookie.
    const fromToken = checkShareTokenInUrl();
    const lvl = fromToken ?? getAccessLevel();
    // Sliding expiry (F-051): every successful visit re-sets the cookie, so a
    // weekly regular never sees this gate again while a lapsed visitor ages out.
    if (lvl && !fromToken) setAccessCookie(lvl);
    setLevel(lvl);
    setChecking(false);
  }, []);

  // A 'pool'-level visitor (share link) may only see pool routes. If they land
  // anywhere else, send them to My Games — a floor that explains itself — rather
  // than dropping them mid-form into the New Game wizard (F-052).
  useEffect(() => {
    if (level === 'pool' && pathname && !isPoolAllowedPath(pathname)) {
      router.replace('/pool');
    }
  }, [level, pathname, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (checkInviteCode(code)) {
      setAccessCookie('full');
      setLevel('full');
      setError('');
    } else {
      setError('Invalid code. Try again.');
    }
  }

  // D3: a quiet skeleton while the cookie is read, not a blank white frame.
  if (checking) return <GateSkeleton />;

  if (level === 'full') return <>{children}</>;

  if (level === 'pool') {
    // Allowed on pool routes; the redirect effect handles anything else.
    if (pathname && isPoolAllowedPath(pathname)) return <>{children}</>;
    return <GateSkeleton />;
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 min-h-screen bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Golf Tracker</h1>
          {/* D3: say what the app is. The name and brand wait for a branding session (§5.ci). */}
          <p className="mt-2 text-gray-800">Set up your group&apos;s game, score it hole by hole, and settle the money.</p>
          {/* F-050: most people hitting this screen are RETURNING friends whose
              access lapsed, not strangers — say the code hasn't changed. */}
          <p className="mt-4 text-sm text-gray-600">Enter the invite code — the same one works every time</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-4 py-3 text-center text-lg shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="Invite code"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <button
            type="submit"
            disabled={!code.trim()}
            className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enter
          </button>
        </form>

        <p className="mt-6 text-xs text-center text-gray-400">
          Ask the organizer for your invite code
        </p>
      </div>
    </div>
  );
}

function GateSkeleton() {
  return (
    <div className="flex-1 bg-gray-50" aria-busy="true" aria-label="Loading">
      <div className="mx-auto max-w-2xl p-4 space-y-3 animate-pulse">
        <div className="h-7 w-40 rounded bg-gray-200" />
        <div className="h-24 rounded-lg bg-gray-200" />
        <div className="h-24 rounded-lg bg-gray-200" />
      </div>
    </div>
  );
}
