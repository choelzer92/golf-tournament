# Next session: the Series (multi-day trip, bar #11), then S2 convergence

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

Read `AGENTS.md`, `DECISIONS.md` (whole) and `BETA.md` first. Grep the archive only for the § you
touch: §5.co–§5.ct for this session's calls, §5.cf/§5.cr for the Series.

## State (2026-10-12)

Branch `phase-b-2026-10-05` was **merged to main and pushed on Craig's word** at the end of the
session, after a green full `npm run verify` (`.claude/verify-2026-10-12-final.log`). Start the next
work on a NEW feature branch (§5.ab). Landed:

- **F-037 Team → Match** (§5.co; T0–T4, polish):
  - the Compete step asks "Head-to-head matches? No / 1 v 1 / 2 v 2";
  - the tee sheet is built from fair suggested pairings;
  - match points (or holes won / net strokes) roll up to team totals;
  - all four money models; tiebreaks; Nassau legs with points per leg;
  - off the low per match (T4);
  - an unpairable sheet is refused everywhere.
- **F-106:** the swap preview recomputes strokes per arrangement.
- **F-107 (§5.cq):** singles pairings are stored on the tee group and shown on every card.
- **§5.cp:** a late player never joins a match. The answer is a second game on the round (BACKLOG, not built).
- **§5.cr:** the multi-day trip is a **Series** of ordinary games. §5.cs: the S2 questions are answered.
- **The ledger fix (S2 Q3):**
  - money strokes follow the round's real handicap;
  - split rounds default to the 18-hole handicap on the card's stroke index, with per-nine as a
    Money Games choice;
  - T0's round 3 had about double strokes;
  - the before/after is in `.claude/plans/spine-s2.md` §8. Craig verified the cause.
- **F-108 (§5.ct):** no 2-strokes-a-hole cap. The maximum index is 54.0. No live player-round moved.
- **Read-only corpus harnesses**, skipped without an export:
  - `src/test/ledger-corpus.test.ts`
  - `src/test/strokes-corpus.test.ts`
  - Run them with `LEDGER_CORPUS=backups/<stamp>` after `node scripts/export-backup.mjs` (Q10 yes).

## Step 1: the Series, design note first, then build (bar #11)

The shape is `Series { gameIds, sourceGroupId, rollup: 'money' | 'points' }` (§5.cr). Each day is
an ordinary game; cumulative money is the sum of per-player `moneyNet` (the F-068 split). Write a
short design note in `.claude/plans/` covering:
- create a trip from a group's preferences (§5.cf);
- add a day (Run it back fits, §5.cm);
- the rollup screen;
- where it lives on Home (§5.ck group cards);
- a points rollup later (Ryder Cup, built on Team → Match).

Ask Craig what's his call, ONE question at a time, then build goldens first.

## Step 2: S2 convergence (S2.0–S2.6), after or in parallel

Plan: `.claude/plans/spine-s2.md` §6 and §7. The answers are in §5.cs and cover NEW rows only; legacy
tournaments keep computing as today (Q1):
- Q2: each player's own tee;
- Q4: per-ball two-best-balls Stableford;
- Q5: scale + scramble % settings;
- Q7: a per-player Nassau stake;
- Q8: the pool's skins rules;
- Q9: the index stands in.

Split rounds stay legacy (Q6 → §5.cp). Run both corpus harnesses before and after every slice.

## Then
- The persona walks with tap counts (bars #1–#3).
- F-063 C (bar #5), the stroke vs match play check (bar #6), the JSON export (bar #8).
- Saved formats keeping their pot split (BACKLOG, Craig's call; ask).
- GHIN-app side-by-sides, as confirmations:
  - a four-ball match off the low (T4);
  - a CH ≥ 37 player (F-108).
- **End of each session:** groom BACKLOG, update `BETA.md` §4, run the full `npm run verify` once,
  and rewrite this file.

## Waiting on Craig (don't guess)
- **The Series design questions** (Step 1).
- **Saved formats carrying the pot split.**
- **His phone walk of F-037** (which closes the P1).
- **Branding/design session:** the theme, the icon, the name.
- **No-GHIN organizer: DEFERRED (§5.ch).**

## Settled (don't re-ask)
§5.co (all six Team → Match answers + money), §5.cp, §5.cq, §5.cr, §5.cs (Q1–Q10 + the split-round
rule), §5.ct. Earlier: see DECISIONS.md.
