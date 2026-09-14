# Next session: the walkthrough follow-ups (F-043…F-046), then the merge call

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **Context economy:** read DECISIONS.md whole (short); grep
DECISIONS_ARCHIVE.md by § only when touched. The new findings are F-040…F-046 in
FINDINGS.md — read those six entries in full; they carry Craig's exact words and
the diagnosis for each.

**State:** branch `live-feedback-2026-09-10` (off main, unmerged). **FIRST ACTION:
run `npm run verify`** — the last commit (aefa30c, the F-041/F-042/F-044 language
fixes) passed unit/typecheck/build but its e2e phase was BLOCKED by Craig's own dev
server holding the project dir (Next 16 one-dev-server rule). Two new e2e
assertions in verify-fixes.spec.ts are unverified. Everything before aefa30c is
verified green (137 e2e).
Craig's 2026-09-14 walkthrough produced F-040…F-046. Already FIXED on the branch:
F-035/36/37(partial)/38/39a (quick-fix batch) and the F-041/F-042/F-044
language-level fixes (misfit redirect line, "Who competes against whom?" toggle,
pot-split "usual split" note, 85↔90 note naming its driver). Merge is Craig's call —
he said "maybe it's time" but wanted the walkthrough first; the walkthrough then
produced this batch, so ASK HIM whether to merge now or after these follow-ups.

## The work, in order

1. **F-043 — handicap transparency disclosure** (Craig wants it; display-only).
   A tap/disclosure per player showing the chain:
   `12.4 index → 14.8 course (slope 131) → ×85% → 12.6 → plays off 13`.
   One shared component; surfaces: teams step, sides step, player-details sheet.
   Fold in F-023's "no rating on this tee — using index" honesty. The math lives in
   `getPoolPlayingHandicap` (§5.bb: allowance on unrounded CH, round once) — the
   component must SHOW that order, never recompute differently.
2. **F-046 — repro the saved-format miss.** Sandbox walk: save a format from a game
   ("Save format" on the hub) → does it attach to the group? → new game → pick
   Friday Group on the field step → what does the game step offer? Suspect (c) in
   the finding: attached formats don't surface at the moment the group is chosen.
   Fix = the game step offers the chosen group's formats first, labeled as such.
3. **F-045 — junk defaults** (MONEY-ADJACENT — get Craig's explicit pick first).
   Proposal: classic pool defaults junk to $0/off with an "add bonuses" affordance
   (matching the registered modes' bonuses-off convention); saved formats keep what
   they saved. Needs his call on the 4-way pot split when junk is $0 (fold junk's
   quarter into overall? re-split three ways? his historical table has junk in it).
4. **F-040 — add-player reorder** (his pick pending between options A/B/C in the
   finding; he leaned "name first, GHIN # as bulk fallback, manual gets a no-GHIN
   note"). Option B (reorder + paste-a-list bulk + the note) matches his words
   best. All four surfaces share the stack by copy — change all four or extract.

## The BIG discussion to keep alive (do NOT build it unprompted)

F-041/§5g: Craig's framing — "a pool is effectively just a 4v4 game… choose your
groups, your game style, your players, how many teams, and go." Direction agreed
in-session (2026-09-14): structure-first wizard question (how do N players compete)
before scoring; pre-composed modes become shortcuts; this is the Team Competition
engine's UI framing. Record as a decision entry when Craig confirms scope. The
language fixes above are the near-term slice of it, already built.

## Waiting on Craig

- **Merge/deploy call** (§5.ab) — everything above can also land after merge; the
  feedback box + all fixes ship only when the branch deploys.
- **Meadows payload capture** for the course-data audit (F-023/F-038 evidence):
  `GHIN_USER=... GHIN_PASS=... node scripts/fetch-course-payload.mjs "The Meadows" WV`
  — read-only, saves to gitignored `course-payloads/`. Any time he's willing.
- F-034 (stale draft name) — his pick among A/B/C.
- F-039 color half — sandbox repro (5 players, 2 sides 2v3, scorecard colors).
- F-022 on-course GHIN spot-check; §7 q4 (dark=live/light=setup).

## Traps that keep biting

- Stale `next dev` on 3200 → e2e times out; TaskStop can orphan the CHILD server —
  kill by PID, confirm port free (`netstat -ano | grep :3200`). 3000 = Craig's.
- Check `npm run verify`'s own exit code, not a tail of its log.
- Turbopack crash → `rm -rf .next`.
- e2e must assert it reached the right screen; scope 'Standings' locators to
  `getByRole('main')`.
- The pot/match toggle labels changed (F-042): "All teams, for a pot" /
  "Two teams, head-to-head" under "Who competes against whom?".

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
