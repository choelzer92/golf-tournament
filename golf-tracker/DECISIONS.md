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
