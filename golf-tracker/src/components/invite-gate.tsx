'use client';

import { useState, useEffect } from 'react';
import { checkInviteCode, setAccessCookie, hasAccessCookie } from '@/lib/invite-gate';

export function InviteGate({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setAuthorized(hasAccessCookie());
    setChecking(false);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (checkInviteCode(code)) {
      setAccessCookie();
      setAuthorized(true);
      setError('');
    } else {
      setError('Invalid code. Try again.');
    }
  }

  if (checking) return null;

  if (authorized) return <>{children}</>;

  return (
    <div className="flex-1 flex items-center justify-center p-4 min-h-screen bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Golf Tracker</h1>
          <p className="mt-2 text-gray-600">Enter your invite code to continue</p>
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
