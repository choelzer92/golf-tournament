# §5.bk collapse plan — recovered subagent sweeps (session e963b7b6, 2026-09-15)

Recovered verbatim from the subagent transcripts of the session that ran the four read-only code sweeps and then lost connection before writing the plan. These are the subagents' claims. VERIFIED CORRECTION: both the wizard sweep and the seam sweep say F-060 opt B is "still open" — it is BUILT (877c9ea; `CaptainsPanel` remains but only picks captains, the rival build button is gone). Everything else was consistent with the code on 2026-09-15. The plan built from these is `game-structure-collapse-plan.md`.

---

## agent-a41c5684d7dc84d1e.jsonl

**Task (first 200 chars):** Repo: C:\Users\choelzer\golf-tournament\golf-tracker (Next.js golf money-game app). Read-only; do NOT edit.  Goal: document the CURRENT new-game wizard flow and the e2e spec list, as the spec for a pl

# Current New-Game Wizard, E2E Inventory, Sandbox Seeds, Findings, Backlog

All paths under `C:\Users\choelzer\golf-tournament\golf-tracker\`.

---

## 1. The `/pool/new` wizard

**Orchestrator:** `src/app/pool/new/page.tsx`. Step type at `:71`:
`'field' | 'details' | 'course' | 'tees' | 'groups' | 'teams' | 'create'`. Order rendered by `StepIndicator` (`:748-779`): **Players → Game → Course → Tees → [Groups] → [Sides|Teams] → Money**.

Draft: every state var is auto-saved to `sessionStorage['pool_wizard_draft']` (`:259-268`) and rehydrated on mount (`:204-239`) — players/teams/step are deliberately NOT restored. Format seed `pool_format_seed` (`:246-253`) is consumed after the draft so a chosen format wins; `applyGroupDefaults()` (`:295-335`) is the single prefill routine for both group defaults and saved formats; `chooseFormat()` (`:340-351`) applies a format picked inside the game picker; `formatSeedAppliedRef` (`:159`) stops a later group load from clobbering a format.

Derived flags (`:190-201`):
- `modeCategory = getGameMode(gameMode)?.category` — `undefined` = classic pool; `'individual'`; `'team-within-group'`.
- `isSingleGroup` = individual or within-group; `isWithinGroup` = team-within-group.
- `needsPlayingGroups = isWithinGroup && players.length > 4` (F-019).

### Step 1 — Players (`'field'`) — `src/app/pool/new/steps/field-step.tsx`
- Heading: **"Who's playing? (N)"** (`:330`). Panels: "Your groups" chips (`:336-366`), "Choose who's playing" roster checklist (`:369-465`), `AddPlayerPanel` F-040 stack (`:470-475`), field list with tee `<select>` + F-043 `HandicapChip` (`:478-549`), "Save current field as…" group (`:553-573`).
- Collects: `players[]` (Player with teeSetId), `sourceGroupId` (via `onGroupLoaded`), auto-name (`page.tsx:587-593`, F-034 `autoNamedFrom`).
- Group default handling: `loadGroup()` (`:147-180`) — ≤8 members pre-check all, >8 load unchecked (`GROUP_PRECHECK_MAX`, `:137`); applies `group.defaults` unless `skipDefaults` (format seed already applied). Seeds from `POOL_GROUP_SEED_KEY` (`:84-92`) and restored-draft `preselectedGroupId` (`:93-99`).
- Gate: `players.length >= 2` (`:320`). Next label: "Choose Game".
- No showIf — always first.

### Step 2 — Game (`'details'`) — `src/app/pool/new/steps/details-step.tsx`
- Heading: **"What are you playing?"** (`:190`). Questions in order:
  - "What should we call it?" `name` (`:197`) — hidden when a format is applied (name moves into the F-021 summary panel `:318-376`).
  - **"Which game are you playing?"** — THE GAME-MODE PICKER, native `<select>` (`:211-253`). Optgroups: `"{Group} plays"` (F-046 group formats), `"Your saved games"/"Other saved games"` (library), `"Start a new style"/"Game types"`: `Pool (foursomes vs foursomes)` + every `GAME_MODES` entry. **Fit filter (§5.as):** each option's label carries `fitBadge(m, playerCount)` (`:245-249`) — from `src/lib/game-modes/fit.ts:70-86`: `✓ N players` / `needs exactly N` / `needs N more` / `N too many`. `fitForMode` (`fit.ts:39-45`) measures `playersMin/playersMax` against the **whole field**, not the tee group (header comment `fit.ts:8-12`); classic pool (no descriptor) always fits; `playerCount 0` = unknown (no badge). Nothing is disabled — guidance not validation. Amber `fitExplanation` box (`:264-291`) with F-041 redirect ("N players can still score Stableford — as a team Pool… or as Sides / Match") and alternatives list. F-033 sky hint at ≤3 players when Pool is selected (`:298-305`).
  - Ranges today (`src/lib/game-modes/*.ts`): skins/quota/stableford-ind/low-total 2–4; nines 3–4; wolf 4; team-2v2 ("Sides / Match") 2–8 (`team-game.ts:704-707`); classic pool any.
  - `pickGame()` (`:128-145`): `format:<id>` → `onFormatChosen`; raw mode → `setGameMode`, `setModeSettings(defaultSettings(...))`, `setMoneyMode('pot')`; picking a raw mode after a format → `onFormatCleared`.
  - Registered-mode options: `ModeSettingsEditor` (`:380-393`) — for team-2v2 this is where format/scoring/result/moneyModel/legs/junk live; hides side C–F name keys (`hideKeys={unusedSideNameKeys(2)}`).
  - **F-042 "Who competes against whom?"** (`:395-427`) — classic pool only (`!isRegisteredMode && showMoney`). Buttons `All teams, for a pot` → `moneyMode='pot'`; `Two teams, head-to-head` → `'match'`. Helper text states the money mechanics.
  - "How much handicap counts?" `handicapAllowance` + USGA rec / "Use N%" (`:429-472`; `usgaRec` `:157-183` follows teamFormat and flips 85↔90 with moneyMode, F-044).
  - "Who gets strokes?" `strokeMethod` full / off-the-low (`:474-505`).
  - "How many strokes change hands?" `handicapBasis` course / index (`:507-535`).
  - Classic pool only: "Which scores count for the team?" `teamFormat` `<select>` over `TEAM_FORMAT_OPTIONS` (`:538-555`) and "How is the hole scored?" `teamScoreBasis` Strokes / Stableford points (`:557-583`).
- Format/group skip: when `appliedFormat` is set the step becomes a **confirmation** (F-021 / §5.ax): green summary card with editable name (rename = fork), `formatSummaryLine`, and per-section `Change Game / Money / Handicaps` reveal buttons (`:354-373`); sections default closed (`:109-118`). `formatDirty` flips on first edit (`onFormatEdited`).
- Gate: name non-empty (`:185`). Next: "Next: Select Course".

### Step 3 — Course (`'course'`) — `src/app/pool/new/steps/course-step.tsx`
- Heading: **"Select Course"** (`:172`). "Played recently" chips (`:176-194`, `getRecentCourses`), GHIN sign-in card shown on arrival if no token (`:196-225`), name+state search (`:227-246`), selected-course card with "Default Tee" (`:278-290`), **"Holes"** 18 / Front 9 / Back 9 (`:297-315`), conditional **"9-hole handicap"** Half of 18-hole / 9-hole (USGA) shown only when `holesPlaying !== '18'` (`:317-343`).
- Writes: `course`, `holesPlaying`, `nineHandicapBasis`. Not prefilled by formats (formats never carry course).
- Gate: `!!course`. Next: "Next: Set Tees". Course arrival re-resolves every player's tee (`page.tsx:366-374`).

### Step 4 — Tees (`'tees'`) — `src/app/pool/new/steps/tees-step.tsx`
- Heading: **"Tees (N)"** + "Who's playing from where. Tap a player to change their tee." (`:52-53`). Players grouped by tee; tap → same-gender tee chips (`:59-106`). Writes `players[].teeSetId`, remembers on roster.
- Next label is mode-dependent (`page.tsx:612`): `Money` (individual) / `Groups` (needsPlayingGroups) / `Sides` (within-group) / `Teams` (pool).
- **Branching lives in `onNext` (`page.tsx:614-641`):** single-group games auto-build `teams` — `proposePlayingGroups()` if `needsPlayingGroups` else one `"Group"` team holding everyone; within-group also seeds `sides` from `defaultSubTeams` if none; then → `'groups'` or `'teams'`; individual → `'create'`; classic pool → `'teams'`.

### Step 5 (conditional) — Groups (`'groups'`) — `src/app/pool/new/steps/playing-groups-step.tsx` **(F-019)**
- Shown only if `needsPlayingGroups` (Sides/Match with >4 players) — `page.tsx:650`. StepIndicator label "Groups".
- Heading: **"Who's playing together?"** (`:75`) + "N players can't walk as one group… Your sides come next, and a partner can be in the other group."
- **"How do they split?"** shape chooser (`:84-114`) from `groupShapesFor(players.length, TEE_GROUP_SHAPE_OPTS)`, hidden when only one shape fits; `applyShape` re-deals balanced (`dealBalancedIntoShape`). Per-group card with tee time `<input type=time>` and tap-player→"Move X here" (`:116-165`).
- Writes `teams[]` (PoolTeam as playing group: name `Group N`, `matchupId`, `teeTime`). Gate: nobody unassigned, no empty group. Next: "Next: Sides".

### Step 6a — Sides (`'teams'` slot, within-group) — `src/app/pool/new/steps/sub-teams-step.tsx`
- Heading: **"Sides (a vs b…)"** derived from data (`:85-87`); F-037 line **"This makes it a 2 v 2 match"** / "N sides, each playing the others" (`:92-96`).
- **F-020 option C shape chooser "How do the sides split?"** (`:104-134`) from `groupShapesFor(players.length, SIDE_SHAPE_OPTS)`, hidden when one shape; `applySideShape` keeps side ids/names (F-036 fix `:61-74`).
- Per-player row with `CHcp` HandicapChip + one round button per side (A/B/C…) (`:136-173`); `SideNames` collapsible custom names (F-014, `:177`); "+ Add a side" / "Remove side X" (`:181-199`); uneven and unassigned warnings.
- Writes `sides: GameSide[]` (persisted as legacy `{a,b}` `subTeams` at exactly two unnamed sides via `persistedSides`, `page.tsx:453`). Prefill: `applyGroupDefaults` restores `d.sides`/`d.subTeams` (`page.tsx:328-334`); else `defaultSubTeams` balanced default. Gate: no empty side, no unassigned. Back → groups step if it exists.

### Step 6b — Teams (`'teams'` slot, classic pool) — `src/app/pool/new/steps/teams-step.tsx`
- Heading: **"Set Teams"** (`:298`). `numTeams = ceil(players/4)` (`:62`).
- "Team Building": `Use captains` / `No captains` → `useCaptains` (`:301-327`). `CaptainsPanel` when captains on (`:332-347`; owns the rival green "Build balanced teams around captains" button and `excludeCaptains` — F-060 opt B still open). `PairingLocks` → `lockedGroups`, apply = autoBalance (`:352-359`).
- **§5k method list "How should teams be built?"** (`:366-413`), three cards: `optimal` "Even them out around the captains / by handicap" → `autoBalance` (method `'balanced'`); `deal` "Captains' deal" → `autoCaptainsDeal` (`'serpentine'`); `sequential` "Straight down the list" → `autoGenerate` (`'sequential'`). **F-060 ✓ parity:** `runAndShow` scrolls to the result (`:279-282`); used card wears `✓ Built these teams` / `(hand-adjusted since)` from `teamBuild.method` (`:283-284`, `:400-404`).
- Team cards: reorder ▲▼, rename, remove, `TeeTimePicker`, combined HCP, per-player `Make captain` / `Move to` / `Tee` (`:447-574`). "+ Add team", "Order by tee time".
- Writes `teams[]` (`Team N`, `captainId`, `teeTime`), `captainIds`, `lockedGroups`, `balanceExcludeCaptains`, `useCaptains`, `teamBuild`. Prefill: `useCaptains` from group defaults; teams never prefilled. Gate: ≥1 team, none unassigned. Next: "Next: Review & Create".

### Step 7 — Money / Review (`'create'`) — `src/app/pool/new/steps/create-step.tsx`
- Heading: **"What's it worth?"** (classic pool) or **"Review & create"** (any registered mode) (`:186`).
- Registered modes: mode name, `formatSummaryLine` stakes (F-026), **"Save this format"** (§5.ax part 4, `:207-215`), Players / "This game needs N–M" tiles + `fitExplanation` (`:219-243`); within-group shows **Sides (a vs b)** cards with members + CHcp + `sideMoneySummary` words (F-018, `:481-536`); individual shows **Players** per group (F-025, `:544-581`).
- Classic pool: Players / Teams / Total Pot|Type tiles; pot-only questions **"Buy-in per player ($)"** (`:266-277`), **"Who gets paid?"** `positionSplitText` (`:282-293`); **"Extra bonuses to track by hand"** `customBonuses` from `COMMON_BONUSES` (`:298-350`); F-045 **"+ Add bonuses"** → junk grid "Bonus points for good holes" (`:355-396`, `junkValues`, off by default; saved format with junk restores open); **"Pot Split ($ per pot)"** with "The usual split for N teams" + Reset to standard (`:397-440`; nine → single leg; junk leg only when shown); match mode → read-only "Match Payouts ($ / player)" + "needs exactly two foursomes" warning (`:447-473`); **Foursomes** cards (`:583-623`).
- Writes `potDollars`/`potEdited`, `entryPerPlayer`, `positionSplitText`, `junkValues`, `customBonuses`. `createPoolGame()` (`page.tsx:411-491`) folds junk into overall if off, stamps `sourceGroupId`, `teamBuild`, `lockedGroups`, `sides`/`subTeams`, saves roster tees, navigates to `/pool/{id}`.
- Back: `'tees'` for individual, else `'teams'`.

### Where the four named concerns live (summary)
| Concern | File:lines |
|---|---|
| Game-mode picker + player-count fit (§5.as) | `details-step.tsx:211-305`; rule in `src/lib/game-modes/fit.ts:39-101` (whole field, not group) |
| F-042 pot vs head-to-head "Who competes against whom?" | `details-step.tsx:395-427` (classic pool only; step 2, before teams exist) |
| F-020 side-shape chooser | `sub-teams-step.tsx:104-134` (`SIDE_SHAPE_OPTS`); groups twin `playing-groups-step.tsx:84-114` (`TEE_GROUP_SHAPE_OPTS`) |
| §5k team-build method list + F-060 ✓ | `teams-step.tsx:366-413`, `:274-284` |
| F-019 playing groups | gate `page.tsx:201`, step `playing-groups-step.tsx`, proposal `steps/shared.ts:33-56` |

---

## 2. E2E specs (`e2e/`) — "every game creatable today"

**critique.spec.ts**
- capture /home/stats with a real season of money
- F-007: the season ledger balances and settles fully
- capture /home/stats on a phone
- F-009: My money shows only the viewer, across groups
- F-009: a group view shows every member, scoped to that group
- F-008: the group picker excludes saved formats
- capture a 61-member group
- F-010: the group page leads with the dashboard, members collapsed
- F-010: members expand with a search box
- capture a 61-member group on a phone
- capture the home hub
- walk /pool/new at phone width, counting taps
- capture the wizard at desktop width

**f034-stale-draft-name.spec.ts**
- F-034: a name auto-filled by one group is replaced by the next group — across a draft reload
- F-034: a hand-typed name survives switching groups

**f040-add-player.spec.ts**
- F-040: pool wizard field step — search first, bulk paste, name search adds
- F-040: saved players page uses the same stack and persists adds
- F-040: game wizard players step — same stack, player cap still enforced
- F-040: tournament roster step — same stack, players land on teams

**f045-junk-defaults.spec.ts**
- F-045: the money step offers Add bonuses; junk is folded into Overall until then
- F-045: a created junk-off game folds the pot on its own page
- F-045: junk-off leaderboard shows no junk pot row, no Junk Breakdown; scorecard shows no CTP on a par 3
- F-045 control: a junk-ON game still offers CTP on a par 3 (the assertion is not vacuous)
- F-045: JY Classic Pool restores with the bonus grid open and a junk leg in the split

**f047-sharing-fixes.spec.ts**
- F-050/F-051: the invite gate says the code repeats, and grants a ~30-day sliding cookie
- F-051: an existing cookie is refreshed on every visit (sliding expiry)
- F-052: a pool-access visitor who wanders is fenced to My Games, not the wizard
- F-047: Sign Out forgets the cookie and the durable identity
- F-053: a returner with an expired GHIN session is greeted by name
- F-048: a fabricated token-shaped key is refused by the game page
- F-048/F-049: the REAL scoring link still opens, and says who you are
- F-049: an identified viewer sees their own name on the game hub
- F-054: at phone width every saved-player row shows its NAME and Remove

**f055-groups-consolidation.spec.ts**
- F-055: create a group on /home, rename and delete it on its dashboard
- F-055: /pool/roster is saved players only — no second group manager

**f056-058-sharing.spec.ts**
- F-056: a scoring-link guest can open Share, but not Save format or Edit
- F-057: a pool-scope grant expires in ~48h, not 30 days
- F-058: the game-hub QR is generated locally, not by api.qrserver.com
- F-058: the organizer-link QR (My Games header) is generated locally too

**f059-owner-identity.spec.ts**
- F-059: the app owner (full access + owner GHIN) still sees everything
- F-059: a code-holding MEMBER sees exactly their own — not everyone's
- F-059: a code-holder with NO identity gets a login prompt, never everyone's games

**f060-team-build-feedback.spec.ts**
- F-060: Captains' deal marks its card as the one that built the teams

**nsides-audit.spec.ts**
- walk it from empty state to playing, counting taps and options (ordinary 2v2)
- two sides: how many settings does the hub show?
- three sides: how many settings does the hub show?
- capture the scorecard for a 3-side game
- capture the pot board for three uneven sides

**sharing-audit.spec.ts**
- cold visit to /pool hits the invite screen; wrong code errors; right code enters
- a deep link behind an expired cookie: where do you land after re-entering the code?
- landing, identity card, and the pool-only fence
- per-game Share panel copy + QR
- global "Share pool games" modal on /pool
- player opens the link fresh: landing, who-am-I, scorecard path
- a WRONG but token-shaped key on the same game URL
- /home without a GHIN token bounces to the sign-in page
- sign out from /home, then walk back into /pool anyway
- capture both group UIs side by side

**user-walk.spec.ts**
- walk 1: cold start — home, empty, then the wizard with NO group
- walk 2: the group path — group page, one-tap format, confirmation
- walk 3: add players FROM a group inside the wizard
- walk 4: classic pool with teams — captains, deal, teams step
- walk 5: roster — create a NEW group, save players
- walk 6: continue — reopen a mid-round game and enter a score

**verify-core.spec.ts**
- leaderboard shows real side names, not Team A/B
- SCORECARD shows side names too (was the actual defect)
- shows ONE leg with a matching caption (9-hole 2v2)
- a dead heat reads as tied, not as someone leading (2-player)
- hub does not say "1 foursomes" for a one-group game
- classic pool still says foursomes, pluralized
- a loss never renders as $-N
- F-024: the Per Person strip sums to zero
- closing out marks the game completed
- leaderboard is usable one-handed
- scorecard is usable one-handed
- a per-game link opens the game with no login and no invite code
- a pool-access visitor can score and read, but not mutate
- the ORGANIZER still sees every control
- suggests the format allowance and applies it in one tap
- the recommendation changes with the format

**verify-f006-sides.spec.ts**
- the birdie team is 1st on the board, not last
- PACE makes a mid-round total comparable, and reads as points-over-pars
- the per-hole grid highlights the HIGHEST points, not the lowest
- head-to-head: the birdie team wins every leg and is paid
- the picker offers the formats the classic pool could not express
- picking a format explains it, and Stableford changes the scoring line
- the USGA allowance recommendation follows the FORMAT
- an ordinary stroke pool saves the LEGACY way (no teamFormat)
- a scramble or Stableford pool opts IN
- the format survives a reload — a phone that slept mid-setup
- SCRAMBLE enters ONE score for the whole foursome
- the team row EXISTS on a one-sided pool card and matches the money engine
- a one-sided card shows no A-vs-B match badge
- a LEGACY pool scorecard is untouched (per-player, no team format)
- the shared card enters ONE team score and names the foursome
- a game with per-player scores cannot switch to scramble
- a game ALREADY playing scramble can still change its other settings
- a scored 2v2 game cannot switch to a one-ball format
- re-tapping a side a player is already on changes nothing on screen
- the leaderboard shows all three sides, ranked, with money
- the board shows the TO PAR figure it ranks on
- side C, thru fewer holes, is not paid for playing less golf
- a bad to-par is drawn red, not the same grey as a good one
- a third side can be NAMED, and unused name boxes stay hidden
- the hub can add and remove a side
- the board shows the pot and pays the best side
- the buy-in and split fields appear only for a pot game
- draws a row per side, with rank + margin in the game own unit
- every player can still enter a score, including on the third side
- a TWO-side game keeps its familiar UP/DN badge

**verify-f015-f018-review.spec.ts**
- the prompt names only the SHORT legs, and the money follows the answer
- unticking a leg pays it on the holes everyone played
- a fully-scored game is asked nothing
- an UNNAMED side shows no name row at all
- a game saved with the LEGACY name settings keeps its names
- a 2v2 review shows both sides, their members, and the stakes
- a 3-side review names all three, including one named in the wizard

**verify-f019-groups.spec.ts**
- F-019: the money reads BOTH groups — a partner in the other foursome counts
- F-019: the player grid lists EVERY group, not just the first
- F-019: the teams sheet prints a box per tee time
- F-019: the teams sheet carries the SIDES as well as the tee groups
- F-019: a 3-player group is never called a foursome
- F-019: a classic pool of foursomes still says foursomes
- F-019: a threesome and a guest on nobody's side
- F-019: an ordinary ONE-group 2v2 is unchanged
- F-019: side totals on the card match the board when partners are split
- F-019: the hub prompts, and keeping one group changes nothing
- F-019: splitting 3 + 2 CARRIES the scores already entered
- F-019: splitting to FEWER groups preserves every score
- F-019: eight players are asked how they split, and get two tee times
- F-019: choosing 3 + 3 + 2 gives three groups
- F-019: an ordinary 2v2 is NOT asked about groups
- F-019: five players get 3 + 2 without being asked (only one shape fits)

**verify-f020-picker.spec.ts**
- F-020 (§5.au): the picker annotates fit on the FIRST pass — the field now comes first
- F-020: picking a game that cannot work explains it HERE, and names one that can
- F-020: no screen claims a side game is played in a single group
- F-036: reshaping 8 players to 2v2v2v2 yields four DISTINCT sides
- §5.aw: the group lists its formats instead of the empty state
- §5.aw: two taps from the group to a correctly pre-filled game
- F-021: an applied format shows a summary, not 15 questions
- F-021: nothing is hidden — each section reopens on its own
- F-021: editing a value invites a rename, and never rewrites the original
- §5.av: the game picker offers saved formats first, and one tap applies everything
- §5.av: a classic-pool format switches an individual-mode wizard back to classic
- F-021: a game built from SCRATCH is unchanged — no summary, all questions
- 1v1: the board names the players and settles a real Nassau
- 1v1: the wizard offers Sides at two players and builds 1 vs 1
- 1v1: a solo against a pair still says (solo)
- F-020: five players are OFFERED the splits, not given one
- F-020: choosing 2 v 2 v 1 really makes three sides
- F-020: four players still get the choice (2v2 is not the only answer)
- F-020: a named side keeps its name across a reshape

**verify-f025-f046-live-feedback.spec.ts**
- F-025: the review says Players — no Foursomes, no Group, no combined CHcp
- F-026: the review states the stakes for an individual game
- F-029: the dark leaderboard renders dots at 11px sky-300, not 8px blue-400
- F-029: the score-entry card renders its orange dots at text-sm
- F-031: the individual standings table has a To par column with real figures
- F-028: the details grid renders pts whose Out total matches the standings
- F-033: at 2 players the game step lists the games that fit
- F-033: at 3 players the hint includes Nines; at 4 it is absent
- F-030: the pill round-trips card → standings → card and keeps the hole
- F-032: the close-out panel grows a Who pays whom list, and it persists
- F-043: tapping a CHcp chip on the sides step opens the index → CH → plays-off chain
- F-046: the game step leads with the chosen group's usual games, labeled as the group's
- F-046: Save format on a group's game attaches to the group, and the next round offers it

**verify-wizard-home.spec.ts**
- choosing a group loads its people, applies its settings, and names the game
- a small crew still loads all-checked
- a user with no groups never sees the picker
- send from the hub header, read back with author and game link
- the home page offers the box and the read-back link
- F-027: the group members list shows GHIN #… for a blank-named row
- the game step no longer asks money questions
- a finished back nine says "9 of 9 holes", never "thru 9"
- a 9-hole game does not say "9 of 18"
- the course step prompts on arrival, not after a failed search
- offers a previously played course as one tap
- the two landing screens work and link to each other
- the scorer can toggle a bonus for any player in the foursome
- a game with no custom bonuses shows no toggles at all
- bonuses are off by default and pickable on the money step

### `e2e/helpers.ts` exports
| Export | Line | Purpose |
|---|---|---|
| `BASE` | 14 | Base URL (`SANDBOX_URL` or `http://localhost:3200`) |
| `PHONE` | 15 | 390×844 viewport |
| `grantAndReset(context, page)` | 20 | Set invite cookie, clear fake backend (sessionStorage), reload |
| `resetBackend(context, page)` | 29 | Same without the reload (verify-* files' `seed()` reloads) |
| `seedCard(page, label)` | 36 | Click "Seed" on a /sandbox scenario card by label |
| `seedAndOpenGame(page, label)` | 44 | Seed a scenario, follow "Open →", return the game id |
| `freshGuest(browser, store)` | 55 | New browser context carrying only the seeded store — "another device" |
| `seed(page, label)` | 68 | Go to /sandbox, seed by label, open, return game id |
| `goToGame(page, id, sub)` | 93 | Client-side navigate within a seeded game (no reload) |
| `fieldToGameStep(page)` | 100 | Add two minimal players on the field step and advance to the game step |

---

## 3. `/sandbox` seeds — `src/app/sandbox/page.sandbox.tsx` (`SCENARIOS`, `:133-768`)

| key | label | game shape |
|---|---|---|
| `2v2-bestball-partial` | 2v2 best ball — mid-round (thru 7) | team-2v2, legacy `subTeams`, best-ball stableford match, legs, junk |
| `three-sides` | Three sides in one group (6 players) | team-2v2, 3 sides, per-point, side C behind |
| `two-groups-four-sides` | F-019: 8 players, TWO tee times, four sides | 2 playing groups × 4 named sides crossing groups |
| `threesome-plus-guest` | F-019: 7 players as 4 + 3, one guest on no side | 3 sides, sp7 sideless |
| `fifth-player-mid-round` | F-019: a 5th player joined a SCORED group of 4 | one 5-player group, thru 7 |
| `oversized-and-shrinking` | F-019: 7 players as 5 + 1 + 1, splitting to 4 + 3 | 3 slots → 2 |
| `one-v-one-nassau` | 1 v 1 singles match — Nassau, thru 14 | team-2v2 with two solo sides, legs |
| `one-group-side-game` | F-019 control: 4 players, ONE group (must not change) | ordinary 2v2 |
| `walk-in-legs` | Three sides, LEGS money — side C walked in at 12 | F-016b close-out prompt |
| `three-sides-pot` | Three sides playing a POT (uneven 3/2/1) | moneyModel pot, 70/30 |
| `2v2-nine-complete` | 2v2 on a nine — complete | back9, legacy subTeams + sideAName/sideBName |
| `skins-2p` | Skins — 2 players, complete | skins, nassau money, dead heat |
| `pool-2x4-partial` | Classic pool — 2 foursomes, mid-round (thru 6) | classic pot, captains |
| `pool-2x4-complete` | Classic pool — 2 foursomes, FULLY scored | ready to close out |
| `pool-2x4-junk-off` | Classic pool — NO bonuses (junk off) | F-045 fold |
| `pool-stableford` | Stableford pool — 4 foursomes, most points wins | teamFormat best-ball, stableford, 70/30 |
| `pool-scramble-match` | Scramble pool — 2 foursomes head-to-head, Stableford | moneyMode match, matchConfig |
| `ledger-season` | Season ledger — 5 completed games, 61-player roster | domain seed → /home/stats |
| `groups-large` | Groups — 61-member standing group + small crew + saved format | domain → /home/groups/g-weekend-warriors |
| `home-hub` | Home hub — games + groups populated | domain → /home |
| `bonuses-manual` | Manual bonuses — sandies & barkies on the scorecard | customBonuses + bonusMarks |
| `stableford-ind-partial` | Stableford (individual) — 4 players, thru 7 | stableford-ind, per-point |
| `stableford-ind-complete` | Stableford (individual) — 4 players, FULLY scored | |
| `recent-courses` | Past games (for recent-course chips) | domain → /pool/new |
| `wolf-partial` | Wolf — 4 players, thru 5 | wolf with wolfOrder/wolfDecisions |

Not represented as a seed: nines, quota, low-total games; classic pool in match mode with stroke basis; any 9-hole classic pool.

---

## 4. Findings (2-line summaries)

- **F-019** (`FINDINGS_ARCHIVE.md:1261`) — Side games had ONE `PoolTeam` holding everyone, so an 8-player side game was "1 foursome"; playing groups (who walks) and sides (who your money is with) are independent axes. Craig ruled them independent 2026-08-20; BUILT: `PoolTeam` reused as playing group, engine reads all matchups, wizard `groups` step at >4 players (archived = settled).
- **F-020** (`FINDINGS_ARCHIVE.md:1485`) — `playersMin/Max` were used only to refuse at the review step, and `defaultSubTeams` silently picked 3v2 for five. Option D chosen (B: live fit badges in the picker + C: propose splits at the sides step); explicitly NOT A (count-first reorder) — though §5.au later moved the field first anyway. Settled.
- **F-033** (`FINDINGS.md:430`) — Friend couldn't find 1v1/3-player games; they exist (Sides/Match at 2, Nines at 3) but the picker defaults to Pool and badges hide inside the closed `<select>`. Opt B BUILT 2026-09-10 (sky hint line at ≤3 players); opt A (fit-aware default) deliberately not done; answer-back to friend still pending.
- **F-037** (`FINDINGS.md:492`) — Craig couldn't set up "two separate 2v2s from 8" or even find plain 2v2; 4v4 and 2v2v2v2 exist via Sides/Match but independent pairings (A↔B, C↔D settle separately) are not expressible in one game; "Sides / Match" label lost the word "2v2". Partial fix 2026-09-14 ("This makes it a 2 v 2 match"); OPEN: picker subtitle (opt D), ≥5-player hint (opt A), pairings axis (opt B) — absorbed into the collapse plan.
- **F-041** (`FINDINGS_ARCHIVE.md:2352`) — "Stableford — 4 too many" at 8 is false as golfers read it: the pool and Sides both score Stableford at 8; picker vocabulary is registry taxonomy, not the three golfer axes (structure / hole scoring / money). Redirect line FIXED (+ id bug `stableford`→`stableford-ind`); direction agreed: structure-first wizard, modes become shortcuts — feeds §5.bk.
- **F-042** (`FINDINGS_ARCHIVE.md:2390`) — "Everyone buys in" vs "Two teams, head-to-head" named payment mechanics before teams existed; real question is structure. Label layer FIXED 2026-09-14 ("Who competes against whom?" / "All teams, for a pot" / "Two teams, head-to-head"); move-after-teams idea stays open with the F-041 structure work.
- **F-060** (`FINDINGS.md:622`) — Team-build method cards read as descriptions, result rendered below the fold, rival green "Build balanced teams around captains" button duplicates card 1, and copy described dragging that doesn't exist. Opt A BUILT 2026-09-15 (scroll-to-result, "✓ Built these teams", pressed state, copy fix); OPEN: opt B merge the rival trigger (into structure design) + hub edit-teams parity.
- **F-061** (`FINDINGS.md:678`) — team-2v2 is labelled "Sides / Match", "Sides · {format}", raw name; classic pool is "Pool", "Team pool", "Pool (pot split)", "Pool (foursomes vs foursomes)"; no `categoryLabel` helper. Recommendation B: fold canonical names into the structure design (step-2 vocabulary) rather than naming twice; open.
- **F-062** (`FINDINGS.md:710`) — Course handicap renders in 7 display styles across pool surfaces (display drift only), but `game/play`, `tournament/[id]`, `dashboard` compute their OWN unrounded / no-allowance numbers (P1 trust issue). Safe slice done (FieldLowBanner spelling); A (display pass) recommended now, B (retire parallel math) needs Craig's call with a worked example.

---

## 5. BACKLOG.md

**Now (promoted)** (`BACKLOG.md:18-24`):
1. **Game-structure COLLAPSE — deep planning session (§5.bk/§5.bl), promoted to NEXT_SESSION_PROMPT** (L, plan M first): seam inventory, data-model map, routing rules, risk list, screen mocks, live-scoring design-space comparison (multiple scorers × multiple foursomes; merge-RPC history). Direction settled in `GAME_STRUCTURE_DESIGN.md` — "How do you want to compete?", fit-based defaults, pool + sides collapse to "N teams of K". **NO CODE until Craig walks the plan.** Absorbs F-037, F-061 naming, F-060 opt B remainder, F-005 confirmations.
2. Course-data correctness audit — PARKED by Craig 2026-09-15.
3. Merge-audit polish batch (4×S) — fallback slack work.

**Mentions of game structure / collapse / §5g / F-037 / live scoring:**
- `:22` — the collapse item above (game structure, collapse, F-037, live-scoring design space).
- `:30` — Done: UI-simplification session 2026-09-15: F-060 opt B built (one build trigger, hub ✓ parity); F-061/F-062 logged; §5.bk (collapse) + §5.bl (best-possible bar, live-scoring research) recorded; `GAME_STRUCTURE_DESIGN.md` settled. *(Note: this row says F-060 opt B BUILT while FINDINGS.md F-060 status says opt B still open — the two docs disagree; `teams-step.tsx` still renders `CaptainsPanel` above the method list, so the code matches FINDINGS.)*
- `:32` — Review session §5.bj: "game-structure design-first in parallel" with the course-data audit.
- `:48` — Done: F-037p partial ("This makes it a 2 v 2 match").
- `:81` — Next: F-030 opt C standings strip on scorecard — "slot into the live-scoring session".
- `:82` — Next: F-060 follow-through: hub edit-teams parity; opt B "lives with the structure design".
- `:83` — Next: **Live scoring experience pass** (M) — §6 item 3, "Craig's named focus, never had its session".
- `:93` — Bigger arcs: **Team Competition engine — N teams of size K within foursomes (4 pairs combined Stableford etc.)** (L), approved 2026-08-03, plan `.claude/plans/tingly-petting-reddy.md` + memory `project_pool-team-competition-plan` — this is the §5g engine.
- `:94` — Flight mode (folded into Home/Event plan).
- `:100-103` — Known-incomplete: tournament has its own team-score math; 2v2 has no pot model (§5.ae — don't add unprompted); Vegas + Bingo-Bango-Bongo modes on request.
- `:75` — §5.bg money-step redesign (per-player/per-leg dollars, splits editable by player count) — shaped, not built.

Related design docs present at repo root: `GAME_STRUCTURE_DESIGN.md`, `WIZARD_REDESIGN.md`, `NEXT_SESSION_PROMPT.md`, `DECISIONS.md` (§5.bk/§5.bl).

---

## agent-a6cf045649ab04cb6.jsonl

**Task (first 200 chars):** Repo: C:\Users\choelzer\golf-tournament\golf-tracker (Next.js golf money-game app, Supabase backend). Read-only; do NOT edit. Do NOT touch .env.local or run anything against the network.  Goal: establ

# Live scoring today — facts with file:line references

## 1. Score persistence (pool games)

**Two tables, both "one JSON blob per row":**

- `game_scores (matchup_id TEXT PK, data JSONB, updated_at)` — `supabase/migrations/20260604000000_initial_schema.sql:9-13`. Realtime enabled at line 17. RLS is "allow all" (lines 26-27).
- `pool_games (id TEXT PK, data JSONB, updated_at)` — `supabase/migrations/20260706000000_pool_games_and_roster.sql:2-6`; realtime enabled line 21. Holds the whole `PoolGame` object (teams, ctpWinners, bonusMarks, wolfDecisions, status...). Hole scores are NOT in here.

**No per-hole rows.** `game_scores.data` is a JSON array of `GameScore = { playerId, hole, grossScore }` (`src/lib/game-state.ts:80-84`). The key is the foursome's `matchupId` (`src/lib/pool-game.ts:23`: `matchupId: string; // key into game_scores for this foursome's scores`). Each PoolTeam gets `matchupId: crypto.randomUUID()` at creation (`src/app/pool/new/steps/teams-step.tsx:28`, `shared.ts:44,53`, `field-editor.tsx:290,1004`). Pool-game.ts explicitly reuses the tournament helpers (`src/lib/pool-game.ts:2441-2445`).

**The write function** — `src/lib/tournament-state.ts:273-302`:

```ts
export function saveGameScores(matchupId: string, scores: any, ownedPlayerIds?: string[]) {
  try { /* audit diff vs lastPersistedScores, fire-and-forget insert into score_audit */ } catch {}
  scoresCache.set(matchupId, scores);
  if (ownedPlayerIds && ownedPlayerIds.length > 0) {
    const ownedScores = (scores as any[]).filter((s: any) => ownedPlayerIds.includes(s.playerId));
    supabase.rpc('merge_game_scores', { p_matchup_id: matchupId, p_player_ids: ownedPlayerIds, p_scores: ownedScores }).then();
  } else {
    supabase.from('game_scores').upsert({
      matchup_id: matchupId,
      data: scores,                        // the ENTIRE GameScore[] for the foursome
      updated_at: new Date().toISOString(),
    }).then();
  }
}
```

Payload = whole-row upsert of the full array for that matchup. `updated_at` is set by the client but never compared; there is **no version column, no `updated_at` precondition, no `.eq()` guard, no error handling** (`.then()` with no rejection handler — a failed write is silent). **Last-write-wins at row granularity.**

Side table: `score_audit` (`supabase/migrations/20260730000000_score_audit.sql`) is an append-only per-cell change log written client-side by diffing against `lastPersistedScores` (`tournament-state.ts:241-271`). It records changes; it does not participate in conflict resolution.

`savePoolGame` (`src/lib/pool-game.ts:2449-2456`) is the same pattern: `supabase.from('pool_games').upsert({ id, data: game, updated_at }).then()` — whole-object LWW. Mutations like `setWolfDecision` do a "read-latest-merge" from the in-memory cache first (`src/app/game/play/page.tsx:2062-2074`), which mitigates but doesn't eliminate clobbering.

## 2. The merge RPC (tournament path) — still exists, still wired

`supabase/migrations/20260609000000_merge_game_scores_rpc.sql:3-41`:

```sql
CREATE OR REPLACE FUNCTION merge_game_scores(p_matchup_id TEXT, p_player_ids TEXT[], p_scores JSONB) RETURNS JSONB AS $$
BEGIN
  SELECT data INTO current_data FROM game_scores WHERE matchup_id = p_matchup_id FOR UPDATE;
  IF current_data IS NULL THEN INSERT ... ON CONFLICT (matchup_id) DO UPDATE SET data = p_scores ...; RETURN p_scores; END IF;
  -- Keep scores for players NOT owned by this device
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO merged
  FROM jsonb_array_elements(current_data) elem WHERE NOT (elem->>'playerId' = ANY(p_player_ids));
  merged := merged || p_scores;
  UPDATE game_scores SET data = merged, updated_at = NOW() WHERE matchup_id = p_matchup_id;
  RETURN merged;
