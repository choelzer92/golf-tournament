# Next session: sharing/login/identity AUDIT (document-first, no code changes)

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. Context economy is now structural: `pool/new/page.tsx` is a
777-line orchestrator (steps live in `src/app/pool/new/steps/`), FINDINGS.md keeps only
the open working set (settled entries: grep `FINDINGS_ARCHIVE.md` by F-0NN). Still:
delegate broad searches to subagents; grep DECISIONS_ARCHIVE.md by §.

**State (2026-09-14):** everything through the F-045/F-040 batch is MERGED to `main`
(4c33964, Craig-confirmed) and live — the 💬 feedback box included, so **check
`/home/feedback` for notes**. Branch `context-economy-2026-09-14` (pushed) holds the
wizard split + FINDINGS archive: pure refactor + docs, verify green (149 e2e), waiting
on Craig's review/merge — ask, don't merge.

## The work: sharing/login/identity audit (BACKLOG "Now"; Craig: "I want to get this polished")

Document-first (§2) — this session LOOKS and RECORDS, it does not fix. Follow
`UI_CRITIQUE_PROCESS.md`. Walk every entry path as each persona, screenshot each, log
findings with options in FINDINGS.md:

- owner via invite code · organizer via legacy `?key=` link · player via per-game token
  (`/pool/{id}?key=TOKEN`) · returning visitor with an expired 48h cookie or expired
  12h GHIN token
- Known rough edges to check: invite-code screen wording; the 48h cookie expiring
  mid-week (friends re-enter the code); GHIN re-login prompts; share panel copy/QR;
  "who am I" clarity for share-link players; sign-out scattering.
- Fold in the group-management consolidation look (same surfaces): `/pool/roster`'s
  GroupsManager vs `/home/groups/[id]` — Craig wants the new pages to be the standard.
- If the shape turns into real accounts/auth, that's the §5c/F-002 trigger — STOP and
  ask Craig there.

## Waiting on Craig (full table in BACKLOG.md)

`context-economy-2026-09-14` merge call · Meadows payload (F-023B) · F-034 A/B/C ·
F-022 on-course spot-check · §7 q4 · telling the friend the queued answers (fixes are
deployed now). The BIG structure discussion (§5g framing) stays alive — do NOT build.

## Traps that keep biting

- **Do NOT edit app code while `npm run verify` runs** — the e2e dev server hot-reloads
  edits and fails tests that were fine. (Markdown edits are safe.)
- Killing a dev server can corrupt `.next` (routes.d.ts parse error) → `rm -rf .next`.
- Stale `next dev` on 3200 → e2e times out; kill by PID, confirm port free. 3000 = Craig's.
- Check `npm run verify`'s own exit code, not a tail of its log.
- Game-mode ids ≠ display names (`stableford-ind`, not `stableford`) — select by VALUE.
- Playwright `waitForURL` can hang on client-side navigations waiting for `load` —
  assert with `expect(page).toHaveURL(...)` instead.
- The wizard's `setPlayers`/`setTeamAssignments` props are `React.Dispatch` — the shared
  AddPlayerPanel relies on functional updates for bulk adds; don't narrow them back.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
