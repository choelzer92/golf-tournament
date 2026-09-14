# Next session: sharing/login FIXES (Craig's picks) — else the polish batch

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. Delegate broad searches to subagents; grep DECISIONS_ARCHIVE.md
by § and FINDINGS_ARCHIVE.md by F-0NN — don't read either whole.

**State (2026-09-14):** the sharing/login/identity AUDIT is done on branch
`audit-sharing-login-2026-09-14` (committed; nothing merged, nothing pushed). It recorded
**F-047…F-055** in FINDINGS.md with options + recommendations, evidence in
`e2e/screenshots/share-audit-*.png`, harness in `e2e/sharing-audit.spec.ts` (capture-only,
in the suite, verify green). **No app code was changed.** The live `/home/feedback` check
was BLOCKED by the tool permission gate (production read) — Craig should read the 💬 notes
in-app, or allow a one-off read-only query.

## The work: build whichever F-047…F-055 options Craig has picked

Read the nine entries in FINDINGS.md (audit block is marked, dated 2026-09-14). The likely
first slice, if he takes the recommendations — none touch money/handicap math:

- **F-051** sliding 48h cookie (re-set on each gated visit) — kills the weekly re-entry
- **F-050** invite-screen copy ("the same code works every time")
- **F-052** pool-only fence redirects to `/pool`, not into the New Game wizard
- **F-047** Sign Out clears the cookie (`clearAccessCookie` exists, zero callers) + the
  localStorage `ghin_golfer` mirror
- **F-053** login page recognizes a returning user ("your GHIN session expired")
- **F-048** wire `shareTokenMatches` (pool-game.ts:2394, currently dead) into the game page
- **F-054/F-055** roster layout + group-UI consolidation — F-055 is its own M session;
  option B there = the §5c/F-002 accounts conversation, STOP for Craig

One focused commit per finding, e2e assertion tagged with the F-number, `npm run verify`
green before each commit. **If Craig hasn't picked yet:** do the merge-audit polish batch
(4 S items in BACKLOG "Next few sessions") instead, and say the audit findings are waiting.

## Waiting on Craig (full table in BACKLOG.md)

F-047…F-055 picks · read /home/feedback · Meadows payload (F-023B) · F-034 A/B/C ·
F-022 on-course spot-check · §7 q4. The BIG structure discussion (§5g framing) stays
alive — do NOT build.

## Traps that keep biting

- **Do NOT edit app code while `npm run verify` runs** — the e2e dev server hot-reloads
  edits and fails tests that were fine. (Markdown edits are safe.)
- **Running `verify` while a hand-started dev server is up corrupts `.next`**
  (routes.d.ts parse error — bit us again this session) → kill the dev server by PID,
  confirm 3200 free, `rm -rf .next`, re-run. 3000 = Craig's.
- Check `npm run verify`'s own exit code, not a tail of its log.
- Game-mode ids ≠ display names (`stableford-ind`, not `stableford`) — select by VALUE.
- Playwright `waitForURL` can hang on client-side navigations — assert with
  `expect(page).toHaveURL(...)`. And a screenshot right after a client-side `router.push`
  can race it (the sign-out capture did) — wait for the URL first.
- Mid-round sandbox scenarios "Open →" onto the LEADERBOARD; the Share button lives on
  the hub (`/pool/{id}`) — navigate there first.
- The wizard's `setPlayers`/`setTeamAssignments` props are `React.Dispatch` — the shared
  AddPlayerPanel relies on functional updates for bulk adds; don't narrow them back.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
