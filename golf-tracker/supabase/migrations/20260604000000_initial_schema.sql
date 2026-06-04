-- Tournaments table
CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Game scores table
CREATE TABLE game_scores (
  matchup_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;
ALTER PUBLICATION supabase_realtime ADD TABLE game_scores;

-- RLS policies: allow all operations with anon key
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to tournaments" ON tournaments
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to game_scores" ON game_scores
  FOR ALL USING (true) WITH CHECK (true);
