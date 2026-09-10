# Next session: the sharing / login / identity AUDIT (Craig's named focus)

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **Context economy:** read DECISIONS.md whole (it's short);
grep DECISIONS_ARCHIVE.md by § number only when a task touches it (§5c is the one
this session touches — read that entry in full, archive line ~216).

**State:** branch `live-feedback-2026-09-10` (off main, unmerged) carries six work
commits, verify green after each (exit 0, 128 e2e). Craig said to keep building on
it; merge timing is his (§5.ab). The `feedback_notes` table IS live (migration
applied 2026-09-10) but the 💬 button ships with this branch.

## The work: audit every entry path, then propose (document-first — §2)

Craig (2026-09-10): *"we should add better sharing/logins/everything on the backlog.
I want to get this polished."* This is an AUDIT session, not a build session — walk,
screenshot, log findings, propose options. Fixes get built after he picks.

Walk each persona end-to-end in the sandbox (UI_CRITIQUE_PROCESS.md loop):

1. **Owner** — invite code `birdie2026` → /home. Include: what happens when the 48h
   cookie expires mid-week? When the 12h GHIN token dies mid-task?
2. **Organizer via legacy link** (`?key=poolparty2026`) — 'pool' access. What do they
   see, what's confusingly absent (/home is full-only), where do they land signed out?
3. **Player via per-game token** (`/pool/{id}?key=<token>`) — scoring without login.
   Is "who am I" ever clear? What happens when they open the app root later?
4. **Returning visitor** — closed tab, next morning. What survives (localStorage
   identity), what doesn't (session token), and what does the app SAY about it?

Known rough edges to verify (don't assume): invite-screen wording, GHIN re-login
prompt frequency, share panel copy/QR, sign-out scattering, the group-management
overlap (Craig: the NEW /home group pages should be the standard, but /pool/roster
is where groups are CREATED and where 'pool'-level visitors land — same surface,
same session).

**The §5c boundary:** experience polish (wording, flows, clarity, consolidation) is
unblocked product work. If a proposal turns into real accounts/RLS/auth, that's the
F-002 trigger — write the option down and STOP for Craig. The two §5c items already
in scope: per-game share tokens (BUILT), backups/JSON export (still unbuilt — check
it as part of this audit).

Findings → FINDINGS.md (F-028+), options per finding, then groom BACKLOG.md.

## Also queued (if the audit runs short)

Merge-audit polish batch — four S items in BACKLOG.md "Next few sessions", all
unblocked, none needs Craig.

## Waiting on Craig (unchanged)

- F-022 on-course GHIN spot-check (§5.ba protocol if off).
- The Meadows `GetCourseDetails` payload for F-023 part B.
- §7 q4 (dark = live / light = setup).
- Branch merge/deploy (§5.ab — his timing; the 💬 button arrives with it).

## Traps that keep biting

- A stale `next dev` on port 3200 makes every e2e time out (`netstat -ano | grep :3200`).
- A Turbopack crash can corrupt `.next` — `rm -rf .next` fixes it.
- Check `npm run verify`'s own exit code, not a `tail` of its log.
- **Look at the screen** — screenshots keep catching what code review doesn't.
- Sandbox scenarios don't all call `signInAsOrganizer()` — /home routes gate on
  `ghin_token`; set it in the test if the scenario doesn't (see the feedback e2e).
- `supabase db query --linked` works for read-only live queries (Craig-authorized
  ones only); `player_ids` is `text[]` (use `unnest`/`cardinality`, not jsonb fns).

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next. That ritual is the method (§5.bc).
