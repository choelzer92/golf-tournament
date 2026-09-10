# Next session: work the friend-feedback batch (F-028…F-033), one by one

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **Context economy:** read DECISIONS.md whole (short); grep
DECISIONS_ARCHIVE.md by § only when touched (§5.bf — friend feedback one-by-one —
matters most this session). Targeted greps on `pool/new/page.tsx` (~3,600 lines).

**State:** branch `live-feedback-2026-09-10` (off main, unmerged), verify green
(exit 0, 128 e2e). Keep building on it (Craig 2026-09-10); merge is his call (§5.ab).
The `feedback_notes` table is LIVE; the 💬 button ships when the branch deploys.

## The work: FINDINGS.md F-028…F-033 — read them there first (they carry the triage)

**The rule (§5.bf): one by one, verified, never taken as fact.** Each item: look at
the actual screen, confirm/refute the triage, propose options, get Craig's pick where
more than one answer is defensible, then build. Rough order (verification-first):

1. **F-033 (1v1/3-player "missing")** — walk the wizard at 2 and 3 players and LOOK.
   The modes mostly exist (Sides/Match at 2, Nines at exactly 3, skins/quota/etc. at
   2–3). Likely outcome: an exposure tweak + an answer back to the friend, not new
   modes. If a specific game IS missing, ask Craig which before building.
2. **F-028 (Stableford points by hole)** — engine already fills `perHole`
   (stableford.ts:72-85). Find where the hole grid renders and what it shows; propose
   where points appear (leaderboard Player Details and/or scorecard).
3. **F-031 (to-par while playing Stableford)** — scorecard-surface check; to-par is
   derivable from entered gross, no new data.
4. **F-030 (score entry ↔ leaderboard round-trip)** — COUNT the taps each way first;
   §6b already promises "standing without leaving the card" — check what a pool
   scorecard actually shows.
5. **F-032 (payout recap at Finish)** — the strongest "continuing" item. `settleUp()`
   (stats-ledger.ts:322) computes who-owes-whom; close-out has no recap moment.
   Money display → propose shape to Craig before building (§2: stop-and-ask).
6. **F-029 (brighter stroke dots)** — cosmetic; screenshot current contrast, keep
   dots deferring to `getMoneyStrokesOnHole`.

**Also answer the friend** (via Craig): men's/women's hole handicaps ARE factored —
`playerHoleStrokeIndex` reads each player's own tee's stroke index (pool-game.ts:514).
His two future thoughts (stat tracking, GHIN export) are in BACKLOG Ideas.

## Queued right behind (BACKLOG "Now")

- **Course-data correctness audit** (Craig: "works for ALL courses — The Meadows is a
  good test; others may be typed in differently"). Extends F-023. Read-only inventory
  of live games' course ratings shapes → harden the parse → make what-we-pulled
  visible. `supabase db query --linked` works for Craig-authorized read-only queries.
  **Getting the Meadows payload — Craig's chosen path (2026-09-10): he logs into
  LOCALHOST.** Run `npx next dev` (real backend, NOT sandbox — GHIN needs real auth),
  Craig logs in via the app's own form, then capture the raw `GetCourseDetails`
  response for "The Meadows" (WV): either watch the dev-server side with a temporary
  console.log in `src/lib/ghin-api.ts getCourseDetails`, or add a dev-only dump. Save
  raw payloads to `course-payloads/` (gitignored). `scripts/fetch-course-payload.mjs`
  also exists as a CLI alternative (env-var credentials) if localhost is unavailable.
  Repeat for any other course Craig suspects is typed differently.
- **Sharing/login/identity audit** (four personas, screenshots; group-management
  consolidation folded in; §5c boundary — real auth/RLS stops for Craig).

## Waiting on Craig

- F-022 on-course GHIN spot-check (§5.ba protocol if off).
- The Meadows `GetCourseDetails` payload (or a logged-in session to fetch it).
- §7 q4 (dark = live / light = setup).
- Branch merge/deploy (§5.ab).

## Traps that keep biting

- Stale `next dev` on port 3200 → every e2e times out (`netstat -ano | grep :3200`).
- Turbopack crash can corrupt `.next` — `rm -rf .next` fixes it.
- Check `npm run verify`'s own exit code, not a `tail` of its log.
- **Look at the screen** — screenshots keep catching what code review doesn't.
- Sandbox scenarios don't all call `signInAsOrganizer()`; /home gates on `ghin_token`.
- `player_ids` in live `roster_groups` is `text[]` — `unnest`/`cardinality`, not jsonb.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
