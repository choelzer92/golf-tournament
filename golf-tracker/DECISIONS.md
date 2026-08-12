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
