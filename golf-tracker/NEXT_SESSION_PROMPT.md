# Next session: Craig's two picks, then S2 convergence

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

Read `AGENTS.md`, `DECISIONS.md` (whole) and `BETA.md` first. Grep the archive only for the § you
touch: §5.da–§5.dc for today, §5.cs for S2.

## State (2026-10-13, second session)

Branch **`series-2026-10-12`** (off main at d6adf75). It is NOT merged or pushed; merging is Craig's
call (§5.ab). Full gate: `.claude/verify-2026-10-13-f115-f116.log`. Check its VERIFY_EXIT line; if it
isn't 0, fixing that comes first.

Done today, each its own commit:
- **F-115, the game label (ff57f3b, §5.da/§5.db).** `lib/game-label.ts` is the one label on the hub,
  leaderboard, share panel, list cards and the wizard's Review step, which reads `draftPoolGame()`, the
  game Create saves. "$30 Nassau ($10/$10/$10) · 4v4 · best net & best gross · match play · + $5 a junk
  point". Stakes are PER PLAYER: team-game stakes are per team, so the label divides them by team size.
  This is pinned against `perPlayerNets` as an oracle, and the mutation is caught. The legs model is now
  "Bet per nine & overall". Unnamed events/rounds = `gameTypeName` ("4v4 best ball – Course").
- **F-116 (1442a97, §5.dc).** Event rounds run in set-up order (seq), moved with ↑/↓ on the event screen
  (`moveRound` + `reorderSeries`). Dates are optional and the wizard's field starts blank; a date heads
  only the consecutive rounds that share it.
- **The matchup-visual design note:** `.claude/plans/matchup-visual.md` (A match cards, recommended;
  B ladder; C split).

## Step 1: build Craig's two picks
1. **The matchup visual is PICKED: layout A (§5.de).** Match cards on step 2, tap-to-swap any two players
   (across teams too), tee time edited on the card. Build it; plan the step order change first.
2. **F-121 is DECIDED (§5.dd), so build it:** every amount is per player except a pot's total. Uneven
   teams: each loser pays the stated $ and the winners share it. A team pot antes per player. Goldens
   first (3 v 2 zero-sum, mutation-checked), NEW games only (a stamp on modeSettings), and saved games
   keep per-team. Then the label drops its ÷ team size for the new unit.

## Step 2: S2 convergence (S2.0–S2.6)

Plan: `.claude/plans/spine-s2.md` §6 and §7; the answers are in §5.cs (NEW rows only; legacy keeps
computing, Q1). Run both corpus harnesses before and after every slice.

## Small [beta] items waiting (BACKLOG)
- The group page's Rename field may be dark-on-dark (screenshot it).
- **Presses (§5.cy):** eight design questions sit in BACKLOG. Ask them one at a time before code;
  goldens come first.
- Walk the new label on a phone: list cards and the event's round rows now carry the full label, which
  is long (two lines at 390px, `e2e/screenshots/f116-event-round-moved.png`). Show Craig.

## Then
- The persona walks with tap counts for bars #1–#3 (copy `e2e/event-walk.spec.ts`'s `tap()` counter).
- F-063 C (bar #5), the stroke vs match play check (bar #6), the JSON export (bar #8).
- Saved formats keeping their pot split (Craig's call; ask).
- **End of each session:** groom BACKLOG, update `BETA.md` §4, run the full `npm run verify` once,
  and rewrite this file.

## Waiting on Craig (don't guess)
- Merging `series-2026-10-12`.
- F-114 in the design session.
- Presses: the eight design questions.
- Saved formats carrying the pot split.
- His phone walk of F-037 (which closes the P1) and of the Event.
- The branding/design session: theme, icon, name.

## Settled (don't re-ask)
§5.da–§5.de (today's answers), §5.cw–§5.cz. Earlier: see DECISIONS.md.

## Machine notes
- Python on this machine writes cp1252 + CRLF by default. Pass `encoding='utf-8', newline='\n'` to
  `open()` when editing files, or em dashes turn to mojibake.
- Vitest's setup swallows `console.log`; probe with a failing `expect(...).toBe('x')` and read "Received".
- `taskkill` on a background `npx` doesn't always kill Playwright. Find it with PowerShell's
  `Get-CimInstance Win32_Process` and stop it by id. Give every run its own log name.
- If verify fails with "3201 already used", or a TS error inside `.next/dev/types`, kill only that
  project's `next start --port 3201` and delete `.next/dev/types` (a regenerable cache).
