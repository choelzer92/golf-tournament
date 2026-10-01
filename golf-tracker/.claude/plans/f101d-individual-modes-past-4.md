# F-101 d: individual modes past 4, across tee groups (§5.bw item 5)

**Status: BUILT 2026-09-29 (1f432e8). Follow-on §5.cc (live skins view, 3f9c591). Left: F-101 e (scale polish at 144), F-103 b/c.**

Craig's decision (§5.bw 5): skins, Stableford, low total and quota take a whole field across tee
groups, the way `team-2v2` does. Wolf and Nines keep their caps. Scale target: 32 and 144 (§5.bw 8).

## What already works (no change)

- `buildGameModeContext(game, scores)` with no matchupId merges every tee group (F-019).
  `computeGameResult` already computes on the whole field.
- `IndividualLeaderboard` fetches and subscribes to every matchup.
- Printed scorecards: one card per group already.
- Router `routeContainer` solo branch has no cap. `playerRangeText` prints "2 or more".
- The hub's `switchTargets` filters by min/max, so Wolf and Nines stay off a big game.
- Stableford, low total and quota money are per player (vs field average, or the pot), so they scale as-is.

## Build (mechanical, no money change)

1. `playersMax: Number.POSITIVE_INFINITY` on skins, stableford-ind, low-total, quota, with the §5.bv comment.
2. Wizard (`pool/new/page.tsx:835-861`): a solo game past 4 goes through `PlayingGroupsStep`, like a
   team game, instead of `singleGroup()`. The same applies to the all-singles team path. Four or fewer players still get one group.
   Structure-step copy "needs 2–4 players" is keyed on the modes that fit, and the F-041 "as teams" hint
   stops showing for solo past 4.
3. Hub: `isSingleGroup` hides the group tools for an individual game. Show the tee-group tools (move a
   player between groups) when there are several groups. Balance, captains and swap stay hidden, since they mean teams. Extend
   `OversizedGroupPrompt` to individual games.
4. Hub heading: "Players" for one group; "Tee groups" when there are more.
5. Play card: it keeps showing its own group. Add the line "N more players in other groups: see
   Standings", like §5.bv's hidden-teams row.
6. Sandbox seeds: skins at 32 across 8 groups staggered; Stableford at 144 (36 groups).

## Money/scoring questions (Craig's call, ask before building)

- **Q1: Skins money at a big field.** Per-skin makes every other player pay each skin: a $5 skin is $155
  at 32 and $715 at 144. The usual club skins game is a pot: everyone antes, and the pot splits by skins won.
- **Q2: When a skin is decided across staggered groups.** Today a hole is decided as soon as anyone posts it,
  so group 1 "wins" skins that later groups can take back, and the carry chain shifts.
  Proposed: a hole is decided once every tee group has posted it. A closed game decides on whatever was posted.
  With one group this is today's rule exactly, so goldens are unchanged. Until then the board shows the live leader, like F-101 c.
- **Q3: Per-point junk** has the same N−1 growth: a $2 birdie collects $62 at 32.

## Goldens first

- `one-group-golden.test.ts`: extend the foursome splice to `individual`, so the old
  "4 players (playersMax)" keys re-key as "(foursome)" with identical content, then add 8 and 32. That is the §5.bv pattern.
- New `individual-field.test.ts`, shaped like `team-field-32.test.ts`, at 32 and 144:
  - every entry is present
  - 7 groups ≠ 8 groups
  - zero-sum for every money model and junk payout
  - money moves
  - a mid-round staggered case is zero-sum
  - Q2's rule is pinned
- Expected to change by design: `fit.test.ts:41` (skins at 8 fits); e2e collapse-routing:43/48 and
  verify-f020-picker:58 (solo is no longer "2–4"). Wolf and Nines at 8 stay too-many.

## Out of scope, logged

- CTP across groups: one winner per hole per game. Scorers in two groups could overwrite each other (a new finding).
- Scale (F-101 e): linear `scoreAt`, and rendering at 144.
