# Next session: Phase 3 is BUILT (steps 1–6); FIRST fix F-097 (P1 money, needs Craig's go), then his option picks

**UPDATE 2026-09-18 (eighth session): PHASE 3 STEPS 4–6 ARE BUILT.** Commits on the branch after dda06c3:
974d0c2 step 4 · the steps 5–6 commit · the docs commit. Verify logs `.claude/verify-2026-09-18-p3s4b.log`
(step 4, 214 e2e) and `.claude/verify-2026-09-18-p3s56.log` (steps 5–6) — check `VERIFY_EXIT=`. The first
step-4 run (`…-p3s4.log`) failed ONE e2e on a cold-compile `waitForURL` timeout and passed on a cold rerun
of that spec and on the full rerun; nothing in the diff touched it.

- **Step 4** pot SLICES on the team engine (§5.bq Q-E): `potFront` / `potBack` / `potOverall` / `potJunk` are
  SHARES scaled to the pot (25/25/25/25 ≡ 1/1/1/1 ≡ $20 each); defaults 0 / 0 / 100 / 25 keep every saved pot
  one prize on the overall. `potSplit` relabelled "Places paid (%)", applied per slice via the classic
  `distributePot`. Under a buy-in pot the junk pot IS the junk slice (`junkPot` hidden + ignored there).
  Per-slice eligibility = classic F-011 (only teams that played the nine; nobody started → even split).
  `IndividualResult.potSlices` → `PotSliceBoard` (leaderboard, only when sliced). Router's `potLegs` deleted.
  Goldens `phase3-pot-slices.test.ts` (11; 6 failed first; 3 mutations caught). Seed "Four pairs — POT sliced …".
  **Judgement calls to surface (spec §3 "As built"):** shares not percents; defaults; junk-slice-replaces-junkPot.
- **Step 5** `GameSide.captainId` — the teams step's captain for SHARED-foursome teams (4+2+2, pairs with
  captains on) rides onto the side; `toLegacySubTeams` refuses a captained pair; hub Teams list marks "C";
  a captain moved in the hub editor drops the role. Aligned teams keep their captain on the foursome card as
  always. Hide-holes: the team leaderboard already applied `filterConcealedScores`; the hub editor now offers
  the toggle to team games across 2+ foursomes (`HideHolesToggle`, one component, both containers).
- **Step 6** `classicOnlyNeeds`, `joinNeeds`, `UNEXPRESSIBLE.needAligned/needTwoTeams/needPotOrLegs` and
  `StructureDraft.captains/hideHolesUntilAllFinish` are GONE. Remaining refusals are golf (two-ball on a team
  of one; one-ball apart) or the team engine's 8-player cap: **3 teams of 4 on legs / $/hole / $/point stay
  refused** (classic holds two teams; `team-2v2` playersMax 8) — honest residue, BACKLOG "Team engine field
  cap". Goldens `phase3-captains-hide.test.ts`; e2e `phase3-convergence.spec.ts`.
- **NEW P1 money bug F-097 (probe-proved, NOT fixed — §2 stop-and-ask):** the wizard's ALIGNED flow (two teams
  of 4, 3+3+2, 3+2 — teams built with the foursome builder) never sets `sides`, so a game routed to the team
  engine (margin money) saves `sides: []`; `sidesForCompute` then falls back to `defaultSubTeams` — a
  handicap-balanced TWO-side split — while the hub shows the real teams. Pre-existing since Phase 1
  (2026-09-15), unmerged, no live game shaped like it. Fix = FINDINGS F-097 option C (wizard passes the tee
  groups as sides, captains included + engine backstop to tee groups when 2+ groups). Golden first: the
  probe in F-097. **Ask Craig, then build — first thing.**
- New findings F-095 (sliced pot lists the legs twice), F-096 (share fields dense in the wizard) — his picks.
- Craig, mid-session: the gate is too slow (19–25 min) and sessions burn context waiting → BACKLOG "Verify
  speed + context" (options A parallel workers / B two-tier gate / C trim / D don't poll). His pick.
