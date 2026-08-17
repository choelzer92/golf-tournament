# Decisions & feedback log

Craig's decisions, corrections, and stated preferences — with the reasoning, not
just the conclusion. Append-only; newest at the bottom of each section.

**Why this file exists:** the north star and the product's rules are being
discovered through conversation, not written up front. Recording only the
conclusion loses the *why*, which is what's needed to apply a decision to a case
nobody anticipated. It also stops the same question being asked twice.

**How to use it:** read before proposing anything that touches product direction,
process, or safety. When Craig decides something, append it here in the same
session — a decision that only exists in a chat transcript is lost.

---

## 1. Product north star

> **"An intuitive UI that makes starting, tracking, and continuing a golf game as
> easy as possible — with more possibilities than any other app on the
> marketplace."**

Stated 2026-08-10, volunteered twice unprompted while we were scoping test
tooling — so it's the frame Craig wants decisions judged against, not a passing
remark.

**The central tension: maximum possibility, minimum exposed complexity.**
Competitors pick a side (3 dead-simple formats, or deep config behind a
spreadsheet). The bet here is that both are achievable because depth costs nothing
until it's asked for.

Mechanisms that make that work, and must be preserved:
- sane defaults on every setting — "just the usual game" touches none
- `showIf` progressive disclosure, so a 30-setting mode presents as 6
- pluggable self-describing modes — new possibilities without new UI
- reuse (groups, saved formats, rosters) so config is a one-time cost

**Design smell:** a new capability that demands a bespoke screen. The possibility
is welcome; the exposure isn't.

**All three verbs matter, but "continuing" is the most neglected and most
valuable** — state surviving a sleeping phone, a guest joining at the turn, a
score fixed after the fact, a season-long money ledger. Bias effort there.
(Written up in `UI_CONVENTIONS.md` §6/6b/6c.)

---

## 2. How Craig wants me to work

**Document first; change on request.** (2026-08-11)
> "the agent using this should just be documenting issues, and then propose
> changes later, right? never just making changes on a whim?"

Investigate, analyze, report freely. Changing app code happens when asked.

Stop and ask before anything that: changes money/handicap/scoring math; alters a
rule mid-round; is irreversible or touches live data; or has more than one
defensible answer.

*Context:* raised after I changed `teamMode` for 2v2 best-ball/combined during an
authorized fix. That change altered how the scorecard computes team rows — I
reasoned it through and commented it, but should have surfaced it first.

**Never commit or push unbidden.** Commits happen when asked; pushing is always
Craig's call (the app is live).

**Separate, revertible commits.** (2026-08-10) Preferred 4 commits over 1 for the
first batch, so any one piece can be reverted alone.

**Verify claims; don't assert them.** Craig repeatedly asked "are you sure this is
safe?" and each time the answer changed after actual verification:
- the env-var sandbox I called zero-risk had silently served **live** credentials
  (a stale dev server hijacked the request)
- the `/sandbox` route I'd guarded still **shipped seed logic to production**
Both were caught only because he pushed. **A safety mechanism that depends on me
performing several steps correctly is not a safety mechanism** — prefer
structural guarantees (absent credentials, excluded routes) and test them in both
directions.

---

## 3. Safety constraints

**The production app must never be at risk.** It is **deployed and publicly
reachable**; friends use it with real money games. `.env.local` points at the live
Supabase.

Rules that follow:
- tests must be structurally unable to reach production, not merely configured
  not to (see `src/test/setup.ts`, `src/lib/supabase.ts`)
- no test data in the live database, not even prefixed-and-cleaned
- dev-only code must be *absent* from production builds, not just unreachable
  (`next.config.ts` `pageExtensions`; guarded by
  `src/test/no-sandbox-in-build.test.ts`)

**Don't touch WSL, Rancher distro data, or IDE dirs.** (2026-08-11)
> "but i need those for other work"

Craig's machine runs other work. When freeing disk space, only regenerable caches
(npm/pip/build/logs) — never distro data. ~7 GB was reclaimed safely this way.

**Rancher/Docker is optional, not a prerequisite.** A power cut left containerd
unhealthy. Local Supabase would be higher fidelity, but the fake backend was built
specifically so verification doesn't depend on container infra.

---

## 4. Golf domain corrections

Craig knows the rules better than I do. Corrections he's made:

**Net double bogey cap.** (2026-08-11) I said a 14 handicap caps at "triple on the
4 hardest, double elsewhere." Wrong — that describes a 22.
> "if someone has a 14 handicap, their maximum is a triple on the 14 hardest
> holes, since they would get a net double bogey on those 14 holes"

Correct: `net double bogey = par + 2 + strokes received`. A 14 gets one stroke on
SI 1–14 → **triple on those 14**, double on SI 15–18.

