# Next session: saved formats in the wizard's game picker (§5.av)

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md`, then **`DECISIONS.md` §5.av** (the decision this session builds), then
§5.au–§5.ax for the wizard context. That's the reading list.

**State:** `captains-deal-and-game-rename` (3 commits off `main` at `3ed5ec9`) has §5.ay and
§5.az BUILT and green, awaiting Craig's review/merge — check `git branch` before assuming
where you are. `npm run verify` is green on that branch (1487 unit tests, typecheck, build,
116 e2e) and starts its own sandbox, so there's no setup. If it's been merged, branch fresh
off `main` (§5.ab: never work on main directly).

## What just landed (don't redo it)

1. **§5.ay — the captains' deal.** `serpentineTeams` → `captainsDealTeams`
   (`src/lib/pool-game.ts`): best captain gets the worst remaining player each round, same
   direction every round, pool ranked with the captain comparator (rounded course handicap →
   harder tee → unrounded). "Snake draft" is now "Captains' deal" at both sites. Craig's
   4-captain/12-pool example and the tee-tiebreak case are pinned AND mutation-proved.
   The persisted `teamBuild.method` string stays `'serpentine'` — old games still render.
2. **§5.az — the copy sweep.** "New Pool Game" → "New Game" etc.; "Pool" survives only as
   the format name; `/pool/*` routes and internals untouched. Folded in two merge-audit
   items: "Field"/"Build Field" → "Players"/"Add Players", and the /pool + /home list cards
   use the new mode-aware `gameListSubtitle` (`game-modes/result.ts`) — no more "N foursomes"
   for a skins game (§5.al).

## The work, in order

1. **§5.av — saved formats as a CHOICE AT THE GAME STEP.** Still needed for a game NOT
   started from a group (the group path already lists its formats — §5.aw). The game picker
   is a native `<select>` (`app/pool/new/page.tsx`, "Which game are you playing?") and a
   format wants a summary line, so this is probably a real list above/replacing the select,
   not another `<option>`. `formatSummaryLine` (`game-modes/summary.ts`) already produces
   the line; an applied format must land on the §5.ax confirmation, not re-ask.
2. **Saving a forked format.** F-021 lets you rename an edited format ("based on Saturday
   Nassau") but nothing offers to SAVE it. §5.ax part 4 says the review step should. Small,
   and it closes the loop: play → save format → group lists it → two taps next week.
3. **§5.au — the reorder** (field first, money after teams), if Craig wants it this session.
   Much less urgent now: a confirmed format is ~10 controls whatever the order; it matters
   for the FIRST game of a new style. **Warning recorded while sizing it:**
   `applyGroupDefaults` is called from both step 1 and the field step, and a format carries
   `gameMode` + `modeSettings` + `sides` — moving the field earlier changes which lands
   first. Pin the group-load path before touching order (the §5.aw tests are that pin).

## Rules that keep earning their place

- **Look at the screen.** Eight defects across F-019/F-020/F-021 were invisible in code and
  obvious in a screenshot. The counting helper in `verify-fixes.spec.ts` is cheap: assert
  control/label counts, not just presence.
- **A capability with no fixture is indistinguishable from a missing one** (§5.aw). When
  something looks unbuilt, check whether it's un-seeded first.
- **Mutation-prove any claim a user acts on** (§5.z, §5.ar). This session it caught a
  tee-tiebreak test that passed by coincidence (agreed with insertion order) until the
  input order was flipped to make the mutation actually bite.
- **Watch each new test fail** against the code it guards; read the artifact before forming
  a theory.
- **Don't re-decide what's settled:** §5.an–§5.at, §5.au–§5.ax, and now §5.ay–§5.az.
- `npm run verify` must exit 0 before each commit. One focused commit per piece.

## Also open

- **§7 q4** — dark = live, light = setup. The last open question in the table; probably just
  needs confirming.
- **Individual games can't span tee times.** Verified working in compute (8-player skins
  settles zero-sum across two groups); blocked only by `playersMax: 4` and a side-game-only
  Groups step. Nobody has asked for it.
- **F-013's remainder** — the tournament still has its own copy of the team-score math.
- **Merge-audit polish list (2026-09-09), remaining:** leg results ("The Dawgs by 5") render
  in loss-red on the dark leaderboard, brushing §5.ak; "Sides / Match" is a category label
  among game names; "Who gets paid?" takes an unvalidated `70, 30` mini-DSL; three renderings
  of course handicap (CHcp / Course HCP: / combined HCP). The "Field" jargon and foursome
  list-card items are DONE (folded into §5.az).
