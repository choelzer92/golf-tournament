# Next session: the Event's 3-day persona walk (bar #11), then S2 convergence

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

Read `AGENTS.md`, `DECISIONS.md` (whole) and `BETA.md` first. Grep the archive only for the § you
touch: §5.cu–§5.cy for the Event and today's work, §5.cs for S2.

## State (2026-10-12, end of session 3)

Branch **`series-2026-10-12`** (off main at d6adf75). It is NOT merged or pushed; merging is Craig's
call (§5.ab). Full gate: `.claude/verify-2026-10-12-cw.log` (run with `PW_WORKERS=1`; check its
VERIFY_EXIT line, and if it isn't 0, fixing that comes first).

Built today, each its own commit:
- **Event follow-ups (§5.cw):** a round set up ahead reads "Not started" until its first score (no
  Projected, no Continue card); the organizer can Rename the event; the group page shows an event as one
  row with its rounds nested; guests on a round's link keep the standings.
- **The dashboard is KEPT, as the Course & GHIN lookup page (§5.cx).** It has the course lookup and a new
  read-only "look up a golfer" (any index, by name or GHIN #). Home's copies are gone. Game and
  tournament headers, and not-found pages, go to Home. Money Game and Quick game left it (both are
  wizard games). Only the Ryder Cup–style Team tournament stays, until the Event adds up points.
- **F-110:** the GHIN Link no longer wipes who you are. **F-111:** the group page adds new players by
  GHIN ("+ Someone new").
- **F-113 [P1 money] FIXED:** the wizard dropped "Hole by hole (match play)" on classic head-to-head
  games, so their legs settled on stroke totals. A read-only live count found no game affected.
- **F-112:** the old builders' auto-press, skins carryover and skin value never scored (the Money Game
  never paid its dollars either). They're hidden now.

## Step 1: the 3-day persona walk (bar #11's measure)

From a group: start an event, play round 1, add rounds 2 and 3 (two on the same day), close them out,
and settle. Record the tap counts, and screenshot and critique every step as a first-time organizer
(§ walk-the-UI). Log findings in FINDINGS and ask Craig the option questions outright (§5.bo).
Screenshots are context-heavy: delegate reading them in batches if needed.

## Step 2: S2 convergence (S2.0–S2.6)

Plan: `.claude/plans/spine-s2.md` §6 and §7; the answers are in §5.cs (NEW rows only; legacy keeps
computing, Q1). Run both corpus harnesses before and after every slice.

## Small [beta] items waiting (BACKLOG)
- The classic head-to-head hub doesn't say which scores count, or whether legs are hole by hole.
- The group page's Rename field may be dark-on-dark (screenshot it).
- **Presses (§5.cy):** a manual "Press" button mid-match, NOT auto-press. Eight design questions sit in
  BACKLOG. Ask them one at a time before any code; it's money math, so goldens come first.

## Then
- The persona walks with tap counts (bars #1–#3).
- F-063 C (bar #5), the stroke vs match play check (bar #6), the JSON export (bar #8).
- Saved formats keeping their pot split (Craig's call; ask).
- GHIN-app side-by-sides: a four-ball match off the low (T4); a CH ≥ 37 player (F-108).
- **End of each session:** groom BACKLOG, update `BETA.md` §4, run the full `npm run verify` once
  (`PW_WORKERS=1` on a low-memory day), and rewrite this file.

## Waiting on Craig (don't guess)
- Merging `series-2026-10-12`.
- Presses: the eight design questions.
- Saved formats carrying the pot split.
- His phone walk of F-037 (which closes the P1).
- The branding/design session: theme, icon, name.
- The no-GHIN organizer: DEFERRED (§5.ch).

## Settled (don't re-ask)
§5.cw (Event follow-ups), §5.cx (lookups page; builders; F-113 fix and read-only count), §5.cy
(presses as a manual button). Earlier: see DECISIONS.md.

## Machine notes
Craig's machine ran low on memory today: a background gate was killed, and it left `next start` on
port 3201 and a half-written `.next/dev/types/validator.ts`. If verify fails with "3201 already used",
or a TS error inside `.next/dev/types`, kill only that project's `next start --port 3201` process and
delete `.next/dev/types` (a regenerable cache).
