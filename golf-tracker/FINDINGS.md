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

### F-121 — A team game's "$10 a leg" is per TEAM, a classic match's is per PLAYER (2026-10-13)  [P2] [beta #6] — **EVEN TEAMS BUILT 2026-10-13 (§5.dd, display only): stakes asked/shown per player, standings "+$5 each"; uneven-team payout rule waits (goldens first)**

Found while building F-115's label. The classic head-to-head pool's legs are per player (`legDollars`,
`pool-game.ts:141`; its money step says "Match Payouts ($ / player)"). The team game (sides engine) settles
each leg per TEAM, and `perPlayerNets` splits it evenly across the team's players. So a 2v2 team game at
$10/$10/$10 risks $15 a player, not $30, and its money step's "Front 9 ($)" doesn't say which. Golfers
usually mean "$10 Nassau" per man. §5.db: the label states the per-player figure ("$15 Nassau ($5/$5/$5)"),
and no math changed. **Options:** A, label the team game's inputs "$ / team" (no math change). B, make
team-game stakes per player for NEW games (a money change, so goldens first, and legacy games keep
computing per team, as S2 Q1 does). C, leave it (the label already tells players the truth).
**Rec A now; B is worth asking in the S2 convergence.**

### Bar #11 walk record (2026-10-13): a 3-day trip from a group, measured

`e2e/event-walk.spec.ts`: the Tuesday Crew (8 players, no saved formats). Group → Start an event → 7-step
wizard → round 1; score both foursomes; event standings; Add round 2 (next day); Add round 3 (same
day, a 36-hole day); settle. Screens: `e2e/screenshots/ewalk-01…45`. **It works end to end:** three
rounds over two dates, Total zero-sum, a four-line settle-up. Every Finish Game on the last card
closes the round by itself, so no separate Close out is needed.

| Phase | Taps |
|---|---|
| Group → round 1 created (incl. typing the event name) | 13 |
| Score one foursome, 18 holes (4 pad taps + "›" per hole, open + Finish) | 91 |
| Add round 2 (Add round → 6 × Next → Create → close the sheet) | 9 |
| Add round 3 on the same day (+ fix the date by hand) | 10 + a date picker |
| Settle (open the event) | 1 |

Findings F-114 to F-120 below. One not logged: "+ Add round N" showing before a round has scores is §5.cv by design.

### F-120 — "Same game as last time" describes a head-to-head game as a $25 pot (2026-10-13)  [P2 money text] [beta #11 #3] — **FIXED 2026-10-13 (opt A, §5.cz, 661d790)**

Add round 2 / round 3 of a classic head-to-head event: steps 2 and 3 show "Same game as last time — Pool ·
$25/player pot · off the low · 90%" (ewalk-22/23). The game is $10 a leg + $5 junk, and the copy IS right:
step 7 and the created hub both show $10/$10/$10 + $5. **Cause:** `stakesSummary`
(`game-modes/summary.ts:81`) has no mode for a classic pool and only states `entryPerPlayer`, ignoring
`moneyMode: 'match'` and its leg dollars. Every copy of a classic head-to-head game (Add round, Run it back,
a saved format with moneyMode match) says the same. On step 3 it's the only thing on screen. No money math is
wrong. **Options:** A, the classic-pool summary reads `moneyMode` ("$10 front / back / overall, $5 junk"); a
unit test per money mode. B, drop the stakes part for classic pools. **Rec A.**


### F-119 — Event walk polish (2026-10-13)  [P3] [beta #11] — **a–e FIXED 2026-10-13 (§5.cz); g dropped (dates may go, F-116)**

From the bar #11 walk (screens `ewalk-*`):
- **a.** A closed round's hub still leads with big green "Enter Scores" buttons on every foursome, and the
  payouts sit below them at the bottom (ewalk-19, 44).
- **b.** The Finish Game dialog says "This cannot be undone", but the closed hub offers "Reopen game".
- **c.** The 1–8 score pad wraps its "8" onto a line of its own at 390px (ewalk-15, 29).
- **d.** On rounds 2+, step 1 lists the whole 61-player roster unchecked-first, and highlights no group
  chip (ewalk-21). Round 1 showed just "TUESDAY CREW · 8".
- **e.** Saved formats show among "Your groups" as chips with 0 players ("Saturday Nassau 0").
- **f.** The card header reads "Stroke Play" while the hub says "Head-to-Head Match". The "124 · thru 18" has
  no unit, and the hub doesn't say which scores count (that last part is already in BACKLOG).
- **g.** Hint grammar: "Its last round was Tue, Oct 13."

Options: fix each as a one-liner (recommended for a–e, g); f waits for the BACKLOG item.

### F-118 — "Start an event" asks nothing about the event until the bottom of step 7 (2026-10-13)  [P2] [beta #11 #1] — **FIXED 2026-10-13 (§5.cz, 661d790): a blank name = "game type – course"**

The organizer taps "Start an event". Six steps then go by with no mention of it, and the event name is an empty
field under bonuses and Hide holes (ewalk-11). It's easy to create round 1 of an unnamed trip.
**Options:** A, when launched from "Start an event", the Review scrolls to and focuses the event field
and Create is disabled until it has a name. B, ask the event's name first (on step 1, one field). C, leave it.
**Rec A:** it changes no step order (§5.e).

### F-117 — Every round in an event is named after the group (2026-10-13)  [P3] [beta #11] — **FIXED 2026-10-13 (§5.cz, 661d790): rounds default to "game type – course"**

All three rows read "Round N · Tuesday Crew" (ewalk-45), and so do the hub titles. The name adds nothing, and
Home's Continue card can't tell rounds apart by name.
**Options:** A, a round added to an event defaults its name to the day and slot ("Wed AM", "Wed PM") or
"Round 2". B, the event rows show the format/course and drop the name. C, leave it (rename by hand).

### F-116 — 36-hole day: the date defaults to the next day, and the fix is a date picker (2026-10-13)  [P3] [beta #11] — **BUILT 2026-10-13 (§5.dc): rounds run in set-up order, movable on the event screen; the date is optional and starts blank**

Round 3 on round 2's day: Review suggests the day after the last round. The only cue is small grey text,
"Playing 36 that day? Set the same date", and the organizer edits a native date picker (ewalk-38/39).
**Options:** A, a "Same day as round 2" chip beside the date (one tap). B, default to the last round's date
when that is today. **Rec A.**

### F-115 — "Head-to-head" means two different things in the wizard (2026-10-13)  [P2] [beta #1] — **LABEL BUILT 2026-10-13 (§5.da/§5.db, ff57f3b); step 2 → matchup-visual design note `.claude/plans/matchup-visual.md`, Craig picks**

Step 2 asks "Head-to-head matches? **No**" (F-037's individual matches). Step 7 then titles the game
"2 teams of 4 · **head-to-head**", Type "Match", and picks "**Head-to-head match** — fixed $ per front / back /
overall" (ewalk-04 vs ewalk-11). The hub says "Head-to-Head Match" too. A first-timer reads it as their
"No" being ignored. **Options:** A, call the money model by what it pays: "Nassau: fixed $ per front / back / overall",
with the hub/subtitle following. B, rename the step 2 question "Players matched up inside the foursome?".
C, both. **Craig's call (vocabulary).**

**2026-10-13, Craig's answer on the MONEY label (§5.cz):** state *total risked · game type · teams ·
scoring · split*: "$20 match play 18 holes", "$30 Nassau 2v2 match play ($10/$10/$10)", "$30 Nassau 4v4
best net & best gross ($10/$10/$10)". Rules to confirm before building:
1. "Total risked" = one player's legs summed (per player, as the legs are today).
2. "Nassau" when front, back and overall are all set. One leg alone names its holes ("18 holes", "front 9").
   Front + back only = "front & back"?
3. Scoring word: "match play" when legs go hole by hole, "stroke play" when they're totals.
4. Format: shown when it isn't plain best ball (the third example names "best net & best gross").
5. Junk stays a separate "+ $5 a junk point".
6. Where: the money step's option, the hub's money card, the game-kind subtitle and the summary line.
   A pot keeps "$25 pot".

**Step 2's match question: discuss first.** The question shows only when every team is bigger than the
match size (`matchSizesFor`, `matches.ts:455`). Teams of 2 get "1 v 1" only (two singles in place of the 2 v 2);
teams of 4 get 1 v 1 or 2 v 2. So for a 2 v 2 the team IS the match, as Craig says. The question is really
"split a bigger team into smaller matches?". Options:
- **A. Ask it as "How do the teams play each other?"** with the default first: "As whole teams (4 v 4)" / "In
  pairs: two 2 v 2 matches" / "One on one: four 1 v 1 matches". It always shows an answer, never a bare "No".
- **B. Make it part of the team choice:** step 2's list grows "Two teams of 4, played as 2 v 2 matches" etc., and
  there's no second question.
- **C. Show it only for teams of 3+**, so a 2 v 2 never sees it (singles inside a 2 v 2 stay reachable under "Other").

**2026-10-13, settled (§5.da):** the label ALWAYS names the format (best ball too); scoring is match or
stroke play, and Stableford either way. A pot reads "$200 pot ($25 each) · 2 teams of 4 · best net & best
gross · stroke play · Pays front / back / overall / junk (25% each)", or "Winner takes all". Step 2 = **option A**,
but decided early with a movable matchup visual: a **design note first** (next session). Front + back only
= "$40 front & back ($20/$20)", and every partial bet follows that pattern.

### F-114 — The event standings are clipped on a phone at 3 rounds (2026-10-13)  [P2] [beta #11] — **→ design session (§5.cz/§5.da): "very clear and inviting so users enjoy the app"**

At 390px the R3 column is cut mid-number and its header reads "R" (ewalk-45). Nothing says the table scrolls
sideways, and the "Wed, Oct 14" header looks like it covers R2 only, so the 36-hole day doesn't read as one day.
A real trip (4–6 rounds) would hide most of the round columns. Total and the settle-up are right.
**Options:** A, sticky Player + Total, with the rounds scrolling under a visible scroll cue (fade/"→").
B, on a phone, one column per DAY (its rounds summed), with tap-to-expand. C, per-player rows with the rounds
listed under the name. **Craig's call.**

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
— but as two commits, since C fixes a screen and A changes a schema.

**Status: BOTH HALVES BUILT — log was stale** (caught in the 2026-09-15 simplification batch).
Option C landed as 270f257 ("a read-only summary never prints a row with no value" — the generic
blank-value filter in `MoneySummary`, now `panels/money-panels.tsx`, with e2e
`verify-f015-f018-review.spec.ts`); option A landed under F-014 (archived, FIXED + VERIFIED).
Nothing left here — archive in the next sweep.

---

### F-022 — 90% allowance applies to the ROUNDED course handicap; GHIN uses the unrounded one  [P1 MONEY] [track]

**CLOSED 2026-10-01 (Craig, §5.ce):** unrounded-first confirmed done. Follow-on is a separate investigation: stroke vs match play strokes can differ slightly (see BACKLOG).

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

**CLOSED 2026-10-01 (Craig, §5.ce):** built and answered back to the friend.

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

### F-037 — Eight players who want "two separate 2v2 best-balls" can't say so — and Craig can't tell what IS possible  [P1] [start] — **BUILT 2026-10-12 (§5.co, Team → Match T0–T4):** Compete asks "Head-to-head matches? 1 v 1 / 2 v 2"; the tee sheet is built from the matches; match points roll up to team totals. Craig's phone walk is still wanted before this is closed

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
below." e2e `F-060` at phone width. **Opt B BUILT 2026-09-15** (877c9ea): the captains
panel only picks captains ("then build the teams with a method below"); the rival green
trigger is gone; the hub's Build & adjust buttons wear the same ✓-built state. (This
status line was stale until the collapse-planning session verified the code, 2026-09-15.)
Remaining: nothing — the method list is the one place teams get built; the collapse plan
keeps it as the teams step for any N × K.

---

### F-061 — The same game kind is labelled up to FOUR different ways across surfaces  [P2] [start]

**Where (survey 2026-09-15, delegated code sweep):** the team-2v2 game renders as
"Sides / Match" (lists via `gameListSubtitle`, `result.ts:50`; leaderboard header
`leaderboard/page.tsx:961`; save-format modal; settings editor), "Sides · {format}"
(wizard summary, `summary.ts:53`), and the raw name ungrouped among individual modes in
the picker (`details-step.tsx:247`). The classic pool renders as "Pool"
(`result.ts:52`), "Team pool" (`summary.ts:49`), "Pool (pot split)" (formats page :155,
share-panel :21), and "Pool (foursomes vs foursomes)" (picker :235). There is no
`categoryLabel` anywhere — every surface improvises (§5.al's rule enforced the
side/team WORDS but nothing pinned the game-kind NAMES).

