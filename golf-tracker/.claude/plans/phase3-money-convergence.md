# Phase 3 — money convergence: every money option on every split (APPROVED 2026-09-17)

**Status 2026-09-17:** APPROVED — Craig answered Q-A…Q-G outright (§5.bq). Every numbered example below is a golden to pin BEFORE building. Rules come from §5.bq (his answers);
the numbers below are MINE, derived from those rules plus what each engine does today. Nothing is
built. When he confirms (or corrects) a numbered example, it becomes a golden in
`src/test/phase3-*.test.ts` that FAILS on today's code (§5.z) before any engine change.

Goal (Craig): *"IT should be relatively easy to configure any type of game that users want, and
not confusing."* Concretely: the money step never greys an option for an engine reason.

## 0. Where the two engines stand (facts, from the 2026-09-17 code map)

| | classic pool (`pool-game.ts`) | team engine (`team-game.ts`) |
|---|---|---|
| teams | = tee groups, N teams | `sides[]`, any teams ≤ 8 players |
| pot | N teams · front/back/overall/junk slices · places paid · ties split the summed places | ONE prize by finishing order · per-side buy-in · ties split · no legs, no junk slice |
| fixed legs | 2 teams ONLY (`computeMatchPayouts` returns $0 otherwise) · $ per player · push = $0 | N sides · each leader collects `$ × teams behind`, non-leaders pay `$ × leaders` · voided leg = $0 |
| $/hole, $/point | — | N sides · round robin (pairwise margins) |
| junk units | POINTS per item (`junkValues`) × either a pot slice or `junkPerPoint` $ | **$ per item** (`junkBirdie` = dollars), per player, settled round robin |
| CTP | `ctpWinners` → team's junk points | not read |
| group hug | every member par-or-better → junk point | not read |
| hand-tracked bonuses | `customBonuses` + `bonusMarks` → junk points | not read |
| captains | `captainId`, balance-excluding-captains | `GameSide` has no captain; wizard balances pairs by combined hcap already |
| hide holes until all finish | ✓ | — |

The router (`game-structure.ts` `classicOnlyNeeds`) refuses CTP, manual bonuses, captains,
hide-holes and pot-by-legs whenever the shape needs the team engine, and refuses $/hole, $/point and
3+-team legs whenever the shape needs classic. Phase 3 = teach the TEAM engine the five classic
capabilities. Then no shape ever needs classic, and the refusals go. Classic stays untouched for the
Warriors' saved games (no migration, §5.bm: routing layer, not storage).

## 1. Bonuses are junk on every engine (§5.bq Q1 — Craig: "exactly the same")

**Rule:** CTP, group hug and hand-tracked bonuses add to a team's junk total exactly like a birdie.
The money settings then settle junk however the game already settles it.

**One junk vocabulary.** Today classic counts POINTS and the team engine counts DOLLARS. Proposal:
points everywhere, with a `$ per junk point` next to them. Every existing team game has
`junkBirdie: 1, junkEagle: 2, junkAlbatross: 5` dollars — read as points at `$1/pt` and its payouts
do not move (that is the golden). New team-engine settings: `junkCtp` (default 1 pt), `junkGroupHug`
(default 1), `junkPerPoint` ($, default 1), plus the hand-tracked bonus list the classic wizard has.

**Two ways to pay junk points (Craig, 2026-09-17):** *"the Warriors … whichever foursome has the
most junk points receives the junk pot. Another group … each junk point is worth 5 dollars."* Both
exist in classic today, but welded to the money mode (pot → junk slice; match → `junkPerPoint`).
Proposal: a `junkPayout` setting of its own, on every engine —
- **Junk pot** — a fixed junk amount (a pot slice, or a stated $) goes to the team with the most
  points; ties split it; all-zero = split.
- **$ per point** — every point is worth $X; teams settle the differential (2 teams) / round robin
  (3+ teams, as the team engine does today).
Default follows the money model (pot → junk pot; legs / $/hole / $/point → $ per point) and can be
overridden. Group-hug, CTP and hand-tracked bonuses are just more points either way.

**Example 1 (team engine, 4 pairs, junk on, $ per point at $1, round robin as today):**
Pair A: 2 birdies + CTP on 7 = 3 pts · B: 1 birdie = 1 · C: 0 · D: eagle = 2 → total 6.
Each pair: `earned × 3 − (6 − earned)` → **A +6, B −2, C −6, D +2** (sums to 0).
Today's engine gives A +3 (ignores the CTP) — the test fails first, as it should.

