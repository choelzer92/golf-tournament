# Event spine S2: tournament rounds through `game-modes/` (investigation + plan)

Status: **INVESTIGATED 2026-10-05, nothing built.** S2 is approved (§5.ce, "investigate → plan → build;
any money/points disagreement goes to Craig before switching"). §6 holds the questions for Craig.
Design parent: `.claude/plans/event-spine.md` §3. Code was read only; the disagreements below come from
reading the code and still need confirming by the S2.0 harness.

**F-098 is already settled.** `src/lib/strokes.ts:16` `strokesOnHole` is the one allocator, and
live-scoring (`:181`, `:258`), money-games (`:117`) and the pool all call it. F-102 a (split-round
team strokes), g (round first, then off-the-low) and i (nine-hole tenth-rounding) are built too.
The stroke vs match play check (BACKLOG, §5.ce) is report-only and rides on the S2.0 property test.

## 1. Inventory: tournament scoring functions and their pool equivalents

Pool context = `buildGameModeContext` (`game-modes/context.ts:58`). `TS` = `game-modes/team-scoring.ts`.

| Tournament function | Computes / formats | Closest equivalent | Same numbers? |
|---|---|---|---|
| `getHoleDataForRound` `live-scoring.ts:50` | the round's holes; a nine is re-ranked 1–9 (`:55`); split re-ranks each nine (`:63`); uses the **default tee's** SI | `getGameHoles` `pool-game.ts:466` with `nineHandicapBasis:'9'` | Yes for a nine on the 9-hole basis. A tournament nine is ALWAYS the USGA basis, while the pool defaults to the 18 basis. A split round has no equivalent |
| `getPlayerEffectiveHcap` `:87` | CH × allowance; 9-hole rating or ½ CH; index basis | `getPoolPlayingHandicap` `pool-game.ts:589` | Yes, except **no tee / no rating → 0 strokes** (`:101`, `:122`, `:133`) where the pool and the ledger use the index (`pool-game.ts:623,645`). On a split round, the back nine's allowance comes from `splitFormat` (`:142`) |
| `getPlayingHandicap` `:162` | off-the-low, rounded first (F-102 g) | `buildHcapMap` `pool-game.ts:781` | Same rule, different **scope**: the tournament takes the low of the matchup (or of the 1v1 pair on a split back nine, `:752`), the pool the whole game's field. They agree if each matchup becomes its own game |
| `getPlayerStrokesOnHole` / `getPlayerStrokesForHole` `:176`/`:734` | strokes per player per hole | `ctx.strokesOnHole` `context.ts:97` | **No for mixed tees.** The tournament allocates on the default tee's SI, the pool on each player's OWN tee (`playerHoleStrokeIndexForGame`). The play page's tournament copy also uses the own tee (`game/play/page.tsx:687-690`), so the tournament's dots and its recorded result disagree today. Two live rounds have mixed tees |
| `getPlayerRawCourseHandicap` `:184` | the raw CH for the team formulas | `ctx.rawCourseHcap` `context.ts:125` | Yes, apart from the same no-rating fallback |
| `getTeamHandicapForFormat` `:222` | scramble: tiered, or **flat sum × % when allowance ≥ 0** (`:228`); alt-shot: 60/40 × allowance (`:245`) | `teamHandicapForFormat` `pool-game.ts:1648` | Tiered and alt-shot agree. The pool never passes a scramble % (`team-game.ts:293`, `pool-game.ts:1838`), so a tournament scramble with a custom % has no equivalent. The split back nine uses the FRONT's allowance (`:228`, `:245`) |
| `getTeamNetForHole` `:266` | scramble / alt-shot (first member with a score, `:277`), combined, two-best-balls (3 variants), best-ball (also `individual`) | `teamNetOnHole` `TS:99` | Yes when one score is entered. The pool takes the min (order-independent), the tournament the first member in list order |
| `bestBallTeamHoleScore` `:11` | the two-ball variants | `TS` two-best-net/gross and net-and-gross; the pool's legacy path calls this function itself | Yes |
| `netToStablefordPoints` `:332` + `getTeamStablefordForHole` `:342` | Stableford with a **selectable scale** (standard / modified / custom) | `teamStablefordOnHole` `TS:190` (**fixed standard scale**, `TS:65`); individual `stableford.ts:14` (has scales) | **No, two ways.** (a) **two-best-balls Stableford scores the SUM of two nets against ONE par** (`:367`), so nearly every hole is "double bogey" = 0. That is the bug TS:183 says the pool fixed. Allowed by `formats.ts` stableford `allowedTeamModes`; no live round uses it. (b) A modified/custom scale in team play can't be expressed in the pool |
| `computeLiveMatchStatus` `:372`, `computeHoleWinners` `:598`, `computeNassauStatus` `:452` | won / tied / thru per hole; front / back / overall | team-game `result:'match'` legs | Yes, once the hole values agree |
| `computeMatchPlayStatusText` `:420` | "2 UP", "3&2" | display only | n/a (pure display, keep) |
| `computeSplitMatchStatuses` `:503` + `getIndividualNetForHole` `:582` | front nine as a team; back-nine 1v1 pairings, each off its own pair's low | **none** | n/a |
| `recomputeMatchResult` `:628` | tournament POINTS: match play = points × holes won (`:664`); Stableford fixed or **margin-based** (`:698`); stroke play compares raw totals at **unequal thru** (`:720`) | the result values come from team-game; the points conversion is tournament-only | Final results agree once the hole values agree. Mid-round stroke play disagrees, because the pool ranks to par with thru (§5.af). The points layer stays in the tournament (next to `tournament-standings.ts`) |
| `computePlayerNetTotal` `:790`, `computePlayerStablefordPoints` `:763` | per-player totals (recap, bonuses) | `ctx.netOnHole` sums; `stableford.ts` | Yes, apart from the tee SI, the scale and the fallbacks |
| `computeJunkForMatchup` `tournament-state.ts:545` | gross birdie 1 / eagle 2 / albatross 3 + group hug 1; reads `course.selectedTeeId` (`:553`), not `defaultTeeId` | `computeJunk` `pool-game.ts:1938` | Probably, at those values. Confirm in the harness |
| `computeBonuses` `tournament-state.ts:609` (match-winner, junk, best-individual-net / -Stableford, nassau-*) | round bonuses → points | none (the event layer) | Stays in the tournament; it consumes the functions above |
| `getMoneyGamePlayingHandicap` `money-games.ts:91` | ledger: full CH × allowance, **never off-the-low, never the 9-hole basis** | `getPoolPlayingHandicap` | No on any nine or split round, see the next row |
| `computeTeamNassau` `:162`, `computeRoundBestNets` `:257`, `computeRoundPlayerDetails` `:608` | best ONE net of the WHOLE team in the round (across matchups), per leg; `numHoles = holes.length` (`:178,:272,:624`) | team-game, sides = the tournament teams spanning tee groups (§5.bw), best-ball, stroke, total, legs | **No on nine / split rounds.** An 18-hole CH is allocated against holes ranked 1–9 (≈ double strokes on a nine). On a split round with `numHoles` 18, every rank ≤ 9 gets a stroke, so a CH 10 player gets 18 strokes. **Live T0 (a money tournament with a split round) is affected.** Legs compare totals at unequal thru, while the pool settles on contested holes (§5.ai). Give-backs aren't listed (`:672`, F-098 "Left") |
| `computeSkins` `:338` | one field across all matchups; **carries across ROUNDS**; pot = ante × rounds; skin value = pot ÷ skins awarded (`:439`); decides a hole as soon as any score exists | `skins.ts` (skins pot, §5.ca) | No: the cross-round carry, and no wait for every tee group (§5.ca). It isn't zero-sum when 0 skins are awarded (everyone loses the ante) |
| `computeMoneyLedger` `:452` | Nassau pays EACH player ±leg (`:490-493`), plus skins | team-game money is per SIDE, then split per player (F-068) | No, the stake shape differs. Not zero-sum with unequal team sizes |
| `computeMoneyResult` `money-game.ts:34` | nassau-by-bonus + birdie / eagle differential | — | **Dead code, no callers.** Delete, don't migrate |

**Page-local copies (not reachable from vitest):** `game/play/page.tsx` re-implements scramble / alt-shot
(`:593`, `:613`, `:945`), off-the-low (`:639`), strokes (`:670`), and three team-Stableford functions
(`:1532/1542`, `:1995/2006`, `:2513`). So the Stableford copies number **six**: `live-scoring:332`,
`TS:67`, `stableford.ts:14` and the play page's three. **Display finding:** the `/tournament/new` USGA
label (`tournament/new/page.tsx:792`) says 3p 20/15/10 and 4p 20/15/10/5, but both engines use
30/20/10 and 25/20/15/10.

**Purity:** `money-games.ts` reads `loadGameScores` (`:3`, `:137`), a cache in `tournament-state`, so
the ledger is not pure. The harness mocks that import from the test side (`vi.mock`), with no change
in `src/`.

## 2. Tournament formats with NO game-modes equivalent today

1. **Split format**: front nine one team mode, back nine another, or **1v1 pairings** with per-pair
   off-the-low. The pool has one format for 18 holes (`TS:105`).
2. **Team Stableford on a modified or custom scale** (the pool's team path is standard only).
3. **Scramble with a flat % allowance** (allowance ≥ 0, instead of tiered).
4. **The tournament points layer**: match play's points × holes won, margin-based Stableford
   (baseline / divisor), and W/T/L points. These are event rollup, not a game mode, so they belong
   in `tournament-standings.ts`, not the registry.
5. **Cross-round money**: skins carrying from round to round, a per-player Nassau stake summed
   across rounds, and the per-round bonuses (best individual net / Stableford, junk per round).
6. A round with `formatId:'skins'` is scored as best-ball match play (no special case). It's
   unused live. The `presses` setting is stored but implemented nowhere.

## 3. The golden corpus

- **Live, read-only:** `backups/` (gitignored) holds three snapshots: 2026-08-11, and 2026-09-10
  twice. Each has `tournaments.json` + `game_scores.json` (+ pools, players, audit). The newest has
  **17 tournaments, 24 rounds, 36 matchups, 13 of them scored**. Formats: match-play best-ball /
  individual / two-best-balls, nassau individual / two-best, Stableford individual / combined
  (2 margin-based), 1 scramble, 1 alt-shot, 5 nine-hole rounds, **1 split round (in money
  tournament T0)**, 4 money tournaments, 2 mixed-tee rounds, 0 plus indexes. It's a month old, so
  **refresh it first** with `scripts/export-backup.mjs` (SELECT-only, `:12`; it uses the live
  credentials, so Craig runs it or OKs it, Q10).
- **Sandbox:** `src/app/sandbox/page.sandbox.tsx` has 32 seeds, but its only tournaments (`:856`)
  have `rounds: []`. There is **no scored tournament seed**, so the sandbox adds nothing to the
  goldens until S2.1 adds seeds.
- **Synthetic (committed, no personal data):** a seeded-PRNG generator over format × teamMode ×
  {18, front9, back9, split} × allowance {-1, 50, 85, 90, 100, custom} × {full, off-the-low} ×
  {course, index} × {one tee, mixed tees, no rating, no tee} × index sets {plus, 0, null, 36+,
  2v1} × {complete, partial, one-ball divergent}. This is what CI runs. The live corpus runs only
  when `backups/` exists (`describe.skipIf`), and prints ids and counts only, never names.

## 4. The comparison harness (vitest only, `src/test/spine-s2-*.test.ts`)

1. **The adapter lives in the test first:** `poolGameOfMatchup(t, round, matchup)` builds one
   `PoolGame` per matchup: mode team-within-group, sides = A/B, one tee group,
   `nineHandicapBasis:'9'`, `selectedTeeId = defaultTeeId`, each player's tee = override or own,
   allowance −1 → 100 for the players, modeSettings `{format, scoring, result}` taken from
   teamMode / formatId / scoringMethod. Each matchup being its own game keeps off-the-low scoped
   the way the tournament has it.
2. **Compare at every level:** strokes per player per hole, team value per hole, hole winners,
   won/tied/thru per leg, final totals, and ledger dollars per player. The output is a table of
   disagreements, each tagged with a KNOWN cause (§1). Any untagged one fails the test.
3. **Goldens of today's output first** (§5.z): snapshot every tournament function on the corpus,
   then mutation-prove them (re-break the tee SI, the scramble %, and the two-ball Stableford, and
   watch each go red).
4. **Drift check:** recompute every scored live matchup and diff it against its stored
   `matchup.result`. That says which live numbers would move if a row were ever recomputed.
5. **Stroke vs match play property test** (§5.ce): full-handicap strokes vs off-the-low difference,
   per pair. Report only.

## 5. The slices (each one a revertible commit, `verify:quick` per commit, one full gate before handoff)

- **S2.0 Harness + corpus** (tests only, no `src/` change): §3 + §4. It produces the measured
  disagreement table, which goes to Craig with §6 before anything switches.
- **S2.1 Sandbox tournament seeds + e2e goldens** for the play page's tournament path (one seed per
  format, plus split, mixed tees and 9 holes). This is dev-only code, kept out of the build.
- **S2.2 Promote the adapter** to `src/lib/tournament-engine.ts` (pure). Not wired yet.
- **S2.3 Strokes + hole values** (`getPlayerStrokesForHole`, `getTeamNetForHole`,
  `getTeamStablefordForHole`, `bestBallTeamHoleScore`): delegate to `ctx.strokesOnHole` /
  `teamValueOnHole`.
- **S2.4 The match family** (`computeLiveMatchStatus`, `computeHoleWinners`, `computeNassauStatus`,
  the player totals) is derived from S2.3.
- **S2.5 `recomputeMatchResult`**: the values come from the engine; the points conversion moves into
  `tournament-standings.ts` (the N-way seam for S3).
- **S2.6 Play page tournament path → the lib**: removes the six page copies, so the dots and the
  result can't drift.
- **S2.7 Split format**, per Q6.
- **S2.8 The money ledger** (`computeTeamNassau`, `computeRoundBestNets`,
  `computeRoundPlayerDetails`, `computeSkins`, `computeMoneyLedger`), last, per Q3/Q7/Q8. Also
  delete `computeMoneyResult`.

**What stays behind the flag:** S2.3–S2.8 dispatch on a per-row stamp
`Tournament.engine?: 'modes'`, set only by the creators while `NEXT_PUBLIC_TOURNAMENT_MODES` is on.
A row without the stamp runs the legacy code forever (or until Craig picks otherwise, Q1). So no live
tournament's numbers move unless he decides they should. Split rounds and custom-scale rounds stay
legacy until Q5/Q6 are answered.

**Invariants (asserted on every corpus case):** `wonA + wonB + tied = thru`; swapping A↔B mirrors
every output; a player's strokes over the round = their rounded playing handicap (`|h| ≤ 2n`, with
plus as the mirror); one-ball results don't depend on member order; points are conserved
(`pA + pB` = W+L or 2T per contest; match play = (wonA + wonB)·win + 2·tied·tie). **Money sums to
zero**: team-game per side (existing), the ledger's Nassau when team sizes are equal, skins when
skins awarded > 0. The two non-zero-sum ledger cases are logged as known (Q7, Q8) until Craig
decides them.

