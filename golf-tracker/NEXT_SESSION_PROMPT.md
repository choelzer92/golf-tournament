# Next session: Craig's picks (F-045 junk, F-040 add-player), then the merge call

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **Context economy** (Craig raised it 2026-09-14): read DECISIONS.md
whole (short); grep DECISIONS_ARCHIVE.md by § only when touched; delegate broad searches to
subagents; read `pool/new/page.tsx` in targeted slices only. A backlog item exists to split
that file — don't do it unprompted.

**State:** branch `live-feedback-2026-09-10` (off main, unmerged), verify GREEN — 1517 unit /
typecheck / build / 140 e2e, exit 0 at d412ade. From the 2026-09-14 walkthrough batch:
F-043 (handicap chain disclosure) and F-046 (group formats follow the group) are BUILT,
verified, committed (9143b54, d412ade). Also fixed: aefa30c's F-041 redirect never fired
(mode id `stableford` vs registry `stableford-ind`) — its own unverified e2e caught it.

## The work — everything left is gated on Craig's answers

1. **F-045 — junk defaults** (MONEY-ADJACENT). Proposal on the table: fresh classic pool
   defaults junk to $0/off with an "add bonuses" affordance (the registered modes'
   convention); saved formats keep what they saved (his Friday format keeps junk on).
   NEEDS HIS PICK on the 4-way pot split when junk is $0: fold junk's quarter into overall,
   or re-split three ways? His historical `POOL_SPLIT_TABLE` has junk as a leg.
   Downstream when built: scorecard CTP button + leaderboard junk column follow the game's
   junk config.
2. **F-040 — add-player reorder.** His pick among the finding's options: A reorder only /
   B reorder + paste-a-list bulk (matches his words best) / C retire the GHIN-# box.
   The "no official GHIN" note on manual add ships under any option. All four surfaces
   (pool/new, pool/roster, game/new, tournament/new) share the stack BY COPY — change all
   four or extract one component.
3. **Merge/deploy call** (§5.ab) — he said "maybe it's time" before the walkthrough; the
   walkthrough batch is now built and green. His call, not ours; don't nag, but the summary
   he was given asks explicitly.
4. If all three are still unanswered, promote from BACKLOG.md instead — top candidates: the
   course-data correctness audit (needs his Meadows payload:
   `GHIN_USER=... GHIN_PASS=... node scripts/fetch-course-payload.mjs "The Meadows" WV`,
   read-only, gitignored output), or the context-economy split of pool/new/page.tsx (M,
   mechanical) if he approves it, or the sharing/login audit (document-first, unblocked).

## The BIG discussion to keep alive (do NOT build it unprompted)

F-041/§5g: structure-first wizard question (how do N players compete) before scoring;
pre-composed modes become shortcuts; the Team Competition engine's UI framing. Record as a
decision entry when Craig confirms scope.

## Waiting on Craig (full table in BACKLOG.md)

F-045 pick · F-040 pick · merge call · Meadows payload · F-034 A/B/C · F-039 color repro ·
F-022 on-course GHIN spot-check · §7 q4.

## Traps that keep biting

- **Do NOT edit app code while `npm run verify` runs** — the e2e dev server hot-reloads
  edits and fails tests that were fine (cost one full run this session).
- Killing a dev server can corrupt `.next` (routes.d.ts) → `rm -rf .next` and rerun.
- Stale `next dev` on 3200 → e2e times out; kill by PID, confirm port free
  (`netstat -ano | grep :3200`). 3000 = Craig's.
- Check `npm run verify`'s own exit code, not a tail of its log.
- e2e must assert it reached the right screen; the sides-step row is now `flex flex-wrap`
  (F-043 chain panel wraps under it) — locate side buttons by `name: /^[A-Z]$/`, the CHcp
  chip is a button too.
- Game-mode ids ≠ display names (`stableford-ind`, not `stableford`) — select by VALUE and
  key on registry ids.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
