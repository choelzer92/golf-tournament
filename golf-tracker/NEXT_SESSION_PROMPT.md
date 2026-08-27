# Next session: no finding is queued — pick from the open list

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **F-019 and F-020 are both done**, so unlike the last few sessions there is
no designed-and-approved finding waiting. The job is to agree what's next with Craig before
building.

**State:** branch `ui-consistency-and-compute-tests`, 86 commits ahead of `main`, NOT merged, NOT
pushed. Merging is Craig's call; don't ask, don't push. `npm run verify` is green (1385 unit tests,
typecheck, build, 107 e2e) and starts its own sandbox, so there's no setup.

## What's open, roughly in the order I'd raise it

1. **§7 q5 — how much config belongs on the first screen.** The longest-standing open question,
   with numbers attached: an ordinary 2v2 is **6 mode controls on step 1 and 13 taps** end to end
   (`e2e/nsides-audit.spec.ts`). F-020 just added a misfit banner to that same screen, so it's a
   little busier than when the count was taken. Craig has never been asked to rule on the number.
   **Needs his decision, not a build.**

2. **§7 q4 — dark = live, light = setup.** Written up as deliberate; probably just needs confirming.

3. **F-013's remainder** — the tournament still carries its own copy of the team-score math. Real
   duplication, no user-visible symptom, nobody has complained. Safe, unglamorous, and the kind of
   thing that bites during a later change.

4. **Editing a side game's tee sheet from the hub.** F-019 left this out by design: a side game's
   playing groups can only be changed in the wizard or via the oversized-group prompt, whereas a
   pool has `EditFoursomes`. Noting it so the gap stays a decision rather than a surprise.

5. **Offline / PWA resilience** — §6 item 4 on Craig's own list, untouched. `sw.js` exists with no
   offline caching, which is a real gap for a "continuing"-focused product on cart-path wifi.

## Rules that keep earning their place

- **Pin before you change money**, and **mutation-prove every pin** (§5.z). Across the last two
  sessions five mutations survived first drafts. Every one was the same shape: **a field that only
  varies under a setting no test set** (a pot read by one mode in one money model; a stroke
  threshold masked by best-ball; a defensive clear whose rows no reader reaches).
- **Look at the screen.** Six defects across these two findings were invisible in the code and
  obvious in a screenshot — including two where every assertion passed and the label was simply
  false (§5.ar, §5.at). `/sandbox` seeds state in one click; `npx playwright test` writes to
  `e2e/screenshots/`.
- **Watch each new test fail** against the code it guards before trusting it. One test written
  specifically to catch a surviving mutation didn't, and reading the call sites explained why.
- **Read the call sites before believing a design's sizing.** F-019's approved design was wrong
  three ways about where the work was — verify, don't inherit.
- **`.next` can corrupt.** A truncated `.next/dev/types/routes.d.ts` produced a hard 404 on
  `/pool/new` that looked exactly like a broken component. `rm -rf .next` and restart before
  debugging a route that vanished.
- **Don't re-decide what's settled:** independent axes (§5.an), auto-balance + "uneven counts ask"
  (§5.ao), the mid-round prompt (§5.ap), reuse-the-logic (§5.aq), fit measured against the whole
  field (§5.as), pot arithmetic (§5.ag), round-robin money (§5.ae), pairwise ties (§5.aj).
- `npm run verify` must exit 0 before each commit. One focused commit per piece.

## A note on the branch

86 commits, none of it merged, all of it behind a green gate. At some point the size of the branch
is its own risk — worth asking Craig whether he wants to review and merge before more lands on top,
since §5.ab makes the timing his call based on who's mid-round.
