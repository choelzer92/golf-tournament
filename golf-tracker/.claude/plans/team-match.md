# Team → Match → side games (F-037 reframed, §5.cn): DESIGN NOTE, not approved

Supersedes the pot/entry slices of `f037-opt-b.md`. Its S0 goldens and its per-foursome
compute (S1 "run compute once per foursome, merge") still hold.

## The model

| Layer | What it is | Decided |
|---|---|---|
| **Team** | a set of players; their match results roll up to one total that settles the pot | §5.cn |
| **Match** | a head-to-head on the course; **match size** (1v1 / 2v2 / 4v4) decides how many | §5.cn |
| **Counting** | how a match feeds the team: **match points 1 / ½ / 0 (default)**, holes won (margin), net strokes | §5.cn |
| **Strokes** | off the low player **in each match** | §5.cn (GHIN side-by-side before build, §5.ce) |
| **Junk** | earned in the match, tallied by team | §5.cn |
| **Side games** | optional bets inside a match (e.g. a Nassau between the two pairs), their own money | §5.cn |

Today's games are special cases, so nothing existing changes meaning:
- **Classic pool:** match size = team size (team v team, field-wide).
- **"Four pairs":** 4 teams of 2 with no matches, field-wide.

## How it plays out

| Players | Teams | Size 1 | Size 2 | Size 4 |
|---|---|---|---|---|
| 8 | 2 × 4 | 4 singles | 2 matches (F-037) | classic pool |
| 12 | 3 × 4 | 6 singles, rotation | 3 matches: A v B, B v C, C v A | 3-way pool |
| 16 | 2 × 8 | 8 singles | 4 matches | 2 matches, foursome v foursome |
| 16 | 4 × 4 | 8 singles | 4 matches; each team meets 2 of the 3 others | 4-way pool |

## Why it matters beyond F-037

S2 found that a tournament round is one pool game per matchup (`spine-s2.md`). So:
- a **match is a pool game** (the engine we have, scored per foursome);
- a **team total sums its matches** (new: the match → team roll-up);
- an **event sums rounds** (Series, bar #11).

Building the roll-up here is most of what the multi-day trip needs, and argues against S3.

## Open questions for Craig (ask outright, §5.bo)

1. **Counts that don't rotate fairly** (16 as 4 × 4): **A suggest pairings, organizer swaps (rec.)**
   / B refuse, offer the field-wide pool / C rotate across rounds only (multi-day).
2. **A tie in team points** (2–2): **A push, the pot splits (rec.)** / B tiebreak on holes won /
   C tiebreak on total net.
3. **Money from team points:** **A winner team takes the pot, each player paid evenly (rec.)** / B $ per
   point of margin / C both (pot + per point).
4. **Nassau inside a match** (front / back / overall as three points, the way the pool's legs work):
   **A one point per match (rec., default)** / B three points per match as a setting.
5. **Where it's asked:** the Compete step asks "teams" (as today), then shows **"Head-to-head
   matches? Size: 1 v 1 / 2 v 2"** only when there are 2+ teams and the size divides each
   team. Off = today's game. Its default is off, so "just the usual game" is unchanged.
6. **Who meets whom inside a foursome:** the tee sheet decides (a foursome holds one match of 2v2,
   or two 1v1s). **A the app builds tee groups from the matches (rec.)** / B the organizer builds
   tee groups and the matches are read from them.

## Slices once approved (goldens first, §5.z)

- **T0:** goldens that pin today's 8-player "Four pairs" and classic numbers (`f037-opt-b.md` S0).
- **T1:** pure `matchesOf(game)` + per-match compute, plus a match → team roll-up with match points,
  holes won and net strokes. Tests: zero-sum per match and per team; each match equals a
  standalone 2v2; one foursome can't move another's money.
- **T2:** stored as optional `modeSettings.matchSize` / `matchCounting`. Absent = today, so no
  migration. Leaderboard: team totals on top, one block per match. Scorecard: your match only.
- **T3:** wizard + hub entry (Q5), sandbox seeds, e2e tagged F-037 on both `isModeEngineGame`
  branches, then a screenshot walk.
- **T4:** per-match strokes off the low, after the GHIN side-by-side.

## Status (2026-10-09)

- **Questions answered** (§5.co plus the money follow-up), so T0–T4 are approved.
- **T0:** `src/test/f037-pairings-golden.test.ts`, green on the old code.
- **T1:** `src/lib/game-modes/matches.ts`, with `matchesOf` and `computeMatchGame` hooked at the top of the team engine's
  `compute`. Goldens are in `src/test/f037-matches.test.ts` (25 cases). Five §5.z mutations were tried and each turned it
  red: unit leak, halves, tiebreak, per-hole sign, legs counting.
  - Matches are read from the tee sheet. A foursome holding two teams pairs in tee-sheet order; a one-team foursome
    pairs across groups (foursome v foursome, two teams only).
  - **A shape that can't be paired must not be possible** (Craig, 2026-10-09; §5.ac). `matchShapeProblem(game)` gives
    the organizer-worded reason. T3 must call it in every write path: wizard, hub team/tee-group swaps, match size,
    and a late player. The engine's field-wide fallback is only a backstop.
  - **OPEN for Craig at T3:** a player joining at the turn into a matches game (a 9th player in a 2v2), and how
    they fit a match.
  - The settings (`MATCH_SETTINGS`) are not in the team engine's schema yet, so no surface shows them. That's T3.
  - Carry-ties under $ per hole apply INSIDE each match (Craig, 2026-10-09), settled by the engine's own carry code.
  - Not covered yet: per-match strokes off the low (T4).
  - The result carries `matches: MatchLine[]` and team-level `teamLegs` ("X 2–0"), with no `sideBreakdown`. The
    scorecard's per-match rows are T2.
