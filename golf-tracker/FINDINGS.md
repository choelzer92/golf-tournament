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

**Status:** open — Craig has stated the intent; needs sequencing

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

**Recommendation:** **A**, sequenced carefully — extend the compute tests to pin every
current `ballSelection` result first, then add the dispatch, then the UI. It reuses
proven code, keeps one team engine, and the legacy mapping makes existing games
provably unchanged. **C** is the better architecture if a 3+ side within-group game is
ever wanted; worth deciding that before committing to A.

**Note on this being a type change:** like the fixed 5-key bonus list, this is one of
only two findings so far that needs a schema decision rather than a UI fix. Both are
about the same thing — the app's *possibility* ceiling.

**Status:** open — needs Craig's decision on scope

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

**Craig's call needed:** this is money math, so per `DECISIONS.md` §2 I'm not choosing
unilaterally. Worth noting the compute tests didn't catch it because every fixture
scored junk; a regression test for "nobody scores junk" comes with the fix.

**Status:** open — needs Craig's decision (money math)

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
