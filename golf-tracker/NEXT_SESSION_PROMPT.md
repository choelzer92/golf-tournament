# Next session: audit whether N sides made the app worse

Copy everything below the line into a fresh session.

---

## READ FIRST

- `AGENTS.md`
- `DECISIONS.md` — all of §5.ad through §5.ah are from the last session and are the decisions
  under audit here. Also §1 (north star), §5.d (three-layer config model), §5.e (keep the
  step-by-step interview), and §7 (open questions).
- `FINDINGS.md` — F-006 in full, plus F-012 and F-013.
- `UI_CONVENTIONS.md` and `UI_CRITIQUE_PROCESS.md` — follow the critique loop, don't critique
  ad hoc.

## STATE

Branch `ui-consistency-and-compute-tests`, 59 commits ahead of `main`. NOT merged, NOT pushed.
I merge when no friends are mid-round; that is my call, so do not ask and do not push. Working
tree clean. `npm run verify` is green at HEAD (1222 unit tests, typecheck, production build,
71 e2e) and starts its own sandbox server, so there is no manual setup.

The last session finished F-006 (a side game can now be 2–6 sides instead of exactly two, with
pairwise round-robin money and a pot) and F-013 (the scorecard draws N side rows from the
engine). Seven commits, `e442088..HEAD`.

## WHY I'M ASKING FOR THIS

**I am worried the N-sides work made the app worse, not better.** The north star is "maximum
possibility, minimum exposed complexity" and I want to know whether the second half still holds.
Three or more sides in one group is a real feature I asked for, but almost nobody will use it,
and the usual game is still two guys against two guys. If setting up that usual game now costs
more taps or shows more options than it did a week ago, the trade was bad and I want it reversed
or hidden, not defended.

**One instance is already confirmed, so start there rather than from scratch.** The side mode has
26 settings, 10 of which are always visible, and **four of those ten are "Side C name" through
"Side F name"**. The hub hides the unused ones (it knows the side count); the WIZARD does not,
because at step 1 it hasn't asked about sides yet. So creating a plain 2v2 today shows name boxes
for four sides that don't exist. That is exactly the failure §5.d and §5.e warn about, and it
shipped last session. Assume there are more like it.

## WHAT I WANT

A thorough audit, with screenshots, of what a real user actually SEES — and a judgement on
whether we are still on track. Not a summary of what was built; I know what was built.

1. **Walk the whole flow for the ORDINARY game** — two sides, best ball, the usual money — from
   an empty state to a settled result, on a phone viewport. Screenshot every screen. Count taps
   and count visible options at each step. Compare against `main` (i.e. before this branch) where
   you can, so "more complex" is a measurement and not an impression.

2. **Then walk the same flow for a classic pool** (N foursomes, no game mode) and for one
   individual game (skins or 9s). The audit's own root cause is one axis drifting from another —
   check whether this branch made the side axis richer than the others in ways that now read as
   inconsistent.

3. **Find every place a rarely-used option is exposed by default.** The Side C–F fields are one.
   Look for others: settings with no `showIf`, controls that only matter above two sides, labels
   that now hedge ("Sides (within group)" instead of "2 vs 2") in a way that makes the common case
   less clear rather than more general.

4. **Check the vocabulary honestly.** I renamed nothing myself. Last session renamed the mode from
   "2 vs 2 (within group)" to "Sides (within group)" and changed side naming to "Craig & Jym +1"
   and "Tony (solo)". Is that clearer for the person playing 2v2, or is it jargon that serves the
   rare case at the common case's expense? Screenshot both and tell me.

5. **Verify the claims from last session rather than trusting them.** Specifically: that no
   existing 2v2 game's money moved; that a legacy `{a,b}` game still saves the old way; that the
   scorecard and leaderboard agree on every side's total. Each of these is asserted by tests
   written by the same session that wrote the code, which §5.z says is not enough on its own.
   Probe them independently.

6. **Tell me what to CUT.** I would rather ship less and have it feel obvious. If three sides
   should be hidden behind something, or the pot model shouldn't be on the side game at all, or
   the extra name fields should go — say so plainly, with your reasoning, and rank the
   recommendations. "Leave it as is" is a legitimate answer if the measurements support it.

## ALSO IN SCOPE: can I actually set up a real day?

Separate from the complexity audit, and possibly more important. Walk through how I would set up
the games we actually play on a given day, and tell me which are expressible today, which are
awkward, and which are impossible:

- **2v2v2v2** — eight players, four pairs, all against each other. (`playersMax` is 8 on the side
  mode, so the engine should do this. Verify on screen, with money.)
- **A side game ON TOP of the main game** — e.g. four foursomes playing the pool, AND skins
  running across everyone. Or 2v2 for the team money plus individual skins alongside.
- **Different games on the front and back nine.**
- **A game that starts as one thing and changes** — someone joins at the turn, or we decide to
  press.

**The known structural blocker, verified:** `computeGameResult` reads a single `gameMode` string
per `PoolGame`, so a game is exactly ONE game. Layering a side bet on top of the main game is not
expressible at all today — not hard, not awkward, impossible. Also every mode except the side game
has `playersMax: 4`, so skins across eight players can't be set up either.

Don't build any of this. Tell me what each would take, what it would cost in exposed complexity,
and which ONE you'd do first if I only picked one. This is the "more possibilities than any app on
the market" half of the north star, so I want it scoped honestly against the complexity findings
above — some of these may be worth NOT doing.

## HOW TO WORK

Document first, change on request — this is an audit, so DON'T fix things you find. Write them up
in `FINDINGS.md` in the existing format (observation + options + recommendation), and bring me the
ranked list. The only exception is if you find a live money bug, in which case tell me immediately
before doing anything else.

Ask before any money, handicap, or scoring-math decision, and before anything with more than one
defensible answer.

**Look at the screen.** `NEXT_PUBLIC_SANDBOX=1 npx next dev --port 3200`, `/sandbox` seeds any
state in one click, `npx playwright test` writes screenshots to `e2e/screenshots/`. Existing seeds
include "Three sides in one group", "Three sides playing a POT", "2v2 best ball — mid-round",
"Classic pool — 2 foursomes", "Stableford pool", "Scramble pool". Add seeds if you need them.
Three defects last session were invisible in the code and obvious in a screenshot; the Side C–F
problem above was found by counting, not by reading.

## LESSONS THAT COST REAL BUGS (from the last three sessions)

1. A green test on money math proves nothing until you have watched it fail. Re-introduce the bug
   as a one-line mutation and confirm the test catches it. Last session, one mutation survived
   164 passing tests because the fixture made the error cancel. `DECISIONS.md` §5.z.
2. Ask what every OTHER surface does with a new concept before calling it done. §5.aa.
3. When two changes ship in one pass, check their INTERACTION. §5.ac.
4. When something looks wrong, probe before explaining. Several of my questions last session were
   answerable from the codebase, and two of the assistant's own test assertions were wrong while
   the code was right. §5.y, §5.ae.

## KNOWN OPEN, DO NOT RE-DECIDE

- `DECISIONS.md` §7 open question 8: PACE stays as built. Raised and settled; don't rebuild it.
- F-013's remaining half: the scorecard's own team math is still duplicated for TWO-side games and
  for all tournaments, because the tournament path has no compute engine to read from. That is
  scoped in F-013 and is deliberately not done. Don't start it as part of this audit.
- The side game's pot model and pairwise round-robin money are decided (§5.ag, §5.ae). You may
  recommend cutting or hiding them on UX grounds — that's the point of the audit — but don't
  re-litigate the arithmetic.