- Residue: obsolete snapshot "team-2v2 / 4 players (playersMin)" in one-group-golden (pre-existing, harmless);
  individual modes still edit junk via the settings editor; `junkGroupHug` team-only by design.

**Trap learned the hard way:** `npm run verify` is `tsc && build && test && e2e` — writing a
deliberately-failing golden while it runs fails the UNIT stage and skips e2e; and `cmd; echo
VERIFY_EXIT=$?` makes the background task report exit 0. Always read `VERIFY_EXIT=` in the log.

**UPDATE 2026-09-16 (sixth session): the HUB BATCH is BUILT — F-088 A / F-089 A / F-090 A** (§5.bp;
asked outright first per §5.bo, Craig picked A on all three). Three commits after 9a5dc6f: 340cd60 F-088 ·
c60ae11 F-089 · 3965d25 F-090 (+ `e2e/f088-f090-hub.spec.ts`, run against the pre-fix code first: 4/6
failed). What changed: the hub's mode-settings panel is headed **"How it's played"** for every mode
(classic "Pot" / "Head-to-Head Match" headers untouched); below `sm` the hub header stacks the five
actions under the title; `CtpEditor` renders only when `getGameMode(game.gameMode)` is undefined —
Phase 3 lifts that gate. New finding **F-091** (the settings grid crams "CompareMatch (hole by hole)"
at 390px; opt A single-column rows on a phone) — Craig's pick, ASK. Verify log
`.claude/verify-2026-09-16-hub.log` (check `VERIFY_EXIT=`).

**Nothing actionable is left that doesn't need Craig:** Phase 3 needs his worked examples (asked in
the sixth session's closing message — one game per shape: 4 foursomes + fixed legs + bonuses; pairs
+ CTP; 3 teams + pot with junk), F-091 and F-087 need his option, F-062 A/B/C still waits. If he
answers with examples: pin each as a failing test first (§5.z), then build.

