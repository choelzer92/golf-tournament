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

**Status:** open — needs Craig's pick

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
