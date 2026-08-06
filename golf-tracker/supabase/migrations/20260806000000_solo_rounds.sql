-- Solo rounds — the golf-trainer shot log (Layer 1). One row per solo round;
-- the whole round (course, per-hole shot lists with club/shape/GPS, putts)
-- lives in the `data` JSONB blob, mirroring pool_games. No per-hole side table
-- and NO realtime (a solo round has a single author, so we skip
-- ALTER PUBLICATION supabase_realtime). RLS stays permissive like the rest of
-- the app (shared anon key); the client scopes a user's rounds by createdByGhin.
CREATE TABLE IF NOT EXISTS solo_rounds (
  id TEXT PRIMARY KEY,
  data JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE solo_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to solo_rounds" ON solo_rounds
  FOR ALL USING (true) WITH CHECK (true);

-- Required: auto_expose_new_tables is off, so grant access explicitly.
GRANT ALL ON TABLE solo_rounds TO anon, authenticated, service_role;