**WHS differentials used.** At 10 rounds it's the **lowest 3**, not 4 (9–11
rounds → 3; 12–14 → 4; 20 → 8). Craig pushed back reasonably ("why not the 4th if
20 uses 8?") — the table isn't linear: the ratio climbs from 20% at five rounds to
40% at twenty, because a thin record is noisier and WHS would rather run slightly
low on strokes than hand out too many.

**Worked example (his friend, Fox Hollow Links–Canyon, 70.5/131/par 71):** best 3
of 84/85/86 → differentials 11.6/12.5/13.4 → **Index 12.5** → Course Handicap
`12.5 × 131/113 − 0.5` = **14**. The portable number is the Index.

---

**Handicap basis is about STROKES EXCHANGED, not tees.** (2026-08-11)
> "sometimes people want to use course handicap or player index in terms of the
> overall strokes received. for example, an 8 handicap playing a 2 handicap at spring
> creek from the 3 stars would receive more than 6 strokes on the same tees with
> course handicap, and just 6 with player index"

I had labelled this setting *"Adjust handicaps for tee difficulty?"* with Yes/No
answers. Wrong on both counts: it implies the setting is about tees, and "No" reads
as switching off something correct.

The real mechanism — verified: Course Handicap = `index × slope/113 + (CR − par)`.
On the SAME tees the `(CR − par)` term cancels, but slope multiplies the *gap*:

| Slope | 8-index | 2-index | Strokes given |
|---|---|---|---|
| 113 | 8 | 2 | **6** |
| 131 | 9 | 2 | **7** |
| 140 | 12 | 4 | **8** |

Index basis always gives exactly 6. So it's a **competitive fairness choice** — does
a harder course spread players further apart, or should the gap be fixed?

Relabelled to **"How many strokes change hands?"** with answers *Course handicap* /
*Handicap index*, and helper text stating the consequence in strokes rather than
describing the math.

**How to apply:** neither option is "correct" — don't mark one recommended. A label
must state what CHANGES for the players, not what the code does.

## 5. Technical direction

**Testing sequence** (2026-08-10): conventions doc → pure compute tests → fixture
seeder → Playwright. Chose "UI conventions doc first" because the audit's findings
were consistency drift, which tests structurally cannot catch.

**Persistence isolation:** make the client swappable rather than standing up a
second real database. Led to the `src/lib/supabase.ts` seam.

**Never change app code to make it testable.** The compute layer is already pure;
no production code was touched to add 111 unit tests. If a test seems to need a
hook in `src/`, the test is wrong.

**Security posture:** ran `npm audit fix` (safe, lockfile-only, 5 high → 3).
Deferred `next@16.3.0` to its own task — it's outside the pinned range and this
Next version has breaking changes. Note `/_next/image` returns 400 not 404, so the
SVG-DoS advisory **does** apply to the live deployment.

---

## 5b. Stated intent (not yet executed)

**`/home` should become the baseline.** (2026-08-11)
> "I want to eventually make the new home the baseline."

`HOME_V2 = false` today, so login lands on `/dashboard`, which has no link to
`/home/stats` at all. Tracked as F-003 with options; recommendation is to flip the
flag while keeping the "Classic dashboard" escape hatch, after a critique pass on
the three `/home` routes.

**Share links on other people's devices are an open worry.** (2026-08-11)
> "I am not sure about how the organizer links, or share links work on other
> peoples devices."

Investigated → **F-002**, and it's more serious than a UX question: RLS is
`FOR ALL USING (true)` on all 7 tables, so the public anon key grants full
read/write to every game and the whole roster; the organizer token is one shared
constant that can't be revoked; and guest identity is self-asserted via
localStorage. The *flow* is well designed — the trust model underneath isn't.
Needs Craig's decision on scope. **The sandbox harness cannot test this class at
all** (the fake models no RLS), so the green e2e suite says nothing about it.

## 5c. Security is deliberately deferred until pre-scale (2026-08-11)

Craig:
> "is it unrealistic to make the app optimal, and then deal with security after the
> fact? in this case i can keep testing with my close friends, and then when its
> ready to scale we can prepare the security?"

**Decision: yes — optimize the product now, harden before the audience widens.**
This is a considered call, not an oversight. Don't re-raise F-002 as a blocker on
product work; do re-raise it the moment the audience changes.

**Why it's defensible.** Verified facts behind the call:
- **No credentials are stored in the database.** The GHIN bearer token lives in
  sessionStorage only and is never persisted (`pool-identity.ts` is explicit about
  this). Only the lightweight identity is mirrored to localStorage.
- Stored PII is limited to name, GHIN number, handicap index, gender — no
  passwords, no payment data, no contact details.
- Exploiting it takes a *targeted* actor: know the unlisted URL, extract the anon
  key from the bundle, and care enough to query golf scores.
- Hardening before product-fit is a known way to build a well-defended app nobody
  wants.

**THE TRIGGER — revisit F-002 before any of these:**
- anyone outside Craig's circle of trust gets a link
- the app is listed, indexed, or shared publicly
- anything sensitive is stored (payments, contact details, precise location)
- the roster grows past people he personally knows

**Nuance worth keeping in view.** Craig's stated worry is *"I don't want to mess up
one of my few friends currently using it."* Today the larger risk to those friends
isn't an attacker — it's **us**: `FOR ALL USING (true)` means any buggy code path
can wipe or corrupt real games. That's the argument for the sandbox harness, and
why the fake refuses `delete` without an `.eq()` filter.

**Therefore two cheap items stay in scope now** (hours, not days; neither blocks
product work):
1. **Backups / periodic JSON export.** Protects against *our* bugs and bad
   migrations, not attackers. Confirm what retention the Supabase plan actually
   gives.
2. **Per-game share tokens.** Filed under security but really a FEATURE —
   revocable, individually shareable links. Serves "continuing" and makes the
   later RLS work easier because the tokens will already exist.

Real RLS policies (and possibly auth) are the genuinely deferred part.

## 5d. Configurability over defaults (2026-08-11)

> *"i dont want to base the entire app on these 44 games… certain users may want to
> use player index and not course handicap, or adjust their junk values, or possibly
> add other sorts of bonuses. we need to be able to configure this and store
> group/game versions within groups that people use, and have a baseline universal
> default to iterate off"*
>
> *"we shouldnt be super worried about hardcoding defaults, but we should make it so
> users can configure their own stuff per group once, and then have this editable in
> the future, or easily imported"*

**Do not tune shipped defaults from Craig's own usage data.** I analyzed 44 real
games and started proposing default changes; he stopped it. 44 games from one
organizer is a sample of one social circle, not evidence about golfers. A setting his
group never touches (`handicapBasis`, `positionSplit`) is one another group lives in.

**The model instead — three layers:**

```
LAYER 1  UNIVERSAL BASELINE   shipped, never group-specific, never removed
LAYER 2  GROUP DEFAULTS       configure ONCE per group, editable forever, importable
LAYER 3  THIS GAME            today's tweak; doesn't write back unless asked
```

**How to apply:** settings get *relocated* and *relabeled*, never removed or
hard-coded. The wizard gets short because layer 2 already answered the questions —
not because options were hidden. Full write-up in `WIZARD_REDESIGN.md`; most of the
mechanism already exists (`GroupDefaults`, Format Library, `duplicateFormat`,
`setFormatShared`), so it's mostly a surfacing problem. Real gaps: no single named
baseline constant, no "save settings back to my group", no import/export, no
provenance in the UI, and `PoolJunkValues` is a fixed 5 keys so extra bonuses
(sandies, greenies, barkies, longest drive) can't be expressed.

## 5e. Keep the step-by-step interview (2026-08-11)

> *"i do like the process of setting up a game, and having the questions asked to you
> regarding what you want to do."*

The wizard's interview shape is RIGHT and should not collapse into one dense form.
The problem with today's step 1 is that it asks ~12 questions at once, breaking the
interview — not that there are too many steps.

**How to apply:** one clear question per step. A group's saved setup turns
*questions* into *confirmations* (summary line + `[Change]`), which is how both
halves of the north star hold at once: everything still configurable, almost nothing
asked twice.

## 5f. First-time onboarding: play first, save the group after (2026-08-11)

I asked whether a brand-new user (no group yet, so nothing to pre-fill from) should
be walked through creating a group first, or play immediately and be offered
"save this as a group?" afterward.

Craig: *"yea, the second is probably right, as long as players can be added to that
group later."*

**Decision: let them play first, then offer to save the group.** Don't put setup
between a new user and their first round.

**Why it's the better choice beyond being gentler:** saving *after* captures the
settings and players they actually used, rather than asking them to predict their
stakes and handicap rules before they've played once.

**His condition is already satisfied** — verified, not assumed: `addGroupMember` /
`removeGroupMember` (`lib/roster-groups.ts:154-164`) persist membership changes, and
`/home/groups/[id]` already exposes add/remove. A group is editable forever after
creation. Nothing to build for this.

**Terminology note:** I'd been saying "layer 2" in conversation for group defaults.
Craig asked what that meant. The numbering is fine inside `WIZARD_REDESIGN.md` where
it's defined, but it's jargon in conversation — exactly the trap we flagged about the
app's own UI labels. Say "group defaults."

## 5g. Team formats: generalize to N sides (2026-08-12)

Asked whether he'd ever want more than two sides competing within one foursome
(3 pairs from 6, four players as their own sides, two pairs plus a solo):

> "yes, eventually i do think that would be an important feature"

**So generalize `team-game.ts` from two sides to N sides**, rather than extending the
classic pool to dispatch into the existing two-side engine. The cheaper option would
have to be redone the moment a 3-side game exists.

**Why it matters:** this unblocks the north star's "more possibilities" half. Today a
pool of N foursomes can ONLY play best-ball variants — a scramble or Stableford pool is
impossible, even though the 2v2 engine already computes both.

**How to apply:** the sequencing is non-negotiable, because this is the money engine's
hot path — pin every current `ballSelection` result in the compute tests FIRST, then
generalize behind those tests, then map legacy values, then the UI. Full scope in
`FINDINGS.md` F-006.

## 5h. Money visibility is GROUP-SCOPED; stats may be global (2026-08-12)

Asked what the "By player" lens should be, Craig reframed it from a fourth tab into two
independent axes — *whose* money, and *what slice* of games:

> "the just me is the logged in user, but then within groups you can see all
> participants in the group and their money won/lost in games from that group. you
> shouldnt be able to look up peoples win/loss rates in other groups in terms of money,
> but maybe in terms of overall stats that is fine"

**The privacy rule — three parts:**

1. **Money is private to the group that played for it.** Inside Weekend Warriors you see
   every member's won/lost *from Warriors games*. You may NOT see what they did in
   Tuesday Crew, even though you share a group with them.
2. **"Just me" crosses groups**, because it's your own money.
3. **Non-money stats (scoring average, handicap trend, birdies) may be global** — not
   the same sensitivity.

**Overall = option B:** the viewer's own total, plus a per-group breakdown of their own
money ("+$65 — Warriors +$80, Tuesday −$15"). Never anyone else's cross-group money.

**This is a CHANGE, not a clarification.** Today `/home/stats` "Overall" shows every
player's money across every game the viewer can load — so a Warriors organizer already
sees Tuesday Crew results for anyone in both groups. That's the behavior Craig is ruling
out.

**How to apply:** it's a real social boundary — what someone lost on a Tuesday isn't the
Saturday group's business. But note it's a DISPLAY rule while RLS is open by decision
(§5c), so it's a courtesy boundary, not enforced; anyone reading the JS could still
query it. **Written down as intentional so it gets enforced for real when RLS lands.**

Feasible as specced: `getRosterPlayerByGhin()` already maps the logged-in GHIN to a
roster player, and ledger nets are keyed by `playerId`.

## 5i. The group page is a DASHBOARD, not a member manager (2026-08-12)

Shown that `/home/groups/[id]` renders as a 5,249px phone scroll at his real 61-member
Weekend Warriors size — 61 cards, 61 full-width `Remove` buttons, no search over
existing members:

> "make it a group dashboard, and also remove should ask for confirmation"

**Lead with what a group is for** — start a round, recent games, money, formats — and
make members a collapsed, searchable section. **Remove must confirm**; today one mis-tap
while scrolling silently drops someone.

**Why:** a group is the reuse mechanism that makes "config is a one-time cost" true, and
it collapsed at real size. At 4–8 members the page looked fine, which is why this never
surfaced — the 61-member fixture was built to expose exactly this.

**How to apply:** build it together with the F-009 stats rework — "recent games" and
"money" on this page are the same group-scoped ledger data, so doing them separately
means building the same thing twice.

## 5j. Manual bonuses: per-hole, per-player, scorer-entered, group-configurable (2026-08-12)

Asked which bonuses he wants, given the split between computed (birdie/eagle/albatross/
all-par — derivable from the scorecard) and manual (sandie/barkie/greenie/longest drive/
chip-in — nothing in a score says you were in a bunker):

> "i think it would be a situation where if you add them to a game, it would be an easy
> method to click that box as a scorer per hole for a player"

Then confirmed two follow-ups:
> "the scorer can enter any for anyone in the group, and also values are per group
> configurable"

**So:**
1. **Manual bonuses are in scope** — this is not just widening the computed set.
2. **Entry is per-hole, per-player, by whoever is scoring** — the scorer can mark a
   bonus for anyone in their foursome, not only themselves. No per-player login needed.
3. **Which bonuses exist, and what they're worth, is per-group configurable** — Warriors
   play barkies, Tuesday Crew don't. Rides in `GroupDefaults` alongside everything else
   (see §5d's three-layer model).
4. **The tap target lives on the scoring screen**, under each player's score row on the
   current hole — the screen used one-handed, in sunlight, between shots. It must not
   cost a tap to *ignore*.

**Storage — recommended option B (needs confirmation before building):**
`ctpWinners: Record<hole, playerId>` works only because CTP has exactly one winner per
hole; sandies don't (two players can both get up-and-down). And `GameScore` is
`{playerId, hole, grossScore}` with no room for flags.

- **B (recommended):** `bonusMarks?: Record<hole, Record<playerId, string[]>>` on
  `PoolGame`, following the existing `ctpWinners` precedent. Keeps the money engine's
  hot path and the multi-device merge RPC untouched.
- **A (rejected for now):** extend `GameScore` with `bonuses?: string[]`. Conceptually
  tidier — a sandie IS a fact about that player's hole — but `GameScore` flows through
  `merge_game_scores`, the score audit, and every mode's compute. Multi-device merging of
  score rows is also precisely what the fake backend cannot verify.

## 5k. Team building needs SEVERAL named methods (2026-08-12)

Craig, correcting me:
> "i thought the current was actually optimizing? we need to have different options for
> choosing teams, manually assign, snake draft, optimal, with/without captains, etc"

**He's right and I mis-described it.** I called the existing `balanceTeamsWithCaptains`
"greedy load-balancing" after reading only its first stage. `balanceUnitsIntoTeams`
(`pool-game.ts:728`) is a real three-stage optimizer:

1. **Greedy LPT** — heaviest unit onto the least-loaded team, as a starting point
2. **2-swap local improvement** — up to 300 passes, minimizing team-handicap spread
3. **Exact branch-and-bound** — seeded from stage 2, with an average-based bound, a
   symmetry prune on identical (load, seats) teams, and an 800ms deadline

So it **provably minimizes spread** when it doesn't hit the deadline. That's genuinely
"optimal", not greedy.

**The product decision:** team building becomes an explicit CHOICE of method, not one
algorithm. Named options:
- **Optimal** — the existing balancer (keep, and label it honestly)
- **Snake draft / serpentine** — JY's request; positional and predictable
- **Manual** — assign by hand (exists via EditFoursomes)
- **Sequential** — plain foursomes in list order (exists)
- each **with or without captains** (`useCaptains` and `balanceExcludeCaptains` already
  exist as separate toggles)

**Why both optimal AND snake matter — they're different goals, not rival
implementations.** Optimal makes team TOTALS as even as possible. Snake is strictly
positional, so an organizer can explain it to the group and verify it by eye. JY asked
for snake while the optimizer already existed, which tells you explicability is its own
feature in a money game.

**How to apply:** don't replace the optimizer, and don't describe it as greedy.
`summarizeTeamBuild()` already surfaces the method in "How these teams were built" — each
new method needs an honest headline there.

## 5l. Pool live scoring does NOT use the merge RPC — I overstated the risk (2026-08-12)

I repeatedly warned that "multi-device scoring is untested because it goes through
`merge_game_scores`, which the fake backend can't verify." Craig pushed back:

> "i also thought pool games format for live scoring worked well, so is that changed? the
> tournament stuff was with RPC, but the pool was working i thought"

**He's right.** Traced it: `saveGameScores(matchupId, scores, ownedPlayerIds)` only takes
the RPC branch when `ownedPlayerIds` is passed, and that only happens when
`setup.scoringTeam` is set (`game/play/page.tsx:212`). **A pool game never sets
`scoringTeam`** — each foursome has its own `matchupId`, so pool scores go through the
plain `upsert` and the RPC is never involved.

**Why pool multi-device is safe by design:** scoring is *partitioned by matchup*. Two
phones scoring different foursomes write to different rows, so there is no conflict to
reconcile. The merge RPC exists for the TOURNAMENT split-scoring case, where two teams
score the same matchup from separate devices.

**The accurate statement of the gap:**
- Pool multi-foursome scoring — safe by construction, and proven in real use.
- `merge_game_scores` — only the tournament split-scoring path; still unverified by the
  sandbox.
- Realtime *delivery* between devices — untested for both, since the fake fires local
  callbacks rather than crossing a socket. But that's "does the other group's score show
  up on my leaderboard", not "does data get corrupted." Much lower severity.

**How to apply:** don't describe pool live scoring as risky. When flagging sandbox limits,
name the specific path — over-broad warnings about working features cost trust and
misdirect effort.

## 5.x Stableford in a pool of foursomes (2026-08-13)

**Decision: Stableford + head-to-head match mode is allowed.** Asked whether a Stableford
pool should be able to play head-to-head (fixed $/leg) or be restricted to pot mode while
the math settled, Craig chose to allow it: most points wins the front, back, and overall,
and in the hole-by-hole variant more points wins the hole.

**Why:** nothing about points makes head-to-head unnatural — it was only ever a question of
getting more math right at once. Restricting it would have deferred the exact headline case
F-006 exists to unblock.

**How to apply:** any new scoring basis must be threaded through BOTH money models (pot and
match) and both match-scoring variants (`stroke` and `holes`) before it ships. Three of the
four bugs in the F-006 pass were consumers that hadn't been.

---

## 5.y Craig's review questions are load-bearing — treat them as bug reports (2026-08-13)

Three questions during the F-006 review each found a real defect that tests had missed:

1. *"why does the team -90 to par have more points than the team -108? were there
   handicaps?"* → no handicaps; `toPar` was `total − 2 × par` with `total` in points.
   Exposed the hard-coded two-ball assumption AND that three consumers still ranked on it.
2. *"we should clarify if that is net or gross for the pace"* → exposed that
   `two-best-gross` and `net-and-gross` scored 0 points on nearly every hole (two stroke
   scores summed, then compared to one par). Every team tied; the pot split evenly
   regardless of play.
3. *"does that work with a fixed junk pot or also $/junk point over opponents? want to
   make sure both versions work"* → junk was in fact unaffected, now proven by test for
   both models rather than assumed.

**How to apply:** when Craig asks why a number looks odd, verify with a probe before
answering — don't explain the number from the code's intent. Two of these three read as
requests for clarification and were actually defects. And "I believe this does it, but I
want to be sure" means *go check*, not *reassure me*.

---

## 5.z Prove a money test can FAIL before trusting it (2026-08-13)

Asked to sweep every game type and setting for "weird errors", I wrote ~860 combinatorial
cases. They passed 100% on the first run. Rather than report that, I re-introduced each of the
four bugs from the F-006 pass as a one-line mutation: **three of four survived.** The sweep
looked exhaustive and asserted almost nothing.

The common failure: every surviving assertion read a value the code under test had produced —
`place` vs `rankMetric` (both from the same three lines), `holesWon` read back from the tally
being tested. Self-agreement, not correctness. One axis was also simply missing (match mode's
`stroke` leg scoring, never swept).

**Why:** for money math, a green test is a claim about the code. If the test can't fail when
the bug is present, the claim is unfounded — and a big passing number is *more* dangerous than
no test, because it stops further looking.

**How to apply:** after writing a test that guards money, handicap, or scoring math,
re-introduce the bug it claims to catch and watch it fail. Prefer an independent oracle
(recompute from raw scores) over reading the engine's own derived fields. And when many cases
fail at once — including cases that were correct before — suspect the assertion, not the code:
that's how I caught my own wrong invariant (asserting equal scoring *rate* implies equal
`toPar`, when `toPar` is cumulative like any leaderboard's "-5 thru 12").

---

## 5.aa One ball = one entry; the card never invents its own scoring rule (2026-08-13)

**Decision.** For a scramble or alternate-shot pool, the scorecard shows ONE shared score entry
for the foursome (writing the same gross to every member underneath), exactly as the 2v2 mode
already does. And the card's team row is computed from the same engine that settles the money,
never from a hard-coded rule.

**Why.** Per-player entry on a one-ball format made the money depend on the ORDER of the player
list — the same round paid +$75 or −$75 after reordering four names, because the engine reads
"the first member with a score". Craig was offered a cheaper fix (treat scramble as "lowest
gross counts") and rejected it: it removes the order-dependence by silently turning a scramble
into gross best-ball, a different game with a different USGA handicap.

**How to apply.** When a new format reaches the money engine, ask what the SCORECARD does with
it before calling the work done. The engine and the card are two separate implementations of
"what did this team score on this hole"; any format that only teaches one of them is a bug
waiting for the first real round. A useful check: assert the card's team total equals the
leaderboard's, in a test.

---

## 5.ac Prevent impossible data; don't reconcile it (2026-08-14)

Asked whether the next session could investigate the order-dependent scramble payout, I
re-probed it and found the bug **still live** — my earlier fix changed the input (one shared
score) without making the engine robust, and the hub picker I added in the same pass could
re-create divergent scores via a mid-round format switch.

I offered three options, all of which resolved four different scores into one team score
somehow (take the lowest, take the lowest and warn, block just the one path). Craig rejected
the framing: *"if you start a game as a scramble or alt shot, and dont declare a different
format on the back 9 or different holes, I feel there should only be one score entered per
team, right?"*

He's right, and it's a stronger fix. A `PoolGame` has ONE format for all 18 holes — there is
no equivalent of a tournament's `splitFormat` — so four different scores on a one-ball hole
isn't an edge case to handle, it's data that should never exist. The fix is to stop creating
it (the hub refuses the switch once per-player scores exist), with an order-independent
`min` in the engine as a structural backstop rather than the primary answer.

**Why:** "resolve it gracefully" would have made an impossible state look legitimate, and
whichever resolution rule I picked would silently change what game was being played.

**How to apply:** when a bug comes from malformed data, ask whether that data should be
representable at all before designing a rule to interpret it. If the answer is no, close the
door that creates it and treat any engine-level tolerance as a backstop with a test, not as
the fix. And note the exception Craig named — a *declared* per-nine format change is
legitimate; `PoolGame` just can't express one today. If that lands, this constraint needs
revisiting rather than blindly keeping.

---

## 5.ad Junk across N sides: collect from every other side, not the field average (2026-08-14)

Before writing any N-sides code I asked what should change hands when three sides earn unequal
junk — $6, $2, $1. `FINDINGS.md` F-006 had already written down "N sides needs a field-average
settlement like `settlePerPoint`", but that line was written while scoping, never checked
against the numbers. I checked. **It halves every existing 2v2 game's junk money.**

| | 2 sides, $4 vs $2 | 3 sides, $6/$2/$1 |
|---|---|---|
| today's 2-side engine | A **+$2** | n/a |
| collect-from-each-other | A **+$2** ✅ unchanged | +$9 / −$3 / −$6 |
| field average | A **+$1** ❌ moved | +$3 / −$1 / −$2 |

**Craig chose collect-from-every-other-side:** side *i* nets `own × (N−1) − sum(others)`.

**Why it's the right one, beyond the arithmetic.** It reduces EXACTLY to today's two-side math
(`A = own − other`), so no existing 2v2 game moves a cent — which is the whole premise of the
generalization. It's also already the shipped convention: `settleJunkFromSettings` settles
individual junk the same way ("a birdie worth $1 in a foursome pays the earner $3"). Stakes
scaling with side count is the honest reading of a bonus — a birdie is worth collecting from
everyone who didn't make one.

**How to apply:** when a doc line proposes a formula for generalizing money math, compute what
it does at the CURRENT case before trusting it. This one was written down as the plan, read
plausibly, and would have silently rewritten history. `settlePerPoint` is field-average because
it settles a *game metric* against the field; junk is a bonus *collected*, and the two aren't
interchangeable just because both are zero-sum.

**Also settled in the same exchange:** open question 8 (a Stableford pool's PTS + PACE column)
stays as built — Craig's call, revisit later, don't rebuild unprompted.

---

## 5.ae Multi-side margin money is PAIRWISE round-robin (2026-08-17)

Asked what "$2 per hole won" or "$1 per point" should mean once three or more sides play in one
group, I offered a margin rule vs a field average. Craig rejected both framings twice, and the
second time named the actual rule:

> "wouldnt if it was $ per stroke, or something like that, the losing team would owe all teams
> ahead of them, and the 2nd team would owe just the one ahead?"

**Decision: every side settles against every OTHER side, pairwise.** A side's money is the sum
of its result against each opponent individually.

Verified before building on it — $1/point, three sides at 70 / 74 / 80:

```
A: (74−70) + (80−70) = +$14     last owes both sides ahead of it
B: (70−74) + (80−74) =  +$2     2nd owes only 1st, and collects from 3rd
C: (70−80) + (74−80) = −$16
                        sum $0
```

**Why it's the right rule.** It is zero-sum at every side count, and at two sides it reduces to
exactly today's payout (A +$4 on a 4-stroke margin), so no existing 2v2 game moves. It also
matches how these games are actually settled at the table — you owe the people who beat you, by
how much they beat you — and it generalizes the *same* idea as the junk rule in §5.ad rather
than introducing a second style of settlement into one game.

Note the property that makes it fair and that a field average also has: B can finish 2nd and
still be *up*, because it lost to one side and beat another. An "outright winner takes all"
rule would have paid B nothing.

**My framing error, worth recording.** I asked this as "collect-from-every-side vs
field-average" — both of which are *aggregate* rules — when the natural unit is the PAIRING. I
also asked about tie-breaking as though it were an open question; `distributePot` already
implements exactly what Craig described (tied 1st shares 1st+2nd money; tied 2nd splits 2nd),
verified by probe. Two of three questions in that round were answerable from the codebase.

**How to apply:** when a rule needs generalizing, ask what the atomic unit of the settlement is
before offering aggregate formulas. And check whether the codebase already answers the
question — §5.y's lesson (Craig's questions are load-bearing) has a mirror: my questions should
be load-bearing too, not a menu of things I could have looked up.

**Still open, deliberately not built here:** the 2v2 mode has NO pot model — its three money
models are all margins. A "buy-in, split by place" option for multi-side games would come free
from `distributePot` + `positionSplit`. Craig hasn't chosen it; don't add it unprompted.

---

## 5.af Rank sides on SCORE TO PAR, and show it (2026-08-17)

Generalizing the side engine changed exactly one of 48 golden snapshots, so I probed why instead
of accepting it, and found a live bug in the shipped 2v2 mode: `total` scoring ranked on RAW
TOTALS, so a side was paid for having played FEWER holes.

```
both sides level par, A thru 9 vs B thru 5   ->  B collected $16
side B thru 0 (not started)                  ->  B ranked 1st, collected $20
```

Craig, choosing the rule:
> "i actually think score to par is the way to rank it, showing what holes each team is through.
> But athis is what it looks like in a normal golf tournament in terms of the scoreboard"

**Decision: rank and settle on score to par, display thru.** The tournament-scoreboard
convention. `points` still reports the real total the side shot — the ranking normalizes, the
displayed score doesn't.

**Why it's safe for existing games:** at equal thru counts the to-par margin is arithmetically
identical to the raw-total margin (the "even" term cancels), so every completed round pays
exactly what it paid before. Only mid-round unequal-thru numbers move, which is the bug. 47 of
48 snapshots byte-identical.

**Then Craig asked "what about the pace situation".** Worth recording the answer, because it
collapses two things I had been treating separately: **PACE and score-to-par are the same
computation** (`evenValueOnHole` — score minus what expectation would score). Only the unit and
sign differ:

| | unit | "even" per hole | good is |
|---|---|---|---|
| to par (strokes) | strokes | par × balls | negative |
| PACE (Stableford) | points | 2 × balls | positive |

So the pool's PACE column and the side engine's new ranking are one mechanism on two axes.
**Craig's follow-on call: show the column on the side board too** (TOT + to-par/PACE + THRU,
the same shape the pool board already uses), because the board was ranking on a number it
didn't display — a side could sit above another with a worse-looking total and nothing on
screen explained why.

**This narrows open question 8 rather than answering it.** Ranking is settled and no longer
optional on either axis: without it a side thru 5 gets paid for playing less golf. What remains
open there is only the label and whether a *projected-18* variant is preferable to *pace* as the
wording. Don't rebuild the pool's column unprompted.

**How to apply:** when two surfaces compute the same idea under different names, say so out loud
before adding a third. This one had a fix on the pool axis since the pool half of F-006 and the
side axis never got it, which is the single most common shape of bug in this codebase's audit.

---

## 5.ag A side game's pot is anted PER SIDE, not per player (2026-08-17)

The side game (2v2 generalized to N) had only margin money models — $/hole, $/point, fixed legs.
Craig asked for a pot. Two questions, both answered:

**1. Who antes? PER SIDE.** Every side puts in the same buy-in regardless of how many players it
has. Only matters once sides can be uneven, which the N-sides work just made possible.

```
sides of 3 / 2 / 1, $20 a side  ->  pot $60, each side risks $20, winner nets +$40
```

**Why not per player** (which is how the classic pool collects): in the pool every team is a full
foursome, so per-player and per-team are the same number. Here they aren't — at $20 a player the
solo side would risk $20 to win a $120 pot while the trio risks $60 for the same prize. A pot
*between sides* means each side buys one equal shot at it.

**2. Winner-take-all by default, split configurable.** `positionSplit` `[100]` is the default;
`[70,30]` pays the top two. Reuses `distributePot`, so Craig's tie rule comes free and is already
verified: a two-way tie for 1st shares 1st + 2nd money ($150/$150 of a $300 pot), a tie for 2nd
splits 2nd. That was one of the questions I asked that the codebase had already answered.

**How to apply:** when adding a money model to a mode, check whether the "obvious" consistency
(match the classic pool) is actually consistency or just a coincidence of that context. Per-player
antes look consistent right up until sides differ in size.

---

## 5.ah The scorecard reads side totals FROM THE ENGINE, and shows rank + margin (2026-08-17)

Asked what a side's row on the scorecard should show once three sides exist (the badge says
"2 UP", which is meaningless against two opponents), I proposed "score to par". Craig caught the
assumption:

> "it should show score to par, but also, what if it isnt a score to par type of game? what if
> its points? probably should be a net, gross, and ranking type situation"

He's right, and the code agreed: `getMatchStatus` already branches four ways (match vs total ×
Stableford vs net) and derives a rank in each, then discards it to render a two-side ahead/back.

