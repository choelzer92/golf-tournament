-- Track when each roster player's handicap index was last pulled from GHIN, so
-- the app can auto-refresh stale handicaps and warn when teams were set up
-- before an overnight handicap change.
ALTER TABLE players ADD COLUMN IF NOT EXISTS hcap_updated_at TIMESTAMPTZ;
