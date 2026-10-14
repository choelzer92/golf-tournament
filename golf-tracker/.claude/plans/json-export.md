# Bar #8: Backups / JSON export (investigation, 2026-10-14)

Investigation only. No app code was changed. Sources: BETA §1 #8, DECISIONS §3 + archive §5c, §5h,
§5.bi, §5.cb, §5.cj, §5.cs Q10; the persistence libs; `supabase/migrations/*`; `scripts/export-backup.mjs`;
`src/test/fake-supabase.ts`; the `backups/` folder (git-ignored).

## 0. Headline findings (read these first)

1. **A whole-database backup already exists as a CLI script.** `scripts/export-backup.mjs` (commit
   405a27f, built with share tokens) runs SELECT-only over every table and writes
   `backups/<stamp>/<table>.json` + `_manifest.json`. It has been run 3 times (2026-09-10 twice, and
   2026-10-12 for §5.cs Q10). So the BACKLOG "floor" ("one download everything as JSON per table") is
   **already met for Craig**, but only from his machine, by hand, with no schedule.
2. **That backup is SILENTLY TRUNCATED.** The 2026-10-12 manifest has `score_audit` at **exactly 1000
   rows**: the PostgREST default `max-rows` cap. The script does a bare `select('*')` with no paging,
   so every table past 1000 rows loses its tail with no error. Today only `score_audit` hits it
   (pool_games 68, tournaments 17, game_scores 131, players 86, roster_groups 7, solo_rounds 2,
   course_scorecards 1). This is a mechanical fix (page with `.range()` until a short page), but it's
   in a script that reads live data, so it's listed rather than fixed.
