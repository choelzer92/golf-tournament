-- Feedback notes — the in-app feedback box (Craig, 2026-09-10). One row per
-- note; plain columns, no JSONB blob — a note is flat and this table is read
-- by hand (or via /home/feedback), so queryable columns beat a blob.
-- Additive-only: touches nothing existing. No realtime (feedback is not live
-- data). RLS stays permissive like the rest of the app (shared anon key);
-- share-link players can write — the friend using the app mid-round is the
-- whole point.
CREATE TABLE IF NOT EXISTS feedback_notes (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  author_ghin BIGINT,
  author_name TEXT,
  game_id TEXT,
  path TEXT,
  note TEXT NOT NULL
);

ALTER TABLE feedback_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to feedback_notes" ON feedback_notes
  FOR ALL USING (true) WITH CHECK (true);

-- Required: auto_expose_new_tables is off, so grant access explicitly.
GRANT ALL ON TABLE feedback_notes TO anon, authenticated, service_role;
