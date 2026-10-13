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
| 5.bu | 2026-09-27: gate stops at 2 workers + `verify:quick` (CPU-bound, ~1.25× max; full gate 12.3 min e2e); Event spine slice 1 APPROVED (tournament owner writers-first + pure N-way `teamsOf`/`computeStandingsN`, no shape/UI change); legacy owner-less tournaments stay visible to everyone; F-062 opt A (display pass) |
| 5.bv | 2026-09-28: plus handicaps work everywhere: off-the-low sets the plus player to 0 and others gain strokes; full handicap GIVES strokes back on the easiest holes (SI 18 first); typed "+2.1" must keep its sign (F-098). F-099 step bar → compact "Step N of M" on phones (opt C). A full UI revamp waits until the back end works; until then UI work = fixes and consistency only. Team field cap REMOVED: 32 players / 8 foursomes must work |
| 5.bw | 2026-09-28: teams across foursomes are first-class (Hogs v Dawgs is the reference); F-101 a card shows whole-team engine rows, b late player asked for a team, c legs read LIVE during the round like Standings (to par on own holes + thru), contested result still pays (2026-09-29, replaced the "waiting on Group N" label), hide-holes stays OFF when teams span foursomes (it's anti-cheating for teams = foursomes), d individual modes go past 4 (field-wide skins/Stableford/low total/quota; Wolf/Nines keep caps); F-100 ± toggle + full plus-handicap sweep; F-069 keep best-ball default + pin every offered format is computed; scale target = member-guest, 72 teams of 2 (144 players / ~36 foursomes), flights = subsets of sides, not built yet |
| 5.bx | 2026-09-28: plus handicaps follow the Rules of Handicapping to the letter (quoted in F-102, pinned by `whs-plus-rules.test.ts`); −N is stored truth, "+N" only its spelling (format/parse at the edges, round-trip guarded); plus halves round toward zero (= `Math.round`); F-102 a fix split-format team strokes, g tournament off-the-low rounds first like the pool, i adopt 2024 nine-hole tenth-rounding; h (2024 team-match difference rule) waits for F-022 |
| 5.by | 2026-09-28: a gross game is a **Net \| Gross switch** on every format (wizard + hub); Gross = allowance 0 (engine unchanged) and hides only the stroke-giving settings (allowance %, full vs off-the-low, basis); match/stroke play, Stableford and the format stay; Net restores the last %; the wizard's 0→100 fallback (F-102 j) fixed with it |
| 5.bz | 2026-09-29: F-102 k opt A — on Gross, hide a mode's own net/gross basis (skins, low total); on Net it stays (net game + gross skins still possible). Test-process speed-up goes BEFORE F-101 (timing file, prod sandbox build + 3–4 workers, maxFailures) |
| 5.ca | 2026-09-29: big-field skins (F-101 d) — add a **Skins pot** (entry pot split by skins won; default past 4, $ per skin stays); a skin is decided once **every tee group** has posted the hole (closed game decides on what's posted; one group = old rule); junk defaults to the **junk pot** past 4 |
| 5.cb | 2026-10-01: a game (pool OR tournament) is visible to its owner + every player in it (by GHIN) + every member of its source group; widens pool's owner-only list; not built yet. Long-term: no pool/tournament lingo, "set up a game" (collapse + spine S4) |
| 5.cc | 2026-10-01: skins mid-round = skins won + Leading (open holes alone low) + each open hole "N of M played" (PLAYERS); pot $ labelled "if it ended now with no more skins won". F-103 a resolved; no money change |
| 5.cd | 2026-10-01: roadmap `.claude/plans/roadmap-2026-10.md`; §5.bv 3 lifted for Phase D first-impression polish only; order polish → B → A, but a DEDUP AUDIT of every item comes first (new session); §5.cb visibility next; no-GHIN organizer wanted but map GHIN dependencies + options before building |
| 5.ce | 2026-10-01: F-022 + F-033 CLOSED; S2 + F-063 C APPROVED (investigate → plan in roadmap → build; show the live migration first); new investigation: stroke vs match play strokes can differ slightly (report only, no math change without Craig) |
| 5.cf | 2026-10-01: multi-day events are a REAL, public-market need (proposed beta bar #11), seeded from the group's preferences; cumulative money first, other cross-day formats later; group's own courses listed most-played first plus add-new; OPEN: Series wrapper vs spine S4 for multi-day |
| 5.cg | 2026-10-01: BETA.md bar CONFIRMED as written and binding (work moves a bar item or waits); multi-day events ARE bar #11, so Series vs S4 is on the beta path (still asked after S2's investigation) |
| 5.ch | 2026-10-01: only GHIN-login users ORGANIZE for now (handicap refresh needs a GHIN token anyway); non-GHIN players keep scoring and seeing the leaderboard; the no-GHIN organizer moves to §5c security, [deferred]; GHIN stays the identity key for §5.cb |
| 5.ci | 2026-10-01 (after the dedup audit): F-104 opt A (Create requires a GHIN login); legacy owner-less tournaments visible to their players + the app owner (replaces §5.bu's everyone); brand/name waits for a pre-beta-end branding session (GrudgeMatch floated), so D2 waits; F-037 / 2v2 pairings opt B within-tee-group (goldens-first, plan shown first) |
| 5.cj | 2026-10-01: §5.cb details: members see the group's whole ledger (§5h), non-group money only for games played; members see their groups read-only; a group's creator is NOT a member for visibility; match points drop the "+" (UI_CONVENTIONS updated) |
| 5.ck | 2026-10-05: Home = live game Continue card on top, then each group card with its latest game, then "Other games" (replaces collapsed list); §7 q4 closed — dark/light split was not deliberate, ALL design (theme, colour) waits for the branding session; hide-holes gets an unchecked wizard checkbox when each team is its own foursome; branch gate-speed shipped (push + merge + push main) on a green full gate |
| 5.cl | 2026-10-05: Create is the share moment (F-105 + B3): no Share in the wizard; "Create & send to players" opens the player-link sheet on the hub; hub's main button is "Send to players" until any score exists (organizer only); co-organizer link stays inside the sheet |
| 5.cm | 2026-10-05: Run it back (B1) copies the FORMAT; players + course pre-filled but expected to change (walk those steps, don't skip to Review); tees carry per player on the same course; handicaps = today's GHIN index; placement BOTH (finished-game hub button + "Start from a recent game" atop New Game; saved formats stay in "Your groups"); same field keeps teams (+ Rebalance), any change rebuilds; pot split carried when team count matches |
| 5.cn | 2026-10-06 DIRECTION (design open): F-037 is Team → Match → side games. Matchup size decides the matches; match results SUM to a team total for the pot; junk in-match but tallied by team; strokes off the low per match when matches are real; DEFAULT = match points (1/½/0 per match), holes won + net strokes as options; 3+ teams OK where counts rotate fairly. Next: design note for 8/12/16 players before code |
| 5.co | 2026-10-08: Team → Match questions answered: uneven rotations → app suggests pairings, organizer swaps; team-point ties CONFIGURABLE (push default, tiebreakers addable); team money CONFIGURABLE (winner pot default, place splits, $/point available); match = 1 pt default, Nassau-legs setting with adjustable points per leg; asked on Compete as proposed (off default); app builds tee groups from matches; ALL four money models stay with matches (pot default; legs = team that won more matches on that nine; $/hole = summed holes margin). T0–T4 approved |
| 5.cp | 2026-10-12: a late player never joins an existing match (no third ball); the matches carry on, and the organizer adds a SECOND game on the same round (e.g. 3 v 3 for the back nine, teams may differ, each pays on its own sides). Interim: hub Add player refused in a matches game. Multi-game-per-round is a new capability, BACKLOG |
| 5.cq | 2026-10-12: F-107 A + C — singles pairings are STORED on the tee group and SHOWN on its card; list order means nothing; an edit that breaks them is refused with the reason, never silently re-paired |
| 5.cr | 2026-10-12: multi-day trip (bar #11) = SERIES of ordinary games + money/points rollup (S2 §7 rec); S3 unnecessary; S2 = convergence + freeze (S2.0–S2.6 parallel, S2.7/S2.8 deferred); legacy tournaments stay legacy; S4 later = tournament read as a Series |
| 5.cs | 2026-10-12: S2 Qs — Q1 A legacy tournaments keep their engine; Q2 A own-tee stroke index for new rounds; Q3 FIX the ledger to use scoring's handicap function (nine basis honoured), pinned ledger == scorecard for every round shape × basis; T0 before/after shown before merge; Q4 A per-ball 2BB Stableford; Q5 A scale + scramble % as settings; Q6 B split stays legacy (→ §5.cp); Q7 A per-player Nassau (prorated); Q8 A pool skins rules; Q9 A index stands in; Q10 yes read-only export; split-round money = 18-hole CH on the card SI by default, per-nine 9-hole ratings chooseable (`moneyGames.splitRoundHandicap`) |
| 5.ct | 2026-10-12: F-108 opt A — strokes allocator gives the full handicap (floor(n/holes) everywhere + 1 on the hardest n mod holes; plus mirrored), no 2-a-hole cap; identical ≤ CH 36; then merge + push, new session |
| 5.cu | 2026-10-12: Series = games stamped `series {id, name, rollup, seq}` in the pool_games jsonb (no migration); the member is a ROUND (several per day possible, two games on one round both count), columns grouped by date, explicit seq; "Add a round", not "Next day" |
| 5.cv | 2026-10-12: Series is called "Event" on screen; starts from the group page ("Start an event") AND the wizard Review ("Part of an event?"); replaces Home's legacy "Multi-round event" for NEW play; "Add round N" on the event screen + every round hub (organizer, live or finished); TOTAL = finished rounds, live round + total labelled "Projected"; §5.ck Home-by-group built in the same branch |
| 5.cw | 2026-10-12: Event follow-ups — (e) guests on a round link see the event standings (keep); (a) "Not started" until a score (derived; no Projected, no Continue card); (b) organizer Rename on the event screen rewrites every round's stamp; (c) group page: one event row, rounds nested; (d) dashboard retirement ON HOLD: investigate every dependency first; its GHIN lookup + Course Lookup are "extremely necessary" and must survive; options to Craig before any change |
| 5.cx | 2026-10-12: dashboard KEPT as the Course & GHIN lookup page (any golfer by name/#, read-only); headers + not-found go to Home; F-110 A; F-111 group page adds by GHIN; Money Game + Quick game may go once proven in the wizard, Team tournament stays; F-113 fix approved, live games counted READ-ONLY only |

---

## 7. Open questions

q1–q8 are all closed (see archive §7 for how).

No open questions: q4 closed 2026-10-05 (§5.ck) — not deliberate; design waits for the branding session.
