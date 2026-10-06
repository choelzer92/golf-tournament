# Next session: settle Team → Match, then the S2 questions, then Home by group

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

Read `AGENTS.md`, `DECISIONS.md` (whole) and `BETA.md` first. Grep the archive only for the § you
touch: §5.ck–§5.cn for the latest calls, §5.bu/§5.ce for the spine.

## State (2026-10-06)

Branch `phase-b-2026-10-05`: NOT merged, NOT pushed (§5.ab: never unbidden). The full `npm run
verify` is green (`.claude/verify-2026-10-06-final.log`, 261/261). Landed this session:
- **B9** (f7fe1ec): Close out and Finish Game stay hidden until a score exists.
- **B3 + F-105** (745688c, §5.cl): Create is the share moment.
- **Hide-holes checkbox in the wizard** (477b1f9, §5.ck): shown only when each team is its own foursome.
- **B1 Run it back** (97fe68e, d99a8db, §5.cm):
  - an organizer-only button on a finished game, plus "Start from a recent game" atop New Game;
  - the format is copied and the field, course and tees pre-filled, with every step walked;
  - handicaps use today's index;
  - the same field keeps its teams;
  - the pot split is carried when the team count matches.
- **Plans written, nothing built:** `.claude/plans/spine-s2.md` (S2), `.claude/plans/f037-opt-b.md`
  (superseded in part) and `.claude/plans/team-match.md` (the reframed F-037).

On a low-memory day, or with agents running alongside, use `PW_WORKERS=1`. A beforeEach timeout in
the reset hook under load is a flake (seen 2026-10-05); rerun once the machine is quiet.

## Step 1: Team → Match → side games (F-037 reframed, §5.cn). Ask, then build

Craig reframed F-037: teams are sets of players, matches are head-to-head (match size decides how
many), and match results roll up to team totals that settle the pot. The default is **match points
1 / ½ / 0**; holes won and net strokes are alternatives. Ask `team-match.md`'s six open questions
ONE at a time with AskUserQuestion. They cover:
- counts that don't rotate fairly;
- team ties;
- money from team points;
- Nassau inside a match;
- where it's asked;
- who meets whom.

Record each answer (archive entry + index line). Then build T0 → T4 goldens first, one commit per
slice, and walk the UI.

## Step 2: the S2 questions (`spine-s2.md`), after Step 1

Team → Match is the roll-up a Series needs. The S2 agent recommends **Series first** for bar #11,
with S3 unnecessary. Ask **Series vs S4** first, then the 10 engine questions (old vs new engine
for existing tournaments, mixed tees, the ledger on 9-hole/split rounds, etc.).

Two read-only findings may be live-money bugs, so report them to Craig, don't fix unasked:
- **Mixed tees:** tournament results use the default tee's stroke index while the scorecard uses
  each player's own tee; two live rounds are affected.
- **Money ledger:** it uses the 18-hole course handicap on split/9-hole rounds; live T0 is affected.

## Then
- **Home organizes games by group** (§5.ck, BACKLOG): a Continue card on top, group cards each with
  their latest game, then "Other games". Put Run it back on the group cards.
- **Saved formats keep their pot split?** (BACKLOG, found on the B1 walk): Craig's call; ask.
- **Phase B remainder:** B4b/c, B7, B2, B5, B6, B8 (`.claude/plans/roadmap-2026-10.md` "Re-ranked").
- **Phase A remainder:**
  - F-103 b.
  - F-103 c: CTP last-write-wins across tee groups.
  - A5 doc hygiene.
- **F-063 C** (bar #5), the stroke vs match play check (bar #6), JSON export (bar #8), D6 copy diet.
- **End of each session:** groom BACKLOG, update `BETA.md` §4, run the full `npm run verify` once in
  the background, and rewrite this file.

## Waiting on Craig (don't guess)
- **The six Team → Match questions** (Step 1) and **Series vs S4** plus the S2 questions (Step 2).
- **Saved formats carrying the pot split.**
- **Branding/design session:** the theme (§7 q4), the app icon and name ("GrudgeMatch" floated).
- **Merging the branch.** Craig walks it on a phone first (bar #10).
- **No-GHIN organizer: DEFERRED (§5.ch).**

## Settled (don't re-ask)
- **§5.ck:**
  - Home is organized by group with a live Continue card;
  - q4 is folded into branding;
  - the hide-holes wizard checkbox shows only when each team is its own foursome.
- **§5.cl:** Create is the share moment.
- **§5.cm:** Run it back as built (see State).
- **§5.cn:** Team → Match direction; the default is match points; 3+ teams are OK where the counts
  rotate fairly; strokes come off the low per match; junk is earned in the match and tallied by team.
- Earlier: §5.cg–§5.cj (see DECISIONS.md).
