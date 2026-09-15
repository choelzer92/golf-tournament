# UI findings — archive

Settled findings, moved verbatim out of the working set for context economy — the
same pattern as `DECISIONS_ARCHIVE.md`. Nothing here was renumbered, reworded, or
summarized; entries appear in their original `FINDINGS.md` order (which is not
strictly numeric — e.g. F-016 was filed before F-015, F-021 before F-020). Grep
this file by finding number (`F-0NN`) when a task touches that topic; don't read
it whole. Open findings — and anything still waiting on Craig — stay in
`FINDINGS.md`, which also carries a one-line index of everything archived here.

One block below has no `###` header of its own: the Nassau "thru 9" wording
finding (status: ALREADY FIXED, verified on screen 2026-08-19) lost its heading
at some point and sits attached to the end of F-020's entry, kept exactly as it
appeared.

---

### F-003 — `/home` is unreachable by default, so the "continuing" work is invisible  [P2] [continue]

**Screens:** `src/lib/flags.ts:8`, `src/app/page.tsx:41`, `src/app/dashboard/page.tsx`
**Violates:** north star (continuing is the most valuable phase)

Craig: *"I want to eventually make the new home the baseline."*

`HOME_V2 = false`, so login routes to `/dashboard`. The dashboard has **zero links
to `/home/stats`** — the only path in is the dashboard's "Try new Home" button.

So the entire "continuing" feature set — the money ledger, settle-up, the four
lenses, groups — is effectively invisible to real users. Combined with the
completion bug (nothing ever set `status:'completed'`, fixed 2026-08-10), this
means **the season-money feature has never been usable by anyone**: unreachable
*and* fed by an always-empty array.

**Options**
- **A. Flip `HOME_V2 = true`.** One line; `/home` becomes the landing page. Should
  follow a critique pass on `/home`, `/home/stats`, `/home/groups/[id]` — captures
  now exist (`e2e/critique.spec.ts`).
- **B. Flip it, and keep "Classic dashboard" as an escape hatch.** `/home` already
  renders that link, so this is A plus leaving the door open. Lowest-risk path to
  baseline.
- **C. Leave the flag off, but link Stats & money from the dashboard.** Makes the
  feature reachable without changing anyone's landing page.

**Recommendation:** **B** — matches Craig's stated intent, and the escape hatch
means a confused user is one tap from the familiar screen. Gate it on finishing the
critique pass for the three `/home` routes first.

**Status: DONE (option B, 2026-08-12).** `HOME_V2 = true`.

The gate held: flipped only after both landing screens were fixed and verified —
**F-009** (money group-scoped, "My money" crosses groups) and **F-010** (the group page is
a dashboard, 5,249px → 1,562px). Flipping before those would have made a leaky money view
and a 13-screen member list the first thing every user saw.

Also caught while flipping: the dashboard's link read **"Try new Home"**, which is
backwards once Home is the default — it's the way back, not an experiment. Now just "Home".

e2e guard covers both directions: `/home` renders with content and offers "Classic
dashboard", and the dashboard links back without the stale wording.

---

### F-004 — A share-link guest gets the ORGANIZER's controls  [P2] [continue]

**Screen:** `/pool/{id}?key=…` on a fresh device ·
`e2e/screenshots/guest-share-link.png`
**Violates:** north star (minimum exposed complexity); `UI_CONVENTIONS.md` §6c

**Observed:** verified the share flow on a simulated fresh device (new browser
context, no cookies, no storage). The good news: it works exactly as intended — no
invite code, no login, straight to the game with "Enter Scores" per foursome.

But the guest sees **every organizer control**:

- **Edit** — can rename the game, reassign tees, rebuild teams
- **Close out game** — can mark the whole game final for everyone
- **Save format**, **Share**
- **CTP setters** for all 4 par 3s
- **Refresh from GHIN** (they have no GHIN token, so it will fail)
- **How these teams were built**

A visiting player only needs: see the leaderboard, tap their own foursome, enter
scores. Everything else is either noise or actively dangerous — a guest tapping
"Close out game" ends the round for all four foursomes.

**Why it matters:** this is the highest-traffic entry point in the app (most users
arrive via a share link, not as the organizer) and it's the app's first impression.
It's also the "continuing" phase, where a guest joining at the turn is a normal
case.

**Options**
- **A. Hide organizer-only controls at `pool` access level.** `getAccessLevel()`
  already distinguishes `full` from `pool`; gate Edit / Close out / Save format /
  CTP / GHIN-refresh on it. Small, targeted change — the mechanism already exists
  and is simply not used here.
- **B. A dedicated read-plus-score guest view.** Cleanest for the guest, but a new
  screen — which the north star flags as a design smell.
- **C. Leave it.** Everyone's a trusted friend today, and an organizer sometimes
  *wants* a co-organizer to edit.

**Recommendation:** **A**. It's the smallest change, uses the access level that
already exists, and directly serves "minimum exposed complexity."

**Status: FIXED + VERIFIED** (option A, 2026-08-11).

Craig specified the target: *"The share a game link should just allow someone to
enter scores for their foursome if they want, or to view the leaderboard."*

He then corrected my first attempt — I had also hidden "How these teams were
built", and he asked: *"wouldnt players in the game want to see the settings? or
understand how they were built?"* He's right, and it sharpened the principle:

> **The line is READ-ONLY vs MUTATING, not organizer vs guest.**

A player in a money game is entitled to see everything — the money structure, the
handicap basis, how teams were built. What they must not do is change it for
everyone. So `MoneySummary`, `FieldLowBanner` and `TeamBuildSummaryCard` stay
visible to guests; Edit / Close out / Save format / CTP / GHIN-refresh are hidden.

Guarded by two e2e tests (guest is scoped; organizer still sees everything) —
`e2e/screenshots/guest-scoped.png`.

---

### F-006 — A pool of foursomes can only ever be best-ball; no scramble or Stableford  [P1] [start]

**Screens:** `src/lib/formats.ts:32`, `src/lib/pool-game.ts:1264-1278`,
`src/app/pool/new/page.tsx` ("Which scores count for the team?")
**Violates:** north star — *more possibilities than any other app on the market*

Craig: *"what if people are doing more than just 2 best net, 1 net 1 gross, or 2 best
gross? what if it is a scramble against another foursome, or stableford, or any other
version of the game. does this work?"*

**No, it doesn't. And this is a real ceiling, not a UI problem.**

A classic pool's per-hole team score is hard-typed to three options:

```ts
export type TwoBestBallsVariant = '1-net-1-gross' | '2-best-net' | '2-best-gross';
```

`teamHoleScore()` (`pool-game.ts:1278`) delegates to `bestBallTeamHoleScore(scores,
variant)` and nothing else. So **every** N-foursome pool ever created is some flavour
of best-ball on net strokes. A group that plays a scramble against another foursome,
or scores Stableford points instead of strokes, cannot express it.

**The asymmetry that makes this worth fixing.** The 2v2 within-group mode
(`game-modes/team-game.ts`) *already* computes all of it — for one foursome split into
two sides:

| Capability | 2v2 mode | Classic pool (N foursomes) |
|---|---|---|
| Best ball (low net) | ✅ | ✅ |
| Combined (both scores added) | ✅ | ❌ |
| Scramble (one ball + USGA team handicap) | ✅ | ❌ |
| Alternate shot | ✅ | ❌ |
| Stableford points per hole | ✅ (`sidePts`) | ❌ strokes only |
| Match play, hole by hole | ✅ | ⚠️ only in 2-team `moneyMode: 'match'` |
| Front/back/overall legs | ✅ | ✅ |

So the engine for scramble, alt-shot, combined, and Stableford **exists and is
tested** — it's just wired only to the 2-sides-in-one-group case. `sideNet`/`sidePts`
take a list of player ids and a hole; a foursome is also a list of player ids.
`teamHandicapForFormat()` is already exported and generic.

**Why this matters most for scaling.** A pool of N foursomes is the format a club or
a 20-person outing uses — exactly the audience Craig is aiming at. "Four foursomes,
scramble, most Stableford points wins" is an extremely common outing format and the
app cannot do it.

**Options**
- **A. Extend the pool's team-score rule to reuse the 2v2 engine.** Replace the
  `TwoBestBallsVariant` field with a `teamFormat` (best-ball / combined / scramble /
  alt-shot / two-best-net / …) plus a `scoreBasis` (strokes / Stableford), and have
  `teamHoleScore` dispatch to the same functions `team-game.ts` uses. Biggest payoff.
  Cost: touches the money engine's hot path, so it needs the compute tests extended
  first — and every existing game must keep computing identically (a legacy
  `ballSelection` maps to the equivalent new pair).
- **B. Add a "team pool" game MODE instead.** Leave the classic pool alone; add a
  registered mode that competes N teams with the full format set. Zero risk to
  existing games, but it splits the codebase into two overlapping team engines and
  duplicates the leg/junk/payout logic — the design smell called out in
  `UI_CONVENTIONS.md`.
- **C. Generalise the existing engine to N sides.** `team-game.ts` currently assumes
  exactly two sides (`{a, b}`). Widening it to N and pointing the pool at it unifies
  both paths. Cleanest end state, largest change, and it touches Wolf too.
- **D. Leave it, document the limit.** Groups wanting a scramble pool use the
  tournament side (which supports scramble/alt-shot per round) — but that's two-team
  only, so it doesn't actually cover a 4-foursome outing.

**DECIDED (2026-08-12): option C — generalize the engine to N sides.**

Craig, asked directly whether he'd ever want more than two sides competing within one
foursome: *"yes, eventually i do think that would be an important feature."*

That settles it. Option A (extend the pool to dispatch into the existing two-side
engine) would have to be redone the moment a 3-side game exists, so do the
generalization once: widen `team-game.ts` from `{a, b}` to N sides, and point BOTH the
classic pool and the 2v2 mode at it.

Scope this brings in:
- `subTeams: { a: string[]; b: string[] }` becomes N sides (array or keyed record),
  with the current two-side shape read as a legacy case so saved games keep working
- `TeamLegLine.winner: 'a' | 'b' | null` widens to a side id
- `settleJunkForSides` currently nets side A against side B; N sides needs a
  field-average settlement like `settlePerPoint`
- Wolf builds a Wolf-side and a field-side, so it's a 2-side consumer of the same code
- the money models (`per-hole`, `per-point`, `legs`) all assume a head-to-head margin

