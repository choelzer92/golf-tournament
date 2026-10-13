# Next session: F-115 and F-116 with Craig, then S2 convergence

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

Read `AGENTS.md`, `DECISIONS.md` (whole) and `BETA.md` first. Grep the archive only for the § you
touch: §5.cz for today, §5.cu–§5.cy for the Event, §5.cs for S2.

## State (2026-10-13)

Branch **`series-2026-10-12`** (off main at d6adf75). It is NOT merged or pushed; merging is Craig's
call (§5.ab). Full gate: `.claude/verify-2026-10-13-final.log`. Check its VERIFY_EXIT line; if it
isn't 0, fixing that comes first.

Done today, each its own commit:
- **Bar #11's 3-day persona walk, MEASURED** (`e2e/event-walk.spec.ts`, in the gate, ~1.3 min). The
  Tuesday Crew runs a 3-round trip from the group page; it settles zero-sum. 12 taps group → round 1,
  9–10 per added round, 91 per foursome per 18 holes, 1 to settle. Findings F-114 to F-120, with a
  walk record at the top of FINDINGS.
- **§5.cz answers built:** F-120 (the copy's summary read "$25/player pot" on a $10-a-leg match; it now
  states the legs). F-118 (a blank event name = "game type – course", shown as the placeholder).
  F-117 (an event round's auto name is the same label). F-119 a–e (a closed hub leads with the
  payouts and says "View card"; the Finish dialog on a pool card; the score pad stays one row; a
  copied round shows its group with its field first; formats aren't group chips).

## Step 1: build what §5.da settled (grep the archive for §5.da)

1. **F-115, the game label.** Total risked · Nassau/holes · teams · format (ALWAYS, best ball too) ·
   match or stroke play (Stableford either way) · split. A pot: "$200 pot ($25 each) · 2 teams of 4 ·
   best net & best gross · stroke play · Pays front / back / overall / junk (25% each)", or "Winner takes
   all". Ask Craig first what front + back with no overall is called. Unit tests per money model × format;
   it replaces the hub's repeated "2 teams of 4 · head-to-head".
2. **F-116: event dates OPTIONAL.** Seq orders the rounds; a date only groups columns when set.
   `lib/series.ts` goldens first.
3. **The matchup visual: a DESIGN NOTE, not code.** Step 2's matches use option A ("How do the teams play
   each other?"), decided early, with a movable visual of teams and who plays whom that drives pairings
   and tee groups. Mock 2–3 layouts (screenshots or ASCII) and ask Craig to pick.
F-114 (phone standings, "clear and inviting") waits for the design session.

## Step 2: S2 convergence (S2.0–S2.6)

Plan: `.claude/plans/spine-s2.md` §6 and §7; the answers are in §5.cs (NEW rows only; legacy keeps
computing, Q1). Run both corpus harnesses before and after every slice.

## Small [beta] items waiting (BACKLOG)
- The classic head-to-head hub doesn't say which scores count (F-115's label may cover it).
- The group page's Rename field may be dark-on-dark (screenshot it).
- **Presses (§5.cy):** eight design questions sit in BACKLOG. Ask them one at a time before code;
  goldens come first.
- The hub now repeats "2 teams of 4 · head-to-head" in the title, subtitle and event banner when a
  round takes the default name (F-117/F-118). Show Craig; F-115's label may change it anyway.

## Then
- The persona walks with tap counts for bars #1–#3 (copy `e2e/event-walk.spec.ts`'s `tap()` counter).
- F-063 C (bar #5), the stroke vs match play check (bar #6), the JSON export (bar #8).
- Saved formats keeping their pot split (Craig's call; ask).
- **End of each session:** groom BACKLOG, update `BETA.md` §4, run the full `npm run verify` once,
  and rewrite this file.

## Waiting on Craig (don't guess)
- Merging `series-2026-10-12`.
- F-115: front + back naming; the matchup-visual pick; F-114 in the design session.
- Presses: the eight design questions.
- Saved formats carrying the pot split.
- His phone walk of F-037 (which closes the P1) and of the Event.
- The branding/design session: theme, icon, name.

## Settled (don't re-ask)
§5.cz + §5.da (today's answers), §5.cw–§5.cy. Earlier: see DECISIONS.md.

## Machine notes
- Python on this machine writes cp1252 + CRLF by default. Pass `encoding='utf-8', newline='\n'` to
  `open()` when editing files, or em dashes turn to mojibake (cost a run today).
- `taskkill` on a background `npx` doesn't always kill Playwright. Find it with PowerShell's
  `Get-CimInstance Win32_Process` and stop it by id. Give every run its own log name.
- If verify fails with "3201 already used", or a TS error inside `.next/dev/types`, kill only that
  project's `next start --port 3201` and delete `.next/dev/types` (a regenerable cache).
