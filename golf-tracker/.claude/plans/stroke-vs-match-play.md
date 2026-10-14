# Stroke play vs match play handicap strokes (beta #6, §5.ce)

Craig, 2026-10-01: "Stroke and match play are calculated very slightly differently, and very
occasionally can produce different stroke totals." Investigation only. **No math was changed.**
Characterization test: `src/test/stroke-vs-match-play.test.ts` (15 tests, green on current code).

## 1. The rule (USGA Rules of Handicapping)

usga.org and randa.org both refused automated fetches (403 / redirect), so I could not re-read the
2024 text this session. Confidence is marked on each line. The F-102 sweep (2026-09-28) did read
both PDFs; its quotes are in FINDINGS F-102 e/g/h and `src/test/whs-plus-rules.test.ts`.

| Point | Rule | Confidence |
|---|---|---|
| Playing Handicap = Course Handicap × allowance, on the **unrounded** CH, rounded once (.5 up; a plus half toward zero) | Rule 6.2, Rule 5.1c, Appendix C | High (settled, §5.bb, §5.bx) |
| **Stroke play:** each player gets their full Playing Handicap | Rule 6.2 | High |
| **Match play:** the lowest Playing Handicap plays off 0; the others get the difference | Appendix C | High |
| Recommended allowances: singles match 100%; **four-ball match 90%**; individual stroke play 95%; **four-ball stroke play 85%** (not 90%) | Appendix C table | High for these four |
| Strokes go on the hardest holes by stroke index; a plus player gives back from SI 18; full allocation past 18 | Rule 6.2, Rule 3.2 Note 2, §5.ct | High |
| **2024 team match play: the allowance is applied to the DIFFERENCE between Course Handicaps, "rather than to the individual"** | Appendix C (2024), as quoted in F-102 h; the C/3 example says "18 strokes (90% of the difference in Course Handicaps from Player A)" | **Medium.** Quoted by an earlier session from the PDF; I could not re-verify it. Whether the difference uses whole CHs (the GHIN number) or unrounded ones is **not known**. Needs Craig or the GHIN app |
| What the GHIN app does for a four-ball match at 90% | n/a | **Unknown.** §5.ba says GHIN is the reference |

**Where the rules give different stroke totals.** Under 2020-style "round each, then subtract",
B's edge over A is round(B×p) − round(A×p). That is the same in stroke play and in match play, by
construction. Under the 2024 team-match reading, B's edge is round((B − A) × p), which is a
different number about a quarter of the time when p < 100% (§3). At 100% with whole CHs the two
readings are identical. So singles match play never differs; four-ball match play at 90% does.
That is the most likely meaning of Craig's "very slightly differently ... very occasionally".

## 2. What our engine does

One allocator, `strokesOnHole` (`src/lib/strokes.ts`), wrapped by `getMoneyStrokesOnHole`
(`src/lib/money-games.ts:124`). It rounds the handicap it is given and puts strokes on SI 1..n.
`applyAllowance` (`src/lib/game-state.ts:135`) is `CH × pct/100`, unrounded.

- **(a) Stroke play / "Full handicap" (`strokeMethod: 'full'`):** pool `buildHcapMap`
  (`src/lib/pool-game.ts:789`) leaves `applyAllowance(CH)` unrounded, and the allocator rounds it
  once. = round(CH × p). Matches Rule 6.2.
- **(b) Singles match play off the low:** pool: `buildHcapMap` rounds each player's
  `applyAllowance(CH)`, then subtracts the lowest rounded value (`pool-game.ts:814`). In
  head-to-head match modes, the low is taken per match (F-037 T4, §5.cn). Tournament:
  `live-scoring.ts:182` `getPlayingHandicap` does the same, within the matchup. = round(B×p) − round(low×p).
- **(c) Four-ball match off the low:** the same code as (b) over the four players, with the low of the
  four playing off 0. The allowance is applied **per player, before** the difference. That is the
  2020 reading. It is not the 2024 "allowance on the difference" reading (F-102 h, not adopted, §5.bx 4).
- **(d) Pool off the low:** the same round-each-then-subtract, using the **field's** low across every
  foursome, not per match, unless the game is a head-to-head match mode.
- **Stroke | Match scoring toggle (pool):** this changes only how a leg is won
  (`computeLegHoleMatch`). It **never changes strokes**. Strokes come only from `strokeMethod` and
  the allowance. They are independent settings, and the default is off the low. The tournament
  `TEAM_MODES` (`src/lib/formats.ts`) defaults best-ball / two-best-balls to 90% off the low whether
  the round is scored as stroke play or match play. Appendix C would use 85% for four-ball stroke play.