3. **The script skips `feedback_notes`** (added 2026-09-10, after the script's TABLES list).
4. **The same 1000-row cap applies to the app's own hydrates.** `hydratePoolGames`,
   `hydrateTournaments`, `hydrateRoster`, `hydrateGroups`, `hydrateSoloRounds` all `select` without
   a range. `game_scores` is fetched per matchup (safe), but when `pool_games` passes 1000 rows,
   Home, the group page and stats will silently drop the oldest games, and an in-app export built on
   them would too. Far off at 68 rows, but it's a "money history survives" risk. Worth a FINDINGS
   entry (P2, track).
5. **The money itself is never stored.** No table holds "who won $X". Money is DERIVED: config in
   the game blob (`pool_games.data`, `tournaments.data`) + strokes in `game_scores` → the engine
   (`stats-ledger.ts buildGameLedgers` → `computeMoneyLedger` / `computePoolResult`). So "money
   history survives" means the export MUST carry the scores alongside the games. Adding the computed
   ledger is optional and needs a call (Q3 below).
6. **There are 6 persistence files, not 5.** `src/lib/feedback.ts` also calls Supabase
   (`feedback_notes`). AGENTS.md's "5 lib files" is stale by one. Doc drift only.
7. **One per-game export already exists**: `/tournament/[id]` "More ▾ → Export"
   (`exportTournament()` in tournament-state.ts + a client Blob download). Pools have nothing. There's
   also `importTournament()`, whose only caller is the legacy page (FINDINGS ~1684 flags it). Q10 says
   READ-ONLY, so no import in this work.

## 1. Tables and what they hold

| Table | Shape | Written by | Holds | Money history? |
|---|---|---|---|---|
| `pool_games` | `id, data JSONB, updated_at` | pool-game.ts | every wizard game (pools + mode-engine): players, teams/sides, course, money config, series stamp, `createdByGhin`, `sourceGroupId`, share token | **yes, config** (entry, legs, money model, junk) |
| `tournaments` | `id, data JSONB, updated_at` | tournament-state.ts | legacy tournaments: teams, rounds, matchups, bonuses, money games | **yes, config** |
| `game_scores` | `matchup_id, data JSONB, updated_at` | tournament-state.ts (`merge_game_scores` RPC, upsert fallback) | hole scores per foursome; pools key by `team.matchupId`, tournaments by matchup id | **yes, the strokes money is computed from** |
| `score_audit` | `id bigserial, matchup_id, player_id, hole, old_score, new_score, changed_at` | tournament-state.ts | append-only log of every score edit | yes, provenance for disputes ("a score fixed after the fact") |
| `players` | `id, ghin_number, name, handicap_index, gender, default_tee_*, hcap_updated_at, owner_ghin` | roster.ts | the roster (shared base + per-organizer scoped) | no (identity) |
| `roster_groups` | `id, name, owner_ghin, player_ids[], defaults JSONB` | roster-groups.ts | named groups + Format Library entries (`defaults.kind:'format'`) | no, but it's how money is grouped (§5h) |
| `solo_rounds` | `id, data JSONB` | solo-round.ts | trainer rounds / shot logs | no |
| `course_scorecards` | `course_id, alignment, card_url` | (course lookup) | course reference data | no |
| `feedback_notes` | `id, author_ghin, author_name, game_id, path, note` | feedback.ts | in-app feedback | no |

Every table's RLS is `FOR ALL USING (true)` with the anon key (§5c). Any client can already read
everything; visibility is a DISPLAY rule enforced in the lib list functions.

## 2. Who may see what today

- **App owner** (`isAppOwner()` = 'full' access cookie AND GHIN == `NEXT_PUBLIC_OWNER_GHIN`,
  sandbox 1234567): everything. Pages branch `isOwner ? getPoolGameList() : …VisibleTo(viewer)`.
- **Member** (invite code, GHIN resolved, §5.bi): games where `gameVisibleTo(g, viewer)`
  (`lib/game-visibility.ts`, pure): they created it, OR a player matches their GHIN / roster id, OR
  `sourceGroupId` is a group whose roster includes them (§5.cb). Owning a group ≠ membership (§5.cj).
- **Code-holder with no GHIN**: the `gameVisibleTo` result is false for everything. Pages redirect to
  login (`/home` needs `ghin_token`).
- **Share-link visitor** (`?key=`): that one game only (`shareTokenMatches`). No Home.
- **Money (§5h/§5.cj)**: a group member sees the whole group's ledger. Outside groups, only games the
  viewer played. "Just me" crosses groups. NOTE: §5.cj says the stats game lens = "group games +
  games played", but `stats/page.tsx` actually feeds it `getPoolGameListVisibleTo`, which also
  includes games the viewer CREATED but didn't play. Those games' money is visible on their hub
  anyway, so it's harmless, but an export that includes the computed ledger should state which set
  it uses.
- **Roster**: `getRoster()` = shared base + own scoped (owner: all). **Groups**: `getViewableGroups()`
  / `getViewablePlayerGroups()` = own + member-of (owner: all).
- **Solo rounds**: `getSoloRoundListForGhin(ghin)` (owner: `getSoloRoundList()`).
- **Feedback**: owner only (`/home/feedback` gates on `isAppOwner()`).

**Loaders that already enforce it** (what Home `home/page.tsx:107-140`, the group page
`home/groups/[id]/page.tsx:80-85` and stats `home/stats/page.tsx:66-90` use): `hydratePoolGames`,
`hydrateTournaments`, `hydrateGroups({viewerGhin,isOwner})`, `hydrateRoster(...)`, then
`getViewer(ghin)` → `getPoolGameListVisibleTo` / `getTournamentListVisibleTo` → `loadPoolGame` /
`loadTournament`. Scores: `fetchGameScores(matchupId)` (one call each, as `stats-ledger.ts:85` does)
and `fetchScoreAudit(matchupIds)` (batched `.in`).

## 3. Candidate shapes

| | Shape | Who | Built from | New Supabase call site? | Tradeoffs |
|---|---|---|---|---|---|
| **A** | "Download my games" on Home: one JSON file of everything the signed-in user can already see (games + their scores + audit, groups, visible roster, own solo rounds) | any signed-in GHIN user; the owner gets everything | the existing visible-list loaders + `fetchGameScores` | none needed (optionally a batched `fetchGameScoresFor(ids)` using `.in`, inside tournament-state.ts) | Spreads the backup across every friend's phone: real "survives" insurance that needs no Craig action. Can't leak more than Home already shows. For the owner it's effectively B (all games/scores) but not a raw table dump (misses orphan rows, `course_scorecards`, `feedback_notes`). Restore would need a script; Q10 says read-only anyway. |
| **B** | Owner-only full dump of every table, in app | owner | `select('*')` per table | **yes**, a raw per-table select. To stay in the libs, each lib needs an `exportRows()`; `score_audit` and `course_scorecards` have no full-table reader today | Duplicates `scripts/export-backup.mjs`. Must page past 1000 rows. Only protects data if Craig remembers to press it. |
| **B′** | Keep the CLI script as the owner's raw backup, and fix it: paging, `feedback_notes`, a row-count check that fails on `rows === 1000` | Craig, local | the script (outside `src/`, not app code) | n/a (not `app/`) | Cheapest true backup. Truncation is the bug that matters today. Still manual. "Periodic" would mean a scheduled job or Supabase's own backups (plan-dependent, §5c asked to confirm retention; never answered). |
| **C** | Per-game export on the pool hub (mirrors the tournament "More → Export") | anyone who can open the hub (incl. share-link visitors) | `loadPoolGame` + its matchups' scores | none | Small and obvious, and gives pool/tournament parity. But it's not a backup: nobody exports 68 games one by one. A share-link visitor could export that one game, which they can already see. |
| **D** | Per-group export on the group page | group members (read-only allowed, §5.cj) / creator | `getViewer` + `ledgersForGroup`-style filter | none | Matches §5h exactly ("this group's money"). Good for the season-ledger use case. Fragments the backup across groups and misses "Other games". |

**The sandbox supports all of A, C and D unchanged.** The fake handles `select('id, data')`,
`select('*')`, `.eq().single()`, `.in()` and the append-log `score_audit`. Playwright can catch the
file with `page.waitForEvent('download')` (no existing spec does yet). B in-app would need
`.range()` added to the fake if paging is implemented.

No shape needs RLS changes or a service key. All read with the anon client, as the app already does.

## 4. Craig's calls vs obvious

**Obvious (no question):**
- Read-only: no import (Q10).
- Scores travel with games, since money is derived (finding 5).
- Client-side Blob download (the pattern exists on `/tournament/[id]`).
- Persistence stays in the lib files.
- Pure serializer in `src/lib`, vitest-tested.
- The export respects `gameVisibleTo` for non-owners. Never more than Home shows.
- Fix the script's truncation + missing `feedback_notes` (a mechanical correctness fix to an
  already-approved backup tool; flag it, since it reads live data when run).
