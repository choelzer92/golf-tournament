# Next session: the road to the end of the beta

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

Read `AGENTS.md`, `DECISIONS.md` (whole) and `BETA.md` first. Grep the archive only for the § you touch.

**Craig's goal (2026-10-14):** "get to the end of the beta, and then I will check everything out locally."
So: finish every bar item that doesn't need him, session after session, and BATCH what does need him
(below) instead of stopping on it. Each session still takes at most 3 items (BETA §3) and ends by
rewriting this file with the next 3 from "The road" below.

## State (2026-10-14)

Branch **`series-2026-10-12`** (off main at d6adf75). It is NOT merged or pushed; merging is Craig's
call (§5.ab). HEAD `0f6646f`. Full gate GREEN at `ac752eb` (the last app commit; only docs since):
`.claude/verify-2026-10-14-teams-cards-d.log`, 288 passed, VERIFY_EXIT=0.

Built 2026-10-13/14 (§5.da–§5.dh): the game label (F-115), optional event dates and round order (F-116),
per-player money on even teams (F-121 even), and the **match cards**: step 2 asks "How do the teams play
each other?"; the teams step arrives dealt and its ONE editor is the cards (playing handicaps, tap two
players to swap, names in the legend, captain "C", tee time on the card). Team sizes come from step 2
only. Code: `steps/match-cards.tsx`, `lib/match-cards.ts`.

## This session: the next 3 (all [beta])

BACKLOG was groomed 2026-10-14: "Now" holds exactly these, every open row is tagged, the after-beta rows
have their own section, and "Waiting on Craig" is the batch below.

1. **Persona walks with tap counts for bars #1, #2 and #3.** Copy `e2e/event-walk.spec.ts`'s `tap()`
   counter. #1: a first-time organizer from the URL to a shared game (target about 2 minutes, no
   unexplained jargon). #2: an invited player scores in about 3 taps, and the app remembers their group.
   #3: a returning organizer runs the same game again (target 2 taps; §5.cm accepted 1 + Next × 6). Record
   the counts in BETA §4, and log every finding in FINDINGS. Fix only small, mechanical ones; anything with
   more than one answer goes in Craig's batch.
2. **Bar #8, the JSON export.** BACKLOG "Backups / JSON export" + §5.cs Q10 (yes, READ-ONLY). Investigate
   first (which tables, who may export what, where the button lives); if the shape has more than one
   defensible answer, put the question in Craig's batch and build the rest. All persistence stays in the 5
   lib files.
3. **Bar #6, the stroke vs match play check** (§5.ce, BACKLOG "Stroke vs match play handicap
   investigation"). Pin down the USGA rule and compare it with what the money engine does. Write it down.
   If the math has to change, STOP: that's Craig's (money math), and it goes in his batch with goldens
   ready.

Warm-up if time allows (XS, bar #7): the group page's Rename field may be dark-on-dark
(`home/groups/[id]/page.tsx` ~279). Screenshot it; fix it if so.

## The road after that (in order; promote ≤3 per session)

- **Bar #5, F-063 C (per-cell score rows + an outbox):** approved (§5.ce). Investigate, then build it
  sandbox-first (the fake gains the table). **Hard stop:** show Craig the live Supabase migration before it
  touches live.
- **Bar #6, F-121 for uneven teams** (§5.dd, decided): goldens first (3 v 2 zero-sum, mutation-checked),
  NEW games only (a stamp on modeSettings). Show Craig the goldens before wiring them in.
- **Presses** (§5.cy, [beta]): the eight design questions in BACKLOG go in Craig's batch; build after the
  answers, goldens first.
- Small: the groups step still offers tee times as well as the cards (§5.dh); drop the duplicate.
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
