# Next session: the captains' deal, then the pool→game rename

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md`, then **`DECISIONS.md` §5.ay and §5.az** (the two decisions this session builds),
then §5.au–§5.ax for the wizard context. That's the reading list.

**State:** `ui-consistency-and-compute-tests` was MERGED to `main` and pushed 2026-09-09 (merge
commit `4dca1b6`, 95 commits) — the live app now has all of it, including HOME_V2 as the landing
page. **Work starts on a FRESH branch off `main`** (§5.ab: never work on main directly).
`npm run verify` is green (1482 unit tests, typecheck, build, 116 e2e) and starts its own sandbox,
so there's no setup.

## The work, in order

1. **§5.ay — the captains' draft becomes a complementary deal.** Craig's spec, recorded with his
   words in the decision entry: best captain gets the worst remaining player each round, same
   direction every round (NO serpentine reversal), so the worst captain lands the best non-captain
   in the final round. The draft pool must rank with the captain comparator — rounded course
   handicap, then harder tee (rating, yardage), then unrounded — not the rounding-blind `hcapOf`
   sort `serpentineTeams` (`src/lib/pool-game.ts:1105`) uses today. Rename the "Snake draft"
   button (both sites: wizard team step + game hub) since it's no longer a snake. Tests must pin
   the 4-captain/12-pool example (C1 gets P12/P8/P4; C4 gets P9/P5/P1) and the two-players-round-
   to-2-but-different-tees case. This changes team formation (not money), but watch the existing
   `serpentineTeams` tests — they pin the OLD behavior and will need rewriting to the new spec,
   which is expected, not a regression.
2. **§5.az — "pool" is a format name; the container is a "game".** Copy sweep only: "New Pool
   Game" → "New Game", home-screen "Casual game"/"money game" phrasing converges on "game".
   `/pool/*` routes and internal names (`PoolGame`, `pool-game.ts`) STAY — links in group chats
   must keep working.

## Where the wizard got to

Craig asked why setup isn't "a few questions — how many players, what game, what money". Measuring it
gave 14 questions / 18 controls on step 1 before anyone is in the field. Four decisions followed, and
**each one made the next smaller**:

| | Decision | Built? |
|---|---|---|
| §5.au | Reorder: field first, money after teams | **no** |
| §5.av | Saved formats belong AT the game step, not on a separate screen | **no** |
| §5.aw | A group LISTS the formats it plays; one tap to the usual | **yes** — fixture only |
| §5.ax | An applied format CONFIRMS instead of re-asking (F-021) | **yes** |

Weekend Warriors → Casual round → Saturday Nassau is now **two taps to a correctly configured game**,
landing on a 10-control confirmation instead of a 24-control form.

## What's actually left

1. **§5.av — saved formats in the wizard's own game picker.** Still needed for a game NOT started
   from a group. Note the picker is a native `<select>` and formats want a summary line, so this is
   probably a real list, not another `<option>`. `formatSummaryLine` (`game-modes/summary.ts`)
   already produces the line.

2. **§5.au — the reorder.** Still right, and now much less urgent: a confirmed format is ~10 controls
   whatever the order, and most rounds never expand them. It matters for the FIRST game of a new
   style, which still faces all 21. **Warning recorded while sizing it:** `applyGroupDefaults` is
   called from both step 1 and the field step, and a format carries `gameMode` + `modeSettings` +
   `sides` — moving the field earlier changes which lands first. Pin the group-load path before
   touching order (the §5.aw tests are that pin).

3. **Saving a forked format.** F-021 lets you rename an edited format, and the summary says "based on
   Saturday Nassau" — but nothing yet offers to SAVE it. §5.ax part 4 says the review step should.
   Small, and it closes the loop: play → save format → group lists it → two taps next week.

## Rules that keep earning their place

- **Look at the screen.** Eight defects across F-019/F-020/F-021 were invisible in code and obvious
  in a screenshot — including two in F-021 itself (a duplicated name input; sections that didn't
  close at all while the panel looked right). The counting helper in `verify-fixes.spec.ts` is
  cheap: assert control/label counts, not just presence.
- **A capability with no fixture is indistinguishable from a missing one** (§5.aw). The whole
  group→format→wizard path was built and unreachable because nothing seeded it. When something looks
  unbuilt, check whether it's un-seeded first.
- **Mutation-prove any claim a user acts on** (§5.z, §5.ar). The summary line's tests caught skins
  reporting "$1 a point" on their first run.
- **Watch each new test fail** against the code it guards. And when a test fails, read the artifact
  before forming a theory — I diagnosed one failure as an ordering bug when the page snapshot
  already showed the right value selected.
- **Don't re-decide what's settled:** §5.an (independent axes), §5.ao (uneven counts ask), §5.ap
  (mid-round prompt), §5.aq (reuse the logic, not the component), §5.as (fit vs the whole field),
  §5.at (a capability change dates old strings), §5.au–§5.ax above.
- `npm run verify` must exit 0 before each commit. One focused commit per piece.

## Also open

- **§7 q4** — dark = live, light = setup. The last open question in the table; probably just needs
  confirming.
- **Individual games can't span tee times.** Verified: an 8-player skins game already settles
  correctly across two groups (zero-sum, 630/−90×7), blocked only by `playersMax: 4` and a
  side-game-only Groups step. Same shape as the 1v1 gap Craig found. Nobody has asked for it.
- **F-013's remainder** — the tournament still has its own copy of the team-score math.
- **Merge-audit polish list (2026-09-09), none blocking:** "Field"/"Build Field" jargon in the
  wizard step names (fold into §5.az's sweep); `/pool` and `/home` list cards say "N foursomes"
  for side games (src/app/pool/page.tsx:129, src/app/home/page.tsx:54 — a §5.al violation);
  leg results ("The Dawgs by 5") render in loss-red on the dark leaderboard, brushing §5.ak;
  "Sides / Match" is a category label among game names; "Who gets paid?" takes an unvalidated
  `70, 30` mini-DSL; three renderings of course handicap (CHcp / Course HCP: / combined HCP).
