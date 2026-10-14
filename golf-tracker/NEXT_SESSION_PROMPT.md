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

Craig answered the whole batch at the end of 2026-10-14 (§5.di, §5.dj). Don't re-ask any of it.

1. **Presses (§5.dj), FIRST.** A setup toggle (off by default); on → **auto press** or **a Press button**
   during the match. 2 down triggers both; re-presses unlimited (each starts all square); a press is a NEW,
   SEPARATE bet at the leg's stake, from the next hole to the end of its nine (the original stays live; not
   double or nothing); automatic once tapped; the scorer taps it; removable any time with a "press removed"
   note; every head-to-head match. Write a design note (`.claude/plans/presses.md`) and the goldens
   (zero-sum per press; the worked examples: 2 down after 4, press 5–9, win 5/7/9 → press 3 up AND front 1
   up; a press won but the leg lost → $0). **OPEN, bring options:** can the OVERALL be pressed? Craig: "someone
   may want to press a front 9 and then not realize they are pressing the overall too." **Show Craig the note
   and goldens before wiring** the setting, the button and the settle-up lines (money math, §2).
2. **Bar #5, F-063 C (per-cell score rows + an outbox):** approved (§5.ce). Investigate (schema,
   migration, dual-read and backfill, RLS, realtime), write the plan into roadmap Phase C, then build it
   sandbox-first (the fake gains the table). **Hard stop:** show Craig the live Supabase migration before
   it touches live. If the investigation fills the session, stop there with the plan written.
3. **Bar #1, B5 paste names (F-126):** one box on the players step takes a whole list ("Lou Park 14",
   one per line; handicap optional). Then re-run `e2e/persona-walks.spec.ts` and record walk #1's new
   count in BETA §4.

Warm-ups if time allows (XS–S, all decided §5.di): F-122 a blank game name falls back to the game label (as
F-118 does for events), Next always live; F-127 "Run it back" on Home's finished-game card; the groups step's
duplicate tee times (§5.dh).

## The road after that (in order; promote ≤3 per session)

- **§5.di defaults (money defaults, NEW games only, goldens first):** match play DEFAULTS to off the low (full
  stays available); the allowance default follows the USGA Appendix C table by format (individual stroke 95%,
  four-ball stroke 85%, singles match 100%, four-ball match 90%), editable; a saved format and Run it back
  carry the chosen allowance and stroke settings ("saved as the format if they continue to use it").
- **Bar #6, F-121 for uneven teams** (§5.dd, decided): goldens first (3 v 2 zero-sum, mutation-checked),
  NEW games only (a stamp on modeSettings). Show Craig the goldens before wiring them in.
- **Bar #2, B6 the guest remembers their group (F-123 A):** ask the group once, open straight to that card,
  hide My Games from guests, and the plain URL shows a "Continue: <game>, <team>" card. Re-run walk #2 after.
- **Bar #1, B7 plain words (F-125):** build, then show Craig the words.
- **Then S2 convergence** (S2.0–S2.6; `.claude/plans/spine-s2.md` §6/§7, answers in §5.cs). It's not a bar
  item, so it comes after the bar items. Run both corpus harnesses before and after every slice.
- **The design/branding session, LAST before Craig's walk** (bar #7, §5.ci: "when we are almost done with the
  beta"): name, icon, theme, and F-114 (event standings on a phone). Then Craig walks the branded app once and
  merges (bar #10). It's a conversation with Craig, so schedule it when he's present.

Bar #8 is no longer an app feature (§5.di): the backup is separate maintenance, the fixed
`scripts/export-backup.mjs`. Craig runs it once to close the bar.

## Craig's batch (collect here; he checks locally at the end)

Ask these when he's back, one at a time where the answer shapes code. Don't guess any of them.
- The local/phone walk: match cards (§5.de–§5.dh), F-037 (closes the P1), the Event, the long labels
  (two lines at 390px, `e2e/screenshots/f116-event-round-moved.png`).
- Merging `series-2026-10-12` (bar #10 needs his walk and merge).
- The branding/design session (bar #7): theme, icon, name, and F-114 (event standings on a phone).
- Saved formats carrying the pot split.
- A GHIN-app side-by-side of a four-ball match off the low (F-037 T4, bar #6).
- The `[tag?]` rows in BACKLOG (BETA §2: [beta] or [after-beta] is his call).
- BACKLOG Ideas, **"Truly the best"** (2026-10-14): which, if any, to promote after the beta. Settle up in
  one tap, the season ledger, a shareable recap, live match status, a guest joining at the turn, score fixes
  with a trail.
- **Run the backup once:** `node scripts/export-backup.mjs` (fixed by F-128) closes bar #8.
- **Presses: can the overall be pressed?** (§5.dj OPEN; the design note brings options.)
- **Stroke vs match rounding: DONE (§5.dl).** Match play rounds the unrounded difference, and stroke play rounds each. Built 2026-10-14 for all games.
- Whatever the three items above add.

## Settled (don't re-ask)

§5.da–§5.dj (2026-10-13/14: label, dates, per-player money, the match cards on the teams step, one editor,
sizes from step 2, a tap only swaps; §5.di the persona-walk answers, the backup, the strokes defaults; §5.dj presses). §5.df is superseded by §5.dg. Earlier: see DECISIONS.md.

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