**Net effect:** in our engine, full and off the low **always** give the same relative stroke total
between any two players. This is pinned for every pair and every allowance from 85% to 100%. They
differ only in **which holes** the strokes fall on (§3, G6/G7).

## 3. Where the rules disagree (enumeration in the test)

Integer CHs from +5 to 40, 1,071 low/high pairs:

| Allowance | ours ≠ diffFirst | diffFirst gives +1 | diffFirst gives −1 |
|---|---|---|---|
| 85% | 271 (25%) | 166 | 105 |
| 90% | 275 (26%) | 175 | 100 |
| 95% | 240 (22%) | 165 | 75 |
| 100% | 0 | n/a | n/a |

The gap is always exactly one stroke, and it can go either way: there is no systematic bias. In a
90% four-ball there are three non-low players, so roughly half of all foursomes would have at least
one player off by one between the readings. That is not "very occasionally". If the GHIN app used
the 2024 reading, friends would see the mismatch often.

The other two classes are already settled. First, with unrounded CHs at 100%, subtracting first
differs; the Rules round each player first, and F-102 g fixed this. Second, the placement of strokes
(below) is just how WHS works.

### Worked examples (goldens; fixtures make CH = index and SI = hole number)

| # | Players (CH) | Allowance | Stroke play (each) | Ours, off the low | 2024 diffFirst |
|---|---|---|---|---|---|
| G1 | 5, 16 | 90% four-ball | 5, 14 (edge 9) | 0, **9** | 0, **10** (11 × 0.9 = 9.9) |
| G2 | 10, 13 | 85% | 9, 11 (edge 2) | 0, **2** | 0, **3** (3 × 0.85 = 2.55) |
| G3 | 3, 8, 14, 19 | 90% four-ball | 3, 7, 13, 17 | 0, **4**, 10, 14 | 0, **5**, 10, 14 |
| G4 | +4, 16, 7, 26 (Appendix C/3) | 90% | −4, 14, 6, 23 | 0, 18, 10, 27 | 0, 18, 10, 27 (agree: the Rules' own example cannot tell the readings apart) |
| G5 | +5, 6 | 95% | −5, 6 (edge 11) | 0, **11** | 0, **10** (11 × 0.95 = 10.45) |

The same total can land on different holes. At 100%, B's extra strokes relative to A:

- **G6** CH 5 v 15: full handicap puts B's edge on SI 6–15. Off the low puts it on SI 1–10. On SI 1–5
  and 11–15, a hole-by-hole match can come out differently, though the 18-hole total of 10 is equal.
- **G7** CH +2 v 10: full handicap puts B's edge on SI 1–10 plus 17–18, where A gives back. Off the
  low puts it on SI 1–12.

A side note found while probing, harmless in practice: `CH × (pct/100)` in floating point can miss a
.5. Only CH 45 at 70% does, among one-decimal CHs from −10 to 60 at 50–100%: 31.4999… → 31, where
the exact answer is 32. No real allowance or CH hits it.

## 4. Options for Craig

- **A. No change.** Keep round each, then off the low, everywhere. It follows the 2020 text and
  Appendix C/3, keeps stroke play and match play totals identical, and is what GHIN matched on the
  F-022 / §5.bb checks.
- **B. Adopt the 2024 team match reading for four-ball match play only**: round((CH − lowCH) × p)
  when the round is match play, the format is a team (four-ball) format, and the allowance is below
  100%. Stroke play and singles stay as they are. This moves about 1 stroke for about 25% of players
  in live 90% best-ball matches. It is an allowance-order change, so §5.ba requires GHIN-app evidence
  first.
- **C. Gather the evidence first, then pick A or B.** On the course or in the GHIN app's match /
  Playing Handicap calculator, enter a four-ball at 90% that separates the readings. Use **G1 (CH 5
  v 16 → 9 or 10?)** or **G3 (3/8/14/19 → second player 4 or 5?)**. Screenshot both an off-the-low
  four-ball and a stroke-play four-ball (§5.ba asks for both shapes).
- **D. (independent of A–C) Default the allowance by scoring.** Four-ball stroke play defaults to
  85% and four-ball match play to 90%, per the Appendix C table. Today 90% is used for both. This is
  a default only, with no math change, but it still needs Craig's say.

**Recommendation: C, then A or B according to what GHIN shows.** Until then A, which is today's
behaviour, and nothing changes for live games. If GHIN gives 10 for G1, the math should change
(B), and that is Craig's call to authorize. Consider D separately; it is a cheap default.

## 5. UPDATE 2026-10-14: the official text, read (supersedes the "2024 reading" above)

Read from the USGA's own Rules of Handicapping, Appendix C (usga.org, fetched with a real browser after
plain fetches got 403):

