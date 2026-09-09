# Next session: the wizard track (§5.av formats in the game picker), or whatever Craig brings

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **F-022..F-026 are ALL FIXED and committed** (2026-09-09, this branch):

- **F-022** — `applyAllowance` is now **unrounded-first** (`CH × allowance`, round once). Craig's
  call, §5.bb, backed by USGA guidance + his Spring Creek GHIN report. **He wants it re-verified
  on-course against the GHIN app** ("we need to test this out to make sure — it really should
  match"). If GHIN disagrees, §5.ba requires screenshots of BOTH shapes (head-to-head AND
  off-the-low, sub-100%) before touching the math again — the Aug 3e8ace1 Cory case only
  reproduced with round-first, so the tension is real, not resolved.
- **F-023 part A** — `teeHasRating` + amber "no slope/rating on this tee — using index (N)" in the
  wizard. **Part B still blocked**: need the real `GetCourseDetails` payload for The Meadows
  (Greenbrier, WV) — have Craig search it with the network tab open, or add a dev-only log. Do NOT
  guess GHIN's shapes.
- **F-024** — signed money rounds the magnitude everywhere; UI_CONVENTIONS §1 has the rule; e2e
  pins the zero-sum strip.
- **F-025/F-026** — individual-game review step says "Players" + the stakes line, with "Save this
  format" beside it (§5.ax part 4 closed). Fixing F-026's e2e exposed that `stakesSummary` read a
  key no mode declares (`dollarsPerSkin` vs skins' `skinValue`) — fixed; the unit test had pinned
  the wrong key vacuously. Lesson re-earned: the e2e against the REAL wizard bag caught what the
  unit test couldn't.

**State:** branch `captains-deal-and-game-rename` has §5.ay + §5.az + all five F-fixes, verify
green — awaiting Craig's review/merge. Check `git branch`; if merged, branch fresh off `main`
(§5.ab). One trap hit twice this session: a stale `next dev` on port 3200 makes every e2e time
out at ~30s (playwright reuses the existing server) — `netstat -ano | grep :3200`, kill the PID,
rerun.

## Open work (pick with Craig)

- **§5.av + §5.au — the wizard track, paused:** formats in the wizard's game picker, and the
  step reorder. This was "next up" before the F-022..F-026 interrupt.
- **§7 q4** — dark = live, light = setup; probably just needs confirming.
- **Merge-audit polish:** loss-red leg results on the dark board (§5.ak), "Sides / Match" as a
  category label, the `70, 30` mini-DSL, three renderings of course handicap.
- **Walks not yet captured:** walk 2 stopped at the group format sheet; "create group mid-wizard"
  and format-tap → confirmation are uncovered.
- **Home-screen/Event plan** (approved, not built) — fresh session, plan file
  `.claude/plans/adaptive-squishing-locket.md`.

## Rules that keep earning their place

- **The GHIN app outranks the rule book** (§5.ba); §5.bb records the current allowance order and
  the pending on-course verification.
- **Read the history before re-fixing** (`git log -S`).
- **Look at the screen** — F-024/25/26 were invisible in code review, obvious in screenshots.
- **Both sides of every branch**; classic pool keeps "Foursomes", individual games say "Players".
- `npm run verify` must exit 0 before each commit.
