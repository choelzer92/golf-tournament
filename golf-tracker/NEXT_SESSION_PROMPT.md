# Next session: build Event spine slice 1 (goldens first), then Craig's open picks

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

**State (2026-09-28):** branch `gate-speed-2026-09-27` (NOT merged, NOT pushed; §5.ab: never merge or push
unbidden). The branch carries:
- the gate speed-up: 2 Playwright workers and `verify:quick` (§5.bu);
- the Phase 2 residue (f3321da), F-070 (9e1e9ae) and F-062 A (9c70565);
- F-098, plus handicaps in every engine (6509439, §5.bv);
- **the team field cap removed** (41d3987): 32 players / 8 foursomes / 16 teams, zero-sum pinned in
  `team-field-32.test.ts`;
- F-099, the compact phone step bar.

**FIRST: run the full gate once.** The 2026-09-28 run was killed for low system memory partway through e2e; tsc, build and 2179 unit tests had passed (`.claude/verify-2026-09-28-final.log`). Each commit passed its own checks (verify:quick 220/220 for the cap; the F-099 spec 2/2). Run it with `PW_WORKERS=1`. Whether to merge is Craig's call. Read
`AGENTS.md` first, then `DECISIONS.md` whole.

**Craig's standing direction (§5.bv):** get the back end and the app working properly first. A full UI
revamp comes later, since the UI is what will attract users; until then UI work is fixes and consistency only.

## Step 1 — Event spine slice 1 (APPROVED §5.bu, `.claude/plans/event-spine.md` §3)

Two parts, both approved:
- a tournament owner, writers first;
- a pure N-way read adapter, `teamsOf`/`computeStandingsN`.

It changes no stored shape and no UI, and Pool is untouched. Legacy owner-less tournaments stay visible to
everyone (plan §4 option A).

**Goldens first (§5.z):** pin today's 2-team `computeStandings` output before writing the adapter, then
prove the adapter reproduces it exactly and handles 3+ teams zero-sum. Persistence stays inside
`tournament-state.ts`. The sandbox fake must round-trip the owner field. Nothing writes to live data.

## Step 2 — ask Craig outright (§5.bo), build what he picks

The options are in FINDINGS:
- **F-101 a** [P1] (scorecard team rows): a 2-team card whose teams span groups computes its team rows
  from its own foursome only. Rec A: use the engine's rows.
- **F-101 b**: a player added on the hub mid-round joins no team. Rec A: ask which team.
- **F-101 c** (scoring rule): a hole counts only once every team has posted it, so staggered groups wait
  on the last. Rec A: keep the rule and label it.
- **F-101 d**: should individual modes (skins, Stableford, stroke play) go past 4 players for tournament
  fields?
- **F-100**: the iPhone keypad has no "+". Rec A: a ± toggle.
- **F-069** (scoring): refuse or default a non-`TeamFormat` string.

## Step 3 — slack

The F-101 e polish list; the merge-audit polish rows in BACKLOG.

## Waiting on Craig

- F-022, the on-course stroke check against the GHIN app; include a plus-handicap player now (F-098).
- F-033, the answer to the friend.
- §7 q4.
- The picks above.
- Merging this branch.

## Traps that keep biting

- **Two gate tiers.** `npm run verify:quick` per commit: `VQ_BASE=HEAD` picks only uncommitted
  changes, `-- e2e/x.spec.ts` adds specs, `-- --list` shows the pick. `npm run verify` is the full gate,
  run ONCE before handoff.
- **Never poll a gate.** Background it with `; echo "VERIFY_EXIT=$?" >> log`, end the turn, and read the
  tail when notified.
- **Use `PW_WORKERS=1`** when the machine is busy. Windows once killed a full gate for low memory. The
  full gate takes ~17–20 min on 1 worker (222 e2e), and verify:quick often picks ~200 specs anyway.
- **Do NOT edit app code while a gate runs** (the e2e server hot-reloads). Markdown is safe.
- **Before a gate, kill hand-started dev servers AND `rm -rf .next`.** Port 3000 is Craig's; kill 3200
  by PID (`netstat -ano | grep ":3200 .*LISTENING"` → `taskkill //PID <pid> //F //T`), not by
  `//IM node.exe`.
- **The git root is one level up:** paths in `git add` are relative to golf-tracker/. CRLF warnings are
  harmless.
- **Python edits:** write the script to `.claude/tmp_*.py`, run it, delete it. Matches on comments that
  wrap across lines fail, so use the Edit tool then. A "�" in a traceback is console-only.
- **Editor diagnostics lag behind edits.** Trust `npx tsc --noEmit`.
- **Uncapped modes:** `playersMax` can be `Infinity`. Use `testFieldMax(mode)` in tests and
  `playerRangeText` in copy, never `Array(playersMax)`.
- **Side ids** go through `sideIdAt(i)` (a…z, then s27…), not `String.fromCharCode(97 + i)`.
- **Test cards must differ between partners.** A pattern repeating every 4 players gave partners 8 apart
  identical cards (`% 5` fixes it).
- **Playwright strict mode:** use `exact: true` when one label prefixes another, and `.first()` for
  repeated text. On phones the full step bar is hidden (F-099), so assert the step with
  "Step N of M · Name".
- **Wizard helpers** in `e2e/helpers.ts`: `addPlayers`, `toScoringStep(page, 'teams:4+4+4')`,
  `chooseSolo`, `chooseMoney`. An all-singles teams structure exists only for n=2; bigger singles fields
  are `solo`, which caps at 4.
- Sandbox owner is always GHIN 1234567. The big-field seed is "§5.bv: 32 players, 8 foursomes, 16 pairs".
- Plans go in the repo's `.claude/plans/`.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
