# Next session: merge-audit polish batch (four S items, all unblocked)

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **Context economy:** read DECISIONS.md whole (it's short);
grep DECISIONS_ARCHIVE.md by § number only when a task touches that topic. Use
targeted greps on `pool/new/page.tsx` (~3,600 lines) and the e2e spec.

**State:** branch `live-feedback-2026-09-10` (off main, unmerged) now carries FOUR
work commits: group-tap (ddb3e95), verbiage (1b0b897), F-027 code fixes (ca931fa),
feedback box (065956f). `npm run verify` green after each (exit 0, 128 e2e).
Craig said to keep building on this branch (2026-09-10); merge timing is his (§5.ab).

## The work: the merge-audit polish batch from BACKLOG.md "Now"

All four are S, none needs Craig, all sit on surfaces already touched this branch:

1. **Loss-red leg results on the dark board** (§5.ak — money coloured good/bad).
2. **"Sides / Match" as a category label** — merge audit.
3. **The `70, 30` position-split mini-DSL** — merge audit.
4. **Three different renderings of course handicap** — merge audit.

Grep FINDINGS.md / UI_MODE_AUDIT.md for each before building; per-item focused
commits, e2e assertion per user-visible change.

## Waiting on Craig (see BACKLOG.md "Waiting" for detail)

- **Apply the feedback-box migration** (`supabase/migrations/20260910000000_feedback_notes.sql`)
  to the live DB — additive-only. Until applied, the live 💬 button will error ("didn't send").
- **F-027 live query + backfill:** run
  `select id, name, ghin_number from players where name is null or trim(name) = '';`
  then approve the one-time backfill. Code fixes are in; pre-fix rows render `GHIN #…`.
- F-022 on-course GHIN spot-check (§5.ba protocol if off).
- The Meadows `GetCourseDetails` payload for F-023 part B.
- §7 q4 (dark = live / light = setup).
- Branch merge (§5.ab — his timing).

## Traps that keep biting

- A stale `next dev` on port 3200 makes every e2e time out (`netstat -ano | grep :3200`).
- A Turbopack crash can corrupt `.next` — `rm -rf .next` fixed both a dev-server panic
  and a verify typecheck failure on `.next/dev/types`.
- Check `npm run verify`'s own exit code, not a `tail` of its log.
- **Look at the screen** — screenshots keep catching what code review doesn't.
- Sandbox scenarios don't all call `signInAsOrganizer()` — /home routes gate on
  `ghin_token`; set it in the test if the scenario doesn't (see the feedback e2e).

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next. That ritual is the method (§5.bc).