## 6. Questions for Craig (asked outright, §5.bo)

1. **Existing tournaments when the engine switches?** A: they stay on the legacy engine (per-row
   stamp), and only new tournaments use modes; B: switch a row only where the harness shows zero
   diff; C: switch all of them. **Rec A** (no live number ever moves silently).
2. **Mixed tees:** whose stroke index? A: each player's OWN tee (the pool, the play page, the GHIN
   card); B: the round's default tee (today's recorded results). **Rec A.** It fixes the dots ≠
   result split, for new rows (with Q1 A).
3. **The ledger on nine / split rounds** (≈ double strokes; live T0 is affected): A: fix it for new
   rows only; B: fix it and recompute T0 (live money moves, and I show the before/after first);
   C: leave it. **Rec A**, plus show T0's numbers so you can decide B.
4. **Two-best-balls Stableford** (two nets against one par): A: adopt the pool's per-ball rule;
   B: keep it. **Rec A** (no live round uses it).
5. **Custom Stableford scale + scramble flat %:** A: add `stablefordScale` and a scramble
   `allowance` setting to team-game (defaults unchanged, `showIf`); B: those rounds stay legacy.
   **Rec A.**
6. **Split format:** A: two sub-games in the adapter (a front team game + a back 1v1 game per
   pair); B: it stays on the legacy engine permanently; C: new tournaments stop offering it.
   **Rec B now, A in its own slice later.**
