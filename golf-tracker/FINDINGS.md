# UI findings

Running log from the critique loop in `UI_CRITIQUE_PROCESS.md`. Each entry is an
observation with options — **nothing here is fixed until Craig picks an option.**

Severity: `P1` wrong data/money · `P2` visibly confusing or slow · `P3` cosmetic.
Phase: `[start]` `[track]` `[continue]` — the north star's three verbs.

Status flow: `open` → `chosen: X` → `fixed (commit)` → `verified (e2e)`

> Findings from the pre-harness code audit live in `UI_MODE_AUDIT.md`. That file
> is the *method* + the original sweep; this file is the ongoing log from looking
> at rendered screens. New findings go here.

---

## Open

### F-002 — Share links: every visitor shares one static token, and RLS is open  [P1] [continue]

**Screens:** `src/components/pool-share.tsx`, `src/lib/invite-gate.ts`,
`supabase/migrations/*`
**Violates:** north star ("continuing" — rejoining must be frictionless *and*
trustworthy)

Raised by Craig: *"I am not sure about how the organizer links, or share links work
on other peoples devices."* Traced end-to-end. Three separate issues, worst first.

**1. Row-level security is effectively off.** Every table carries:

```sql
CREATE POLICY "Allow all access to pool_games" ON pool_games
  FOR ALL USING (true) WITH CHECK (true);
```

`FOR ALL USING (true)` on all 7 tables (`pool_games`, `players`, `tournaments`,
`game_scores`, `roster_groups`, `score_audit`, `solo_rounds`). The anon key is
public by design — it ships in the client bundle of a deployed app — so **anyone
who reads the JS can read, modify, or delete every game, every score, and the
whole roster**, from anywhere. No share link needed. `hydratePoolGames()` selects
*all* rows; the per-organizer filtering (`getPoolGameListForGhin`) is a
**client-side display filter**, not an access control.

**2. The organizer token is a single shared constant.** `ORGANIZER_TOKEN =
'poolparty2026'` (`invite-gate.ts`) and `VALID_CODES = ['birdie2026']`. Every
share link is identical — `/pool?key=poolparty2026`. It can't be revoked for one
person, doesn't expire (48h cookie, but the link works forever), and once posted in
a group chat it's public. Same for the invite code.

**3. Guest identity is self-asserted.** A share-link visitor's "who am I" comes
from `getCreatorGhin()` reading `localStorage`. It decides which games they see and
what gets stamped on games they create. Editable in devtools.

**What actually works today:** the flow itself is good — the token bypasses the
invite gate, grants `pool`-only access (`isPoolAllowedPath`), and a guest can score
without a GHIN login. The friction design is right. The trust model underneath is
the problem.

**Options**
- **A. Real RLS + per-game share tokens.** Store a random token per game; policies
  check it. Proper fix, and the only one that actually restricts access. Cost: a
  migration, policy work, and reworking how the client passes the token — the
  largest change here by far.
- **B. Per-game random token, client-enforced only.** Replace the shared constant
  with a per-game token so links are individually shareable/revocable. Much better
  UX and revocability, but **does not close the RLS hole** — it's a lock on a door
  in a building with no walls.
- **C. Scope RLS by organizer GHIN.** Policies keyed to a claim rather than a
  token. Needs real auth (Supabase Auth or signed JWTs); the biggest change but the
  only one that also fixes issue 3.
- **D. Accept it, documented.** The data is golf scores among friends, not PII or
  payments. If the app stays invite-only among people Craig knows, the practical
  risk is low — but it does not scale to strangers, and "deployed and publicly
  reachable" already exceeds that assumption.

**Recommendation:** **A**, and treat it as a prerequisite for opening the app to
anyone outside Craig's circle. Sequence it as: per-game tokens first (B, immediate
UX + revocability win), then RLS policies keyed to those tokens (A). Do **not** do
B alone and consider it solved.

**Verification note:** this is exactly the class the sandbox harness **cannot**
test — the fake models no RLS at all. It needs a real Supabase instance, ideally
local. Worth flagging that our green e2e suite says nothing about it.

