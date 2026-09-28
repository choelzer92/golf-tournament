# Decisions & feedback log — working set

Craig's decisions and preferences. This file holds the ACTIVE constraints in full, plus a
one-line index of every settled decision. The complete entries — reasoning, worked
examples, corrections — live in **`DECISIONS_ARCHIVE.md`**; grep it by § number when a
task touches that topic. Don't re-derive or re-ask anything indexed below.

**When Craig decides something new:** append the full entry to `DECISIONS_ARCHIVE.md`
(same format as always) and add its index line here — plus the full text here too if it
constrains future work generally rather than settling one topic.

---

## 1. Product north star

> **"An intuitive UI that makes starting, tracking, and continuing a golf game as
> easy as possible — with more possibilities than any other app on the marketplace."**

**The central tension: maximum possibility, minimum exposed complexity.** Mechanisms
that make it work, and must be preserved: sane defaults on every setting; `showIf`
progressive disclosure; pluggable self-describing modes; reuse (groups, saved formats,
rosters) so config is a one-time cost.

**Design smell:** a new capability that demands a bespoke screen.

**All three verbs matter, but "continuing" is the most neglected and most valuable** —
state surviving a sleeping phone, a guest joining at the turn, a score fixed after the
fact, a season-long money ledger. Bias effort there.

---

## 2. How Craig wants me to work

**Document first; change on request.** Investigate, analyze, report freely. Changing app
code happens when asked.

Stop and ask before anything that: changes money/handicap/scoring math; alters a rule
mid-round; is irreversible or touches live data; or has more than one defensible answer.
**When a finding's option is Craig's to choose, ask the question outright before building it
(§5.bo)** — don't build the recommendation and ask for a nod afterwards.

**Never commit or push unbidden.** Pushing is always Craig's call (the app is live).

**Separate, revertible commits** — one focused commit per change.

**Verify claims; don't assert them.** A safety mechanism that depends on me performing
several steps correctly is not a safety mechanism — prefer structural guarantees (absent
credentials, excluded routes) and test them in both directions.

**Craig's review questions are load-bearing — treat them as bug reports (§5.y).** When he
asks why a number looks odd, verify with a probe before answering. "I want to be sure"
means *go check*, not *reassure me*.

**Prove a money test can FAIL before trusting it (§5.z).** Re-introduce the bug it claims
to catch and watch it fail. Prefer an independent oracle over reading the engine's own
derived fields.

---

## 3. Safety constraints

**The production app must never be at risk.** It is deployed and publicly reachable;
friends use it with real money games. `.env.local` points at the live Supabase.

- Tests must be structurally unable to reach production (see `src/test/setup.ts`,
  `src/lib/supabase.ts`).
- No test data in the live database, not even prefixed-and-cleaned.
- Dev-only code must be *absent* from production builds, not just unreachable
  (`next.config.ts` `pageExtensions`; guarded by `src/test/no-sandbox-in-build.test.ts`).

**Don't touch WSL, Rancher distro data, or IDE dirs** — Craig's machine runs other work.
When freeing disk space, only regenerable caches. **Rancher/Docker is optional, not a
prerequisite** — the fake backend exists so verification doesn't depend on container infra.

**Security is deliberately deferred until pre-scale (§5c).** A considered call, not an
oversight — don't re-raise F-002 as a blocker on product work. **THE TRIGGER — revisit
before any of these:** anyone outside Craig's circle of trust gets a link; the app is
listed/indexed/shared publicly; anything sensitive is stored (payments, contacts, precise
location); the roster grows past people he personally knows. Two cheap items stay in
scope now: backups/JSON export, and per-game share tokens (really a feature).

**Branch discipline while friends use the live app (§5.ab).** Keep building on the
feature branch and keep `npm run verify` green, but do not merge, push, or suggest
either — and don't treat a green gate as a cue to ask. Merge timing is Craig's call.
(The collapse branch merged 2026-09-27 on his word, §5.bt; the rule stands for the next branch.)

---

## 4. Golf domain corrections (full text in archive §4)

Craig knows the rules better than I do. Settled: net double bogey = par + 2 + strokes
received; WHS differential counts by round count (10 rounds → lowest 3); handicap basis
is about STROKES EXCHANGED, not tees — labels must state what CHANGES for the players,
neither option marked "recommended".

---

## 5. Active technical direction

