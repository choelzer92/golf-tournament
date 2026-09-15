# Next session: course-data correctness audit (+ optionally start the game-structure design doc)

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. Delegate broad searches to subagents; grep DECISIONS_ARCHIVE.md
by § and FINDINGS_ARCHIVE.md by F-0NN — don't read either whole.

**State (2026-09-15):** the review session happened (§5.bj — read it): Craig adopted the
recommendations in order. `review-session-2026-09-15` carries F-034 opt A, F-060 opt A
(built live while Craig was stuck on it), the sandbox owner-GHIN fix, and harness round 2
(pool/[id] `panels/` split, verify-fixes.spec split + `e2e/helpers.ts`, quiet verify,
FINDINGS sweep #2). Check `git log main..review-session-2026-09-15` and whether Craig has
merged it; **don't merge or push unbidden** (§5.ab). `NEXT_PUBLIC_OWNER_GHIN` is set in
Vercel AND .env.local — F-059 is ACTIVE on live; the sandbox now always owner-is-1234567.

## The promoted work: course-data correctness audit (M, §5.bj — Craig's #1 build pick)

Craig, twice: "we really need to investigate the situation with having improper
slope/course ratings to a tee for different courses." Extends F-023 (part A —
`teeHasRating` honesty — is FIXED; this is part B+):

1. **Inventory** — read-only queries against live: every course in `pool_games` /
   `tournaments`, which tees lack usable slope/rating/par, which games computed handicaps
   off the index fallback. Read-only is authorized by precedent (F-027 pattern): say
   what you're running, show the query, change nothing.
2. **Harden the parse** — `scripts/fetch-course-payload.mjs` fetches any course's RAW
   `GetCourseDetails` payload (Craig runs it with his GHIN creds; works for The Meadows
   or anything else). Get payloads for the courses the inventory flags; widen the parse;
   commit trimmed fixtures + unit tests against the REAL shapes.
3. **A diagnostic surface** — somewhere an organizer can SEE what the app extracted for
   a course/tee (slope, rating, par, per-hole SI) and whether handicaps are riding the
   index fallback. Design small; propose before building (§2: more than one defensible answer).
4. **The default-TEE question** (from F-038): should the default be tips? Ask Craig with
   evidence from the inventory, don't guess.

**Money warning:** anything that changes which slope/rating a handicap uses IS handicap
math — stop and ask, worked example first (§2, §5.z).

## Also queued (Craig said "in order" — these follow, don't crowd out the audit)

- **Game-structure design doc** (§5.bj, L, design-first, runs in parallel): "a pool is
  effectively just a 4v4 game" — structure-first wizard question, modes as shortcuts,
  the §5g engine's UI framing. Absorbs F-037 (pairings), F-042 (money-toggle placement),
  F-060 opt B (merge rival build triggers), F-005's defaults-as-confirmations. Deliverable:
  design doc + mock walk, NO code.
- F-060 hub parity (S); F-030 opt C for the live-scoring session; the S-sized
  merge-audit polish items.

## Waiting on Craig (raise gently, don't block on them)

BACKLOG.md table: F-022 on-course stroke check vs GHIN app; the fetch-course-payload run
(step 2 needs him once); §7 q4; sending the friend the F-033 answer-back (drafted in the
2026-09-15 session wrap-up).

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
- Sandbox seeds sign in as Craig (GHIN 1234567), and since 2026-09-15 the sandbox owner
  is ALWAYS 1234567 regardless of `.env.local`'s real owner GHIN.
- e2e specs share `e2e/helpers.ts` (BASE, PHONE, grantAndReset, seedCard,
  seedAndOpenGame) — extend it, don't re-inline copies.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