> "Handicap allowances are applied to the unrounded Course Handicap as the final step in calculating a
> player's Playing Handicap."
>
> "In general, after handicap allowances have been applied in stroke-play formats, a player receives
> their full Playing Handicap."
>
> "In general, after handicap allowances have been applied in match-play formats, the player with the
> lowest Playing Handicap plays off zero strokes relative to the other player(s). The other player(s)
> receive(s) the difference between their own Playing Handicap and that of the player with the lowest
> Playing Handicap."

Table: stroke play individual 95%, four-ball 85% (four-ball par/bogey 90%); match play individual 100%,
four-ball 90%. The C/2 and C/3 examples' "90% of the difference" wording is illustrative: every example
row computes the same either way, and Note 2 says the examples apply the allowance to the rounded CH
"for ease of illustration". **The rule text is "the difference between Playing Handicaps", which is what
our engine does (round each, then subtract). Option B is not supported by the text.**

**Where stroke and match play really differ (Craig's "occasional differences"):** not the totals but
WHERE the strokes fall. Stroke play gives each player their own Playing Handicap on SI 1..PH; match play
gives only the difference, on SI 1..diff. CH 10 v 18: stroke play puts B's 8-stroke edge on SI 11–18;
match play puts it on SI 1–8. Hole-by-hole results (and so a match) can differ. Our scoring step lets
"Who gets strokes?" be Full handicap OR Off the low under EITHER "Decide by" (`scoring-step.tsx:331`,
independent of match play), so a match-play game set to Full handicap puts strokes on different holes
than GHIN would. Question for Craig: tie them (match play → off the low, stroke play → full).

## 7. GHIN-app evidence, 2026-10-14 (Craig): singles at 100%, Spring Creek 3 Stars

Craig's numbers: "a 6.8 from the 3 stars at spring creek gets 5 strokes at 100% in stroke play against a
3.3 handicap. in match play he gets 4 strokes, and a 7.0 gets 5 in both match and stroke."

3 Stars (men) from the 2026-10-12 backup's stored tee set: **CR 71.2, slope 141, par 72**. (F-022's test
fixture used a guessed 73.8 / 131. Those aren't the real numbers, but its 90% case gives 6 either way.)

| Index | Course Handicap (unrounded) | Rounded | Stroke play: round each, subtract | Match play: round the unrounded difference |
|---|---|---|---|---|
| 3.3 | 3.318 | 3 | n/a | n/a |
| 6.8 | 7.685 | 8 | 8 − 3 = **5** ✓ | 7.685 − 3.318 = 4.367 → **4** ✓ |
| 7.0 | 7.935 | 8 | 8 − 3 = **5** ✓ | 7.935 − 3.318 = 4.617 → **5** ✓ |

**Both rules fit all four GHIN numbers exactly:**
- **Stroke play:** each player's Course Handicap is rounded; the strokes shown between two players are the
  difference of those whole numbers.
- **Match play:** the difference is taken on the UNROUNDED Course Handicaps, then rounded once.

A brute force over every slope 55–155 and CR−par from −6 to +6 finds this pair of rules consistent with the
four numbers only for slopes 138–145. The real slope, 141, is inside that range.

**What our engine does (probed 2026-10-14, `buildHcapMap`, off the low, 100%, these tees):** 6.8 v 3.3 → **5**,
7.0 v 3.3 → **5**. Our engine rounds each player first in both cases, so in match play it gives the 6.8 one stroke more than GHIN's 4. §2's line "at 100% with whole CHs the two readings are identical" is true, but
GHIN doesn't use whole CHs for the match difference. This is the "possibly just in terms of rounding" Craig
suspected.

**How often it bites:** on these tees, for index pairs 0.0–30.0, **25%** of pairs differ by exactly one
stroke. 64% of those differences give fewer strokes in match play, the rest give more.

**Not yet known:**
- **(a) With an allowance below 100%** (four-ball match at 90%): whether GHIN computes round((A − B) × 90%)
  on the unrounded CHs. That would agree with the 2024 Appendix C "allowance on the difference" text in §1.
- **(b) In a four-ball,** whether the difference is taken from the lowest of the four (the low plays off 0).

**No math changed (§5.ba, §2).** If Craig adopts it, the change is: match play off the low = round(unrounded
CH − unrounded low CH), per match. The goldens come first, and it applies to new games only, so a settled
game never moves.

**This also reconciles the August "Cory" case.** It was the basis of the `pool-game.test.ts` regression "rounds
each handicap before subtracting (matches GHIN)": a pool off the low, which is STROKE play. Stroke play rounds
each player, so that case and today's are the same GHIN behaviour. Only MATCH play takes the difference
unrounded. The fix would therefore leave stroke play (and that regression) alone and change match play only.
