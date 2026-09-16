# Next session: Craig walks the collapse plan → build Phase 1 slice 1 on approval

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first, then `.claude/plans/game-structure-collapse-plan.md` WHOLE (it is
the plan; ~300 lines). `GAME_STRUCTURE_DESIGN.md` is the brief behind it; the sweep
evidence with file:line references is `.claude/plans/collapse-sweeps-2026-09-15.md` —
grep it, don't read it whole (~850 lines).

**State (2026-09-16):** branch `ui-simplification-2026-09-15`, working tree CLEAN. Its two
newest commits are the F-068 money fix (code + tests + seed) and the collapse plan +
findings F-063…F-068 (docs). Not merged to main; don't merge/push unbidden (§5.ab) —
Craig decides when nobody is mid-round. Course-data audit stays PARKED. Start here:
**Step 1 below** (walk the plan with Craig).

## The promoted work

**Step 1 — Craig walks the plan.** Present §8's five questions one at a time (his stated
preference). The ones that change Phase 1: Q1 (overlap row → classic or sides), Q2
(offer "Mixed foursomes" when teams could walk together), Q5 (vocabulary: "team"
everywhere). Q4 is the F-063 live-scoring call (interim fixes now? per-cell session?).
Record answers as §5.bm in DECISIONS_ARCHIVE.md + index line, in-session.

**Step 2 — on approval, Phase 1 slice 1 (zero UI):** `src/lib/game-structure.ts`, pure:
`structureOptionsFor(n)` (reuse `groupShapesFor(n, {min:1, minGroups:2})`),
`structureOf(game)`, `routeContainer(draft)`, `moneyModelsFor(container, N)`. Table tests:
every row of plan §3.3 routes as specified, and every routed game's `computeGameResult`
is zero-sum under both money families. Prove a test can fail (§5.z). Then `npm run
verify`, one commit.

**Step 3 — slices 2–5** (structure + scoring steps and draft v2 → teams (N,K) + tee-sheet
question → routed money step, F-042 toggle removed → e2e re-point + one spec per routing
row). One commit each. The 12 specs that `selectOption` a mode id are the blast radius;
extend `e2e/helpers.ts` with `chooseStructure`/`chooseScoring`, don't re-inline.

**Stop-and-ask lines:** no engine, storage or hub change in Phase 1 (the plan's promise —
if a slice seems to need one, stop). F-063 fixes are persistence → separate approval.
F-062 A/B/C still waits.

## Waiting on Craig

BACKLOG.md table: F-022 on-course stroke check; §7 q4; F-033 answer to the friend;
F-062 A/B/C; F-063 A now / C session; optional extra course payloads.

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
- **Write plans into the repo's `.claude/plans/`**, never `~/.claude/plans/` — two earlier
  plan files referenced from BACKLOG were lost that way.
- **Delegated sweeps report doc status, not code status** — both sweeps called F-060 opt B
  open when the commit was on the branch. Verify a "still open" claim against `git log`.
- If a session dies mid-work, its subagent reports survive in
  `~/.claude/projects/<project>/<session-id>/subagents/*.jsonl` — recover, don't rerun.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
