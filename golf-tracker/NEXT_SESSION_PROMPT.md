# Next session: BUILD F-055 (option A) + the sharing trio F-056/F-057/F-058

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. Delegate broad searches to subagents; grep DECISIONS_ARCHIVE.md
by § and FINDINGS_ARCHIVE.md by F-0NN — don't read either whole.

**State (2026-09-14):** branch `audit-sharing-login-2026-09-14` holds the sharing/login
audit (F-047…F-055) AND the built fixes F-047…F-054 (verify green, 168 e2e). Nothing
merged or pushed. Craig then DECIDED the rest — **§5.bh** (read it in the archive): F-055
option A, the sharing scaling principles ("one link kind per job, token on the game row —
never add link kinds"), and the recommended options for F-056/57/58. All four are
**decided, ready to build, no re-asking**. Continue on the same branch.

## The work (one commit + tagged e2e per finding; `npm run verify` exit 0 each slice)

1. **F-056** — show the Share button/panel to `pool`-access visitors on the game hub
   (`pool/[id]/page.tsx:351` moves Share OUT of the `!poolOnly` guard; Save format/Edit
   stay hidden). Guests already hold the link; the line is mutating vs read-only (F-004).
2. **F-057** — `setAccessCookie` gets level-dependent lifetime: `full` = 30d (sliding
   refresh stays), `pool` = 48h. Update the F-051 e2e (it asserts ≥20d on a FULL grant —
   keep that; add the pool-grant ≤48h case). `src/lib/invite-gate.ts`.
3. **F-058** — QR generated locally in both panels (`pool-share.tsx:14`,
   `pool/[id]/page.tsx:785`). Prefer a tiny well-known dep (e.g. `qrcode` → data-URL/SVG)
   or a vendored encoder; assert the img src is NOT api.qrserver.com and IS a data:/blob.
4. **F-055 option A** (the M of the session — see the finding + §5.bh):
   - `/home` "Your groups": add **create group** (name → `upsertGroup`, lib fns all exist
     in `roster-groups.ts`); repoint/remove the "Manage" → /pool/roster button
     (`home/page.tsx:207`).
   - `/home/groups/[id]`: add **rename** + **delete** (confirm; `renameGroup`/`deleteGroup`
     exist). Keep the F-010 dashboard shape — management joins the dashboard, doesn't
     displace it.
   - `/pool/roster`: DELETE the GroupsManager component (`roster/page.tsx:149,252+`);
     page becomes saved players only — retitle ("Saved Players"), fix intro copy.
     "Full roster manager" links (group page :457, /pool :84) stay valid (players only).
   - e2e `F-055`: create a group on /home → rename + delete on its dashboard → /pool/roster
     shows no Groups panel. Check e2e that used the old GroupsManager UI
     (grep "Select a group" in e2e/ — critique/user-walk may walk it) and update.
   - Data: NOTHING migrates — roster_groups rows, games, links untouched.

**Do NOT build:** F-055 option B (share-link visitors on /home) — that's the §5c
accounts conversation. F-049's tappable identity chip only if trivially composable.

## Waiting on Craig (full table in BACKLOG.md)

Review/merge the audit branch · the access-policy OK (game link for players, invite code
for regulars, retire the legacy organizer link from circulation — proposed, not decided) ·
Meadows payload (F-023B) · F-034 A/B/C · F-022 on-course spot-check · §7 q4.

## Traps that keep biting

- **Do NOT edit app code while `npm run verify` runs.** (Markdown edits are safe.)
- **Kill any hand-started dev server AND `rm -rf .next` before `npm run verify`** —
  verify's tsc reads dev's half-written routes.d.ts otherwise (bit us twice). Kill by
  PID, confirm 3200 free (TIME_WAIT rows are fine). 3000 = Craig's.
- Check `npm run verify`'s own exit code, not a tail of its log.
- A JSX comment can't sit as a sibling before the element inside a `.map()`'s
  parenthesized return — use `//` lines inside the parens.
- Editor diagnostics lag one edit behind — trust `npx tsc --noEmit`, not the squiggles.
- Playwright: `expect(page).toHaveURL(...)` over `waitForURL`; a screenshot right after a
  client-side `router.push` races it. Mid-round sandbox scenarios "Open →" onto the
  LEADERBOARD — the Share button lives on the hub (`/pool/{id}`).
- Game-mode ids ≠ display names (`stableford-ind`, not `stableford`) — select by VALUE.
- The wizard's `setPlayers`/`setTeamAssignments` props are `React.Dispatch` — don't narrow.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