**Why it matters:** vocabulary is the confusion Craig keeps hitting (F-037: he couldn't
map "2v2" to "Sides / Match"). Four names for one thing means users can never build the
mapping.

**Options**
- **A. One shared `gameKindLabel()` helper** in `lib/game-modes`, used by every list,
  header, and modal — mechanical, but it must PICK the canonical names, which is
  exactly what the game-structure design (GAME_STRUCTURE_DESIGN.md) is deciding.
- **B. Fold into the structure design (recommended):** the design's step-2 vocabulary
  ("Two teams of 4", "Foursome vs foursome") becomes the canonical labels, and the
  helper lands as part of Phase 1 with names Craig has already reacted to.
- **C. Leave it.**

**Recommendation:** B — naming twice (once now, once after the design) would date one
set of strings immediately (§5.at).

**Status:** FIXED 2026-09-16, commit b8f9c79 (Phase 2, §5.bm Q5) — option B as decided by the collapse plan. One
helper, `gameKindLabel(game)` in `lib/game-structure.ts` ("2 teams of 4 · pot", "4 pairs · $/point
· 2 groups", "1 v 1 · head-to-head", "Skins · 4 players"), prints on the list cards (`gameListSubtitle`
is now that helper; the list item carries `groupSizes`/`sideSizes`/`money`), the hub header, the
leaderboard header, the save-format modal and the wizard review; `gameSummary` says "Teams · best
ball" / "Pool". "Side" is gone from every user-visible string (registry hints and labels, the
editor, the money panels, the printable sheet, the scorecard header, the name fields — "Team A" is
the fallback label now). Two judgement calls for Craig: the `team-2v2` mode's own `name` is
**"Teams"** (it still shows in the settings editor's game select and the "Teams options" heading —
one line to rename), and the sandbox seed labels still say "sides" (dev-only, e2e look them up).
Residue: `isSingleGroupGame` was RENAMED `isModeEngineGame` 2026-09-28 (AGENTS.md's one rule
updated with it). `teamBuild` stays classic-only.

---

### F-062 — Course handicap renders in 7 styles — and THREE surfaces use different MATH  [P1] [track]

**Where (survey 2026-09-15, delegated code sweep):** pool surfaces show `Course HCP: 8`
(field list chip), `CHcp 8` (sides chips — e2e-pinned spelling), bare `8`/`(8)` (tees,
groups, review, captains dropdown), `combined HCP 24` (team cards) — all
`Math.round(getPoolPlayingHandicap(...))`, so DISPLAY-only drift. But three legacy
surfaces compute their own numbers:
- `game/play/page.tsx:944-5` — "CH: 8.4" / "Plays: 8.40" (unrounded, 1–2 decimals,
  parallel `calcCourseHandicap` math, not `getPoolPlayingHandicap`).
- `tournament/[id]/page.tsx:816-825` — "CH: 8.4" unrounded with **no allowance applied**.
- `dashboard/page.tsx:495` — its own formula, no allowance.
Also `tournament/[id]/money/page.tsx:641` mixes an unrounded "Course" column with
rounded Nassau/Skins columns in one table.

**Why P1:** the display drift is P2 noise, but the parallel math is trust surface — the
same player can read two different handicaps in one app (F-022/F-043's whole point was
one pinned chain). NOTE §2: unifying the MATH is handicap math — Craig must call it, with
a worked example, and the GHIN app as reference (§5.ba).

**Done now (safe slice):** the FieldLowBanner used both spellings in one file — unified
to "Course HCP".

**Options**
- **A. Display pass only:** one spelling + the F-043 `HandicapChip` on every pool
  surface that shows a labelled CH; legacy surfaces untouched. No number changes.
- **B. A + retire the parallel math:** point game/play, tournament, dashboard at
  `getPoolPlayingHandicap`/`explainPlayingHandicap`. Changes displayed numbers on
  legacy surfaces (allowance applied where it wasn't; rounding where it wasn't) —
  needs Craig's call + on-screen comparison before/after.
- **C. Leave legacy pages; A only where friends actually play (pool).**

**Recommendation:** A now (or C — same work), B as its own decision with screenshots of
the numbers that would change.

**Status:** A DONE 2026-09-28 (§5.bu). The review step's three player chips and the captain
picker's chip are now the F-043 `HandicapChip` (same number, which a unit test pins to
`getPoolPlayingHandicap`, and a tap shows the chain). Their rows gained `flex-wrap` so the
open chain drops under the name instead of squeezing it out. The review's "CHcp 24" team total
now reads "combined HCP 24", as the teams step does. So the one spelling is "Course HCP" per
player and "combined HCP" per team. e2e `f062-handicap-display.spec.ts` fails on the old code.
**Deliberately left:**
- The hub StrokeAllocation "{n} hcp" (`summary-cards.tsx:247`) is the value AFTER
  off-the-low, not a course handicap, so a chip or "Course HCP" label there would change or
  mislabel the number.
- The field-editor/SwapPanel `(n)` values are strokes received (its comment at :533 wrongly
  says "course handicap").
- The leaderboard's bare `(n)` after names.
- The captain `<option>` text (a select can't hold a button).
- The legacy scorer's "CH: 8.4 / Plays: 8.40", which pool players DO see during play
  (`game/play/page.tsx:1012`), is option B territory and stays open with B.

---

### F-063 — Two phones scoring ONE foursome silently overwrite each other; the last tap before leaving the card is dropped  [P1] [continue]

**Where (code trace 2026-09-15, delegated sweep for the §5.bk plan, verified against
`tournament-state.ts:273-302` and `game/play/page.tsx:108-236`):** a pool game's scores
are one `game_scores` row per tee group (`matchupId`), and every save is a whole-row
upsert with no version check and no error handler. The scorer's own group is loaded once
at mount and never re-read (no subscribe or poll for the own matchup — only for the other
groups and the leaderboard). So when two phones open the same team from the share link:
each holds its own full array, each 400ms-debounced upsert replaces the whole row, holes
the other phone entered vanish, and the two never reconverge — the leaderboard flips
between the two versions on every write. Separately, the debounce timer is cleared on
unmount without flushing, so a tap within 400ms of leaving the card is lost (the solo
round page flushes on `pagehide`; the pool card does not). There is no offline queue:
a failed write is swallowed and a reload loses anything unpersisted.

**Violates:** north star "continuing" (state surviving a sleeping phone / a partner
picking up the scoring); §5.bl (live scoring in the best possible shape, not the easiest).
§5l's "partitioned by matchup, safe by design" is true only for ONE scorer per group;
nothing enforces that.

**Not a regression** — this is how it was built. It has not been reported from the
course, which fits: one phone per foursome is the habit. It bites exactly when a second
phone "helps".

**Options** (full comparison in `.claude/plans/game-structure-collapse-plan.md` §5):
- **A. Interim, no schema (S):** flush the pending write on `pagehide`; subscribe to the
  own group's row and merge per cell (a local pending cell wins, otherwise take remote).
  Fixes the dropped tap; turns divergence into eventual convergence most of the time.
  Does NOT fix the race where one phone's whole-row write drops cells it hasn't received.
- **B. Owner-merge RPC (exists — the tournament path):** correct only if each phone
  declares which players it scores. That setup step is the trouble Craig remembers; not
  recommended.
- **C. Per-cell score rows (M, new table + dual-read):** `(matchup_id, player_id, hole)`
  rows, idempotent upserts, an outbox in localStorage for cart-path wifi, refetch on
  reconnect. Correct for any number of scorers with no setup; compute layer untouched
  (assemble `GameScore[]` at the boundary); `score_audit` is already per-cell.
  **Recommended best case.**

**Status:** **Option A BUILT 2026-09-16** (approved by Craig, §5.bm Q4): `lib/score-merge.ts`
(pure per-cell reconcile: dirty local cell wins, else remote, never drop a local cell;
7 unit tests) + `game/play/page.tsx` (pagehide/visibilitychange flush of the pending write;
pool card subscribes to its OWN group row + 15s poll + resume refetch, merging per cell and
updating state only on real change so two phones settle, not ping-pong; the mount fetch
merges instead of replacing). e2e `f063-live-scoring.spec.ts` proves a tap made right before
leaving the card survives a full reload — verified to FAIL with the fix stashed. The two-phone
convergence itself can't be driven end-to-end (the sandbox fake is one tab's sessionStorage);
it's covered by the unit tests. **Still open:** the whole-row race (opt C, own session).

---

### F-064 — A 1v1 match showed 90% handicap with no recommendation; singles match play is 100%  [P2] [start]

**Source:** Craig, real 1v1 Sides / Match round 2026-09-15: *"wouldn't it be 100%? it
recommended 90%."*

**Where:** `details-step.tsx:157-182` `usgaRec` — for any `team-within-group` mode it
returns `null` ("stay silent rather than guess"), so a Sides / Match game gets NO
recommendation line. The 90 on screen was therefore a **prefill** (group default / saved
format / the classic pool's four-ball-match 90 surviving a mode switch in the draft —
`page.tsx:212,309` restore it verbatim), rendered in the same box a recommendation would
be. Craig read it as advice. The USGA table (Rules of Handicapping Appendix C): singles
match play **100%**, four-ball match play 90%, four-ball stroke play 85%, individual
stroke play 95%. `formats.ts:65,73` carries 90 for the four-ball entries only.

**Violates:** §4 (labels must state what changes for the players); §5.ba spirit — the
app knows a rule and spent it on silence.

**Options:**
- **A (recommended, S):** give `team-within-group` a real recommendation keyed on the
  structure: all sides of one → 100% (singles); 2-a-side best ball + match → 90%; 2-a-side
  best ball + total → 85%; combined/scramble/alt-shot → the format's own figure or
  silent. Same "✓ USGA suggests … / Use N%" UI as the classic. The collapse plan's
  scoring step already keys allowance on (format, compare-by), so this is the same rule.
- **B:** when a prefilled allowance differs from the recommendation, say where it came
  from ("90% — from JY Classic Pool") so a carried-over number never reads as advice.
- **C:** A + B.

**Status:** open — later session (Craig: "handle this later"). Do NOT change stored
games' allowances; wizard-only.

---

### F-065 — 1v1 scorecard repeats each name (side header = player) and gross/net rows aren't labelled  [P3] [track]

**Source:** Craig, same round: *"the scorecard showed each person's name twice (maybe
because I didn't name teams) … the layout was a little weird. Gross on top, net on
bottom — could be more obvious."*

**Where:** `sideNameFrom` (`team-game.ts:101`) names an unnamed side after its players'
first names — correct for "Craig & Jym", but in a 1v1 the side is one player, so the
side header on the card says "Craig" directly above the player row "Craig". `applySideNames`
(`play/page.tsx:80`) feeds those into the card's two team slots. The gross/net stacking
on each cell has no row label; regulars know, a guest doesn't.

**Options:**
- **A (S):** when every side is solo (`allSidesAreSolo`), drop the side header on the
  card (the player row IS the side) and keep the vs line ("Craig vs Jym") once at the top.
- **B (S):** a one-time legend on the card ("gross / net") or a tiny G/N gutter label on
  the first column; ties into F-031's card-superscript question.
- **C:** A + B.

**Status:** open — later session.

---

### F-066 — After closing out, the app sometimes lands on an unexpected page  [P3] [continue]

**Source:** Craig: *"after closing out games, it takes me back to the original home page,
or sends me around to different pages which just feel a little odd."* Not reproduced
yet.

**What the code does:** Finish on the card → `router.push('/pool/{id}')` (the hub,
`play/page.tsx:2106`). The hub bounces to `/dashboard` (the ORIGINAL home) if the game
fetch returns null and there's no cache (`pool/[id]/page.tsx:56`) — a transient fetch
miss right after a write would do exactly what Craig describes. The close-out panel on
the hub itself doesn't navigate. Also `/home` vs `/dashboard` are two "homes" (F-003
history), so any bounce to `/dashboard` feels like the wrong place.

**Options (after reproducing):**
- **A:** hub never redirects on a transient miss — retry once, then show "couldn't load"
  in place. Finish always lands on the hub's recap (Who pays whom, F-032).
- **B:** retire the `/dashboard` fallback in favour of `/home`.
- **C:** walk the close-out path in the sandbox at phone width and record every
  navigation (`e2e` capture) before choosing.

**Status:** open — needs a repro walk (C first); later session.

---

### F-067 — On a finished card, the Out view's last column shows the BACK-nine total (and vice versa)  [P3] [track]

**Source:** Craig, same round: *"if I click Out (1–9) it shows in the last column the In
column of the back nine, and vice versa."*

