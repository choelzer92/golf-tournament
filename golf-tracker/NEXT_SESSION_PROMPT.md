# Next session: the road to the end of the beta

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

Read `AGENTS.md`, `DECISIONS.md` (whole) and `BETA.md` first. Grep the archive only for the § you touch.

**Craig's goal (2026-10-14):** "get to the end of the beta, and then I will check everything out locally."
So: finish every bar item that doesn't need him, session after session, and BATCH what does need him
(below) instead of stopping on it. Each session still takes at most 3 items (BETA §3) and ends by
rewriting this file with the next 3 from "The road" below.

## State (2026-10-14, end of the 2nd session)

Branch **`series-2026-10-12`** (off main at d6adf75). It is NOT merged or pushed; merging is Craig's
call (§5.ab). The full gate's result for this session is in `.claude/verify-2026-10-14-s2.log`
(check its `VERIFY_EXIT=` line first; if it isn't 0, fixing that comes before anything below).

Done 2026-10-14 (2nd session): persona walks for bars #1–#3 (`e2e/persona-walks.spec.ts`, counts in
BETA §4, findings F-122–F-128); F-124 "Welcome" for a first-timer; F-128 the backup script pages past
PostgREST's 1000-row cap; bar #6 stroke vs match play written up, no math change
(`.claude/plans/stroke-vs-match-play.md`); bar #8 JSON export investigated (`.claude/plans/json-export.md`,
its shape is Craig's); the group Rename field fixed.

## This session: the next 3 (all [beta])

1. **Bar #5, F-063 C (per-cell score rows + an outbox):** approved (§5.ce). Investigate (schema,
   migration, dual-read and backfill, RLS, realtime), write the plan into roadmap Phase C, then build it
   sandbox-first (the fake gains the table). **Hard stop:** show Craig the live Supabase migration before
   it touches live. If the investigation fills the session, stop there with the plan written.
2. **Bar #6, F-121 for uneven teams** (§5.dd, decided): goldens first (3 v 2 zero-sum, mutation-checked),
   NEW games only (a stamp on modeSettings). Write the goldens and put them in Craig's batch; don't wire
   them into the engine until he has seen them.
3. **Bar #1, B5 paste names (F-126):** one box on the players step takes a whole list ("Lou Park 14",
   one per line; handicap optional). Then re-run `e2e/persona-walks.spec.ts` and record walk #1's new
   count in BETA §4.

Warm-up if time allows (XS): the groups step still offers tee times as well as the match cards (§5.dh);
drop the duplicate.

## The road after that (in order; promote ≤3 per session)

- **Bar #2, B6 the guest remembers their group (F-123)**, once Craig answers its one question (the bare
  URL: a Continue card or straight in). Re-run walk #2 after.
- **Bar #1, B7 plain words (F-125):** build, then show Craig the words.
- **Bar #8, the JSON export**, once Craig answers Q1–Q6 (`.claude/plans/json-export.md` has the build plan).
- **Presses** (§5.cy, [beta]): the eight design questions in BACKLOG go in Craig's batch; build after the
  answers, goldens first.
- **Then S2 convergence** (S2.0–S2.6; `.claude/plans/spine-s2.md` §6/§7, answers in §5.cs). It's not a bar
  item, so it comes after the bar items. Run both corpus harnesses before and after every slice.
- **The design/branding session, LAST before Craig's walk** (bar #7, §5.ci: "when we are almost done with the
  beta"): name, icon, theme, and F-114 (event standings on a phone). Then Craig walks the branded app once and
  merges (bar #10). It's a conversation with Craig, so schedule it when he's present.

## Craig's batch (collect here; he checks locally at the end)

Ask these when he's back, one at a time where the answer shapes code. Don't guess any of them.
- The local/phone walk: match cards (§5.de–§5.dh), F-037 (closes the P1), the Event, the long labels
  (two lines at 390px, `e2e/screenshots/f116-event-round-moved.png`).
- Merging `series-2026-10-12` (bar #10 needs his walk and merge).
- The branding/design session (bar #7): theme, icon, name, and F-114 (event standings on a phone).
- Presses: the eight design questions.
- Saved formats carrying the pot split.
- A GHIN-app side-by-side of a four-ball match off the low (F-037 T4, bar #6).
- The `[tag?]` rows in BACKLOG (BETA §2: [beta] or [after-beta] is his call).
- BACKLOG Ideas, **"Truly the best"** (2026-10-14): which, if any, to promote after the beta. Settle up in
  one tap, the season ledger, a shareable recap, live match status, a guest joining at the turn, score fixes
  with a trail.
- **F-122** a blank game name (A: fall back to the label, rec), **F-123** what the bare URL shows a
  remembered guest (A: a Continue card, rec), **F-127** Run it back on Home's card (A, rec).
- **Bar #8 JSON export Q1–Q6** (`.claude/plans/json-export.md`), and one re-run of
  `node scripts/export-backup.mjs` for a complete backup (F-128).
- **Bar #6 stroke vs match play** (`.claude/plans/stroke-vs-match-play.md`): a GHIN-app check of G1 (CH 5
  v 16, four-ball match at 90%: 9 or 10 strokes?), then A (no change) or B (the 2024 rule); D separately
  (default four-ball stroke play to 85%).
- Whatever the three items above add.

## Settled (don't re-ask)

§5.da–§5.dh (2026-10-13/14: label, dates, per-player money, the match cards on the teams step, one editor,
sizes from step 2, a tap only swaps). §5.df is superseded by §5.dg. Earlier: see DECISIONS.md.

## Machine notes

- **Memory is tight on this machine.** Run the full gate as `PW_WORKERS=1 npm run verify` (~15–17 min).
  Claude Code has killed gates for low memory; Craig can start it with
  `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` to prevent that.
- **A killed gate leaves orphans** (its Playwright run and `next start --port 3201`), and the next gate
  then fails with "3201 already used". Clear only this project's: PowerShell `Get-CimInstance
  Win32_Process`, match `*next*start*3201*`, `*playwright*test*` and `*next*build*`, and `Stop-Process`
  each by id. Stop your own `next dev --port 3200` before a gate too.
- Python on this machine writes cp1252 + CRLF by default. Pass `encoding='utf-8', newline='\n'` to
  `open()`, or em dashes turn to mojibake. Long inline scripts can trip the shell's quoting: write the
  script to a file outside the repo and run it with `python -I`.
- Vitest's setup swallows `console.log`; probe with a failing `expect(...).toBe('x')` and read "Received".
- **Mutation-check new tests**: break the fix, confirm the test fails, restore. One today passed blind
  (it compared captains as a set; a swap of two captains leaves the set unchanged).
- If verify shows a TS error inside `.next/dev/types`, delete `.next/dev/types` (a regenerable cache).
