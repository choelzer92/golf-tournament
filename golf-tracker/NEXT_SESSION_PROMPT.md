# Next session: context-economy work (split pool/new + archive findings)

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **Context economy** (Craig, 2026-09-14): read DECISIONS.md whole
(short); grep DECISIONS_ARCHIVE.md by § only when touched; delegate broad searches to
subagents; read `pool/new/page.tsx` in targeted slices only — which is exactly what this
session fixes.

**State (2026-09-14):** `live-feedback-2026-09-10` is MERGED to `main` and pushed
(4c33964) — the feedback box, F-027…F-046 fixes, F-045 junk defaults (§5.bg signed off
via worked example), and F-040's shared `AddPlayerPanel` are all live. Verify was green
at merge: 1520 unit / typecheck / build / 149 e2e.

## The work (both in BACKLOG's Now row; NEW branch off main, never main directly)

1. **Split `pool/new/page.tsx` (~4,100 lines) into per-step component files.** Every step
   (FieldStep, DetailsStep, CourseStep, TeesStep, GroupsStep, SubTeamsStep, TeamsStep, the
   money/review step) is already a self-contained component in that one file — move each to
   `src/app/pool/new/steps/` (or a sibling dir), keep `page.tsx` as the orchestrator with
   the wizard state. Mechanical, NO behavior change; module-level helpers (`JUNK_FIELDS`,
   `PotDollars` helpers, `getToken`) go wherever their users go. e2e unchanged is the proof.
2. **Archive fixed findings out of FINDINGS.md** (same pattern as DECISIONS_ARCHIVE):
   move BUILT/FIXED entries to `FINDINGS_ARCHIVE.md`, keep a one-line index. FINDINGS.md
   is ~3,000 lines and mostly settled history.

Then groom BACKLOG and promote next — the sharing/login audit is unblocked; the
course-data audit still waits on Craig's Meadows payload.

## Waiting on Craig (full table in BACKLOG.md)

Meadows payload (F-023B) · F-034 A/B/C · F-022 on-course spot-check · §7 q4 · telling the
friend the queued answers ("Tell the friend" row — the fixes are deployed now). The BIG
structure discussion (§5g framing) stays alive — do NOT build.

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
  `Classic pool — NO bonuses (junk off)` exists) before asserting sections.
- The wizard's `setPlayers`/`setTeamAssignments` props are now `React.Dispatch` — the
  shared AddPlayerPanel relies on functional updates for bulk adds; don't narrow them back.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
