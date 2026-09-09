# Next session: fix F-022..F-026 (handicap-vs-GHIN, silent rating fallback, review-step gaps)

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md`, then **`FINDINGS.md` F-022 through F-026** (the five findings this session
fixes — each has options and a recommendation), then **`DECISIONS.md` §5.ba** (the GHIN rule
that governs F-022). That's the reading list.

**State:** branch `captains-deal-and-game-rename` has §5.ay (captains' deal) + §5.az (pool→game
copy) built and green, plus the five findings recorded — awaiting Craig's review/merge. Check
`git branch`; if merged, branch fresh off `main` (§5.ab). `npm run verify` is green and starts
its own sandbox. The exploratory walk that surfaced F-024..F-026 is `e2e/user-walk.spec.ts`;
its screenshots are in `e2e/screenshots/walk-*.png` (regenerable).

## The work, in order (Craig approved fixing ALL of these)

Easiest first, hardest-blocked last. One focused commit per fix; verify green before each.

1. **F-024 — per-person money rounding breaks visible zero-sum.** `Math.round(±12.5)` rounds
   the two signs apart, so the leaderboard strip shows +$13×4 / −$12×4 (= +$4). Fix per option
   A: round the magnitude — `money()` in `pool/[id]/leaderboard/page.tsx:35`. **Grep every
   display path that `Math.round`s signed money** (the scorecard PER PERSON block has its own
   formatter with the same bug — walk-22's text dump shows +$13/−$12 there too). Unit-test the
   symmetric-rounding helper if you extract one; e2e-assert the strip sums to zero on the seeded
   mid-round pool (`F-024: …`).

2. **F-025 — skins review step says "Foursomes" / "Group" / combined CHcp 40.** Option A:
   individual games get F-018's treatment — section reads "Players", no combined handicap, group
   card only when several playing groups exist. The guard today is `!isWithinGroupReview` at
   `app/pool/new/page.tsx:3864`; individual games fall through to the classic-pool block. Both
   axes of the review step must be compared after (the one rule: check both sides of the branch).

3. **F-026 — no stakes on an individual game's review step.** Option A: render
   `formatSummaryLine` (`game-modes/summary.ts` — pure, tested) under the game name on review.
   **This is also where §5.ax part 4 wants "Save this format"** — if the summary line lands
   there, adding the save button next to it closes that loop; check with Craig only if the save
   UX needs decisions beyond "button that saves the current settings as a format".

4. **F-023 — silent slope/rating fallback (Meadows, Greenbrier WV).** Option C = A now, B later:
   - **A now:** when a player's tee has no usable Total rating, SAY SO where the handicap
     displays ("no slope/rating on this tee — using index") instead of printing a confident
     number. The compute fallback lives at `getPoolPlayingHandicap` (`lib/pool-game.ts:603-605`);
     the display sites are the wizard field list (`Course HCP: N`) and anywhere else that renders
     a course handicap. A small helper like `teeHasRating(player, course)` keeps the check in one
     place.
   - **B later (blocked):** widening the parse needs the real GHIN `GetCourseDetails` payload for
     The Meadows. Ask Craig to search the course in the app with the network tab open, or add a
     dev-only log and have him search it once. Do NOT guess GHIN's alternate shapes.

5. **F-022 — 90% strokes disagree with the GHIN app (BLOCKED on evidence — do not change math).**
   §5.ba: the GHIN app is the reference implementation, full stop. But BOTH rounding orders have
   a verified match-GHIN case at the same course (commit `3e8ace1`, 2026-08-07, matched GHIN with
   round-first; Craig's 2026-09-09 report matches unrounded-first). The Aug case was off-the-low
   front-9; the Sep case reads like a full-18 head-to-head difference — they may go through
   different GHIN features. **Needed from Craig before any change:** GHIN-app screenshots at 90%
   for (a) the two players' playing handicaps head-to-head and (b) an off-the-low-style field,
   with exact tees + indexes. When the evidence is in: fix `applyAllowance`
   (`game-state.ts:118`) to whichever order GHIN shows, re-derive `buildHcapMap`'s off-the-low
   order note (`pool-game.ts:640-658`), pin the exact Spring Creek example in a test, and expect
   the 3e8ace1-era tests pinning round-first to need rewriting — that's the spec changing, not a
   regression. If the two GHIN features genuinely round differently, STOP and record it; that's
   a design question for Craig, not a judgment call.

## Rules that keep earning their place

- **The GHIN app outranks the rule book** (§5.ba) — and "we matched GHIN once" is evidence, not
  a rule; the app in his pocket today is the reference.
- **Read the history before re-fixing.** F-022's "obvious" fix was a revert of a deliberate,
  verified 30-day-old fix in the same file for the same course. `git log -S` found it in one call.
- **Look at the screen.** F-024/F-025/F-026 were all invisible in code review and obvious in a
  screenshot. Re-run `e2e/user-walk.spec.ts` after fixing and eyeball the captures.
- **Mutation-prove any claim a user acts on** (§5.z); money fixes get a zero-sum assertion.
- **Both sides of every branch** — F-025 exists because F-018 fixed one axis and not the other.
- `npm run verify` must exit 0 before each commit.

## Also open (not this session unless Craig says)

- §5.av (formats in the wizard's game picker) + §5.au (the reorder) — the wizard track, paused.
- §7 q4 — dark = live, light = setup; probably just needs confirming.
- Merge-audit polish: loss-red leg results on the dark board (§5.ak), "Sides / Match" as a
  category label, the `70, 30` mini-DSL, three renderings of course handicap.
- Walk 2 stopped at the group format sheet; walks for "create group mid-wizard" and the
  format-tap → confirmation path are still uncaptured.
