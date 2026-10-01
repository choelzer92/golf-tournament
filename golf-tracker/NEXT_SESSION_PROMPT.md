# Next session: dedup-audit the 2026-10 roadmap, then polish → §5.cb visibility → first-time ease

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

**State (2026-09-29):** branch `gate-speed-2026-09-27` (NOT merged, NOT pushed; §5.ab: never merge or push
unbidden). The §5.bw session landed on it:
- the plus-handicap sweep (F-102 a–k, §5.bx) and the F-100 A "+" chip;
- §5.by Net | Gross on every format, and §5.bz, the e2e gate on a production-mode sandbox build (~5.6 min);
- F-069 pin, and F-101 a (a30a20b), b (b0a188d), c (b7a7fc9) and d (1f432e8, §5.ca);
- **Event spine slice 1** (the commit after 1f432e8): pure `lib/tournament-standings.ts`, with
  `computeStandings` as its 2-team wrapper, and the owner written on new tournaments.

Read `AGENTS.md` first, then `DECISIONS.md` whole. Grep the archive only for the § you touch
(§5.ca skins, §5.bw big fields, §5.bu the spine).

## Step 1: ask Craig outright (§5.bo). Don't build a guess.

0. **FIRST, the DEDUP AUDIT of `.claude/plans/roadmap-2026-10.md` (§5.cd).** Craig answered the
   roadmap's calls, but wants every item confirmed as real remaining work before anything is built.
   Follow the plan's "Dedup audit" section: give each item a verdict (DONE / PARTLY / OPEN / DECIDED
   AGAINST) with evidence, fill in the table, re-rank, and show Craig. Use Explore agents per phase to
   save context. Then build in his order: Phase D quick polish, then §5.cb visibility, then Phase B,
   then Phase A. Also map the no-GHIN organizer's GHIN dependencies into options (don't build that).

1. **F-103 a is DONE (§5.cc).** The skins board shows Leading, "N of M played" per open hole, and the pot's $ "if it ended now".
2. **Visibility is DECIDED (§5.cb):** a pool or tournament is visible to its owner, every player in it
   (by GHIN), and every member of its source group. Build it in `lib/` (pool-game + tournament-state list
   functions), then wire `/home`, `/dashboard`, `/home/stats`, `/home/groups/[id]`, `/pool`. It widens
   the pool's owner-only list, so the e2e pins on that need updating. **APPROVED 2026-10-01 (§5.cd): build it
   right after the Phase D quick polish.**
3. **Merge the branch?** It's his call (§5.ab). His phone walk is still wanted (§5.y).

## Step 2: F-103 b and F-101 e

- **F-103 b:** the skins card header reads "Stroke Play · Best Net + Best Gross · Full Handicap".
  Check it at 4 players first; it's probably pre-existing.
- **F-101 e, scale at 144** (BACKLOG row). Covers:
  - the linear `scoreAt`;
  - rendering the board and the card at 144;
  - the balancer deadline;
  - palettes wrapping at 6;
  - tied names wrapping;
  - the printed card's team tags;
  - "21th".
- **Walk every screen you touch** at 32 and 144, and screenshot each one.
- **F-103 c:** CTP across tee groups (suspected overwrite). Reproduce it with two tabs first.

## Approved 2026-10-01 (§5.ce): investigate, then plan, then build

Do these after the dedup audit. Each gets an investigation, then a build plan written into the roadmap,
then the build. BACKLOG has the details.
- **Event spine S2:** tournament rounds through `game-modes/`, goldens first. Roadmap Phase E.
- **F-063 C:** per-cell score rows plus an outbox. Roadmap Phase C. Show Craig the live migration
  before it runs.
- **Stroke vs match play handicap investigation:** report only. No math change without Craig.

## Parked

- The course-data audit (parked by Craig).

## Waiting on Craig

- "Your golf" on Home: Craig leans to the 3 most recent. Option B (a Continue card for a live game,
  then recent games with Run it back) was offered 2026-10-01 and is unanswered.
- 2v2 "who plays whom" with 3+ teams: A two games / B a within-tee-group setting (recommended) /
  C custom pairings / D B plus an overall layer. Offered 2026-10-01, unanswered.
- Merging the branch (walk first, or merge now).
- §7 q4.
- The BACKLOG P3 hide-holes wizard question.
- The items in Step 1.

## Traps that keep biting

- **Two gate tiers.** Run `npm run verify:quick` per commit:
  - `VQ_BASE=HEAD` picks only uncommitted changes;
  - `-- e2e/x.spec.ts` adds specs;
  - `-- --list` shows the pick;
  - a change to a shared lib picks 200+ specs, so it runs on the sandbox build.

  `npm run verify` is the full gate, run ONCE before handoff, about 6.5 min on 3 workers.
- **Never poll a gate.** Background it with `; echo "VERIFY_EXIT=$?" >> log`, end the turn, and read the
  tail when notified.
- **Do NOT edit app code while a gate runs.** Markdown is safe.
- **Before a gate, kill hand-started dev servers.** Port 3000 is Craig's. Kill 3200 or 3201 by PID
  (`netstat -ano | grep ":3200 .*LISTENING"` → `taskkill //PID <pid> //F //T`), never by `//IM node.exe`.
- **`SANDBOX_BUILD` must always be defined** (inlined), so the real build dead-code-eliminates the fake.
  `sandbox-seam.test.ts` and `no-sandbox-in-build.test.ts` guard it.
- **A corrupted `.next/dev/types`** (tsc errors in generated files) is fixed with `rm -rf .next/dev/types`.
- **The git root is one level up:** paths in `git add` are relative to golf-tracker/.
- **Python edits:** write the script to `.claude/tmp_*.py`, run it, delete it. An apostrophe inside a
  single-quoted TS string breaks the build (TS1005). Write "has not".
- **Editor diagnostics lag behind edits.** Trust `npx tsc --noEmit`.
- **Uncapped modes:** `playersMax` can be `Infinity` (team-2v2, skins, Stableford, low total, quota).
  Use `testFieldMax(mode)` in tests and `playerRangeText` in copy.
- **Skins across groups (§5.ca):** a hole is open until every tee group posts it. The context carries
  `teeGroups` (only with 2+ groups) and `closed`.
- **Side ids** go through `sideIdAt(i)`.
- **Test cards must differ between players.** Use mod 7 with a per-player term at 144, or skins tie out.
- **Wizard e2e:**
  - Click the "Past games (for recent-course" seed card first, or the course step has no Sandbox National.
  - Find the manual Add button with `manualAddButton`.
  - The helpers are `addPlayers`, `fieldToGameStep`, `toScoringStep`, `chooseSolo` and `chooseMoney`.
  - On phones, assert the step with "Step N of M · Name".
- **Playwright strict mode:** use `exact: true` when one label prefixes another, and `.first()` for
  repeated text.
- **Sandbox:**
  - The owner is always GHIN 1234567.
  - The big-field seeds are "§5.bv: 32 players, 8 foursomes, 16 pairs" and
    "F-101 d: Skins, 32 players, 8 foursomes (staggered)".
- Plans go in the repo's `.claude/plans/`.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
