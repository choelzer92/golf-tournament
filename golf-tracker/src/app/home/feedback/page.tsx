'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { listFeedback, type FeedbackNote } from '@/lib/feedback';
import { isAppOwner } from '@/lib/invite-gate';

// Read-back for the in-app feedback box: every note, newest first, with who,
// when, and a link to the game it came from. Owner-gated the same way the rest
// of /home is (a `pool` share-link visitor never reaches /home routes — the
// InviteGate redirects them). Notes feed FINDINGS.md by hand; nothing here is
// a ticket system by design (Craig, 2026-09-10).
export default function FeedbackPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [notes, setNotes] = useState<FeedbackNote[]>([]);

  useEffect(() => {
    const token = sessionStorage.getItem('ghin_token');
    // F-059 (§5.bi): everyone's feedback notes are an app-owner chore, not a
    // member surface — ownership is identity, not the invite code.
    if (!token || !isAppOwner()) {
      router.push('/');
      return;
    }
    listFeedback().then((ns) => { setNotes(ns); setReady(true); });
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-full bg-gray-50">
        <p className="text-center text-gray-400 py-16">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Feedback</h1>
          <button onClick={() => router.push('/home')} className="text-sm text-green-200 hover:text-white">
            Home
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {notes.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
            No feedback yet. The 💬 button on the home page and every game hub sends notes here.
          </p>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="bg-white rounded-lg shadow p-4">
                <p className="text-gray-900 whitespace-pre-wrap">{n.note}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {n.authorName || 'Anonymous'} · {new Date(n.createdAt).toLocaleString()}
                  {n.gameId && (
                    <>
                      {' · '}
                      <button
                        onClick={() => router.push(`/pool/${n.gameId}`)}
                        className="text-green-700 hover:text-green-900 font-medium"
                      >
                        open the game →
                      </button>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
