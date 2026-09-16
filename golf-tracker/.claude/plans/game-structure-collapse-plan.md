# Game-structure collapse — the deep plan (§5.bk / §5.bl)

**Status: WALKED 2026-09-16 (§5.bm) — Phase 1 BUILT on `ui-simplification-2026-09-15`: slice 1
(dc88832, `src/lib/game-structure.ts` + 71 table tests) and slices 2–4 (c6c45f2: structure +
scoring steps, routed money step, draft v2, format-derived structure, 13 specs re-pointed,
`collapse-routing.spec.ts` one-per-row). Verify green. **Slice-3 remainder BUILT 2026-09-16 as
F-071 A:** one `TeamsStep` for every split (`mode: 'money-teams'`), sides derived on leaving,
`proposeTeeGroups` lays the tee sheet, the groups step's shape buttons re-pack whole teams
(`packTeamsIntoShape`), `SubTeamsStep` deleted; F-078/F-079 closed with it. Left: F-072
(scoring math, goldens first), the small wizard batch, then Phase 2 vocabulary. Amendments from the walk, which override the text below
where they differ:**

- **Q1 → route by CAPABILITY, not preference.** §3.3's "prefer classic" is now a consequence,
  not a rule: the router picks whichever engine can carry EVERYTHING configured (CTP / manual
  bonuses / captains / hideHoles / two-ball formats / front-back-overall pot splits are
  classic-only; N>2 head-to-head, $/hole, $/point, non-aligned teams are sides-only; both → classic).
  Nothing is expressible in neither → the money step greys the option with the router's own
  reason (`UNEXPRESSIBLE.*`). §3.4's `moneyModelsFor(container, N)` became `moneyModelsFor(draft)`
  so availability has one source (the router), not a second table.
- **Q2 → no tee-sheet question.** `proposeTeeGroups` packs whole teams into foursomes; the
  groups step still lets anyone drag. `teeSheetFacts` re-derives `aligned` / `teamsTogether`.
- **Q3 → "Other split…" on the structure step** (uneven shapes, from `groupShapesFor`).
- **Q4 → F-063 opt A approved** (separate small commit); opt C its own session.
- **Q5 → "team" everywhere**; `structureLabel` is the one label source for Phase 2.
- Found while building: the sides engine computes best-ball / combined / one-ball only — any
  other `format` silently scores as best-ball — so two-ball formats are a classic-only
  capability, caught by the router. And a classic pool whose scoring is best-ball (not
  net-and-gross) carries `teamFormat`, leaving the golden-snapshot legacy path; slice 2's
  default for "N teams of 4" should therefore be **best net + best gross**, today's pool.

Original plan text follows.
Inputs: `GAME_STRUCTURE_DESIGN.md` (the brief), four read-only code sweeps recovered in
`.claude/plans/collapse-sweeps-2026-09-15.md` (seam inventory, data-model map, live-scoring
facts, wizard/e2e inventory), DECISIONS_ARCHIVE §5.bk/§5.bl/§5l/§5.ad/§5.ae/§5g.

One correction to the sweeps: they report F-060 opt B as still open. It is BUILT (877c9ea):
`CaptainsPanel` remains on the teams step but only picks captains; the rival build button is
gone. `FINDINGS.md` F-060 status was stale and is corrected this session.

---

## 0. The thesis in one paragraph

Two containers exist because they were built at different times, not because golfers
think in two containers. The **classic pool** stores `teams[]` where a team IS a tee group
(one `matchupId` each) and pays a pot by finishing place across front/back/overall/junk legs,
or a 2-foursome head-to-head. The **sides game** (`gameMode:'team-2v2'`) stores `teams[]` as
tee groups and `sides[]` as the money teams, independent (F-019), and settles pairwise
(§5.ae) by per-hole / per-point / fixed legs / single pot. Every user-visible difference
between them is *derivable from two facts the wizard already collects*: **(a) do the money
teams coincide with the tee groups?** and **(b) which money model?** So the collapse is a
**routing layer at game creation** — the wizard asks structure, scoring, teams, tee sheet,
money in plain words; `createPoolGame()` picks the container from (a) and (b); the two
engines, both leaderboards, live scoring and share links are untouched in Phase 1. Later
phases converge the machinery; that is where the money-math stop-and-ask lines bite.

