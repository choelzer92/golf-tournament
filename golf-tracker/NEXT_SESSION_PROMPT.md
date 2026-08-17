# Next session: did we overcomplicate it?

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` and `DECISIONS.md` §1 (the north star). Skim `FINDINGS.md` F-006 for what the
last session built. That's enough reading — a long reading list is its own kind of complexity.

**State:** branch `ui-consistency-and-compute-tests`, 60 commits ahead of `main`, NOT merged, NOT
pushed. Merging is my call; don't ask, don't push. `npm run verify` is green (1222 unit tests,
typecheck, build, 71 e2e) and starts its own sandbox, so there's no setup.

## The question

The last session generalized the 2v2 game to 2–6 sides. **I want to know whether that made setting
up the NORMAL game worse.** The normal game is two guys against two guys, best ball, usual money.
Almost nobody will ever play three sides.

The north star is "maximum possibility, **minimum exposed complexity**". Nobody has checked the
second half since this branch started.

## What to do

1. **Set up the ordinary 2v2 from scratch on a phone viewport.** Empty state → playing. Screenshot
   every screen. Count the taps and count the options visible on each one.

2. **Do the same on `main`** (before this branch). Same game, same counts.

3. **Tell me the difference, in numbers.** More taps? More options on screen? Words that got
   vaguer? If the answer is "identical for the normal game", say that plainly — that's a good
   result, not a boring one.

4. **Tell me what to cut.** Ranked. If three sides should be hidden, or the pot model shouldn't be
   there, or a setting should go — say so. Include the cost of each cut.

**One lead to start from**, found by counting rather than reading: the side game now has 26
settings, 10 always visible, and four of those are "Side C name" through "Side F name". The hub
hides the unused ones; the wizard hard-codes a two-side hide, so the common case *may* be fine and
the exposure may be in the hub instead. Logged as **F-014** — needs a screenshot before it's called
a defect. Assume there are more like it.

Also worth an honest look: the mode was renamed from "2 vs 2 (within group)" to "Sides (within
group)". Is that clearer for someone playing 2v2, or is it vaguer in service of a case they'll
never hit?

## Rules

- **Document, don't fix.** Write findings into `FINDINGS.md` in the existing format (observation +
  options + recommendation) and bring me the ranked list. Exception: a live money bug — tell me
  immediately.
- **Look at the screen.** `/sandbox` seeds any state in one click; `npx playwright test` writes to
  `e2e/screenshots/`. Seeds exist for 2v2, three sides, classic pool, Stableford and scramble
  pools. Three defects last session were invisible in the code and obvious in a screenshot.
- Ask before anything with more than one defensible answer.
- Don't re-decide what's settled: PACE (§7 q8), the pot arithmetic (§5.ag), the round-robin money
  (§5.ae), or F-013's remaining half. You may recommend **cutting or hiding** any of them on UX
  grounds — that's the point — but don't reopen the math.
- Before trusting a green money test, re-introduce the bug it claims to catch and watch it fail
  (`DECISIONS.md` §5.z — one mutation survived 164 passing tests last session).
