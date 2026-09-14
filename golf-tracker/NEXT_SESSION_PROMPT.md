# Next session: F-055 group-UI consolidation (if Craig picked) — else the polish batch

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. Delegate broad searches to subagents; grep DECISIONS_ARCHIVE.md
by § and FINDINGS_ARCHIVE.md by F-0NN — don't read either whole.

**State (2026-09-14):** branch `audit-sharing-login-2026-09-14` holds the sharing/login
AUDIT (F-047…F-055 in FINDINGS.md, capture spec `e2e/sharing-audit.spec.ts`) AND the
FIXES for F-047…F-054, built on the recommended options at Craig's "address these other
todos" (9 e2e in `e2e/f047-sharing-fixes.spec.ts`, verify green). Nothing merged or
pushed — **merging is Craig's call**; note the F-051 cookie change (48h → 30-day
sliding) quietly renews everyone's access, worth his conscious OK. F-049 is PARTLY
fixed: the hub identity line exists but isn't tappable yet.

## The work

1. **If Craig has picked an F-055 option** (group-UI consolidation — recommendation A:
   /home/groups becomes the only group UI, gains create/rename/delete; /pool/roster
   keeps saved PLAYERS only; rewire the three "Manage"/"Full roster manager" links):
   build it. The access constraint is in the finding — /pool/roster works at `pool`
   access, /home is GHIN-gated. **Option B = the §5c/F-002 accounts conversation — STOP.**
2. **Else:** the merge-audit polish batch (4 S items in BACKLOG "Next few sessions"),
   or the §5.bg money-step redesign (worked-example sign-off before merge — money rule §2).

One focused commit per item, e2e tagged with the finding id, `npm run verify` exit 0.

## Waiting on Craig (full table in BACKLOG.md)

F-055 pick · review/merge the audit branch · Meadows payload (F-023B) · F-034 A/B/C ·
F-022 on-course spot-check · §7 q4. The BIG structure discussion (§5g framing) stays
alive — do NOT build.

## Traps that keep biting

- **Do NOT edit app code while `npm run verify` runs** — the e2e dev server hot-reloads
  edits and fails tests that were fine. (Markdown edits are safe.)
- **Kill any hand-started dev server AND `rm -rf .next` before `npm run verify`** —
  verify's tsc reads dev's half-written routes.d.ts otherwise (bit us twice now).
  Kill by PID, confirm 3200 free (TIME_WAIT rows are fine). 3000 = Craig's.
- Check `npm run verify`'s own exit code, not a tail of its log.
- A JSX comment can't sit as a sibling before the element inside a `.map()`'s
  parenthesized return — use `//` lines inside the parens instead.
- Game-mode ids ≠ display names (`stableford-ind`, not `stableford`) — select by VALUE.
- Playwright: assert with `expect(page).toHaveURL(...)`, not `waitForURL`; a screenshot
  right after a client-side `router.push` can race it — wait for the URL first.
- Mid-round sandbox scenarios "Open →" onto the LEADERBOARD; the Share button lives on
  the hub (`/pool/{id}`) — navigate there first.
- Editor diagnostics lag one edit behind — trust `npx tsc --noEmit`, not the squiggles.
- The wizard's `setPlayers`/`setTeamAssignments` props are `React.Dispatch` — the shared
  AddPlayerPanel relies on functional updates for bulk adds; don't narrow them back.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