**Example 2 (classic-shaped 2 teams of 4 that the wizard now routes to the team engine):** hand-tracked
"Sandy" worth 2 pts, marked for a Team A player on hole 4; nothing else. Junk total A=2, B=0 →
**A +$2, B −$2** at $1/pt. Same as classic would pay with `junkPerPoint: 1`.

**Example 1b (same 4 pairs as Example 1, junk pot $20):** A has the most points (3) → **A +20, the
other three pay nothing extra** (the $20 came out of the buy-in, as the Warriors play it). If A and
D had tied on 3, each gets $10.

## 2. Three or more teams: how losers pay is a chosen setting (§5.bq Q2–Q4, corrected by §5.br)

**CORRECTION 2026-09-17 (§5.br, found by the step-3 goldens):** the first draft of this section said
today's `legs` pays A +20 / B 0 / C −20. It does not — it pays **A +20, B −10, C −10** (only the
leader collects; F-094). And `$ per hole` is IDENTICAL under both modes (an outright hole win already
collects from every other team, which is what a pairwise margin over holes-won sums to), so its only
new option is carry-ties. What stands:

**Settings** (team engine, matter only with 3+ teams, hidden otherwise):
- `legsPayout` — **Winner take all** (default, §5.br: "$10 per leg" never costs more than $10) |
  Pay each team you lost to.
