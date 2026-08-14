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

**Still open:** `subTeams` widening to N sides;
`subTeams` widening to N sides; `TeamLegLine.winner` widening; `settleJunkForSides`
field-average settlement; Wolf as a 2-side consumer. The play page's leg panel
(`app/game/play/page.tsx:2490`) shows a raw leg total in its sub-line — honest, but not
pace-normalized under points.

**Status:** in progress — engine + pool wiring + tests done, format picker not built

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

**Status:** open (trivial fix)

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

**Status:** open

---

## Fixed & verified

Findings confirmed fixed with an e2e assertion guarding them. (The 11 fixes from
the original audit are covered by `e2e/verify-fixes.spec.ts` — side names on both
screens, 9-hole leg collapse, field-size tie detection, single-group vocabulary,
money formatting, and close-out → completed.)

*None from this log yet.*
