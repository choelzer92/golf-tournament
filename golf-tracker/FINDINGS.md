# UI findings

Running log from the critique loop in `UI_CRITIQUE_PROCESS.md`. Each entry is an
observation with options — **nothing here is fixed until Craig picks an option.**

Severity: `P1` wrong data/money · `P2` visibly confusing or slow · `P3` cosmetic.
Phase: `[start]` `[track]` `[continue]` — the north star's three verbs.

Status flow: `open` → `chosen: X` → `fixed (commit)` → `verified (e2e)`

> Findings from the pre-harness code audit live in `UI_MODE_AUDIT.md`. That file
> is the *method* + the original sweep; this file is the ongoing log from looking
> at rendered screens. New findings go here.

> **Settled findings move to `FINDINGS_ARCHIVE.md`** (same pattern as
> `DECISIONS_ARCHIVE.md`): once a finding is FIXED/BUILT and verified with nothing
> left waiting on Craig, its full entry moves there verbatim and a one-line entry
> joins the index at the bottom of this file. Grep the archive by `F-0NN` when a
> task touches that topic — don't read it whole. This file keeps only the open
> working set.

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

### F-022 — 90% allowance applies to the ROUNDED course handicap; GHIN uses the unrounded one  [P1 MONEY] [track]

**Where:** `src/lib/game-state.ts:118` — `applyAllowance` = `Math.round(courseHandicap) × (allowance/100)`
**Reported:** Craig, 2026-09-09 — at Spring Creek ("3 star" tees, 90% allowance), a 7.6 index vs a
2.7 index showed **5** strokes in our app where the GHIN app showed **6**.
**Violates:** "Would a golfer trust this number?" — our strokes disagree with the app golfers check
against.

**Observed:** `applyAllowance` rounds the Course Handicap FIRST, then applies the allowance; its
comment claims that is USGA order. The World Handicap System's default is the opposite: *"the
unrounded course handicap is converted to a playing handicap by applying a handicap allowance"*
(rounding once, at the end). Rounding first is a permitted regional variation (CONGU/GB&I) — but
GHIN follows the USGA default, so whenever the two orders diverge our strokes are one off from the
app in everyone's pocket.

The report reproduces exactly on plausible Spring Creek numbers (slope 131, CR−par ≈ +1.8):

```
                       7.6 index         2.7 index        head-to-head strokes
course handicap        10.61 → 11        4.93 → 5
ours:  round(CH)×0.9   11×0.9=9.9 → 10   5×0.9=4.5 → 5    10−5 = 5
GHIN:  round(CH×0.9)   10.61×0.9 → 10    4.93×0.9=4.44→4  10−4 = 6
```

The divergence needs the fraction to straddle the rounding boundary differently in the two orders,
so it bites intermittently — which is worse than always, because the app "usually agrees with GHIN"
and then doesn't on game day.

**Blast radius if changed:** `applyAllowance` is deliberately the single shared allowance for every
scoring path (pool, tournament live scoring, money games, side games, quick game). Changing the
order changes strokes (and therefore money) on any un-settled game whose fractions straddle the
boundary. At 100% allowance the two orders agree except for the rounding of CH itself
(`getMoneyStrokesOnHole` re-rounds, so 100% games are unaffected). Off-the-low has its own
round-order note in `buildHcapMap` that assumes round-first; it would need re-deriving. Note the
related, still-unapplied off-the-low finding in the project memory (round-then-subtract).

**Options**
- **A. Match GHIN: apply allowance to the unrounded CH, round once at the end.**
  `applyAllowance` becomes `courseHandicap × allowance/100` with callers rounding as today
  (callers that display integers already round). One function, every path inherits it. Cost:
  strokes shift by 1 in the straddle cases; existing tests that pin round-first numbers need
  rewriting to the GHIN numbers; off-the-low order needs re-checking against the GHIN app.
- **B. Keep round-first, label it.** State "strokes may differ from the GHIN app by 1" somewhere
  honest. Cheapest, but the number golfers cross-check is the one we chose not to match, and the
  label reads as a bug admission.
- **C. Make the order a setting.** Configurable ≠ complicated is the north star, but this is a
  setting nobody can evaluate ("rounded or unrounded allowance basis?") — it fails the "sane
  default + showIf" bar. Included for completeness.

