// In-app feedback — a text box and a list, deliberately not a ticket system
// (Craig, 2026-09-10). Anyone in a game (share-link players included — the
// friend using the app mid-round is the whole point) can drop a note; the
// owner reads them at /home/feedback and feeds FINDINGS.md by hand.
//
// Persistence mirrors the other lib files: this is the ONLY place feedback
// touches Supabase. Rows are flat columns (see the feedback_notes migration).
// Writes use upsert with a client-generated id — same pattern as every other
// table, and it's what the sandbox fake can read back.

import { supabase } from './supabase';

export interface FeedbackNote {
  id: string;
  createdAt: string;          // ISO
  authorGhin: number | null;  // null for a share-link player with no GHIN
  authorName: string;         // stored display name; '' if unknown
  gameId: string | null;      // the game the note was sent from, if any
  path: string;               // route the note was sent from
  note: string;
}

interface FeedbackRow {
  id: string;
  created_at: string;
  author_ghin: number | null;
  author_name: string | null;
  game_id: string | null;
  path: string | null;
  note: string;
}

function rowToNote(row: FeedbackRow): FeedbackNote {
  return {
    id: row.id,
    createdAt: row.created_at,
    authorGhin: row.author_ghin,
    authorName: row.author_name ?? '',
    gameId: row.game_id,
    path: row.path ?? '',
    note: row.note,
  };
}

// Send one note. Throws on a persistence error so the UI can say "didn't send"
// instead of flashing a false thanks — silent success must stay trustworthy
// (UI_CONVENTIONS §5), which means silent FAILURE is not allowed either.
export async function sendFeedback(input: {
  note: string;
  authorGhin: number | null;
  authorName: string;
  gameId: string | null;
  path: string;
}): Promise<void> {
  const note = input.note.trim();
  if (!note) return;
  const row: FeedbackRow = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    author_ghin: input.authorGhin,
    author_name: input.authorName || null,
    game_id: input.gameId,
    path: input.path,
    note,
  };
  const { error } = await supabase.from('feedback_notes').upsert(row);
  if (error) throw new Error(error.message);
}

// Every note, newest first — the /home/feedback read-back list.
export async function listFeedback(): Promise<FeedbackNote[]> {
  const { data } = await supabase.from('feedback_notes').select('*');
  const rows = (data ?? []) as FeedbackRow[];
  return rows.map(rowToNote).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
