# Next session: build the friend-feedback fixes (F-028…F-033)

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first. **Context economy:** read DECISIONS.md whole (short); grep
DECISIONS_ARCHIVE.md by § only when touched. The six findings' verification notes +
options live in FINDINGS.md F-028…F-033 — read those entries whole; they carry the
screenshots, the code line numbers, and the recommended option per finding.

**State:** branch `live-feedback-2026-09-10` (off main, unmerged), verify green.
Keep building on it; merge is Craig's call (§5.ab). All six findings were VERIFIED
on screen 2026-09-10 (new sandbox scenarios `stableford-ind-partial` /
`stableford-ind-complete` seed the states). What remains is Craig's option pick per
finding, then build + e2e (`test('F-0xx: …')`) + one commit each.

## The work, in build order once Craig picks

1. **F-029 (stroke dots)** — CSS-only, six call sites (leaderboard 444/458/1283/1290
   dark-board 8px blue-400; play page 976/1034/1210/1269 orange-600). Rec: opt A
   (bigger + higher-contrast classes, both surfaces). No logic change.
2. **F-031 (to-par in points games)** — rec: to-par column in the individual STANDINGS
   table. Derivable from gross; no new data.
3. **F-028 (Stableford points by hole)** — rec: leaderboard Player Details renders the
   engine's `perHole` (points) instead of gross when the mode's metric is points.
4. **F-033 (mode discoverability)** — rec: opt B, a hint line under the game picker when
   playerCount ≤ 3 listing the fitting modes (reuses `modeFits`); picker still defaults
   to Pool unless Craig wants opt A (fit-aware default). NOTE: friend used the app
   BEFORE this branch — part of the answer is "it's clearer now".
5. **F-030 (card↔board switching)** — verified 1 tap each way, state preserved; the
   issue is affordance (corner text links). Craig mused swipe vs "a cleaner button".
   Rec: opt B segmented [Card | Standings] toggle in both headers; opt C (standings
   strip on the card, §6b) as the deeper follow-up. Get his pick — genuinely open.
6. **F-032 (payout recap at Finish)** — MONEY DISPLAY, §2 stop-and-ask: confirm shape
   with Craig before building. Rec: opt A — "Who pays whom" list (from `settleUp()`,
   stats-ledger.ts:322) inside the close-out panel whenever the game is completed.

**Also tell the friend** (via Craig): men's/women's hole handicaps ARE factored
(`playerHoleStrokeIndex`, pool-game.ts:514); 1v1 = Sides/Match, 3-player = Nines +
skins/quota/Stableford/low-total; stat tracking + GHIN export are in BACKLOG Ideas.

## Queued right behind (BACKLOG "Now")

- **Course-data correctness audit** (The Meadows payload — Craig logs into LOCALHOST:
  `npx next dev` real backend, capture `GetCourseDetails` via temporary log in
  `src/lib/ghin-api.ts`; save to `course-payloads/` gitignored; or
  `scripts/fetch-course-payload.mjs`).
- **Sharing/login/identity audit** (four personas, screenshots; group-management
  consolidation folded in; §5c boundary).

## Waiting on Craig

- Option picks for F-028…F-033 (above — mainly F-030 shape and F-032 money display).
- F-022 on-course GHIN spot-check (§5.ba protocol if off).
- The Meadows `GetCourseDetails` payload (or a logged-in localhost session).
- §7 q4 (dark = live / light = setup).
- Branch merge/deploy (§5.ab).

## Traps that keep biting

- Stale `next dev` on port 3200 → every e2e times out (`netstat -ano | grep :3200`).
  Craig sometimes runs his own dev server — check WHOSE process it is before killing.
- **TaskStop on a backgrounded `npx next dev` can leave the CHILD server alive** —
  and Next 16 then refuses any second dev server in the same directory (Craig's
  `npm run dev` errored; verify's e2e webServer silently REUSED the sandbox-less
  survivor → 27 vacuous failures). Worse: Craig opened the surviving SANDBOX server
  and saw an empty app — "did we delete everything?" Kill by PID and confirm the
  port is free. Convention: port 3200 = sandbox/e2e, port 3000 = Craig's real app.
- Turbopack crash can corrupt `.next` — `rm -rf .next` fixes it.
- Check `npm run verify`'s own exit code, not a `tail` of its log.
- **Look at the screen** — the F-030 report said "too many taps"; the screen said
  1 tap with state preserved. The finding was affordance, not mechanics.
- Sandbox scenarios don't all call `signInAsOrganizer()`; /home gates on `ghin_token`.
- On LOCALHOST with the real backend, groups/roster only show after GHIN login
  succeeds (visibility is scoped to `viewerGhin` — roster-groups.ts:83).

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