**Decision 1: rank + margin, in the game's own unit.** `1st · −4` under strokes, `1st · 42 pts`
under Stableford, `1st · 5 holes` in match play. Rank is unit-free so it's always right; the
margin is whatever that game actually counts. Two sides keeps today's UP/DN badge — no existing
card changes.

**Decision 2: the card reads side totals from the compute engine**, not its own loops. Asked
whether to widen the card's own math or retire it, Craig chose to retire it.

**Why that's the important half.** `AGENTS.md` names "the money engine is the source of truth for
strokes" as load-bearing, and F-006 hit this divergence *twice* in one pass: the card drew a
1-net-1-gross team row for a scramble, and drew Stableford as strokes. Both were two
implementations of "what did this side score" disagreeing. Widening the card's own loops to N
would have kept that setup and doubled the surface. Reading from the engine means a format the
engine understands, the card understands — by construction, not by keeping two copies in sync.

**How to apply:** when a screen has its own copy of a domain calculation, widening the copy is
almost never the cheaper option — it's the same work plus a permanent obligation to keep both
honest. Prefer deleting the copy. And note the general lesson from Craig's correction: a label
that names a *unit* ("to par", "net") is a claim about what game is being played. Check it holds
for every game the screen can show.

---

## 5.ab Branch discipline while friends are using the live app (2026-08-13)

