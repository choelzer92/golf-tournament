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

**Status:** open — needs Craig's decision on scope

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
