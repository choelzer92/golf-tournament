-- Per-course printable-scorecard config, keyed by GHIN course id. Alignment is
-- a property of the scorecard/course (not an individual game), so it's set once
-- per course and reused by every game there, on every device. `card_url` is
-- reserved for a future per-course card image (Spring Creek uses the bundled PDF
-- for now).
CREATE TABLE course_scorecards (
  course_id BIGINT PRIMARY KEY,
  alignment JSONB,
  card_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER PUBLICATION supabase_realtime ADD TABLE course_scorecards;

ALTER TABLE course_scorecards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to course_scorecards" ON course_scorecards
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE course_scorecards TO anon, authenticated, service_role;