- `pointsPayout` — **Pay each team you lost to** (default, §5.ae — today's round robin) | Winner take all.
- `carryover` — Carry ties to the next hole (`$ per hole`, default OFF so no saved game moves;
  a carry left after the last hole is dead, Q-G).

### Fixed legs — front $10, 3 teams

| case | Winner take all (default) | Pay each team you lost to |
|---|---|---|
| A beat B beat C | **A +20, B −10, C −10** (today) | A +20, B 0, C −20 |
| A = B tie, C third | **A +5, B +5, C −10** (Q-C / §5.br — moves the F-017 pins) | A +10, B +10, C −20 (§5.aj) |
| A first, B = C | A +20, B −10, C −10 | A +20, B −10, C −10 |
| all tied | nobody pays | nobody pays |

### $/hole — $2 per hole, 3 teams

Outright low team on a hole collects $2 from each other team; a tied hole pays nothing (both
modes — identical). With **carry ON** a tied hole's $2 rolls onto the next outright winner; a carry
left after 18 is dead. Example: hole 1 A outright, hole 2 tied, hole 3 B outright → carry OFF: A +4,
B −2, C −2 then B +4, A −2, C −2; carry ON: hole 3 pays B $4 from each → B +8, A −4, C −4.

### $/point — $1 per point, score to par A E, B +6, C +10

- Pay each team you lost to (default, today): A +16, **B −2** (−6 vs A, +4 vs C), C −14.
- Winner take all: the leader collects its margin from each team → A +16, B −6, C −10.
- Winner take all, A = B tie, C +4: C pays once, split → A +2, B +2, C −4.

### Classic multi-foursome game on $/hole or $/point (Q4)

Same code: the wizard already routes an aligned 2-teams-of-4 with margin money to the team engine.
With steps 1–2 landed nothing classic-only forces the classic engine for bonuses; captains and
hide-holes (§4) are the last two.

## 3. Pot by legs for 3+ teams that don't share foursomes (the one `not expressible` row)

**Rule:** the team engine's pot gains the classic's slices — front / back / overall / junk fractions
(`potSplit` today on classic) and places paid per slice — by calling the classic's `buildLeg` /
`distributePot` over sides instead of tee groups. Ties split the summed places (classic's rule, no
carry, no push). Junk slice ranks junk points (§1).

**Example 3 — 4 pairs, $20 per pair buy-in (pot $80), 25% each slice, winner takes each slice ($20):**
front A wins · back B and C tie · overall A wins · junk A 3 / B 1 / C 0 / D 2 →
A: front 20 + overall 20 + junk 20 − 20 = **+40** · B: back 10 − 20 = **−10** · C: 10 − 20 =
**−10** · D: 0 − 20 = **−20**. Sums to 0. Today the team engine's pot pays only finishing order.

**As built (2026-09-18) — judgement calls to surface to Craig, none of them a rule change:**
- The slices are SHARES (`potFront` / `potBack` / `potOverall` / `potJunk`), scaled to add up — so
  25/25/25/25, 1/1/1/1 and $20/$20/$20/$20 all mean the same. Nobody has to make percentages sum.
- Defaults 0 / 0 / 100: a bag without the keys is ONE prize on the overall — today's team pot, and
  the wizard writes nothing extra, so "just a pot" needs no touching. `potJunk` defaults 25 (a
  quarter against the overall's 100 → 4:1) and only exists when junk pays as a pot.
- Under a buy-in pot the junk pot IS the junk slice: `junkPot` is hidden and ignored there.
- Per-slice eligibility follows the classic pool's F-011 rule: once anyone has started a nine, only
  sides that have played it are in that slice; a slice nobody has started (or a voided leg) splits
  evenly so every ante comes back. Front/back rank each side's OWN to-par on that nine (§5.af), the
  overall ranks exactly as the standings do, junk ranks points (all-zero = tie = split, F-007).

## 4. Captains, hide-holes, one-ball scoring — capability, not money

- **Captains for pairs (Q5, agreed):** `GameSide` gains `captainId`; the teams step's captain
  toggle is offered for every split; `balanceExcludeCaptains` honored. The pair balancer already
  minimizes the spread of COMBINED handicap across pairs — Craig's stated goal — and is the routine
  the flight model will reuse (BACKLOG). No money change.
- **Hide holes until all finish:** team-engine leaderboard honors the flag (presentation).
- **Scramble / alternate shot with a team smaller than its foursome** stays refused — one score per
  GROUP is a scoring-entry constraint (§5.aa), not an engine gap. The reason text stays honest.

## 5. Build order (each step = goldens first, one commit, verify green)

1. ~~§1 junk vocabulary~~ **BUILT 2026-09-17** — `JUNK_SETTINGS` counts points (`junkBirdie` etc.), adds
   `junkPayout` (per-point | pot), `junkPerPoint`, `junkPot`; `tallyJunk` returns `points` + `dollars`;
   `settleJunkPot` shared by the individual and side settlements; wizard defaults `junkPayout` from the
   money model; leaderboard bonus board shows Pts (+ Earned under per-point) and names the pot.
   Goldens `src/test/phase3-junk-vocabulary.test.ts` (6, 5 failed first); e2e `phase3-junk.spec.ts`;
   sandbox seed "2v2 best ball — junk POT with birdies (Phase 3)". Every older golden unmoved.
2. ~~§1 CTP / group hug / hand-tracked bonuses~~ **BUILT 2026-09-17** — `junkCtp` (shared) and
   `junkGroupHug` (team only) settings, default 0; `tallyJunk` reads `ctx.ctpWinners` (par 3s) and
   `ctx.bonusMarks` × `customBonuses`; `countGroupHugs` per side; `settleJunkForSides` returns
   `{ lines, sides }` → `IndividualResult.junkSides`. Router: CTP + manual bonuses leave
   `classicOnlyNeeds`; `routedFields` maps the wizard's junk grid into the team engine's keys
   (`junkSettingsFromValues`). Wizard: the ONE bonus grid + hand-tracked buttons show for every team
   container (individual modes keep their settings editor — residue). `gameCountsCtp(game)` is the
   one CTP predicate (hub editor + scorer picker); F-090's classic-only gate is gone. Leaderboard
   board: CTP / Bonus columns + an "All par" line. Goldens `phase3-bonuses-as-junk.test.ts` (9, 8
   failed first); e2e in `phase3-junk.spec.ts` (wizard: two pairs + CTP → hub CTP editor); routing
   pins flipped in game-structure.test.ts, collapse-routing, f045.
3. ~~§2 payout settings~~ **BUILT 2026-09-17** — `legsPayout` (winner-takes default | pay-each),
   `pointsPayout` (pay-each default | winner-takes), `carryover` ($/hole, default off); `settleWinnerTakes`
   in sides.ts (tied leaders split each loser's payment); `payLeg` split into the two named modes;
   `holeWinner[]` recorded per hole for the carry walk. `MULTI_TEAM_ONLY_KEYS` hidden by the wizard,
   hub money panel and hub editor when the game has < 3 teams. F-017 tie pins RE-PINNED to §5.br
   (sides.test.ts, n-side-golden.test.ts + its snapshot: C −80 → −40). Goldens
   `phase3-multi-team-payout.test.ts` (15, 6 failed first); e2e `phase3-payout.spec.ts`.
4. ~~§3 pot slices on the team engine~~ **BUILT 2026-09-18** — `potFront` / `potBack` / `potOverall` /
   `potJunk` shares (scaled; defaults 0/0/100/25 = today's one-prize pot), `potSplit` relabelled
   "Places paid (%)" and applied per slice via the classic `distributePot`; `paySlice` in team-game.ts;
   `tallyJunkForSides` split out of `settleJunkForSides`, which takes `{ junkPotInBuyIn }` so the
   junk pot is the slice (and `junkPot` hides under `moneyModel: 'pot'`). `IndividualResult.potSlices`
   → `PotSliceBoard` on the leaderboard (only when sliced); junk footer names the slice. Router:
   `potLegs` deleted from the draft — a split pot never forces classic. Wizard: shares in the Stakes
   block, pot summary names the slices. Goldens `phase3-pot-slices.test.ts` (11, 6 failed first; three
   mutations caught 2/2/1); e2e `phase3-pot-slices.spec.ts`; sandbox seed "Four pairs — POT sliced …".
   New findings F-095 (legs listed twice under a sliced pot), F-096 (share rows dense in the wizard).
5. ~~§4 captains on sides; hide-holes on the team leaderboard~~ **BUILT 2026-09-18** — `GameSide.captainId`
   (a saved role; `toLegacySubTeams` refuses to fold a captained pair into the legacy shape); the
   teams step's captain for SHARED-foursome teams rides onto the side; the hub Teams list marks each
   captain "C"; a captain moved to another team in the hub editor drops the role. Teams that each fill
   their own tee group keep their captain on the foursome card as before. Hide-holes: the team
   leaderboard already applied `filterConcealedScores`; the hub editor now offers the toggle to a team
   game across 2+ foursomes (`HideHolesToggle`, one component for both containers). Goldens in
   `phase3-captains-hide.test.ts` (captain cases failed first; hide-holes pinned).
6. ~~Router~~ **BUILT 2026-09-18** — `classicOnlyNeeds`, `joinNeeds` and the three "Not built yet"
   reasons are deleted; `StructureDraft` lost `captains` / `hideHolesUntilAllFinish`. What the router
   still refuses is the golf (two-ball on a team of one, one-ball apart) or the team engine's 8-player
   cap — e.g. THREE TEAMS OF FOUR on head-to-head legs stays refused (classic holds two teams; the team
   engine tops out at 8). "Never greyed for an engine reason" therefore holds for fields of 8 or
   fewer; the 12-player margin-money case is the honest residue (BACKLOG). Pinned: unit table of eight
   shapes with every bonus on; e2e `phase3-convergence.spec.ts` (4+2+2 captains → hub; 2+2+1 all open).

## 6. Questions for Craig (yes/no each; numbers editable)

- ~~**Q-A**~~ CONFIRMED 2026-09-17 (yes). Junk in POINTS everywhere, paid either as a JUNK POT (most points wins, ties split) or as
  $ PER POINT — a `junkPayout` setting defaulting from the money model (Examples 1, 1b, 2)?
- ~~**Q-B**~~ CONFIRMED 2026-09-17 (yes). `multiTeamPayout` default = "Pay each team you lost to" (nothing saved moves)?
- ~~**Q-C**~~ CONFIRMED 2026-09-17: winners SPLIT (A +5, B +5, C −10). Winner-takes-from-everyone tie at the top: tied winners SPLIT the loser's payment
  (A +5, B +5, C −10), or the loser pays each (A +10, B +10, C −20)?
- ~~**Q-D**~~ CONFIRMED 2026-09-17 (yes). Pot keeps "places paid" as its only split control (100 = winner takes all) — no
  `multiTeamPayout` on pots?
- ~~**Q-E**~~ CONFIRMED 2026-09-17: one buy-in per pair split into slices; A +40, B −10, C −10, D −20.
- ~~**Q-F**~~ CONFIRMED 2026-09-17: outright low team only; plus a carry-ties toggle (skins rule).
- ~~**Q-G**~~ CONFIRMED 2026-09-17: a carry left after the last hole is dead.
