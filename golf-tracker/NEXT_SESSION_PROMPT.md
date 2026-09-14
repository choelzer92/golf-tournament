# Next session: build F-045 + F-040 (picks are in), then commit → push → MERGE

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **Context economy** (Craig raised it 2026-09-14): read DECISIONS.md
whole (short); grep DECISIONS_ARCHIVE.md by § only when touched; delegate broad searches to
subagents; read `pool/new/page.tsx` in targeted slices only.

**State:** branch `live-feedback-2026-09-10`, verify GREEN (1517 unit / typecheck / build /
140 e2e) at d412ade + docs commits. Built this batch: F-043 handicap chain, F-046 group
formats, F-041 id correction. Craig's picks arrived 2026-09-14 and are RECORDED — don't
re-ask: **§5.bg** for F-045, **option B** for F-040 (full text in each finding's Status).

## The plan Craig set (2026-09-14, his words: "address F-045 and F-040 in the next session, then commiting, pushing, and merging")

1. **F-045 per §5.bg** (MONEY — read §5.bg in DECISIONS_ARCHIVE first).
   - Fresh classic pool: junk $0/off behind an "add bonuses" affordance; `JUNK_FIELDS`/CTP
     surfaces (scorecard CTP button, leaderboard junk column) follow the game's junk config.
   - Junk $0 → its pot quarter folds into OVERALL; front/back keep their table weights.
     **Show Craig a worked example** (e.g. 8 players × $25, 2 teams) before relying on it —
     his "if it makes sense" was conditional.
   - Saved formats keep their saved junk. Seed/keep the Warriors' historical table as a
     saved format so nothing he plays gets harder to start.
   - Direction (don't over-build): money step reads as per-player/per-leg dollars that
     visibly add up. Land the minimum that makes the defaults honest; the full money-step
     redesign can be its own finding.
   - Zero-sum unit tests are the invariant; prove a new money test can FAIL (§5.z).
2. **F-040 option B** — on all four add-player surfaces (`pool/new` ~2318, `pool/roster`
   ~339, `game/new` ~567, `tournament/new` ~465; they're copies — extract one component if
   cleaner): name search first (First/Last/ST one card), manual add second with a
   "no official GHIN — handicap won't update itself" note, GHIN-# folded into a "have a
   GHIN #?" disclosure, plus a paste-a-list textarea (comma/newline GHIN numbers) resolving
   via the existing `addByGhin` fetch with per-number success/failure. e2e per surface.
3. **Commit each, verify green, then: PUSH the branch and MERGE to main** — explicitly
   authorized by Craig 2026-09-14 for this session ("then commiting, pushing, and merging").
   Confirm with him that nobody's mid-round at merge time (§5.ab spirit), then merge.
   Remember: the feedback box + all branch fixes go live with this deploy.
4. **After the merge** (same session if room, else next): the context-economy work — split
   `pool/new/page.tsx` into per-step files + archive fixed findings out of FINDINGS.md
   (both in BACKLOG), then other backlog/todos.

## Waiting on Craig (full table in BACKLOG.md)

Meadows payload (course-data audit) · F-034 A/B/C · F-039 color repro · F-022 on-course
spot-check · §7 q4. The BIG structure discussion (§5g framing) stays alive — do NOT build.

## Traps that keep biting

- **Do NOT edit app code while `npm run verify` runs** — the e2e dev server hot-reloads
  edits and fails tests that were fine.
- Killing a dev server can corrupt `.next` (routes.d.ts parse error) → `rm -rf .next`.
- Stale `next dev` on 3200 → e2e times out; kill by PID, confirm port free. 3000 = Craig's.
- Check `npm run verify`'s own exit code, not a tail of its log.
- Game-mode ids ≠ display names (`stableford-ind`, not `stableford`) — select by VALUE.
- The sides-step row is `flex flex-wrap` (F-043 panel wraps under it); the CHcp chip is a
  button — locate side buttons by `name: /^[A-Z]$/`.
- Junk/pot changes touch `pool-game.ts` money math — every mode's zero-sum test must still
  pass, and `distributePot`/`POOL_SPLIT_TABLE` callers need a grep before changing shape.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
