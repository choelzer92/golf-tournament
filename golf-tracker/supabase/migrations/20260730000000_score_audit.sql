-- Score change audit log. Every time a hole score is entered, changed, or
-- cleared for a matchup (foursome), we append a row here so disputes can be
-- settled: who/what changed, from what to what, and when. Append-only — never
-- updated or deleted in normal use.
--
--   old_score / new_score are the gross values; NULL means "no score" (a first
--   entry has old=NULL, clearing a score has new=NULL).
--
-- Keyed by matchup_id (the same id game_scores uses), so it joins back to a pool
-- game via that game's team matchupIds. RLS stays permissive like the rest of
-- the app (shared anon key); the client scopes reads to a game's own matchups.
CREATE TABLE IF NOT EXISTS score_audit (
  id BIGSERIAL PRIMARY KEY,
  matchup_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  hole INT NOT NULL,
  old_score INT,
  new_score INT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS score_audit_matchup_idx ON score_audit (matchup_id, changed_at DESC);

ALTER TABLE score_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to score_audit" ON score_audit
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE score_audit TO anon, authenticated, service_role;
