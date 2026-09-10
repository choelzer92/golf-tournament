# Next session: course-data correctness audit (The Meadows payload first)

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **Context economy:** read DECISIONS.md whole (short); grep
DECISIONS_ARCHIVE.md by § only when touched. F-023's original notes are in FINDINGS.md.

**State:** branch `live-feedback-2026-09-10` (off main, unmerged), verify green
(136 e2e). All six friend-feedback fixes F-028…F-033 are BUILT and committed
(8018429, d54cfe2, e2788c4, 60e5fe2, a22e359, e038fff — one per finding, each with
e2e). Merge is Craig's call (§5.ab).

## The work

**Course-data correctness audit** (Craig: "important that it works for all courses…
The Meadows is a good test. Others too may have them typed in differently").
Extends F-023 — GHIN course payloads aren't uniform (missing 'Total' ratings rows,
differently-shaped tee/ratings blocks).

1. **Capture the Meadows payload.** Craig runs `npx next dev` (port 3000, REAL
   backend) and logs in; a temporary log in `src/lib/ghin-api.ts` captures
   `GetCourseDetails`; save to `course-payloads/` (gitignored). Or
   `scripts/fetch-course-payload.mjs` with his token. This is the step that's been
   waiting since 2026-09-10 — do it FIRST while he's present.
2. **Inventory live games' courses** for missing/odd ratings via READ-ONLY queries
   (Craig-authorized reads only; never write to live — §3).
3. **Harden the parse** for the shapes found; unit-test each captured shape.
4. **A diagnostic view or log** that says WHAT the app extracted from a course, so
   a wrong pull is visible instead of silent.

Document first (§2): findings + options before code changes beyond the capture rig.

## Queued right behind (BACKLOG "Now")

- **Sharing/login/identity audit** (four personas, screenshots; group-management
  consolidation folded in; §5c boundary).
- Merge-audit polish batch (4 × S) as fallback if the session runs short.

## Waiting on Craig

- **When he asks "when should I run localhost":** the course-payload capture above
  IS that moment — `npx next dev` on port 3000 + GHIN login, this session or any.
  For REVIEWING the F-028…F-033 fixes, the sandbox is enough:
  `NEXT_PUBLIC_SANDBOX=1 npx next dev --port 3200`, seed `stableford-ind-partial` /
  `-complete` from /sandbox — or just merge-review the branch (§5.ab, his timing).
- F-030 opt C (standings strip on the card) and F-031 opt B (bigger card to-par
  superscript) — both optional follow-ups, in BACKLOG "Next few sessions".
- Relay the friend's answers (BACKLOG has the one-liner).
- F-022 on-course GHIN spot-check (§5.ba protocol if off).
- §7 q4 (dark = live / light = setup).
- Branch merge/deploy (§5.ab) — the feedback box AND all six fixes ship with it.

## Traps that keep biting

- Stale `next dev` on port 3200 → every e2e times out (`netstat -ano | grep :3200`).
  Craig sometimes runs his own dev server — check WHOSE process it is before killing.
- **TaskStop on a backgrounded `npx next dev` can leave the CHILD server alive** —
  Next 16 then refuses a second dev server in the same directory, and verify's e2e
  webServer silently REUSES the survivor. Kill by PID, confirm the port is free.
  Convention: port 3200 = sandbox/e2e, port 3000 = Craig's real app.
- Turbopack crash can corrupt `.next` — `rm -rf .next` fixes it.
- Check `npm run verify`'s own exit code, not a `tail` of its log.
- On LOCALHOST with the real backend, groups/roster only show after GHIN login
  succeeds (visibility is scoped to `viewerGhin` — roster-groups.ts:83).
- The scorecard resumes at the FIRST UNSCORED hole on remount (by design) — it is
  not a preserved cursor; don't file that as a bug (learned in F-030's e2e).
- The pill's "Standings" tab collides with page-wide `getByText('STANDINGS')`
  locators — scope to `getByRole('main')` in new e2e.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
