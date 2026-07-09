-- Per-organizer roster scoping.
--
-- Until now the `players` roster was a single global list every organizer saw.
-- We add a nullable owner tag so each organizer can build their OWN roster:
--   * owner_ghin IS NULL  -> "base" roster: visible to EVERY organizer. All
--     rows that exist today stay NULL, so the current players remain available
--     to everyone (e.g. JY keeps the players already entered).
--   * owner_ghin = <GHIN> -> scoped to that organizer; only they (and the app
--     owner, who sees all) see it.
--
-- Scoping is enforced client-side against the GHIN identity (the app uses the
-- shared anon key, mirroring how pool GAMES are filtered by createdByGhin), so
-- RLS stays permissive. IF NOT EXISTS keeps this safe to re-run.
ALTER TABLE players ADD COLUMN IF NOT EXISTS owner_ghin BIGINT;
CREATE INDEX IF NOT EXISTS players_owner_ghin_idx ON players (owner_ghin);
