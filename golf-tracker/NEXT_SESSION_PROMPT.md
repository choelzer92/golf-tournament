# Next session: F-020, the player count should recommend games

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md`, then **`FINDINGS.md` F-020** (the design, with options and the recommendation)
and **`DECISIONS.md` §5.ao** (Craig's decision and why). That's the reading list.

**State:** branch `ui-consistency-and-compute-tests`, 82 commits ahead of `main`, NOT merged, NOT
pushed. Merging is Craig's call; don't ask, don't push. `npm run verify` is green (1371 unit tests,
typecheck, build, 99 e2e) and starts its own sandbox, so there's no setup.

## F-019 is done — what that leaves you

Built and verified 2026-08-26 (7 commits). The status table in F-020's finding is unchanged, but
two things from F-019 matter to you:

- **`groupShapesFor(N)` already exists**, in `pool-game.ts` next to `defaultSubTeams`, with 28
  unit tests (`group-shapes.test.ts`). It answers "what shapes fit N players?" for both axes:
  `TEE_GROUP_SHAPE_OPTS` for tee groups, `SIDE_SHAPE_OPTS` for sides. F-020's option C — proposing
  splits at the split step — is meant to use it. **Don't write a second one.**
- **`dealBalancedIntoShape(sortedIds, shape)`** deals a handicap-sorted field into a shape as a
  snake, so the groups come out even. Also already tested.

So the shared groundwork §5.ao called for is in place, and F-020 is now the two UI pieces.

## The job

Craig chose **option D**, built as two independently shippable pieces:

1. **Annotate the picker with live fit (option B).** Today `playersMin`/`playersMax` are used
   **only to refuse**, and only at the review step, five steps after the game was picked: "Wolf is
   played in a single group of 4–4 players — you have 5. Go back to Field." Once the field exists,
   each game should show its fit, with unfittable games disabled and explained.
2. **Propose splits at the split step (option C).** `defaultSubTeams` special-cases exactly four
   and otherwise alternates low/high, so 5 players silently become 3 v 2. Offer the shapes from
   `groupShapesFor(n, SIDE_SHAPE_OPTS)` and let the group choose.

Explicitly **not** reordering the wizard (option A) — `WIZARD_REDESIGN.md` §8 warns the 44-game
sample is one organizer's habits, not evidence about everyone.

Note `playersMin`/`playersMax` are documented **"per group"** (`game-modes/types.ts:34`). F-019
made that literal: a side game can have several groups now, so "you have 5" may mean five in one
group or 3 + 2 across two. Worth deciding what fit means for a multi-group side game before
annotating anything — **that's the call I'd expect to need Craig.**

## Rules that earned their place this session

- **Pin before you change money**, and **mutation-prove every pin** (§5.z). Two mutations survived
  the first draft of `one-group-golden.test.ts`: a pot hard-coded to a foursome (only one mode reads
  `ctx.pot`, and only in one money model no case set) and a stroke threshold hard-coded to 18 (every
  nine-hole case played best-ball, which masks the high handicapper's strokes). Both are the same
  shape: **a field that only varies under a setting no test set.**
- **Look at the screen.** Four defects this session were invisible in the code and obvious in a
  screenshot — including one where every test passed and the thing labelled "balanced by handicap"
  was 8 strokes out (§5.ar). `/sandbox` seeds state in one click; `npx playwright test` writes to
  `e2e/screenshots/`.
- **Read the call sites before believing a design's sizing.** F-019's design said the engine was
  the only non-UI work and the sheets were "most of the work". Both were backwards: the sheets
  needed nothing, and two more one-group assumptions lived outside the engine. Verify the sizing;
  don't inherit it.
- **Watch each new test fail against the code it guards** before trusting it. One test written
  specifically to catch a surviving mutation didn't — and reading the call sites explained why.
- **Don't re-decide what's settled:** the two axes are independent (§5.an), auto-balance + manual
  override and "uneven counts ask" (§5.ao), the mid-round prompt (§5.ap), reuse-the-logic (§5.aq),
  pot arithmetic (§5.ag), round-robin money (§5.ae), pairwise ties (§5.aj), contested holes (§5.ai).
- `npm run verify` must exit 0 before each commit. One focused commit per piece.

## Also open, further out

- **§7 q5** — how much config belongs on the first screen. An ordinary 2v2 is **6 mode controls and
  13 taps** end to end; Craig hasn't ruled on whether that's right. F-020's option B touches this
  screen, so the two are related — worth raising while you're there.
- **§7 q4** — dark = live, light = setup. Probably just needs confirming.
- **F-013's remainder** — the tournament still has its own copy of the team-score math.
- **A thing F-019 left undone by design:** a side game's playing groups can only be changed from
  the wizard or via the oversized-group prompt. There's no "edit the tee sheet" on the hub for a
  side game the way `EditFoursomes` serves a pool. Nobody has asked for it; noting it so the gap is
  a decision rather than a surprise.
