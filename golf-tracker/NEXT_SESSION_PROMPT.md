# Next session: small wizard batch (F-073…F-086) → Phase 2 vocabulary

**UPDATE 2026-09-16 (third session): F-072 is BUILT (§5.bn)** — one commit on the branch after
2b7f480. Step 2 items 1 and 2 below are done; start at item 3 (the small wizard batch). What
changed: `team-game.ts` no longer scores a side itself — it calls the pool's `teamValueOnHole`
for every `TeamFormat`; the mode schema and hub summary list the three two-ball formats; the
router's `classicOnlyNeeds` lost "Two-ball formats" and gained a guard refusing them for a team of
ONE (`UNEXPRESSIBLE.needTeams('Two-ball formats')`). Goldens: `src/test/f072-two-ball-sides.test.ts`
(164 hand-arithmetic cases, failed 164/164 on the old engine, three mutations caught 164/27/27);
two-side / N-side / one-group goldens unmoved. e2e: `collapse-routing.spec.ts` F-072 row + two pins
flipped from disabled to enabled (`option[value="two-best-net"]`, per-point on a 4+4 net-and-gross
pot). Verify green: 1784 unit · 198 e2e. Screenshots `e2e/screenshots/f072-*.png` read clean.
One thing noticed, not fixed: the hub header wraps a three-word game name to three lines beside
five actions — pre-existing, worth a P3 finding if Craig sees it.

**UPDATE 2026-09-16 (later session): F-071 A is BUILT, with F-078 and F-079** — one commit on the
branch after 078a20c. Step 2 item 1 below is done. The new flow for
shared-foursome teams is tees → Teams (the pool's method list, `mode="money-teams"`) → Groups (only
when 2+ tee groups; shape buttons re-pack whole teams via `packTeamsIntoShape`) → Money; a 1 v 1
goes tees → Money. `SubTeamsStep` is deleted. New e2e helper `buildTeams(page, 'even'|'deal'|'list')`
— 'list' is deterministic (Craig+Jym, Dave+Rick, …) so use it when a test names who's paired.
Retired pins: "Next: Sides", "How do the sides split?", "Name the sides" (wizard), "CHcp N" (wizard).
Two judgement calls to surface to Craig (FINDINGS F-071 status): the teams step opens EMPTY until a
method is tapped (like the pool), and captains default OFF for pairs. Two new P3 findings from my
screenshot read, F-085 (groups rows don't show the pairs) and F-086 (locks panel on a pairs game),
join the small batch. Everything else below still holds.

---

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first, then the HEADER of `.claude/plans/game-structure-collapse-plan.md` (the
status block carries the §5.bm amendments; the body is the original plan — grep it by §, don't
re-read it whole). `DECISIONS_ARCHIVE.md` §5.bm is the record of Craig's five answers.

**State (2026-09-16 end of session):** branch `ui-simplification-2026-09-15`, working tree CLEAN,
verify green (tsc · build · 1784 unit · 198 e2e after F-072). Five new commits since the plan:
dc88832 slice 1 (pure router + tests) · cc826da §5.bm docs · bd2db4d F-063 opt A · c6c45f2
slices 2–4 (the wizard) · the docs groom. **Not merged to main; don't merge/push unbidden (§5.ab)**
— the collapse changes every setup flow and Craig hasn't seen it on a phone yet. Course-data
audit stays PARKED.

## The promoted work

**Step 1 — Craig walks the new wizard.** `NEXT_PUBLIC_SANDBOX=1 npx next dev --port 3200`, seed
"Past games (for recent-course chips)" on /sandbox, then /pool/new. Walk at least: 8 players →
Two teams of 4 → pot (the Warriors' game; must feel unchanged after step 2), 8 → Four pairs →
legs, 4 → Everyone for themselves → skins, 2 → 1 v 1. The screenshots are
`e2e/screenshots/collapse-*.png` if he'd rather read. His review questions are bug reports
(§5.y) — log findings in FINDINGS.md with options, don't fix on sight. Known residue to point
at honestly: the sides flow still says "Sides" (Phase 2), captains/CTP/manual bonuses are
classic-only and the money step says so, a classic format applied to 2 players derives a 1 v 1.

**Step 2 — Craig's walk findings, in this order (he asked for them 2026-09-16, see FINDINGS):**
1. **F-071 one teams step for every split** (option A): `TeamsStep` builds pairs/triples with the
   method list; shared-foursome teams become the sides on leaving it; `proposeTeeGroups` lays the
   tee sheet; groups step only when 2+ groups; side names on the team cards; `SubTeamsStep`
   retires. Grep the e2e pins first: "Sides (", "Next: Sides", A/B/C button flows in f015, f019,
   f020, nsides-audit, collapse-routing.
2. ~~**F-072 two-ball formats on the sides engine**~~ DONE 2026-09-16 (§5.bn) — see the update above.
3. **Small wizard-only batch:** F-073 "match play" wording · F-074 free-form split · F-075
   refusal strings say the true reason · F-076 "+ Add bonuses" leaves CTP at 0 · F-078 hide the
   sides shape chooser once a structure exists · F-079 skip the sides step for 1 v 1 · F-082 one
   grey line for both greyed margin options · F-080 format shown once · F-083 fold manual bonuses
   · F-084 editable head-to-head legs. Each an e2e assertion; several can share one commit.
4. **F-081** rides with Phase 2: the sides hub shows the teams, not just tee groups.

**Craig agreed this order 2026-09-16** ("yes, i agree"): items 1–2, then the small batch, then
Phase 2 vocabulary. **Phase 3 — engine convergence** (closest-to-pin, hand-tracked bonuses and
EVERY money option for every split, so nothing is ever greyed for an engine reason) comes next
and is MONEY MATH: ask Craig for worked examples (who pays whom, one game per shape) before any
code, pin them as tests, then build. His framing to hold onto: *"IT should be relatively easy to
configure any type of game that users want, and not confusing. thats the point of the app."*

**Before handing anything to Craig:** re-run `npx playwright test e2e/collapse-walk.spec.ts`
against a hand-started sandbox and READ every `walk-*.png` as a first-time golfer (memory:
walk-the-ui-before-handoff). He found six findings in ten minutes that the screenshots already
showed.

**Step 3 — Phase 2 vocabulary (F-061)** as before: `structureLabel` through the label sites,
"team" everywhere (§5.bm Q5). Grep "Sides / Match", "Foursomes" pins first (§5.at).

**Stop-and-ask lines:** F-063 opt C (per-cell rows) is persistence → its own session, ask first.
F-069 residue (a non-`TeamFormat` string still defaults to best ball in `teamNetOnHole`, now the
one place for both engines) touches scoring → refuse vs default is Craig's call, ask. F-062 A/B/C
still waits.

## Waiting on Craig

BACKLOG.md table: the phone walk above; F-022 on-course stroke check; §7 q4; F-033 answer to the
friend; F-062 A/B/C.

## Traps that keep biting

- **Do NOT edit app code while `npm run verify` runs** (it hot-reloads the e2e server). Markdown is safe.
- **Kill any hand-started dev server AND `rm -rf .next` before `npm run verify`**; confirm 3200
  free. 3000 = Craig's. Kill on Windows: `netstat -ano | grep ":3200 .*LISTENING"` → `taskkill //PID <pid> //F //T`.
- Check verify's own exit code; when backgrounded, `echo "VERIFY_EXIT=$?" >> log` inside the command.
- Verify takes ~17 min now (198 e2e). Iterate on a spec subset against a hand-started server first.
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
