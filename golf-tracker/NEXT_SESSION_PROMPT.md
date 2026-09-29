# Next session: plus handicaps everywhere, then big fields (F-101), then individual modes past 4

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

**State (2026-09-28):** branch `gate-speed-2026-09-27` (NOT merged, NOT pushed; §5.ab: never merge or push
unbidden). The branch carries:
- the gate speed-up: 2 Playwright workers and `verify:quick` (§5.bu);
- the Phase 2 residue (f3321da), F-070 (9e1e9ae) and F-062 A (9c70565);
- F-098, plus handicaps in every engine (6509439, §5.bv);
- **the team field cap removed** (41d3987): 32 players / 8 foursomes / 16 teams, zero-sum pinned in
  `team-field-32.test.ts`;
- F-099, the compact phone step bar (6228d82).

Read `AGENTS.md` first, then `DECISIONS.md` whole, then archive **§5.bv and §5.bw** in full. They are
this session's brief: Craig's answers in his own words.

**Craig's direction:**
- **Configurable to whatever the organizer wants, within reason.** Teams spread across foursomes are
  first-class. The reference is how the old Hogs v Dawgs tournaments were set up (the `Tournament`
  shape in `lib/tournament-state.ts`; the hype page names them).
- **Scale target: a member-guest**, 72 teams of 2 = 144 players, about 36 foursomes, eventually cut into
  flights. Test big-field work at 144 as well as 32. Keep flights in view (a flight = a subset of sides
  with its own standings) but don't build them yet.
- **Back end first.** A full UI revamp comes later; until then UI work is fixes and consistency only.

## Step 0 — the full gate, once

The 2026-09-28 run was killed for low system memory partway through e2e. tsc, build and 2179 unit tests
had passed (`.claude/verify-2026-09-28-final.log`), and each commit passed its own checks. Close other
apps, kill the 3200 server by PID, `rm -rf .next`, and run `PW_WORKERS=1 npm run verify` in the
background. If it's green, the branch is ready for Craig's merge call.

## Step 1 — plus handicaps, every situation (§5.bw 6; Craig: "lets make sure we figure out + handicap situations")

Start with a read-only sweep (delegate it) of every place a plus index is:
- entered: the add-player box, hub field editor, roster, GHIN import;
- stored and shown: "+2.1", never "-2.1" or "2.1", on chips, cards, the leaderboard, prints;
- allowed: 90% of +3 and similar, unrounded-first (§5.bb);
- split: off-the-low with a plus LOW player, where everyone gains strokes (§5.bv 1);
- based on 9 holes: both handicap bases;
- fed into team formulas: scramble and alt-shot with a plus member, combined HCP, the balancer and
  captains;
- used for targets: a quota or Chicago target of 36/39 − (−2) = 38/41;
- given back in each engine: pool, sides, individual modes, the legacy tournament (F-098 "Left" list:
  its pages still hide give-back dots).

Write the gaps into F-098 or a new finding; fix what's mechanical. Anything that changes the MATH
beyond §5.bv is stop-and-ask. Then build **F-100 A**, a ± toggle beside the handicap box (the iPhone
keypad has no "+"). Pin every case in unit tests, add e2e for the toggle, and use the sandbox seed
`pool-plus-handicap`.

## Step 2 — F-101 a/b/c + F-069 (all DECIDED §5.bw)

- **a [P1]:** a card on a team game whose teams span foursomes shows the whole team's rows from the
  engine (`sideBreakdown`), not this foursome's recompute (`game/play/page.tsx` ~1392). This changes how
  the scorecard computes team rows, and Craig has approved it. Pin the agreement between card and engine.
- **b:** a player added on the hub mid-round is asked which team they join (`field-editor.tsx`
  `addPlayer`).
- **c:** keep the all-teams-posted rule for legs and per-hole results, and label it "waiting on
  Group N". Hide-holes stays OFF when teams span foursomes: it's anti-cheating for teams that ARE their
  foursome. Check that nothing defaults it on or nudges toward it for spread teams.
- **F-069:** keep the best-ball default. Add a unit pin that every format the wizard or hub offers is
  computed.

## Step 3 — F-101 d: individual modes past 4 (DECIDED YES §5.bw 5)

Skins, Stableford, low total and quota take a whole field across tee groups, the way `team-2v2` does.
Wolf and Nines keep their caps. Today `buildGameModeContext` reads only the first matchup for
individual modes, and `structureOptionsFor` offers solo only at ≤4. Write a short plan in
`.claude/plans/` first, then build goldens first: 4-player results unchanged, zero-sum at 32 and 144.
Walk the leaderboard at 144 players.

## Then — Event spine slice 1 (APPROVED §5.bu, `.claude/plans/event-spine.md` §3)

Tournament owner (writers first) plus the pure N-way `teamsOf`/`computeStandingsN`. Goldens of today's
2-team standings go first. No stored shape changes and no UI. Keep Hogs v Dawgs and flights in mind for
the N-way shape.

## Slack

The F-101 e polish list, starting with the scale risks at 144 (`scoreAt`, the balancer deadline,
rendering); the merge-audit polish rows.

## Waiting on Craig

- F-022, the on-course stroke check against the GHIN app; include a plus-handicap player.
- F-033, the answer to the friend.
- §7 q4.
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
