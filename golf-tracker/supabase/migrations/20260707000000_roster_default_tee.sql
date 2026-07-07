-- Remember each player's usual tee by NAME (tee IDs are course-specific, but
-- names like "3 Stars" / "1 Star (W)" recur). Used to auto-assign a player's
-- tee when re-adding them to a game; falls back to a gender default otherwise.
ALTER TABLE players ADD COLUMN IF NOT EXISTS default_tee_name TEXT;
