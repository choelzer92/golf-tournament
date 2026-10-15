# The live migration for F-063 C, in plain terms (for Craig's go / no-go)

File: `supabase/migrations/20261014000000_score_cells.sql`. **Not run on live.** Nothing runs it automatically.
Proven on a real Postgres in-process (`src/test/score-cells-sql.test.ts`, 8 tests, mutation-checked), and the app
side on the sandbox (full gate green).

## What it changes on the live database

| Step | What happens | Touches existing data? |
|---|---|---|
| 1. New table `score_cells` | One row per player per hole per card. Open access like every other table. On the live feed | No |
| 2. New save function | The new app saves through it: later tap wins (§5.dn), writes the score history itself | No |
| 3. Copy every card in | Every existing card's scores are copied into the new table, once | **Reads** every card; writes only the new table |
| 4. Keep the old card current | Whenever a score changes in the new table, the old card copy (`game_scores`) is rebuilt from it | Rewrites a card **only when one of its scores changes**, with the same scores |
| 5. Old app keeps working | A phone still on the old app saves its whole card as today; that card is mirrored into the new table, edits and resets included | Writes only the new table |

Nothing is deleted. The old card table stays and stays correct, which is what makes rollback a redeploy.

## Order of operations (the deploy-order rule)

1. Take a backup first: `node scripts/export-backup.mjs` (also closes bar #8).
2. Run the migration.
3. Spot check: a handful of games' cards match between the two tables (I'd do this read-only and show you).
4. Deploy the branch (merging is your call, §5.ab). Phones pick up the new app on their next load.
5. Your phone walk: score on one phone, watch a second phone and the leaderboard update live.

Between 2 and 4 every phone is on the old app and behaves exactly as today (step 5 of the table).

## Rollback

Redeploy the previous app. The old card table has been current the whole time, so nothing is lost. The new table
can then be dropped at leisure (the commands are at the top of the file).

## What I found before running it

A first draft only copied **missing** scores from old-app saves. A 5 corrected to 4 between the migration and the
deploy would have been reverted at cutover. Fixed: old-app saves are mirrored in full. The test "OLD app in the gap:
a correction survives" fails on the first draft and passes now.

## Not proven here

- Speed between real phones (no network in the sandbox; your walk measures it).
- Supabase's realtime delivering `score_cells` rows (it does for any table in the publication; step 1 adds it).
