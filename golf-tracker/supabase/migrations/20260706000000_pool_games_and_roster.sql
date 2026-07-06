-- Pool money games ("Best 1 Net + Best 1 Gross" N-foursome pool)
CREATE TABLE pool_games (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Persistent, reusable player roster (grows every match; keyed by GHIN when available)
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  ghin_number BIGINT UNIQUE,
  name TEXT NOT NULL,
  handicap_index REAL,
  gender TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX players_name_idx ON players (name);

-- Enable realtime for the pool games table (roster does not need realtime)
ALTER PUBLICATION supabase_realtime ADD TABLE pool_games;

-- RLS policies: allow all operations with anon key (matches existing tables)
ALTER TABLE pool_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to pool_games" ON pool_games
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to players" ON players
  FOR ALL USING (true) WITH CHECK (true);

-- Explicit grants: auto_expose_new_tables default flipped to false (2026-05-30),
-- so new tables are NOT auto-reachable by the API roles without these grants.
GRANT ALL ON TABLE pool_games TO anon, authenticated, service_role;
GRANT ALL ON TABLE players TO anon, authenticated, service_role;
