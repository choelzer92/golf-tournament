-- Roster groups: an organizer's saved "home base" — a named set of players PLUS
-- default game settings — so starting a new pool game from a group prefills both
-- the field and the format in one tap (e.g. JY's "Weekend Warriors" defaults to
-- his roster + pot format; a match crew defaults to head-to-head).
--
-- Ownership mirrors the players roster (see 20260709000000_roster_owner_scope):
--   * owner_ghin IS NULL  -> shared "base" group, visible to every organizer.
--   * owner_ghin = <GHIN> -> scoped to that organizer (and the app owner).
-- Scoping is enforced client-side against the GHIN identity (shared anon key),
-- so RLS stays permissive, consistent with pool_games / players.
--
-- `defaults` holds the format snapshot (moneyMode, junkValues, entryPerPlayer,
-- positionSplit, matchConfig, handicapAllowance, strokeMethod, ballSelection);
-- kept as JSONB so the shape can evolve without a migration.
CREATE TABLE IF NOT EXISTS roster_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_ghin BIGINT,
  player_ids TEXT[] NOT NULL DEFAULT '{}',
  defaults JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS roster_groups_owner_ghin_idx ON roster_groups (owner_ghin);

ALTER TABLE roster_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to roster_groups" ON roster_groups
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE roster_groups TO anon, authenticated, service_role;