Sequencing (unchanged, and non-negotiable given this is the money engine's hot path):
1. Pin every current `ballSelection` result in the compute tests FIRST, so existing
   games are provably unchanged.
2. Generalize the engine behind those tests.
3. Map legacy `ballSelection` to the equivalent format+basis pair.
4. Only then the UI.

**Note on this being a type change:** like the fixed 5-key bonus list, this is one of
only two findings so far that needs a schema decision rather than a UI fix. Both are
about the same thing — the app's *possibility* ceiling.

---

#### F-006 implementation log (2026-08-13) — four bugs the first pass introduced

Step 1 (pin every `ballSelection` in golden snapshots) and step 2 (the generalized
engine, `lib/game-modes/team-scoring.ts`) are done, plus the pool wiring behind an
opt-in `teamFormat` / `teamScoreBasis` pair (absent on every existing game → legacy
path, byte-identical, snapshot-pinned).

Getting there produced **four money/display bugs, all in the new opt-in path**. Worth
recording because they share one root cause: *a points score routed through code that
assumes strokes*. Every one of them was found by asking a question of the numbers,
not by reading the code.

**1. Ranking direction (found by reading the test's own output).** `buildLeg` ranked
lower-is-better, so under Stableford the 54-point team lost to the 36-point team. My
own test asserted `t1.total > t2.total` and passed while the wrong team was paid.
*Lesson: assert the MONEY, never just the score.* The test now asserts `place` and
signed `net`.

**2. Three more consumers each re-derived their own comparison.** Fixing `buildLeg`
left `matchLegOutcome`, `computeLegHoleMatch`, and the leaderboard's `legWinner` all
sorting on `toPar` directly. Verified with a probe: in match mode the birdies-everything
team was paid **−$160** and won **0 of 18** holes. Fix: `PoolTeamLegStanding` now
carries `rankMetric`, always lower-is-better, and every consumer reads it. One field,
one direction — four places deriving the same thing is how this got through.

**3. `toPar` hard-coded `× 2` par per hole.** True of every legacy `ballSelection`
(two balls: best net + best gross), false for scramble/best-ball (one) and combined
(four). `toPar`'s only job is comparing a team thru 9 with one thru 18, and with the
wrong ball count it ranked on holes played instead: two dead-even teams came out
`-72` vs `-36`, place 1 vs place 2. Fix: `ballsPerHole(format, memberCount)` and
`evenValueOnHole(hole, basis, balls)`.

**4. Multi-ball Stableford scored 0 on nearly every hole.** `two-best-gross` and
`net-and-gross` added two stroke scores into one number, then scored *that* against a
single par — a double bogey by construction. Every team scored 0, everyone tied, and
the pot split evenly regardless of play. `two-best-net` already had a per-ball special
case, which is exactly why the other two *looked* like they worked.

**The rule this settles (Craig's question, "is that net or gross for the pace?"):**
points are scored **per ball, off that ball's own score**, then added. Net-or-gross is
decided by the **format**, not by a setting — best-ball/combined/scramble/alt-shot are
net, `two-best-gross` is gross, `net-and-gross` is one of each. So the points always
come off the same score the money engine ranks, and display can't diverge from payout.

**Junk is untouched by any of this** (Craig asked specifically about both junk models).
Verified by test, both ways: the pot model (junk sub-pot split by junk total) and the
match model ($/point over the opponent) produce *identical* junk money under `stroke`
and `stableford`. Birdies are birdies whatever the leg's basis. `computeJunk` reads
gross vs par and never consults `teamScoreBasis`.

**Also confirmed in scope-checking:** the registry modes (9s, skins, Stableford-the-mode,
quota, low-total, Wolf) never reach `buildLeg` — `game-modes/result.ts:21` routes any
`gameMode` to `mode.compute()`, and only a game with *no* `gameMode` reaches
`computePoolResult`. They rank via their own `rankByPointsDesc` and were never affected.

**Decisions taken (2026-08-13):**
- Stableford + head-to-head match mode is **allowed** (Craig): most points wins each
  leg, and the hole-by-hole variant awards the hole to more points.
- Leaderboard under points shows **PTS + PACE** (points better than steady pars, 2/hole
  per ball). Craig hasn't confirmed the display shape — PACE is in as the column that
  makes differing thru counts comparable, which is what the pot ranks on. Revisit.

#### Step 4 done (2026-08-13) — the format picker, and an exhaustive sweep

**The picker.** One control, not two: the legacy three-option "Which scores count for the
team?" dropdown became the superset list (`TEAM_FORMAT_OPTIONS`), plus a Strokes /
Stableford toggle. `ballSelection` is no longer wizard state — it's *derived* at save time.

**The rule that keeps it safe (`persistedTeamScoring`, unit-tested):** choosing a format a
legacy `ballSelection` already expresses, with stroke scoring, saves the game the OLD way —
**no `teamFormat` at all**. Only a format that path can't express, or Stableford, opts in.
Without this, shipping the picker would have quietly moved every new ordinary pool onto the
new code, and "existing games settle identically" would hold only for games created before
today. Proven twice: by the golden snapshots, and by a test computing the same field both
ways and asserting the payouts are `toEqual`.

Also wired, because each would otherwise silently drop the format: the hub's mid-round
editor (it showed a ball-selection control that did nothing on a Stableford game —
`teamFormat` takes precedence), `GroupDefaults`, `formatFromGame` (Format Library), the
library's summary line, and the wizard draft. The USGA allowance recommendation now follows
the *format*, read from the one table in `lib/formats.ts` rather than a second copy of the
percentages — and stays silent for scramble, which is tiered by team size.

**The sweep (`src/test/all-modes-sweep.test.ts`, ~860 cases).** Craig: *"you should try all
the game types, settings/versions and see what happens. we need to make sure there arent any
weird errors."* It drives the REAL registry, so a new mode or setting is covered without
touching the file: every mode × every setting value × `playersMin` and a foursome; every mode
on five partial-round shapes; the pool matrix of 7 formats × 2 bases × 2 money modes × 2 leg
scorings × 3 hole ranges × 2/4 teams; threesomes, 8 foursomes, zero buy-in, an unstarted
team, both nine-hole handicap bases, every stroke method × handicap basis × allowance.
Asserts: never throws, money zero-sum, **no NaN/Infinity anywhere** (the failure that renders
as "$NaN" rather than crashing), and place/payout consistent with an independent oracle.

**No new product bugs found** — every combination already settled zero-sum with no NaN. What
the sweep did find was **weakness in its own assertions**, which is the part worth recording.

#### The lesson: a passing sweep is worthless until you prove it can fail

The first version passed 804/804 immediately. Distrusting that, I re-introduced each of the
four bugs from the earlier pass as a one-line mutation. **Three of four survived.** The sweep
looked thorough and tested almost nothing.

| Mutation (a real bug, reverted) | v1 | Why it survived |
|---|---|---|
| Points ranked lower-is-better | **survived** | Compared `place` against `rankMetric` — both from the same 3 lines. Tautology. |
| `toPar` hard-codes 2 balls | **survived** | Nothing compared teams at *different* thru counts — `toPar`'s only job. |
| Hole-match ignores basis | **survived** | Read `holesWon` back from the code under test. |
| `matchLegOutcome` uses `toPar` | **survived** | Matrix only exercised match mode with `holes` scoring, never `stroke`. |

Fixes: assert against an **independent oracle** (recount hole wins from the per-hole grid;
rank by who actually scored better, derived from raw totals, not from the engine's metric);
add the missing axis (`legScoring: 'holes' | 'stroke'`); add unequal-thru cases. All five
mutations now fail loudly (10–34 cases each).

**One assertion of mine was simply wrong**, and the sweep caught that too: I asserted equal
scoring *rate* should give equal `toPar` at different thru counts. It shouldn't — `toPar` is
cumulative, like a real leaderboard's "-5 thru 12". 14 formats failed, including legacy ones,
which is the signal it was the test and not the code. The right invariant is the *zero point*:
a team playing to expectation reads 0 whatever it has completed. That version catches the
ball-count bug (an even-par team read -72 vs -36) while being true of every format.

**How to apply:** for anything protecting money, write the test, then re-introduce the bug it
claims to catch and watch it fail. An assertion that reads a value the code under test
produced proves only that the code agrees with itself.

#### The scorecard was still playing a different game (2026-08-13)

Found by asking what the *scorecard* does with `teamFormat` — the answer was nothing. A classic
pool hard-coded `teamMode: 'two-best-balls'` and passed only `ballSelection`, so the card was
handed a rule the game wasn't playing. Three verified symptoms:

**1. Scramble money depended on the ORDER of `team.playerIds`.** The worst bug in the whole
F-006 pass. `teamNetOnHole` reads "the first member who has a score" — correct when ONE ball is
entered (every member shares the gross), but the card did per-player entry, so members held
different scores and the team's score became whoever happened to be listed first:

```
same scores, p1 listed first:  total 72,  net +$75
same scores, p4 listed first:  total 126, net -$75
```

A $150 swing from reordering a roster. Not reachable through the UI *before* the picker
shipped — which is exactly why it had to be fixed in the same pass.

**2. The card's team row contradicted the payout.** Scramble hole 1: engine 4, card 9 (its
hard-coded 1-net-1-gross row). `AGENTS.md` names this property as load-bearing — the scorecard
defers to the money engine so on-screen numbers match payouts.

**3. Stableford drew strokes where the money counted points.** `isStablefordFormat` keyed only
on `formatId === 'stableford'`; a pool arrives as `'stroke-play'` with the basis in
`formatSettings`. Same cell, two different units.

**Craig's calls:** one-ball formats enter ONE shared team score (as the 2v2 mode already does —
a proven pattern, not a new one), and the team row comes from the same engine the money uses.
He explicitly rejected "treat scramble as gross best-ball", which would have fixed the
order-dependence by silently changing the game.

Three more display defects only visible in a screenshot, not in the code: the card said
"Team A" where the hub and leaderboard said "Team 1"; the grid showed **no team row at all**
(`hasTeams` requires both A *and* B, but a pool foursome is one side); and it rendered an
A-vs-B match badge that means nothing when the other foursomes are on different devices.

**Two mistakes of mine worth recording:**

- I set `teamNames({ A: poolTeamName, B: 'Team B' })`, which leaked a placeholder AND fired for
  2v2 games too — caught immediately by the *existing* `SCORECARD shows side names` e2e test.
  That test earned its keep: it was written for an unrelated bug and caught a regression in a
  path I wasn't thinking about.
- I first tagged players only for one-ball formats, so multi-ball Stableford pools still got no
  team row. Surfaced by writing the card-vs-leaderboard equality test, which is the assertion
  that matters most here.

**And one false alarm I nearly reported as a bug:** the card's team row read 3s where the
leaderboard read 4s. Not a discrepancy — I was comparing the card's visible BACK-NINE tab
against the leaderboard's full 18. They agree exactly (Out 35 = 4x8 + 3, since a team handicap
of 8 puts strokes on SI 1-8, making a birdie there an eagle at 4 points). Verified with a probe
before writing anything down.

#### Follow-up (2026-08-14): the order-dependent payout was still live

Asked whether the next session could pick this up, I re-probed all four reachable paths first
and found the fix incomplete. The scorecard change removed the *input* that triggered it; the
engine's "first member with a score" read was untouched, and **the hub format picker added in
the same pass could re-create divergent scores** by switching a scored game to scramble:

| path | p1 first | reversed | differs |
|---|---|---|---|
| divergent scores (old card) | +$75 | −$75 | **yes** |
| identical scores (new card) | +$100 | +$100 | no |
| **format switched mid-round (new hub picker)** | **+$75** | **−$75** | **yes** |
| one member unscored | +$75 | +$75 | no |

Two changes shipped in one pass, and I hadn't checked their interaction — the second undid the
first's guarantee.

Craig reframed the fix (see DECISIONS.md §5.ac): one ball means one score, so divergent
per-member scores are data that should not exist. The hub now refuses to switch a scored game
to a one-ball format (in the `<option disabled>` *and* the `onChange`, since a disabled option
can still be set programmatically), and `teamNetOnHole` takes the minimum as a structural
backstop. Pinned by all 24 permutations of a foursome × both one-ball formats, asserting
neither the total nor the money moves; restoring the old read fails 4 of them.

**Still open — the N-sides half of option C.** Everything above generalized the *pool*
(N foursomes, any format). The 2v2 *within-group* engine is still hard-wired to exactly two
sides, which is what Craig's "yes, eventually" was about:

- `subTeams: { a: string[]; b: string[] }` → N sides, with the two-side shape read as a
  legacy case so saved games keep working (`pool-game.ts:205`, `roster-groups.ts:36`,
  `game-modes/types.ts:55`, plus the wizard's `SubTeamsStep`)
- `TeamLegLine.winner: 'a' | 'b' | null` → a side id (`game-modes/types.ts:87`)
- `settleJunkForSides` nets side A against side B (`game-modes/settings.ts:188`); N sides
  needs a settlement that generalizes. **Craig's call 2026-08-14: collect-from-every-other-side,
  NOT field-average** — see DECISIONS.md §5.ad. Field-average would have halved every existing
  2v2 game's junk money, which the line above didn't notice.
- `team-game.ts:119` defaults to `{ a: [], b: [] }` and computes two standings
- Wolf builds a Wolf-side and a field-side (`wolf.ts:82`), so it's a 2-side consumer of the
  same code and must keep working unchanged
- the money models (`per-hole`, `per-point`, `legs`) all assume a head-to-head margin

Smaller follow-up: the play page's leg panel (`app/game/play/page.tsx`) shows a raw leg total
in its sub-line — honest, but not pace-normalized under points.

**Status: F-006 DONE — both halves.** Pool side (engine, 4 money-bug fixes, leaderboard, wizard +
hub picker, scorecard, ~860-case sweep) and the N-sides side game. Committed on
`ui-consistency-and-compute-tests`, not merged.

#### The N-sides half (2026-08-17)

Sequenced as specified, and the sequencing paid for itself twice — both times the *pins* caught
a live money bug rather than a regression I'd introduced.

**Step 0 — F-012, found while scoping.** `team-game.ts` had its own copy of the order-dependent
one-ball read the pool half had already fixed. $54 on a scratch foursome. See F-012.

**Step 1 — pinned first** (`src/test/two-side-golden.test.ts`, 61 cases): the whole 2v2 matrix
(4 formats × 2 scorings × 2 results × 3 money models) as full-`IndividualResult` snapshots, plus
Wolf's every call type, plus independent oracles recomputing from raw gross. Mutation-proved with
five one-line bug re-introductions before being trusted (§5.z) — the table is in the file header.

**Step 2 — the shape** (`src/lib/game-modes/sides.ts`): `sides?: {id, name?, playerIds}[]`,
ordered, stable ids, alongside `subTeams`. `sidesOfGame()` normalizes at the read boundary and
preserves `'a'`/`'b'` literally; `persistedSides()` writes the legacy shape at exactly two unnamed
sides. So an ordinary 2v2 never leaves the pinned representation.

**Step 3 — the engine.** Money settles **pairwise round-robin** (§5.ae): every side against every
other, summed. Zero-sum at any count, reduces to today's head-to-head margin at two.

**THE BUG THE PINS CAUGHT (2).** One of 48 snapshots moved, so I probed instead of accepting it.
`total` scoring ranked on RAW TOTALS, so a side was paid for playing FEWER holes:

```
both sides level par, A thru 9 vs B thru 5   ->  B collected $16
side B thru 0 (not started)                  ->  B ranked 1st, collected $20
```

Craig's call: rank on score to par, showing thru — the tournament-scoreboard convention (§5.af).
This is the mechanism the *pool* has had since the pool half (`evenValueOnHole`); the side axis
never got it. **One axis drifting from the other, again** — the shape `AGENTS.md` warns about, and
the third time in this finding alone. At equal thru counts the to-par margin equals the raw margin
exactly, so no completed game's money moved: 47 of 48 snapshots byte-identical.

**Step 4 — the UI.** Mode widened in place (id `team-2v2` kept so saved games resolve, `playersMax`
4 → 8, renamed "Sides (within group)"). Wizard + hub gained add/remove-a-side; the leaderboard's
side colouring, row grouping and leg-winner tint now key on the side id instead of a hard-coded
blue/red pair. **The scorecard deliberately does NOT tag players for 3+ sides** — `Player.team` is
`'A' | 'B'` at ~27 sites, and tagging the first two would draw an A-vs-B team row and match badge
for a game that isn't A vs B, which is precisely the §5.aa defect. Untagged is honest-and-incomplete
rather than confident-and-wrong. Widening the card is its own finding (F-013).

**Two defects found by LOOKING at the screenshot, invisible in the code:**

1. **A third side could never be named.** The settings offered "Side A name" / "Side B name" only,
   so `GameSide.name` existed with nothing able to write it. Added C–F, with the unused boxes
   hidden so a two-side game doesn't show four blank fields.
2. **`+18` to par was drawn the same grey as `-4`.** Being 18 over par read as unremarkable.
   Colour now keys on the *basis* — under Stableford PACE is good when positive, under strokes it
   isn't — so the sign can't be coloured wrongly.

And one gap the e2e test exposed while being written: `ModeSettingsEditor`'s `<label>`s had no
`htmlFor`, so nothing linked them to their inputs. `getByLabel()` failing is the same lookup a
screen reader does. Fixed for every setting field in the app, not just the side names.

#### The pot money model (2026-08-17, Craig asked for it)

The side game's three money models were all margins, so "everybody throws in $20, best side takes
it" couldn't be expressed. Added as a fourth: **buy-in PER SIDE** (§5.ag — every side buys one
equal shot at the pot whatever its size, so a solo side and a trio have the same stake), paying
down the order by a configurable split, `100` by default.

Reuses `distributePot`, so Craig's tie rule needed no second implementation: tied 1st shares
1st+2nd money, a tie for 2nd splits 2nd, an all-sides tie returns every ante. An **unstarted side
is not in the pot at all** — it neither antes nor collects, which matters because an unstarted
side ranking first on an empty total is the bug §5.af closed.

Mutation-proved: ante per player instead of per side (8 cases), ante never collected (8), points
ranked lower-is-better (1), unstarted sides included (1).

**Two things this pass got wrong and fixed:**

1. **My own side-count sweep didn't list `pot`.** It swept the three margin models across 2–6
   sides and the pot only at the counts I'd hand-written. That is verbatim the "one axis was
   simply missing" row in §5.z's own table, in a test file whose header warns about it. Added; it
   now names the failing cell ("2 sides / pot / stroke / match is not zero-sum").
2. **Side names broke at sizes other than a pair** — found in a screenshot, not the code. A
   three-player side read "Craig & Jym & Dave" (worse at four) and a solo side read a bare "Tony",
   indistinguishable from a player row on a board of sides. Now "Craig & Jym +1" and "Tony (solo)".
   The whole suite stayed green when I changed the format, which is how I know it was untested
   rather than working — tests added.

Worth noting the registry design paid off: the ~860-case all-modes sweep grew 872 → 881 on its own
when the setting was added, because it drives the real registry rather than a copy of it.

#### Decisions taken before writing any N-sides code (2026-08-14)

Craig's answers to the three questions the sequencing required:

1. **Side-collection shape:** `sides?: { id: string; name?: string; playerIds: string[] }[]` —
   an ORDERED ARRAY with a stable explicit `id`, added alongside `subTeams`, absent on every
   existing game (the additive pattern `teamFormat`/`teamScoreBasis` already established).
   Rejected `string[][]`, where side identity would be the array INDEX — index-as-identity is
   the exact bug class that already cost $150 twice in this finding. Rejected
   `Record<string, string[]>` — no defined display order.

   Legacy load is one normalizer at the read boundary (`sidesOfGame(game)`), never inside the
   engine: `{a, b}` → `[{id:'a', …}, {id:'b', …}]`, ids preserved **literally**. That's what
   makes it cheap — `TeamLegLine.winner: 'a'|'b'` stays a valid value when the type widens to
   `string`, the `playerId: 'A'|'B'` standings rows stay valid, `sideAName`/`sideBName` keep
   resolving, and every saved game, existing test and snapshot reads identically. The write
   path keeps emitting `{a, b}` at exactly two sides, mirroring `persistedTeamScoring`.

2. **Junk across N sides: collect from every other side** (§5.ad). Not field-average.

3. **The one-ball pin captures the FIXED, order-independent result**, not today's behavior —
   see F-012. Pinning the current output would pin a live money bug and the fix would have to
   unpin it immediately.

Also raised once and settled: open question 8 (a Stableford pool's PTS + PACE column) stays
as built, revisit later. Craig's call — don't rebuild it unprompted.

---

### F-007 — The junk sub-pot VANISHES when nobody scores junk  [P1 MONEY] [continue]

**Where:** `src/lib/pool-game.ts:1643-1648` · surfaced on `/home/stats`
(`e2e/screenshots/phone-stats.png`)
**Violates:** the invariant every other mode holds — money is zero-sum

**Found by looking at `/home/stats` with a real season for the first time.** Four
players showed as owing money that the settle-up list never collects, and the
standings summed to **−$50** instead of 0.

**The cause.** `computePoolResult` skips the junk payout entirely when no team has any
junk points:

```ts
const junkHasPoints = junkRanked.some((j) => j.total > 0);
const junkPayouts = distributePot(
  junkHasPoints ? junkRanked.map(...) : [],   // <- nobody paid
  junkSubPot, game.positionSplit,
);
```

But every team's `entryPaid` is still deducted in full (`playerCount ×
entryPerPlayer`). So with the default 25% junk split, **a quarter of the pot
disappears** on any game where nobody makes a birdie, eagle, albatross, group hug, or
CTP — and CTPs are entered by hand, so a game where the organizer never sets them can
lose the junk pot even with birdies elsewhere.

Reproduced exactly (2 foursomes, $25 each, $200 pot, no junk scored):

```
leg front:   subPot=50  paid=50
leg back:    subPot=50  paid=50
leg overall: subPot=50  paid=50
leg junk:    subPot=50  paid=0     <-- $50 gone
Team 1: gross=55  entry=100  net=-45
Team 2: gross=95  entry=100  net=-5     => sum -50, not 0
```

**Blast radius.** Real-money display for every classic pool with an unscored junk
category. It also silently corrupts the **season ledger and settle-up**: `settleUp()`
matches debtors to creditors, so unmatched debt is simply never listed — four players
in the fixture owed money that appears in no transfer at all. A group reading that
board would under-collect and not know why.

**This is the same class as the mid-round bug already logged in `UI_MODE_AUDIT.md`**
("mid-round pot payouts are not zero-sum"): a leg with no eligible winner leaves its
sub-pot undistributed while the antes are already taken. That one self-corrects at 18
holes; **this one is permanent.**

**Options**
- **A. Refund an unwon sub-pot.** If a leg has no winner, credit each team its share
  of that sub-pot back (`subPot × playerCount / totalPlayers`). Mirrors
  `settleNassau`'s treatment of an un-started segment — a dead heat returns antes —
  which is the precedent already in the codebase.
- **B. Redistribute it into the contested legs.** Fold the junk share into
  front/back/overall when junk is unscored, so the whole pot still pays out. Changes
  what the other legs are worth, which organizers may not expect.
- **C. Split it evenly among all teams.** Simplest; equivalent to A in effect but
  expressed as a payout rather than a refund, so the board reads "$50 returned".
- **D. Don't collect it.** Reduce `entryPaid` by the unwon share instead of paying it
  out. Cleanest arithmetic, but the pot total shown at setup would no longer match
  what's collected.

**Recommendation:** **A**, because it matches the `settleNassau` precedent already in
the codebase and keeps each leg's stake meaning what the organizer set. **Fix the
mid-round case in the same change** — they're one bug with two symptoms, and a shared
"unwon sub-pot" rule solves both.

**Status: FIXED + VERIFIED (2026-08-12).**

Craig's answer was better than all four of my options:

> *"If no junk is scored by any team, this would be considered a tie, right?"*

Exactly right — and it means the fix is **deleting the special case**, not adding a
refund rule. `distributePot` already handles a tied field correctly: verified it
splits the full sub-pot evenly and distributes 100% of it, at 2 teams and 3 teams,
under both `[100]` and `[70,30]`. The `junkHasPoints` guard was preventing that logic
from ever running by passing `[]`.

Also had to align `place`: it was `junkHasPoints ? junkPlace : 0`, which would now pay
a team while rendering it unplaced. All tied teams are joint 1st.

Verified: the seeded season went from `Untagged Saturday: teamNetSum=-50.00` to
`0.00`, and the settle-up list went from 10 transfers leaving four players unsettled
to **8 clean transfers with nothing left over**.

Guarded by 4 compute tests (unscored junk pays out evenly · whole game zero-sum · 3
foursomes with a position split · normal ranking still works when junk IS scored) plus
a UI-level e2e assertion that the standings balance.

**The mid-round variant in `UI_MODE_AUDIT.md` is a DIFFERENT cause** and still open:
there, a leg has no *eligible* team because the nine hasn't started, so there's nobody
to tie with. Craig's tie reasoning doesn't extend to it.

---

### F-008 — Stats "By group" offers saved FORMATS, which can never have a ledger  [P2] [continue]

**Screen:** `/home/stats`, By group lens · `src/app/home/stats/page.tsx:65`
**Violates:** north star (minimum exposed complexity) — a dead option in a picker

The group dropdown lists **"2v2 Best Ball (Stableford)"** alongside Weekend Warriors
and Tuesday Crew. That's a **Format Library entry**, not a player group: formats are
stored in the same `roster_groups` table tagged `defaults.kind === 'format'`, and they
have **no players by design**. Selecting one can only ever render an empty ledger.

The codebase already has the right helper — `getPlayerGroups()` in
`lib/pool-formats.ts` exists precisely to filter formats out, and the wizard's new
group picker uses it. `/home/stats` calls raw `getGroups()`.

**Options**
- **A. Use `getPlayerGroups()`.** One-line change, uses the helper written for this.
- **B. Leave it, but label formats.** Pointless — a format can't have a ledger.

**Recommendation:** A. This is a straightforward bug, not a design decision.

**Status: FIXED + VERIFIED (option A).** Status line was stale — corrected 2026-08-18 after
checking the code. `/home/stats:96` calls `getPlayerGroups()`, which filters
`defaults.kind === 'format'` (`pool-formats.ts:38`), and every other group picker in the app uses
the same helper. Guarded by the e2e test "F-008: the group picker excludes saved formats".

---

### F-009 — The "By player" lens shows exactly the same thing as "Overall"  [P2] [continue]

**Screen:** `/home/stats` · `src/app/home/stats/page.tsx:109,182`
**Violates:** north star — a control that promises a view and delivers none

Comparing the captures, `stats-overall` and `stats-by-player` are **byte-identical
apart from the active tab**. The `player` lens appears exactly twice in the file: once
to render its button, and once as `lens !== 'player'` to *hide* the Settle-up section.

So a golfer taps "By player" expecting a per-player view and gets the same list with
**less** information. It's the only lens that adds nothing.

What it plausibly should be — a lens for *one* player: pick a golfer, see their
per-game history (which of the 5 games they played, what they won or lost in each),
their record, and their running total. That data already exists in
`GameLedger.playerNets`; nothing new needs computing.

**Options**
- **A. Make it a real per-player drill-down.** Player selector + their game-by-game
  history. Uses data already present; the genuinely useful version.
- **B. Drop the lens.** Three lenses that each do something beats four where one is a
  decoy. Smallest change, immediate clarity win.
- **C. Rename to "Totals"** and let it be "standings without the settlement noise."
  Honest about what it is, but still nearly a duplicate.

**DECIDED (2026-08-12) — and Craig reframed it past all three options.**

"By player" isn't a fourth peer lens; the current tabs conflate two independent axes —
*whose* money, and *what slice* of games:

|  | **Everyone** | **Just me** |
|---|---|---|
| **All games** | ~~today's "Overall"~~ → **removed** (leaks cross-group money) | my total + per-group breakdown |
| **One group** | every member's money *from that group's games* | my total in that group |
| **One game** | today's "By game" | my result in that game |

**Scope of the change:**
- **Overall becomes option B** — the viewer's own total plus a per-group breakdown of
  their own money ("+$65 — Warriors +$80, Tuesday −$15"). No other player's cross-group
  money appears anywhere.
- **Field-wide money only exists INSIDE a group.** That's the privacy rule: money is
  private to the group that played for it (`DECISIONS.md` §5h).
- **Today's Overall is removed as-is** because it shows every player's money across
  every game the viewer can load — a Warriors organizer currently sees Tuesday Crew
  results for anyone in both groups.
- Non-money stats (scoring average, handicap trend) may stay global.

Feasible: `getRosterPlayerByGhin()` maps the logged-in GHIN to a roster player, and
`GameLedger.playerNets` is already keyed by `playerId` — no new computation.

**Caveat to carry:** this is a DISPLAY rule while RLS is open (`DECISIONS.md` §5c), so
it's a courtesy boundary, not enforced. It must become a real policy when RLS lands.

**Edge case needing a fallback:** an organizer who isn't a player in their own games has
no matching roster GHIN, so "just me" would be empty for them. Needs a graceful state.

**Status: BUILT + VERIFIED (2026-08-12).**

- `myMoney()` / `myGameHistory()` in `stats-ledger.ts` — 9 compute tests covering the
  privacy boundary in both directions.
- Lenses are now **My money / By group / By game**. The old cross-group "Overall" and the
  duplicate "By player" are gone.
- Field-wide money and settle-up exist **only** inside a group view.
- Graceful state when the viewer's GHIN matches no roster player.
- Two e2e guards: My money shows the viewer across groups and nobody else; a group view
  shows every member scoped to that group.

Fixture note: the seeded roster had no player carrying `SANDBOX_GHIN`, so the lens fell
back to its "couldn't match your GHIN" state — the graceful path working, but it meant the
interesting view was never exercised. `rp1` is now the organizer.

---

### F-010 — A 61-member group is an unsearchable wall of 61 "Remove" buttons  [P2] [continue]

**Screen:** `/home/groups/[id]` at 61 members ·
`e2e/screenshots/phone-group-large.png` (the phone capture is **5,249px tall**)
**Violates:** north star — this is the reuse mechanism that makes "config is a
one-time cost" true, and it collapses at real size

**Observed.** Rendered with a realistic 61-member roster (Craig's actual Weekend
Warriors size), the page is one flat `members.map()` — 61 cards, each with a full-width
`Remove`. On a 390px phone that's a **5,249px scroll**, roughly 13 screens.

Consequences at this size:
- **No search or filter over members.** There's a search box for *adding* players, but
  none for the 61 already in the group. Finding "Rick Tanaka" means scrolling.
- **`Remove` appears 61 times** and is the only action, so the dominant visual element
  of the group page is a column of destructive buttons.
- **No confirmation on remove** — one mis-tap while scrolling silently drops a member.
- Everything below the list (Add players, full roster manager) is 13 screens down.
- The genuinely useful things — *who plays most*, *our last 10 games*, *money* — aren't
  here at all. The Money link is a single line at the top.

This is exactly what the 61-member fixture was built to expose. At 4–8 members the
page is fine, which is why it has never looked broken.

**Options**
- **A. Search + collapse the list.** A filter box over members, and show ~10 with
  "Show all 61". Smallest change, fixes the scroll and the find-a-member problem.
- **B. Demote `Remove` behind an Edit mode.** The default view becomes read-only
  (name + index, maybe games played); `Remove` only appears once you tap Edit. Removes
  61 destructive buttons from the default view — matches the read-only-vs-mutating line
  established in F-004.
- **C. Make the page about the GROUP, not the member list.** Lead with what a group is
  for: recent games, money, formats, "start a round". Members become a collapsed
  section. Most aligned with the north star; largest change.
- **D. Leave it.** Fine at 8 members; only breaks at scale.

**DECIDED (2026-08-12): option C — make it a group dashboard.** Plus a confirmation on
Remove.

> *"make it a group dashboard, and also remove should ask for confirmation"*

So the page leads with what a group is FOR, and the member list stops being the page:

1. **Start a round** — the primary action (already there, keep it prominent)
2. **Recent games** — the group's last N games with their results
3. **Money** — the group-scoped ledger (which, per `DECISIONS.md` §5h, is the ONLY
   place field-wide money appears)
4. **Formats** — the group's saved games
5. **Members (61)** — a COLLAPSED section, expandable, with a search box once expanded
6. **Remove** — behind the expanded section, and it must confirm

Notes for whoever builds it:
- Members are currently one flat `members.map()` (`home/groups/[id]/page.tsx:290`)
  producing 61 cards with 61 full-width destructive buttons. That inverts entirely.
- The search box that exists today searches the roster for players to ADD; the
  61 already in the group have no filter. Expanded members need their own.
- This composes with **F-009**: "recent games" and "money" are the same group-scoped
  ledger data, so build the two together rather than twice.

**Status: BUILT + VERIFIED (2026-08-12).**

**Phone height: 5,249px → 1,562px** with a full season of games loaded (851px without).

The page now leads with what a group is for:
1. **Start something** — casual round / multi-round event
2. **Money** — top 5 with a "Full ledger →" drill-down. This is the group-scoped
   field-wide money the F-009 privacy rule permits here and nowhere else.
3. **Recent games** — last 5, each tappable through to the game
4. **Game formats**
5. **Members (61)** — collapsed to a summary line ("61 players — tap to view or edit",
   with the first four names), expanding to a **searchable** list
6. **Remove** — inside the expanded list, and it now **confirms**, naming the group and
   noting past games and money are unaffected

Two e2e guards: the dashboard leads and members are collapsed (asserting height < 2000px
and fewer than 5 `Remove` buttons on screen, down from 61); and members expand with a
working search.

Fixture note: the 61-member scenario originally seeded no games, so Money and Recent games
correctly rendered nothing — which made the new page look unfinished. It now seeds the
season too.

---

### F-011 — Mid-round pot board wasn't zero-sum (un-started leg)  [P1 MONEY] [track]

**Where:** `src/lib/pool-game.ts` `buildLeg()`
**Status: FIXED + VERIFIED (2026-08-12)** — same diagnosis as F-007, from Craig again:

> *"i mean technically, everyone is tied on the back nine though, right?"*

Yes. Before any team tees off on the back nine, all teams are tied at zero holes, so
that leg is a **dead heat**: the sub-pot splits evenly and each team gets its own ante
back, netting zero on the leg. `buildLeg` instead filtered to `eligible` (teams with
`thru > 0`) and passed `[]` when nobody qualified, leaving the sub-pot undistributed
while every team's `entryPaid` was already deducted in full.

Symptom, thru 6 holes of a $200 pool: front/overall/junk each paid their $50, back paid
$0, and the two teams netted +$50 and −$100 — a **$50 phantom loss** on the board a
golfer reads at the turn.

`settleNassau` (`game-modes/types.ts:258`) already had this exact logic, with a comment
saying "a segment nobody has played yet is a dead heat." The pool was the inconsistent
one.

**The distinction that matters:** *nobody* started the leg → everyone's tied. *Some*
started it → only they contend. A team still on the front nine can't be tied for the
back-nine pot, so `eligible` still governs once play begins. Both cases are tested.

Also aligned `place`: an un-started leg now shows every team as jointly 1st rather than
unplaced, since place must agree with payout.

**Guarded by 3 tests:** un-started leg splits evenly and is zero-sum · once any team
starts, only they contend (the other is `place: 0`, payout 0) · **zero-sum asserted at
thru 1, 3, 6, 9, 12, 15, 18.**

**Both money bugs found this session came from the same mistake** — treating "no
eligible winner" as "pay nobody" instead of "everybody ties." Worth watching for
elsewhere.

---

### F-012 — The order-dependent one-ball payout has a live TWIN in the 2v2 engine  [P1 MONEY] [track]

**Where:** `src/lib/game-modes/team-game.ts:151` (`sideNet`), reachable via
`src/app/pool/[id]/page.tsx:858` (`assignSide`) and the same file's `indMode` settings branch
**Violates:** DECISIONS.md §5.ac — one ball means one score

**Found while scoping the N-sides work**, by re-probing the closed pool-side bug in the file
that pass never touched. §5.ac fixed `team-scoring.ts` (`teamNetOnHole` takes the minimum).
`team-game.ts` has its own separate one-ball read, and it still reads **"the first member with
a score"** — the exact line that was removed on the pool side.

Verified with a probe, not inferred. Scratch foursome, 2v2 scramble, `$1`/point:

```
subTeams.a = ['p1','p2']   side A total  72   money   $0
subTeams.a = ['p2','p1']   side A total 126   money -$54
```

Same scores. Same game. A $54 swing from the ORDER of two ids in an array.

**Two reachable paths, both through the hub:**

1. **The side buttons reorder the array on a no-op tap.** `assignSide` filters the id out and
   `push`es it, so tapping the side a player is *already on* moves them to the end of the list.
   Nothing on screen changes. The payout does.
2. **A scored 2v2 game can still be switched to scramble.** `lockOneBall` (`page.tsx:826`)
   guards only the *pool* format picker at 1023-1035. The `indMode` branch returns at ~975,
   before that code — so `ModeSettingsEditor` renders the mode's own `format` select, scramble
   and alternate-shot included, with no guard at all.

**This is the same interaction failure §5.ac recorded**, one file over: two changes shipped in
one pass, and the second undid the first's guarantee. The pool got the fix and the prevention;
the 2v2 engine got neither, because the audit line said "still open — N sides" and nobody
re-probed the money.

**Fix (Craig's call 2026-08-14, applying the rule already decided in §5.ac rather than making
a new one):** take the minimum in `sideNet` as the structural backstop, and close both doors —
`assignSide` must not reorder, and `lockOneBall` must cover the 2v2 format select. Pinned by
all 24 permutations of a foursome × both one-ball formats, asserting neither the side total nor
the money moves; restoring the first-member read must fail.

**Sequencing note:** this lands BEFORE the N-sides pin, not after. Step 1 of the widening is
"pin current 2v2 results" — and pinning the current one-ball result would pin this bug, forcing
the fix to unpin it one commit later.

**Status: FIXED + VERIFIED.** Status line was stale — corrected 2026-08-18 after checking the
code rather than trusting the log. All three parts are in: `sideNet` takes the minimum
(`team-game.ts:223`), `assignSide` returns early on a no-op tap (`pool/[id]/page.tsx:913`), and
`lockModeOption` covers the 2v2 format select. Pinned by `two-side-golden.test.ts` and guarded by
two e2e assertions ("a scored 2v2 game cannot switch to a one-ball format", "re-tapping a side a
player is already on changes nothing on screen").

---

### F-014 — The wizard shows "Side C/D/E/F name" boxes for a two-side game  [P2] [start]

**Where:** `src/lib/game-modes/team-game.ts` SETTINGS (six `side*Name` keys, none with a
`showIf`), rendered by `src/app/pool/new/page.tsx` step 1
**Violates:** north star — *minimum exposed complexity* — and `DECISIONS.md` §5.d/§5.e

**Introduced by the N-sides work, 2026-08-17.** Found by counting the mode's settings, not by
reading the code:

```
side mode settings:        26 total
always visible (no showIf): 10
of those, side name boxes:   4   <- "Side C name" .. "Side F name"
```

The HUB hides the unused ones — it passes `unusedSideNameKeys(sides.length)` to the settings
editor, because by then the game's side count is known. **The WIZARD cannot**, because mode
options are shown on step 1, before the sides step has run, so it hard-codes
`unusedSideNameKeys(2)`... which hides C–F. That part is right.

**The problem is what remains visible even so:** a plain 2v2 setup screen shows Team format, Hole
score, Compare by, Money, Side A name, Side B name — six controls before any money field — where
before this branch it showed the same six. So the wizard may be *unchanged* for the common case
and the real exposure may be in the HUB after a third side is added. **This needs measuring on
screen before it's called a defect**, which is why it's filed as an observation rather than a
confirmed regression.

**What to measure (next session):**
1. Screenshot wizard step 1 for a 2v2 on a phone viewport, on this branch and on `main`. Count
   visible controls in each.
2. Same for the hub's settings panel at two sides and at three.
3. Check whether `unusedSideNameKeys(2)` in the wizard is ever wrong — i.e. can a user reach a
   3-side game whose C name box was never offered? (Sides are chosen on a later step, so probably
   yes, and the name is then only settable from the hub. Is that acceptable or confusing?)

**Options**
- **A. Move side names out of the generic settings bag** into the Sides editor itself, one field
  per side that exists. Names would then always match the side count, on every screen, and four
  keys leave the schema. Costs a bespoke control, which `AGENTS.md` calls a design smell — though
  the Sides editor is already bespoke.
- **B. Collapse names behind a disclosure** ("Name the sides") that's closed by default. Cheapest;
  keeps the generic renderer. Doesn't fix the wizard/hub asymmetry.
- **C. Drop custom side names above two sides.** Sides 3+ are named after their players
  ("Craig & Jym +1"), which is already the default. Removes four settings outright. Cuts a
  capability nobody has asked for.
- **D. Leave it**, if the measurement shows the common case is unchanged.

**Recommendation:** measure first (steps 1–3), then **A** if the asymmetry is real, **D** if it
isn't. Do not fix on sight — this is the exact kind of change that should be justified by a
screenshot.

#### MEASURED 2026-08-17 (`e2e/nsides-audit.spec.ts`, phone 390×844)

The suspicion was right about *where*, and wrong about *what*. The wizard is fine; the exposure
is in the hub — but in the **read-only summary**, not the editor the finding pointed at.

```
wizard step 1, plain 2v2   6 mode controls (Team format, Hole score, Compare by,
                           Money, Side A name, Side B name)          <- C-F correctly hidden
hub EDITOR, 2 sides        Side A name, Side B name                  <- correctly hidden
hub SUMMARY, 2 sides       Side A .. Side F name, four of them blank <- DEFECT (see F-015)
```

Ordinary-2v2 walk, empty state → playing: **13 taps**, and every screen's controls counted in
`audit-01`..`audit-10`. Nothing about it is worse than a two-side-only app would be — the
`showIf` + `hideKeys` machinery does its job on the two screens that were wired for it.

**Step 3 answered — yes, and it's confusing.** A 3-side game built in the wizard is never
offered "Side C name" *anywhere*: step 1 hard-codes `unusedSideNameKeys(2)` and the sides step
(where the third side is added) has no name fields. Verified by driving it — after adding side C
and going Back to step 1, the box is still absent. The name is settable only from the hub
afterwards, and nothing says so.

**Verdict: option D for the wizard** (measurement shows the common case is unchanged), plus
**option A** for the naming asymmetry — see F-015, which is the same root cause on a third
surface and is the one worth fixing.

**Status: FIXED + VERIFIED (2026-08-18).** D for the wizard's step 1 (measurement showed it wasn't
a defect), A for the naming model.

All **six** keys left the schema, not just C–F: a static schema cannot express "one field per side
that exists", which is the root cause rather than the count. Names now live on `GameSide.name`,
edited via a shared `SideNames` component used by both the wizard's Sides step and the hub — one
control, so the two can't drift, which is precisely how the settings-bag version went wrong.

**Collapsed by default.** Almost nobody names their sides and the board already reads "Craig &
Jym", so it's a disclosure, not a field. It opens itself when a side already has a name, so an
existing game's names are never hidden from whoever is editing them. Placeholders show what the
board *will* say if left blank, making the consequence of typing nothing visible.

**Compatibility with no migration:** `sidesOfGame` absorbs the legacy `side<Letter>Name` settings
into each side's own name at the read boundary (`hydrateLegacyNames`). Saved games and saved
formats both keep their names. `saveSides` strips the legacy keys on write, and a side's own name
wins even when explicitly `''` — otherwise clearing a name would resurrect the migrated value on
next load.

Measured effect: wizard step 1 went from 20 controls to **18**, and the Sides step shows **zero**
name fields until asked. Closes the step-3 gap — a wizard-built 3-side game can now name side C.

Guarded by 5 unit tests on the read path plus rewritten e2e assertions, including one that drives
a legacy-shaped game end to end and asserts its names survive on both the board and in the editor.

*Note: unit count went 1310 → 1296. That's the all-modes sweep generating one case per setting ×
size; removing 6 settings removes 18 generated cases whose only claim was "the engine survives a
text value in a name field". No coverage was lost.*

---

### F-016 — A leg is settled on unequal hole counts, so a side is PAID for walking in  [P1 MONEY] [track]

**Where:** `src/lib/game-modes/team-game.ts:352` (`legLine`) → `payLeg` at :466
**Screen:** `/pool/[id]/leaderboard`, 3-side seed · `e2e/screenshots/audit-13-leaderboard-3side.png`
**Violates:** `DECISIONS.md` §5.af — the rule that a side must not profit from playing fewer holes

**Found by reading a screenshot, then confirmed by probe.** The seeded 3-side board reads:

```
Back 9    3 of 9 holes    Craig & Jym by 6
```

Six *what*, over three holes, against sides that played nine? `legThru` counts holes where
**every** side has posted, but `legToPar` accumulates on every hole a side **individually**
played. So the leg margin compares one side's 9 holes against another's 3 — and `payLeg` pays
whoever that comparison names.

**Reproduced (`src/test/probe-leg-unequal.test.ts`), scratch players, `legs` money:**

```
front: all three sides level par            -> dead heat, isolates the back
back:  A and B play all 9 at +1  (= +9)
       C plays only holes 10-12 at level par (= 0)

BACK LEG:  "C by 9"   winner = c   thru 3
MONEY:     C +$60,  A −$30,  B −$30
```

**C collected $60 for playing three holes of the nine.** Zero-sum still holds, which is exactly
why the existing tests are green — the money balances, it's just pointed at the wrong side.

**Not introduced by this branch.** `main` compares raw leg totals (`legMetric`) and fails the
same way at two sides: the probe's two-side control gives `"B by 9" → B +$30 / A −$30`. The
N-sides work generalized the *comparison* faithfully, including the flaw. §5.af fixed this for
the **standings** (rank on to-par, show thru); the **leg lines** never got the same treatment —
one axis drifting from the other, the shape `AGENTS.md` warns about.

**Why it matters in the real day:** this is the ordinary "Tony's knee went at 13, we walked in"
case, on the default money model. It pays the guy who quit.

**Options**
- **A. A leg only counts holes every side in it has played.** Accumulate `legToPar` on contested
  holes only (the same gate `legThru` already uses). Then "3 of 9 holes · C by 0" is a comparison
  over the same three holes, and the margin is honest. Cost: a side that plays a hole its
  opponents haven't gets no credit for it until they catch up — which is what "contested" means
  everywhere else in this engine.
- **B. Normalize to a per-hole rate** (to-par per contested hole). Handles ragged cards, but
  invents a unit no golfer uses and would print fractional margins.
- **C. Void a leg nobody finished** — no winner, no money, unless every side played every hole
  of it. Simplest and safest; costs the mid-round leg board, which would read "–" until the
  ninth hole is in.
- **D. Leave it** and accept that a walk-in distorts the legs.

**Recommendation:** **A** — it makes the leg line mean what it says, matches the contested-hole
rule the rest of the engine already uses, and is the minimum change that stops the payout. Worth
noting it changes money for *mid-round and abandoned* games only: at equal thru counts A is
identical to today, so no completed game moves. **This is a math change — Craig's call before
anything is touched (`AGENTS.md`).**

**Status: FIXED + VERIFIED (2026-08-18), both halves.** DECISIONS.md §5.ai.

**F-016 — the comparison.** `contestedToPar` accumulates past the gate `legThru` already used, so
every side's leg figure covers the same holes. The standings deliberately keep reading each side's
own holes ("thru 12, +2" is correct on a tournament board); only the head-to-head comparison needs
like-for-like. On screen: "Back 9 · 3 of 9 holes · **by 3**" (was "by 6"), Overall "by 8" over 12
holes (was "by 14").

**F-016b — whether a short leg pays.** Craig rejected a per-group setting in favour of asking at
close-out: *"if someone clicks finish game, and all legs are not complete, it should prompt the
user."* New `PoolGame.voidedLegs`, stored because it records a **judgement** — recomputing from
hole counts would silently move a settled game's money if a late score arrived. Per leg, so a
completed front still pays while a short back voids. On the walk-in seed: +$80/−$40/−$40 becomes
+$20/−$10/−$10, exactly the front nine, still zero-sum.

Scope verified rather than assumed: leg lines feed money only in the `legs` model, so the prompt
appears only there — asking in a pot game would be a question with no consequence.

**Two defects only the screenshot showed:** two "Close out game" buttons on screen at once (the
second read as a way to skip the question), and a closed-out game saying nothing about why its
money shrank. Both fixed — the hub and board now say "pays nothing — unfinished" with the leg
struck through, and a voided leg still shows its margin because those holes were played.

Guarded by `src/test/voided-legs.test.ts` (19), `leg-unequal-thru.test.ts` (6), and three e2e
assertions including the untick-and-it-pays-normally path.

---

### F-017 — `legs` money pays nothing when the top two sides tie, however far behind the third is  [P2 MONEY] [track]

**Where:** `src/lib/game-modes/team-game.ts:367` — `winner = leaders.length === 1 ? … : null`
**Violates:** `DECISIONS.md` §5.ae (pairwise round-robin: "the losing team would owe all teams
ahead of them")

At two sides a tied leg paying nobody is correct and uncontroversial. At three it means a side
that lost to *both* opponents pays nothing, because the two ahead of it happened to tie:

```
three sides, all 18 holes played, `legs` money (the DEFAULT model)
A level par, B level par, C +18 on every leg

legs money:       A $0    B $0    C  $0     <- C is 18 over and pays nothing
per-point money:  A +$18  B +$18  C −$36    <- same cards, round-robin
pot money:        A +$10  B +$10  C −$20    <- same cards, pot
```

The other two money models both charge C. `legs` is the one that doesn't, and it's the default.
§5.ae's rule — you owe everyone ahead of you — is implemented for `per-hole` and `per-point` (via
`settleRoundRobin`) and for `pot` (via `distributePot`), but `payLeg` is winner-take-all with a
single winner, so any tie at the top voids the whole leg for everybody.

**This is a design question, not obviously a bug** — "nobody wins the front, so the front is a
push" is a defensible rule a group might actually play, and it's what two-side games have always
done. But it's inconsistent with the other three models on the same screen, and the inconsistency
only shows up at 3+ sides.

**Options**
- **A. Split the leg among tied leaders, collected from everyone behind.** A and B take half the
  leg each from C. Consistent with §5.ae and with `pot`'s tie rule ("first and second split first
  place money"), which is already Craig's stated preference for ties.
- **B. Settle legs pairwise like the other models** — each side pays each side ahead of it that
  leg's dollars. Most consistent of all; changes the meaning of "the leg is worth $10" from a
  fixed prize to a per-opponent rate, which is what `payLeg` *already* does for a clear winner
  (winner collects $10 from **each** other side).
- **C. Leave it** — a tied leg is a push, as it always has been at two sides.

**Recommendation:** **B**, because `payLeg` is already per-opponent for the win case, so ties are
the only place the model isn't pairwise — but this is money arithmetic with more than one
defensible answer, so it's **Craig's call**. Note **C is genuinely fine** if he'd rather not touch
settled math; no completed two-side game is affected by any of the three.

**Status: CHOSEN 2026-08-18 — option B, pairwise (DECISIONS.md §5.aj).** Craig: *"i think they
would owe both based on the settings we are making. IF it was a pot split situation, it would be
different, no?"* — so the tie rule follows the **kind** of money model: `legs`/`per-hole`/
`per-point` are per-opponent stakes (lose to two sides, owe two sides), `pot` is a divided prize
and keeps splitting (§5.ag, unchanged). He accepted knowingly, asked twice, that a tie at the top
costs last place more than a clean defeat ($20 vs $10 on a $10 leg).

**Status: FIXED + VERIFIED (2026-08-18).** `TeamLegLine` gained `leaders: string[]` — every side
tied at the top. Money reads that; `winner` stays single-valued for display (colouring keys on it,
and it's null on a tie). **At one leader the new rule is arithmetically identical to the old code**,
which is what makes it safe: two sides still pay $40/−$40 on a clear win and push on a tie.

Blast radius, verified because he asked directly about pot pools: the only snapshot lines that
moved are the three money figures in the `F-017 (SHOULD MOVE)` block. The classic 4-foursome pool,
the side game's pot mode and Wolf are byte-identical. `payLeg` has its call sites only in the
`legs` branch; `computePoolResult` never reaches it.

Guarded by three tests in `sides.test.ts` plus the golden pin, including one asserting the
accepted trade-off (a tie at the top costs last place $80 where a clean defeat costs $40).

**One mutation SURVIVED and is worth knowing about:** removing the `behind === 0` guard changes
nothing, because with every side leading `dollars * behind` is already 0. The guard is kept for
intent and now commented as defensive, so it isn't mistaken for the thing that makes dead heats
push — that's the arithmetic.

---

### F-018 — The wizard's review step never mentions the sides, on a game that is about sides  [P2] [start]

**Where:** `src/app/pool/new/page.tsx:2936` (`CreateStep`) — renders "Foursomes" and a player
list; no side block for `team-within-group`
**Screen:** `e2e/screenshots/audit-20-review-three-sides.png` (3 sides), `audit-09-review.png` (2)
**Violates:** `UI_CONVENTIONS.md` §2 (say what the game actually is)

The last screen before money changes hands, for a three-side game, reads in full:

```
Review & create
Sides (within group)
Three Sides From Scratch
Players 6 · Group size 4–8 · Foursomes
Group   CHcp 60
Craig Blue 4 | Jym Blue 12 | Dave Blue 8 | Rick Blue 16 | Sam Blue 6 | Tony Blue 14
```

Not a word about **sides**: not how many, not who's on which, not what the money terms are. The
step you just came from was the one where you split six players into three sides, and the review
shows them as one undifferentiated list under the heading "Foursomes". A 2-side game is equally
silent. The step indicator says "Sides"; the step itself doesn't.

**Why it matters:** "confirm before it's real" is the whole job of a review step, and the thing
most likely to be wrong (who's paired with whom) is the one thing it doesn't show. This also
hides F-014's naming gap: nothing here reveals that side C has no name.

**Options**
- **A. Add a sides block** — one row per side with its members and its display name, plus the
  money line (`$10 front / $10 back / $20 overall`, or `Buy-in $20 per side`). Mirrors what the
  hub summary shows, so create and view agree.
- **B. Reuse the leaderboard's side rows** read-only, so there's one renderer for "here are the
  sides" across wizard, hub and board.
- **C. Just relabel "Foursomes" → "Sides" and group the player list by side.** Cheapest honest
  improvement; no new money copy.
- **D. Leave it** — the sides step is one tap back.

**Recommendation:** **C** as the floor (the current label is simply wrong for this mode), **A** if
Craig wants the review step to earn its name. Not a money change either way.

**Status: FIXED + VERIFIED (2026-08-18) — option A.** One row per side with its members, their
course handicaps, and the side's display name resolved by the **same function the leaderboard
uses**, so the review can't promise a label the board won't use. Plus the stakes in a sentence.

The stakes line says **who pays whom**, not just the numbers, because at 3+ sides that isn't
obvious: each leg is collected from every side behind (§5.aj), so a $10 front nine is $10 *per
opponent*. Under `pot` it also states that the ante is per side whatever its size (§5.ag).

Composes with §5.al as expected — the "Foursomes" label is simply wrong for this mode and is gone
from the side-game path (the classic pool keeps it).

**A pre-existing bug the screenshot caught:** the heading rendered as literally `Review &amp;
create`. It's a JS *string* rather than JSX text, so the entity wasn't decoded — invisible in the
code, obvious on screen. The two `Next: Review &amp; Create` button labels nearby are real JSX
text and were correct, which is exactly why it survived review.

---

### F-019 — A side game has no PLAYING GROUPS, so it can't express a real day of golf  [P1] [start]

**Where:** `src/app/pool/[id]/page.tsx:~529` (the wizard/hub build ONE `PoolTeam` for a side game),
surfacing on `teams/page.tsx`, `scorecards/page.tsx`, and anywhere `teeTime` is shown
**Screens:** `e2e/screenshots/audit-25-teams-page-3side.png`, `audit-27-scorecards-3side.png`
**Violates:** north star — *starting* a game, and "more possibilities than any other app"

**Craig, 2026-08-20, and he's right:**

> "so typically you play golf in foursomes. In some cases it would be threesomes, maybe a random
> person included. Shouldnt we break down the teams sheet by tee time/teams?"

I had filed this as a labelling problem on one printable sheet. It isn't. **The app conflates two
independent things**, and the side axis only models one of them:

| | What it is | Lives on | Example |
|---|---|---|---|
| **Playing group** | Who walks together — one tee slot, one scorecard, 3 or 4 players | `PoolTeam` (+ `teeTime`, `matchupId`) | 4 + 4, or 3 + 4 with a random |
| **Side** | Who your MONEY is with | `GameSide` | Craig & Jym vs Dave & Rick |

They are **independent**: your best-ball partner can be in the other foursome. That's how a
two-foursome 2v2 works, and the classic pool axis already models playing groups correctly (N
foursomes, each with its own tee time and card).

**The side axis throws that away.** A side game creates exactly one `PoolTeam` holding everybody,
because that's how the engine gets its single matchup (`context.ts:25` — `game.teams[0].matchupId`).
Consequences, all verified on screen:

```
6-player side game, Teams sheet:   one box "Group", 6 names sorted by HANDICAP,
                                   footer "6 players · 1 foursome"
Scorecards page:                   "1 foursome", ONE card with every player on it
Tee times:                         exactly one, for what is really two groups
At playersMax 8:                   "1 foursome" containing EIGHT players
```

Eight players in a foursome is not a display bug; it's the model saying something impossible. And
the sheet sorted by handicap actively misinforms — it looks like a pairing and isn't one.

**Craig's decision (2026-08-20): the two axes are INDEPENDENT.** A side game gains real playing
groups — own tee time, own scorecard, 3–4 players — chosen separately from the sides. Partners in
different groups must be allowed, because that's the common case.

#### Design (approved 2026-08-20; NOT built — build next session)

**1. Storage.** Reuse `PoolTeam` as the playing group; it already carries `teeTime`, `matchupId`
and `captainId`. A side game today has one, so *nothing existing changes shape* — it's the same
"absent means today's behaviour" pattern as `voidedLegs`, `sides` and `teamFormat`.

**2. Scoring is the real work.** `buildGameModeContext` takes `game.teams[0].matchupId` and filters
`ctx.players` to that one team. With N groups it must read **across every matchup** — the union of
all groups' scores — while the SIDES stay the money grouping. The classic pool already reads N
matchups (`computePoolResult`), so the pattern exists; it just isn't wired into the side path.
Only two callers to change (`result.ts:23`, `pool/[id]/page.tsx:2724`).

**3. UI.** The wizard needs a "who's in which group" step for a side game (the pool's
`TeamsStep` already does exactly this — reuse, don't rebuild). Teams sheet and Scorecards then
render groups with their tee times, and the sides get their own block. Support **3-player groups**
explicitly, and a guest/random who's in a group but on nobody's side.

**4. What must not move.** Every existing side game has one group and must settle identically —
pin it first, as with F-016/F-017.

**Correction (2026-08-20), after actually reading the call sites.** I first wrote that
`isSingleGroupGame()` (7 call sites) was "the riskiest part" because a side game might no longer be
one group. That was wrong on both counts and shouldn't be carried into the build:

- **The side leaderboard already handles N groups.** `leaderboard/page.tsx:64,78` maps over *every*
  `matchupId` and fetches them all. It never assumed one.
- **The three `isSingleGroupGame` branches ask the right question already.** They mean "does this
  game have per-player/side standings, or classic team-vs-team standings?" — a question about the
  MONEY model, which this change doesn't touch. A side game wants the side leaderboard whether it
  tees off in one group or two.

The one-group assumption is **12 lines in one function**: `context.ts:25–32` takes
`game.teams[0].matchupId` and filters `ctx.players` to that team's members. Everything downstream
already operates on whatever player set it's handed. So the engine change is small and local; the
real work is the UI (a group-assignment step, and the two sheets).

**Why P1 rather than P2:** it isn't wrong money, but it blocks the ordinary real-world case — eight
guys, two tee times, playing sides — which is exactly the game this mode was widened for. And the
sheets that misinform are the ones sent to people who aren't holding the phone.

**5. Group formation — Craig's answers, 2026-08-20.** Both open questions from the session prompt:

> "groups would theoretically be balanced, but if 5 players then we would need to figure out if it
> is a 1 v 1 v 1 v 1 v 1 situation, or a 3 v 2, or something else. but that could be manually
> adjusted."

- **Auto-balance by default, manually adjustable.** Same as the pool's team builder, so there's one
  mental model for "the app proposes, you adjust".
- **An uneven count is a QUESTION, not a silent default.** Today `defaultSubTeams`
  (`pool-game.ts:1303`) special-cases exactly 4 and otherwise alternates low/high — so 5 players
  silently become 3 v 2, with nothing on screen saying a choice was made. At 5 the honest options
  are 3v2, 2v2 + a solo, or five singles, and only the group knows which.

The second half of his answer is a bigger idea and became **F-020** — the player count should
*recommend* games rather than reject them after the fact.

**Status:** **BUILT and verified 2026-08-26.** Seven commits on `ui-consistency-and-compute-tests`;
`npm run verify` green (1371 unit tests, 99 e2e). What shipped, and how it differed from the design:

| Piece | Notes |
|---|---|
| Pins first | `one-group-golden.test.ts`, 34 cases. 33 byte-identical after the change; the 1 that moved is labelled SHOULD MOVE |
| `groupShapesFor(N)` | The shared helper F-020 also needs. Plus `dealBalancedIntoShape` — see below |
| Engine | `context.ts` unions every group's players+scores; explicit `matchupId` still scopes to one |
| Leaderboard grid | `teamDetails[0]` → all groups |
| Scorecard side totals | Was computing from its own group only |
| Wizard | New **Groups** step for a side game over 4 players; 4 or fewer unchanged |
| Teams sheet | Sides block + side on each name; "foursome" only when a group holds four |
| Mid-round 5th | Prompt, default keep, scores carried (§5.ap) |

**Three things the design got wrong, all found by doing it:**

1. **This was a MONEY bug, not a labelling bug.** Filed as sheets that misinform. At 8 players the
   board settled four sides ±$84 off **four** players' cards — each side's group-2 partner silently
   missing, "The Hogs 68" being Craig alone. Two tee times + sides = wrong money, today.

2. **"Most of the work is UI: the Teams sheet and Scorecards"** — no. Both already iterate
   `game.teams`, so both were correct the moment the data had two groups. The design named as "most
   of the work" the part that needed nothing.

3. **The engine was NOT the only non-UI work.** Two more one-group assumptions the sweep found and
   the design didn't list: `leaderboard/page.tsx:864` (`teamDetails[0]`, so the grid showed 4 names
   under a board settling 8) and `play/page.tsx:331` (side totals from one matchup, so the card and
   the board disagreed — reintroducing exactly what §5.ah exists to prevent).

**Also: don't reuse `TeamsStep`.** The design said reuse it, don't rebuild. It asks the same
question but is built around the pool: captains panel (a side game has no captain role), three
build methods with an optimizer, pairing locks, "Set Teams" vocabulary throughout — the team/side
conflation this finding is about. Reuse meant threading a mode flag through ~10 labels and hiding
three panels. The genuine reuse was of the pure helpers. **"Reuse the component" and "reuse the
logic" are different instructions**; when a component's shape encodes the other axis's
assumptions, take the logic.

**And the screenshot caught what the tests could not.** The first group proposal dealt round-robin,
so group 1 took every odd-ranked player: handicaps 2+6+10+14 = 32 vs 4+8+12+16 = 40. Every
assertion passed — right sizes, right shape, nobody unassigned — and the thing labelled "balanced
by handicap" was 8 strokes out. Fixed with `dealBalancedIntoShape` (a snake deal), extracted as a
tested pure function. **A proposal can be structurally valid and still wrong about the only thing
it promises.**

---

### F-021 — A saved format answers 15 questions, then the wizard asks them anyway  [P1] [start]

**Where:** `src/app/pool/new/page.tsx` step 1 (`DetailsStep`)
**Screens:** `e2e/screenshots/ww-formats-listed.png`, `ww-format-picker.png`, `ww-wizard-prefilled.png`
**Violates:** north star — *starting* a game; and §5.e ("a group's saved setup turns questions into
confirmations")

**Craig, 2026-08-27:** *"weekend warriors should be able to choose their saved format easily if they
arent trying something new, one tap"*

**The good news, measured.** That path already works, and needed no app code — only a fixture
(§5.aw). From the group page:

```
tap 1   Casual round          -> picker lists the group's 3 formats
tap 2   Saturday Nassau       -> wizard, correctly pre-filled:
                                 Sides / Match - best ball - stroke - total
                                 $10 front / $10 back / $20 overall
                                 off the low - course handicap - 100%
```

**The defect.** Having answered ~15 questions, the format lands you on a screen that **still shows
all of them**: 21 controls, 15 labels, 1906px of scroll. Every value is right and every question is
still asked. The pre-fill is invisible as a *saving* — it reads as a form someone else filled in,
which you now have to check.

§5.e called for the opposite: *"a group's saved setup turns questions into confirmations (summary
line + [Change])"*. That is the piece that was never built, and it is what makes the difference
between "one tap" and "one tap, then verify 15 fields".

**What it should be.** When a format is applied, step 1 collapses to what §5.e describes:

```
Saturday Nassau                                    [Change]
Sides - best ball - $10/$10/$20 - off the low
                                    [Next: Course ->]
```

Everything stays configurable behind `[Change]`; nothing is hidden, and the taps only get spent by
someone actually changing something.

**Why P1:** it's the difference between the reuse machinery paying off and merely existing. Three
sessions of work (the Format Library, `formatIds`, the group picker) all terminate in a screen that
discards their value.

**Composes with:**
- **§5.av** — the wizard's own game picker should list saved formats, for a game not started from a
  group. Same collapse applies once chosen.
- **§5.au** — the reorder (field first, money after teams). Still right, but F-021 lowers its
  urgency: a collapsed step 1 is 2 controls whatever the order, and most rounds never expand it.

**Status:** **BUILT and verified 2026-08-28** (§5.ax). `npm run verify` green — 1481 unit tests, 116
e2e. Measured on the Weekend Warriors path:

| | before | after |
|---|---|---|
| visible controls | 24 | **10** |
| visible labels | 15 | **2** |
| page height | 2080px | **844px** (no scroll to reach Next) |

Built as §5.ax specified: money-relevant summary, per-section `[Change]`, editable title that forks
a new style, original never rewritten. A from-scratch game is untouched (test).

**Two defects only the screenshot showed**, both mine and both instructive:
1. **Two name inputs bound to the same value** — the summary's title duplicated the "What should we
   call it?" field.
2. **The sections didn't close at all.** `useState(!appliedFormat)` reads the prop on the FIRST
   render, but the format seed is consumed in a mount effect in the parent — so every section
   initialised open and the panel closed nothing. The counts said 24 controls while the summary sat
   right there looking correct. **A derived initial value can't be seeded from a prop that arrives
   later**; track the user's action ("opened by hand") and derive visibility from it.

**And the pure function caught a money bug on its first run:** skins reported "$1 a point", because
the draft defaulted `moneyModel` to `per-point` for individual modes so skins never reached its own
branch. A confident sentence about the wrong currency — which is precisely why the summary is tested
separately from the screen (§5.ar).

---

### F-020 — The player count validates games instead of recommending them  [P2] [start]

**Where:** `src/app/pool/new/page.tsx:915` (the mode description), `:3115` (the review-step
warning), and `defaultSubTeams` (`pool-game.ts:1303`)
**Violates:** north star — *maximum possibility, minimum exposed complexity*; and "starting a game
as easy as possible"

**Craig, 2026-08-20**, extending the F-019 discussion:

> "The point is with x amount of players, certain games or modes would be either recommended or
> make the team splitting as easy as possible"

**The inversion.** Every mode already declares `playersMin`/`playersMax`. Today those are used
**only to scold**, and only at the end:

```
step 1 (game picker)  "Played within a single group of 4–8."     <- fine print, before you
                                                                    know the field
step 6 (review)       "Wolf is played in a single group of 4–4
                       players — you have 5. Go back to Field."  <- five steps too late
```

You choose the game **before** the field, so the app knows the constraint and says nothing useful,
then blocks you after you've done the work. It has the data to help and uses it to refuse.

Current mode ranges, for reference:

```
skins / quota / stableford / low-total   2–4
nines                                    3–4
wolf                                     4 only
sides (within group)                     4–8
classic pool                             any (foursomes)
```

**Second half: an uneven count silently picks for you.** `defaultSubTeams` special-cases exactly 4
(1&4 vs 2&3 — the balanced split) and otherwise alternates low/high into two sides. So 5 players
become **3 v 2** with nothing on screen saying a choice was made, when the group might have wanted
2v2 with a solo, or five singles. Craig: *"we would need to figure out if it is a 1 v 1 v 1 v 1 v 1
situation, or a 3 v 2, or something else. but that could be manually adjusted."*

**Options**
- **A. Count-first: ask "how many are playing?" before the game.** Then the picker only offers what
  fits, ranked by fit. Cleanest fit with the north star — the impossible options never appear.
  Cost: reorders the wizard (game ← → field), the most-touched screen, and the count isn't always
  known up front ("someone might join at the turn").
- **B. Keep the order; annotate the picker live.** Once the field exists, each game shows fit
  ("✓ 6 players", "needs exactly 4"), with unfittable games disabled and explained. Coming back to
  step 1 after building the field is already a normal move. Cheapest change that removes the
  late-refusal.
- **C. Recommend at the split step only.** Leave the picker alone; when sides are formed, propose
  the sensible splits for that count and let the group choose. Fixes the silent 3v2 but not the
  "Wolf needs 4" surprise.
- **D. Both B and C.** They solve different halves: B stops you picking a game that can't work, C
  stops the app quietly choosing your teams.

**Recommendation:** **D**, built as two small pieces (B then C), each shippable alone. Explicitly
**not A** — reordering the wizard is a bigger bet on the count being known early, and
`WIZARD_REDESIGN.md` §8 already warns that the 44-game sample is one organizer's habits, not
evidence about everyone.

**Design notes for whoever builds it**
- Fit is derivable from the registry — no new per-mode data needed beyond what
  `playersMin`/`playersMax` already say. A mode that wants finer advice ("best with an even count")
  can gain one optional field rather than a switch statement.
- The **split proposals** belong next to `defaultSubTeams` as a pure function returning candidate
  shapes for N (e.g. 5 → `[3,2]`, `[2,2,1]`, `[1,1,1,1,1]`), so the rule is unit-tested and both
  the wizard and the hub can offer the same choices.
- Composes with **F-019**: playing groups also need proposing for odd counts (5 → 3 + 2 tee slots),
  and that's the same "shapes for N" helper.

**Status:** **BUILT and verified 2026-08-27.** Two commits; `npm run verify` green (1385 unit
tests, 107 e2e). Option D, both halves:

| Piece | Where | Notes |
|---|---|---|
| The fit rule | `game-modes/fit.ts` | Pure, 14 tests, mutation-proved. One rule so every screen agrees |
| **B** picker annotates | `pool/new` step 1 | Live badge per game; misfit explained *there*, with an alternative |
| **C** sides propose | `SubTeamsStep` | `groupShapesFor(n, SIDE_SHAPE_OPTS)` — 3 v 2 / 2 v 2 v 1 / five singles |

**What the range is measured against — Craig's call, 2026-08-26: the WHOLE FIELD.** F-019 had made
`playersMin`/`playersMax` ambiguous (`types.ts` said "per group", true only while a single-group
game had one group). Wolf's "4 only" means four players in the game, however they walk. It's the
only reading available at the moment of choosing, since the game is picked before the tee sheet.

**Two strings F-019 had falsified, now gone.** The picker claimed a side game is "Played within a
single group of 4–8"; the review step said "is played in a single group of 4–4 players". Both
described a shape the app can no longer guarantee. **A capability change dates every string that
described the old limit** — worth grepping for the old claim, not just the old word.

**Not disabled, deliberately.** A misfitting game is explained, not blocked: the organizer may be
about to add the fifth player. The old review-step warning didn't block either — so "validates
instead of recommends" was generous. It scolded *and* let you through.

**Two defects a screenshot caught and no test did** (the fifth and sixth this run — see §5.ar):

1. **"Wolf — 1 too many" at five players.** Arithmetic right, sentence wrong: Wolf needs exactly
   four, so from three the fix is *adding* one. A fixed requirement now states the requirement.
2. **A pre-existing bug the new control exposed.** The sides heading hard-coded `(2 vs 2)` for any
   two-side game — true while two sides meant two pairs, false the moment an uneven split was
   reachable. Five players seeded 3–2 read "Sides (2 vs 2)" directly above a highlighted "3 v 2"
   button. **Adding a control that makes a state reachable turns a latent lie into a visible one.**

**One thing worth knowing for later:** four players DO get the split choice (2v2, 2+1+1, four
singles are all real), unlike tee groups where four can only walk one way. That asymmetry is pinned
by a test, because the tempting simplification is to copy the Groups step's rule.

**Screen:** `/pool/[id]/leaderboard`, 2-player skins w/ Nassau ·
`e2e/screenshots/skins-2p.png`
**Violates:** `UI_CONVENTIONS.md` §2 (say what the game actually is — consistent
vocabulary)

**Observed:** On a *completed* 18-hole round the Nassau board shows:

```
Front 9   $10 pot · thru 9      All tied · splits
Back 9    $10 pot · thru 9      ← the back nine is finished, not stopped at 9
Total     $20 pot · thru 18
```

`settleNassau` sets `thru` to *holes played within the segment*
(`game-modes/types.ts:257`), which is correct as data. But "thru" everywhere else
in the app means a **hole number** — including the header on this very screen
("thru hole 18").

**Why it matters:** a golfer reads "Back 9 · thru 9" as the back nine having
stalled at hole 9. It's money display, so ambiguity reads as a bug.

**Options**
- **A. Convert to a hole number per segment.** Back nine 9-of-9 → "thru 18".
  Matches the header's vocabulary exactly. Cost: `NassauLegLine.thru` becomes a
  hole number, so the not-started check (`thru === 0`) needs care.
- **B. Relabel as a count.** "9 of 9 holes". Unambiguous, no data change.
  Slightly wordier on a phone.
- **C. Leave it.** Data is right and the pot amounts are unambiguous.

**Recommendation:** B — smallest change, removes the collision, and doesn't risk
the not-started logic that keeps the board zero-sum.

**Status: ALREADY FIXED (option B) — verified on screen 2026-08-19.** Also closes `DECISIONS.md`
§7 q7, which was this same item logged twice.

The status line was stale, like F-012's and F-008's. `NassauPayoutBoard` already renders
`${leg.thru} of ${segmentHoles(...)} holes`, and the seeded 2-player skins board reads:

```
Front 9   $10 pot · 9 of 9 holes    All tied · splits
Back 9    $10 pot · 9 of 9 holes    All tied · splits
Total     $20 pot · 18 of 18 holes  All tied · splits
```

Craig independently chose the same option the code had taken, and for the reason the code took it:
no data change, so the `thru === 0` not-started guard that keeps the board zero-sum is untouched.
Both axes now word it identically (`leaderboard/page.tsx:1054` and `:1129`).

**Third stale status found this session.** Worth a process note: statuses in this file are written
when a fix is *proposed*, and three of them were never updated when the fix landed. Checking the
code (or better, the screen) before starting work has now saved three redundant implementations.

---

### F-024 — The per-person money list can sum to +$4 on screen (rounding half-dollars apart)  [P2 MONEY] [track]

**Screen:** `/pool/[id]/leaderboard` per-person strip · `e2e/screenshots/walk-21-hub-mid-round.png`
**Where:** `pool/[id]/leaderboard/page.tsx:35` — `money()` = `Math.round` then `Math.abs`
**Violates:** "Assert money is zero-sum" (the invariant every compute test pins); "Would a golfer
trust this number?"

**Observed:** the seeded 2-foursome pool mid-round shows `Craig: +$13 · Jym: +$13 · Dave: +$13 ·
Rick: +$13 · Sam: −$12 · Tony: −$12 · Will: −$12 · Gary: −$12` — which sums to **+$4**. The engine
is exactly zero-sum (±$12.50 per person); the display rounds +12.5 up to 13 and −12.5 up to −12
(`Math.round` rounds .5 toward +∞ on both signs, and this game splits $50 pots across 4 players, so
half-dollars are the COMMON case, not an edge). Anyone in the group who adds the column concludes
the app lost four dollars.

**Options**
- **A. Round the magnitude, not the signed value:** `Math.round(Math.abs(n))` — +12.5 → $13 and
  −12.5 → $13, symmetric, sums to zero whenever the underlying numbers do. One character-level
  change in one shared helper; winners and losers both read $13.
- **B. Show cents when the value isn't whole:** `$12.50`. Always exact, but violates the "whole
  dollars in game UI" convention and adds noise to every line for one case.
- **C. Leave it** — the settlement ledger (which has cents) is the accounting surface.

**Recommendation:** **A** — it keeps the whole-dollar convention and restores the visible zero-sum.
Check the same helper pattern anywhere else `Math.round` touches signed money (grep
`Math.round` in display paths); the scorecard PER PERSON block on the light theme shows the same
+$13/−$12 pairing in the walk-22 text dump, so it shares the bug via its own formatter.

**Status:** FIXED 2026-09-09 per option A — `money()` on the pool leaderboard, both tournament
Per-Person strips (`scoreboard`, `side-games/scoreboard`) and the tournament money page all round
the magnitude (`Math.round(Math.abs(n))`). UI_CONVENTIONS §1 updated with the rule. E2e: the
Per-Person strip sums to zero on the seeded mid-round pool (`F-024` test in verify-fixes).

---

### F-025 — A skins game's review step says "Foursomes", names the group "Group", and totals a meaningless combined handicap  [P2] [start]

**Screen:** `/pool/new` review step, skins, 4 players · `e2e/screenshots/walk-09-game-hub-after-create.png`
**Where:** `app/pool/new/page.tsx:3864-3866` — `!isWithinGroupReview` gates the "Foursomes" block,
so INDIVIDUAL games (skins, Wolf, quota…) fall into the classic-pool rendering
**Violates:** §5.al (never print "foursome" for a single-group game); UI_CONVENTIONS §2

**Observed:** the last screen before Create, on a 4-player skins game, shows a section headed
**Foursomes** containing a card named **Group** with **CHcp 40** — the players' combined course
handicap, a number that means something for pool team balance and nothing at all in skins. F-018
fixed exactly this for `team-within-group` games (the review now shows sides), but the fix's guard
is `isWithinGroupReview`, so `individual` games kept the classic-pool block. Same class as the
audit's root finding: one axis fixed, the other left behind.

**Options**
- **A. For individual games, reuse F-018's treatment:** head the section "Players", drop the
  combined CHcp (show each player's own, which the card already does), keep the group card only
  when several playing groups exist (then it's tee times, worth confirming — F-019).
- **B. Reuse `gameListSubtitle`'s vocabulary** (§5.az's new helper): "Group · 4 players". Smaller,
  but leaves the meaningless combined handicap on screen.
- **C. Leave it** — the information is technically true.

**Recommendation:** **A** — F-018 already decided what a review step owes the user ("confirming
who's playing is the whole job of a review step"); this is the same decision applied to the axis
it missed.

**Status:** FIXED 2026-09-09 per option A — individual games now get their own review block:
section reads "Players", each player shows their own course handicap (no combined CHcp), and a
per-group card appears only when several playing groups exist. Classic pool keeps "Foursomes"
untouched (`!isWithinGroupReview && !isIndividual`). E2e: `F-025` test walks the wizard to a
skins review and asserts no Foursomes/CHcp.

---

### F-026 — The review step shows NO stakes for an individual game — the one thing every player asks  [P2 MONEY] [start]

**Screen:** `/pool/new` review step, skins · `e2e/screenshots/walk-08-wizard-after-next-money.png`
**Violates:** F-018's own principle (the review must confirm what the game is ABOUT); north star
("track" starts with knowing what you're playing for)

**Observed:** for the classic pool the review step asks the money questions right there (buy-in,
pot split, who gets paid). For an individual game the money lives in step 1's mode settings
(skin value etc. — correct per F-021's confirmation design), but the review step then shows
**Players / This game needs / [player list] / Create Game** — no dollar figure anywhere. The final
"is this right?" screen omits the one number the group standing on the first tee wants confirmed.
`formatSummaryLine` (`game-modes/summary.ts`) already produces exactly this string — it's shown on
step 1 and then never again.

**Options**
- **A. Render `formatSummaryLine` on the review step** for individual/within-group games — one
  line under the game name ("Skins · $1 a skin · full handicap"). Reuses the tested summary; no
  new state.
- **B. Repeat the full mode-settings block on review.** Complete, but re-creates the 21-control
  problem F-021 just removed.
- **C. Leave it** — the user set the stakes one step ago.

**Recommendation:** **A** — one already-tested line, and it also gives §5.ax part 4 (offer to
"Save this format" at review) the natural place to live: summary line + save button together.

**Status:** FIXED 2026-09-09 per option A — `formatSummaryLine` renders under the game name on
the review step for individual/within-group games ("Skins · $1 a skin · full handicap"), with a
"Save this format" button beside it (§5.ax part 4 closed: saves the current wizard settings to
the Format Library via the same GroupDefaults shape as `formatFromGame`). E2e: `F-026` test
asserts the stakes line and the save button.

---

### F-027 — My-groups page: handicaps render but names are blank (LIVE app)  [P2] [continue]

**Observation (Craig, 2026-09-10, live app):** on `/home/groups/[id]` "i just see handicaps,
i can tell they are people, but i dont see names."

**Diagnosis (code-level, read-only — live DB not queried):**

The page CANNOT lose the name on its own. Member rows resolve via `getRosterPlayerById`
and render `m.name` and `m.handicapIndex` from the SAME `RosterPlayer` object
(`home/groups/[id]/page.tsx:428-430`). The hydration mapping is `name: row.name`
(`roster.ts:59`) — the column is literally `name`, so there is no snake/camel seam to miss.
Suspect (a) (name and handicap from different sources) and suspect (c) (mapping miss) are
therefore ruled out by inspection.

That leaves **(b): live roster rows with an empty or whitespace `name`**, and there is a
plausible writer. `upsertRosterPlayer` never validates `name`, and two GHIN-add paths build
it WITHOUT trimming:

- `pool/new/page.tsx:2013` — `` `${golfer.first_name} ${golfer.last_name}` `` (no trim)
- `pool/[id]/page.tsx:2329` — same (no trim)
- (`pool/roster/page.tsx:123` DOES trim — the inconsistency is the tell)

If GHIN ever returns empty/undefined name fields (e.g. a privacy-restricted golfer, or a
partial API response), those paths write `"undefined undefined"`, `" "`, or `""` to the
roster row — and the schema allows it (`name TEXT NOT NULL` accepts `''`). A group member
pointing at such a row shows EXACTLY the symptom: the row renders (id resolves), the index
shows, the name is visually blank. Note `refreshRosterHandicaps` re-upserts `{...player}`
on every 24h auto-refresh, so a once-blank name self-perpetuates.

**To confirm (needs Craig or a read-only query):** in Supabase, run
`select id, name, ghin_number from players where name is null or trim(name) = '';`
— or Craig can open his group and say which members are blank; if they were added via
GHIN search on a day GHIN was flaky, that's the writer.

**Options**
- **A. Defensive read + fix the writers.** Trim at every name construction site, have
  `upsertRosterPlayer` refuse to overwrite an existing non-empty name with an empty one,
  and render a fallback on the page (`name || 'GHIN #1234567'`) so a bad row is visible
  and identifiable instead of blank. Plus a one-time backfill of the affected rows (needs
  Craig — touches live data).
- **B. Backfill only.** Fix the rows by hand; leave the writers. Symptom returns next time
  GHIN hiccups.
- **C. Wait for confirmation first** — query the live table before building anything.

**Recommendation:** **C then A** — confirm the empty-name rows exist (one read-only query),
then fix writers + fallback in one pass, with the backfill as a separate Craig-approved step.

**Status:** CODE-FIXED 2026-09-10 per option A, writers-first on Craig's call ("fix writers
now, query later"). The two GHIN-add writers build the name with filter/join/trim + a
`GHIN #…` fallback; `upsertRosterPlayer` refuses to blank a non-empty stored name
(`resolveUpsertName`, unit-tested); the group page renders `rosterDisplayName` so a
pre-fix live row shows `GHIN #…` instead of a blank card (e2e `F-027` blanks a seeded
row and asserts the fallback). LIVE QUERY RUN 2026-09-10 (Craig authorized, read-only,
via `supabase db query --linked`): **zero blank-name rows** — 83 players, min trimmed
name length 8, no 'undefined' substrings. NO BACKFILL NEEDED; the defensive code stays
(it prevents the write path that would create them). One separate anomaly found:
"Friday Group" carries a dangling member id (`d09d8260-…`) pointing at a deleted
players row — renders "Unknown player" on /pool/roster and is counted as "N members no
longer on your roster" on the group page. Craig clarified the surface he saw was
/pool/roster's Groups box; with the live data clean, the blank-name symptom there is
not reproducible from current rows — if it recurs, a screenshot pins it.

---

### F-028 — Stableford: per-hole points aren't shown  [P2] [track]

**Report:** "Stableford show points by hole."
**Triage (code):** the engine already computes them — `stableford.ts:72-85` fills
`perHole` per player. So this is a DISPLAY gap, not a compute gap; the scorecard/
leaderboard hole grid presumably shows gross strokes only. NEEDS A SCREEN LOOK to
confirm what renders where before proposing (leaderboard Player Details vs scorecard).

**Status:** open — verify on screen, then options.

**Verified 2026-09-10** (`e2e/screenshots/f028-scorecard-phone.png`,
`f028-leaderboard-phone.png`; new sandbox scenario `stableford-ind-partial`): confirmed
on both surfaces. The scorecard grid shows gross strokes only (color-coded vs par); the
leaderboard's PLAYER DETAILS grid also shows GROSS per hole (with stroke dots), plus
Gross/Net totals — the points a player earned on a hole appear NOWHERE, only the summed
`pts` in standings. The engine's `perHole` (points) is computed and dropped on the floor
by both grids.

**Options**
- **A. Leaderboard Player Details: show points per hole instead of gross when the mode's
  metric is points** (Stableford/quota/Nines already fill `perHole` with points — the
  grid is just rendering gross). Gross stays on the scorecard. One surface, mode-aware.
- **B. Add a second row per player (gross above, pts below) in Player Details.** Both
  visible, but doubles the grid height on a phone.
- **C. Scorecard: small points chip next to the entered gross** (e.g. "4 ³pts"). Puts it
  where scoring happens, but crowds the entry grid.

**Recommendation:** A — the leaderboard is the "how am I doing" surface; showing gross
twice is redundant there. C could follow if the friend wants it at entry time.

**BUILT 2026-09-10** (opt A, Craig's pick; commit e2788c4): the individual details grid
renders the engine's perHole points whenever the game's metric is points (keyed off the
metric, so quota/Nines/Wolf get it too); Out/In sum points, Gross/Net totals stay, panel
header says "pts per hole". e2e `F-028` asserts Out == standings pts.

---

### F-029 — Stroke dots too faint on the scorecard  [P3] [track]

**Report:** "Make the dots brighter showing where strokes are given."
**Triage:** cosmetic and plausible — the card is read in sunlight (UI_CONVENTIONS §5's
phone-in-sunlight bar). Check current dot rendering + contrast on the dark card, and
that any change keeps dots matching the money engine (`getMoneyStrokesOnHole`).

**Status:** open.

**Verified 2026-09-10** (`f028-scorecard-phone.png`, `f028-leaderboard-phone.png`):
confirmed, and the worst case is the DARK leaderboard: dots there are 8px
`text-blue-400` superscript on the navy card (leaderboard/page.tsx:444,458,1283,1290)
— at 8px a "dot" is barely a pixel cluster, and blue-400-on-dark-navy is low contrast.
The score-entry cards use `text-orange-600` at xs on white (game/play/page.tsx:976,
1034,1210,1269) — better, but still small. All render from the engine's strokes
(`getMoneyStrokesOnHole` / `detail.holes[].strokes`), so a pure CSS change can't
desync money — keep it CSS-only.

**Options**
- **A. Bump size + contrast, keep the dot glyph:** dark card → `text-[11px]
  text-sky-300` (or amber-300); white card → keep orange-600, raise to text-sm.
  Smallest change; dots stay dots.
- **B. Replace superscript dots with a filled corner marker per cell** (like paper
  cards: a diagonal-corner tick). Most legible in sunlight, but a real markup change
  across two grids × two axes.
- **C. Leave the card, fix only the dark leaderboard.** Friend said "scorecard,"
  but the faintest render is the board — verify with him which screen he meant.

**Recommendation:** A on both surfaces (one class per call site, six call sites,
zero logic).

**BUILT 2026-09-10** (opt A, Craig's pick; commit 8018429): dark board 8px blue-400 →
11px sky-300 (4 sites); play page orange dots xs → sm (incl. the purple negative-stroke
circles). CSS-only. e2e `F-029` ×2.

---

### F-032 — No payout recap moment at Finish  [P2 MONEY] [continue]

**Report:** "Need a 'summary' type view after you click 'finish' — player A owes
player C x, player B owes player D y. No Venmo, nothing crazy."
**Triage:** the math exists — per-person money renders on the leaderboard, and
`settleUp()` (`stats-ledger.ts:322`) already computes greedy who-owes-whom transfers.
What's missing is the MOMENT: close-out (`pool/[id]/page.tsx` CloseOutPanel) flips
status and… check what it shows after. This is squarely the north star's "continuing"
pillar (money is the question groups argue about later). Likely shape: a settle-up
recap on/after close-out reusing `settleUp` per-game.

**Status:** open — strong candidate, needs Craig's shape pick (where the recap lives).

**Verified 2026-09-10** (`f032-after-closeout-phone.png`, `f032-leaderboard-complete-
phone.png`; new sandbox scenario `stableford-ind-complete`): confirmed exactly as
reported. Tapping "Close out game" flips the panel to "Game closed out — Final — this
game now counts in Stats & money. Reopen it if a score needs fixing." and that's the
entire moment — no money shown, no navigation offered. The completed game's leaderboard
shows each player's NET $ (+$24 / +$20 / −$8 / −$36) but never who pays whom; the only
settle-up view is buried in /home/stats, season-scoped, behind an organizer login.

**Options** (all reuse `settleUp()` per-game — no new math; §2 stop-and-ask on display)
- **A. Recap appears IN the close-out panel the moment the game closes** — the
  "Game closed out" box grows a "Who pays whom" list (Rick pays Craig $24, …), also
  rendered any time the game is viewed while completed. No new screen, lives at the
  exact moment the group is standing in the parking lot.
- **B. Recap section on the completed game's LEADERBOARD** (below STANDINGS) — the
  board is where everyone already looks; hub stays terse. Same list, different home.
- **C. Both: one-line summary in the close-out panel + full transfers on the board.**
- **D. A dedicated /pool/{id}/settle screen linked from both.** A bespoke screen for
  one list — the design smell §1 warns about.

**Recommendation:** A (or C if the board should show it too). "No Venmo, nothing
crazy" — a text list of transfers is exactly `settleUp()`'s output shape.

**BUILT 2026-09-10** (opt A, Craig's pick; commit e038fff): the close-out panel grows a
"Who pays whom" list the moment the game closes and on every later view; share-link
guests get the same list as its own section. New `gameRollups()` (stats-ledger) reduces
one game to per-player rollups → `settleUp()`. Unit tests pin zero-sum + full-settlement
+ per-person divide, each proven able to fail (§5.z). e2e `F-032` incl. reopen-removes-it.

---

### F-035 — The wizard's GROUPS step shows raw floating-point handicaps (16 decimals)  [P2] [start]

**Where:** `app/pool/new/page.tsx:2829` — the playing-groups step renders
`hcapOf(player)` (line 2709: unrounded `getPoolPlayingHandicap`) straight into JSX
**Reported:** Craig, 2026-09-10 — "the handicaps are not just 1 decimal. it's like 16
decimals, which I'm not sure how that's possible."

**Diagnosis (code inspection):** `getPoolPlayingHandicap` is deliberately unrounded
(§5.bb: allowance applies to the unrounded CH; callers round once). Every other wizard
step obeys that contract — the tee step (line 2625), the teams step (line 3311), and the
sides step (line 3463) all `Math.round(...)` before display. The Groups step (F-019's
playing-groups screen, shown for a >4-player side game) is the one consumer that
forgot: it renders the raw float, and with Friday Group's 90% allowance a 14.3 index
becomes e.g. `12.870000000000003`. Classic one-axis-drift: each screen individually
fine, wrong only by comparison. Display-only — the math underneath is correct.

**Fix shape (when asked):** `Math.round(hcapOf(...))` at line 2829, matching its three
sibling steps; e2e-assert no `.` longer than 1 decimal on that screen.

**Status:** FIXED 2026-09-14 (5028c54) — `Math.round` at the render site, matching the sibling steps.

---

### F-036 — Reshaping to MORE sides than exist mints DUPLICATE side ids: A, B, C, C  [P1 MONEY] [start]

**Where:** `app/pool/new/page.tsx:3457` — `applySideShape`:
`id: effective[i]?.id ?? nextSideId(effective.slice(0, i))`
**Reported:** Craig, 2026-09-10 — "in sides game, it lists sides for a 2v2v2v2 game as
A B C and then C again."

**Diagnosis (code inspection, arithmetic confirmed):** when the field starts on the
default TWO sides (`a`,`b`) and the organizer picks a 4-side shape (8 players → 2v2v2v2),
the builder derives each new side's id from a slice of the **old** sides array:
- i=2 → `nextSideId([a,b])` → `'c'` ✓
- i=3 → `nextSideId(effective.slice(0,3))` — but `effective` has only 2 entries, so the
  slice is still `[a,b]` → `'c'` **again**.

Every side added beyond `old count + 1` in a single reshape repeats the same id. The
slice needed is of the NEW list being built, not the old one.

**Why P1 MONEY, not P2 display:** side ids are identity (the file's own comment: "the
ids are identity, not position… re-lettering would silently relabel money rows").
With two sides both `'c'`: `assign()` adds a tapped player to BOTH (its map matches
`side.id === sideId`) — one player on two sides is exactly the impossible data §5.ac
says to prevent; `sideMembers`/`sideOfPlayer` resolve only the first; pairwise
settlement (§5.ae) would treat two distinct pairs as one/duplicated party. React also
gets duplicate keys (`key={side.id}`). The same `?? nextSideId(...)` idiom exists in
`addSide` (safe — appends one) and the hub's editor at `pool/[id]/page.tsx:967` (safe —
adds one at a time); only the reshape path can add ≥2 at once.

**Fix shape (when asked):** build the list incrementally so each new id sees the ids
already minted (e.g. reduce, or `nextSideId` over the accumulated result); pin with a
unit test "2 sides + [2,2,2,2] shape → ids a,b,c,d" in sides/group-shapes tests, plus
the zero-sum settlement assertion at 4 sides.

**Status:** FIXED 2026-09-14 (5028c54, Craig's "fold in quick fixes" go-ahead) — `applySideShape`
builds the list with a reduce so each new id is minted against the ids already built; e2e pins
8 players → 2v2v2v2 → sides A,B,C,D distinct.

---

### F-038 — Tee lists render in GHIN's payload order, not by distance — The Meadows reads Gold, Green, Blue, White  [P2] [start]

**Where:** `app/pool/new/page.tsx:1517-1541` — course-details parse maps `TeeSets`
straight through; men's/women's split preserves payload order; `selectedTeeId` defaults
to `teeSets[0]` whatever that is.
**Reported:** Craig, 2026-09-10 — "it lists the tees as gold, green, blue, white,
white (W), green (W). this is weird because the distances are off."

**Diagnosis (verified against the live game's stored payload — The Meadows, course
5682):** GHIN returns The Meadows' tees in the order Gold 6602y, Green 4885y, Blue
6109y, White 5622y. The parse never sorts, so the picker shows a jumble — Green (the
shortest, forward tee) second, between the tips and Blue. The DATA is right (each tee's
yardage/slope/rating match GHIN); only the ORDER is raw. Spring Creek never showed this
because GHIN happens to return its tees longest-first. `lib/tee-pick.ts:33` already
sorts by yardage for its own picking logic — display just doesn't use it. Also note
`selectedTeeId = teeSets[0]` silently defaults every game to whatever tee GHIN lists
first — at The Meadows, the tips.

**Fix shape (when asked):** sort each gender block by `totalYardage` descending at
parse time (one line, same idiom as tee-pick.ts), or at render. Belongs to the F-023
course-data audit: same lesson — payload shape/order is not uniform across courses.

**Status:** FIXED 2026-09-14 (5028c54) — tees sort longest-first per gender at parse time, so the
picker reads tips → forward and the `teeSets[0]` default is the longest men's tee, not payload
luck. NOTE: the default-tee CHOICE (tips may not be the right default either) is a fair follow-up
question for the course-data audit.

---

### F-040 — Three ways to add a player, ordered by API mechanics rather than by how people think  [P2] [start]

**Where:** the add-player stack appears on FOUR surfaces — `pool/new/page.tsx:2318`
(wizard field step), `pool/roster/page.tsx:339`, `game/new/page.tsx:567`,
`tournament/new/page.tsx:465`. All order it: **Add by GHIN # → add manually → Search
GHIN by name**.
**Reported:** Craig, 2026-09-14 (functionality walkthrough) — "the add player by ghin
number is redundant if we also have the first name, last name basis. I feel the first
name last name should be primary, and then maybe if they have some sort of csv or other
file with ghin numbers, that is a fall back if bulk adding players. But otherwise, seems
unnecessary. Also, the manually add portion should definitely show something along the
lines of 'doesn't have official ghin number' or something along those lines."

**Diagnosis (code inspection):** three findings inside the report.

1. **Ordering.** "Add by GHIN #" is the FIRST and most prominent box, but knowing a
   GHIN number cold is the rare case; knowing a name is universal. Name search arrives
   LAST and in a separate card, below manual add. The order reflects the API's history
   (GHIN-# lookup was built first) not the organizer's mental model. Name search is
   also strictly more capable: its results carry the GHIN #, handicap, and gender in
   one tap — everything the GHIN-# box returns.
2. **Nothing distinguishes a manual player as GHIN-less.** `addManual`
   (`pool/new/page.tsx:2058`) stores `ghinNumber: null` — the data knows — but the form
   says only "Or add manually" with Name/HCP fields. Nothing tells the organizer this
   creates a player OUTSIDE the handicap system: the typed HCP is static (never
   refreshes from GHIN), and the round won't feed a revision. The organizer can't tell
   "I added Dave manually" from "I added Dave's GHIN" later, either — saved-player rows
   don't show a GHIN badge (needs a screenshot pass to confirm on every surface).
3. **Bulk add doesn't exist** in any form (no CSV/paste-a-list path on any of the four
   surfaces). Craig frames GHIN-# entry as acceptable only as a bulk fallback — one
   number at a time serves neither the "I know one guy's number" case well nor the
   "here's my league's 24 numbers" case at all.

**Options**
- **A. Reorder only:** name search first (one card: First / Last / ST), manual add
  second with a "no GHIN — handicap won't update itself" note, GHIN-# entry folded
  into a small "have a GHIN #?" disclosure under name search. No behavior change.
- **B. A + a paste-a-list bulk path:** a textarea accepting GHIN numbers (comma/newline
  separated — covers CSV by copy-paste without a file-upload UI), resolving each via
  the existing `addByGhin` fetch, reporting per-number success/failure. The bulk case
  is where GHIN-# entry genuinely earns its place.
- **C. A + retire the GHIN-# box entirely** (name search covers the single-add case).
  Cheapest surface, but loses the number path for identically-named golfers and for
  the CSV-in-hand organizer Craig himself described.
- **The GHIN-less note applies under every option** — it's §5.ac honesty about what a
  manual player IS, not a preference.

**Consideration against burying GHIN-#:** GHIN name search requires the ORGANIZER to be
GHIN-logged-in AND requires last name + state; the GHIN-# box has the same login wall, so
login isn't a differentiator. The real fallback when name search fails is manual add.

**Note:** all four surfaces duplicate this stack by copy — whatever changes should land
as one shared component, or at minimum the same change four times with an e2e on each
(the audit's one-axis-drift lesson).

**Status:** BUILT 2026-09-14 (commit a35f7f9), per Craig's pick **B**. The stack was
EXTRACTED into one shared component — `src/components/add-player-panel.tsx` — used by all
four surfaces, so the copies can't drift again: name search first (results add in one tap,
grey out once added), manual add second with the "no official GHIN — the handicap won't
update itself" note, GHIN numbers behind a "Have GHIN numbers?" disclosure whose textarea
takes one number or a pasted comma/newline list with per-number added/not-found/already-added
reporting (failures stay in the box for retry). game/new and tournament/new gained name
search for the first time; game/new keeps its playersMax cap. e2e (`f040-add-player.spec.ts`)
exercises the order contract, the note, bulk paste, and name search on ALL FOUR surfaces
with the GHIN endpoints mocked via Playwright routes.

---

### F-043 — Handicap arithmetic is a black box: nowhere shows index → CH → allowance → strokes  [P2] [start]

**Where:** teams step (`pool/new/page.tsx:3311` area) shows one rounded number per player; no
surface shows the chain. Related: F-023's amber note is the ONLY place the basis is ever named.
**Reported:** Craig, 2026-09-14 — "on the teams page… no way to track the progression of the
handicaps, it never shows the raw decimal player index, course handicap, where the allowance is
applied, etc."

**Diagnosis:** the math is right and §5.bb-ordered (allowance on unrounded CH, round once), and
it's exactly the kind of number a golfer wants to VERIFY (GHIN is the reference, §5.ba). Today
verifying requires trusting the app. Fix shape: a tap/disclosure per player showing
`12.4 index → 14.8 course (slope 131) → ×85% → 12.6 → plays off 13`. One shared component,
usable on the teams step, sides step, and player-details sheet. Also the natural home for
F-023's "this tee has no rating — using index" honesty. Display-only; no math changes.

**Status:** FIXED 2026-09-14. Every handicap chip on the wizard's field list, teams step, and
sides step is now a tap-to-open disclosure showing the chain (`HandicapChip`,
`components/handicap-chain.tsx`), one line per step with the tee's slope/rating/par named.
The chain comes from `explainPlayingHandicap` (pool-game.ts), which mirrors
`getPoolPlayingHandicap` branch-for-branch and is PINNED to it by unit test across the full
matrix (`src/test/handicap-chain.test.ts`) — the explanation cannot drift from the math.
F-023's honesty folded in: the no-rating fallback, the 'index' basis, and the 9-hole
fallbacks all say so in the panel. e2e: `F-043:` in verify-fixes.spec.ts + screenshot.

---

### F-045 — Junk is on by default, and CTP shows up whether or not it's part of the game  [P2] [start]

**Where:** `DEFAULT_JUNK_VALUES` (`pool-game.ts:268`) — birdie 1, eagle 2, albatross 3, groupHug
1, ctp 1 — all nonzero from the first render of a classic pool; `JUNK_FIELDS` always lists CTP.
**Reported:** Craig, 2026-09-14 — "closest to the pin should probably not show up if it's not
being included in a bonus. And the junk bonuses should be an added bonus perhaps, not defaulted
on unless it is a saved game that someone always uses."

**Diagnosis:** the defaults encode Craig's OWN Friday game (junk built into the pot split's
fourth leg), which is right for his saved format and wrong as the app-wide default. Note the
registered modes already got this right — bonuses are OFF by default and pickable on the money
step (e2e 'bonuses are off by default'); the CLASSIC pool predates that convention. Fix shape:
classic pool defaults junk to zero/off with an "add bonuses" affordance; saved formats keep
whatever they saved (his Friday format keeps junk on). MONEY-ADJACENT: changes what a fresh
pool's pot pays — needs Craig's explicit go, plus care that the 4-way pot split (junk = a leg)
degrades sensibly when junk is $0.
**Downstream check when built:** scorecard CTP button + leaderboard junk column should follow
the game's junk config, not assume it.

**Status:** BUILT 2026-09-14 (commit e924dbe), per §5.bg. Junk starts $0/off on a fresh
classic pool behind an "Add bonuses" affordance on the money step; with junk off its pot
quarter folds into OVERALL at creation (`foldJunkIntoOverall`, front/back keep their table
weights) — the fold is the money-math guard, not UI field-hiding. Every junk/CTP surface
follows the game's config now: scorecard CTP button, pool-page CTP editor + Pot panel,
leaderboard junk breakdown (per-column) + pots list, match board junk row. Saved formats
keep their junk (JY Classic Pool restores with the grid open). Zero-sum unit tests pin the
fold and were proven FAILABLE (§5.z). Worked example (2 teams, 8 × $25): 70/70/40/20 →
70/70/60 — **Craig signed off 2026-09-14 ("makes sense — keep it"); merged to main (4c33964).**
Deeper §5.bg direction (money step as per-player/per-leg dollars that visibly add up,
splits editable by player count) is NOT built — queued in BACKLOG as its own item.

---

### F-046 — A format saved to a group still had to be fetched "from library" when starting the group's game  [P2] [needs-repro]

**Reported:** Craig, 2026-09-14 — "I saved this format, but still had to import from library.
I saved it as friday game in the friday group."

**What the code says should happen:** saved formats appear in the game picker's "Your saved
games" optgroup (§5.av, wizard:1050); a group's ATTACHED formats (`defaults.formatIds`) surface
on the group page's format picker and the §5.aw two-tap flow. Possible gaps between those and
what Craig hit: (a) "Save format" saves to the LIBRARY but does NOT attach to the group he was
thinking of — attachment is a separate step on /home/groups/[id]; (b) naming a format "Friday
game" inside the Friday group's page may not round-trip to the wizard's optgroup if hydration
raced; (c) he may have expected picking the GROUP on the field step to surface its formats right
there, and it doesn't — group defaults apply silently but attached formats aren't offered as a
choice at that moment.
**(c) is the likely real finding:** the field step knows the group; the game step lists formats
UNGROUPED by group. "Friday Group" chosen → "Friday game" should be the first thing the game
step offers, labeled as the group's usual.

**Repro (code-confirmed, 2026-09-14):** BOTH (a) and (c) are real, and together they explain
the miss end-to-end.
- (a) `SaveFormatModal` (`pool/[id]/page.tsx:632`) calls `saveFormat(...)` only — it never
  attaches the new format to `game.sourceGroupId`, even when the game was started FROM that
  group. Craig's "I saved it as friday game in the friday group" was a save to the flat
  library; the group never learned about it. Attachment exists only as a separate "+ Import
  from library" step on `/home/groups/[id]`.
- (c) the wizard game step (`DetailsStep`) lists `getFormats()` flat in one "Your saved
  games" optgroup — it receives no `sourceGroupId`, so the group chosen one step earlier
  can't surface its own formats first.

**Status:** FIXED 2026-09-14, both threads:
- (a) `SaveFormatModal` on a game with a `sourceGroupId` now offers "Attach to {group}" —
  default ON (that's what "I saved it in the friday group" means), untickable, only shown
  when the game came from a group.
- (c) the wizard game step receives `sourceGroupId` and leads the picker with the group's
  attached formats under an optgroup named "{Group} plays"; the rest of the library follows
  as "Other saved games" (deduped). No group chosen → the picker reads exactly as before.
- e2e: two `F-046:` tests walk Craig's exact repro (save from the group's game → new game →
  pick the group → its usual games lead, including the just-saved one) + screenshot.

---


### F-005 — Wizard step 1 exposes every money setting before the course is chosen  [P1] [start]

**Screen:** `/pool/new` step `details`, 390px viewport ·
`e2e/screenshots/wizard-1-details-phone.png`
**Violates:** the north star's central tension — *maximum possibility, **minimum
exposed complexity***

Craig: *"the wizard is more important since that is what people will use if i
actually can scale the app."* This is the first screen a new user sees, and the
parking-lot critical path.

**Observed.** Measured at phone width: **9 buttons + 11 inputs = 20 controls**, on
one scrolling screen, before a course is even chosen. In order: Game Name, Game,
Game Type, Entry $, Handicap Allowance %, Handicap Strokes, Handicap Basis,
Position Split, Junk Values (5 separate number inputs), Team Ball Selection.

**The decisive measurement:** every game *mode* uses `showIf` progressive
disclosure — 21 usages across `game-modes/*.ts`. The classic pool wizard, which is
**the default path**, has **zero**. So the app's own mechanism for "depth costs
nothing until asked for" is not applied to the screen that needs it most.

**Why it matters most of all the findings:** a new user's first impression is a
tax form. It asks them to decide "Position Split" and "Albatross = 3 points"
before they've picked a course. Every one of these already has a sensible default —
so a golfer who wants "the usual Saturday game" should be able to type a name and
tap Next, and never see any of it.

Also observed at 390px:
- **8 tap targets under 44px** — the six toggle pairs are 38px; Share/Cancel in the
  header are 20px. Apple's minimum is 44; Material's is 48.
- The step indicator (`Details → Course → Field → Tees → Teams → Create`) renders 6
  chips across a 390px screen, so it's cramped and can't show progress well.

**Options**
- **A. Collapse advanced settings behind "Money & handicap options".** Step 1
  becomes Game Name + Game + Game Type; everything else lives in one expandable
  section, closed by default, with a one-line summary of the current defaults
  ("$25 · off the low · winner-take-all"). Uses the pattern the modes already use.
  Cost: one more tap for organizers who *do* tune settings every time.
- **B. Move money to the last step.** Step 1 becomes purely "what game, what's it
  called"; money is decided at Create, where the team count is known (the pot-split
  hint already says it fills in from the number of teams). Better information order,
  bigger restructure.
- **C. Defaults from the group.** A game started from a saved group already carries
  its defaults — so show a summary line and a single "Change" link instead of the
  full form. Highest leverage for recurring games (the common case), but only helps
  when a group is chosen.
- **D. Leave it.** Organizers who play weekly may *want* every dial visible.

**Recommendation:** **A now, C next.** A is contained, reuses the established
pattern, and directly serves the north star. C then makes the recurring case nearly
zero-config, which is where the real "seamless" win is. B is the most correct
information architecture but the largest change — worth considering if A doesn't go
far enough.

Tap-target sizing is a separate, mechanical fix (raise toggles to 44px) and can be
done independently of which option is chosen.

**Status: PARTIALLY ADDRESSED (2026-08-11).** Craig chose to start with clarity
rather than collapsing, which turned out to be the better order — a hidden control
with a bad label is worse than a visible one.

Done so far:
- **Every option relabelled as a question** with its consequence stated in strokes or
  dollars, not in mechanism. Craig's rule: *a label must state what CHANGES for the
  players, not what the code does.*
- **USGA allowance recommendations per format**, with one-tap apply. The tables were
  already in `lib/formats.ts` but never surfaced.
- **Group picker moved to step 1** (option C, ahead of schedule) — it answers who
  plays / how we play / what we play at once, and its members auto-load on the Field
  step so the question isn't asked twice. First-timers with no groups see no picker
  at all rather than an empty dropdown.

**Money moved to its own step (option B) + tap targets, 2026-08-11.** Step 1 measured
**20 controls (9 buttons + 11 inputs)** at the start of this work; it now measures
**14 (10 buttons + 4 inputs)** — inputs down from 11 to 4. Buy-in, who-gets-paid,
bonus points and match payouts moved to the final step, renamed **"What's it worth?"**,
where the pot can finally be shown in real dollars (`8 players × $25 = $200`) because
the field and team count are known. Scoring questions (allowance, who gets strokes,
strokes exchanged) stayed on step 1 — they decide who *wins* a hole, which is a
different question from who *pays*.

Tap targets: the six toggle pairs went from 38px to 44px. Undersized elements dropped
**8 → 3**, and the remaining three are inline text links (Share, Cancel, "Use 85%"),
which are correctly not tap-targets.

**Status: F-005 ADDRESSED.** Remaining wizard work is tracked separately: the
multi-day fork, group-defaults-as-confirmations on each step, and F-006's format
ceiling.

---

### F-031 — Playing Stableford, you can't see your score to par  [P2] [track]

**Report:** "I still want to see my score to par when I'm playing Stableford."
**Triage:** the leaderboard ranks on points with PACE (§5.af/§5.am); the ask is the
PLAYER's own to-par while playing — likely a scorecard surface. Gross per hole is
entered there, so to-par is derivable with no new data. Check what the card header
shows mid-round for a Stableford game.

**Status:** open.

**Verified 2026-09-10** (`f028-scorecard-phone.png`, `f028-leaderboard-phone.png`):
partially confirmed. The scorecard's grid ALREADY shows running to-par — the Tot
column reads "24₋₇", "34ᴇ", "41₊₇" (tiny superscript, easy to miss in sunlight), and
each entry card shows "Net: 4 (E)" per hole once scored. What's genuinely missing:
the **leaderboard** in a points game shows pts/Thru/$ only — no to-par column at all,
and no GROSS to-par anywhere (the card's figure is gross-relative... verify: the Tot
superscript is gross vs par; the leaderboard has Gross and Net TOTALS in Player
Details but relative-to-par nowhere). So the friend playing Stableford and glancing
at the standings can't see anyone's to-par.

**Options**
- **A. Add a "to par" column to the individual-game STANDINGS table** (pts · thru ·
  to-par · $). One column, derivable from gross already in hand; mirrors how the
  team leaderboard already leans on score-to-par (§5.af).
- **B. Enlarge/clarify the scorecard Tot to-par** (it exists but reads as a typo-
  sized superscript). Cosmetic companion to A.
- **C. Leave it — the per-hole "Net: 4 (E)" already answers it.** But that's per
  hole, not cumulative, and vanishes as you move holes.

**Recommendation:** A (+B if Craig agrees the superscript is too subtle).

**BUILT 2026-09-10** (opt A, Craig's pick; commit d54cfe2): "To par" column (gross vs
par, strokes valence: under green / over red) in the individual STANDINGS whenever the
engine isn't already supplying its ranked to-par/PACE column. Derived from the details
grid's gross+par — no engine change. Opt B (bigger card superscript) not done — ask if
he still wants it. e2e `F-031`.

---

### F-034 — Choosing a group can "recommend" a STALE game name from the wizard draft  [P3] [start]

**Where:** `app/pool/new/page.tsx` — draft hydration (line ~255 restores `name` from
sessionStorage `WIZARD_KEY`) + `onGroupLoaded` (line ~627: `setName((prev) => prev.trim() ? prev : g.name)`)
**Reported:** Craig, 2026-09-10 — "opened a test game, chose Friday group, and it's
recommending Weekend Warriors as the name. that's weird."

**Diagnosis (code inspection, mechanism confirmed):** the wizard auto-saves every field
to a sessionStorage draft, including `name`, and restores it on mount. Loading a group
only names the game **when the name is empty** — a courtesy fill. So the sequence
"started/abandoned a game involving Weekend Warriors earlier in this tab → open a new
game → pick Friday Group" shows Weekend Warriors in the name box: it isn't a
recommendation at all, it's the previous draft's leftover, and the group load politely
declines to overwrite what looks like something you typed. The draft deliberately does
NOT restore players/step (a fresh field per game) — but `name` is restored, which is
right for "resume my setup" and wrong-looking the moment you change groups.

**Options**
- **A. When a group/format loads and the current name equals a STALE auto-fill (tracked
  the way `appliedFormat` already tracks its name), replace it with the new group's
  name.** Track "the name came from group X" in state; a hand-typed name is never touched.
- **B. Clear `name` from the draft when the wizard is opened fresh from a group page or
  /pool hub (arrival context says "new game").** Cheapest; loses "resume my half-built
  setup keeps its name" only for those entry points.
- **C. Leave it; it's a draft-resume feature.** Evidence against: Craig read it as a
  recommendation — the box gives no hint the name is left over from a previous setup.

**Status: BUILT 2026-09-15** (opt A, Craig's pick §5.bj; commit c4398a2): the wizard
tracks which name a GROUP auto-filled (`autoNamedFrom`, persisted in the draft); a
later group pick replaces a stale auto-fill — including one restored from an abandoned
draft, the reported repro — and never touches a hand-typed name. e2e `F-034` ×2.

---

### F-041 — "Stableford — 4 too many" at 8 players is FALSE as the golfer reads it: the pool plays Stableford fine  [P1] [start]

**Where:** `stableford.ts:115` (`playersMax: 4`) + the F-020 fit badge; meanwhile the classic
pool has a Strokes/Stableford toggle (`teamScoreBasis`, wizard line 1362) and every team format
(best ball, two best, combined, scramble…) at ANY field size.
**Reported:** Craig, 2026-09-14 — "Feels weird that it says we couldn't play stableford in this
case, even with 8 players… The idea of a pool is really just a side, but with 4 teams per side
[per team]… you could play best ball stableford, best 2 balls stableford, all 4 combined
stableford, etc."

**Diagnosis:** the registry's "Stableford" mode is the INDIVIDUAL single-group game (everyone
for themselves, 2–4 players). The fit badge honestly reports that mode's cap — but the golfer
reads the label as the SCORING SYSTEM, and the scoring system is available at 8 players in two
other places (pool's Stableford toggle; Sides/Match `scoring: stableford`). Same failure class
as F-037's naming half: the picker's vocabulary is mode-registry taxonomy, not golfer taxonomy.
Golfers compose a game from THREE independent axes — (1) team structure (solo / pairs / foursomes
/ N sides), (2) hole scoring (strokes / stableford / quota / match), (3) money (pot / per-leg /
per-point / skins) — and the picker presents ~10 pre-composed bundles whose names collide with
axis-2 words ("Stableford", "Skins") and axis-1 words ("Sides").

**This is the approved Team Competition engine's problem statement** (§5g,
`.claude/plans/tingly-petting-reddy.md`, memory `project_pool-team-competition-plan`: "N teams
of size K, combined Stableford etc."), plus F-037's pairings axis. The wizard-level fix short of
the engine: when a picked mode misfits, the F-020 alternative line should also say when the POOL
or SIDES can play that scoring ("8 players can play Stableford as a pool — team toggle — or as
sides"), and/or the badge should not read as refusing a scoring system the app offers.

**Status:** redirect line FIXED 2026-09-14 (misfit note now says "N players can still score
Stableford — as a team Pool… or as Sides / Match"; e2e). CORRECTION same day: the redirect
keyed on mode id `stableford` but the registry id is `stableford-ind`, so the line never
fired — caught by the (then-unverified) e2e assertion on its first real run; id fixed. DIRECTION AGREED in-session, Craig:
"a pool is effectively just a 4v4 game… choose your groups, your game style, your players, how
many teams, and go… lets think about how to simplify this" — structure-first wizard question,
modes become shortcuts; the Team Competition engine's UI framing. Record as a decision when
scope is confirmed; do NOT build the engine unprompted.

---

### F-042 — "Everyone buys in" vs "Two teams, head-to-head" answers a question the organizer hasn't been asked  [P2] [start]

**Where:** wizard `pool/new/page.tsx:1204-1231` (classic pool only).
**Reported:** Craig, 2026-09-14 — "what is the difference between two teams, head to head, and
'everyone buys in'? I'm confused here."

**Diagnosis:** `moneyMode: pot | match`. 'pot' = every player antes, pot split across
front/back/overall/junk, paid by finishing place across N foursomes. 'match' = exactly TWO
foursomes, no ante — the losing side pays fixed $ per leg + junk differential (§ memory
`pool-money-modes-and-groups`). The helper text under the toggle does explain this, but the
LABELS name payment mechanics while the real question is game structure ("is this a
tournament-style pool or one team against another?"), asked before teams even exist. The toggle
also silently changes the recommended allowance 85%↔90% (see F-043). Candidate framing: ask it
as structure ("All foursomes compete" vs "Two teams against each other"), or move it after teams
are built where "two teams" is concrete.

**Status:** label layer FIXED 2026-09-14 — toggle asks "Who competes against whom?" with
"All teams, for a pot" / "Two teams, head-to-head"; e2e asserts. The move-after-teams idea
stays open with the F-041 structure discussion.

---

### F-044 — Pot-split defaults and the 85↔90 flip look arbitrary because their reasons are invisible  [P3] [start]

**Reported:** Craig, 2026-09-14 — "the pot split seems weird. maybe that was hard coded, but
this should be saved differently. Also, when I toggle everyone-buys-in vs head-to-head, the
recommended value changes from 85% to 90%."

**Diagnosis — both are deliberate, neither says so:**
1. The pot split defaults come from `POOL_SPLIT_TABLE` (`pool-game.ts:295`) — CRAIG'S OWN
   historical splits by team count (2 teams: 70/70/40/20 … extended +$25/leg beyond 5), recorded
   as a decision. Editable per game. That he read his own table as "hard coded and weird" says
   the SOURCE is invisible ("your usual split for 2 teams" would explain itself) — and/or the
   numbers deserve a per-group saved default rather than a global table ("saved differently").
2. 85→90 is USGA: four-ball STROKE play 85%, four-ball MATCH play 90% (`usgaRec`, wizard:1005).
   The note names the format but the FLIP is unexplained at the moment it happens.

**Status:** explanation layer FIXED 2026-09-14 — pot split says "The usual split for N teams —
edit any leg"; the USGA notes name their driver ("(head-to-head)" / "(pot — two scores
counting)"). The "saved per group" idea stays open, feeds the format library.

---

<!-- ============ Sharing / login / identity audit — 2026-09-14 session ============
Walked all four personas in the sandbox (e2e/sharing-audit.spec.ts, screenshots
share-audit-01…21): owner via invite code, organizer via legacy ?key=, player via
per-game token, returning visitor with expired cookie / expired GHIN token; plus
share panels, sign-out, and the /pool/roster vs /home/groups overlap.

What WORKS well (worth protecting, not just criticizing):
- A deep link behind an expired cookie survives the gate round-trip: enter the code
  and you land on the EXACT page you were sent (share-audit-05/06). This is the
  "continuing" story doing its job.
- The player share link is genuinely one-tap: opens THIS game, Enter Scores is right
  there, no login (share-audit-12/13). F-004 scoping still holds.
- Share panel copy is clear about what each link does and doesn't open.
Sandbox limits: fake backend, no real GHIN — the expired-GHIN-token MODAL (vs the
redirect) wasn't captured; cited from code (ghin-login-modal.tsx). -->

### F-047 — "Sign Out" only signs you out of GHIN; the app stays open and remembers who you are  [P2] [continue]

**Screen:** /home → Sign Out → /pool · `share-audit-16/17/18`
**Violates:** golfer trust ("who am I" clarity); a control must do what it says

**Observed:** Sign Out (`home/page.tsx:130`, `dashboard/page.tsx:177`) does
`sessionStorage.clear()` + push to the login page — but the 48h `golf_access` cookie is
never cleared (`clearAccessCookie`, `invite-gate.ts:95`, has ZERO callers) and the
localStorage `ghin_golfer` identity mirror is never cleared either. After signing out,
navigating to /pool walks straight back into the app (probe: "AFTER SIGN OUT, /pool
GATED? NO"), still recognized as the same organizer.

**Why it matters:** on a shared or borrowed phone (a real case — a friend scores on
someone else's device), "Sign Out" promises an exit it doesn't deliver. And a user who
signs out to "log in as someone else" will find the old identity ghosting /pool.

**Options**
- **A. Make Sign Out a full exit:** clear the cookie (the function already exists) +
  both identity stores. Cost: the signer-outer must re-enter the invite code next time —
  which is exactly what "sign out" should mean.
- **B. Relabel the button "Sign out of GHIN"** and leave behavior. Honest, zero risk,
  but keeps the ghost-identity problem.
- **C. Leave it.** Everyone is in the circle of trust; nobody shares phones. (They do.)

**Recommendation:** A — one function call that's already written, and the label becomes true.

**Status:** FIXED 2026-09-14 per option A (Craig: "address these") — `logout()` on /home and
/dashboard now clears the cookie AND both identity stores (`clearGhinIdentity`); e2e
`F-047` proves the cookie is gone and /pool re-gates.

---

### F-048 — The per-game share token is never actually checked: any 24-char key opens any game  [P2] [continue]

**Screen:** `/pool/{id}?key=AAAAAAAAAAAAAAAAAAAAAAAA` (a made-up key) · `share-audit-14`
**Violates:** the feature's own claim (per-game tokens are one of the two §5c items kept in scope "really a feature")

**Observed:** the invite gate grants `pool` access to any token-SHAPED key
(`/^[A-Za-z0-9_-]{20,32}$/`, `invite-gate.ts:91`) and defers real validation to the game
page — but `shareTokenMatches` (`pool-game.ts:2394`) has **no callers anywhere in src/**.
Probe confirmed on screen: a fabricated key landed fully inside the game (screenshot 14
is the whole hub). So the minted per-game token is functionally identical to the legacy
shared constant; the "per-game" part is decorative today.

**Why it matters:** NOT re-raising F-002 (RLS stays deferred by decision). This is
narrower: the feature Craig kept in scope doesn't do the one thing that distinguishes it.
Practical effect within the trust circle is small — but revoke-by-reissue, the eventual
point of per-game tokens, can't work until something checks the token.

**Options**
- **A. Wire the existing check in the game page:** on `pool` access with a key that fails
  `shareTokenMatches`, show a friendly "this link isn't valid for this game — ask the
  organizer for a fresh one" screen. Small, contained, uses code already written.
- **B. Validate inside InviteGate.** Wrong layer — the gate would need to fetch the game.
- **C. Leave until the §5c trigger.** Defensible; but then the dead `shareTokenMatches`
  should say so, and the share panel shouldn't imply per-game scoping.

**Recommendation:** A — it's the missing half of an approved, built feature, not new security surface.

**Status:** FIXED 2026-09-14 per option A — the game page checks a present `?key=` with
`shareTokenMatches` for pool-access visitors and shows "This link isn't valid for this
game" on a mismatch; real links and keyless in-app navigation unaffected. e2e `F-048`
covers both the refusal and the real-link regression.

---

### F-050 — The invite screen explains nothing to the person it interrupts  [P3] [continue]

**Screen:** cold visit / expired cookie · `share-audit-01/03/05`
**Violates:** north star ("continuing" — a returning friend is the common case, not a stranger)

**Observed:** the gate says "Enter your invite code to continue / Ask the organizer for
your invite code" — identical for a first-timer and for the friend whose cookie expired
mid-week and who typed this same code last Tuesday. The error is a bare "Invalid code.
Try again." Nothing says the code is unchanged, that a share LINK also works, or why
access lapsed. (The redeeming half, worth keeping: after entering the code you land on
the exact URL you asked for — screenshots 05→06.)

**Options**
- **A. Returning-visitor copy:** set a harmless localStorage marker on first grant; when
  present, the gate says "Your access expired — enter the same code as before." Cheap,
  honest, no security change.
- **B. Static copy tweak only:** "Enter the invite code — the same one works every time."
  Zero mechanism, most of the value.
- **C. Leave it.** It's one field; friends figure it out (they have — grumbling).

**Recommendation:** B now (words are free), A if F-051 doesn't make expiry rare anyway.

**Status:** FIXED 2026-09-14 per option B — the gate now says "Enter the invite code —
the same one works every time." (F-051's sliding cookie makes the returner case rare,
so option A's marker wasn't built.) e2e `F-050/F-051`.

---

### F-051 — The 48h access cookie expires mid-week for a weekly game  [P2] [continue]

**Screen:** the same invite gate, hit every week · `share-audit-05`
**Violates:** north star ("continuing"); the known rough edge named in the session prompt

**Observed:** `golf_access` max-age is 48 hours (`invite-gate.ts:3`). Craig's groups play
weekly, so every player re-authenticates every single visit — the cookie effectively
never persists between rounds. Nothing refreshes it on use (the gate only reads it).

**Options**
- **A. Extend max-age to 30 days.** One constant. The invite code's security posture
  (deferred by §5c) is unchanged — the code itself never expires, so a longer cookie
  concedes nothing real.
- **B. Sliding expiry:** re-set the cookie on every gated visit, so regulars never see
  the gate and a truly lapsed visitor still ages out. Slightly more code, nicest shape.
- **C. Leave it.** 48h was presumably chosen for a reason — though no decision records one
  (grep found none; likely an unexamined default).

**Recommendation:** B — regulars never re-enter, and it composes with F-050's copy for
whoever still does.

**Status:** FIXED 2026-09-14 as A+B COMBINED — sliding expiry alone at 48h would still
lapse between weekly rounds, so the max-age is now 30 days AND the gate re-sets the
cookie on every visit (a weekly regular never re-enters; a lapsed visitor ages out after
a month). e2e `F-051` ×2 (fresh grant ≥20d out; a 2-day cookie refreshed on visit).

---

### F-052 — A legacy-link organizer who wanders past the fence is silently dumped into a blank New Game wizard  [P2] [start]

**Screen:** `?key=poolparty2026` visitor navigates to /home · `share-audit-07/08`
**Violates:** UI_CONVENTIONS §4 (say what happened, not just the absence); minimum exposed complexity

**Observed:** a `pool`-access visitor touching any non-pool route is redirected to
`/pool/new` (`invite-gate.tsx:24`) — the middle of game setup, with no message. From
their seat: "I tapped something and the app started making me build a game." The natural
home for this persona is `/pool` (My Games), which is where their link lands them and
where their login card lives.

**Options**
- **A. Redirect to `/pool` instead of `/pool/new`.** One-line change of destination;
  /pool already explains itself ("See your saved games", + New Game).
- **B. Redirect to /pool + a one-time toast** ("That page needs a full account — you have
  organizer access"). More honest, slightly more code.
- **C. Leave it.** The fence is rarely hit; organizers stay in their lane.

**Recommendation:** A — the fence should land people on a floor, not a form.

**Status:** FIXED 2026-09-14 per option A — the fence redirects to `/pool`. e2e `F-052`.

---

### F-053 — A returning user with an expired GHIN session is greeted like a stranger  [P3] [continue]

**Screen:** /home with no `ghin_token` → bounced to `/` · `share-audit-15`
**Violates:** north star ("continuing"); the "GHIN re-login prompts" rough edge

**Observed:** `/home`, `/dashboard`, and `/home/groups/*` check only token PRESENCE and
bounce to the login page, which says "Sign in with your GHIN account **to get started**."
The user's identity is sitting in localStorage (`ghin_golfer` survives everything —
F-047's flip side) but the page doesn't use it. Nothing says "your session expired";
"get started" reads as if the app lost their data. (In-game, the GhinLoginModal handles
this case well — "Your GHIN session timed out (they last ~12 hours)" — but the login
PAGE, where the /home bounce lands, has no such framing. Not capturable in the sandbox;
cited from `ghin-login-modal.tsx:51-54` and `page.tsx:55`.)

**Options**
- **A. Recognize the returner:** if `ghin_golfer` exists, the login page says "Welcome
  back, {first name} — your GHIN session expired (they last about 12 hours). Sign in to
  continue." Data's already there; copy-only + one read.
- **B. Bounce to `/` with a query flag** (`/?expired=1`) and branch copy on that. Same
  effect, no localStorage read, slightly uglier URL.
- **C. Leave it.** Logging in again works regardless.

**Recommendation:** A.

**Status:** FIXED 2026-09-14 per option A — the login page reads the durable identity and
greets a returner ("Welcome back, {first} — your GHIN session expired…"); after a real
Sign Out (F-047 clears the identity) it correctly reverts to the stranger copy. e2e `F-053`.

---

### F-054 — At phone width, the saved-players list hides every NAME and clips Remove  [P2] [start]

**Screen:** /pool/roster, 390px viewport · `share-audit-19`
**Violates:** UI_CONVENTIONS §5 (phone-first); §3 (the name IS the row's identity)

**Observed:** each saved-player row renders name + gender, index · GHIN, a tee select,
and Remove in one overflowing line: on a phone the visible row is "Index 19.2 · GHIN
2000044 [Tee: auto] R" — the NAME is pushed out of view and Remove is clipped to a
letter. The names are in the DOM (innerText shows "Abe Weiss" etc.); it's pure layout.
A 61-row list where every row is anonymous is unusable for its one job (find a person).

**Why it matters:** this is the "Full roster manager" both /home and the group pages
link to — every persona managing people lands here, on a phone.

**Options**
- **A. Two-line row:** name on its own line; index/GHIN + tee + Remove below. Standard
  phone pattern, no information loss.
- **B. Hide index/GHIN behind the row tap** and keep one line (name + tee + Remove).
- **C. Fold into F-055:** if the roster page is being reshaped anyway, fix the layout as
  part of the consolidation rather than twice.

**Recommendation:** A now if F-055 waits; C if the consolidation is imminent.

**Status:** FIXED 2026-09-14 per option A (F-055 has since landed too — the two-line row
survived the consolidation) — the row is
two lines: name + gender + Remove on top, index/GHIN + usual-tee below. e2e `F-054`
asserts the first row's name and Remove sit inside a 390px viewport.

---

### F-055 — Two parallel group-management UIs: /pool/roster's GroupsManager vs /home/groups/[id]  [P2] [start]

**Screen:** both, seeded with the same groups · `share-audit-19/20/21`
**Violates:** consistency IS ease (UI_CONVENTIONS intro); Craig 2026-09-10: "the new one should be the standard"

**Observed:** group CRUD lives on /pool/roster (create, rename, delete, membership via
dropdown + chips — screenshot 19), while /home/groups/[id] is the far better surface
(dashboard: start-something, money rollup, recent games, formats, searchable members —
screenshot 21) but CANNOT create, rename, or delete a group. So the good page depends on
the page Craig wants to retire, and three links ("Manage" on /home, "Full roster manager"
on the group page) route people back to the old UI.

**The gating constraint the consolidation must answer:** /home and /home/groups are
GHIN-login-only (`sessionStorage.ghin_token` gate) and full-access-only, while
/pool/roster is reachable at `pool` access — it's where a legacy-link organizer manages
their roster. Moving group management to /home as-is would strand that persona.

**Options**
- **A. /home/groups becomes the only group UI:** add create (on /home's "Your groups")
  and rename/delete (on the group dashboard); /pool/roster keeps saved PLAYERS only;
  rewire the three links. The `pool`-access organizer keeps players but loses group
  management — acceptable if groups are an owner concept (they are today: groups are
  Craig's).
- **B. Same as A, plus open /home/groups to `pool` access** scoped to their own groups.
  Bigger; drags /home's GHIN gate into question — starts smelling like the F-002 trigger.
- **C. Leave both, relabel** ("Saved players" vs "Groups") so at least the duplication is
  named. Cheapest, changes nothing structural.

**Recommendation:** A — matches Craig's stated direction, smallest honest scope, and the
persona question has a defensible answer. B is the accounts conversation (§5c) — STOP
there if Craig wants it.

**Status:** FIXED 2026-09-14 per option A (§5.bh): /home "Your groups" gained create
(+ New group → lands on the new dashboard), the group dashboard gained rename + delete,
/pool/roster is saved players only (GroupsManager deleted, retitled). Nothing migrated.
e2e `F-055` (create → rename → delete, and the roster page has no group manager).

---

<!-- ===== Sharing process think-through — 2026-09-14, second pass (Craig's scaling
lens: "share things easily, without causing extra bugs… doesnt get more complicated
when scaling"). Model + principles recorded as DECISIONS §5.bh. ===== -->

### F-056 — The person running a game from the legacy link can't share it  [P2] [continue]

**Screen:** game hub as a `pool`-access visitor · `share-audit-12` (note the missing Share button)
**Violates:** north star (share easily); F-004's own line — Share is not a mutation of the game

**Observed:** the hub header hides Share behind `!poolOnly` (`pool/[id]/page.tsx:351`,
alongside genuinely mutating controls). A co-organizer who creates a game via the legacy
`?key=` link therefore has NO way to send scoring links for their own game. And every
guest already HOLDS the link they arrived by — hiding the panel from them exposes
nothing, it just forces the "text me the link again" round-trip through the owner.

**Options**
- **A. Show Share to everyone in the game.** The panel re-surfaces a URL the viewer
  effectively has; mutating controls stay hidden. Simplest, no identity check, scales.
- **B. Show Share only to the game's creator** (`createdByGhin` match). Tighter, but adds
  an identity check for no real exposure difference, and a no-GHIN guest organizer gets nothing.
- **C. Leave it.** The owner remains the sharing bottleneck.

**Recommendation:** A.

**Status:** FIXED 2026-09-14 per option A — Share sits outside the `poolOnly` guard on
the game hub (Save format/Edit stay hidden). e2e `F-056` (guest opens the panel; mutating
buttons absent).

---

### F-057 — The 30-day sliding cookie applies to guests too: one tap = a month of create access  [P3] [continue]

**Screen:** any share-link visit (cookie behavior, no single screen)
**Violates:** Craig's scaling lens — breadth × duration should not grow silently (F-051 follow-up)

**Observed:** the F-051 fix set ONE `EXPIRY_SECONDS` for both cookie levels, so a
one-time scoring guest now keeps `pool` scope (including game creation at /pool/new) for
30 sliding days after one tap. Harmless in the circle of trust; quietly broad at scale.

**Options**
- **A. Level-dependent lifetime:** `full` keeps 30-day sliding (the F-051 point); `pool`
  returns to 48h. A guest loses nothing — their bookmark IS the link, and it re-grants
  instantly on every tap.
- **B. Leave both at 30 days** until the §5c trigger.

**Recommendation:** A — the asymmetry matches how each persona actually returns.

**Status:** FIXED 2026-09-14 per option A — `setAccessCookie` picks lifetime by level
(`full` 30d sliding, `pool` 48h; the gate's sliding refresh passes the level through).
e2e `F-057` (pool grant ≤48h) alongside the kept F-051 ≥20d full-grant assertion.

---

### F-058 — The share QR ships the token to a third party and dies offline  [P3] [continue]

**Screen:** both share panels · `share-audit-09/11`
**Violates:** UI_CONVENTIONS §6b (never block on the network); token hygiene at scale

**Observed:** both QR codes are `<img src="https://api.qrserver.com/...?data={link}">`
(`pool-share.tsx:14`, `pool/[id]/page.tsx:785`) — the full share URL, per-game token
included, is sent off-device just to render a picture, and the parking-lot/no-signal
case shows a broken image where the QR should be.

**Options**
- **A. Generate the QR locally** (small QR encoder rendering to SVG/canvas; one tiny
  dependency or a vendored encoder). Token never leaves the device; works offline.
- **B. Leave it** — the token gates UI only today (RLS open by §5c), so the leak is low-stakes.

**Recommendation:** A — cheap, and it removes a scaling liability before tokens mean more.

**Status:** FIXED 2026-09-14 per option A — shared `QrImage` component encodes locally
via the `qrcode` package to a data: URL; both panels use it. e2e `F-058` asserts the img
src is data:/blob and never qrserver.

---

### F-059 — "Sees everything" is keyed to the invite code, not to Craig — any code-holder is indistinguishable from the owner  [P1] [continue]

**Screen:** every listing surface (`/pool`, `/home`, stats, groups, roster) — verified probe, ~15 call sites
**Violates:** Craig's stated model ("users see the games made by themselves, and I see everyone's"); §5h (money visibility is scoped)

**Observed:** every owner check is `isOwner = getAccessLevel() === 'full'`. The scoped
path (games/groups filtered to the viewer's GHIN) exists and works — but it only applies
to share-link visitors. Friends who enter the invite code get the OWNER view: all games,
all groups, the full money ledger, and mutating controls on every game. Craig believed
identity did the scoping; it's the credential.

**Options**
- **A. Key ownership to identity (CHOSEN):** one shared helper — `isAppOwner()` = full
  access AND `getCreatorGhin()` matches the configured owner GHIN — replacing the ~15
  `getAccessLevel() === 'full'` owner checks. The invite code comes to mean MEMBER
  (keeps /home, stats, groups — scoped to their own GHIN, paths already built); Craig's
  identity is what unlocks everything. Design care: a code-holder who hasn't GHIN-logged-in
  resolves no identity — reuse /pool's "log in to see your games" prompt pattern, don't
  show a false-empty or everyone's data.
- **B. Behavioral only:** code stays Craig-only, friends use links. Zero code, but
  link-scoped friends have no /home (no season ledger) — hurts "continuing".
- **C. Wait for §5c accounts.**

**Recommendation:** A — it makes Craig's mental model true from parts that already exist.

**Status:** FIXED 2026-09-14 per option A — `isAppOwner()` (full access AND the
configured owner GHIN, `NEXT_PUBLIC_OWNER_GHIN`; sandbox defaults to 1234567) replaced
every `getAccessLevel() === 'full'` owner check, plus two surfaces that had NO check:
/dashboard (listed every game) and /home/feedback (everyone's notes). No-identity
code-holders get /pool's login prompt. ROLLOUT: until Craig sets `NEXT_PUBLIC_OWNER_GHIN`
(his real GHIN) in the deploy env, the helper falls back to legacy full=owner, so the
deploy is safe but members aren't scoped yet. e2e `F-059` (owner sees all / member sees
own / no-identity gets the prompt).

---