---

## 1. Seam inventory (what the routing must decide, per site)

Full table with line numbers: sweeps file, "Seam Inventory" section. Grouped here by the
decision each seam needs. Counts are real branch sites, not plumbing.

| Decision the collapse must make | Seams (files) | Phase-1 answer |
|---|---|---|
| **Root fork: which engine computes** — `getGameMode(game.gameMode)` truthy → mode.compute, else `computePoolResult` (`result.ts:21-25`) | 1 site, but it defines `GameResult` for everyone downstream | Unchanged. Routing sets `gameMode` (or not) at creation; the fork keeps working. |
| **"Is this single-group?"** — `isSingleGroupGame` / `isIndividualGame` (`result.ts:28-38`) used at leaderboard root (`leaderboard/page.tsx:109`), hub subtitle, field-editor gating, PoolOverviewPanel, create-step review, play-page side rows | ~12 sites | Unchanged in Phase 1 (containers unchanged). Phase 2 renames to what it now means: *"money unit is a side, not a tee group"*. Add `structureOf(game)` beside it as the single vocabulary source (F-061). |
| **Step graph** — `isSingleGroup` / `isWithinGroup` / `needsPlayingGroups` (`new/page.tsx:190-201, 612-641, 650-680`) | the core wizard fork | **Replaced.** New graph keyed on the structure answer (N, K) + tee-sheet alignment, §3 below. |
| **Which step-2 questions show** — classic-only `teamFormat`/`teamScoreBasis` pickers vs mode `ModeSettingsEditor` (`details-step.tsx:380-393, 538-583`); F-042 toggle (`:395-427`); USGA rec keyed on `moneyMode`/category (`:161-179`) | 4 clusters | **Replaced** by one container-neutral scoring step (§3.2). Allowance rec keyed on (format, compare-by), not container. |
| **Money-step content** — pot buy-in/split/positions/junk vs match legs (`create-step.tsx:266-473`); team-2v2 money lives in `modeSettings` | 2 clusters | Money step reads the **routed container's capability set** (§3.4). |
| **Persist shape** — `persistedSides` only for within-group (`page.tsx:398,453`); `matchConfig` only when match (`:407,435`); `potSplit` always written (`:442`) | 3 | `createPoolGame` becomes `routeAndCreate(draft)`: one function, both shapes. Unit-tested table (§3.5). |
| **Mode-setting `potSplit` (string "70,30") vs `PoolGame.potSplit` (leg fractions)** (`team-game.ts:195,541`; `pool-game.ts:180`) | name collision | Leave storage; the money step's wording must not show both as "Pot split". Rename in the draft only (`positionSplitText` already exists for the classic). |
| **Hard-coded 4** — `needsPlayingGroups > 4`, `ceil(players/4)` (teams-step, field-editor), oversized `> 4`, "foursome" wording at `length === 4`, `defaultSubTeams` special-cases 4 | 10 sites (list in sweeps §"Hard-coded-4") | K comes from the structure answer; `groupShapesFor(n, TEE_GROUP_SHAPE_OPTS)` already generalizes walking groups. Foursome wording keyed on group size stays correct. |
| **Scorecard side limit** — `Player.team: 'A'\|'B'` (`pool/[id]/page.tsx:186-199`, `play/page.tsx:1338-1359`) caps sides on one card at 2; `sideBreakdown` fallback for >2 | structural | Unchanged Phase 1 (already the case for 3-side games today). Named as a Phase-3 item. |
| **Classic match needs exactly 2 teams** (`pool-game.ts:2048-2053, 2215`; create-step 467; leaderboard 710; settings-editor) | 5 | Routing never produces classic-match for N≠2 (§3.3). |
| **Hub settings editor: two editors** (`settings-editor.tsx:97-98` early return) | 1 big fork | Unchanged Phase 1; Phase 2 collapses vocabulary, Phase 3 the editor. **Mid-round container switch is NOT offered** (would be a rule change mid-round, §2). |
| **Saved formats / group defaults** copy container fields (`pool-formats.ts:57-71`, `roster-groups.ts:12-41`) | 2 | Additive `structure` field; loader derives it for old formats (§4.3). |
| **Live scoring keyed by `matchupId`** (~150 lines, ~10 real branches) | plumbing | Untouched by the collapse. Evaluated on its own merits in §5. |
| **Literal mode ids** (`'wolf'` ×2) | 2 | Unchanged. |