Craig: *"I have friends using the app today, so I can keep working but i wont merge the branch
today at all. we will do that another time when its safe."*

**How to apply.** Keep building on the feature branch and keep `npm run verify` green, but do
not merge, push, or suggest either — and don't treat a green gate as a cue to ask. Merge timing
is Craig's call based on who's mid-round, not on whether the code is ready. Everything in the
dev loop is already safe for this: the sandbox is an in-memory Map with no network, and vitest
never sees `.env.local` credentials.

---

## 6. Focus areas Craig has named

Requested, in his stated order of interest:
1. **Verify the committed fixes** — done 2026-08-11 (10 e2e tests, screenshots)
2. **The wizard / starting a game** — next up
3. **Live scoring experience**
4. **Offline / PWA resilience** — `sw.js` exists with no offline caching, which is
   a real gap for a "continuing"-focused product on cart-path wifi

---

## 7. Open questions

Awaiting Craig's call. Inferred answers are marked as guesses.

| # | Question | My guess |
|---|---|---|
| 1 | Is **"sides"** right for 2v2, or do golfers say "teams"? | Standardized on *side*, reserving *team* for foursomes |
| 2 | **Blue/red** is both side identity and win/loss valence — they collide | Confine identity to labels/borders, valence to numbers |
| 3 | Green = winning or green = money? (they coincide today) | Unresolved; matters if a mode ever pays the loser |
| 4 | Dark = live, light = setup — deliberate? | Written up as deliberate; it reads well |
| 5 | How much configurability belongs on the **first** screen? | Sharpest tension with the north star; genuinely his call |
| 6 | Mid-round pot money isn't zero-sum (P1 in the audit): split the un-started leg evenly, or pro-rate `entryPaid`? | Split evenly, matching the `settleNassau` precedent |
| 7 | Nassau "Back 9 · thru 9" reads as hole 9 (P3) | Convert to a hole number, matching the header's vocabulary |
| 8 | ~~What should a **Stableford** pool's leaderboard show where to-par goes?~~ **NARROWED 2026-08-17 (§5.af).** Raised again; Craig chose to leave PTS + PACE as built, and separately confirmed the side board should gain the same column. So the *mechanism* is settled on both axes and is no longer optional — ranking on raw totals pays a side for playing fewer holes. Still open: only the **label** (is "PACE" the clearest word?) and whether a projected-18 variant reads better. | Keep PACE. Don't rebuild unprompted. |