END; $$ LANGUAGE plpgsql;
```

Semantics: row lock, partition by **player ownership** (not by hole), replace the caller's players' entries wholesale, keep everyone else's. Introduced in commit `1128926` (2026-06-09, "Add server-side score merge to prevent concurrent write data loss — When two devices score the same matchup simultaneously, the last upsert previously overwrote the other team's data").

**Still called** — only from `tournament-state.ts:290`, only when `ownedPlayerIds` is non-empty, which only happens when `setup.scoringTeam` is set (`src/app/game/play/page.tsx:229-233`). `scoringTeam` is set only by the tournament round page `launchGame(matchup, 'A'|'B')` (`src/app/tournament/[id]/round/[roundId]/page.tsx:164-173, 227`), offered when a matchup is "multi-group" (>4 players). Pool games never set it (`src/app/pool/[id]/page.tsx:238-266` — no `scoringTeam`), so pool always takes the plain upsert branch. The sandbox fake deliberately throws on it (`src/test/fake-supabase.ts:245-265`). Not "abandoned" in code; abandoned in the sense that the newer pool path was designed around it (DECISIONS_ARCHIVE §5l, below).

## 3. Realtime subscription

**Channel helper** — `src/lib/tournament-state.ts:434-462`:

```ts
export function subscribeToScores(matchupId: string, onUpdate: (scores: any) => void) {
  const channelName = `scores:${matchupId}:${++scoreChannelCounter}`;
  return supabase.channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_scores', filter: `matchup_id=eq.${matchupId}` }, (payload) => {
      const scores = (payload.new as any)?.data;
      if (scores) { scoresCache.set(matchupId, scores); lastPersistedScores.set(...); onUpdate(scores); }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') fetchGameScores(matchupId).then((scores) => { if (scores) onUpdate(scores); });
    });
}
```

- Filter: **per matchup row**, one channel per matchup. Event handler **replaces** the cached array with `payload.new.data` (whole row) — no patching.
- Reconnect: relies on supabase-js auto-rejoin; on every `SUBSCRIBED` (initial and rejoin) it refetches server truth (comment lines 425-432 calls this "self-healing").
- `subscribeToPoolGame` (`src/lib/pool-game.ts:2554-2570`) is identical for `pool_games` filtered `id=eq.${id}`, but has **no** SUBSCRIBED refetch.
- `onVisibilityRefetch` (`tournament-state.ts:411-421`) refetches on `visibilitychange === 'visible'`.

**Play page (`src/app/game/play/page.tsx`)**:
- Own matchup, pool path: initial load only — `loadGameScores` cache then `fetchGameScores(...).then(setScores)` (lines 108-119). **There is no realtime subscription, poll, or visibility refetch for the scorer's OWN matchup in a pool game** — the effect at 240-269 returns early because `!setup?.scoringTeam`. Comment at 191-193: "Our own matchup is already covered above; skip it to avoid clobbering unsaved local edits."
- Other foursomes (pool): fetch + `subscribeToScores` + `onVisibilityRefetch` + **15s poll** (lines 194-213), used only for the overview panel.
- Tournament split-scoring (scoringTeam set): `subscribeToScores(matchupId, applyRemote)` + 15s poll + visibility refetch; `applyRemote` filters out local players' rows and stores the rest in `remoteScoresRef`/`remoteScores` (lines 240-269). Other tournament matchups: 30s poll (lines 274-299).
- Save path: every `scores` state change → `mergeScores(local, remote)` (local wins per cell, lines 215-220) → `cacheGameScores` immediately → `saveGameScores` after a **400ms debounce** (lines 224-236). `finishGame` does a final non-debounced `saveGameScores(poolCtx.matchupId, scores)` (line 2082).

**Leaderboard (`src/app/pool/[id]/leaderboard/page.tsx:67-102`)**: for every matchupId — fetch, `subscribeToScores`, `onVisibilityRefetch`, and 15s poll; comment at 87-90: "Realtime is the primary path... This poll is a backstop for the rare case realtime is fully blocked (e.g. guest wifi killing WebSockets)". Same again at 854-880 for `IndividualLeaderboard`.

## 4. Two scorers, same matchup/foursome

Trace for a pool game (no `scoringTeam`):
1. Phone A and Phone B both launch the same team from the hub → identical `game_setup.matchupId` (`pool/[id]/page.tsx:265-270`).
2. Each loads the server array once at mount (`play/page.tsx:114-118`).
3. Each tap does `setScores(prev => [...filtered, {playerId, hole, grossScore}])` (`play/page.tsx:659-664`) — local state is the full foursome array.
4. 400ms later, `saveGameScores(matchupId, merged, undefined)` → **plain upsert of A's entire local array** (`tournament-state.ts:296-300`). `remoteScoresRef` is always `[]` in the pool path, so `mergeScores` contributes nothing from the server.
5. Phone B does the same with its own array. Whichever upsert lands last **replaces the whole row**, silently dropping every hole the other phone entered that this phone hasn't seen. Neither phone ever re-reads its own matchup (no subscription/poll for it), so they diverge for the rest of the round; the leaderboard flips between the two versions on each write.
6. Incoming realtime for the own matchup: none in pool mode, so local edits are never overwritten by remote — but they also never reconcile. In tournament split mode, `applyRemote` explicitly drops local players' rows, so remote cannot clobber local; the RPC then merges by player ownership server-side.

**No** offline handling: no `navigator.onLine`, no localStorage persistence of `game_scores` (only `solo-round.ts` and `pool-identity.ts` use localStorage), no retry, no pending-write queue. Writes are fire-and-forget with no rejection handler (`tournament-state.ts:300`, `pool-game.ts:2455`). The only buffer is the in-memory `scoresCache` (`tournament-state.ts:223`), which dies on reload; the 400ms debounce timer is cleared on unmount without flushing (`play/page.tsx:235`), so navigating away <400ms after a tap loses that write (contrast solo-round's `pagehide` flush at `src/app/solo/[id]/page.tsx:139-158`).

## 5. Single-group games (team-2v2 / individual)

`isSingleGroupGame` = mode category `'individual' | 'team-within-group'` (`src/lib/game-modes/result.ts:35-38`). Default team creation gives **one team "Group" with one matchupId** (`src/app/pool/new/steps/shared.ts:44`), but the playing-groups step can split into several groups each with its own matchupId (`playing-groups-step.tsx:44`; F-019 note at `play/page.tsx:329-333`). Scoring launches per team via the same hub path (`pool/[id]/page.tsx:238-272`) → same `saveGameScores` whole-row upsert. Nothing limits the number of scorers; anyone with the link can open the same group and produce the §4 conflict. 2v2 sides are tagged `team: 'A'` for display only (`pool/[id]/page.tsx:230`) — `scoringTeam` is not set, so no ownership partitioning.

## 6. Existing decisions/docs

- `DECISIONS_ARCHIVE.md:484-513` **§5l** (2026-08-12): "`saveGameScores(matchupId, scores, ownedPlayerIds)` only takes the RPC branch when `ownedPlayerIds` is passed... A pool game never sets `scoringTeam`... pool scores go through the plain `upsert` and the RPC is never involved." (492-496). "scoring is *partitioned by matchup*. Two phones scoring different foursomes write to different rows, so there is no conflict to reconcile. The merge RPC exists for the TOURNAMENT split-scoring case" (498-501). Gap statement 503-509: RPC "still unverified by the sandbox"; realtime delivery "untested for both".
- `DECISIONS_ARCHIVE.md:1638-1671` **§5.bl** (2026-09-15): Craig: "currently, pool live scoring works pretty well. we tried something else with merge rpc, but we should be diligent and understand what the real best case is for multiple scorers for multiple foursomes" (1650-1653). "history is merge-RPC (tournament path, caused real trouble) → matchup partitioning (pool, works well)... per-matchup row (today: what happens when TWO scorers share one foursome?), per-hole/per-cell rows, server-merge RPC, last-write-wins vs merge semantics — against concurrent edits, refresh latency, offline/cart-path wifi, and recovery" (1660-1665).
- `DECISIONS_ARCHIVE.md:439-445` (§5j storage): bonusMarks kept off `GameScore` because it "flows through `merge_game_scores`, the score audit, and every mode's compute"; echoed at `src/lib/pool-game.ts:59-63`.
- `UI_CONVENTIONS.md:295-297`: "Never block on the network. Optimistic local writes, then sync. Realtime is primary, a 15s poll is the backstop, and re-subscribe re-syncs."
- `SCALING_PLAN.md:124-125`: "Persistence, RLS, realtime, multi-device merge remain unverifiable here... `merge_game_scores` deliberately throws."
- `BACKLOG.md:22`: the collapse planning item includes "live-scoring design-space comparison (multiple scorers × multiple foursomes; merge-RPC history)".
- No "tournament live scoring bug" entry exists in FINDINGS.md or BACKLOG.md; the only concrete record of the RPC's motivating trouble is commit `1128926`'s message ("the last upsert previously overwrote the other team's data"). What the RPC's own "real trouble" was is not documented anywhere in the repo.

## Concurrency properties today

- **Granularity of write:** one JSONB row per matchup (foursome); every save upserts the full `GameScore[]` for that foursome. `pool_games` is likewise one JSON blob per game. No per-hole/per-cell rows.
- **Conflict semantics:** last-write-wins on the whole row, no version/`updated_at` check, no error surfaced. Exception: tournament split-scoring with `scoringTeam` set uses `merge_game_scores` (row lock + replace-by-player-ownership, still LWW within an owned player set).
- **Second scorer on the same foursome (pool or single-group):** both phones hold independent full arrays and never re-read their own row; each 400ms-debounced upsert overwrites the other's holes. The leaderboard sees whichever phone wrote last; scores silently disappear/reappear. Nothing prevents two devices opening the same team.
- **Offline behavior:** none. No `navigator.onLine`, no localStorage for scores, no queue/retry; failed upserts are swallowed (`.then()` with no catch). Local in-memory state keeps working, but a debounced write pending at unmount is dropped, and a reload loses anything not yet persisted.
- **Recovery after reconnect:** for *other* matchups and the leaderboard — supabase-js rejoins, `SUBSCRIBED` triggers a refetch, plus 15s poll and visibility refetch. For the scorer's *own* matchup in pool mode — nothing refetches; the next local tap re-upserts the full local array, which "recovers" local data but overwrites anything another device wrote meanwhile.

---

## agent-ac1c9733d42ca4df7.jsonl

**Task (first 200 chars):** Repo: C:\Users\choelzer\golf-tournament\golf-tracker (Next.js golf money-game app). Read-only investigation; do NOT edit anything.  Goal: a SEAM INVENTORY of every place the code branches on the game 

All the material is in hand; no further searches needed. Here is the seam inventory.

# Seam Inventory: container axis (classic pool vs single-group / sides)

Scope: `src/` excluding `src/test/**`, `src/app/sandbox/**`, `*.test.ts` (test hits counted separately at the end). Line numbers are current working tree. "Routing decision" = what a collapsed "N teams of K" layer must answer at that spot.

## Core library

| file | line | branch condition | what each side does | routing decision needed |
|---|---|---|---|---|
| `C:\Users\choelzer\golf-tournament\golf-tracker\src\lib\game-modes\result.ts` | 21-25 | `getGameMode(game.gameMode)` truthy | mode → `mode.compute(buildGameModeContext(...))` (IndividualResult); else → `{kind:'team', ...computePoolResult()}` | THE root fork. Layer must choose engine from (teamCount, sideCount, format) instead of "has gameMode". |
| same | 28-30 | `category === 'individual'` | `isIndividualGame` helper | Replace with "K === 1 sides-of-one" predicate. |
| same | 35-38 | `c === 'individual' \|\| c === 'team-within-group'` | `isSingleGroupGame` — used at "every UI branch point" | Becomes "money unit is side, not playing group". Note name is stale: F-019 lets side games span several groups. |
| same | 44-52 | same category test | subtitle "Mode · N players · N groups" vs "Pool · N foursomes · N players" | Vocabulary: side vs team/foursome. |
| `...\src\lib\game-modes\types.ts` | 14 | `GameCategory = 'team' \| 'individual' \| 'team-within-group'` | type def; `'team'` is documentation-only (no descriptor) | Collapse to one axis or make classic pool a real descriptor. |
| same | 65-69 | `subTeams?` (legacy 2-side) vs `sides?` (N-side) | both populated; subTeams truncates at 2 | Drop legacy view once consumers migrate. |
| same | 166-170 | `sideNames?{a,b}` vs `sideLabels?[]` | two-side legacy vs N-side | same. |
| `...\src\lib\game-modes\context.ts` | 41-51 | `matchupId` passed? | one group's teams/scores vs union of ALL groups | Layer must define "scope = whole field" vs "scope = one playing group" explicitly (sides ≠ groups). |
| same | 90-98 | `sidesOfGame(game).length > 0` | stored sides vs `defaultSubTeams` balanced default; also builds `subTeams` legacy view | Where default side assignment lives; for N-of-K must generate K-sized sides. |
| `...\src\lib\game-modes\sides.ts` | 65-67 | `game.sides.length>0` → else `game.subTeams` → else `[]` | storage-shape precedence | Single persisted shape for sides. |
| same | 132 | `sides.length !== 2` → null | `toLegacySubTeams` only writes `{a,b}` for exactly 2 | Persist path: 2 sides → legacy, else → `sides`. |
| `...\src\lib\game-modes\team-game.ts` | 195, 541 | `potSplit` **mode setting** (string "70,30") | mode's own pot split — name collides with `PoolGame.potSplit` (front/back/overall/junk fractions) | Two different "potSplit" concepts must be reconciled. |
| same | 201-209 | `ctx.sides ?? fromLegacySubTeams(ctx.subTeams)` | N-side engine; side naming via `sideNameFrom` | none if `sides` becomes sole input. |
| same | 163 | `sides.length>1 && every side size===1` | `allSidesAreSolo` → individual-style naming | K===1 detection lives here for the team engine; could subsume individual modes. |
| same | 692-707 | descriptor `category:'team-within-group'`, `playersMin 2`, `playersMax 8` | | Registry entry that would absorb classic pool under "N teams of K". |
| `...\src\lib\game-modes\summary.ts` | 49-50 | `!mode` → 'Team pool'; `category !== 'team-within-group'` → mode.name | side game adds format/Stableford words | Summary text keyed on axis. |
| same | 78, 97-98 | `!mode` → "$X/player pot"; `moneyModel` default `'legs'` iff team-within-group | stakes wording | Money-model default per axis. |
| `...\src\lib\pool-game.ts` | 171-172 | `moneyMode?: 'pot'\|'match'`, `matchConfig?` | schema: 'match' = exactly-2-foursome head-to-head | Classic pool has its own 2-side special case (match) parallel to team-2v2 `scoring:'match'`. |
| same | 180 | `potSplit: PoolPotSplit` | classic pool leg fractions | see collision above. |
| same | 217, 206 | `sides?`, `subTeams?` on PoolGame | "team-within-group only" fields | Would become universal. |
| same | 1818-1838 | `game.teamFormat` set? | generalized `teamScoring` engine (one-ball hcap etc.) vs legacy `ballSelection` path | Format engine already shared; layer picks basis/format once. |
| same | 2141-2145 | `moneyMode === 'match'` | pot = 0 (fixed $/leg) vs pot = players×entry | Money model selection. |
| same | 2200-2205 | `game.teamFormat` | basis/balls from format vs `{stroke, 2 balls}` | same as 1818. |
| same | 2215-2216 | `isMatch && scoring==='holes' && teams.length===2` | annotate legs with hole-by-hole match points | Head-to-head only works for N=2; team-2v2 engine already does pairwise for N. |
| same | 2048-2053 | `game.matchConfig ?? DEFAULT`, `teams.length === 2` | `computeMatchPayouts` | same. |
| same | 1939, 2120, 2161, 2361, 2429 | `scoresByMatchup.get(team.matchupId)` | classic pool: one matchupId per team (team == playing group) | Layer must map team → playing groups (1:1 today for pool; many:many for sides). |
| `...\src\lib\stats-ledger.ts` | 330 | `result.kind === 'individual'` | per-player moneyNet vs per-team payout ÷ team size | Rollup: per-side split. Same shape if pool became sides. |
| same | 79 | `Set(teams.map(matchupId))` | fetch per group | plumbing. |
| `...\src\lib\pool-formats.ts` | 57-71 | copies `sides, moneyMode, ballSelection, teamFormat, teamScoreBasis, matchConfig` into saved format | | Saved-format schema mirrors both axes. |
| `...\src\lib\roster-groups.ts` | 12-41 | same field set on group defaults | | same. |
| `...\src\lib\game-modes\team-scoring.ts` | 391-408 | `ballSelectionFromFormat(format)` non-null && basis stroke → save legacy only | `persistedTeamScoring` / `formatOfGame` | Persist-shape choice; fine to keep. |
| `...\src\lib\live-scoring.ts` | 325 | `activeSettings.ballSelection` fallback | tournament path | n/a (tournament axis). |

## Wizard (`src/app/pool/new`)

| file | line | branch condition | what each side does | routing decision needed |
|---|---|---|---|---|
| `...\src\app\pool\new\page.tsx` | 191-192 | `modeCategory === 'individual' \|\| 'team-within-group'`; `=== 'team-within-group'` | `isSingleGroup`, `isWithinGroup` | Replace with (needsSides, needsGroups). |
| same | 201 | `isWithinGroup && players.length > 4` | `needsPlayingGroups` → Groups step | Hard-coded 4: "can walk together". |
| same | 398, 453 | `isWithinGroup && sides.length>0` → `persistedSides` | write sides only for side games | Always persist sides. |
| same | 407, 435 | `moneyMode === 'match'` → `matchConfig` | classic only | Money model. |
| same | 442 | `potSplit: dollarsToPotSplit(...)` | classic only | |
| same | 508, 612 | `modeCategory === 'individual'` / `needsPlayingGroups` / `isWithinGroup` | step indicator + Next label ("Money" / "Groups" / "Sides" / "Teams") | Step graph by (K, N, groups). |
| same | 618-636 | `isSingleGroup` → auto-build one "Group" team (or `proposePlayingGroups`); `isWithinGroup` → seed sides, go 'groups'/'teams' else 'create' | else → TeamsStep | Core wizard fork. |
| same | 650, 664, 680 | `needsPlayingGroups`, `isWithinGroup`, `!isWithinGroup` | PlayingGroupsStep / SubTeamsStep / TeamsStep | Unify: one "groups" step + one "sides" step. |
| same | 125, 220-226, 284, 315-318, 403, 432 | `teamFormat \|\| ballSelection` hydrate; `persistedTeamScoring` | classic format picker | Format is orthogonal; keep. |
| same | 228, 297 | `data.moneyMode === 'pot' \|\| 'match'` | hydrate | |
| same | 231, 322, 348 | `typeof gameMode === 'string'` | hydrate mode id | |
| `...\src\app\pool\new\steps\create-step.tsx` | 116-118 | `isIndividual` (both single-group cats), `isWithinGroupReview`, `isMatch` | review page branches | |
| same | 467-469 | `isMatch && teams.length !== 2` | "needs exactly two foursomes" warning | N=2 constraint of classic match. |
| same | 481, 544, 583 | `isWithinGroupReview` / `isIndividual` / neither | "Sides (2 vs 2)" / "Players" / "Foursomes" sections | Vocabulary + section choice. |
| same | 35, 456-465 | `settings.potSplit` (mode) ; `matchConfig.legDollars` | mode pot split vs classic match legs | potSplit collision again. |
| `...\src\app\pool\new\steps\details-step.tsx` | 123, 161-179 | `isRegisteredMode`; `category === 'team-within-group'` → null; else `moneyMode==='match'` → 90% vs 85% | USGA allowance recommendation | Allowance by format+scoring, not axis. |
| same | 167-172 | `teamFormat` in two-ball set | classic format hint | |
| same | 235, 412-424 | `moneyMode === v` toggle; match text "Two foursomes only" | classic money mode UI | |
| same | 545-580 | `teamFormat`, `teamScoreBasis` pickers | classic only (mode games use modeSettings.format/scoring) | Duplicate format pickers to merge. |
| `...\src\app\pool\new\steps\sub-teams-step.tsx` | 22 | `sides.length>0` else legacy | N-side editor | |
| `...\src\app\pool\new\steps\teams-step.tsx` | 28, 62 | new `matchupId` per team; `ceil(players/4)` | classic team builder | Hard-coded 4. |
| `...\src\app\pool\new\steps\shared.ts` | 44, 53 | single "Group" team w/ one matchupId | single-group default | |
| `...\src\app\pool\new\steps\playing-groups-step.tsx` | 44 | reuse `matchupId` | F-019 groups | |

## Hub & panels (`src/app/pool/[id]`)

| file | line | branch condition | what each side does | routing decision needed |
|---|---|---|---|---|
| `...\src\app\pool\[id]\page.tsx` | 180-207 | `category === 'team-within-group'` | build scorecard setup: fmt from modeSettings, sides, tag `player.team` A/B only if `sides.length <= 2`, teamMode/allowance | Scorecard can express only 2 sides → hard limit. |
| same | 223-236 | `game.teamFormat` (classic) | tag whole foursome as side 'A', one-ball allowance | Classic foursome == one side of K. |
| same | 254-265 | pass `ballSelection`/`teamFormat`/`teamScoreBasis`/`poolTeamName`; `matchupId: team.matchupId` | | |
| same | 270 | sessionStorage `game_pool_context {poolGameId, matchupId}` | device → group binding | |
| same | 283-293 | `isSingleGroupHub` | subtitle "Mode · N players · N groups" vs "Pool · N foursomes" | vocabulary. |
| same | 412, 425 | `!isSingleGroupHub` → TeamBuildSummaryCard; empty text "players" vs "foursomes" | | |
| same | 446 | `game.gameMode === 'wolf'` | WolfRotationEditor | literal mode id (pattern 8). |
| `...\src\app\pool\[id]\leaderboard\page.tsx` | 109 | `isSingleGroupGame(game)` | `<IndividualLeaderboard>` vs classic team board | Second-biggest fork: two leaderboard components. |
| same | 139, 143, 148 | `moneyMode==='match'`; `&& teams.length===2 && scoring==='holes'`; `teamScoreBasis==='stableford'` | match-point cells; points-basis inversion | |
| same | 643-647 | `MatchLegBoard`: `matchConfig`, `teams.length===2`, `pointsBasis` | | |
| same | 710 | `teams.length !== 2` warning | | |
| same | 784-834 | `teamFormat ? teamFormatCaption : ballSelectionCaption`; stableford suffix | | |
| same | 869 | `r.kind === 'individual'` → setResult | IndividualLeaderboard compute | |
| same | 883 | `isWithinGroup` | side columns/legs in individual board | |
| same | 808-809, 943-947, 1290, 1325, 1361 | `sideOf(pid)?.sideId`, `sideTone` | per-player side badges | |
| same | 71, 102, 563-564, 860, 879 | `Set(teams.map(matchupId))` | fetch/subscribe per group; audit table team-by-matchup | plumbing. |
| `...\src\app\pool\[id]\scorecards\page.tsx` | 86-91 | `isSideGame \|\| !allFour` → "group(s)" else "foursome(s)"; `allFour = every playerIds.length===4` | vocabulary | hard-coded 4. |
| same | 336 | `team.players.length === 4 ? 'foursome' : 'group'` + `ballSelectionLabel` | | hard-coded 4; classic caption on all cards. |
| `...\src\app\pool\[id]\teams\page.tsx` | 63-66 | `isSideGame` → `sidesOfGame(game)` else `[]` | side-name column | |
| same | 79-82 | `allFour` → "foursome(s)" else "group(s)" | | hard-coded 4. |
| same | 171, 194, 209 | `sides.length > 0`; `teams.length > 1` | side sections; group tag | |
| `...\src\app\pool\[id]\panels\field-editor.tsx` | 25 | `isSingleGroup` | hide captains/balance/auto-gen/swap, keep player list | Team-building tools gated on axis; should gate on N>1. |
| same | 33 | `teams.length \|\| ceil(players/4)` | numTeams | hard-coded 4. |
| same | 396, 442 | `!isSingleGroup && teams.length>0` | team-build panel | |
| same | 970-972 | `isSideGame && any team.playerIds.length > 4` | oversized-group re-split prompt | hard-coded 4. |
| same | 1004, 1012-1021 | reuse/clear `matchupId` on regroup | move scores between groups | |
| same | 1089-1095 | Wolf `order[(N-1) % 4]`, "single-foursome game" | | hard-coded 4. |
| same | 72, 99-290 | per-team `matchupId` fetch/preserve | | plumbing. |
| `...\src\app\pool\[id]\panels\settings-editor.tsx` | 47-49, 83-89 | `moneyMode ?? 'pot' === 'match'`; `setMoneyMode` seeds `matchConfig` | classic pot/match toggle | |
| same | 97-98 | `indMode.category in (individual, team-within-group)` → early return whole single-group editor; `isWithinGroup` | mode settings + Sides editor vs classic pot/match/ball/team settings | Third big fork: two settings editors. |
| same | 109 | `!isWithinGroup \|\| key!=='format' \|\| !hasScores` | one-ball lock (mirrors classic `lockOneBall` at 71) | Duplicated rule across both editors. |
| same | 129, 264, 302 | `storedSides.length>0`; `isWithinGroup` → Sides section; `sides.length>2` | N-side editor | |
| same | 204 | switching mode: `target.category==='team-within-group' && sidesOfGame().length===0` → seed `subTeams` | | |
| same | 208 | `newId !== 'wolf'` → drop wolfDecisions | literal id (pattern 8). |
| same | 350-358, 365-405, 448-582 | moneyMode toggle; `teams.length !== 2` warn; teamFormat/teamScoreBasis pickers; matchConfig legs; `potSplit` dollars editor | classic only | |
| `...\src\app\pool\[id]\panels\money-panels.tsx` | 13 | `indMode.category in (...)` | modeSettings read-only summary | |
| same | 59-67, 86, 94-99, 111 | `moneyMode==='match'` → matchConfig legs (+`twoTeams` warn); else `potSplit` rows; grid `rows.length===4` | classic money summary | |
| same | 171, 208 | `Set(teams.map(matchupId))` | fetch | plumbing. |
| same | 217 | `category !== 'team-within-group'` → no short-leg prompt; else `mode.compute(buildGameModeContext)` → `incompleteLegsForCloseOut` | close-out voided legs | Classic pool has no leg-void flow. |
| `...\src\app\pool\[id]\panels\share-panel.tsx` | 21-22 | `getGameMode()?.name ?? (match ? 'Head-to-head match' : 'Pool (pot split)')` | label | |
| `...\src\app\pool\formats\page.tsx` | 155-161 | `d.moneyMode==='match'`; `d.teamFormat \|\| d.ballSelection`; `teamScoreBasis==='stableford'` | saved-format description | |

## Play page (`src/app/game/play/page.tsx`)

| line | branch condition | what each side does | routing decision needed |
|---|---|---|---|
| 83-97 | `category === 'team-within-group'` | `applySideNames`: names A/B from first two sides; else pool team = one side named after foursome | Only 2 side names fit the card. |
| 109-138, 196-213, 225-269, 338-342 | `parsed.matchupId`/`poolCtx.matchupId` | load/save/subscribe own group; fetch other groups' caches | plumbing; scope = own group. |
| 335-345 | `isSingleGroupGame && category==='team-within-group'`; `result.kind==='individual'` | `sideBreakdown` from engine over ALL groups | classic pool gets no engine rows on card. |
| 795, 1412, 2012 | `formatSettings.ballSelection` fallback | team row math (legacy) | |
| 1338-1353 | `hasTeams` (A && B) vs `teamAPlayers && isTeamMode` | two-side row vs one-side pool row | `Player.team: 'A'\|'B'` limit. |
| 1359, 1732 | `sideBreakdown.length > 2` → engine side rows | N>2 sides fallback | |
| 1370 | `formatId==='stableford' \|\| teamScoreBasis==='stableford'` | points basis | |
| 1372 | `formatId === 'skins' \|\| 'nassau' \|\| 'match-play'` | tournament formats (not mode ids) | pattern 8, tournament axis. |
| 822 | `!isSingleGroupGame(poolGame)` | `PoolOverviewPanel` | "only meaningful for multi-team"; should be N>1. |
| 2082-2096 | per-`matchupId` save + all-groups fetch → completed check | | |
| 2574-2621 | `teams.find(matchupId===mine)`; `isMatch`, `isHoleMatch` (`teams.length===2`), `teams.length>2` suffix | overview panel | |

## Counts per pattern (src, non-test)

| # | pattern | lines | of which real branch sites |
|---|---|---|---|
| 1 | category / isSingleGroupGame / kind | 33 code (+19 in tests) | ~28 |
| 2 | matchupId / matchup_id | ~150 (+~25 tests) | ~10 branch, rest plumbing (fetch/cache/subscribe keyed by group) |
| 3 | `moneyMode` (exact) | 36 | 14 |
| 4 | potSplit / matchConfig | ~50 | ~18 (3 are the **mode-setting** `potSplit` in team-game.ts / create-step.tsx) |
| 5 | `.sides` / GameSide / sideId | ~85 | ~25 |
| 6 | ballSelection / teamFormat / teamScoreBasis | ~110 | ~30 |
| 7 | playingGroups/teeGroups/foursome + 4-literals | ~170 (mostly comments/copy) | see list below |
| 8 | literal mode-id | 4 | 2 (`'wolf'` ×2); `teamFormat === 'scramble'` etc. are format literals, not mode ids |
| e2e | pattern-7-ish terms | 52 across 12 spec files | (verify-core 12, verify-f006-sides 11, verify-f019-groups 11, sharing-audit 5, f045 4, f015-f018 3, others 1 each) |

## Hard-coded-4 assumptions

- `src\lib\pool-game.ts:1615` — `defaultSubTeams`: `sorted.length === 4` → {1st+4th, 2nd+3rd}; else alternate.
- `src\lib\pool-game.ts:331` — `pot / 4` (four legs, not players — fine).
- `src\lib\pool-game.ts:301-302` — POOL_SPLIT_TABLE comment: "a foursome buys in at 4 × $25".
- `src\app\pool\new\page.tsx:201` — `needsPlayingGroups = isWithinGroup && players.length > 4`.
- `src\app\pool\new\steps\teams-step.tsx:62` and `src\app\pool\[id]\panels\field-editor.tsx:33` — `Math.ceil(players.length / 4)` team count.
- `src\app\pool\[id]\panels\field-editor.tsx:971` — oversized = `playerIds.length > 4`.
- `src\app\pool\[id]\panels\field-editor.tsx:1089` — Wolf `order[(N-1) % 4]`.
- `src\app\pool\[id]\teams\page.tsx:79`, `src\app\pool\[id]\scorecards\page.tsx:88, 336` — `playerIds.length === 4` → "foursome" wording.
- `src\app\tournament\[id]\round\[roundId]\page.tsx:166` — `matchup.playerIds.length > 4`.
- `src\app\pool\new\steps\field-step.tsx:135` — "8 = up to two foursomes".
- `src\lib\game-modes\wolf.ts:159-160` — `playersMin: 4, playersMax: 4`.
- Structural: `Player.team: 'A' | 'B'` on the scorecard (`pool/[id]/page.tsx:186-199`, `play/page.tsx:1338-1359`) caps expressible sides at 2; classic `moneyMode:'match'` requires `teams.length === 2` (5 sites).

## Mode registry summary

`GameModeDescriptor` (`src\lib\game-modes\types.ts:28-44`): `id`, `name`, `description`, `category: 'team'|'individual'|'team-within-group'`, `inputType: 'gross'|'gross+decisions'`, `playersMin`/`playersMax` (measured against the WHOLE FIELD, not per group), `settings: FormatSetting[]` (generic schema reused from formats.ts), `compute(ctx: GameModeContext): IndividualResult` (pure). `GameModeContext` carries players/holes/scores/settings/pot, hcap accessors, `subTeams` (legacy 2-side) + `sides: GameSide[]`, `rawCourseHcap`, wolf fields, `voidedLegs`. `IndividualResult` is `kind:'individual'` with standings, `moneyModel: 'per-point'|'pot'`, optional `teamLegs`, `sideNames{a,b}`/`sideLabels[]`, `sideBreakdown`, `wolfHoles`, `nassauLegs`, `junkLines`. `GameResult = (PoolResult & {kind:'team'}) | IndividualResult`.

Registry `GAME_MODES` (`src\lib\game-modes\index.ts:33-35`, display order):

| id | name | category | input | players |
|---|---|---|---|---|
| `nines` | Nines / Split Sixes | individual | gross | 3-4 |
| `skins` | Skins | individual | gross | 2-4 |
| `stableford-ind` | Stableford | individual | gross | 2-4 |
| `quota` | Quota (Points) | individual | gross | 2-4 |
| `low-total` | Low Total (net or gross) | individual | gross | 2-4 |
| `team-2v2` | Sides / Match | team-within-group | gross | 2-8 |
| `wolf` | Wolf | individual | gross+decisions | 4-4 |

The classic pool (`category 'team'`) has **no descriptor**; it is the `gameMode === undefined` fallthrough in `computeGameResult`. Key observation for a collapse: `team-2v2` already handles N sides of any K (incl. sides-of-one), pairwise leg settlement, best-ball/combined/scramble/alt-shot, stroke/Stableford/match — functionally a superset of the classic pool's engine except for (a) pot-by-finishing-order with `positionSplit`, (b) junk/CTP sub-pot, (c) `hideHolesUntilAllFinish`, (d) team-build metadata/captains, and (e) the `PoolResult` shape the classic leaderboard/ledger read.

---

## agent-ae9632e9295a6f3a9.jsonl

**Task (first 200 chars):** Repo: C:\Users\choelzer\golf-tournament\golf-tracker (Next.js golf money-game app). Read-only; do NOT edit.  Goal: a field-by-field DATA-MODEL MAP of the PoolGame type and everything persisted for a g

I have everything needed. Here is the data-model map.

# PoolGame data-model map

Source of truth: `C:\Users\choelzer\golf-tournament\golf-tracker\src\lib\pool-game.ts:163-257` (`export interface PoolGame`). Supporting types in the same file (`PoolTeam` :18, `PoolPotSplit` :117, `PoolMatchConfig` :147, `PoolTeamBuild` :106, `CustomBonus` :42, `BonusMarks` :64, `WolfHoleDecision` :262) and `src/lib/game-modes/sides.ts:36` (`GameSide`), `src/lib/game-modes/team-scoring.ts:26,36` (`TeamFormat`, `ScoreBasis`).

Container vocabulary used below: **pool** = classic N-foursome team pool (`gameMode` absent; money `pot` or `match`). **sides/ind** = single-group game (`gameMode` set to a registry id; category `individual` or `team-within-group`). "Both" = read on every path.

## 1. Field table

| Field | Type | Pool | Sides/Ind | Derived? | Notes |
|---|---|---|---|---|---|
| `id` | `string` | both | both | no | UUID; PK of `pool_games.id`. |
| `name` | `string` | both | both | no | |
| `createdAt` | `string` ISO | both | both | no | Sort key for lists / recent courses. |
| `course` | `CourseSelection \| null` | both | both | no | Full GHIN course snapshot (tees, ratings, holes). A past game doubles as a "saved course" (`getRecentCourses` :2508). |
| `players` | `Player[]` | both | both | no | Field roster incl. `handicapIndex`, `teeSetId`, `gender`, `ghinNumber`. Not the roster table — a per-game copy. |
| `teams` | `PoolTeam[]` | both (the money teams / foursomes) | both (the PLAYING GROUPS, F-019) | no | Semantics differ: for a pool each team is a foursome that competes; for a side game each is a tee group that only partitions scores. See PoolTeam rows below. |
| `teams[].id` | `string` | both | both | no | Team identity; used as key in `PoolHoleScore.teamScores`, standings. |
| `teams[].name` | `string` | both | both | no | "Team N" / "Group N". |
| `teams[].playerIds` | `string[]` | both | both | no | Membership. |
| `teams[].teeTime?` | `"HH:MM"` | both | both | no | Earliest tee time holds CTP by default (:22). |
| `teams[].matchupId` | `string` | both | both | no | **The score-partition key**: PK of `game_scores.matchup_id` and `score_audit.matchup_id`. One row of scores per playing group. |
| `teams[].captainId?` | `string` | pool | — | no | Captain role; sides flows never set it (`proposePlayingGroups` omits it, shared.ts:44-55). |
| `ballSelection` | `TwoBestBallsVariant` (`'1-net-1-gross'\|'2-best-net'\|'2-best-gross'`) | pool | — (ignored by mode engines) | **derived** at save time from `teamFormat`+`teamScoreBasis` via `persistedTeamScoring` (team-scoring.ts:383) | Required field, always populated for legacy readers; `teamFormat` takes precedence when both present. |
| `moneyMode?` | `'pot' \| 'match'` | pool | — | no | Default `'pot'`. `'match'` = exactly two foursomes head-to-head. Saved in formats even for side games, but unused there. |
| `matchConfig?` | `PoolMatchConfig` `{legDollars:{front,back,overall}, junkPerPoint, scoring?:'stroke'\|'holes', pointsPerHole?}` | pool (match only) | — | no | Wizard only writes it when `moneyMode==='match'` (page.tsx:435). |
| `entryPerPlayer` | `number` | pool (pot) | sides/ind (modes read it as the stake; fixtures.test.ts:55 passes it with `gameMode:'skins'`) | no | |
| `handicapAllowance` | `number` % | both | both | no | Multiplies unrounded course handicap (`applyAllowance`). |
| `handicapBasis?` | `'course' \| 'index'` | both | both | no | Default `'course'`. |
| `strokeMethod?` | `'full' \| 'off-the-low'` | both | both | no | `buildHcapMap` :772 applies to every path (mode context uses it too, context.ts:38). |
| `balanceExcludeCaptains?` | `boolean` | pool | — | no | Team-building toggle; snapshot also kept in `teamBuild.excludeCaptains`. |
| `useCaptains?` | `boolean` | pool | — | no | |
| `hideHolesUntilAllFinish?` | `boolean` | pool | — | no | Leaderboard anti-sandbagging across foursomes. |
| `potSplit` | `PoolPotSplit` `{front,back,overall,junk}` fractions summing to 1 | pool (pot) | — | **derived** from wizard dollar legs via `dollarsToPotSplit` :344 (+ `foldJunkIntoOverall` when junk is off) | Required field; wizard always writes it even for side games (page.tsx:442). |
| `positionSplit` | `number[]` % | pool (pot) | — | derived from `positionSplitText` (`parsePositionSplit` page.tsx:73) | e.g. `[100]`, `[70,30]`. |
| `junkValues` | `PoolJunkValues` `{birdie,eagle,albatross,groupHug,ctp}` | pool | partially (modes with junk read it) | no | Fresh pool defaults to `ZERO_JUNK_VALUES` :278 (F-045). |
| `ctpWinners` | `Record<holeNo, playerId\|null>` | pool | — | no | Live-tapped; whole-JSON read-latest-merge. |
| `status` | `'setup'\|'active'\|'completed'` | both | both | no | `completed` gates stats ledger; set via `isPoolGameFullyScored` :2421 (whole-game check across all `teams[].matchupId`). |
| `holesPlaying?` | `'18'\|'front9'\|'back9'` | both | both | no | Absent = 18. `getGameHoles` :457. |
| `nineHandicapBasis?` | `'18'\|'9'` | both | both | no | Only when a nine. `gameNineBasis` :758, `numHolesForStrokes` :477. |
| `handicapsRefreshedAt?` | ISO string | both | both | no | Last GHIN pull. |
| `createdByGhin?` | `number` | both | both | no | Organizer scoping (`getPoolGameListForGhin` :2542). |
| `sourceGroupId?` | `string` | both | both | no | `roster_groups.id` the game was started from; ledger attribution. |
| `lockedGroups?` | `string[][]` | pool | — | no | Pairing locks for auto-balance. |
| `teamBuild?` | `PoolTeamBuild` `{method:'balanced'\|'serpentine'\|'sequential'\|'manual', excludeCaptains?, hadCaptains?, hadLocks?, adjustedAfter?}` | pool | — | no | Build-time snapshot for "how these teams were built". |
| `gameMode?` | `string` (registry id: `'team-2v2'`, `'skins'`, `'nines'`, `'quota'`, `'wolf'`, `'low-total'`…) | — (ABSENT = classic pool) | sides/ind (**the discriminator**) | no | `getGameMode(id).category` = `'individual'` or `'team-within-group'` decides the wizard flow (page.tsx:190-192). |
| `modeSettings?` | `Record<string, string\|number\|boolean>` | — | sides/ind | no | Flat bag rendered from the mode's `FormatSetting[]` schema. Legacy `sideAName..sideFName` keys are absorbed into `sides[].name` by `sidesOfGame` (sides.ts:60-69). |
| `subTeams?` | `{a: string[]; b: string[]}` | — | sides (team-within-group, exactly 2 unnamed sides) | no (but alternative encoding of `sides`) | LEGACY two-side shape; still what an ordinary 2v2 SAVES (`persistedSides` sides.ts:153). Read only via `sidesOfGame()`. |
| `sides?` | `GameSide[]` `{id: string; name?: string; playerIds: string[]}` | — | sides (3+ sides or any named side) | no | Mutually exclusive with `subTeams` on write. Ids continue `'a','b','c'…` (`nextSideId` :235). |
| `wolfDecisions?` | `Record<holeNo, {wolfId, mode:'partner'\|'lone'\|'blind', partnerId}>` | — | ind (Wolf family) | no | Live-tapped like `ctpWinners`. |
| `wolfOrder?` | `string[]` | — | ind (Wolf) | no | Rotation; absent = `players` order. |
| `teamFormat?` | `TeamFormat` (`best-ball\|two-best-net\|two-best-gross\|net-and-gross\|combined\|scramble\|alternate-shot`) | pool (generalized path, `teamHoleScore` :1818) | sides (2v2 side scoring engine shares it) | no; absent when format is a legacy stroke variant | Written only when not expressible as `ballSelection`+stroke (`persistedTeamScoring`). |
| `teamScoreBasis?` | `'stroke'\|'stableford'` | pool | sides | no | Paired with `teamFormat`. |
| `customBonuses?` | `CustomBonus[]` `{id,label,points,hint?}` | pool | sides/ind (mode junk) | no | Definitions (sandie, barkie…). |
| `bonusMarks?` | `Record<holeNo, Record<playerId, bonusId[]>>` | pool | sides/ind | no | Live-tapped marks; stored on the game, not on `GameScore`, so the merge RPC never sees it. |
| `shareToken?` | `string` | both | both | no | Per-game `?key=`; absent → legacy `ORGANIZER_TOKEN` accepted (`shareTokenMatches` :2394, `ensureShareToken` :2403). |
| `voidedLegs?` | `('front'\|'back'\|'overall')[]` | both | both | no (judgement, deliberately stored) | Set at close-out (§5.ai / F-016b). |

Not persisted / purely computed: `PoolResult`, `PoolLeg`, `PoolTeamLegStanding`, `PoolTeamPayout`, `PoolTeamDetail` (:352-424, :2327-2348) — all outputs of `computePoolResult` / `computePoolPlayerDetails(game, scoresByMatchup)`.

Key structural point: **a side game stores NO `sides`/`subTeams` in `teams`** — `teams[]` is the playing-group partition (F-019), while the money grouping lives in `sides`/`subTeams`. At ≤4 players there's one team holding everyone and `sidesOfGame()` falls back to `defaultSubTeams` when neither is stored (sides.test.ts:161-168).

## 2. Persistence layer

**Tables** (all JSONB-blob rows, permissive RLS, realtime enabled on `pool_games` and `game_scores`):

| Table | Columns | Migration |
|---|---|---|
| `pool_games` | `id TEXT PK, data JSONB, updated_at` | `supabase/migrations/20260706000000_pool_games_and_roster.sql:2-6`, realtime :21 |
| `game_scores` | `matchup_id TEXT PK, data JSONB, updated_at` | `20260604000000_initial_schema.sql:9-13`, realtime :17 |
| `score_audit` | `id BIGSERIAL, matchup_id, player_id, hole, old_score, new_score, changed_at`; index `(matchup_id, changed_at DESC)` | `20260730000000_score_audit.sql` |
| `roster_groups` | `id, name, owner_ghin, player_ids TEXT[], defaults JSONB, updated_at` | `20260729000000_roster_groups.sql` |
| RPC `merge_game_scores(p_matchup_id, p_player_ids TEXT[], p_scores JSONB)` | row-locks `game_scores`, drops elements whose `playerId` is in `p_player_ids`, appends `p_scores` | `20260609000000_merge_game_scores_rpc.sql` |

**Game row**: the whole `PoolGame` object is the `data` JSONB blob — no per-field columns.
- `savePoolGame(game)` — `pool-game.ts:2449` (`upsert({id, data: game, updated_at})`, fire-and-forget, also sets in-memory `poolGameCache`).
- `fetchPoolGame(id)` :2462, `hydratePoolGames()` :2473, `loadPoolGame(id)` :2458 (cache only).
- `subscribeToPoolGame(id, onUpdate)` :2554 — channel `pool_game:${id}:${counter}`, `postgres_changes` on `pool_games` with `filter: id=eq.${id}`.

**Scores**: one `game_scores` row per **matchupId** (= per playing group / foursome); `data` is a flat `GameScore[]` (`{playerId, hole, grossScore}`, game-state.ts:80-84) covering every player and hole in that group. Not per-player, not per-hole rows. Helpers live in `src/lib/tournament-state.ts` (shared with the Ryder-cup tournament feature):
- `saveGameScores(matchupId, scores, ownedPlayerIds?)` :273 — with `ownedPlayerIds` calls `rpc('merge_game_scores')` (per-device merge); otherwise plain `upsert`. Diffs against `lastPersistedScores` and inserts `score_audit` rows (`auditScoreChanges` :247).
- `fetchGameScores(matchupId)` :398 (`select('data').eq('matchup_id', ...)`), `loadGameScores` :340, `cacheGameScores` :304, `fetchScoreAudit(matchupIds[])` :319, `onVisibilityRefetch(matchupIds)` :411.
- `subscribeToScores(matchupId, onUpdate)` :434 — channel `scores:${matchupId}:${counter}`, `postgres_changes` on `game_scores` with `filter: matchup_id=eq.${matchupId}`; refetches on every `SUBSCRIBED` (self-healing).

**§5l partitioning by matchupId**: compute takes `scoresByMatchup: Map<matchupId, GameScore[]>`; `computePoolResult` reads `scoresByMatchup.get(team.matchupId)` per team (:2161), `computePoolPlayerDetails` :2361, `isPoolGameFullyScored` :2429. For side games `buildGameModeContext(game, scoresByMatchup, matchupId?)` (`game-modes/context.ts:31-51`) unions ALL teams' matchupIds unless one is passed (F-019 fix; it used to read only `teams[0].matchupId`).

**Polling**: 15 s `setInterval` re-fetching every team's matchupId in `src/app/pool/[id]/leaderboard/page.tsx:93-95` and `:875-877` (plus subscriptions at :91/:873 and `subscribeToPoolGame` :63/:854); play page `src/app/game/play/page.tsx:204-206` (15 s, other groups), `:256-260` (15 s own matchup), `:292-296` (30 s other matchups).

## 3. Wizard draft (`/pool/new`)

No zod schema; a hand-rolled `sessionStorage` JSON under `WIZARD_KEY = 'pool_wizard_draft'` (`src/app/pool/new/page.tsx:61`), plus a one-shot seed key `FORMAT_SEED_KEY = 'pool_format_seed'` (:63, payload `{name?, defaults?: GroupDefaults}`) and `POOL_GROUP_SEED_KEY` (field-step.tsx:84).

Written on every change (:259-268) with these fields: `name, autoNamedFrom, entryPerPlayer, handicapAllowance, strokeMethod, handicapBasis, balanceExcludeCaptains, useCaptains, potDollars, potEdited, positionSplitText, junkValues, ballSelection, teamFormat, teamScoreBasis, moneyMode, matchLegs, matchJunkPerPoint, gameMode, modeSettings, course, players, teams, teamBuild, step, sides, holesPlaying, nineHandicapBasis`. Money/dollar values are held as **strings** (`PotDollars` in steps/shared.ts:10). Restore (:204-239) deliberately does NOT read back `players`, `teams`, `step`, or `sides`.

Fields that encode the "which container" choice:
- `gameMode` (undefined = classic pool; registry id = single-group). `modeCategory`/`isSingleGroup`/`isWithinGroup` derived at :190-192.
- `sides: GameSide[] | undefined` (:98) — money sides for `team-within-group`; written to the game via `persistedSides` (:453).
- `teams: PoolTeam[]` (:170) — foursomes for a pool, or playing groups for a side game; `needsPlayingGroups = isWithinGroup && players.length > 4` (:201) shows the `'groups'` step (`Step` union :71: `'field'|'details'|'course'|'tees'|'groups'|'teams'|'create'`). `proposePlayingGroups()` (steps/shared.ts:33) builds them with fresh `matchupId`s; playing-groups-step.tsx:44 preserves existing matchupIds on rebuild.
- `moneyMode`, `matchLegs`, `matchJunkPerPoint`, `potDollars` — pool-only money.

`createPoolGame()` :411-491 assembles the `PoolGame` and calls `savePoolGame`.

## 4. Saved formats (`roster_groups` with `defaults.kind === 'format'`)

Type: `GroupDefaults` in `src/lib/roster-groups.ts:11-52`. Stored inside the `roster_groups.defaults` JSONB (`upsertGroup` :135, `setGroupOwner` :191). Fields: `moneyMode, junkValues, customBonuses, entryPerPlayer, positionSplitText, matchConfig, handicapAllowance, strokeMethod, handicapBasis, ballSelection, teamFormat, teamScoreBasis, useCaptains, gameMode, modeSettings, subTeams, sides, kind?:'format', formatIds?:string[]` (the last is for player groups pointing at format rows).

Snapshot from a game: `formatFromGame(game): GroupDefaults` — `src/lib/pool-formats.ts:48-73` copies `gameMode, modeSettings, subTeams, sides, moneyMode, junkValues, customBonuses, entryPerPlayer, ballSelection, teamFormat, teamScoreBasis, handicapAllowance, strokeMethod, handicapBasis, matchConfig` (never players, course, teams/playing groups, potSplit, positionSplit, holesPlaying). Caller: share-panel.tsx:42 `saveFormat(name, formatFromGame(game), {shared})`. Wizard-side twin: `saveCurrentFormat()` page.tsx:393 and `currentGroupDefaults()` :272.

Applied to the wizard by `applyGroupDefaults(d: GroupDefaults | null)` (page.tsx:295-335; normalizes `subTeams`/`sides` via `sidesOfGame`), invoked from `chooseFormat(f: RosterGroup)` :340 (in-picker choice, also clears `gameMode` when the format has none), the `FORMAT_SEED_KEY` hydration :245-254, and `FieldStep` group load (field-step.tsx:171). Library helpers: `getFormats`, `getFormatById`, `getGroupFormats`, `saveFormat`, `duplicateFormat`, `setFormatShared`, `attachFormatToGroup` (pool-formats.ts).

## 5. Test fixtures

`src/test/fixtures.ts` has a single builder; there is no separate sides builder — a sides game is `makeGame` with `gameMode` (+ `sides` or `subTeams`):

```ts
// fixtures.ts:98
export function makeTeam(n: number, playerIds: string[], overrides: Partial<PoolTeam> = {}): PoolTeam
// fixtures.ts:108-119
export interface GameOpts extends Partial<PoolGame> {
  indexes?: number[];    // one player per entry; default [0,6,12,18]
  teamCount?: number;    // split into N teams of ceil(n/N) (classic pool); default one team
}
export function makeGame(opts: GameOpts = {}): PoolGame
```
Defaults (:135-156): `ballSelection:'1-net-1-gross', moneyMode:'pot', entryPerPlayer:20, handicapAllowance:100, handicapBasis:'course', strokeMethod:'full', potSplit 0.25×4, positionSplit:[100], junkValues: DEFAULT_JUNK_VALUES, status:'active'`; teams get `matchupId: 'm1'..'mN'`. Score helpers: `singleMatchup(scores, matchupId='m1')` :197, `scoreMap(...)` :193, `parScores`, `scoresFor`.

- Classic pool: `makeGame({ indexes: [...8 indexes], teamCount: 2 })` → two teams `t1`/`t2`, matchups `m1`/`m2`.
- Sides game: `makeGame({ gameMode: 'team-2v2', indexes: [0,0,0,0,0,0], sides: [...] })` (voided-legs.test.ts:30-32) or legacy `subTeams: { a: ['p1','p2'], b: ['p3','p4'] }` (:208); with no sides stored, `buildGameModeContext` supplies a balanced default (sides.test.ts:161-168). One team containing all players unless `teams` is overridden.

Sandbox/ledger fixture (`src/test/fixtures-domain.ts:226`): `function completedPool(opts: { id; name; playedAt; roster: RosterPlayer[]; teamCount; entryPerPlayer; offsets: number[]; sourceGroupId? }): SeededGame` — builds a classic pool with `captainId`, `status:'completed'`, and per-matchup score arrays keyed `${id}-m${n}`; format fixtures with `gameMode:'team-2v2'` / `'skins'` and a classic no-`gameMode` format at :114-165.