Test-side hits (19 in `src/test`, 52 e2e term hits across 12 specs) are the migration
cost, itemized in §7.

---

## 2. Data-model map: what a routed game stores

Field table with types: sweeps file, "PoolGame data-model map". The collapse changes the
**meaning of the wizard**, not the stored shape. Field by field:

| Field | Today | After routing (Phase 1) | Later |
|---|---|---|---|
| `gameMode` | absent = classic; registry id = mode | **Set by the router**, not the picker. Absent when routed to classic; `'team-2v2'` for non-aligned teams; individual id for K=1. | Phase 3 may register the classic pool as a real descriptor so `'team'` stops being a phantom category. |
| `teams[]` (+`matchupId`) | classic: money teams = tee groups; sides: tee groups only | **Always the tee sheet.** Same as today in both containers; the router builds them from the tee-sheet step. | Unchanged — this is the live-scoring key (§5). |
| `sides[]` / `subTeams` | sides games only | Written whenever teams ≠ tee groups (router). 2 unnamed sides still persist as legacy `subTeams` (`persistedSides`) — keep, it's what every old 2v2 saved. | Phase 3: drop the legacy write once readers are unified. |
| `teamFormat` / `teamScoreBasis` / `ballSelection` | classic format path; sides use `modeSettings.format/scoring` | Router maps the neutral scoring choice → classic fields OR `modeSettings`. `ballSelection` stays the derived legacy field (`persistedTeamScoring`). | Phase 3: one format field. |
| `moneyMode` / `matchConfig` / `potSplit` / `positionSplit` / `entryPerPlayer` / `junkValues` | classic money | Written only when routed to classic. `potSplit`/`positionSplit` are already derived from wizard dollars. | Phase 3 convergence decides which engine owns pot legs. |
| `modeSettings.{moneyModel,legFront…,dollarsPerHole,dollarsPerPoint,sideBuyIn,potSplit}` | sides money | Written only when routed to sides. | same |
| `captainId`, `useCaptains`, `lockedGroups`, `teamBuild`, `balanceExcludeCaptains`, `hideHolesUntilAllFinish` | classic only | Router writes them when routed to classic. **Gap:** the sides container has no captain/build metadata, so "Four pairs built by captains' deal" loses its ✓-built provenance. Phase 1 accepts; Phase 2 moves `teamBuild` to be container-neutral (it's display metadata, no compute). | |
| `structure` (NEW?) | — | **Derived, not stored** — `structureOf(game)` computes `{teamCount, teamSize(s), aligned, kind}` from `teams`/`sides`. §5.ac: never store what can drift. | Saved formats DO need it stored (no players to derive from): `GroupDefaults.structure?: {teamSize?: number, teamCount?: number, solo?: boolean}` — additive. |
| `customBonuses`, `bonusMarks`, `ctpWinners`, `wolf*`, `voidedLegs`, `shareToken`, `status`, `holesPlaying`, `nineHandicapBasis`, handicap trio | both | Unchanged. | |

**The discriminator stays `gameMode` absent/present.** That is deliberate: every stored
game, saved format, share link and e2e fixture keeps loading with zero migration. The
router is the only new writer.

---

## 3. Routing rules

### 3.1 Inputs the wizard collects (new order)

```
Field (unchanged) → STRUCTURE → SCORING → Course → Tees → TEAMS → [TEE SHEET] → MONEY
```

- **STRUCTURE** = `(N teams, K per team)` or `solo`. Generated from field size with
  `groupShapesFor(n, {min:1, minGroups:2})` (already powers the F-020 side-shape chooser);
  equal-size shapes listed first, uneven under "Other split…". Fit-based default (§5.bk):
  8+ → `N teams of 4`; 4–7 → `2 teams`; 2–3 → `solo` (2 → also offers `1 v 1`).
- **SCORING** = `{format, basis, compareBy}` container-neutral:
  `format ∈ best-ball | two-best (net / gross / 1-net-1-gross) | combined | scramble | alternate-shot`,
  `basis ∈ stroke | stableford`, `compareBy ∈ total | match(hole-by-hole)`.
  For `solo`: the individual mode list (skins, Stableford, quota, Nines, Wolf, low total)
  filtered by `fitForMode`.
- **TEAMS** = who is on which team (the §5k method list: balanced / captains' deal /
  sequential / by hand; captains panel when K ≥ 3 or on request).
- **TEE SHEET** = who walks together. Auto-derived when only one answer makes sense:
  - K = 4 → each team is a foursome. No question (that IS today's classic pool).
  - K ≤ 3 and N·K ≤ 4 → one group. No question (today's 2v2).
  - otherwise → the F-019 groups step, pre-proposed. Default proposal: **teams walk
    together when K ∈ {2,3} fits a group; otherwise balanced mixed**. The step shows one
    line: "Teams walk together" / "Mixed groups (partners in different foursomes)".
- **ALIGNED** = every tee group is exactly one team. Derived, never asked.
- **MONEY** = model + amounts, from the routed container's capability set (§3.4).

### 3.2 Scoring options by structure

| Structure | Scoring choices shown | Backing |
|---|---|---|
| solo (K=1) | skins · Stableford · quota · Nines · Wolf · low total; fit badges as today | individual modes, unchanged |
| 1 v 1 | match / total; stroke / Stableford; Nassau legs | `team-2v2` with two sides of one (exists) |
| N teams of K ≥ 2 | format × basis × compareBy | classic OR sides, by §3.3 |

### 3.3 Container routing table (the spec)

| N | K | aligned | money model chosen | → container | notes |
|---|---|---|---|---|---|
| any | 1 | — | per mode | **individual mode** | unchanged |
| 2 | 1 | — | legs / per-hole / per-point / pot | **sides** (`team-2v2`, sides of one) | 1v1 Nassau, exists |
| ≥2 | ≥2 | **yes** | pot (front/back/overall/junk, finishing places) | **classic pool**, `moneyMode:'pot'` | today's pool; captains/locks/hideHoles/junk/CTP available |
| 2 | ≥2 | **yes** | head-to-head fixed $/leg (+ junk differential, hole-by-hole option) | **classic pool**, `moneyMode:'match'` | today's pool match |
| ≥2 | ≥2 | **yes** | per-hole / per-point margin | **sides** | classic can't express margin money; sides can (sides = tee groups is legal — `sides[]` written even though aligned) |
| ≥2 | ≥2 | **no** | legs / per-hole / per-point / single pot (per-side buy-in) | **sides** | today's 2v2 / 2v2v2 / 4 pairs |
| ≥3 | ≥2 | **no** | *pot by legs with junk* | **not expressible** | sides pot is one prize by finishing order, no legs/junk (§5.ag). Money step hides it; Phase 3 item. |
| ≥2 | ≥2 | any | scramble / alt-shot with K < group size | **not expressible** | one-ball entry is per group (§5.aa); constraint already in the §5g plan. Greyed with reason. |

Rules of thumb the router encodes: **aligned + pot-by-legs → classic; anything with
independent sides → sides; margin money → sides.** Where both containers could serve
(aligned, N=2, fixed legs), prefer **classic** — it carries captains, hideHoles, junk and
the leaderboard the Warriors know; the sides engine's `legs` is the same bet without
those. This preference is the one judgment call in the table; flagged for Craig (§8 Q1).

### 3.4 Money step by routed container

The money step no longer asks "who competes against whom" (F-042 resolved by ordering).
It shows models the routed container supports, in one vocabulary:

| Label on screen | classic | sides |
|---|---|---|
| **Pot — everyone buys in, best team(s) paid** | buy-in/player · front/back/overall(/junk) $ · places paid | buy-in/side · places paid (one pot) |
| **Head-to-head — fixed $ per front / back / overall** | N=2 only · junk $/pt · hole-by-hole toggle | any N (pairwise) |
| **$ per hole won** | — | ✓ |
| **$ per point of margin** | — | ✓ |
| **Bonuses** (birdie/eagle/CTP, manual bonuses) | ✓ | junk toggle only; CTP no |

The capability gaps in that table are the honest residue of two engines. Phase 1 shows
what exists; Phase 3 closes gaps Craig cares about.

### 3.5 Where routing lives

`src/lib/game-structure.ts` (new, pure): `structureOptionsFor(n)`, `structureOf(game)`,
`routeContainer(draft) → {container, gameMode?, modeSettings?, classicFields?}`,
`moneyModelsFor(container, N)`. Unit-tested as a table: **every row of §3.3 and every
sandbox seed / e2e game produces a game whose `computeGameResult` is zero-sum** (the
existing money tests, re-run through the router). Nothing in `game-modes/*` or
`money-games.ts` changes.

---

## 4. Risk list (with what the plan does about each)

### 4.1 Live scoring — see §5 (named first per §5.bl). The collapse itself is neutral to it: `teams[]`/`matchupId` remain the tee sheet in both containers.

### 4.2 Zero-sum and money math
- Engines untouched in Phase 1 → existing tests stand. New: router table test (§3.5) and
  a "same visible game, both containers" test for the overlap row (aligned, N=2, legs):
  classic-match and sides-legs must settle identical money on identical cards. If they
  don't today, that is a finding, not something to paper over.
- `potSplit` name collision: draft-level rename only.

### 4.3 Saved formats and group defaults made under the old picker
- They store `gameMode` (+`modeSettings`, `sides`/`subTeams`) or classic fields. The
  step-2 confirmation needs a structure to display: `structureOf`-for-formats derives it
  (`gameMode` absent → "N teams of 4, each a foursome"; `team-2v2` + `sides` → count/sizes;
  individual → solo). Additive `structure` written by new saves. Test with the three
  fixtures-domain formats (classic, `team-2v2`, `skins`).
- Applying a format still skips to confirmation (§5.ax) — steps 2–3 render as one card.

### 4.4 Wizard draft (sessionStorage `pool_wizard_draft`)
- Hand-rolled, unversioned. Add `draftVersion: 2` with `structure`/`scoring`; a v1 draft
  (no version) is **discarded, not migrated** — it's a half-finished setup on one phone,
  and a wrong migration would create an impossible game (§5.ac). Players/teams/step are
  already not restored, so the loss is small.

### 4.5 Leaderboard axes, hub, scorecard vocabulary
- Phase 1 leaves both leaderboards and the `isSingleGroupGame` fork alone. The **new
  drift risk** is vocabulary: step 2 says "Two teams of 4" while the hub says "Pool ·
  2 foursomes" and the sides hub says "Sides / Match". F-061 is decided by this design:
  `structureOf(game)` → one label (`"2 teams of 4 · head-to-head"`, `"4 pairs · $/point"`,
  `"Skins · 4 players"`). Phase 2 threads it through the 7 label sites F-061 lists.
- Scorecard 2-side cap and "foursome" wording keyed on group size: unchanged, correct.

### 4.6 Share links, guests, continuing
- Token on the game row, unchanged. Scoring link opens the hub; the hub launches by
  `team.matchupId`; unchanged in both containers.

### 4.7 The e2e spec IS the compatibility contract — and it's coupled to the picker
- 12 specs select modes by `<select>` value (`team-2v2`, `skins`, `scramble`, `wolf`,
  `stableford-ind`, `format:…`) or assert picker copy (F-020 fit badges, F-033 hints,
  F-041 redirect, F-042 toggle). Every one must be re-pointed at the structure/scoring
  steps **without weakening its assertion** (each asserts a screen it reached — keep
  that). Helper: extend `e2e/helpers.ts` with `chooseStructure(page, label)` and
  `chooseScoring(page, value)`; don't re-inline.
- Add: one e2e per §3.3 row proving the created game lands on the expected hub/leaderboard
  (positive assertion on something only that container renders).

### 4.8 Capability regressions the collapse could introduce silently
- **"Everyone for themselves" at 5–8 players** is not offered today either (individual
  modes cap at 4 because their context is one group). Step 2 must say so, not hide it:
  list it with "needs 2–4 players" badge (fit rule already does this).
- **8 players solo Stableford** — the F-041 case — is *not* solved by the collapse; it's
  the §5g engine (Phase 3). Don't let step 2 imply it.
- **Captains / hideHoles / junk with non-aligned teams** — lost provenance and features
  (table §2). Say so on the money step ("Bonuses need each team in its own foursome").

### 4.9 Mid-round structure change
- Not offered. The hub settings editor keeps its two shapes in Phase 1; changing
  `gameMode` mid-round today already triggers score-compat guards (`lockOneBall` etc.).
  Adding a container switch mid-round is a §2 stop.

---

## 5. Live scoring: the design-space comparison (§5.bl)

### 5.1 Facts (sweep, file:line in the sweeps file)
- One `game_scores` row per tee group (`matchupId`); `data` = whole `GameScore[]` for the
  group. Every save is a **whole-row upsert, last-write-wins, no version check, no error
  handler** (`tournament-state.ts:273-302`).
- The scorer's phone **never re-reads its own group's row** in a pool game (no
  subscribe/poll for own matchup; `play/page.tsx:191-193`). Others' groups: realtime +
  15s poll + visibility refetch.
- **Two phones on one foursome silently clobber each other** — each holds its own full
  array; whichever 400ms-debounced upsert lands last erases the other's holes; they never
  reconverge. Nothing stops a second phone opening the same team from the share link.
- **A tap within 400ms of leaving the page is dropped** (debounce cleared on unmount, no
  flush; contrast `solo/[id]/page.tsx:139-158` which flushes on `pagehide`).
- **No offline handling**: no outbox, no localStorage for scores, failed writes swallowed.
  A reload loses anything unpersisted.
- `merge_game_scores` RPC (2026-06-09) still exists and is used only by the tournament
  split-scoring path (`scoringTeam` set). It merges by **player ownership per device**,
  which is why it needed a "who scores whom" setup step — the trouble Craig remembers.
- `score_audit` is already a **per-cell** append log (matchup, player, hole, old, new).

### 5.2 The candidates, judged on §5.bl's criteria

| | A. Per-group row, LWW (today) | B. Per-group row + owner-merge RPC (tournament path) | C. **Per-cell rows** (`matchup_id, player_id, hole` PK) | D. Per-group JSON + server cell-merge RPC with per-cell timestamps |
|---|---|---|---|---|
| Two scorers, one foursome, different players | **loses data silently** | correct *if* ownership was declared | correct, no setup | correct, no setup |
| Two scorers, same player same hole | LWW on the whole row | undefined (both own?) | LWW on that cell — the later correction wins, which is the right golf semantics | same as C |
| Score fixed after the fact (continuing) | works; overwrites row | works within ownership | works; one cell | works |
| Refresh latency | one realtime event per save; 400ms debounce | same | one event per cell change (tiny payloads); no debounce needed | one event per RPC |
| Cart-path wifi / offline | writes lost; no queue | same | **idempotent cell upserts queue trivially** (outbox in localStorage, replay in order) | queue possible but merge needs tombstones for cleared scores |
| Recovery after reconnect | refetch others; own row never refetched | refetch | refetch cells for the group; apply remote unless a newer local pending write exists for that cell | same |
| Compute layer impact | none | none | **none** — assemble `GameScore[]` from cells at the boundary | none |
| Schema/migration | none | none | new table + dual-read during transition; audit already per-cell | RPC + blob format change |
| Setup burden on users | none | "who scores whom" step (the historical trouble) | none | none |
| Live-scoring partition still needed for correctness? | yes (§5l is load-bearing) | partly | **no** — partition becomes a fetch/subscribe key only | no |

### 5.3 The real best case
**C — per-cell rows with an outbox and own-group subscription.** It is the only option
that is correct for two scorers with *no* setup, degrades gracefully offline, and leaves
the pure compute layer untouched. It also removes the collapse's biggest hidden
dependency: with cell-granular writes, `matchupId` stops being a correctness boundary
and becomes a convenience key, so "teams ≠ tee groups" games (the whole sides family)
gain the same safety as the pool. B is the abandoned path for a good reason (setup
burden); D reaches C's semantics with more moving parts (tombstones, blob versioning,
an RPC in the hot path).

Two interim fixes are worth doing **before** C, and are safe regardless:
1. **Flush on `pagehide`** (mirror solo-round). Fixes the dropped last tap. S.
2. **Subscribe to own group + cell-level merge on the client** (local pending cell wins,
   otherwise take remote). Turns silent divergence into eventual convergence *most* of
   the time; it does **not** fix the race where B's whole-row write drops A's cells B
   hasn't received. Say that plainly in the UI plan: this is a mitigation, C is the fix.

**All of §5 is a persistence change → Craig's call (§2).** It is independent of the
collapse and can ship before it, after it, or never. Recommendation: interim fixes now
(they're small and remove a real "continuing" bug), C as its own session with the
sandbox's fake-supabase extended to a cell table first (the sandbox deliberately throws
on the merge RPC today — the same discipline applies).

---

## 6. Screen mocks (ASCII; today's screens for reference in `e2e/screenshots/`)

Reference shots: `oneone-picker.png` (today's step 2 — 14 questions for a 1v1),
`audit-18-wizard-three-sides.png` (sides step), `f045-money-step-no-bonuses.png` (classic
money step), `f019-wizard-groups.png` (groups step), `walk-17-pool-teams-step-before-build.png`.

**Step 2 — structure (8 players)**
```
┌──────────────────────────────────────────────────────────┐
│ Players ✓ → Compete → Scoring → Course → Tees → Teams → $ │
│                                                            │
│ How do you want to compete?               8 players        │
│                                                            │
│ ◉ Two teams of 4                                           │
│   Each team plays as its own foursome — the classic pool   │
│ ○ Four pairs                                               │
│   2v2v2v2 — partners can share a cart or split up          │
│ ○ Everyone for themselves          needs 2–4 players       │
│ ○ Other split…  (3+3+2, 4+2+2 …)                           │
│                                                            │
│ [Next: How is it scored?]                                  │
└──────────────────────────────────────────────────────────┘
```
Default row follows §5.bk. A saved format / group default collapses steps 2–3 into the
existing F-021 confirmation card ("Two teams of 4 · best ball · head-to-head · Change").

**Step 3 — scoring (teams chosen)**
```
│ How is it scored?                                          │
│ Team format   [Best ball (low net) ▾]   two-best · combined│
│                                          scramble · alt-shot│
│ Hole score    (● Net strokes  ○ Stableford points)          │
│ Decide by     (● 18-hole total ○ Hole by hole)              │
│ Handicaps  ▸ 90% USGA rec · everyone in full · course hcp  │  ← collapsed, F-021 style
```
Solo shows the mode list instead (skins / Stableford / quota / Nines / Wolf / low total,
fit badges as today).

**Step 6 — teams (N of K), then tee sheet only when it's a real question**
```
│ Set teams (2 × 4)                                          │
│ [Even them out] [Captains' deal] [Down the list]  ✓ built  │
│ Use captains ○/●   (panel picks captains only — F-060 B)   │
│ Team 1 … Team 2 …  (cards as today)                        │
│                                                            │
│ Who walks together?                     (only if K ≠ 4 and field > 4)
│ ● Teams walk together   ○ Mixed foursomes                  │
│   Group 1: pair A + pair B · 8:10    Group 2: … · 8:20      │
```

**Step 7 — money (routed)**
```
│ What's it worth?                    Two teams of 4 · foursomes │
│ ● Pot — everyone buys in            ○ Head-to-head $/leg       │
│ Buy-in / player $[25]   Front [70] Back [70] Overall [60]       │
│ Who gets paid [100]     + Add bonuses (birdie/eagle/CTP)         │
```
For "Four pairs, mixed": the pot row reads "Buy-in / pair", legs row hides, and
"$ per point" / "$ per hole" appear — the sides engine's set. A one-line note explains
any hidden option ("Bonuses need each team in its own foursome").

---

## 7. Phase plan

| Phase | Ships | Touches | Craig gate |
|---|---|---|---|
| **0 (parallel, optional)** | Live-scoring interim fixes: pagehide flush; own-group subscribe + cell merge | `play/page.tsx`, `tournament-state.ts` | persistence → ask first |
| **1 — the reframe (first slice)** | `game-structure.ts` (pure, tested) · structure step · scoring step · teams step takes (N,K) · tee-sheet question · money step routed · F-042 toggle removed · draft v2 · format loader derives structure · e2e re-pointed + one per routing row | wizard only; **no engine, storage or hub change** | walk the mocks; Q1–Q3 below |
| **2 — vocabulary** | `structureOf` labels through hub/leaderboard/share/formats (F-061); `teamBuild` container-neutral; `isSingleGroupGame` renamed to its meaning | label sites, no math | none beyond §2 |
| **3 — convergence** | pick ONE team engine: §5g "N teams of K within groups" *or* sides engine gains pot-legs/junk; classic becomes a routed shape; one settings editor; scorecard >2 sides | money math | **stop-and-ask, worked examples, tests pinned first (§5.z)** |
| **4 — pairings (F-037)** | two independent matches in one game/share link/recap | settlement partition design | design session |
| **C — per-cell scores** (any time after 0) | new table, outbox, dual-read | persistence | ask first |

**First shippable slice = Phase 1**, split into revertible commits:
1. `game-structure.ts` + tests (pure; zero UI) — proves the routing table.
2. Structure step + scoring step behind the existing step machine; old picker removed;
   draft v2.
3. Teams/tee-sheet step generalized to (N,K); groups step reused.
4. Money step routed; F-042 toggle gone.
5. e2e migration + new routing-row specs; `npm run verify` green.

---

## 8. Questions for Craig (the plan is walkable without answers; these change Phase 1)

1. **Overlap row (aligned, N=2, fixed legs):** route to the classic pool (captains,
   junk, hideHoles, familiar board) or to the sides engine (pairwise, no junk)? Plan says
   classic. If both must be reachable, the money step needs a visible difference to hang
   it on — I'd rather not.
2. **Should "Mixed foursomes" be offered when teams could walk together** (K=2, 8
   players)? Plan: yes, one radio, default "walk together". Or always propose and never
   ask?
3. **"Other split…" (uneven teams)** on step 2, or only at the teams step? Plan: step 2
   under a reveal, because it changes N.
4. **Live scoring:** approve Phase 0 interim fixes now? Schedule C (per-cell) as its own
   session?
5. Confirm the vocabulary: **team** everywhere (a "side" becomes a team; §5.al's
   side/team split was a symptom of the two containers). F-061 then has one answer.