7. **Nassau stake:** the tournament pays each player ±leg, the pool pays per side. A: keep
   per-player in the adapter (stake × members, equal sizes required, or prorated); B: adopt per
   side. **Rec A** (it keeps the live meaning).
8. **Skins ledger:** A: take the pool's rules per round (decide once every group has posted, §5.ca;
   refund the ante when nobody wins a skin) and keep the cross-round carry at the event level;
   B: keep today's. **Rec A**, for new rows.
9. **No-rating tee:** A: the index stands in (pool / ledger, F-023); B: 0 strokes (live-scoring
   today). **Rec A.**
10. **Refresh the corpus:** OK to run `scripts/export-backup.mjs` (SELECT only) against live?
    **Rec yes**, before S2.0 reads it.

## 7. Series vs S4 (§5.cf 5, beta bar #11)

S2's finding: **a tournament round is already, almost exactly, "one team-game PoolGame per matchup."**
Only the split format, the cross-round money and the points layer don't fit, and all three are
**rollup** concerns, not round concerns. So an Event is a list of pool games plus a pure rollup, and
that is GROUPS_AND_EVENTS Option A's `GameSeries` with a points/money rollup attached.
Implications:

- **Series first is S4's data shape, minus the rename.** Build `Series { gameIds, sourceGroupId,
  rollup: 'money' | 'points' }`. The cumulative money is the sum of each game's per-player
  `moneyNet` (the stats ledger's F-068 split already does that). This meets bar #11 with **no
  money-engine change and no S2 dependency**, because each day is an ordinary pool game, on any mode,
  N-way, re-drawing teams daily.
- **S3 as written (N-way writes on the legacy `Tournament` type) becomes unnecessary.** N-way
  multi-day falls out of a Series of pool games. Ryder-Cup points become a rollup option (the
  `computeStandingsN` code moves over).
- **S2 shrinks to a convergence + freeze**: S2.0–S2.6 retire the duplicate math under the existing
  tournament pages. Legacy tournaments stay legacy-stamped (Q1 A), and new multi-day events are
  created as Series. S4 then reduces to "a tournament row is read as a Series" (an `eventOf` adapter)
  plus the vocabulary collapse (§5.cb).
- **Recommendation: Series (Option A) for bar #11 now, designed as the Event spine's container** (its
  rollup is what S4 needed). Keep S2.0–S2.6 in parallel, and defer S2.7/S2.8 and S3 until the
  Series is in use. Craig's call; not picked unasked.

## 8. Q3 ledger fix: T0 before / after (2026-10-12, §5.cs)

**T0 is "Hogs and Dawgs" (7b747949), round 3 at Glenmore.** It's an 18-hole round whose tournament
points split at the turn: a front-nine 2v2 best ball, then back-nine singles. The money games are a
team Nassau (best net, 75%, $10/$10/$5) and skins (50%, net to par, cross-round).

**Cause.** The old ledger used the per-nine re-ranked holes (1–9 twice) with the full 18-hole money
handicap over 18 holes. Every player under an 18 money handicap got about double strokes (Craig 14
vs 7, Jake 6 vs 3).

**Rule (Craig).** Split rounds default to the 18-hole handicap on the card's stroke index. Per-nine
9-hole ratings are an option (`moneyGames.splitRoundHandicap`).

**Net $ (export of 2026-10-12, computed by the app's own code via `src/test/ledger-corpus.test.ts`):**

| Player | Before | After (18-hole default) |
|---|---|---|
| Craig Hoelzer | +41.11 | −5.00 |
| Nicholas Burns | +32.22 | +47.22 |
| Alex Ross | +16.11 | +8.89 |
| Jake Enterlin | −3.33 | −13.89 |
| Chris Casey | −7.78 | −22.78 |
| Keith Hoelzer | −10.56 | −10.56 |
| Michael Smith | −21.11 | +7.22 |
| Micajah Lacy | −21.11 | −0.56 |
| Nicholas Bodner | −25.56 | −10.56 |

- **What moved:** only round 3. Its Nassau went from A / B / push to A / push / A, and 16 of its 18
  skin holes changed hands.
- **What didn't:** rounds 1 and 2 are identical, and both totals are $0.
- **The other money tournaments:** Bloody Sunday, Ryder Cup and Shindig are unchanged.
- **When it shows:** the ledger is computed at read time, so this takes effect when the branch merges.
