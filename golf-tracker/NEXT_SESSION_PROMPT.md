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

## Step 1: Craig's open calls from §5.cz (ask outright, §5.bo)

- **F-115, the money label.** His rule: total risked · game type · teams · scoring · split, e.g. "$30
  Nassau 2v2 match play ($10/$10/$10)". FINDINGS F-115 lists six rule details to confirm, then build.
  It's display only, but it touches every money surface, so pin it in unit tests.
- **F-115, step 2's match question.** He wants to discuss it ("wouldnt this always be the case?").
  Options A/B/C are in F-115. Talk them through before any code.
- **F-116, do events need dates?** "it makes more sense to just set up the rounds and then play them."
  That reopens §5.cu's date columns. Bring options (set up N rounds at the start; order by seq; date
  optional) and a note on what changes in `lib/series.ts` and the standings.
- **F-114** (the standings on a phone) waits for the design session.

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
- F-115 rule details + the step 2 discussion; F-116 dates; F-114 in the design session.
- Presses: the eight design questions.
- Saved formats carrying the pot split.
- His phone walk of F-037 (which closes the P1) and of the Event.
- The branding/design session: theme, icon, name.

## Settled (don't re-ask)
§5.cz (today's answers), §5.cw–§5.cy. Earlier: see DECISIONS.md.

## Machine notes
- Python on this machine writes cp1252 + CRLF by default. Pass `encoding='utf-8', newline='\n'` to
  `open()` when editing files, or em dashes turn to mojibake (cost a run today).
- `taskkill` on a background `npx` doesn't always kill Playwright. Find it with PowerShell's
  `Get-CimInstance Win32_Process` and stop it by id. Give every run its own log name.
- If verify fails with "3201 already used", or a TS error inside `.next/dev/types`, kill only that
  project's `next start --port 3201` and delete `.next/dev/types` (a regenerable cache).