- File name like `golf-games-YYYY-MM-DD.json`, with a `schemaVersion` + `exportedAt` + `exportedBy`
  header.

**More than one defensible answer (Craig's batch):**
- **Q1 Shape/audience:** A (every user downloads what they can see) vs B′ only (owner backup via the
  fixed script) vs both. Recommendation: **A + B′**. B′ is the real backup; A makes it survive
  without Craig and serves "continuing" (a friend keeps their season).
- **Q2 Where the button lives:** Home footer link ("Download my games (JSON)") vs the group page
  (per-group, D) vs a settings/account spot (there's no settings page today; adding one is a design
  smell per AGENTS). Recommendation: a quiet link at the bottom of Home, next to the owner-only
  feedback link.
- **Q3 Include the computed money ledger** (per-player nets per finished game, from
  `buildGameLedgers`)? It makes the file human-readable and is what "money history" means to a
  friend. But the ledger is derived and can change when the engine changes (it changed on 2026-10-12,
  §5.cs Q3). Is it a snapshot "as computed on export day", or omitted (raw only)? If included, which
  set: §5.cj's "group + played" lens or everything visible? Recommendation: include, labelled
  `computedAt` + "derived, raw scores are the source of truth", over the visible set.
- **Q4 Roster in a member's export:** other players' GHIN numbers + handicap indexes (the visible
  roster) vs only the players who appear in the exported games vs none. It's limited PII (§5c), but
  it's a bulk-download of it. Recommendation: only the players inside the exported games (already
  embedded in each game blob), so no separate roster section for members. The owner gets the full
  roster.