**UPDATE 2026-09-16 (fifth session): PHASE 2 VOCABULARY IS BUILT (F-061 + F-081)** — commit b8f9c79 on the
branch after 6db4c9c. Step 3 is DONE. What changed: `gameKindLabel(game)` / `gameKindLabelFrom(facts)`
in `lib/game-structure.ts` is the ONE game-kind label — "2 teams of 4 · pot", "4 pairs · $/point ·
2 groups", "1 v 1 · head-to-head", "Skins · 4 players" (`MONEY_WORD` maps the money model; structure
first, money second, tee-time count only when 2+ groups). It prints on: list cards
(`gameListSubtitle` IS it now — `PoolGameListItem` grew `groupSizes`/`sideSizes`/`money`), the hub
header, the leaderboard header, the save-format modal, the wizard review line. `gameSummary` says
"Teams · best ball" and "Pool". "Side" is gone from every user-visible string: registry hints/labels
("Buy-in ($ / team)", "Pot (buy-in, best team wins)"), the mode `name` is **"Teams"** (a placeholder
— see F-088 C), `defaultSideLabel` → "Team A", the settings editor ("Teams" section, "+ Add a team",
"Remove team C", "Teams options"), money panels, printable sheet, scorecard header ("3 teams"),
`side-names.tsx` ("Name the teams", label "Team A"), review ("Teams (2 vs 2)"). `structureOf` and the
label read the tee groups as the teams when a team game stores no sides (the wizard writes sides
only when partners share a foursome). **F-081:** the hub has a "Teams" section (row per team, custom
name's members beneath, tee group at right — hidden with one group) above the tee-group cards; the
money panel's developer paragraph is gone for team games. e2e pins retargeted in collapse-routing,
verify-core, f006, f015-f018, f019, f020 (`getByText('Group 2').first()` where the Teams tag now
repeats it; the editor's Teams heading is `getByRole('paragraph').filter({ hasText: /^Teams$/ })`
because the hub's "Teams" sheet button and the mode option share the word). Unit: `gameKindLabel
(F-061)` block in game-structure.test.ts, gameListSubtitle tests rewritten. Verify log:
`.claude/verify-2026-09-16-phase2.log` (check `VERIFY_EXIT=`). Screenshots read:
`f072-hub-pairs-net-gross.png`, `hub-2v2.png`, `2v2-leaderboard.png` → three new findings
**F-088** (hub says "Teams" twice: money-panel header is the mode name; opt A "How it's played"),
**F-089** (header wraps a 3-word name to 3 lines beside 5 actions, pre-existing), **F-090** (CTP
editor renders on a legacy team game whose `junkValues.ctp > 0`; the team engine never pays it; opt A
one-line gate). All three are Craig's pick (§5.bo) — ASK, don't build. NOT done (residue, in
BACKLOG): `isSingleGroupGame` rename (AGENTS.md cites it), `teamBuild` container-neutral, sandbox
seed labels still say "sides". UI_CONVENTIONS §vocabulary table rewritten for "team everywhere".

**What to do next:** Phase 3 is money math → its first step is a CONVERSATION, not code: ask Craig
for worked examples (who pays whom, one game per shape: 4 foursomes + fixed legs + bonuses; pairs +
CTP; 3 teams + pot with junk), pin them as tests (§5.z: prove each can fail), then build. While
waiting, the actionable small items are F-088/F-089/F-090 — each needs his option first.


**UPDATE 2026-09-16 (fourth session): the SMALL WIZARD BATCH is BUILT** — ten commits after a89c980,
one per finding (6728a25 F-073+F-075+F-082 · f55c550 F-076 A · b4b6461 F-080 · 2b7f5c8 F-084 ·
9f606cc F-086 A · c7ae51d F-085 A · ec47f98 F-074 · f427809 F-083). Step 2 is DONE; start at
**Step 3 (Phase 2 vocabulary)**. What changed, briefly: scoring buttons say "(stroke play)" /
"(match play)"; the money row says "Head-to-head match"; `UNEXPRESSIBLE` engine-gap reasons read
"Not built yet: …" (the singles branch that said "need teams of two or more" for CTP is gone — that
line is kept for two-ball formats only); the money step shows each refusal reason once, grey;
"+ Add bonuses" sets CTP 0 and also reveals the five hand-tracked buttons (now under the junk grid);
head-to-head legs + junk/pt are inputs; an applied saved style hides the select behind "Start fresh ·
Pick another style"; "Other split…" has a typed row (`parseTeamSizes`, radio value `custom`, aria
"Team sizes"); the groups step clusters rows by team with a dashed rule; the locks panel hides when no
team is bigger than 2. New helpers/exports: `parseTeamSizes`, `structureOptionLabel` (the teams-step
subtitle uses it, so a typed shape is labelled too). Craig confirmed F-076 A, F-085 A, F-086 A afterwards
(§5.bo) — and set the rule: **when an option is his to pick, ASK the question explicitly before
building; don't build the recommendation and ask for a nod after.** New finding
F-087 (bonus sections sit between the money question and its amounts, P3, opt A = reorder). Verify
log: `.claude/verify-2026-09-16-batch.log` (check `VERIFY_EXIT=`). Screenshots read: walk-A money,
walk-B teams/groups, walk-G format, `f074-typed-split.png` — all clean.


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

**State (2026-09-16 end of the fourth session):** branch `ui-simplification-2026-09-15`, working
tree CLEAN after the docs commit, verify run logged in `.claude/verify-2026-09-16-batch.log`
(1787 unit · 200 e2e expected after the batch). Five new commits since the plan:
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
3. ~~**Small wizard-only batch**~~ DONE 2026-09-16 (ten commits) — see the update above.
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

~~**Step 3 — Phase 2 vocabulary (F-061)**~~ DONE 2026-09-16 (fifth session) — see the update at the top.

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
