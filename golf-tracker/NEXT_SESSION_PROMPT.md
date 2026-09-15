# Next session: DEEP PLAN the game-structure collapse (§5.bk) — document-first, no code

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first, then `GAME_STRUCTURE_DESIGN.md` WHOLE (it's short and it is the
brief). Grep DECISIONS_ARCHIVE.md §5.bk for the full decision. Delegate broad code
sweeps to subagents.

**State (2026-09-15):** §5.bj review session merged to main (aa4cd48). A second branch
`ui-simplification-2026-09-15` carries F-060 opt B (one build trigger + hub ✓ parity),
the F-015 status correction, new findings F-061/F-062, GAME_STRUCTURE_DESIGN.md, and
§5.bk — check whether Craig merged it; don't merge/push unbidden (§5.ab). The
course-data audit is PARKED by Craig's call ("wait on the course data") — the Meadows
payload is banked in `course-payloads/` and F-023 records that it's CLEAN (bad numbers
= our side; gender-name collisions are the prime suspect).

## The promoted work: the collapse PLAN (§5.bk — Craig: "deeply plan how this works")

Craig settled the design's four questions (§5.bk): step 2 asks **"How do you want to
compete?"**, fit-based pre-selection, and **pool vs sides collapse into "N teams of K"**
— the money model (pot vs head-to-head) and the teams-align-with-foursomes question
route to the right machinery invisibly. He also named the risk: *"make sure there
aren't any other issues that come out of it."* This session produces the PLAN, not code:

1. **Seam inventory.** Every branch site on the container axis — run UI_MODE_AUDIT.md's
   grep probes (`isSingleGroupGame|isIndividualGame|team-within-group|category ===`)
   plus `matchupId`, `moneyMode`, `potSplit`, `sides`. Table: file, what branches, what
   the collapsed routing must decide there.
2. **Data-model map.** PoolGame classic vs sides games field by field: teams[],
   matchupId, sides[], playing groups (F-019), potSplit vs matchConfig, ballSelection
   vs teamFormat/teamScoreBasis. Which fields become derived, which stay, what a
   "routed" game stores.
3. **Routing rules.** (structure choice × money model × foursome-alignment) → container
   machinery. Must reproduce every game creatable today (e2e list = the spec). Money
   engines DO NOT CHANGE — they get routed to (§5.ad/§5.ae/§5l stay load-bearing).
4. **Risk list.** Live-scoring partitioning (§5l), zero-sum invariants, share links,
   saved formats made under the old picker, the wizard draft schema, leaderboard axes.
   **§5.bl applies (Craig, same day): "best possible way, not just the easiest way" —
   live scoring named first.** Craig's framing: pool live scoring "works pretty well",
   merge RPC was tried before (tournament path) and abandoned — "we should be diligent
   and understand what the real best case is for multiple scorers for multiple
   foursomes." So the plan runs a genuine design-space comparison, not a defense of
   the incumbent: per-matchup row (today — check the TWO-scorers-one-foursome case),
   per-hole/per-cell rows, server-merge RPC, last-write-wins vs merge semantics —
   judged on concurrent edits, latency, offline/cart-path wifi, and recovery.
5. **Screen mocks** of the collapsed flow (structure → scoring → course → tees →
   teams/groups → money) — sandbox screenshots of today's screens annotated, or ASCII.
   Craig walks them before anything is built.
6. **Phase plan** with a first shippable slice. End by writing the plan to
   `.claude/plans/` + updating GAME_STRUCTURE_DESIGN.md, and promoting the first slice.

**Stop-and-ask lines:** anything that would change money/handicap math or stored-game
compatibility (§2). F-061 (canonical game-kind names) is decided BY this design — don't
unify labels first. F-062 opt A/B (course-handicap display/math unification) is a
separate Craig decision — B changes displayed numbers on legacy surfaces.

## Waiting on Craig

BACKLOG.md table: F-022 on-course stroke check; §7 q4; sending the friend the F-033
answer (drafted in the 2026-09-15 wrap-up); F-062 A/B/C pick; optional extra course
payloads (fetch-course-payload.mjs) before the parked course-data audit resumes.

## Traps that keep biting

- **Do NOT edit app code while `npm run verify` runs.** (Markdown edits are safe.)
- **Kill any hand-started dev server AND `rm -rf .next` before `npm run verify`**;
  confirm 3200 free (TIME_WAIT fine). 3000 = Craig's.
- Check verify's own exit code; if backgrounded, capture `$?` INSIDE the command.
- Editor diagnostics lag one edit behind — trust `npx tsc --noEmit`.
- Playwright strict mode: `exact: true` when a label prefixes another.
- Game-mode ids ≠ display names (`stableford-ind`, not `stableford`) — select by VALUE.
- Sandbox owner is ALWAYS GHIN 1234567 (since 2026-09-15), regardless of .env.local.
- e2e specs share `e2e/helpers.ts` — extend it, don't re-inline copies.
- The "CHcp" spelling is e2e-pinned (F-043 chips) — renaming it is an F-061/F-062
  decision, not a typo fix.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