**Status: DEFERRED by decision (2026-08-11) — see `DECISIONS.md` §5c.**

Craig is optimizing the product first while testing with close friends, and will
harden before the audience widens. That's a defensible call: no credentials are
stored in the DB (the GHIN token never leaves sessionStorage), the PII is limited
to name/GHIN/index/gender, and exploiting this needs a targeted actor who wants
golf scores. **Do not re-raise this as a blocker on product work.**

**Re-raise immediately if:** anyone outside his circle gets a link · the app is
listed or indexed · anything sensitive is stored (payments, contact details,
location) · the roster grows past people he personally knows.

**Still in scope now**, because the nearer-term risk to his friends' data is *our
bugs*, not attackers (`FOR ALL USING (true)` means any bad code path can wipe real
games): (1) backups / periodic JSON export, (2) per-game share tokens — filed here
as security but really a feature, and it makes the eventual RLS work easier.

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

### F-013 — The SCORECARD can only express two sides, so a 3+ side game scores untagged  [P2] [track]

**Where:** `src/lib/game-state.ts:9` (`Player.team?: 'A' | 'B'`), consumed at ~27 sites in
`src/app/game/play/page.tsx`; set in `src/app/pool/[id]/page.tsx:207`
**Violates:** north star — *more possibilities* — and the §5.aa rule that the card and the engine
must agree

**Known and deliberate, not an oversight.** The N-sides work (F-006) generalized the engine, the
storage, the leaderboard, the wizard and the hub. The scorecard was left at two sides because
`Player.team` is a two-value field read at ~27 places, and the honest options were:

- tag only the first two sides → the card draws an **A-vs-B team row and match badge for a game
  that is not A vs B**. That is exactly the defect §5.aa records (the card playing a different
  game from the money engine), and it would be worse than showing nothing.
- tag nobody → the card shows plain per-player entry with **no team row**. Incomplete, but nothing
  on it is false.

The second was chosen. A three-side game therefore scores fine (gross per player, which is all the
engine needs) and settles correctly on the leaderboard; the card just doesn't show side totals.

**What widening it would take:**
1. `Player.team` becomes a side id (`string`), or the card reads `sidesOfGame(game)` directly
   rather than a denormalized per-player field. The latter is cleaner and matches how the
   leaderboard was widened.
2. `teamNames: { A, B }` on the play page becomes a per-side lookup (same shape as
   `IndividualResult.sideLabels`, which already exists).
3. The match badge needs a rule for 3+ sides, or should be hidden — a single "2 UP" is
   meaningless against two opponents. Note the pool side already hides that badge for a
   one-sided card, so there's a precedent to follow.
4. The two-side colour pair (blue/red) needs the same `sideTone`-style palette the leaderboard
   now uses.

**Why P2 rather than P1:** no money is wrong and nothing on screen lies. It's a missing capability
on one surface, and the surface that *pays* is correct. But a group actually playing three sides
will want their side's running total while they're out there, so it's the natural next piece.

**Status: PARTLY DONE (2026-08-17).** A 3+ side game now draws one row per side on the card,
**from the engine** (`IndividualResult.sideBreakdown`), with a rank + margin in the game's own
unit: `1st · −4` under strokes, `1st · 42 pts` under Stableford, `1st · 5 holes` in match play.
Craig's calls, DECISIONS.md §5.ah — including the correction that "to par" is a stroke-play word
and the card has to serve points games too.

Verified on screen, not just asserted: three side rows in the leaderboard's own colours, totals
and statuses matching the board exactly, and all six players still scoreable. The header also now
says "3 sides", which the screenshot showed it wasn't (it read "Stroke Play · Best Ball · Full
Handicap" — true, and silent about the surprising part).

**What is NOT done, and why.** The plan was to retire the card's own `getTeamNet` /
`getTeamStableford` / `getMatchStatus` and have every path read the engine. That turned out to be
unsafe as a single step: **this card also serves the 2-team TOURNAMENT**, which has no `PoolGame`
and therefore no engine to ask. So the engine rows are scoped to the pool side-game path with 3+
sides, and everything else — two-side games and every tournament — keeps the existing math
untouched.

