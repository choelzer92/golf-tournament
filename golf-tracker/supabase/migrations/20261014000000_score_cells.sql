-- F-063 option C (DECISIONS §5.ce, §5.dn): one row per score, so no score is ever lost.
--
-- NOT YET APPLIED TO LIVE. Craig sees this file before it runs (§5.ce: "show the live migration
-- first"). Built and tested against the sandbox backend first (src/test/fake-supabase.ts mirrors
-- upsert_score_cells via the same rule, src/lib/score-cells.ts resolveCellWrite).
--
-- WHAT IT DOES
--   1. score_cells: (matchup_id, player_id, hole) -> gross_score. NULL gross_score = cleared (a
--      tombstone; realtime can't filter DELETEs by matchup, and the tombstone keeps its tap time).
--   2. upsert_score_cells(p_cells): the ONE write path for new clients. Per cell, under a row lock:
--      apply unless the stored tap is NEWER (§5.dn: the later TAP wins), and append score_audit
--      when the visible score changes (the audit moves server-side, so it can't be dropped).
--      Idempotent: resending a batch changes nothing.
--   3. Backfill every existing game_scores card into cells (tap time = the card's updated_at).
--   4. game_scores stays a CORRECT DERIVED COPY: a trigger rebuilds a card's blob whenever one of
--      its cells changes. So rollback = redeploy the old bundle, and the backup / ledger corpus /
--      old open tabs keep reading a current blob.
--   5. An OLD bundle (every phone, until the new app is deployed and reloaded) writes the whole card
--      to game_scores. A guarded trigger MIRRORS that card into score_cells: new and EDITED scores
--      are copied, and a score the card no longer has is cleared. That is exactly how a whole-card
--      save behaves today, so the gap between this migration and the deploy is never worse than
--      today, and a correction made in that gap survives the cutover. (An earlier draft copied only
--      MISSING cells; a 5 corrected to 4 in the gap would have been reverted. Found 2026-10-14.)
--      New bundles never write game_scores directly, so once the old tabs are gone this is idle.
--
-- ROLLBACK: redeploy the previous bundle (it reads/writes game_scores, which is current throughout),
-- then optionally DROP TRIGGER score_cells_to_blob ON score_cells; DROP TRIGGER blob_to_score_cells
-- ON game_scores; DROP FUNCTION upsert_score_cells(jsonb); DROP TABLE score_cells.

CREATE TABLE IF NOT EXISTS score_cells (
  matchup_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  hole INT NOT NULL,
  gross_score INT,
  tapped_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (matchup_id, player_id, hole)
);

ALTER TABLE score_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to score_cells" ON score_cells
  FOR ALL USING (true) WITH CHECK (true);
-- Required: auto_expose_new_tables is off, so grant access explicitly.
GRANT ALL ON TABLE score_cells TO anon, authenticated, service_role;
ALTER PUBLICATION supabase_realtime ADD TABLE score_cells;

-- (2) The write path. Mirrors resolveCellWrite in src/lib/score-cells.ts exactly.
CREATE OR REPLACE FUNCTION upsert_score_cells(p_cells JSONB)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  c JSONB;
  v_match TEXT;
  v_player TEXT;
  v_hole INT;
  v_gross INT;
  v_tapped TIMESTAMPTZ;
  old_gross INT;
  old_tapped TIMESTAMPTZ;
  had_row BOOLEAN;
BEGIN
  FOR c IN SELECT * FROM jsonb_array_elements(COALESCE(p_cells, '[]'::jsonb)) LOOP
    v_match := c->>'matchupId';
    v_player := c->>'playerId';
    v_hole := (c->>'hole')::INT;
    v_gross := NULLIF(c->>'grossScore', '')::INT;   -- JSON null -> SQL NULL (a clear)
    v_tapped := (c->>'tappedAt')::TIMESTAMPTZ;

    SELECT gross_score, tapped_at INTO old_gross, old_tapped
      FROM score_cells
      WHERE matchup_id = v_match AND player_id = v_player AND hole = v_hole
      FOR UPDATE;
    had_row := FOUND;

    -- §5.dn: a stored tap that is NEWER wins; an older or equal incoming tap applies.
    IF had_row AND old_tapped > v_tapped THEN
      CONTINUE;
    END IF;

    INSERT INTO score_cells (matchup_id, player_id, hole, gross_score, tapped_at, updated_at)
      VALUES (v_match, v_player, v_hole, v_gross, v_tapped, NOW())
      ON CONFLICT (matchup_id, player_id, hole) DO UPDATE
        SET gross_score = EXCLUDED.gross_score, tapped_at = EXCLUDED.tapped_at, updated_at = NOW();

    IF (CASE WHEN had_row THEN old_gross ELSE NULL END) IS DISTINCT FROM v_gross THEN
      INSERT INTO score_audit (matchup_id, player_id, hole, old_score, new_score)
        VALUES (v_match, v_player, v_hole, CASE WHEN had_row THEN old_gross ELSE NULL END, v_gross);
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_score_cells(JSONB) TO anon, authenticated, service_role;

-- (3) Backfill. A card listing a cell twice keeps its first; no audit rows (nothing changed).
INSERT INTO score_cells (matchup_id, player_id, hole, gross_score, tapped_at, updated_at)
SELECT gs.matchup_id, e->>'playerId', (e->>'hole')::INT, (e->>'grossScore')::INT, gs.updated_at, NOW()
  FROM game_scores gs, jsonb_array_elements(gs.data) e
  WHERE jsonb_typeof(gs.data) = 'array'
    AND e ? 'playerId' AND e ? 'hole' AND jsonb_typeof(e->'grossScore') = 'number'
ON CONFLICT (matchup_id, player_id, hole) DO NOTHING;

-- (4) cells -> blob: keep game_scores.data the card's current scores.
CREATE OR REPLACE FUNCTION score_cells_to_blob()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO game_scores (matchup_id, data, updated_at)
  VALUES (
    NEW.matchup_id,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('playerId', player_id, 'hole', hole, 'grossScore', gross_score)
                       ORDER BY hole, player_id)
        FROM score_cells
        WHERE matchup_id = NEW.matchup_id AND gross_score IS NOT NULL
    ), '[]'::jsonb),
    NOW()
  )
  ON CONFLICT (matchup_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;
  RETURN NULL;
END;
$$;

CREATE TRIGGER score_cells_to_blob
  AFTER INSERT OR UPDATE ON score_cells
  FOR EACH ROW EXECUTE FUNCTION score_cells_to_blob();

-- (5) blob -> cells, for OLD bundles only: a direct client write to game_scores (trigger depth 1).
-- The rebuild in (4) writes game_scores at depth 2 and is skipped, so the two never loop. No audit
-- rows here: an old bundle writes its own score_audit rows client-side.
CREATE OR REPLACE FUNCTION blob_to_score_cells()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR jsonb_typeof(NEW.data) <> 'array' THEN
    RETURN NULL;
  END IF;
  -- New and edited scores, as the old card has them (one per cell, the last listed).
  INSERT INTO score_cells (matchup_id, player_id, hole, gross_score, tapped_at, updated_at)
  SELECT DISTINCT ON (e->>'playerId', (e->>'hole')::INT)
         NEW.matchup_id, e->>'playerId', (e->>'hole')::INT, (e->>'grossScore')::INT, NOW(), NOW()
    FROM jsonb_array_elements(NEW.data) WITH ORDINALITY AS t(e, n)
    WHERE e ? 'playerId' AND e ? 'hole' AND jsonb_typeof(e->'grossScore') = 'number'
    ORDER BY e->>'playerId', (e->>'hole')::INT, n DESC
  ON CONFLICT (matchup_id, player_id, hole) DO UPDATE
    SET gross_score = EXCLUDED.gross_score, tapped_at = EXCLUDED.tapped_at, updated_at = NOW()
    WHERE score_cells.gross_score IS DISTINCT FROM EXCLUDED.gross_score;
  -- Scores the old card no longer has (a reset to [], a rebalance): cleared, as today.
  UPDATE score_cells sc
     SET gross_score = NULL, tapped_at = NOW(), updated_at = NOW()
   WHERE sc.matchup_id = NEW.matchup_id
     AND sc.gross_score IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(NEW.data) e
        WHERE e->>'playerId' = sc.player_id AND (e->>'hole')::INT = sc.hole
          AND jsonb_typeof(e->'grossScore') = 'number');
  RETURN NULL;
END;
$$;

CREATE TRIGGER blob_to_score_cells
  AFTER INSERT OR UPDATE ON game_scores
  FOR EACH ROW EXECUTE FUNCTION blob_to_score_cells();
