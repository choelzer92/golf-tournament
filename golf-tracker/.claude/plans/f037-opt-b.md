# F-037 option B: separate 2v2 matches inside one game (plan only, not built)

Sources: FINDINGS.md:496 (F-037), DECISIONS_ARCHIVE.md:2303 (§5.ci 4: "a within-tee-group setting,
where each pair plays the other pair in its own foursome (the classic Saturday) ... goldens-first
(§5.z), plan shown before the build"). Related: §5.ae pairwise, §5.ag pot per side, §5.an groups and
sides are independent axes, §5.br winner-takes legs, §5.ac prevent impossible data.

## 1. What happens today (verified in code)

8 players, "Four pairs" (`game-structure.ts:167-168`). Default tee sheet packs whole pairs first-fit,
so pairs a+b form Group 1 and c+d form Group 2 (`proposeTeeGroups` :293, `packTeamsIntoShape` :323).
Not aligned, so `routeContainer` (:489-515) sends it to the sides engine: `team-2v2` with 4 `sides`
(`persistedSides`, sides.ts:158).
**The engine treats it as one 4-way competition across both foursomes.** `compute()`
(team-game.ts:249) reads every side in `ctx.sides` (`sidesForCompute`, context.ts:15). A hole only
counts as contested once all 4 sides post it (:405-407). Money settles across all 4 (:569-782): `legs`
winner-takes by default (:111-119, §5.br) so one pair collects from 3; `per-point` a pay-each round
robin (sides.ts:363); one pot of 4 antes; junk `own×(N−1)−Σothers` across all 4.
There is no "who plays whom" axis. `ctx.teeGroups` exists (context.ts:136-140, types.ts:96), but only
skins reads it (skins.ts:62). The scorecard shows all 4 side rows ranked 1st–4th (play/page.tsx:1425-1436).
The leaderboard shows one legs block (leaderboard/page.tsx:1154-1179). Sandbox seed `pairs-pot-slices`
(sandbox/page.sandbox.tsx:430) is exactly this shape.

## 2. Design

**Setting**: one new `FormatSetting` in team-game.ts `SETTINGS` (:32), next to `moneyModel`:
`{ key: 'pairing', label: 'Who plays whom', type: 'select', defaultValue: 'field', options:
[{ 'field', 'Every team plays every team' }, { 'tee-group', 'Each foursome is its own match' }] }`.
`showIf` can only key off other settings (formats.ts:147), so the visibility rule is **structural**,
like `MULTI_TEAM_ONLY_KEYS` (:30). Add a pure `pairingPartitions(sides, teeGroups)` to sides.ts. It
returns the per-group side lists only when there are ≥2 tee groups, every side sits wholly inside one
group, and every group holds ≥2 sides; otherwise it returns null. The setting is hidden when this
returns null, and so are `legsPayout` and `pointsPayout` when every match has <3 sides. One shared
helper replaces the three copies of `sidesOfGame(game).length < 3`:
create-step.tsx:376-378, settings-editor.tsx:221-223, money-panels.tsx:20-23.

**Settlement**: `compute()` picks the partition branch only when `pairing === 'tee-group'` and
partitions are non-null. In that branch it runs today's compute once per group on a sub-context:
`sides` narrowed to the group, `teeGroups` dropped, and `players` kept whole so F-039 naming stays
game-wide. The results are then merged:
`standings`/`sideBreakdown` concatenated with `place` within the match; `moneyNet` per side (so
stats-ledger, recap, settle-up don't change); `pot` = sum of match pots; `junkLines` concatenated; new
optional `matches: { groupIndex, label, sideIds, teamLegs, potSlices? }[]` on `IndividualResult`
(types.ts:171), computed only, never stored.

Each match is literally a two-side game, so every existing rule applies inside it: F-016 contested
holes, F-016b voided short legs, §5.aj ties, carry ties. A finished foursome settles its match even
while the other group is on the front nine. That is a "continuing" win.

**Invariants** (unit tests): (i) zero-sum per match, not just field-wide; (ii) locality: changing
Group 2's scores leaves Group 1's money byte-identical; (iii) equivalence oracle (§5.z): match 1's
money equals a standalone 4-player 2v2 of the same players and cards; (iv) absent/`'field'` gives
today's output byte-identical; (v) n-side-golden and two-side-golden snapshots don't move.

**Leaderboard, both axes**: the `isModeEngineGame` branch (result.ts:50; leaderboard/page.tsx:112 →
`IndividualLeaderboard` :845) renders one block per `matches[]` entry when it is present ("Group 1 ·
Craig & Jym v Dave & Rick": that match's legs and money, then the next match). Otherwise it renders
today's block. On the classic axis, `computePoolResult` can't receive a pairs game (classic needs
aligned teams, game-structure.ts:509), and `pairing` lives only in the team-2v2 settings. A unit test
asserts that a classic game ignores a stray `modeSettings.pairing`, and an e2e checks that two teams
of 4 never show the setting.

**Scorecard**: `engineSideRows` (play/page.tsx:1427) keeps only the sides of this group's match. Its
`status` and place colour (:1851) come from within the match ("1st" of 2), and "N more teams" is
dropped.

**Close-out**: `incompleteLegsForCloseOut` (money-panels.tsx:239) takes the union of the matches'
legs. `voidedLegs` stays game-wide, but it only bites on a match whose leg is short (team-game.ts:544).

**Label**: `gameKindLabelFrom` (game-structure.ts:432) prints "2 matches · 2 v 2 · head-to-head"
(wording is Q7).

**Wizard (minimum exposed)**: there are no new steps. The setting renders generically in Create →
Stakes (create-step.tsx:369) and in the hub's settings editor. Discoverability (the actual F-037
complaint) per Q1: a structure row "Two 2 v 2 matches" when the field is 8, 12, 16 and so on. It
uses shape 2+2+…, presets `pairing: 'tee-group'`, and routes exactly as "Four pairs".
`StructureShape` gets an optional in-memory `pairing` (it is never stored). The groups step and the
hub editors follow Q5 when a drag would break whole pairs.

## 3. Stored shapes: additive only

- `modeSettings.pairing?: 'field' | 'tee-group'` in the existing JSON settings bag. There is no
  column, no migration and no `PoolGame` type change. Sides already persist as N-side `sides`.
- **Read adapter**: `stringSetting` defaults absent to `'field'`, so every saved game reads as today.
  The partition branch also re-checks `pairingPartitions`, so a stale `'tee-group'` on a tee sheet
  that no longer qualifies falls back to the field (the §5.ac backstop).
- Saved formats and Run it back (§5.cm) copy `modeSettings`, so the choice carries for free.
- **Old client risk**: a tab on a pre-merge build ignores the key and shows field-wide money until it
  reloads. sw.js caches the shell only. This is acceptable because the branch ships whole.

## 4. Slices (one commit each, `npm run verify:quick` each, full `npm run verify` once at the end)

**S0 Goldens, pin today (no src change).** New file `src/test/f037-pairings-golden.test.ts`, using
the §5 example under `pairing` absent. It pins legs, per-point, pot, and mid-round legs. Run it
green on today's code.

**S1 Engine.** Add the setting, `pairingPartitions`, the partition branch and `IndividualResult.matches`.
Same file: the expected numbers below, plus invariants i–v. §5.z mutation proof: (a) drop the
partition (always run the field), (b) partition but settle on whole-field `place`, (c) leak Group 2's
scores into match 1. Each must turn the goldens red. No UI.

**S2 Surfaces.** Leaderboard match blocks, scorecard rows, close-out union, MoneySummary row, the
shared structural-hide helper, the label. Sandbox seeds `pairs-two-matches` (complete) and
`pairs-two-matches-midround`. Add the e2e cases below.

**S3 Wizard + hub.** Structure row per Q1, Stakes setting, groups-step and hub guard per Q5. Walk
every step on a phone viewport with screenshots (the walk-the-UI rule).

**S4 (only if Q4 = b).** Per-match off-the-low in `buildHcapMap` (pool-game.ts:781-811), so dots and
money agree. This needs its own goldens and a GHIN side-by-side first (§5.ba).

## 5. Worked example (fixture course: par 72, SI = hole, slope 113 so CH = index)

8 players, all index 0, best ball, net strokes, Compare by: Total. Legs $10 front, back and overall.
- Group 1 (m1): a = p1+p2, b = p3+p4. Group 2 (m2): c = p5+p6, d = p7+p8.
- Everyone pars, except: p1 birdies 1 and 2; p3 birdies 10; p5 birdies 3; p7 birdies 11, 12 and 13.
- Best ball to par (front / back / overall): a −2 / 0 / −2; b 0 / −1 / −1; c −1 / 0 / −1; d 0 / −3 / −3.

| case | today, field (S0 pins) | option B, tee-group (S1 expects) |
|---|---|---|
| legs, winner-takes | front a +30; back d +30; overall d +30 → **a +10, b −30, c −30, d +50** | M1: front a, back b, overall a → **a +10, b −10**; M2: front c, back d, overall d → **c −10, d +10** |
| per-point $1, pay-each | a +1, b −3, c −3, d +5 | a +1, b −1; c −2, d +2 |
| pot $20 per team, 100 overall | pot $80 to d: d +60, a/b/c −20 | per Q2 (a): $40 per match, a +20, b −20; d +20, c −20 |
| mid-round: G1 thru 18, G2 thru 9 (legs) | only 1–9 contested: front a, back void, overall (front only) a → **a +60, b/c/d −20** | M1 full: a +10, b −10; M2: front c, back none, overall (1–9) c → **c +20, d −20** |

Every row sums to 0, field-wide and per match. Places in option B: a 1st and b 2nd (M1); d 1st and
c 2nd (M2). Locality check: give p8 a 9 on hole 18, and a/b stay at ±10 under B. Under the field
setting they move.

## 6. e2e (sandbox, each asserts its screen via waitForURL or a screen-only element)

- `test('F-037: seeded two-match game shows one block per foursome with the hand-worked money')`:
  "Group 1"/"Group 2" blocks, a +$10 / b −$10 / c −$10 / d +$10, no "With 3+ teams" row.
- `test('F-037: Group 1 scorecard shows only its two teams, ranked within the match')`.
- `test('F-037: a finished foursome is paid while the other is on the front nine')` (midround seed).
- `test('F-037: eight players pick "Two 2 v 2 matches" and Create makes two matches')`: the full
  wizard flow, hub label "2 matches", and the leaderboard blocks.
- `test('F-037: hub switch from every-team to foursome matches moves the money')`.
- `test('F-037: no "Who plays whom" for one foursome, two teams of 4, or a split pair')`: the
  negative controls, both axes.

## 7. Questions for Craig (ask outright, one at a time, before S1)

- **Q1. How does a golfer ask for it?** (a) new structure row "Two 2 v 2 matches" at 8/12/16; "Four
  pairs" stays every-team-plays-every-team; (b) "Four pairs" defaults to matches whenever the tee sheet
  allows; (c) Stakes setting only, default field. **Rec (a):** names what Craig asked for; saved games untouched.
- **Q2. Pot under matches.** (a) each match its own pot (each pair antes, match winner takes it);
  (b) one field pot whatever the pairing; (c) hide pot for matches. **Rec (a):** pairing applies to every money model alike.
- **Q3. Junk and CTP.** (a) settle inside the match; CTP stays one winner per par 3 field-wide, counted
  in the winner's match; (b) junk stays field-wide; (c) per-match CTP (changes `ctpWinners`' shape). **Rec (a)**, (c) later if wanted.
- **Q4. Off-the-low in a match.** (a) off the field's low, as today; (b) off the low in each match
  (match-play convention; likely what GHIN does per match). Per-hole strokes aren't shift-invariant,
  so (b) moves dots = handicap math. **Rec (b) as S4**, only after a GHIN side-by-side. Under `full` nothing changes either way.
- **Q5. Tee sheet stops holding two whole teams per foursome** (groups-step drag, late player,
  mid-round edit). (a) block the move with a reason while matches are on; (b) allow it, game becomes
  every-team-plays-every-team with a board note; (c) allow it, the unmatched team sits out.
  **Rec (a) in editors + (b) as engine backstop** (§5.ac; mid-round money mustn't change quietly).
- **Q6. Leaderboard.** (a) per-match blocks only; (b) blocks plus a 1st–4th field table (no money). **Rec (a).**
- **Q7. Label.** (a) "2 matches · 2 v 2 · head-to-head"; (b) "4 pairs · head-to-head · 2 matches". **Rec (a).**