That leaves the duplication §5.ah wanted gone, for two sides only. The honest framing: the new
path has one source of truth, the old path still has two. Retiring the old math needs the
tournament to gain an engine of its own (or a shim that builds a context from a `Tournament`),
which is its own piece of work and shouldn't ride along with this.

**Still open:** the tournament's copy of the team-score math, and the two-side badge path.

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

### F-015 — The hub's read-only summary shows six side-name rows, four of them blank  [P2] [start]

**Where:** `src/app/pool/[id]/page.tsx:1359` (`MoneySummary`) — filters on `showIf` but never
applies `unusedSideNameKeys`
**Screen:** `/pool/[id]`, any 2-side game · `e2e/screenshots/audit-11-hub-2side-collapsed.png`
**Violates:** north star — *minimum exposed complexity*

The defect F-014 went looking for, on the surface nobody checked. The **editor** hides the unused
name fields (`hideKeys={unusedSideNameKeys(sides.length)}`, :1016). The **read-only summary** —
the panel every player sees on the hub without tapping Edit — renders the raw schema:

```
Front 9 ($)  10     Back 9 ($)   10
Overall 18   10     Side A name
Side B name         Side C name
Side D name         Side E name
Side F name         Birdie/eagle bonuses  On
```

Five of the eleven rows on a plain 2v2's money panel are empty side-name labels. Two labels
(`Side A name`, `Side B name`) are also blank-by-design, so the panel's most prominent feature is
six rows of nothing.

**Same root cause as F-014, third surface.** Six static keys in the schema, and each consumer has
to remember to hide the unused ones. Two of three remembered.

**Options**
- **A. Move side names out of the settings bag into the Sides editor** (F-014 option A). Fixes all
  three surfaces at once and removes four keys from the schema, so no future consumer can forget.
  Costs a bespoke control — though the Sides editor is already bespoke, and this is the second
  finding caused by the generic bag not being able to express "depends on the game's data".
- **B. Pass `hideKeys` to the summary too.** Three lines. Fixes the screen, leaves the trap armed
  for the next consumer.
- **C. Drop blank rows from the summary generically** — a read-only panel showing a label with no
  value is noise regardless of which setting it is. Fixes this and every future empty-value row.
- **D. Leave it.**

**Recommendation:** **C then A** — **C** because a read-only summary should never print an empty
value (it fixes F-015 and hardens the panel), and **A** as the real fix for the naming model,
which also closes F-014's step-3 gap (a wizard-built 3-side game can never name side C).

**Status: CHOSEN 2026-08-18 — option C.** A read-only summary never prints a row whose value is
blank; a side that HAS been named still shows (`Side A · The Hogs`). Generic, so it hardens the
panel against any future setting rather than just this one. Craig asked what the rows even were —
worth noting the finding was only legible once he saw the screenshot, not the description.

The naming model itself (option A) was chosen separately under F-014, so both halves are going in
— but as two commits, since C fixes a screen and A changes a schema. Not yet built.

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
pin it first, as with F-016/F-017. `isSingleGroupGame()` (7 call sites) becomes questionable as a
concept: a side game may no longer be one group. That's the riskiest part of the change, since
those branches decide which leaderboard and scorecard a game gets.

**Why P1 rather than P2:** it isn't wrong money, but it blocks the ordinary real-world case — eight
guys, two tee times, playing sides — which is exactly the game this mode was widened for. And the
sheets that misinform are the ones sent to people who aren't holding the phone.

**Status:** designed and approved 2026-08-20, not built. Craig chose to document first and build
next session, because it changes how every side game's scores are read.

---

### F-001 — Nassau segment "thru" reads as a hole number  [P3] [track]

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

## Fixed & verified

Findings confirmed fixed with an e2e assertion guarding them. (The 11 fixes from
the original audit are covered by `e2e/verify-fixes.spec.ts` — side names on both
screens, 9-hole leg collapse, field-size tie detection, single-group vocabulary,
money formatting, and close-out → completed.)

*None from this log yet.*