**Where:** `play/page.tsx:1328-1336, 1578, 1613-1760`. The card renders ONE nine at a
time (`visibleHoles`), and to keep "Tot" honest it adds a single column for the OTHER
nine's subtotal (`otherHoles`), labelled `In` when viewing the front and `Out` when
viewing the back. So next to holes 1–9 the reader sees "In 41 · Tot 82": correct
arithmetic, but a column named "In" beside the front nine reads as the wrong number. A
paper card shows Out after hole 9, In after 18, then Tot — both subtotals, in order.

**Not a data bug** — Tot is right, the subtotal is right; it's the column's name and
position.

**Options:**
- **A (S, recommended):** show BOTH subtotals every time — the visible nine's subtotal
  first (Out when viewing the front, In when viewing the back), then the other nine's,
  then Tot. Two narrow columns instead of one; matches the paper card and F-030's
  "captain glancing" habit.
- **B (S):** keep one column but name it by what it is: "Back 9" / "Front 9" instead of
  In/Out, so it can't be read as this nine's total.
- **C:** during the round, hide the other-nine column until that nine has any score
  (today it shows "–"); on a finished card show A.

**Status:** open — later session (batch with F-064/065/066).

---

### F-068 — Sides and individual games settle to $0 in Stats & money; the hub recap attributes a whole side's money to one first name  [P1] [continue]

**Source:** Craig, completed 1v1 Sides / Match round 2026-09-15: *"I completed the game,
but it doesn't properly show the money owed."*

**Verified by probe (vitest, throwaway, removed):** a completed 1v1 legs game with
p2 one stroke worse per hole → engine standings `A: +$40, B: −$40`, zero-sum, correct.
Then:

1. **Season ledger uses the WRONG ENGINE for every non-classic game.**
   `stats-ledger.ts:88` `poolGameLedger` calls `computePoolResult` (the classic pool
   engine) unconditionally — it never looks at `gameMode`. A sides or individual game
   has one `teams[]` entry ("Group") holding everyone, so the classic engine hands the
   pot to that single team: every player nets 0, `hasMoney: false`, and the game
   **drops out of Stats & money entirely** — 1v1, 2v2, 3 sides, skins, Stableford,
   quota, Nines, Wolf, all of them. The right function is one import away
   (`computeGameResult`, already imported at `:23` and used by `gameRollups` at `:329`).
   The sandbox `ledger-season` seed (`fixtures-domain.ts` `completedPool`) is classic-only,
   so F-007's "ledger balances" e2e never exercised this.

