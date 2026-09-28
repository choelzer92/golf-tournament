# Next session: the collapse is LIVE on main — now (1) make the gate fast, (2) design the Event spine, (3) small items

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

**State (2026-09-27):** `ui-simplification-2026-09-15` MERGED to `main` (f163242, 50 commits, §5.bk–§5.bs)
and pushed on Craig's word (§5.bt) after a green full gate (`.claude/verify-2026-09-18-rerun.log`: 2138 unit,
217 e2e, 14.4 min, exit 0). The friends are on the new wizard now. **Start a NEW feature branch for this
session's work** (§5.ab still stands: never merge/push unbidden). Read `AGENTS.md` first, then `DECISIONS.md`
whole; grep the archive by § only when needed.

**Craig's order for this session (his words: "lets try to do steps 1 and 2, and then the smaller items"):**

## Step 1 — Verify speed + context (A + B + D)

BACKLOG row "Verify speed + context" has the facts and options. Build A + B + D; C is not chosen.
- **A parallel Playwright workers.** FIRST verify how `src/test/fake-supabase.ts` scopes its store (its comment
  says one shared in-memory store per server). If per-server, tests that seed on /sandbox would collide across
  workers → either one dev server per worker on ports 3200+N, or scope the store per browser context. Prove the
  choice with a deliberately colliding pair before trusting a green run.
- **B two-tier gate.** `npm run verify:quick` = tsc + unit + the specs touching changed files (git diff against
  the branch base); `npm run verify` stays the full gate, run ONCE before handoff. Update AGENTS.md's loop and
  the traps below to say which tier when.
- **D context.** Never poll a running gate; end the turn and let the completion notification re-invoke. Already
  the practice as of the ninth session — write it into AGENTS.md so it survives.
- Done when: full gate exits 0 with the new config, wall time recorded in the BACKLOG row (target well under
  10 min), and a flaky-collision check passed.

## Step 2 — Home screen & Event model: P3, the shared Event spine (DESIGN, then plan)

**Correction on record (§5.bt):** P1 (`/home` hub) and P2 (`/home/stats` money ledger + settle-up) were BUILT
2026-08-05 and `HOME_V2` is ON since 2026-08-12. The old plan file is gone; the durable record is the session
memory `project_home-screen-and-event-model` and archive §5.bt. What's left is **P3**: make Pool "an Event with
one round" over the shared `game_scores` table, take `Tournament.teams` + `computeStandings` N-way, add owner
to tournaments, converge the two scoring engines on `game-modes/`. It's the hinge that also unlocks >2-team
tournaments, flights (P4, the course/club workflow Craig doesn't want forgotten) and multi-day pool.

This is architecture and touches persistence and scoring → **conversation first, no code.** Read the two data
shapes (`PoolGame` in `lib/pool-game.ts`, `Tournament` in `lib/tournament-state.ts`), the five persistence
files, and `game-modes/`. Then bring Craig: (a) the smallest first slice that's reversible (e.g. tournament
owner field + N-way `teams` behind a flag, no Pool change yet), (b) what the migration story is for the live
rows, (c) which of the pool-only pieces (roster, groups, formats) go app-wide. Write the plan into the repo's
`.claude/plans/event-spine.md` and ask him to approve before building anything.

## Step 3 — the small items (each S; ask where marked)

- Team-engine 8-player cap: 3 teams of 4 on legs / $ per hole / $ per point still refused (`team-2v2`
  playersMax 8; classic holds two teams). BACKLOG "Team engine field cap".
- Phase 2 residue: rename `isSingleGroupGame` for what it means now AND update AGENTS.md's one rule together;
  sandbox seed labels still say "sides"; obsolete snapshot "team-2v2 / 4 players (playersMin)" in
  one-group-golden.
- F-062 A/B/C — ASK Craig for the pick first (§5.bo). F-069 refuse-vs-default — ASK (scoring). F-070 sandbox
  fake gains `.in()`/`.order()`/`.limit()`.

**Also:** friends' feedback on the new wizard is the walk Craig waived — log anything he relays as findings
with options, and a money bug jumps the queue.

## Waiting on Craig

F-022 on-course stroke check vs the GHIN app; F-033 answer to the friend; §7 q4; F-062 A/B/C; F-069.

## Traps that keep biting

- **Do NOT edit app code while `npm run verify` runs** (it hot-reloads the e2e server). Markdown is safe.
- **Kill any hand-started dev server AND `rm -rf .next` before `npm run verify`**; confirm 3200
  free. 3000 = Craig's. Kill on Windows: `netstat -ano | grep ":3200 .*LISTENING"` → `taskkill //PID <pid> //F //T`.
- Check verify's own exit code; when backgrounded, `echo "VERIFY_EXIT=$?" >> log` inside the command.
- Verify takes ~15 min (217 e2e, one worker) — step 1 of this session is fixing that. Iterate on a spec subset against a hand-started server first.
- **Python heredocs in Git Bash break on `$` and long bodies** — write the script to a file
  (`.claude/tmp_*.py`), run it, delete it. `/tmp` in Python is NOT Git Bash's /tmp.
- Editor diagnostics lag one edit behind — trust `npx tsc --noEmit`. The "Props must be
  serializable" warnings on every step component are the Next.js plugin, not tsc.
- Playwright strict mode: `exact: true` when a label prefixes another; `.first()` when a reason
  string renders under two greyed options.
- **New wizard helpers** (`e2e/helpers.ts`): `addPlayers`, `fieldToGameStep(page, players?)`,
  `chooseStructure(page, 'teams:4+4' | label)` (expands "Other split…" itself),
  `toScoringStep(page, structure?)` (names the game if empty — the step requires a name),
  `chooseSolo(page, 'skins')`, `chooseMoney(page, 'per-point')`. Extend, don't re-inline.
- Structure ids: `teams:4+4`, `teams:2+2+2+2`, `teams:2+2+1`, `teams:1+1`, `solo`. Even shapes
  and the recommendation are primary; the rest sit under "Other split…".
- Two players + a classic format → `structureForDefaults` derives 1 v 1 (there's no 2-player pool).
  Use 8 players when a test means the Warriors' game.
- Sandbox owner is ALWAYS GHIN 1234567. e2e failure screenshots land in `test-results/*/test-failed-1.png`.
- The "CHcp" spelling is e2e-pinned (F-043) — renaming it is an F-061/F-062 decision.
- **Write plans into the repo's `.claude/plans/`**, never `~/.claude/plans/`.
- Delegated sweeps report doc status, not code status — verify "still open" against `git log`.

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next (§5.bc).
