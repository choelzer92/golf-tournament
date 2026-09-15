# Next session: review todos + backlog with Craig, plan the next iteration, shape a better harness

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. Delegate broad searches to subagents; grep DECISIONS_ARCHIVE.md
by § and FINDINGS_ARCHIVE.md by F-0NN — don't read either whole.

**State (2026-09-15):** `audit-sharing-login-2026-09-14` is MERGED to main and pushed
(f62cc74) — the sharing/login audit plus all thirteen fixes F-047…F-059 are live on the
next deploy. One deploy step still open: **Craig sets `NEXT_PUBLIC_OWNER_GHIN` (his real
GHIN) in the deploy env** — until then F-059's `isAppOwner()` deliberately falls back to
legacy invite-code-=-owner, so members aren't scoped yet. Raise this early.

**This is a CONVERSATION session, not a build session.** Craig asked for it explicitly
(2026-09-15): *"go through non completed todos, the backlog, and talk about the next
iteration of the app. Additionally, we need to find a way to build a better harness for
this project, and reduce unnecessary context bloat."* Present, discuss, record decisions
(full entry → DECISIONS_ARCHIVE, index line → DECISIONS.md, work lines → BACKLOG);
build only what he picks, on a fresh branch.

## Agenda

1. **Non-completed todos + open findings.** Present the short list, one line each, with
   your recommendation. Open findings: F-005 (wizard step-1 exposure — the big one),
   F-030 opt C (standings strip on the card), F-031 opt B (card to-par size), F-033
   (findability of 1v1/3-player games), F-034 (stale draft name — needs his A/B/C).
   Waiting-on-Craig table is in BACKLOG.md (owner GHIN env var, F-022 on-course check,
   Meadows payload, §7 q4).

2. **Backlog walk.** Go section by section (Now / Next few sessions / Bigger arcs /
   Ideas); for each row: keep, kill, or reshape. It's grown — pruning is a win.

3. **Next iteration.** Candidates to put in front of him (his own stated interests, not
   an exhaustive menu): the game-structure simplification ("a pool is effectively just a
   4v4 game" — the §5g Team Competition engine's UI framing, L, design-first); the §5.bg
   money-step redesign (M, shaped); course-data correctness audit (M, was promoted before
   this agenda superseded it); live scoring experience pass (§6 item 3, never had its
   session); offline/PWA (§6 item 4, core to "continuing"); accounts/§5c hardening (the
   F-059 follow-through: revoke/rotate + RLS under the settled sharing model). Let HIM
   rank; record the pick as a decision.

4. **Better harness + context economy.** Craig has raised context bloat twice (wizard
   split + FINDINGS archive shipped 2026-09-14 as the first round). Measured candidates
   to discuss, biggest first:
   - `src/app/pool/[id]/page.tsx` — **3,233 lines**, the single biggest context cost per
     read. The wizard split (777-line orchestrator + per-step files) is the proven
     pattern; a hub/SharePanel/edit-panels split is the obvious cut. Mechanical, safe,
     e2e already covers the surfaces.
   - `e2e/verify-fixes.spec.ts` — **2,996 lines**, monolithic; split by finding-era the
     way newer specs already are (f047-, f055-, f056-058-, f059-…), and extract the
     grantAndReset/seedCard/seedAndOpenGame helpers duplicated across 6+ spec files into
     one shared e2e helper module.
   - **verify output noise** — the log is ~6,000 lines (GHIN 401 spam, the credentials
     banner, list reporter). A quieter reporter for verify (dot/line + failures-only)
     plus silencing the sandbox's fake-GHIN 401 logging would cut a session's biggest
     single tool-output dump. Keep the list reporter for interactive runs.
   - **FINDINGS.md is back at 1,258 lines** — a second archive sweep is due (same
     verbatim-move pattern; everything FIXED+verified with nothing waiting on Craig).
   - **Session-start cost** — AGENTS.md + DECISIONS.md + memory + NEXT_SESSION_PROMPT is
     the fixed overhead; discuss whether a generated one-page STATUS.md (branch, gate
     state, open counts) could replace re-deriving state each session.
   Shape this into a concrete plan with Craig; the mechanical pieces (file splits,
   reporter, helper extraction) are buildable the same session if he wants.

## Traps that keep biting

- **Do NOT edit app code while `npm run verify` runs.** (Markdown edits are safe.)
- **Kill any hand-started dev server AND `rm -rf .next` before `npm run verify`**;
  confirm 3200 free (TIME_WAIT fine). 3000 = Craig's.
- Check `npm run verify`'s own exit code, not a tail of its log — and if it runs in the
  background, capture `$?` INSIDE the command; the wrapper's exit code lies.
- Editor diagnostics lag one edit behind — trust `npx tsc --noEmit`, not the squiggles.
- Playwright strict mode: prefer `exact: true` when a label prefixes another
  ("Save" vs "Save format").
- Game-mode ids ≠ display names (`stableford-ind`, not `stableford`) — select by VALUE.
- Sandbox seeds sign in as Craig (GHIN 1234567) since F-059; tests for other personas
  overwrite or clear the identity themselves.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
