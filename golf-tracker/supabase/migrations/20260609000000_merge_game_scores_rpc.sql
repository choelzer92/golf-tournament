-- Server-side merge for game_scores: accepts only the owned players' scores
-- and merges them with existing data, preventing concurrent-write data loss.
CREATE OR REPLACE FUNCTION merge_game_scores(
  p_matchup_id TEXT,
  p_player_ids TEXT[],
  p_scores JSONB
) RETURNS JSONB AS $$
DECLARE
  current_data JSONB;
  merged JSONB;
BEGIN
  -- Lock the row to serialize concurrent merges
  SELECT data INTO current_data
  FROM game_scores
  WHERE matchup_id = p_matchup_id
  FOR UPDATE;

  IF current_data IS NULL THEN
    INSERT INTO game_scores (matchup_id, data, updated_at)
    VALUES (p_matchup_id, p_scores, NOW())
    ON CONFLICT (matchup_id) DO UPDATE
      SET data = p_scores, updated_at = NOW();
    RETURN p_scores;
  END IF;

  -- Keep scores for players NOT owned by this device
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  INTO merged
  FROM jsonb_array_elements(current_data) elem
  WHERE NOT (elem->>'playerId' = ANY(p_player_ids));

  -- Append this device's scores
  merged := merged || p_scores;

  UPDATE game_scores
  SET data = merged, updated_at = NOW()
  WHERE matchup_id = p_matchup_id;

  RETURN merged;
END;
$$ LANGUAGE plpgsql;
