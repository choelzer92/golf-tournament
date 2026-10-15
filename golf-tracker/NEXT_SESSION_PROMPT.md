# Next session: the road to the end of the beta

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

Read `AGENTS.md`, `DECISIONS.md` (whole) and `BETA.md` first. Grep the archive only for the § you touch.

**Craig's goal (2026-10-14):** "get to the end of the beta, and then I will check everything out locally."
So: finish every bar item that doesn't need him, session after session, and BATCH what does need him
(below) instead of stopping on it. Each session still takes at most 3 items (BETA §3) and ends by
rewriting this file with the next 3 from "The road" below.

## State (2026-10-15, end of the 4th session)

Branch **`series-2026-10-12`**, NOT merged or pushed (merging is Craig's call, §5.ab). The full gate is GREEN at the end of the
session (`.claude/verify-2026-10-15-final2.log`: VERIFY_EXIT=0, unit 2888, e2e 292). Check it, then start below.

Done 2026-10-14/15 (4th session):
- **Presses BUILT** (§5.dj/§5.dk/§5.dm): a setup toggle (off), auto or the Press button, the overall its own
  toggle; the two-team match (team engine) and the classic two-foursome match; the card's Press panel and each
  press its own leaderboard line. **§5.dm: Team → Match games (individual matches inside teams) don't press**,
  since a press must never move a team result; match side bets are a BACKLOG idea.
- **F-063 C BUILT and its migration RUN ON LIVE (2026-10-15)**: per-cell `score_cells` + a localStorage outbox;
  the later TAP wins (§5.dn); audit server-side; the old card blob kept current by trigger (rollback =
  redeploy). Verified on PGlite, on a copy of live, and live read-only (131/131 cards). **Every phone is still
  on the old app until Craig merges and deploys.** Then his two-phone walk closes bar #5.
- **Backup run** (bar #8 closed). **B5 paste names dropped** (§5.do: GHIN lookup + groups cover it).
- Warm-ups: **F-122** (the name is optional, blank = game + course), **F-127** (Run it back on Home's
  cards), **§5.dh** (a match game's groups step confirms the card's tee time).

## This session: the next 3 (all [beta])

1. **§5.di strokes defaults (bar #6, money defaults, NEW games only, goldens first):** match play DEFAULTS to
   off the low (full stays available); the allowance default follows the USGA Appendix C table by format
   (individual stroke 95%, four-ball stroke 85%, singles match 100%, four-ball match 90%), editable; a saved
   format and Run it back carry the chosen allowance and stroke settings. Stamp new games so live ones don't move.
2. **Bar #6, F-121 for uneven teams** (§5.dd, decided): goldens first (3 v 2 zero-sum, mutation-checked), NEW
   games only (a stamp on modeSettings). **Show Craig the goldens before wiring them in.**
3. **Bar #2, B6 the guest remembers their group (F-123 A):** ask the group once, open straight to that card,
   hide My Games from guests, and the plain URL shows a "Continue: <game>, <team>" card. Re-run walk #2 after.

Warm-ups if time allows: **F-129** (the match-play card says "Stroke Play"/"2 back" while the board says "match
play"/"2 up"; Rec A, read both from the engine and the label); the **verify:quick pick gap** (BACKLOG: it skipped
`f088-f090-hub`, `phase3-payout`, `split-round-money`; a pick over 25 should run the full gate).

## The road after that (in order; promote ≤3 per session)

- **Bar #1, B7 plain words (F-125):** build, then show Craig the words.
- **Then S2 convergence** (S2.0–S2.6; `.claude/plans/spine-s2.md` §6/§7, answers in §5.cs). It's not a bar
  item, so it comes after the bar items. Run both corpus harnesses before and after every slice.
- **The design/branding session, LAST before Craig's walk** (bar #7, §5.ci): name, icon, theme, and F-114
  (event standings on a phone). Then Craig walks the branded app once and merges (bar #10). It's a
  conversation with Craig, so schedule it when he's present.

## Craig's batch (collect here; he checks locally at the end)

Ask these when he's back, one at a time where the answer shapes code. Don't guess any of them.
- **Merge + deploy `series-2026-10-12`**, then the two-phone walk: score on one phone, watch a second phone and
  the leaderboard update live (closes bar #5; the migration is already live, `.claude/plans/score-cells-migration.md`).
- The local/phone walk: match cards (§5.de–§5.dh), F-037 (closes the P1), the Event, presses
  (`e2e/screenshots/presses-*.png`), the long labels at 390px.
- The branding/design session (bar #7): theme, icon, name, and F-114.
- Saved formats carrying the pot split.
- A GHIN-app side-by-side of a four-ball match off the low (F-037 T4, bar #6).
- The `[tag?]` rows in BACKLOG, including **match side bets** (§5.dm) and **"why can't I press here?"** (a
  one-line reason where the Presses setting is hidden).
- **F-130:** add "· presses" to the game label? (Rec A.)
- BACKLOG Ideas, **"Truly the best"**: which, if any, to promote after the beta.
- Whatever this session's three items add.

## Settled (don't re-ask)

§5.da–§5.do (2026-10-13/15). §5.df is superseded by §5.dg. Earlier: see DECISIONS.md.

## Machine notes

- **Memory is tight on this machine.** Run the full gate as `PW_WORKERS=1 npm run verify` (~15–17 min).
  Claude Code has killed gates for low memory; Craig can start it with
  `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` to prevent that.
- **A killed gate leaves orphans** (its Playwright run and `next start --port 3201`), and the next gate
  then fails with "3201 already used". Clear only this project's: PowerShell `Get-CimInstance
  Win32_Process`, match `*next*start*3201*`, `*playwright*test*` and `*next*build*`, and `Stop-Process`
  each by id. Stop your own `next dev --port 3200` before a gate too.
- **Live migrations:** auto mode blocks `supabase db push`. Do the backup, a PGlite rehearsal on it
  (`.claude/rehearse-score-cells.mjs` is the pattern), `migration list` and `db push --dry-run` yourself; then
  Craig runs `! npx -y supabase@2.121.0 db push --yes`. Never edit permission settings to get past the block.
- **Shared-lib changes: run the full gate, not verify:quick** (its pick over 25 specs skips some and omits the
  production build; Craig's catch, 2026-10-14).
- Python on this machine writes cp1252 + CRLF by default. Pass `encoding='utf-8', newline='\n'` to `open()`.
  Long inline scripts trip the shell's heredoc quoting: write the script with the Write tool to
  `%LOCALAPPDATA%\Temp\` and run it with `python -I "$LOCALAPPDATA/Temp/x.py"` (python doesn't see `/tmp`).
- Vitest's setup swallows `console.log`; probe with a failing `expect(...).toBe('x')` and read "Received".
- **Mutation-check new tests**: break the fix, confirm the test fails, restore.
- If verify shows a TS error inside `.next/dev/types`, delete `.next/dev/types` (a regenerable cache).
