# Next session: MERGE (two Craig confirmations), then the context-economy split

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **Context economy** (Craig, 2026-09-14): read DECISIONS.md whole
(short); grep DECISIONS_ARCHIVE.md by § only when touched; delegate broad searches to
subagents; read `pool/new/page.tsx` in targeted slices only.

**State:** branch `live-feedback-2026-09-10`, verify GREEN (1520 unit / typecheck / build /
149 e2e), PUSHED to origin. Built this session: **F-045** (e924dbe — junk $0/off behind
"Add bonuses", fold into overall, all CTP/junk surfaces follow config) and **F-040**
(a35f7f9 — shared `AddPlayerPanel` on all four surfaces, name search first, bulk paste).
Both findings' Status blocks in FINDINGS.md carry the details.

## 1. Merge — waiting on TWO Craig confirmations (asked at the end of last session)

1. **§5.bg worked example sign-off** (money rule §2 — his "if it makes sense" was
   conditional): 2 foursomes × $25 = $200 pot; table 70/70/40/20; bonuses off folds to
   **Front $70 / Back $70 / Overall $60**. If he says it doesn't make sense, F-045's fold
   changes — do NOT merge until settled.
2. **Nobody's mid-round** (§5.ab spirit) — merge timing is his call.

Both yes → merge `live-feedback-2026-09-10` to `main` and push. The feedback box + all
branch fixes go live with the deploy. Then tell the friend the answers queued in BACKLOG
("Tell the friend" row).

## 2. After the merge: context-economy work (both in BACKLOG)

- Split `pool/new/page.tsx` (~4,100 lines) into per-step component files — every step is
  already a self-contained component; mechanical, no behavior change; e2e unchanged.
- Archive fixed findings out of FINDINGS.md (DECISIONS_ARCHIVE pattern).

Then promote the next backlog item (course-data audit is waiting on Craig's Meadows
payload; sharing/login audit is unblocked).

## Waiting on Craig (full table in BACKLOG.md)

Worked-example sign-off + merge window (above) · Meadows payload · F-034 A/B/C ·
F-022 on-course spot-check · §7 q4. The BIG structure discussion (§5g framing) stays
alive — do NOT build.

## Traps that keep biting

- **Do NOT edit app code while `npm run verify` runs** — the e2e dev server hot-reloads
  edits and fails tests that were fine.
- Killing a dev server can corrupt `.next` (routes.d.ts parse error) → `rm -rf .next`.
- Stale `next dev` on 3200 → e2e times out; kill by PID, confirm port free. 3000 = Craig's.
- Check `npm run verify`'s own exit code, not a tail of its log.
- Game-mode ids ≠ display names (`stableford-ind`, not `stableford`) — select by VALUE.
- Playwright `waitForURL` can hang on client-side navigations waiting for `load` — assert
  with `expect(page).toHaveURL(...)` instead.
- An unscored pool leaderboard renders only "No scores yet." — seed scores (sandbox card
  `Classic pool — NO bonuses (junk off)` exists now) before asserting sections.
- Junk/pot changes touch `pool-game.ts` money math — every mode's zero-sum test must still
  pass, and `distributePot`/`POOL_SPLIT_TABLE` callers need a grep before changing shape.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