2. **Hub "Who pays whom" is keyed by SIDE, not player.** `gameRollups` (`:329-333`) maps
   `IndividualResult.standings` straight to player rollups, but the sides engine's
   standings rows are per SIDE: `playerId = 'A'|'B'…`, `playerName` = side name
   (`team-game.ts:275-277`). Probe output for a 2v2: `{"playerId":"A","playerName":
   "Player1 & Player2","net":40}` → the recap renders `fromName.split(' ')[0]` =
   **"Player3 pays Player1 $40"** — one name, the whole side's money, unsplit. In a 1v1
   it reads correctly only by coincidence (side name = the player's first name). For
   genuinely individual modes (skins etc.) standings ARE per player, so those recaps are
   right; the ledger (item 1) still zeroes them.

**Violates:** north star "continuing" (the season-long money ledger is the named
example); §5.h (money is group-scoped — but only if it's recorded); F-007's invariant.

**Options:**
- **A (recommended, S, money-adjacent → Craig approves):** `poolGameLedger` → use
  `computeGameResult`; for `kind:'individual'` results, split each SIDE's `moneyNet`
  evenly across `sidesOfGame(game)` members (per-person convention, same as the
  classic per-team split); per-player standings (skins…) map 1:1. Make `gameRollups`
  share that one reducer so hub recap and ledger cannot drift. Tests: 1v1, 2v2, 3 sides
  uneven (2/2/1 — the solo side's member takes the whole side net), skins; each
  zero-sum; prove failable (§5.z) by re-introducing the classic call.
- **B:** move the per-side → per-player split INTO the sides engine (emit per-player
  `moneyNet` rows alongside side rows). Touches engine output shape that the
  leaderboard reads → bigger blast radius; not recommended.
- Either way: add a `team-2v2` and a `skins` completed game to the `ledger-season` seed
  so F-007 covers all three engines.

**Stored data is fine** — scores and games are intact; only the derived ledger is
wrong, so the fix is retroactive with no backfill.

**Status: opt A BUILT 2026-09-16** (Craig: "if that is an easy fix, should we just do it
now?" → yes). `perPlayerNets(game, scoresByMatchup)` in `stats-ledger.ts` is THE per-player
reducer: classic → team net ÷ members; sides engine → side net ÷ members via the engine's
own side rule (`sidesForCompute`, newly exported from `game-modes/context.ts` so the ledger
resolves exactly the sides the engine settled on); individual → 1:1. `poolGameLedger` and
`gameRollups` both call it, so Stats and the hub recap cannot drift. Tests (4, pinned
FIRST and watched fail on ids 'A'/'B' — §5.z): 1v1 ±$40 on player ids; 2v2 $20 a head;
uneven 2/2/1 solo carries the side; skins untouched. Season seed gained a Warriors 2v2
(`lg-6`) and a Tuesday skins game (`lg-7`) so F-007's e2e balances across all three
engines. Derived-only: no stored data changed; every past sides/individual game now
appears in Stats retroactively. Verify: see session note.

---

### F-069 — The sides engine scores any unknown team format as best ball  [P3] [track]

**Where (found building the §5.bk router, 2026-09-16):** `game-modes/team-game.ts` forms a
side's hole score as `combined` → sum of nets, `scramble`/`alternate-shot` → one ball, and
EVERYTHING ELSE → the lowest net (best ball). Its settings schema offers only those four, so
no UI ever wrote `two-best-net` / `two-best-gross` / `net-and-gross` into a sides game — but
a game that did would silently settle as best ball with no error.

**Mitigation shipped:** the router treats two-ball formats as a classic-only capability
(`UNEXPRESSIBLE.needAligned('Two-ball formats')`), so the wizard greys them for teams that
share foursomes and says why. **Still open:** the engine itself should refuse (or compute)
an unrecognised format rather than default it — a Phase 3 convergence item, alongside the
sides engine gaining the two-best formats.

**Update 2026-09-16 (F-072):** the sides engine now computes EVERY `TeamFormat` through the
shared `teamValueOnHole`, so the three two-ball formats are no longer "unknown" and the router
no longer greys them. What remains is narrower: a string that is not a `TeamFormat` at all (a
hand-edited settings bag) still falls to `teamNetOnHole`'s `default` arm = best ball — now in
ONE place for both containers instead of two. Refuse-vs-default is still Craig's call
(stop-and-ask, NEXT_SESSION_PROMPT).

**Status:** DECIDED 2026-09-28 (§5.bw): keep the best-ball DEFAULT. No UI path writes an unknown format, so the fallback only catches old or hand-edited data. Next: a unit pin that every format the wizard or hub offers is computed by the engine.

---

### F-070 — The sandbox fake backend has no `.in()`, so the leaderboard's audit viewer throws in e2e  [P3] [track]

**Where:** `fetchScoreAudit` (`tournament-state.ts` ~l.319) queries `score_audit … .in('matchup_id', …)`;
`src/test/fake-supabase.ts` implements no `in`, so opening the score history in the sandbox
logs an unhandled rejection (`.in is not a function`) during `npm run verify`. Pre-existing
since the audit viewer landed (6d07b8d); tests still pass because the viewer swallows the
empty result. Cosmetic in the logs, but it means the audit history is never SEEN in e2e.

**Fix (S):** add `in()` (and `order`/`limit` pass-throughs) to the fake's query builder, then a
screenshot of the history panel joins the sandbox scenarios.

**Status:** FIXED 2026-09-27. The fake gains `in`/`order`/`limit`. A second bug turned up
along the way: a select on the append-only `score_audit` read the keyed map, not the log the
inserts go to, so the history would have stayed empty even with `.in`. That's fixed too, and
`changed_at` now gets its migration default. `src/test/fake-supabase.test.ts` (3 tests, all
failed on the old fake) and `e2e/f070-score-history.spec.ts` (fails with the fix stashed).

---

### F-071 — Teams that share foursomes get a DIFFERENT teams screen (letter buttons) than teams that are their own foursomes (method list)  [P1] [start]

**Where (Craig walking the collapsed wizard, 2026-09-16):** after tees, a split whose teams are
their own tee groups (2 × 4, 3 + 3 + 2) gets the pool's `TeamsStep` — "How should teams be
built?" with even-them-out / captains' deal / down the list, captains and locks. A split whose
teams share foursomes (four pairs, 2v2 in one group, 1 v 1) gets the old `SubTeamsStep`: sides
dealt silently (balanced by handicap), a row of A/B/C/D buttons per player, a shape chooser and
side names. Craig: *"how are the sides determined? i think this is rather confusing not being
the same as pools."*

**Violates:** §5.bk (one structure, one flow); §5.aq (reuse the logic); the collapse plan's own
mock (§6: "Set teams (N × K)" with the method list for any split). Deferred as the slice-3
remainder and it should not have been.

**Options:**
- **A (recommended):** ONE teams step. `TeamsStep` takes the structure's sizes (already does)
  and builds pairs/triples with the same three methods; captains panel appears when K ≥ 3 or on
  request. On leaving it, shared-foursome teams become the sides, and `proposeTeeGroups` lays
  the tee sheet (partners together, §5.bm Q2); the F-019 groups step then only asks about tee
  times / drags when there are 2+ groups. `SubTeamsStep` retires. Side names move to the teams
  step (a name per team card). M, no engine change.
- **B:** keep both screens but give the sides editor the method list too. Two screens, one
  vocabulary — half the fix.

**Status:** FIXED 2026-09-16 (option A). `TeamsStep` gained `mode: 'money-teams'` (no tee times /
send-out order, every team must have someone, blank names with the board's name as placeholder);
the wizard routes EVERY split through it — tees → Teams → [Groups when 2+ tee groups] → Money.
Leaving the step derives `sides` (ids a, b, c… by position; typed names kept) and lays the tee sheet
with `proposeTeeGroups` (partners together); the groups step's shape buttons re-pack whole teams
(`packTeamsIntoShape`, falling back to a balanced deal when no packing fits — four pairs into
3 + 3 + 2). `SubTeamsStep` deleted. Two judgement calls, Craig's to reverse: (1) the step opens
EMPTY until a method is tapped, exactly like the pool — one tap more than the old pre-dealt sides for
the usual 2v2, in exchange for one screen; (2) captains default OFF for pairs, ON for triples, toggle
on the step (`sideCaptains`, separate from the pool's `useCaptains` so a saved format's choice is
never clobbered). F-078 and F-079 fell out of it. Pinned: `collapse-routing` (four pairs: method
list, no shape chooser, no tee times, partners share Group 1, review "Sides (2 vs 2 vs 2 vs 2)"),
`verify-f019-groups` (F-071 reshape keeps partners whole), `verify-f020-picker` (F-036 rewritten
for the new flow; F-020 "asked ONCE"), `nsides-audit`, `verify-f015-f018-review`, `verify-f025-f046`.
Retired pins: "Next: Sides", "How do the sides split?", "Name the sides" (wizard), "CHcp N" (wizard —
the chip on the shared step shows the bare number; the hub editor keeps the disclosure and spelling).

---

### F-072 — The format list says "best ball" only for shared-foursome teams; best net + best gross is golf, not a limit  [P1] [FIXED 2026-09-16]

**Where:** the scoring step disables two best net / two best gross / best net + best gross with
"not with this split" for pairs and 2v2, because the sides engine (`team-game.ts`) scores a side
as combined → sum, one-ball → one score, anything else → lowest net (F-069). Craig: *"why would
best net and best gross not be possible with twosomes? technically it would, right?"* — yes: a
pair has two balls.

**Fix (S–M, SCORING MATH → Craig approved in conversation 2026-09-16, tests pinned first §5.z):**
route the sides engine's per-hole side score through the shared `teamValueOnHole`
(`team-scoring.ts`), which already computes every `TeamFormat` for the pool; add the two-ball
formats to the mode's `format` options; remove "Two-ball formats" from the router's
classic-only list. Guard: the two-side and N-side golden snapshots must not move for best ball /
combined / scramble / alt-shot; new zero-sum cases for the two-ball formats at 2-, 3- and
4-player sides.

**Status:** FIXED 2026-09-16, goldens first (§5.z). `src/test/f072-two-ball-sides.test.ts` — 164
independent-oracle cases (hand values per hole from raw gross + TEST_PARS; 2-, 3- and 4-a-side;
three two-ball formats × strokes/Stableford × total/match × four money models; a partial-hole
null case; three pairs on legs) — written against the OLD engine: all 164 failed (every cell a
$0 dead heat, because everything scored as best ball). Then `team-game.ts` dropped its own
`sideNet`/`sidePts` and calls the pool's `teamValueOnHole`; the two-side, N-side and one-group
goldens did not move. Mutations after: best-ball fed to the engine → 164 fail; two-best-gross
sorting nets → 27; net-and-gross letting one player supply both halves → 27. Router:
"Two-ball formats" left `classicOnlyNeeds`; a NEW guard refuses a two-ball format for any team of
one (`UNEXPRESSIBLE.needTeams('Two-ball formats')`), because a saved Warriors format applied to 2
players derives a 1 v 1. Mode schema + hub summary gained the three formats; description shortened
to "any team format". e2e: `collapse-routing.spec.ts` F-072 row (four pairs → best net + best
gross → every money model open → hub) + two pins flipped from disabled to enabled. Read the
screenshots (`f072-*.png`) as a first-timer: clean.

---

### F-073 — The word "match" appears nowhere in the wizard  [P2] [start]

**Where:** match play is "Decide by: Hole by hole" on the scoring step and "Head-to-head — fixed
$ per front / back / overall" on the money step. Craig: *"where is the match play option?"* The
F-042 toggle was removed for saying too little; its replacement says it without the word golfers
use.

**Fix (S, labels only):** "Hole by hole (match play)" / "18-hole total (stroke play)"; money row
"Head-to-head match — fixed $ per front / back / overall". Helper text can say "a Nassau".

**Status:** FIXED 2026-09-16 (6728a25) — '18-hole total (stroke play)' / 'Hole by hole (match play)', the hint names a Nassau, money row 'Head-to-head match — fixed $ per front / back / overall'. Pinned in `collapse-routing` (4+4 row).

---

### F-074 — Uneven splits are only the balanced ones; 4 v 2 v 2 can't be chosen  [P2] [start]

**Where:** the structure step's "Other split…" comes from `groupShapesFor`, which only produces
shapes whose sizes differ by at most one (3 + 3 + 2 yes, 4 + 2 + 2 no). Craig asked for
2 v 2 v 4. §5.bm Q3 said "make uneven teams work"; this half does.

**Fix (S, wizard only):** a free-form row under "Other split…" — type the sizes ("4, 2, 2"),
validated to sum to the field; routes like any other shape (`defaultTeeSheetFacts` handles it: a
4 is its own group, the 2s share one → shared-foursome flow). Also the money settles fine — a
team of 2 simply has fewer balls to pick from.

**Status:** FIXED 2026-09-16 (ec47f98) — a free-form row under 'Other split…' takes the sizes (any separator), validated to add up to the field and to 2+ teams; `parseTeamSizes` + `structureOptionLabel` unit-tested; routes like any shape (4 + 2 + 2 → the 4 walks alone, the pairs share). Pinned in `collapse-routing` F-074 row to 'Sides (4 vs 2 vs 2)'.

---

### F-075 — The router's refusal reads as a golf rule ("need each team in its own foursome") when it is a code gap  [P2] [start]

**Where:** money step, shared-foursome teams: "$ per hole / $ per point" greyed with "Closest-to-pin
… need each team in its own foursome"; the stakes note says the same. Craig: *"why would that need
to be a foursome? then when i removed it it allowed me."* CTP is a par-3 bonus; nothing in golf
ties it to foursomes. The sides engine simply has no CTP / manual-bonus settlement written yet
(only the classic pool engine has). The router is right to refuse; the sentence lies about why.

**Fix (S, strings in `UNEXPRESSIBLE`):** say the true thing — "Closest-to-pin isn't built for
teams that share foursomes yet" / "…can't ride on $ per hole or $ per point yet" (the "yet" is
honest: Phase 3 closes it). Never phrase an engine gap as a rule (§5.at spirit).

**Status:** FIXED 2026-09-16 (6728a25) — `UNEXPRESSIBLE` engine-gap strings read 'Not built yet: <needs> for teams that share a foursome / on head-to-head with more than two teams / on $ per hole or $ per point'; singles with a classic-only need get the shared-foursome reason (the 'teams of two or more' line is kept for two-ball formats only, where it IS the golf). Sides stakes note reworded the same way. Pinned in `collapse-routing` (refused row) and `f045`.

---

### F-076 — "+ Add bonuses" silently includes closest-to-pin (and then blocks margin money)  [P2] [start]

**Where:** the classic money step's "+ Add bonuses" applies `DEFAULT_JUNK_VALUES` — birdie 1,
eagle 2, albatross 3, all-par 1, CTP 1 — in one tap (F-045 / §5.bg: the Warriors' set as the
one-tap usual). Craig, walking a pot game: *"it also auto included closest to the pin."* With
CTP on, the router then greys $ per hole / $ per point for the reason in F-075; removing CTP
unblocks them.

**Options:** **A** add bonuses with CTP at 0 (birdie/eagle/albatross/all-par only) and let the
Warriors' saved format carry its CTP 1, which it does. **B** individual toggles per bonus instead
of one grid fill. A is one constant; B is the §5.j-shaped answer. Recommend A now, B with Phase 3.

**Status:** FIXED 2026-09-16 (f55c550) on **option A — confirmed by Craig 2026-09-16 (§5.bo)**: the tap sets birdie 1 / eagle 2 / albatross 3 / all-par 1 / CTP 0; the seeded Warriors' format still restores CTP 1. Pinned in `f045` (Closest = 0, margin money open until CTP typed). Option B (per-bonus toggles) stays for Phase 3.

---

### F-077 — The F-021 summary line quoted the WRONG money for shared-foursome games (skin value in a 1 v 1; player buy-in for a per-side pot)  [P1 money] [FIXED same session]

**Where (my own walk, 2026-09-16, `e2e/collapse-walk.spec.ts` flows B and D):** a 1 v 1 on fixed
legs summarised as "Sides · best ball · **$5 a skin**"; four pairs on a per-side pot summarised as
"**$25 buy-in pot**" while the stakes field below read $20 per side. Two causes, both in the new
wizard: (1) switching structure kept the previous pick's `modeSettings` (two players default to
everyone-for-themselves → skins → `skinValue 5`, which `stakesSummary` reads first); (2) the
sides bag was passed to the summary WITHOUT the engine's defaults, so a missing `sideBuyIn` fell
back to the classic per-player buy-in.

**Fix (shipped, wizard only):** a structure pick resets `modeSettings` to the sides engine's
defaults; the summary/settings bag is `{...defaults, ...modeSettings, format, scoring, result,
moneyModel}`. Pinned in `collapse-routing.spec.ts` (1 v 1 review says legs and never "a skin";
pairs pot review says "$20 buy-in pot" and the field shows 20). Money text that disagrees with the
field beside it reads as a bug even when the math is right (UI_CRITIQUE_PROCESS) — this WAS a bug.

---

### F-078 — The sides step re-asks "How do the sides split?" after the structure step already answered it  [P1] [start]

**Where (walk flows B, F):** four pairs chosen on step 2; the Sides step offers 4 v 4 · 3 v 3 v 2 ·
2 v 2 v 2 v 2 · … · 1 v 1 × 8 — seven shapes — with "2 v 2 v 2 v 2" highlighted. Picking another
one silently diverges from the structure the router routed on. Same question asked twice, the
second time with more noise. **Fix:** part of F-071 option A (the sides step retires); until then,
hide the shape chooser whenever a structure exists (S).

**Status:** FIXED 2026-09-16 with F-071 A — the sides step is gone; the structure step is the only
place the split is asked. Pinned in `collapse-routing` and `verify-f020-picker` ("asked ONCE").

---

### F-079 — A 1 v 1 gets a "Sides" step with nothing to decide  [P2] [start]

**Where (walk flow D):** two players → "Sides (1 vs 1) — Assign each player to a side", two rows,
A/B buttons, "+ Add a side" greyed. Every answer is forced. **Fix:** skip the teams/sides step when
the structure fully determines membership (every team of one); go tees → money. S, wizard only.
Also covered by F-071 A (the unified step can skip itself the same way).

**Status:** FIXED 2026-09-16 with F-071 A — every-team-of-one structures set the sides from the
players on leaving tees and the button says "Next: Money"; the step indicator drops "Teams". Pinned
in `collapse-routing` (1 v 1 row) and `verify-f020-picker` (1v1 test).

---

### F-080 — With a saved format applied, the structure step shows the format TWICE  [P3] [start]

**Where (walk flow G):** the F-021 card "Your saved game style — Saturday Nassau" and, directly
under it, the select "Or play a saved game style" reading "Saturday Nassau". **Fix (S):** when a
format is applied, the select collapses to a "Start fresh / pick another style" link under the
card; the card is the confirmation.

**Status:** FIXED 2026-09-16 (b4b6461) — with a style applied the select hides; the card gains 'Everything is already set — change anything below to fork it. Start fresh · Pick another style'. Pinned in `verify-f020-picker` (no select + Start fresh after applying; §5.aw row re-pointed).

---

### F-081 — The sides hub shows tee groups under "Players" but never the TEAMS  [P2] [start]

**Where (walk flows B, D hubs):** "Four Pairs — Sides / Match · 8 players · 2 groups"; then a
"Sides / Match" panel of settings (with the mode's developer paragraph "Pick sides and play them
off against each other — 1v1 up to four-a-side…"), then "Players: Group 1 / Group 2". Who is
paired with whom — the one thing the organizer wants confirmed — appears nowhere on the hub; the
classic hub shows its teams. **Fix:** Phase 2 (F-061): the hub's team panel keyed on
`structureOf(game)`, showing the pairs (with their tee group beside each), and the developer
paragraph replaced by `structureLabel`. M, hub only, no engine change.

**Status:** FIXED 2026-09-16 with F-061 (b8f9c79). The hub gets a **Teams** section above the tee-group cards
for any shared-foursome game that stores sides: one row per team (player-derived or custom name,
members under a custom name) with its tee group at the right — hidden when there is only one tee
group, because every tag would read the same. The money panel's developer paragraph is gone for
team games (the header already says "4 pairs · $/point · 2 groups"); solo modes keep their rules
line. Screenshot: `e2e/screenshots/f072-hub-pairs-net-gross.png`. Left in its wake: F-088.

---

### F-102 — The plus-handicap sweep: what F-098 left behind (§5.bw 6)  [P1–P3] [start] [track] [money]

**Where (read-only sweep, 2026-09-28; every entry, display, allowance, split, basis, team formula,
target and engine checked for a plus index):** F-098 fixed the allocator and the main entry boxes.
The sweep found these:

- **a. [P1, math, Craig's call] Scramble / alt-shot team strokes on a split-format round are wrong
  both ways.** `live-scoring.ts` `getTeamStrokesOnHole` and the play page's tournament copy (~634)
  take the FULL 18-hole team handicap (`getPlayerRawCourseHandicap` halves only for a 9-hole round,
  not a split one) and allocate it against each nine's 1–9 re-ranking with `numHoles` 18. Golden
  (`.claude/f102a-golden.snippet.ts`): a +8/+8 scramble team (team 4) RECEIVES 4 on each nine, 8 in
  all, where 2 a nine is right; a plus team (−8/−8) never gives back (its rank 19 − SI is never
  reached). The player path halves and passes 9 (`live-scoring.ts:93, 174`). **Fix:** halve the team
  handicap per nine and count 9 holes on a split round, like the player path. This changes positive
  teams' strokes too, so it is past §5.bv.
- **b. [P2] Typed "+2.1" still loses its sign in two legacy boxes:** the money-game add box
  (`money-game/page.tsx:582`, `Number()` on a `type="number"` input) and the tournament roster edit
  (`tournament/[id]/page.tsx:519`, `parseFloat`; the box is pre-filled "-2.1"). **Fix:**
  `parseGhinIndex` / `formatHandicapIndex`, a text box.
- **c. [P2] The Optimal balancer can miss the most even split when a handicap is negative**
  (`pool-game.ts` ~1084). Its branch-and-bound prune assumes every remaining handicap is ≥ 0, so a
  plus player (or a scratch off an easy tee) can let it discard the optimum. **Fix:** shift every
  handicap by the field's low before searching (the spread is unchanged by a shift). Team
  composition only, no strokes.
- **d. [P3] Displays still print a plus handicap as "-2"** (the pool leaderboard and summary cards
  already print "+2"): the handicap chain chip and steps (`handicap-chain.tsx`, `pool-game.ts`
  `explainPlayingHandicap`), tees step, field step "Course HCP", hub field editor "(chcp)", summary
  cards "Course HCP", the teams page "Strokes received", group add-member list (index), play page
  "(÷2=…)", dashboard / quick-game "Course HCP", combined HCP; and the legacy tournament pages. Two
  screens hide a scratch (0) course handicap on a truthy check (`game/new/page.tsx:495`,
  `tournament/[id]/page.tsx:818`). **Fix:** one `formatPlayingHcap` (+N when negative).
- **e. [RESOLVED by the Rules] Rounding a plus HALF.** Craig: "follow the exact usga ghin
  precedent". Rule 6.2 rounds to the nearest whole number "with .5 rounded upwards"; for a negative
  value the Rules name the direction: Rule 5.1c "rounding is made upward towards 0", and Appendix C
  "a player with a plus Playing Handicap moves up towards zero including rounding". So +2.5 plays as
  +2 and 2.5 as 3, which is exactly JS `Math.round`. No change. Pinned in
  `src/test/whs-plus-rules.test.ts` with the Rules' own examples (Rule 3.2 Note 2, Appendix C/3 at
  85% and 90%, Appendix E); a mutation to round-away-from-zero turns it red.
- **g. [P2, math, Craig's call] The tournament engine's off-the-low rounds AFTER subtracting.**
  `live-scoring.ts:162` `getPlayingHandicap` returns `hcap − lowest` unrounded and the allocator
  rounds the difference. Appendix C takes the difference of the ROUNDED Playing Handicaps, which the
  pool does (`buildHcapMap`, the F-022 fix). Probe: CH 4.5 v 15.4 → pool 10 (Rules), tournament 11;
  CH +2.5 v 10.4 → pool 12, tournament 13. The play page's tournament copy (~644) is the same code.
  **Fix:** round each player first, then subtract, as the pool does.
- **h. [note, pending F-022] 2024 team match play applies the allowance to the DIFFERENCE.**
  Appendix C (2024): in team match play the percentage "is applied to the difference, rather than
  to the individual". At 90%, CH 5 v 16: the difference rule gives round(11 × 0.9) = 10; the pool's
  per-player rule gives round(14.4) − round(4.5) = 9. §5.ba forbids an allowance-order change
  without GHIN-app evidence, so this rides with the F-022 on-course check.
- **i. [P3, math, Craig's call] 2024 nine-hole Course Handicap rounds the half index to a tenth.**
  Rule 6.1b (2024): "(Handicap Index ÷ 2 (rounded to the nearest tenth)) × (9-hole Slope ÷ 113) +
  (9-hole CR − par)". The 2020 edition, and every engine here, uses the plain half (7.3 → 3.65, not
  3.7). Rarely moves a stroke.
- **f. [note, no change] The casual 18-hole basis on a nine** gives a +2's strokes back on SI 18 and
  17, which may sit on the nine not being played, the mirror of how a positive handicap already
  works on that basis. Left as designed.

**Checked and right:** allowance on the unrounded course handicap (sign-correct), off-the-low in
every engine (subtracts the negative low, no clamp), 9-hole halving, quota/Chicago targets
(36/39 − (−2) = 38/41, clamp only above 36), captains and snake/deal sorts (a plus player sorts
lowest), give-back in pool, sides, every individual mode and the tournament player path.

**j. A 0% allowance saves as 100%** (found while building d). `pool/new/page.tsx` reads the allowance
as `parseFloat(handicapAllowance) || 100` at ten sites, so a typed 0 (a gross game) silently becomes
full handicap. Options: A, treat 0 as a real value (gross: nobody gets strokes); B, reject 0 in the box
and point to a gross format instead. **DECIDED 2026-09-28 (§5.by):** a Net | Gross switch on every format; Gross = 0%, and the fallback is fixed with it.

**Also noted, not built:** the play page's handicap detail picks the nine by the CURRENT view
(`isBackNine`), not per hole. It's display-only, and the engine takes the hole number since a. The
legacy tournament pages still hide give-back dots (the F-098 "Left" list, LOW).
The legacy tournament pages also keep their own `|| 75 / || 50 / || 100` allowance fallbacks
(`tournament/[id]` ~633, ~642; side-games ~589, ~755), so a 0 there reads as the default too. Those
pages aren't wizard games and aren't offered Gross; left as is (LOW).

**k. Gross on a mode that has its own net/gross setting** (found walking the §5.by build). Skins
("Score basis: Net / Gross") and Low Total ("net or gross") carry a mode-level basis, so the
scoring step now shows two controls for one idea. They never disagree on the money: Gross makes net =
gross, and a mode set to Gross ignores strokes anyway. It's only the screen that's redundant. Options:
A, when the switch is on Gross, hide the mode's basis (it can only mean gross); B, drive the mode's
basis FROM the switch and drop the mode setting from the form (old games keep their saved value);
C, leave both. **DECIDED 2026-09-29 (§5.bz): A, BUILT** — `GROSS_HIDES` (`scoreBasis`, and the
junk `junkBasis` for the same reason) hidden on Gross in the wizard, the money step and the hub.

**Status:** 2026-09-28 — **a, b, c, d, g, i BUILT** (a44bc8d, c986125, 4118045, 581408a, bd5e190,
c945cb7), and e is resolved by the Rules. All are pinned in `whs-plus-rules.test.ts`,
`balancer-plus.test.ts` and `plus-index-entry.test.ts`, with e2e in `f098-plus-handicap.spec.ts`.
c turned out to be two bugs. One was the plus-handicap bound. The other was a symmetry prune that
ignored seat caps, so an odd field's heaviest player was never tried on the smaller team; that one hit
all-positive fields too. h waits for F-022. **j BUILT** (310fd48, §5.by). It includes one
scoring correction: a gross scramble or alt-shot had still given team strokes, and now gives none.
Pinned by `gross-game.test.ts` (8 cases fail without it) and `e2e/gross-switch.spec.ts`. k BUILT (§5.bz A).

---

### F-101 — Big-field follow-ups after the team cap came off (§5.bv)  [P1–P3] [track] [continue]

**Where (2026-09-28 sweep for the cap removal; walked in the sandbox with the new seed "§5.bv: 32
players, 8 foursomes, 16 pairs", screenshots `e2e/screenshots/cap-32-*.png`):** the engine and
the router take 32 players now (zero-sum at every money model, `src/test/team-field-32.test.ts`).
These are what the sweep found around the edges. Each is Craig's call or deliberately left alone:

- **a. [P1] A two-team card computes its team row from ITS OWN foursome only**
  (`game/play/page.tsx` ~1392–1407, `hasTeams`). With two teams that span groups (8 v 8 across
  four foursomes, or 4 v 4 across two, which was possible before the cap came off), the card's
  team best-ball and total can disagree with the money. At 3+ teams the card already takes its
  rows from the engine. **Options:** A: use the engine's rows (`sideBreakdown`) for every
  team-engine game with teams across groups. B: A, plus a label saying "whole team, all groups".
  C: leave it. Recommend A. This changes how a scorecard computes team rows, so it's Craig's call.
- **b. [P2] A player added on the hub mid-round joins a tee group but NO team**
  (`field-editor.tsx` `addPlayer` ~245–255), so they're silently out of the money. **Options:**
  A: ask which team as they're added. B: a warning line "Pat isn't on a team — no money". C: put
  them on the smallest team. Recommend A.
- **c. [P2] A hole counts only once EVERY team has posted it** (`team-game.ts` ~376–434). Eight
  staggered foursomes mean the front/back boards, holes won and per-hole money wait for the last
  group. Totals don't wait. That's correct for match-style comparisons, but mid-round the board
  shows "–" for a long time. **Options:** A: keep it and say so ("waiting on Group 8"). B: compare
  on holes both teams have played (pairwise). This is a rule change. Recommend A.
- **d. [question] "Everyone for themselves" stops at 4.** Skins, Stableford and the other
  individual modes are `playersMax: 4`, and a 32-player field only reaches them "as teams" (F-041).
  For a tournament (32 individuals in stroke play or Stableford, or skins across the field) this is
  the next cap. Say whether it matters; the engine question is its own session.
- **e. [P3] Polish, not built:**
  - Leaderboard and card colours repeat past 6 teams (`SIDE_TONES`, `SIDE_ROW_COLORS`).
  - The Back 9 "tied" line lists every tied team, and at 16 teams it wraps to three lines.
  - The hub shows a multi-group team game as one group: the header says "Players" and the team
    build card and field-editor team tools are hidden (`pool/[id]/page.tsx:283`,
    `field-editor.tsx:25`).
  - Printed scorecards show no team tag beside each name, and their footer prints the classic
    ball-selection line on team games.
  - Games with no stored sides fall back in three places to a whole-field split, not the engine's
    tee-group fallback. Legacy only.
  - The ordinal "21th" only appears past 20 teams.
  - `scoreAt` is a linear scan, and the balancer has an 800 ms deadline at 16 teams.

**Built with the cap removal:**
- a card lists only the teams with someone in its foursome once there are more than 6, plus a line
  "12 more teams in other groups — see Standings";
- the hub team editor switches from circles to a list past 4 teams;
- side ids continue `s27`, `s28`, … past 26 teams (`sideIdAt`).

**Status:** DECIDED 2026-09-28 (§5.bw): a → A, b → A, c → A (and hide-holes stays OFF when teams span foursomes; it's anti-cheating for teams that ARE their foursome), d → YES (individual modes go past 4 across tee groups; Wolf and Nines keep their caps). Build queued (NEXT_SESSION_PROMPT). e is backlog.
**a BUILT 2026-09-29 (a30a20b):** a card whose teams span foursomes takes its team rows from the engine. **b BUILT 2026-09-29:** the hub's Add a player asks "Which team?" (no default, add buttons disabled until picked) and saves the player onto that side; not asked when a multi-group game stores no sides, since there the foursome IS the team (F-097). The side move is now one pure helper (`moveToSide` + `sidesPatch` in `sides.ts`) shared with the team editor. **c BUILT 2026-09-29:** during the round each Front / Back / Overall line reads LIVE, like Standings: the leader on score to par over the holes each team has played, with thru (`TeamLegLine.live`, `team-game.ts`). Display only: the contested-hole status/winner/leaders stay, money reads them (F-016), and the settled line shows once the game is closed out or every team is level. Match play (holes won) has no live reading. A "waiting on Group N" label was built first and dropped: Craig, "im still unsure of what this does … teams want to know what the current standings are during the round" (§5.bw note).

**d BUILT 2026-09-29** (plan `.claude/plans/f101d-individual-modes-past-4.md`; money calls §5.ca):
- Skins, Stableford, low total and quota are uncapped; Wolf and Nines keep four.
- In the wizard, a solo (or all-singles) field past 4 goes through the Groups step.
- On the hub, a group that has outgrown its tee slot gets the split prompt, and the heading reads "Tee groups".
- The card says "N more players in other groups — see Standings".
- Skins now has a **skins pot**. Past 4 players it is the default, and so is the junk pot.
- A skin is decided once every tee group has posted the hole. Until then the board lists it under "Skins still open, low so far".
- Goldens: the 4-player keys were re-keyed unchanged, and 8 and 32 were added. `individual-field.test.ts` covers 32 and 144 players across every money model and junk payout.
- Seed: "F-101 d: Skins, 32 players, 8 foursomes (staggered)".

### F-103 — Walk findings from F-101 d (2026-09-29)  [P2] [track]

- **a. DECIDED + BUILT 2026-10-01 (§5.cc):** a Leading column, open holes with "N of 32 played", and the pot's $ labelled "if it ended now". Original: **The skins pot pays live on the skins decided so far.** In the 32-player seed only holes
  1–4 are decided (the last group is thru 4). One skin has been won, so Ula reads **+$310** and everyone else −$10, while 14 holes are still open. The arithmetic is right: the pot splits by skins won so far. But mid-round it reads as though the pot is already won.
  Options:
  - (A) Mid-round, show the pot's money as "if it ended now".
  - (B) Hide the pot's $ column until the game closes; skins still show.
  - (C) Leave it as is.
  - Craig's call (money display).
- **b. A skins card's header reads "Stroke Play · Best Net + Best Gross · Full Handicap".**
  It is the classic pool's format line on an individual game's card (`f101d-card-32.png`). Probably pre-existing for every mode game, not new with F-101 d. Check it at 4 players before fixing.
- **c. (suspected, not reproduced) CTP across tee groups.** `ctpWinners` holds one winner per par 3
  for the whole game, stored on the game row, not on a group's scores. At 8 groups, every group's scorer
  can set it. Two open cards could overwrite each other's pick, and a later group could "win" a par 3
  over a closer ball it never saw. Options:
  - (A) Reproduce it with two tabs in the sandbox first.
  - (B) Show "CTP so far: X (Group N)" on every card, so the next group only overwrites on purpose.
  - (C) Record a CTP per group, and have the organizer pick at the end.

  Check first how the game row is merged on save (last write wins vs a per-field merge).

### F-104 — A share-link visitor (no GHIN login) can create a game, and it saves with no owner (2026-10-01)  [P3] [start] — **FIXED 2026-10-05 (opt A):** Create opens a GHIN login first

**Seen:** the GHIN dependency sweep, in code, not on screen. A `?key=` link grants `pool` access
(`invite-gate.ts:52`), which allows `/pool*`, including `/pool/new`. A game made there gets
`createdByGhin: undefined` (`pool/new/page.tsx:669`). No "My Games" list matches it again, so only
the app owner sees it.

**This conflicts with §5.ch:** only GHIN-login users organize. Options:
- (A) At Create, `/pool/new` requires a GHIN login. The course step already offers an inline login
  (`course-step.tsx:57`).
- (B) Hide "New game" from `pool`-level visitors.
- (C) Leave it until §5c security.

Not yet reproduced on screen; walk it in the sandbox with a share link first. Tag: [beta #4]. An
owner-less game breaks "every player finds their games".

### F-105 — The wizard's "Share" sends the ORGANIZER link, not this game (2026-10-05)  [P2] [start] — **DECIDED 2026-10-05 (§5.cl): A + C**, built with B3

**Seen:** in code, while answering Craig ("is the share button available throughout the game set up
process?"). Every wizard step has a header "Share" (`pool/new/page.tsx:715`, `PoolShareButton`). It
shares `/pool?key=ORGANIZER_TOKEN`, a link to *create your own* games. The game being set up doesn't
exist until Create, so there's nothing of it to share yet. A first-timer who taps Share mid-setup to
invite their foursome sends friends a create-games link instead. After Create, the hub's Share opens
the right sheet (the player scoring link first).

**Part of the "when does sharing happen" design question** (B3, parked for the branding/design
discussion, 2026-10-05). Options:
- (A) Remove Share from the wizard. Sharing happens on the game, after Create.
- (B) Relabel it "Invite a co-organizer", so it says what it sends.
- (C) Make Create the share moment: "Create & send to players" opens the player link sheet (B3).

A and C combine. Tag: [beta #1]. **Craig picked A + C (§5.cl).**


---

### F-113 — The wizard drops "Hole by hole (match play)" on a classic head-to-head game: its legs settle on stroke totals (2026-10-12)  [P1 money] [beta #6] — **FIXED 2026-10-12; no live game affected**

Found by the F-109 builder check (`e2e/f109-money-game-in-wizard.spec.ts`, which fails on today's code).
The router builds the right config: `routedFields` (`game-structure.ts:605`) sets
`matchConfig.scoring = 'holes'` when the scoring step says match play. Then `createPoolGame`
(`pool/new/page.tsx:806`) overwrites `matchConfig` with `buildMatchConfig()` (~716), which returns
only `legDollars` and `junkPerPoint`. `scoring` is lost, and `computePoolResult` treats a missing
value as `'stroke'` (`pool-game.ts` ~2266). So a 2-team, teams-of-4, head-to-head ("legs") game set
up as "Hole by hole (match play)" pays each leg to the LOWER TOTAL, not the team that won more holes.
The saved format path (`page.tsx` ~551) uses the same `buildMatchConfig`, and so does ~745.
**Since 2026-09-16** (c6c45f2, the collapse; it shipped to main and the friends use it). Not affected:
pot games, and the sides/matches engines. **An existing game can be corrected by hand:** the hub's
settings editor has a Stroke / "Match play (holes won)" toggle (`settings-editor.tsx:414`).

**Fix (proposed):** `buildMatchConfig()` keeps the router's `scoring` (and `pointsPerHole`), e.g.
`{ ...DEFAULT_MATCH_CONFIG, scoring: compareBy === 'match' ? 'holes' : 'stroke', legDollars, junkPerPoint }`.
The e2e then passes. A unit golden is needed: the same scores where holes-won and the total disagree.
**Live games, counted READ-ONLY 2026-10-12** (Craig approved; `.claude/f113/count.mjs`, SELECT
only): 68 pool games; 8 are classic 2-team head-to-head. **None was hit.** The 4 without `scoring` are
from 2026-07-29/30, before match-play scoring existed (07-31), so they're stroke-total games as they
were meant to be. The other 4 carry `scoring=holes`, including the only one made after the
collapse (2026-09-18, "The Big Boss Invitational"). No backfill needed.

**FIXED 2026-10-12:** `buildMatchConfig()` carries `scoring` + `pointsPerHole`. Pinned by
`e2e/f109-money-game-in-wizard.spec.ts` (fails before, passes after) and
`src/test/f113-match-scoring-kept.test.ts` (on these scores the setting is a $30-a-player swing).

### F-112 — The old builders offer settings that nothing scores: auto-press, and quick-game skins money (2026-10-12)  [P2] [beta #6]

Found by the builder check for §5.cw d. "Auto-press when 2 down" (`formats.ts` 162-166 and 180-184;
shown at `tournament/new` 872-899 and `game/new` 829-836) is stored and never read: there are **no presses
anywhere** in the app, old or new. Quick-game "Skins" with carryover and $ per skin (`formats.ts` 196-209) is
scored as plain match play on `/game/play` (~1455), so it never paid skins. A user who picks either
would believe it counted. The wizard's skins (game-modes/skins.ts) do work. **Worse, the Money Game's dollars are never paid.** `/money-game` saves `moneyConfig` (Nassau
front/back/overall $ and birdie/eagle $) on the tournament and in `sessionStorage money_config_<id>`,
and nothing reads either one. `computeMoneyResult` (`money-game.ts`) has no caller, and
`/tournament/[id]/money` computes only from `tournament.moneyGames`, which the builder never sets. So
it runs as a points race whose bonus NAMES carry dollar amounts ("Front 9 ($10)"). Presses don't exist at all,
and they're a very common money game (BACKLOG Ideas). Fix: hide the dead settings, or remove the old
builders that show them.

### F-111 — The group page can't add a new player by GHIN; it only lists saved players (2026-10-12)  [P2] [beta #1]

Craig: "in terms of setting up games, adding players to groups, we need to be able to use the ghin
to find users handicaps." F-040 B made ONE add-player stack (`components/add-player-panel.tsx`: GHIN
name search, then manual, then GHIN numbers). Two surfaces drifted from it:

| Surface | Saved | GHIN name search | GHIN # | Manual |
|---|---|---|---|---|
| Wizard player step | ✓ | ✓ | ✓ list | ✓ |
| `/pool/roster` | ✓ | ✓ | ✓ | ✓ |
| Hub "Add a player" (`field-editor.tsx` own panel) | ✓ | ✗ | ✓ | ✗ |
| **Group page "Add players"** | ✓ | ✗ | ✗ | ✗ |

On the group page, someone new means a detour: Full roster manager, GHIN search, save, back, then add.
**Fix:** put the shared panel under the saved-player search; one add saves them to the roster AND adds
them to the group. The hub's late-player panel could take the same name search (asked separately).

### F-110 — The dashboard's GHIN "Link" wipes the signed-in identity for the session (2026-10-12)  [P2] [beta #4]

**Observation:** the `/dashboard` header shows an "Enter GHIN #" + Link form only when the signed-in
user's own index is empty (`dashboard/page.tsx` ~206). `lookupHandicap` (~157) overwrites
`sessionStorage.ghin_golfer` with `{handicap_index, clubs, first_name, last_name}`. That object has no
`ghin`/`golfer_id`, and `readGolfer()` reads session before local (`pool-identity.ts:45`), so
`getCreatorGhin()` returns null until sign-out. Games created after a Link get no `createdByGhin`,
and the viewer sees only owner-less rows (§5.cb). The same family of bug as the pool login loop.
Typing someone ELSE's number also renames "you" to them. It is not a general lookup.

**Options:** (A) keep the GHIN number in the stored object (`ghin: Number(ghinInput)`) and only
replace the index, never the identity; (B) make it a read-only lookup that never writes the session.
**Reproduced in the sandbox 2026-10-12** (a throwaway probe, not kept). The setup was a login whose
handicap lookup failed, which is the only way the index comes back empty
(`api/ghin/login/route.ts` falls back to the bare login identity), or a golfer with no index yet.
After Link, the stored record is `{"handicap_index":"8.1","clubs":[],"first_name":"Craig","last_name":"Hoelzer"}`,
with no number. Then: (1) **Create is refused** with "Log in to create the game" (`pool/new/page.tsx:750`)
although the user IS logged in; (2) "Start from a recent game" disappears (`start-from.tsx:17`
lists by `getCreatorGhin()`); (3) "Part of an event? → Add to …" lists none of their events
(`page.tsx:527`). Signing out and in clears it.

### F-109 — `/dashboard` inventory: what retiring it would remove (2026-10-12)  [P3] [beta #7] — **investigation for §5.cw d**

Craig (§5.cw d): retirement ON HOLD; "the ghin and course search are extremely necessary". Sweep:

| On `/dashboard` | Anywhere else reachable from Home? |
|---|---|
| Own index in the header; GHIN "Link" when it's empty (see F-110) | No. Home shows the name, not the index. The nearest GHIN search is the add-player panel (roster, wizard field step). It can only be reached through an EDITABLE group, and it adds people |
| **Course Lookup**: search, then each tee's yardage, par, CR/Slope for 18/F9/B9, course HCP from your index, and a par/yards/stroke-index hole table | **No.** The wizard and solo searches only PICK a course and tee (a tee `<select>`); no rating, slope or hole table is shown anywhere |
| Money Game (`/money-game`) | No other link at all |
| New Game (`/game/new`) | Only a `/game/play` fallback |
| New Tournament (`/tournament/new`) | Replaced by Start an event (§5.cv); also "Duplicate Format" on a legacy tournament |
| Pool Game, Solo | Yes (Home) |
| Import Tournament | No. It's the only `importTournament` caller, while Export still exists on `/tournament/[id]` |
| Tournament and pool game lists | Yes (the Home feed and group pages) |
| Share organizer link | On `/pool` only |

**About 20 redirects point at `/dashboard`.** The ones that matter: the **pool hub's back button for
every full user** (`pool/[id]/page.tsx:393`); the legacy tournament header (`tournament/[id]:168`);
every "not found" fallback (pool hub, leaderboard, scorecards, teams; tournament pages); `/game/play`
End/finish (F-066). Three e2e specs use the route (f059, visibility-5cb, verify-wizard-home). The legacy
pages `/game/play` and `/tournament/[id]` must stay whatever is chosen, because Home lists old rows.

**Options:**
- (A) Keep `/dashboard` as is. Point the pool hub's back button and the not-found fallbacks at Home
  (the user came from Home).
- (B) Keep `/dashboard`, but slim it into "Lookups": GHIN and Course Lookup stay; the legacy creators
  and Import leave. Repoint the back buttons and fallbacks to Home.
- (C) Move the two lookups to a Home-linked page (`/home/lookup`), redirect `/dashboard` to Home, and
  repoint the ~20 redirects. Import goes, or moves next to Export.
**Builder check (2026-10-12):** **Money Game:** the wizard does all of it (two teams, 2 best net,
Nassau $ per player, birdie/eagle differential via junk). **Quick game:** all of it except a custom
Stableford scale in a TEAM game (the wizard's team Stableford is fixed at 5/4/3/2/1/0; custom
scales are individual only). **Team tournament: NOT covered.** It has the points race across rounds
(Ryder Cup, target score, match-winner points), front/back split formats, skins carrying across
rounds, money games and side games on the SAME scores as the match, best-individual points bonuses,
and the hype, recap and rules pages. Most of that waits for the Event points rollup [after-beta]. Two
of its settings never worked at all (F-112).

In every option the lookups survive. The course reference could also live INSIDE the wizard's tee
step (show CR/Slope/holes there), but that's additive, not a replacement.

### F-108 — The shared stroke allocator caps strokes at 2 a hole, so a course handicap over 36 loses strokes (2026-10-12)  [P2] [beta #6] — **OPEN, Craig's call (handicap math)**

**Seen:** in code, while writing the S2 Q3 ledger goldens. `strokesOnHole` (`lib/strokes.ts`) returns
at most 2: `if (n >= numHoles * 2) return 2 * sign`. A course handicap of 40 should get 3 strokes on
stroke index 1–4 and 2 on the rest (40 in total). It gets 2 everywhere (36), losing 4 strokes. The
same applies on a nine above 18. WHS indexes go to 54, so beginners' course handicaps can exceed 36.
Every engine uses this one allocator: the pool, sides, tournament scoring and the ledger. The plus
side mirrors it (a plus give-back past 36 is just as capped, but no real index gets there).

**Options:**
- (A) Allocate the full handicap: `floor(n / numHoles)` strokes on every hole, plus one more on the
  hardest `n % numHoles`. This is the WHS rule and needs no cap.
- (B) Keep the cap, deliberately (some groups play a max of 2 a hole), as a setting.

A is the Rules. The stroke vs match play check (§5.ce, bar #6) should cover it. Goldens are written
first, and a GHIN-app side-by-side for a CH ≥ 37 player is needed before the change (§5.ba).

### F-107 — Singles matches are paired by ORDER inside a foursome, and hub edits re-sort that order (2026-10-12)  [P2] [beta #6] — **FIXED 2026-10-12 (§5.cq, A + C):** pairings are stored on the tee group (`singles`) and shown on every card; a stale pairing is refused with the reason

**Seen:** in code, while fixing F-106. `pairMatches` (`game-modes/match-pairing.ts`) pairs 1 v 1 matches
in tee-sheet order: A's first player in the foursome against B's first. The hub's swap
(`field-editor.tsx` `swapPlayers` → `orderIds`, captain first), and possibly other tee-group edits,
re-sort a foursome's player list. A swap can therefore change who plays whom in singles without
anyone choosing it. Each pairing still validates and the money still settles; the opponents just
move silently. 2 v 2 isn't affected, because a team has one pair per foursome.

**Options:**
- (A) Store the singles pairing explicitly (a `matchOrder` on the tee group, or per-match ids), so
  order stops carrying meaning.
- (B) Keep order as the pairing, and make every hub edit preserve each team's order inside a foursome.
- (C) Show "who plays whom" on the tee-group card, so any change is visible.

C is worth doing whichever of A or B is chosen. A is the structural fix (§2 "prefer structural
guarantees").

### F-106 — The swap tool previews strokes from a map computed once, but a matches game's strokes can move with a swap (2026-10-12)  [P2] [beta #6] — **FIXED 2026-10-12:** `rankSwapCandidates` recomputes strokes per arrangement (`strokesAfter`) and skips swaps that would unpair the matches. Asked for by Craig, 2026-10-12: "i would need that fixed in order to fulfill our beta standards"

**Seen:** in code, while building F-037 T4. `poolStrokeMap(game)` is computed once in `EditFoursomes`
(`panels/field-editor.tsx:33`) and in the swap panel (`:855`, `useMemo`). It's reused for every
simulated arrangement, on the stated assumption that a swap never moves the field low. Since T4,
off the low in a matches game takes the low PER MATCH, so moving a player can change a match's low,
and with it every stroke count in that match. The preview could then show numbers a stroke or two
off what the card and money use after the swap. Money and the card are unaffected, because they
read the saved game.

**Fix:** simulate on the arrangement. For each candidate, recompute `poolStrokeMap` on the would-be
game (teams/sides swapped), so the preview uses the exact map the saved game will.

### F-100 — A plus index can't be typed on an iPhone: the decimal keypad has no "+" or "−"  [P2] [start]

**Where (found 2026-09-28 building F-098):** the HCP boxes (`add-player-panel.tsx`, the hub
field editor) use `inputMode="decimal"`. iOS shows a digits-and-point pad with no sign key, so
"+2.1" can only arrive through a GHIN import or a hardware keyboard. The parse is correct now
(F-098); the problem is the keypad.

**Options**
- **A. "+" toggle** beside the HCP box: a small ± chip that flips the sign of what's typed.
  Keeps the number pad, and the sign shows at a glance.
- **B. Full keyboard** (`inputMode="text"`): one attribute, but typing a handicap gets clumsier
  for the 99% who aren't plus.
- **C. Rely on GHIN import:** plus players almost always have a GHIN number. Document it
  and change nothing.

**Recommendation:** A. **Status:** BUILT 2026-09-28 (c986125): **A**, a "+" chip beside every handicap-index box (`components/handicap-index-input.tsx`). The sweep is F-102.

---

### F-099 — The new-game step bar runs off a phone screen; the whole wizard scrolls sideways  [P2] [start]

**Where (seen 2026-09-28 walking F-062, `e2e/screenshots/f062-review-chip.png`):** the step
bar at `pool/new/page.tsx:1066` is `flex items-center gap-2` with no wrap and no overflow
rule. An 8-player pool shows Players → Compete → Scoring → *course name* → Tees → Teams →
Money, about 630px wide on a 390px phone, so Tees/Teams/Money sit off-screen, and the page
gains a horizontal scroll that drags every step's form with it. The course step's label is
the course's own name, so a long name makes it worse.

**Options**
- **A. Wrap:** `flex-wrap` on the bar. One class; two lines on a phone.
- **B. Scroll strip:** `overflow-x-auto` on the bar only, scrolled so the current step is in
  view. One line, and the page stops scrolling; later steps are hidden until swiped.
- **C. Compact:** on narrow screens show "Step 5 of 7 · Teams" (plus a thin progress bar),
  with the full bar from `sm:` up.

**Recommendation:** C, which reads best on the phones the friends use; A is the one-line stopgap.

**Status:** DONE 2026-09-28 — **C** (§5.bv). Below `sm:` the bar is "Step 5 of 7 · Tees" plus a thin progress bar; the full bar is back from `sm:` up. `e2e/f099-step-bar.spec.ts` checks for no horizontal overflow at 390px; screenshots `f099-phone-step.png`, `f099-desktop-step.png`.

---

### F-098 — A PLUS-handicap player gets 0 strokes in every pool / sides / money game; the tournament engine gives them back on the wrong holes  [P1] [track] [money]

**Where (code read during the Event-spine survey, 2026-09-27; not yet seen on a screen):**
`getMoneyStrokesOnHole` (`src/lib/money-games.ts:113`) does `if (rounded <= 0) return 0`. It
allocates strokes for the pool engine (`pool-game.ts:1809, 2372`), the sides engine
(`side-game.ts:155`) and the tournament money ledger (`money-games.ts:159, 674`), so in all of
them a player whose playing handicap is below zero plays off scratch rather than giving strokes
back. Off-the-low games never produce a negative handicap. Full-handicap games do, whenever a
plus-index player is in the field.
The tournament's own match engine (`live-scoring.ts:171` `getPlayerStrokesOnHole`) does return
−1/−2, but it applies them where `holeHandicap <= |hcap|` — the HARDEST holes. The usual
USGA/GHIN convention gives a plus player's strokes back on the EASIEST holes, starting at
stroke index 18. So the two engines disagree with each other, and each one disagrees with GHIN
(§5.ba).

**Options:** **A** one shared allocator: negative handicaps give back on SI 18, 17, … (for a
nine, the nine's own order). Both engines call it. Goldens go first (§5.z), with a GHIN-app
side-by-side for a plus player before merging (§5.ba). **B** A, plus a hub note when a plus
player is in the field ("+2 gives back 2 strokes on the easiest holes"). **C** leave it alone
if nobody in the circle carries a plus index. It's latent until then, but the Event spine
converges the two engines, so C only puts off the choice. Recommend A.
Handicap math is Craig's call (§2). Also: does anyone the friends play with carry a plus index?

**Status:** DONE 2026-09-28 (§5.bv, option A + display). One allocator, `src/lib/strokes.ts`
`strokesOnHole`: a plus handicap gives back on SI 18, 17, … (on a USGA nine, index 9 first), and a
second give-back follows the same order past the hole count. `getMoneyStrokesOnHole`,
`live-scoring.ts` (player and team) and the play page's tournament-path copy all call it, and the
team clamps `<= 0 → 0` are gone. Off-the-low was already right: `buildHcapMap` subtracts the lowest
rounded value, so the plus player plays off 0 and the others gain strokes. A typed "+2.1" now keeps
its sign: `parseGhinIndex` runs in the add-player panel, the hub field editor (now a text box with a
decimal keypad) and side-games. `formatHandicapIndex` shows a plus index as "+2" everywhere it used
to show "-2". Give-backs show as a purple ○ on the play page, the leaderboard grid, the scorecards,
the hub StrokeAllocation ("N given back") and the foursome cards ("gives N back").
Tests: `src/test/strokes.test.ts` checks parity for every non-plus handicap, the mirror/conservation
rule, zero-sum for every mode with a plus player, and both engines. A mutation back to
`rounded <= 0` turns 6 red. `e2e/f098-plus-handicap.spec.ts` covers the hub, the leaderboard and
typed entry. The sandbox seed is "F-098: a +2 player in a full-handicap pool".
**Left:** legacy tournament display pages still show only received strokes (dots count
`strokes > 0`): `tournament/[id]/money` :361/:370, side-games :426, side-games/scoreboard :250/:261,
scoreboard :1516/:1527, round page :1329/:1434; and `money-games.ts:672` `strokeHoles` counts
receives only. The math is right; only the dots are missing. LOW, see BACKLOG. The GHIN-app
side-by-side for a plus player (§5.ba) is still to do on the course. Also see F-100.

---

### F-097 — An aligned team game on margin money settles on two INVENTED sides, not the teams shown  [P1] [track] [money]

**Where (probe, 2026-09-18, Phase 3 step 6 walk):** build 8 players → 3 + 3 + 2 (each team its own
tee group, so the wizard uses the foursome builder and never sets `sides`) → money "$ per point"
(margin money routes to the team engine). `createPoolGame` passes `teamIds = (sides ?? [])` → the
saved game has `sides: []`. The engine's `sidesForCompute` sees no sides and falls back to
`defaultSubTeams` — a handicap-balanced TWO-side split of the whole field. Probe: the leaderboard
standings are "Player2 & Player4" vs "Player1 & Player3" while the hub header says "3 + 3 + 2 ·
$/point · 3 groups" and its foursome cards show three teams. Same for two teams of four on $/hole or
$/point (the collapse-routing e2e only checks the hub label, so it passed). Pre-existing since the
Phase 1 routing (2026-09-15); not on `main`; no live game is shaped like this (the friends play the
classic pot).

**Options:** **A** the wizard hands the router the TEE GROUPS as the sides whenever the aligned flow
built the teams (`teamIds`/`opts.sides` fall back to `teams`, captains included) — the engine then
settles exactly the teams on screen, and the hub's Teams list appears for them too. **B** engine
backstop: `sidesForCompute` falls back to the tee groups (not `defaultSubTeams`) when the game has 2+
tee groups — a one-group 2v2 with no sides keeps today's default. **C** both. Recommend **C**: A is
the fix, B stops any future writer recreating the bug. Golden first (§5.z): the probe above, expecting
three standings named for the tee groups.

**Status:** FIXED 2026-09-18 (option C, Craig's go — §5.bs). `sidesForCompute` backstops to the tee
groups (captains carried) when a game stores no sides and has 2+ tee groups; the wizard hands the
router the tee groups as the sides in the aligned flow. Golden `f097-aligned-sides.test.ts` (2 failed
first: two invented sides, not three); e2e pin in `phase3-convergence.spec.ts` (hub lists the three
teams with captains). One-foursome 2v2 games keep their default split (one-group goldens unmoved).

---

### F-096 — The team money step stacks the pot's three share fields as full-width rows  [P3] [start]

**Where (`walk-B-pairs-10-money-pot.png`, 2026-09-18, Phase 3 step 4):** picking "Pot" for four pairs
now shows "Front 9 share of pot", "Back 9 share of pot", "Overall share of pot" and "Places paid (%)"
as four full-width inputs, each with a hint — a screen and a half of Stakes on a phone before the
bonuses. The classic pot's money step shows the same idea as ONE row of small dollar boxes
(front / back / overall / junk) that add up.

**Options:** **A** render the three (four with junk) shares as one inline row of small inputs, hints
collapsed to one line under the row — the classic pot-dollars layout, reused. **B** keep the generic
schema rows (what the hub editor shows too). Recommend A for the wizard only; the hub editor is
read-mostly and its two-column grid already fits.

**Status:** FIXED 2026-09-18 (opt A, §5.bs, commit 4baca75) — one inline row "Pot split (shares)" under the stakes; `potJunk` sits with the junk-payout fields.

---

### F-095 — On a sliced team pot the leaderboard lists the same legs twice  [P3] [track]

**Where (`phase3-pot-slices-leaderboard.png`, 2026-09-18, Phase 3 step 4):** the "Front · Back ·
Overall" leg board shows each leg's margin ("Craig & Jym by 2"); directly beneath it the new "Pot"
board shows the same three legs again with their dollars and winner, plus a Junk row. Two boards,
three shared rows, one story.

**Options:** **A** under a sliced pot, the leg board grows a "$20 pot" sub-line and the Pot board
shows only what the leg board can't — the Junk slice and the total; **B** merge fully: one board with
margin AND dollars per row, Junk as a fourth row; **C** keep both (as built). Recommend B — one row
per thing that pays, like the classic pool's leg board.

**Status:** FIXED 2026-09-18 (opt B, §5.bs, commit a9352ac) — one leg board: margin and dollars per row, Junk as a fourth row; the separate Pot board is gone.

---

### F-094 — Under `legs` with 3+ teams the SECOND team pays the leader but never collects from the third  [P2] [track] [money]

**Where (`team-game.ts` `payLeg`, found 2026-09-17 by the Phase 3 step 3 goldens):** A beats B beats C
on a $10 front. Today pays **A +20, B −10, C −10**: every side behind pays each LEADER; a non-leader
collects from nobody. §5.aj's stated principle ("you owe every side you lost to … lose to two sides,
owe two sides") and §5.ae's worked example ("2nd owes only 1st, and collects from 3rd") both say B
should collect $10 from C → **A +20, B 0, C −20**. The tie cases pinned by F-017 (A = B, C pays both)
come out the same under either reading, which is why this was never caught; the "MUST NOT MOVE"
N-side snapshots pin B at −10.

**What it means for Phase 3 step 3 (§5.bq):** today's `legs` is neither of the two chosen modes —
it is *winner-takes* for distinct places and *pay-each* for ties. The step introduces both modes
explicitly; the open question is which one `legs` DEFAULTS to (Craig's call, asked 2026-09-17).

**Options:** **A** default `legs` to *pay each team you lost to* (matches §5.ae/§5.aj's words and Q-B;
a saved 3+-team legs game moves: B −10 → 0, C −10 → −20). **B** default `legs` to *winner takes from
everyone* (saved games' distinct-place payouts stay; their tie-at-top payouts change from C −20 to
C −10 per Q-C). **C** default `legs` per money model as today's hybrid and offer both modes only as
explicit choices (nothing saved moves; the hybrid stays a third, unnamed behaviour).

**Status:** DECIDED 2026-09-17 (§5.br) — option B: `legs` default to winner-take-all (today's distinct-place
numbers stay), a winner-take-all tie splits (C −10, A +5, B +5 — moves the F-017 tie pins); pay-each is
the explicit alternative and keeps §5.aj's "owe both" tie. Built as Phase 3 step 3.

---

### F-093 — On a team game's money step, "Junk pays" comes before the bonus grid it depends on  [P3] [start]

**Where (`phase3-pairs-ctp-money.png`, 2026-09-17):** for a shared-foursome team the Stakes block
(legs, then "Junk pays", "$ per junk point", "Bonuses count") renders ABOVE "Bonus points for good
holes" and the hand-tracked buttons — so a first-time user is asked how junk pays before choosing
any junk. Same shape as F-087 (classic: bonus sections between the money question and its amounts).

**Options:** **A** move the junk-payout fields (`junkPayout`, `junkPerPoint`, `junkPot`,
`junkBasis`) under the bonus grid, so the order is money model → stakes → bonuses → how bonuses pay.
**B** fold them into the bonus grid's block as its footer. Recommend A; resolve with F-087 in one
pass so both containers read the same order.

**Status:** FIXED 2026-09-18 (opt A, §5.bs, commit ce439ac) — "How the bonuses pay" block renders under the bonus grid.

---

### F-092 — The junk bonus board under a junk POT doesn't say who took the pot  [P3] [track]

**Where (`phase3-junk-pot-leaderboard.png`, 2026-09-17):** with `junkPayout: 'pot'` the board lists
each player's points and the footer says "Junk pot $20 — the most points takes it, ties split.
Already included in the money column." The reader has to add the pairs up and compare to see that
Craig & Jym took it. The standings' $ column carries the answer, but not labelled as junk.

**Options:** **A** footer names the winner(s): "Junk pot $20 → Craig & Jym (3 pts)". **B** a
per-team points row above the player rows. Recommend A — one line, no new table.

**Status:** FIXED 2026-09-18 (opt A, §5.bs, commit a78f0b3) — footer reads "Junk pot $20 → Craig & Jym (3 pts)"; ties named and split.

---

### F-091 — The "How it's played" grid crams label and value together on a phone  [P3] [track]

**Where (`f089-hub-header-phone.png`, 390px, 2026-09-16):** the mode-settings panel is a two-column
key/value grid. At phone width the label column is too narrow, so "Compare by" and "Match (hole by
hole)" render as "CompareMatch (hole by hole)" with no gap, and "Team format" / "Birdie / eagle
bonuses" wrap onto two lines each. Readable on a desktop; a squint on the course. Pre-existing —
the F-089 fix only moved the header above it.

**Options:** **A** below `sm` each setting is one row, label above value (single column). **B** give
the label column a fixed minimum width and let the value wrap. **C** show fewer rows on a phone
(hide settings still at their default). Recommend A — same information, no hidden rows.

**Status:** FIXED 2026-09-18 (opt A, §5.bs, commit 0f0d6df) — one column, label over value, below `sm`.

---

### F-088 — The team-game hub now says "Teams" twice: the money panel's header AND the new section  [P3] [start]

**Where (`f072-hub-pairs-net-gross.png`, `hub-2v2.png`, 2026-09-16):** the money summary panel's
header is the mode's `name`, which Phase 2 made "Teams"; directly under it sits the F-081 section
also headed "Teams". Two identical headings, two different things (settings vs pairings).

**Options:** **A** the money panel's header reads the same for every mode — "How it's played" (or
"Game settings") — since the hub header already names the game. **B** the header reads the format
line (`gameSummary`: "Teams · best ball · Stableford"). **C** rename the mode itself (e.g.
"Team match") — but that word also fronts the settings editor, so pick it once. Recommend A.

**Status:** FIXED 2026-09-16 (340cd60) — opt A, Craig's pick (§5.bp). The mode panel's header is
"How it's played" for every mode. The classic "Pot" / "Head-to-Head Match" headers are
unchanged — they name the money model, not the mode, and nothing repeats there. Pinned in
`e2e/f088-f090-hub.spec.ts` (2v2: one "Teams" heading; skins: same fixed header).

---

### F-089 — The hub header wraps a three-word game name to three lines beside five actions  [P3] [track]

**Where (`f072-hub-pairs-net-gross.png`, phone width, 2026-09-16; noticed in the F-072 session too):**
"Pairs Net Gross" stacks one word per line and the subtitle wraps to four, because the header row
holds Feedback · Share · Save format · Edit · Dashboard on the same line. Pre-existing.

**Options:** **A** actions drop below the title on narrow screens (two rows). **B** collapse the
three secondary actions (Feedback, Save format, Dashboard) into a "…" menu on phones. **C** shorter
labels. Recommend A — no new control, nothing hidden.

**Status:** open.

---

### F-090 — A team game whose bonuses include CTP shows the Closest-to-the-Pin editor, but the team engine never pays it  [P3] [track]

**Where (`hub-2v2.png`, 2026-09-16):** the sandbox 2v2 seed carries classic `junkValues` with
`ctp > 0`, so `CtpEditor` (gated only on par-3s and `junkValues.ctp`) renders four "Hole N — None /
Craig / Jym / …" rows under "Counts toward that team's junk total". `team-game.ts` settles junk
through `settleJunkForSides` and never reads `ctpWinners`, so a pick changes nothing. Scope is
narrow: the wizard turns bonuses off for team games and the router refuses CTP for them, so only
seeded or legacy games hit it — but a legacy live game would show a control that lies.

**Options:** **A** gate `CtpEditor` on the classic container (`!getGameMode(game.gameMode)`) — one
line. **B** Phase 3 makes CTP pay on every engine and the editor becomes truthful. Recommend A now,
B keeps it.

**Status:** open.

---

### F-082 — The money step's greyed options repeat the same red sentence under each  [P3] [start]

**Where (walk flow A money):** "$ per hole won" and "$ per point of margin" each carry the
identical amber/red line. Twice the words, and red reads as an error. **Fix (S):** one line under
the pair ("$ per hole / $ per point aren't built for … yet"), grey not red; goes with F-075's
wording change.

**Status:** FIXED 2026-09-16 (6728a25) — each distinct refusal reason renders ONCE under the money list, grey (`text-gray-500`). Pinned in `f045` (count 1, grey class, after typing CTP on a 4+4 pot).

---

### F-083 — Five hand-tracked bonus buttons are always on screen, even for a group that never plays them  [P3] [track]

**Where (walk flow A money):** Sandie / Greenie / Barkie / Chip-in / Long drive render above the
"+ Add bonuses" button on every classic money step. F-045 put the automatic bonuses behind a
reveal for exactly this reason (§5.bg) and left the manual ones exposed. **Fix (S):** fold them
under the same "+ Add bonuses" reveal; a saved format with manual bonuses restores them open.

**Status:** FIXED 2026-09-16 (f427809) — the five hand-tracked buttons render under the junk grid only once bonuses are added (or a saved format restores manual bonuses). Pinned in `f045`. 'Remove bonuses' leaves chosen manual bonuses in place (non-destructive) — say if it should clear them too.

---

### F-084 — Head-to-head leg amounts are read-only in the wizard  [P2] [start]

**Where (walk flow A, money → Head-to-head):** "Match Payouts ($ / player): $10 / $10 / $10 ·
Junk / pt $5" with no inputs; the only way to change them is a saved format. Pre-existing (the
wizard's `matchLegs` state has never had an editor since the money step moved), surfaced by the
walk. **Fix (S):** inputs for the three legs and junk-per-point, mirroring the pot's split grid.

**Status:** FIXED 2026-09-16 (2b7f5c8) — Front / Back / Overall + Junk / pt are inputs (a nine shows its one leg), bound to the wizard's existing `matchLegs` state. Pinned in `collapse-routing` (15 / 2 typed → hub shows $15 / $2).

---

### F-085 — The groups step lists a group's players by handicap, so you can't see the pairs in it  [P3] [start]

**Where (my read of `walk-B-pairs-07-groups.png`, 2026-09-16, after F-071):** four pairs, Group 1
reads "Gary 2 · Craig 4 · Tony 14 · Rick 16" — the pairs are Gary & Rick and Craig & Tony, and the
screen that promises "partners walk together" gives no way to check it. Each group is sorted by
handicap (`sortPlayerIdsByHcap`), which interleaves the pairs.

**Options:** **A** order a group's rows by TEAM (partners adjacent), handicap within the team; a
thin divider or the team's name as a sub-heading between pairs. **B** a small team tag on each row
("Gary & Rick"). A is one sort key and reads as the claim it makes; B adds text to every row.
Recommend A. Composes with F-081 (the hub's team panel should show the same pairing + tee group).

**Status:** FIXED 2026-09-16 (c7ae51d) on **option A — confirmed by Craig 2026-09-16 (§5.bo)**: rows clustered by team, handicap order within, a dashed rule between teams; display only. Pinned in `collapse-routing` (group 1 reads Craig, Jym, Dave, Rick).

---

### F-086 — "Keep players together" appears on a pairs game, where a lock IS a team  [P3] [start]

**Where (same read, `walk-B-pairs-05-teams-before.png`):** the teams step for four pairs shows the
pool's pairing-locks panel ("Pick two players who should be on the same team… then tap the green
button to build balanced teams that keep them together"). For teams of two the lock and the team
are the same thing, so the panel is a second way to say "these two are partners", above a method
list that says it a third way. Correct, not wrong — but a control whose whole effect is what the
card below already does.

**Options:** **A** hide the locks panel when every team size is 2 or less (a lock can only ever be
one whole team). **B** reword it for pairs ("Fix a pair before balancing the rest"). A is the
minimum-exposed-complexity answer and keeps locks for triples, where they do add something.

**Status:** FIXED 2026-09-16 (9f606cc) on **option A — confirmed by Craig 2026-09-16 (§5.bo)**: the panel renders only when some team is larger than 2. Pinned in `collapse-routing` (gone on four pairs, present on two teams of 4). Note: `lockedGroups` state is shared across structures, so a lock set on a 4+4 before switching to pairs would still steer the balancer invisibly — edge case, not seen in practice.

---

### F-087 — On the money step the bonus sections sit between the money question and its amounts  [P3] [start]

**Where (my read of `walk-A-pool-11-money-legs.png` and `-10-money-bonuses.png`, 2026-09-16, after
F-083/F-084):** head-to-head: "How is the money played?" → Bonus points grid → Extra bonuses (five
buttons) → **Match Payouts** (the legs). Pot: Buy-in → Who gets paid → bonuses → **Pot Split**. The
amounts a game is actually about come last, below two optional sections, and on a phone that is a
full screen of scrolling. Pre-existing order; F-083 made the bonus block taller when opened.

**Options:** **A** move both bonus sections BELOW the money amounts (legs / pot split), so the money
reads top-to-bottom: model → amounts → optional extras. **B** collapse the two bonus sections into one
"Bonuses" block with the junk grid and the manual buttons side by side. A is a reorder only; B is a
redesign. Recommend A.

**Status:** FIXED 2026-09-18 (opt A, §5.bs, commit ce439ac) — the classic pot split and head-to-head legs render right after the money question, bonuses below.

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