**Recommendation (REVISED after finding the history):** ~~A~~ — **collect fresh GHIN-app data
first.** Commit `3e8ace1` (2026-08-07) deliberately switched the app TO round-first because that
matched the GHIN app **at the same course** (Spring Creek 3 Stars, 90%, real case: "gave Cory 3
strokes where GHIN gives 2 — his 4.20 rounded down while the low man's 1.58 rounded up"), verified
against all 15 stored games plus a 180k-value property test. Craig's 2026-09-09 report says the
GHIN app now disagrees with round-first at the same course and allowance. Both observations can't
follow one rule — either the GHIN app changed, or the two cases went through different GHIN
features (the Aug case was **off-the-low front-9**; the Sep case reads like a **full-18 head-to-head
difference**), or one report's inputs differ from what we assumed. **Craig's standing rule is
"always match the GHIN app"** — so the fix is whichever order fresh side-by-side GHIN screenshots
show, captured for BOTH shapes (a 90% head-to-head difference AND a 90% off-the-low field) before
any math changes. What's needed from Craig: GHIN-app screenshots of the two players' playing
handicaps at 90% (the exact tees + indexes), ideally alongside what our app shows.

**Status:** FIXED 2026-09-09 per option A — Craig chose to switch to unrounded-first now (§5.bb),
on the strength of the USGA guidance ("apply the percentage to the unrounded Course Handicap …
round the final number") plus his same-day GHIN report, rather than wait for screenshots.
`applyAllowance` is now `CH × allowance/100`; callers round once. The Spring Creek head-to-head
(7.6 vs 2.7, 90% → 6 strokes) is pinned in `pool-game.test.ts`. The 3e8ace1 Cory case now computes
3 vs the 2 that was reported from GHIN in August — Craig accepted re-verifying on-course; if GHIN
disagrees again, §5.ba's both-shapes screenshot rule applies before any further change.

---

### F-023 — Some GHIN courses come back without usable slope/rating, and the app falls back SILENTLY  [P1 MONEY] [start]

**Where:** every `ratings?.find((r) => r.type === 'Total')` consumer (~20 sites); parse at
`app/pool/new/page.tsx:1440`, `getPoolPlayingHandicap` fallback at `lib/pool-game.ts:603-605`
**Reported:** Craig, 2026-09-09 — "some courses may not work properly in terms of slope and
rating, like the Meadows Greenbrier course in West Virginia".
**Violates:** "Would a golfer trust this number?"; §5.ac (prevent impossible data, don't reconcile it)

**Observed (code inspection — needs the real GHIN payload to confirm which case Meadows hits):**
the course-details parse maps GHIN's `Ratings` array straight through and every consumer looks up
`type === 'Total'`. When that lookup misses — a tee with no Total row, ratings under a different
label, nulls, or a 9-hole-only course whose tees carry only Front ratings — the compute paths
quietly degrade: `getPoolPlayingHandicap` **falls back to the raw handicap index as if slope were
113 and rating equaled par**, and other paths return 0. Nothing on screen distinguishes "computed
off this tee's 131 slope" from "slope missing, used your index". The wizard shows `Course
HCP: N` either way — a number that looks authoritative and is wrong on any course whose slope is
far from 113.

Also plausible for a resort like The Greenbrier: one GHIN *facility* holding several courses, where
the search result the user taps resolves to a CourseID whose TeeSets are empty or belong to a
different course of the facility. The search endpoint already has three fallback attempts
(`ghin-api.ts`), suggesting this API's shape wobbles.

**What's needed to confirm:** the actual `GetCourseDetails` response for that course (one
`console.log` away in dev, or Craig searching it in the app with the network tab open). Recorded
now so the observation isn't lost; the fix options depend on which shape comes back.

**Options**
- **A. Surface the degradation.** When a player's tee has no usable Total rating, say so where the
  handicap shows — e.g. "no slope/rating on this tee — using index" — instead of printing a
  confident number. Doesn't fix the data, but converts silent wrongness into something the
  organizer can act on. Small, safe, and worth doing under §5.ac regardless of the root cause.
- **B. Widen the parse.** Tolerate GHIN variants (missing Total but Front+Back present → derive
  18-hole values; alternate `RatingType` labels; string numbers). Needs the real payload first.
- **C. Both** — A immediately (it's true whatever the payload says), B once the Meadows response
  is captured.

**Recommendation:** **C** — A is justified today by the code alone; B waits on evidence rather
than guessing GHIN's shape.

**Status:** A FIXED 2026-09-09 — `teeHasRating(player, course)` (`lib/pool-game.ts`, unit-tested)
centralizes the check; the wizard field list now says "no slope/rating on this tee — using index
(N)" in amber instead of a confident "Course HCP: N" (skipped on the 'index' basis, where the raw
index is what the organizer asked for).

**B UNBLOCKED 2026-09-15 — Craig ran `scripts/fetch-course-payload.mjs "The Meadows" WV`**
(`course-payloads/the-meadows-5682.json`, gitignored raw). The payload is **CLEAN**: 6 tee
sets, every one carrying `TeeSetRatingId`, `TotalPar`, 18 `Holes` with `Par` + `Allocation`,
and Total/Front/Back `Ratings` with slope+rating. So the bad slope/rating Craig saw was NOT
missing GHIN data for this course — the hypotheses for the audit shift to:
1. **Gender-name collisions, confirmed on THIS course:** The Meadows has "White" and "Green"
   tees in BOTH genders with identical yardage but different ratings (men's White 67.5/125 vs
   women's White 72.6/133). Any surface matching a tee by NAME rather than id+gender shows the
   other gender's numbers. Audit: grep for name-keyed tee lookups (`defaultTeeName` matching is
   gender-aware in `tee-pick.ts` — verify every other path).
2. **Stored older games** parsed by earlier code (before F-038's sort, before gender fixes) —
   inventory live rows rather than re-fetching.
3. The per-player-tee display bug in project memory (`project_tee-per-player-bug`).
The single-course facility answer: search returned exactly one course (5682), so the
multi-course-facility hypothesis is dead for the Meadows. Fixture + parse tests belong to the
audit session; trim the payload before committing anything.

---

### Friend-feedback intake, 2026-09-10 (F-028 … F-033)

One friend's written batch, split per §5.bf: each item verified/triaged on its own,
none taken as fact. His two QUESTIONS are answered here, not filed as work:

- **"Do men's and women's hole handicaps get factored in?" — YES, already built.**
  `playerHoleStrokeIndex` (`pool-game.ts:514`) reads each hole's stroke index from
  THE PLAYER'S OWN TEE, precisely because men's and women's tees rank difficulty
  differently (the code cites Spring Creek differing on 14 of 18). Worth TELLING
  him — that it wasn't visible to him may itself be a UI finding.
- **Future thoughts** (individual stat tracking; export scores to GHIN) → Ideas
  section of BACKLOG.md. Stats partially exist at /home/stats; GHIN score posting
  needs API research before it's even shapeable.

---

### F-030 — Score entry ↔ leaderboard round-trip is too many taps  [P2] [track]

**Report:** "I want to be more easily able to go back and forth between the score
entry and the leaderboard as 'captain'."
**Triage:** count the actual taps each way before proposing (scorecard → hub →
leaderboard → back?). A standing-on-the-tee flow. Candidate shapes: a leaderboard
shortcut on the card, or standings summarized ON the card (§6b already says "show
standing without leaving the card" — check what exists for pool games).

**Status:** open — measure the current path first.

**Verified 2026-09-10** (`f028-scorecard-phone.png`, `f028-leaderboard-phone.png`,
`f030-back-on-scorecard-phone.png`): the mechanics are better than the report implies —
**1 tap each way**, and the return leg PRESERVES state (left on Hole 8, came back to
Hole 8). Scorecard header has "Leaderboard" (top-right, small green text on dark green);
leaderboard header has "Scorecard" (top-right, small yellow text). So the finding is not
tap count; it's **discoverability/affordance**: both are low-contrast text links in the
header corner, visually identical to "Back" beside them, nothing signals they're the
primary toggle. Craig (2026-09-10, mid-session): "it isn't intuitive to switch back and
forth… maybe a better method like a swipe, or a cleaner button to switch."

**Options**
- **A. Swipe between card and leaderboard** (horizontal swipe or swipeable tabs on both
  screens). Most native-feeling; cost: gesture is invisible until discovered, and swipe
  already means prev/next hole on the card — conflict risk is real.
- **B. Segmented toggle in the header** — a two-tab pill [Card | Standings] centered in
  the header on BOTH screens, same position, same look. One tap, self-describing, no
  gesture conflict. Cost: header space on a 390px phone.
- **C. Standings strip ON the card** (mini-leaderboard: rank + pts for each player,
  collapsible, above the grid) — §6b's "standing without leaving the card". Removes the
  need to switch at all for the glance case; full board stays a tap away. Cost: vertical
  space while entering scores.
- **D. Leave as is** — 1 tap, state preserved; label the links better (e.g. "⇄ Standings").

**Recommendation:** B now (cheap, discoverable, symmetric), C as the deeper fix for the
"captain glancing between shots" moment — they compose.

**BUILT 2026-09-10** (opt B, Craig's pick; commit a22e359): shared `CardBoardToggle`
pill ([Card | Standings], white-on-translucent) replaces the corner links on the pool
scorecard header and BOTH leaderboard variants; tournament flows keep their links.
NOTE learned building the e2e: the card resumes at the FIRST UNSCORED hole on remount
(by design, play/page.tsx) — it is not a preserved cursor; browsing without scoring
doesn't stick. Opt C (standings strip on the card, §6b) remains open as the deeper fix.

---

### F-033 — "1v1 and more 3-player game types" — mostly EXIST; he can't find them  [P2] [start]

**Report:** "1v1 game types and more 3-player game types (or the capability to
create them)."
**Triage — the §5.bf case in miniature:** the capability is largely BUILT. 1v1:
Sides/Match plays at `playersMin: 2` (team-game.ts:689, lowered deliberately —
singles match front/back/overall). 3 players: Nines is EXACTLY 3 (nines.ts:128);
skins/quota/Stableford/low-total all take 2–3; Wolf variants exist. So the real
finding is DISCOVERABILITY: does a 2- or 3-player field make these visible enough
(fit badges exist per F-020)? Verify what a 2/3-player wizard walk actually offers
before building anything new. If a specific game he wants is missing (e.g. 9-point
game variants), that's a one-file mode add — ask him WHICH game he missed.

**Status:** open — walk the wizard at 2 and 3 players; likely an exposure fix + an
answer back to him, not new modes.

**Verified 2026-09-10** (`e2e/screenshots/f033-details-2p.png`, `-3p.png`; sandbox walk
at phone width): the triage holds — the games EXIST and the wizard even knows it. At
2 players the picker offers Skins/Stableford/Quota/Low Total/Sides-Match all badged
"✓ 2 players"; at 3, those plus Nines "✓ 3 players". **The discoverability gap is
real and specific:**

1. **The picker DEFAULTS to "Pool (foursomes vs foursomes)"** — for a 2- or 3-player
   field, the one game that makes no sense. The screen then fills with pool money
   settings, so a 2-player organizer sees a foursomes game with no hint anything else
   exists.
2. **The fit badges only render inside the OPEN dropdown** (native `<select>` option
   labels). Closed — which is how the screen loads — nothing says "6 games fit your 3."
3. The classic pool never gets a badge or a fit warning at any field size (descriptor-
   less = always fits), so it isn't even marked as odd at 2 players.

**Violates:** north star (possibility invisible = possibility absent); §5.ao (the app
knows the rule — playerCount — and doesn't spend it as guidance here).

**Options**
- **A. Fit-aware default: with ≤3 players, default the picker to the best-fitting game
  instead of Pool** (e.g. Sides/Match at 2, Nines at 3 — or simply the first fitting
  mode). Pool stays one tap away in the list. Cost: "default" choice needs Craig's
  pick; a saved format still wins per §5.av.
- **B. Keep Pool as default, add a hint line under the picker when playerCount ≤ 3:**
  "With 2 players you can also play: Sides / Match, Skins, Stableford…" — reuses
  `modeFits`, mirrors the existing amber fit-warning pattern, changes no defaults.
- **C. Leave it; answer the friend** that the games are in the dropdown. Cheapest, but
  the friend DID open this screen and still couldn't find them — evidence C fails.

**Recommendation:** B (guidance without changing anyone's default), possibly + A later.
**Answer back to the friend:** 1v1 = "Sides / Match" (plays at 2, front/back/overall);
3-player = Nines/Split Sixes, plus Skins/Quota/Stableford/Low Total at 2–3. If a game
he wanted is still missing, name it — a new mode is one file.

**BUILT 2026-09-10** (opt B, Craig's pick; commit 60e5fe2): sky-toned hint line under
the picker when the pool is selected with ≤3 players, listing the fitting modes via
`modeFits`; picking a real mode dismisses it; default stays Pool. Opt A (fit-aware
default) deliberately not done. e2e `F-033` ×2 (2p, 3p, absent at 4).

**Craig (2026-09-10):** the friend used the app BEFORE this branch's changes deployed —
so what he saw may predate the F-020 fit badges and the current mode list entirely. The
verification above is of THIS branch; his experience was of live/main. Part of the
answer back may simply be "update: they're there now / clearer once the branch ships."

---

### F-037 — Eight players who want "two separate 2v2 best-balls" can't say so — and Craig can't tell what IS possible  [P1] [start]

**Reported:** Craig, 2026-09-10 — "how would I run 4v4 if it's not a pool? like 2v2 and
2v2? I'm confused at why I can only choose pools" and "once I've chosen a player pool, I
should be able to choose how many teams. like two different 2v2 best balls going on
between 8 players — I'm not sure I could set that up."

**What the app CAN do today (verified in code):**
- **4v4 best ball, 8 players, no pool:** BUILT. Sides/Match (`team-game.ts`,
  `playersMax: 8`) + the F-020 shape chooser offers `[4,4]`; F-019 playing groups
  split them into two foursomes; §5.ae settles sides pairwise. It exists — Craig
  didn't find it, which per the north star is the same as not existing.
- **2v2v2v2, one game:** BUILT (same screen, `[2,2,2,2]` shape) — but that is FOUR
  sides in ONE round-robin settlement: every pair competes against every other pair.
- **Two INDEPENDENT 2v2 matches (A&B vs C&D, and separately E&F vs G&H):** NOT
  expressible in one game. A sides game has one settlement pool across all its sides;
  the only partitioned-competition container is the classic pool (foursome vs foursome,
  or 2-foursome head-to-head via matchups). The workaround — create two separate
  games — splits the ledger, the share link, and the evening's recap.

**Two findings inside the report:**
1. **Capability gap:** "sides" and "who settles with whom" are conflated. The approved
   team-competition plan (pool-team-competition-plan, §5g N-sides engine, NOT built)
   is the designed home for N-teams-of-K; independent PAIRINGS of sides (bracket-style
   "these two settle, those two settle") is a further axis nobody has designed yet.
   Craig's mental model — field first, then "how many teams", then the game — is §5.au
   EXACTLY (field → game → …); what's missing is the structure question after the field.
2. **Discoverability (F-033's older sibling):** at 8 players the picker still defaults
   to Pool, and nothing says "Sides/Match handles 4v4 or 2v2v2v2 here." The F-033 hint
   line was built for ≤3 players only — the same confusion at the other end of the range.

**Options**
- **A. Extend the F-033 hint to larger fields:** when playerCount ≥ 5 fits a sides game,
  say "8 players can also play Sides/Match — 4v4, 2v2v2v2…". Cheap, discoverability only.
- **B. Design the pairings axis:** let a 4-side game declare A↔B and C↔D settle
  independently (two matches, one game, one recap). Real design work — feeds the
  team-competition plan rather than a quick fix.
- **C. Both: A now, B into BACKLOG as a design task attached to the team-competition plan.**

**Recommendation:** C. Answer to Craig's question directly: 4v4 IS there today (choose
Sides / Match at 8 players, pick the 4v4 split); two independent 2v2s needs two games
for now.

**Status:** open — awaiting Craig's read; nothing built.

**Craig, same session, two more data points that sharpen this into a NAMING finding:**
"if I choose 4 players playing, how can I just make it 2 v 2?" and "I also can't make a
2v2 game anymore for some reason. or not sure how." The capability is fully built — at
4 players, pick **"Sides / Match"** in the game picker and the sides step defaults to
2v2 — but the mode was RENAMED from its 2v2-era label to "Sides / Match" (team-game.ts:681,
the F-019 widening), and nothing in the picker says "2v2" anymore. Craig, the app's
OWNER, could not map "I want 2v2" to "Sides / Match": the strongest possible evidence
that the label lost the game's most common name. §5.at in reverse — the rename dated
the VOCABULARY users search by, not a limit. Option D for the list above: **rename or
subtitle the mode so "2v2" appears in the picker** (e.g. "Sides / Match (1v1, 2v2, up
to 4v4)") and/or make the description line say it before a mode is even selected.

**Craig, after finding it (2026-09-10):** "i figured out the 2 v 2 game, but its not
clear to me" — locating the mode didn't resolve the confusion. The problem isn't only
the label; the flow from "Sides / Match" to an actual 2v2 doesn't announce itself
either (the sides step arrives without saying "this is where your 2v2 happens").

**Partial fix 2026-09-14 (5028c54):** the sides step now says what it makes — "This
makes it a 2 v 2 match" (derived from the data, so any split describes itself).
STILL OPEN: the picker label itself (option D: subtitle "Sides / Match" with "1v1,
2v2, up to 4v4"), the ≥5-player fit hint (option A), and the pairings axis (option B,
design work for the team-competition plan).

---

### F-039 — Meadows side game: "everyone is the same color, and says Bill and Bill after them"  [P2] [track]

**Reported:** Craig, 2026-09-10, live game `47d97408` ("sidestest", The Meadows, 5
players, Sides/Match best-ball, off-the-low 95%).
**What the stored game says (read from tonight's snapshot):** sides persisted fine as
legacy `subTeams` — side A = Bill McAuliffe & Bill Grupp, side B = Briggs, Brandon &
Morgan (a 2 v 3). Assignment WORKED; this is a display problem, not lost data.

**Two symptoms, likely two causes:**
1. **"Bill and Bill"** — CONFIRMED by code: `sideNameFrom` (team-game.ts:101) builds a
   side's auto-name from its first two members' FIRST names. Side A is literally
   "Bill & Bill" — two Bills. FIXED 2026-09-14 (8ab44fd): a first name shared by anyone
   in the game gains a last initial, game-wide ("Bill M. & Bill G."); unit-tested
   including the different-sides and single-word-name cases.
2. **"Everyone is the same color"** — NOT yet reproduced. The scorecard colors rows
   blue/red off `player.team` ('A'/'B'), tagged in `pool/[id]/page.tsx:229-234` when
   `sides.length <= 2`. This game IS two sides, so tags should apply. Suspects: the
   2v3 uneven split, the `subTeams` legacy load path, or Craig was on a different
   screen (hub sides editor / scorecards page) whose buttons don't color. NEEDS a
   screenshot repro in the sandbox: 5 players, 2 sides (2v3), open the scorecard —
   blocked tonight on port 3000/3200 being held by Craig's own dev server.

**Status:** naming half FIXED 2026-09-14 (8ab44fd); color half still needs a sandbox repro
(5 players, 2 sides 2v3, open the scorecard).

---

### F-049 — Share-link players and invite-code owners have no "who am I" anywhere in the pool surfaces  [P2] [continue]

**Screen:** game hub + scorecard as a token visitor · `share-audit-12/13`; owner landing · `share-audit-04`
**Violates:** "who am I" clarity (this audit's named rough edge); UI_CONVENTIONS §6c (rejoining is frictionless — and should be *legible*)

**Observed:** identity is shown in exactly two places, both GHIN-gated (`/home` "Welcome
back, {name}", `/pool`'s "Showing games created by {name}"). A share-link player sees NO
indication of who the app thinks they are, on any screen — they infer their access level
from which buttons are missing. An invite-code owner who never GHIN-logs-in likewise has
no identity anywhere. Sign Out exists only on /home and /dashboard — nothing pool-side
(the "sign-out scattering" edge: it's not scattered, it's absent where guests live).

**Why it matters:** the friend mid-round who taps the wrong team's Enter Scores has no
cue that the app doesn't know who they are. And feedback notes from guests arrive with
`authorName: ''` — anonymous by accident, not by choice.

**Options**
- **A. A quiet identity line in the pool header** ("Viewing as guest · scoring link" /
  "Craig Hoelzer"), tappable for the sign-out / switch actions. One shared component.
- **B. Only fix the guest case:** a one-time "You're here via a scoring link — pick your
  team to score" hint on first open. Smaller; doesn't help the signed-in confusion.
- **C. Leave it.** The button-visibility differences are the identity display.

**Recommendation:** A — it consolidates F-047's relabeled sign-out, this, and the
scattering into one small header affordance.

**Status:** PARTLY FIXED 2026-09-14 — the game hub header now says "Viewing as {name}"
(identified) or "Viewing as guest · scoring link" (token guest); e2e `F-049` ×2. Still
open from option A: making it tappable (sign-out / switch) and extending it beyond the
hub — fold into whichever session touches the pool header next.

---

### F-060 — The team-build method cards don't read as ACTIONS; Craig couldn't "choose" Captains' deal  [P2] [start]

**Reported:** Craig, 2026-09-15 — "the snake draft or 'captains deal' sort of ordering
for pools seems to not work, i cant click that option" then, clarifying: "i dont
understand how i choose the captains deal?"

**Diagnosed (sandbox, desktop AND 390px phone; screenshots
`walk-17/18-pool-*`, `tmp-deal-phone-*`):** the mechanics WORK on both surfaces —
tapping the "Captains' deal" card on the wizard's Set Teams step builds the teams
(verified: best captain took the worst players, 46 vs 42 combined), and the game hub's
edit-teams panel has its own working "Captains' deal" button. The finding is
comprehension, not a defect, and the screen shows why:

1. **Two rival triggers.** The Captains panel leads with a big green **"Build balanced
   teams around captains"** button; three grey method cards sit far below under "How
   should teams be built?" — and the first card ("Even them out around the captains")
   DOES THE SAME THING as the green button. The screen's one emphatic action competes
   with the actual choice.
2. **The method cards read as descriptions, not buttons.** Grey border, no verb, no
   chevron; the instruction ("Pick one to build them now") is small grey text. Craig —
   the owner — didn't understand that tapping the card IS the choice. F-037's logic
   applies: the owner not finding it is the strongest evidence it's invisible.
3. **No state afterwards.** `teamBuild.method` knows how the teams were built, but the
   cards show nothing — after a tap, the screen looks the same except the list below
   changed, off-viewport at phone height.

**Options**
- **A. Make the method cards actions with state:** verb labels ("Deal teams now →"),
  button styling, and after building, a "✓ Teams built by Captains' deal" chip on the
  used card (from `teamBuild.method`, already tracked). Contained, no flow change.
- **B. Merge the rivals:** the Captains panel's green button becomes the method list —
  one box, "How should teams be built?", pick = build. Removes the duplicate trigger
  entirely; bigger rework of a screen that already works.
- **C. Answer only** (tap the card). Evidence against: the owner asked twice.

**Recommendation:** A now (mechanical, testable), consider B inside the game-structure
design work (§5.bj) where this screen gets rethought anyway.

**Craig, same session, third message:** "it says pick one to build them now, (where do i
pick) when i click the boxes nothing happens, cant even tell im touching them. then says
or drag nobody at all, what?" — confirming diagnosis point 3 as the heart of it (the
result is off-viewport, the tap shows nothing), plus a fourth defect: **the "Or drag
nobody at all" line describes an interaction that doesn't exist** (assignment is by
"Move to" menus, not dragging).

**Status: opt A BUILT 2026-09-15** (8ef4ebc, while Craig was stuck live): method taps
scroll to the built teams; the used card shows "✓ Built these teams" (demotes to
"(hand-adjusted since)" after a manual move); touch pressed-state on the cards; copy now
says "Or build nothing — put each player on a team by hand with the 'Move to' menus
below." e2e `F-060` at phone width. STILL OPEN: opt B (merge the rival green
"Build balanced teams around captains" trigger into the method list) — feeds the
game-structure design; and hub edit-teams parity (its buttons sit next to their result,
so the confusion is milder there).

---

## Settled — full text in FINDINGS_ARCHIVE.md

One line per archived finding; the full entry (observation, options, status, and
what was learned) moved verbatim to `FINDINGS_ARCHIVE.md` — grep it by F-0NN.
The 11 fixes from the original pre-harness code audit are separate and covered
by `e2e/verify-fixes.spec.ts` (side names on both screens, 9-hole leg collapse,
field-size tie detection, single-group vocabulary, money formatting, and
close-out → completed); their write-ups live in `UI_MODE_AUDIT.md`.

| # | What it was, and how it ended |
|---|---|
| F-003 | `/home` unreachable behind `HOME_V2` — flag flipped true with a "Classic dashboard" escape hatch (option B); DONE 2026-08-12 |
| F-004 | Share-link guest saw every organizer control — mutating controls hidden at `pool` access (the READ-ONLY vs MUTATING line); FIXED + VERIFIED |
| F-006 | Pool teams hard-typed to best-ball — engine generalized to any format/basis and N sides (option C), 4 money bugs fixed en route, ~860-case sweep, pot money model added; DONE both halves |
| F-007 | Junk sub-pot vanished when nobody scored junk — unscored junk is a tie, `distributePot` handles it (special case deleted); FIXED + VERIFIED |
| F-008 | Stats "By group" listed saved formats — uses `getPlayerGroups()`; FIXED + VERIFIED |
| F-009 | "By player" lens duplicated Overall — reframed to My money / By group / By game with field-wide money group-scoped only; BUILT + VERIFIED |
| F-010 | 61-member group page was 5,249px of Remove buttons — now a group dashboard (1,562px), members collapsed + searchable, Remove confirms; BUILT + VERIFIED |
| F-011 | Mid-round pot not zero-sum on an un-started leg — a leg nobody started is a dead heat and splits evenly; FIXED + VERIFIED |
| F-012 | Order-dependent one-ball payout had a live twin in the 2v2 engine — `sideNet` takes the minimum, both entry doors closed; FIXED + VERIFIED |
| F-014 | "Side C/D/E/F name" boxes for a two-side game — all six keys left the schema; names live on `GameSide.name` via one shared `SideNames` control; FIXED + VERIFIED |
| F-016 | Legs settled on unequal hole counts paid the walk-in — contested-holes comparison + void-short-legs prompt at close-out (§5.ai); FIXED + VERIFIED, both halves |
| F-017 | `legs` money paid nothing on a top-two tie at 3+ sides — pairwise settlement per §5.aj; FIXED + VERIFIED |
| F-018 | Wizard review step never mentioned the sides — sides block with members, resolved names, and who-pays-whom stakes; FIXED + VERIFIED |
| F-019 | Side games had one playing group for everybody — groups now independent of sides, engine unions all matchups (was a live money bug at 8 players); BUILT + VERIFIED |
| F-020 | Player count validated games instead of recommending — fit badges in the picker + split proposals at the sides step (option D); BUILT + VERIFIED |
| F-020† | (unnumbered, attached to F-020's block) Nassau board's "thru 9" read as a hole number — reads "9 of 9 holes"; ALREADY FIXED, verified on screen |
| F-021 | A saved format still asked all 15 questions — step 1 collapses to a summary + per-section [Change], 24 → 10 controls; BUILT + VERIFIED (§5.ax) |
| F-024 | Per-person money strip could sum to +$4 — round the magnitude, not the signed value; FIXED |
| F-025 | Skins review said "Foursomes" with a meaningless combined CHcp — individual games get their own Players block; FIXED |
| F-026 | Review showed no stakes for an individual game — `formatSummaryLine` on review + "Save this format" (§5.ax part 4); FIXED |
| F-027 | Group members rendered blank names — writers trim + upsert refuses to blank a stored name + `GHIN #…` fallback; live query found zero bad rows, no backfill; CODE-FIXED |
| F-028 | Stableford per-hole points shown nowhere — details grid renders the engine's `perHole` points for points-metric games; BUILT |
| F-029 | Stroke dots too faint — bigger, higher-contrast dots on both surfaces, CSS-only so money can't desync; BUILT |
| F-032 | No payout recap at Finish — close-out panel grows a "Who pays whom" list via `gameRollups()` → `settleUp()`; BUILT |
| F-035 | Groups step showed 16-decimal handicaps — `Math.round` at the render site like its sibling steps; FIXED |
| F-036 | Reshaping to more sides minted duplicate ids (A, B, C, C) — list built with a reduce so each id sees those already minted; FIXED |
| F-038 | Tees rendered in GHIN payload order — sorted longest-first per gender at parse (default-tee CHOICE noted for the course-data audit); FIXED |
| F-040 | Add-player stack ordered by API history — one shared `AddPlayerPanel` on all four surfaces: name search first, manual with a no-GHIN note, bulk GHIN paste behind a disclosure; BUILT |
| F-043 | Handicap arithmetic was a black box — tap-to-open chain disclosure (`explainPlayingHandicap`), pinned to the real math by test; FIXED |
| F-045 | Junk on by default on a fresh classic pool — starts $0 behind "Add bonuses", junk pot-quarter folds into Overall; Craig signed off, merged (§5.bg) |
| F-046 | A format saved from a group's game didn't surface when starting that group's next game — save attaches to the group + picker leads with "{Group} plays"; FIXED, both threads |
| F-005 | Wizard step 1 was a 20-control tax form — labels became questions, group picker moved to step 1, money moved to its own "What's it worth?" step (14 controls), 44px targets; ADDRESSED |
| F-031 | Playing Stableford you couldn't see to-par — "To par" column in the individual standings (gross vs par, valence colours); opt B (card superscript size) DEFERRED by §5.bj |
| F-034 | A group pick "recommended" a stale draft name — auto-fill provenance tracked (`autoNamedFrom`, survives the draft); stale fills replaced, typed names never touched; BUILT 2026-09-15 |
| F-041 | "Stableford — 4 too many" read as refusal — misfit note redirects to team Pool / Sides; mode-id bug (`stableford-ind`) caught by its own e2e; the structure direction became §5.bj's design arc; FIXED |
| F-042 | Money toggle asked a question nobody was asked — "Who competes against whom?" (All teams, for a pot / Two teams, head-to-head); move-after-teams idea lives with the structure arc; FIXED |
| F-044 | Pot-split + 85↔90 flip looked arbitrary — "The usual split for N teams — edit any leg" + USGA notes name their driver; per-group split default idea → backlog Ideas; FIXED |
| F-047 | Sign Out kept the cookie and identity — `logout()` clears access cookie + durable identity everywhere; FIXED |
| F-048 | Any 24-char key opened any game — `shareTokenMatches` finally wired, friendly refusal screen; FIXED |
| F-050 | The invite gate explained nothing — copy says the same code repeats for returners; FIXED |
| F-051 | 48h cookie expired mid-week for a weekly game — 30-day SLIDING expiry (A+B combined); FIXED |
| F-052 | Legacy-link organizer past the fence hit a blank wizard — fence redirects to /pool; FIXED |
| F-053 | Expired-GHIN returner greeted like a stranger — login page greets by name from the durable identity; FIXED |
| F-054 | Phone-width roster rows hid every name — two-line rows, name always visible; FIXED |
| F-055 | Two parallel group-management UIs — consolidated on /home (§5.bh), GroupsManager deleted, /pool/roster = saved players only; FIXED |
| F-056 | The legacy-link game runner couldn't share — Share sits outside the poolOnly guard; FIXED |
| F-057 | One guest tap earned a month of create access — cookie lifetime follows access level (guests 48h, full 30d sliding); FIXED |
| F-058 | Share QR came from a third party and died offline — local `QrImage` (qrcode dep); FIXED |
| F-059 | "Sees everything" was keyed to the invite code — `isAppOwner()` = full access + owner GHIN (§5.bi); env var set + verified live 2026-09-15; FIXED + ACTIVATED |