**The three-layer config model (§5d):** UNIVERSAL BASELINE (shipped, never removed) →
GROUP DEFAULTS (configure once, editable forever, importable) → THIS GAME (today's tweak,
doesn't write back unless asked). Settings get relocated and relabeled, never removed or
hard-coded. **Do not tune shipped defaults from Craig's own usage data** — 44 games from
one circle is a sample of one.

**Keep the step-by-step interview (§5.e).** One clear question per step; a saved setup
turns questions into confirmations. Never collapse the wizard into one dense form.

**Never change app code to make it testable.** The compute layer is already pure; if a
test seems to need a hook in `src/`, the test is wrong.

**The GHIN app is the reference implementation for handicaps (§5.ba).** When our strokes
disagree with the GHIN app, the GHIN app is right by definition. No allowance-order change
without fresh side-by-side GHIN-app evidence captured for both shapes. Allowance applies
to the UNROUNDED course handicap, standard round-half-up (§5.bb) — pending on-course
re-verification.

**BACKLOG.md is the single queue (§5.bc).** Findings and decisions FEED it; next session's
work is PROMOTED from it. End every session by grooming it: mark done, add discovered,
promote next. Ideas land in its Ideas section immediately; never build from Ideas directly.

---

## 6. Decision index — settled; full reasoning in DECISIONS_ARCHIVE.md

| § | Decision (one line) |
|---|---|
| 5b | `/home` should become the baseline (stated intent); share-link trust model = F-002 |
| 5f | First-time onboarding: play first, offer to save the group after |
| 5g | Team formats generalize to N sides, tests pinned first (F-006) |
| 5h | Money visibility is GROUP-SCOPED; "just me" crosses groups; non-money stats may be global |
| 5i | The group page is a DASHBOARD, not a member manager; Remove confirms |
| 5j | Manual bonuses: per-hole, per-player, scorer-entered, group-configurable (`bonusMarks` option B) |
| 5k | Team building is a CHOICE of named methods (Optimal / snake / manual / sequential, ± captains) |
| 5l | Pool live scoring does NOT use the merge RPC — partitioned by matchup, safe by design |
| 5.x | Stableford + head-to-head match mode is allowed; thread new bases through BOTH money models |
| 5.y | Craig's review questions are load-bearing — verify with a probe before answering |
| 5.z | Prove a money test can FAIL before trusting it |
| 5.aa | One ball = one entry; the card computes team rows from the money engine, never its own rule |
| 5.ab | Branch discipline while friends are on the live app (active — see §3) |
| 5.ac | Prevent impossible data; don't reconcile it (one format → one score per team) |
| 5.ad | Junk across N sides: collect from every other side (`own × (N−1) − sum(others)`) |
| 5.ae | Multi-side margin money is PAIRWISE round-robin; 2v2 pot model deliberately NOT built |
| 5.af | Rank sides on SCORE TO PAR, show thru; PACE and to-par are one mechanism |
| 5.ag | A side game's pot is anted PER SIDE; winner-take-all default, split configurable |
| 5.ah | The scorecard reads side totals FROM THE ENGINE; shows rank + margin in the game's unit |
| 5.ai | An unfinished leg settles on CONTESTED holes; close-out asks per leg (no setting) |
| 5.aj | A tied leg settles PAIRWISE under per-opponent stakes; pot ties still divide the prize |
| 5.ak | Colour: identity on names, money coloured good/bad; green = money coming to you |
| 5.al | Say "side" in a side game, "team" in a pool — grep for the old word after any rename |
| 5.am | Keep PACE as the column label; no projected-18 variant |
| 5.an | Playing groups and sides are INDEPENDENT axes |
| 5.ao | The player count should RECOMMEND games, not reject them (auto-balance, manually adjustable) |
| 5.ap | A group outgrowing a tee slot ASKS (default keep), and never loses a score |
| 5.aq | Reuse the LOGIC, not always the component |
| 5.ar | Assert a feature's CLAIM ("balanced"), not its scaffolding; look at the screen |
| 5.as | A mode's player range is measured against the WHOLE FIELD |
| 5.at | A capability change dates every string that described the old limit — grep for the claim |
| 5.au | The wizard asks the FIELD first: field → game → course → tees → money (BUILT) |
| 5.av | A saved format is a CHOICE AT THE GAME STEP, not a detour (BUILT) |
| 5.aw | A group LISTS the formats it plays; one tap to the usual one (BUILT) |
| 5.ax | An applied format is a CONFIRMATION; editing forks a new one, original never touched (F-021, BUILT) |
| 5.ay | The captains' draft is a COMPLEMENTARY DEAL, not a serpentine (BUILT: `captainsDealTeams`) |
| 5.az | "Pool" is a FORMAT name; the container is a GAME; routes/internals stay put (BUILT) |
| 5.ba | The GHIN app is the reference for handicaps (active — see §5) |
| 5.bb | Allowance applies to the UNROUNDED course handicap (active — see §5) |
| 5.bc | BACKLOG.md is the single queue (active — see §5) |
| 5.bd | The feedback box is findable but never covers anything (header button, not floating; BUILT) |
| 5.be | F-027 writers-first: ship defensive code before touching live rows; backfill is a separate approved step |
| 5.bf | Friend feedback is evaluated one by one, never taken as fact — verify, diagnose, then propose |
| 5.bg | Classic-pool money defaults are the Warriors' FORMAT, not the baseline: junk $0/off + fold into overall; money step shows per-player/per-leg $ that add up |
| 5.bh | Group management consolidates on /home (F-055 opt A; opt B = §5c, not chosen); sharing scales by ONE LINK KIND PER JOB, token on the game row — never add link kinds; F-056/57/58 queued on recommendations |
| 5.bi | Ownership is IDENTITY, not the invite code (F-059 opt A): `isAppOwner()` = full access + owner GHIN; the code means MEMBER (own games/groups/ledger); access policy = game link for players, code for regulars, legacy link retired from circulation |
| 5.bj | 2026-09-15 review: F-034 opt A built; F-031 opt B deferred; sharing arc → "Accounts/§5c hardening"; next build = course-data audit, game-structure runs design-first in parallel; harness round 2 (page/spec splits, quiet reporter, FINDINGS sweep) built; STATUS.md rejected |
| 5.bk | Game structure: step 2 asks "How do you want to compete?" (fit-based pre-selection); pool vs sides COLLAPSE into "N teams of K" — money model + foursome-alignment route the machinery invisibly; DEEP PLANNING session before any code; F-061 naming waits for this design |
| 5.bl | Best possible, not merely easiest (live scoring named first): plans must argue whether a subsystem's shape is the BEST one, not just that it works; §2 stop-and-ask still governs changes |
| 5.bm | Collapse plan walked 2026-09-16: router picks the engine by CAPABILITY (never a user-facing choice; unexpressible combos greyed with reason until Phase 3); partners walk together, no tee-sheet question; uneven teams under "Other split…"; F-063 opt A approved now, opt C its own session; "team" everywhere |
| 5.bn | F-072 (2026-09-16): every team format on every split — the sides engine scores through the pool's `teamValueOnHole`; a two-ball format is refused only where a team has one ball (a team of one); scoring-math change landed goldens-first (§5.z), 164 oracle cases, three mutations caught |
| 5.bo | F-076 A / F-085 A / F-086 A (2026-09-16): recommended options stand as built; going forward, when an option is Craig's to pick, ASK the question outright before building |
| 5.bp | F-088 A / F-089 A / F-090 A (2026-09-16): hub mode panel headed "How it's played"; phone header stacks actions under the title; CTP editor classic-only until Phase 3 pays CTP everywhere |
| 5.bq | Phase 3 money rules (2026-09-17): CTP + hand-tracked bonuses are junk on every engine; with 3+ teams every money model gets ONE chosen setting — winner-takes-all vs pay-everyone-you-lost-to (hidden for 2 teams); pairs balance combined handicap → seed of the flight model |
| 5.br | Phase 3 step 3 (2026-09-17): with 3+ teams `legs` default to WINNER-TAKE-ALL (a $10 leg never costs more than $10); a winner-take-all tie SPLITS the loser's payment (A +5, B +5, C −10); $/point stays pay-each; $/hole gains carry-ties (off by default). F-094 resolved |
| 5.bs | 2026-09-18: F-097 fix approved (opt C — wizard passes tee groups as sides + engine backstop); recommendations on all six open picks: F-087 A, F-093 A, F-091 A, F-092 A, F-095 B, F-096 A; branch code-complete after, Craig's walk still wanted before merge |
| 5.bt | 2026-09-27: collapse branch MERGED to main (f163242) + pushed on Craig's word, walk waived for the green gate + screenshots; next-session order = verify speed (A+B+D) → Home/Event P3 design conversation (P1+P2 already built, flag ON since 2026-08-12) → small items |

---

## 7. Open questions

Awaiting Craig's call. q1–q3 and q5–q8 are closed (see archive §7 for how).

| # | Question | My guess |
|---|---|---|
| 4 | Dark = live, light = setup — deliberate? | Written up as deliberate; it reads well |

**Only q4 remains open.**