- **Q5 "Periodic":** is a manual press enough for beta #8, or does Craig want a scheduled backup
  (Supabase plan backups, or a scheduled script on his machine)? §5c asked to "confirm what retention
  the Supabase plan gives" and it was never answered. That's a dashboard check only Craig can do.
- **Q6 Per-game export on the pool hub (C):** add it now for parity with tournaments, or skip
  (the hub "More" menu is already crowded)?

## 5. Minimal build plan (recommended A + B′)

1. **Pure serializer:** new `src/lib/export-data.ts`, no I/O:
   `buildExport({ viewer: {ghin, name, isOwner}, poolGames, tournaments, scoresByMatchup, audit,
   groups, soloRounds, ledgers?, exportedAt }): ExportFile`. It returns
   `{ schemaVersion: 1, exportedAt, exportedBy, games: [{kind:'pool'|'tournament', game, scores:
   {[matchupId]: …}, audit: […]}], groups, soloRounds, money? }`. Format Library entries are kept
   under `formats`. `exportedAt` is passed in (no `Date.now()` in lib). Plus
   `exportFileName(dateIso)`. **Vitest** `export-data.test.ts`:
   - a pool + a tournament fixture round-trip through `JSON.parse(JSON.stringify())` unchanged;
   - every pool team's `matchupId` and every tournament matchup has its scores attached;
   - a member viewer's export never contains a game `gameVisibleTo` rejects (owner gets all);
   - if Q3 = include, the ledger in the file is zero-sum per game.
2. **Loader (persistence, in the libs):** a batched `fetchGameScoresFor(matchupIds)` in
   `tournament-state.ts` using `.in('matchup_id', ids)`, mirroring `fetchScoreAudit`. Optional; the
   per-id `fetchGameScores` loop works today. No new tables touched. The page assembles inputs via
   the same hydrate → `getViewer` → `…VisibleTo` → `load*` chain Home already runs.
3. **Button:** `src/app/home/page.tsx`, a footer link "Download my games (JSON)". On click: gather,
   `buildExport`, Blob + `a.download` (copy `/tournament/[id]` lines ~364-371, ideally into a tiny
   shared `downloadJson(name, obj)` helper in `src/lib`, which is DOM-only and not persistence). The
   label follows UI_CONVENTIONS vocabulary.
4. **e2e** `e2e/json-export.spec.ts`:
   - seed a finished game via `/sandbox` and `waitForURL('/home')`, asserting a Home-only element;
   - click the link and `page.waitForEvent('download')`, then read the file;
   - assert `schemaVersion`, the seeded game id present with non-empty scores;
   - a second test as a non-owner member asserts a game from a foreign group is ABSENT.
5. **B′ (script, not app code):** page `select('*').range(i, i+999)` until a short page; add
   `feedback_notes`; the manifest flags any table whose count is a multiple of 1000 on a single page.
   Don't run it as part of verify (it reads live). Craig runs it.
6. **Docs:** a FINDINGS entry for the 1000-row truncation (script = fixed by B′; app hydrates = P2
   track); fix AGENTS.md "5 lib files" → 6 (feedback.ts); index line for whatever Craig decides.

Size: S–M (serializer + test ~1 h, button + e2e ~1 h, script fix ~20 min). The only `src/` Supabase
change is the optional batched score fetch inside tournament-state.ts.
