# Next session: course-data correctness audit (slope/rating per tee)

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. Delegate broad searches to subagents; grep DECISIONS_ARCHIVE.md
by § and FINDINGS_ARCHIVE.md by F-0NN — don't read either whole.

**State (2026-09-14):** branch `audit-sharing-login-2026-09-14` now holds the audit
(F-047…F-055) AND all thirteen built fixes (F-047…F-059), each with tagged e2e; verify
green, 179 e2e. Nothing merged or pushed — that's Craig's call (§5.ab). Two things wait
on him: review/merge the branch, and set **`NEXT_PUBLIC_OWNER_GHIN`** (his real GHIN) in
`.env.local` + the deploy env — until then F-059's `isAppOwner()` deliberately falls back
to legacy full-access-=-owner, so the deploy is safe but members aren't scoped yet.

## The work: course-data correctness audit (Craig 2026-09-10, re-raised 2026-09-14)

Craig: *"we really need to investigate the situation with having improper slope/course
ratings to a tee for different courses."* Extends F-023 (the ratings-parse honesty
finding — grep the archive). Three parts, document-first:

1. **Inventory** — read-only queries over live games' stored courses: which have
   missing/zero/implausible slope, rating, or par per tee? Live DB reads were
   Craig-authorized for F-027's query; keep it SELECT-only and say so before running.
   Also sweep the sandbox fixtures so the harness can reproduce whatever you find.
2. **Harden the parse** — where `GetCourseDetails` payloads come in (tee sets,
   Ratings[Front/Back/Total], gender rows), make the extraction fail LOUDLY into a
   diagnostic rather than silently storing zeros. Document first; change on request.
3. **Diagnostic view** — a way for Craig to see WHAT the app extracted for a course
   (per tee: name, gender, yardage, par, CR/slope front/back/total) so on-course
   disputes become screenshots, not guesses.

Blocked sub-part: the Meadows payload (F-023B) still needs Craig to run
`scripts/fetch-course-payload.mjs`. Don't wait on it — inventory + diagnostic are
buildable without it. The default-TEE question (tips as default?) belongs here too.

**Fallback if this stalls:** the §5.bg money-step redesign is shaped and ready
(BACKLOG "Next few sessions") — but it's money math: worked-example sign-off with Craig
before merge (§2), so don't take it deep unattended.

## Waiting on Craig (full table in BACKLOG.md)

Review/merge the audit branch · set `NEXT_PUBLIC_OWNER_GHIN` · Meadows payload (F-023B) ·
F-034 A/B/C · F-022 on-course spot-check · §7 q4.

## Traps that keep biting

- **Do NOT edit app code while `npm run verify` runs.** (Markdown edits are safe.)
- **Kill any hand-started dev server AND `rm -rf .next` before `npm run verify`** —
  verify's tsc reads dev's half-written routes.d.ts otherwise (bit us twice). Kill by
  PID, confirm 3200 free (TIME_WAIT rows are fine). 3000 = Craig's.
- Check `npm run verify`'s own exit code, not a tail of its log.
- Live DB: SELECT-only, announce first, never write (F-027 precedent).
- A JSX comment can't sit as a sibling before the element inside a `.map()`'s
  parenthesized return — use `//` lines inside the parens.
- Editor diagnostics lag one edit behind — trust `npx tsc --noEmit`, not the squiggles.
- Playwright: `expect(page).toHaveURL(...)` over `waitForURL`; strict mode — prefer
  `exact: true` when a button label is a prefix of another ("Save" vs "Save format").
- Game-mode ids ≠ display names (`stableford-ind`, not `stableford`) — select by VALUE.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
