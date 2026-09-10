# Next session: finish the 2026-09-10 feedback batch (needs Craig's two answers)

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **Context economy:** don't read all of DECISIONS.md — grep it for
the §§ cited below only. The 2026-09-10 session hit 95% context largely by reading whole
large files; use targeted greps on `pool/new/page.tsx` (~3,600 lines) and the e2e spec.

**State:** branch `live-feedback-2026-09-10` (off main, unmerged) carries two commits:
group-tap fix (ddb3e95) and verbiage fix (1b0b897). `npm run verify` was green (exit 0,
125 e2e) after both. If Craig merged it, work fresh off `main` on a new branch; if not,
ask before building on it.

## The work: the two remaining feedback items — BOTH gated on Craig

1. **In-app feedback box** — the proposed shape is in BACKLOG.md "Now" (table
   `feedback_notes`, hub-header button + bottom sheet, `src/lib/feedback.ts`,
   `/home/feedback` read-back). **Get Craig's OK before building** — it writes to the
   live DB (additive-only new table). If he OKs it: migration + lib + UI + e2e, keep it
   a text box and a list.
2. **F-027 (my-groups blank names)** — diagnosis is DONE, in FINDINGS.md F-027: the page
   is clean; the cause is empty-`name` rows in the live `players` table from untrimmed
   GHIN-add writers (`pool/new/page.tsx:2013`, `pool/[id]/page.tsx:2329`;
   `upsertRosterPlayer` never validates name and the 24h auto-refresh re-perpetuates it).
   **Ask Craig to confirm** with the read-only query in the finding, then (on his go):
   trim the writers, make `upsertRosterPlayer` refuse to blank a non-empty name, render a
   fallback (`name || 'GHIN #…'`), and treat the live-row backfill as a separate approved
   step.

If both are still waiting, pull from "Next few sessions" in BACKLOG.md (merge-audit
polish items are all S and unblocked).

## Traps that keep biting

- A stale `next dev` on port 3200 makes every e2e time out (`netstat -ano | grep :3200`).
- A Turbopack crash can corrupt `.next` — `rm -rf .next` fixed both a dev-server panic
  AND a verify typecheck failure on `.next/dev/types` this session.
- Check `npm run verify`'s own exit code, not a `tail` of its log.
- **Look at the screen** — screenshots keep catching what code review doesn't.

## Still waiting on Craig (unchanged)

- F-022 on-course GHIN spot-check (§5.ba protocol if off).
- The Meadows `GetCourseDetails` payload for F-023 part B.
- §7 q4 (dark = live / light = setup).
- Branch `live-feedback-2026-09-10` merge (§5.ab — his timing).

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next. That ritual is the method (§5.bc).
