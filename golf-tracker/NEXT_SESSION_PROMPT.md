# Next session: playing groups for a side game

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md`, then **`FINDINGS.md` F-019** (the design) and **`DECISIONS.md` §5.an** (the
decision and why). That's the whole reading list — F-019 has the file references you need.

**State:** branch `ui-consistency-and-compute-tests`, 73 commits ahead of `main`, NOT merged, NOT
pushed. Merging is my call; don't ask, don't push. `npm run verify` is green (1296 unit tests,
typecheck, build, 83 e2e) and starts its own sandbox, so there's no setup.

## The job

A side game currently forces every player into ONE playing group. Give it real ones — own tee
time, own scorecard, 3 or 4 players — chosen **separately** from the sides, because a partner may
be in the other foursome.

```
TEE TIMES (logistics)          SIDES (money)
  8:10  Craig, Dave, Sam         The Hogs   Craig & Jym
  8:20  Jym, Rick, Tony          The Dawgs  Dave & Rick
                                 The Cats   Sam & Tony
```

Today an 8-player side game claims "1 foursome" containing eight players, prints one scorecard for
all of them, offers a single tee time for two groups, and its Teams sheet lists everyone sorted by
**handicap** — which looks like a pairing and isn't one.

## Where the work actually is

Don't take my word for the sizing — verify it — but the last session's read was:

- **The engine change is 12 lines**, in `buildGameModeContext` (`context.ts:25–32`): it takes
  `game.teams[0].matchupId` and filters `ctx.players` to that one team. Everything downstream
  already works on whatever player set it's handed. Two callers (`result.ts:23`,
  `pool/[id]/page.tsx:2724`).
- **Storage needs nothing new.** `PoolTeam` already carries `teeTime`, `matchupId`, `captainId`. A
  side game today has exactly one, so existing games keep their shape — the same "absent means
  today's behaviour" pattern as `voidedLegs` and `sides`.
- **Most of the work is UI:** a group-assignment step in the wizard (the classic pool's `TeamsStep`
  already asks exactly this — reuse it, don't rebuild), then the Teams sheet and Scorecards page
  rendering groups + tee times with the sides as their own block.
- **`isSingleGroupGame()` is NOT the risk.** I said it was and was wrong; §5.an records why. The
  side leaderboard already fetches every matchup, and those branches are about the money model.

Support **3-player groups**, and a guest who's in a group but on nobody's side.

## Rules

- **Pin before you change money.** `n-side-golden.test.ts` is the pattern: label cases
  `MUST NOT MOVE` vs `SHOULD MOVE` so a deliberate change is distinguishable from a regression.
  Every existing side game has one group and must settle **byte-identically**.
- **Mutation-prove any money test before trusting it** (`DECISIONS.md` §5.z). Last session a
  hard-coded ball count survived all 54 pins on the first draft.
- **Look at the screen.** `/sandbox` seeds state in one click; `npx playwright test` writes to
  `e2e/screenshots/`. Four defects last session were invisible in the code and obvious in a
  screenshot — including this one. **Add an 8-player, 2-group, 4-side seed early**, because
  nothing in the fixtures currently exercises the case being built.
- Ask before anything with more than one defensible answer. **Two things I'd expect to need a
  call:** whether an existing 1-group side game should be silently re-split when a 5th player is
  added, and whether groups should auto-form (balanced, like the pool) or always be manual.
- **Don't re-decide what's settled:** the two axes are independent (§5.an), the pot arithmetic
  (§5.ag), round-robin money (§5.ae), pairwise ties (§5.aj), contested-hole legs (§5.ai).
- `npm run verify` must exit 0 before each commit. One focused commit per piece.

## Also open, if there's time after

- **§7 q5** — how much config belongs on the first screen. Now has numbers: an ordinary 2v2 is
  **6 mode controls and 13 taps** end to end. Craig hasn't ruled on whether that's right.
- **§7 q4** — dark = live, light = setup. Probably just needs confirming.
- **F-013's remainder** — the tournament still has its own copy of the team-score math.
