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
