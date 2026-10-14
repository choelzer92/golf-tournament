# Backlog

The single queue. Everything worth doing eventually lives HERE; the other files feed it:

- **FINDINGS.md** — observations from critique/audit. When one is worth fixing, it gets a line here.
- **DECISIONS.md** — Craig's calls. When a decision creates work, the work gets a line here.
- **NEXT_SESSION_PROMPT.md** — the ≤3 items currently promoted from this list (BETA §3), with full context.
- **Ideas** (bottom of this file) — raw brainstorm material, not yet shaped into work.

**The ritual (end of every session):** mark what got done, add what got discovered, promote the
next item into NEXT_SESSION_PROMPT.md. A backlog nobody grooms is a graveyard — this file is only
useful if it's touched every session.

Sizes: **S** = fits in a session's slack · **M** = a focused session · **L** = multi-session arc.

---

## Now (promoted)

The ≤3 items NEXT_SESSION_PROMPT.md promotes (BETA §3), plus a warm-up.

| Item | Size | Source |
|---|---|---|
| **[beta #1/#2/#3] PROMOTED 2026-10-14: persona walks with tap counts.** #1 first-time organizer, URL → shared game (~2 min, no unexplained jargon); #2 invited player scores in ~3 taps and the app remembers their group; #3 returning organizer runs it again (target 2 taps; §5.cm accepted 1 + Next × 6). Copy `e2e/event-walk.spec.ts`'s `tap()` counter; counts go in BETA §4, findings in FINDINGS | M | BETA §1 |
| **[beta #8] PROMOTED 2026-10-14:** **Backups / JSON export** — the OTHER §5c item Craig kept in scope (per-game tokens, the first, are done); still not built. One "download everything as JSON" per table is the floor; matters more as friends' real money history accumulates | S–M | DECISIONS §3 / §5c |
| **[beta #6] PROMOTED 2026-10-14:** **Stroke vs match play handicap investigation (Craig 2026-10-01, §5.ce).** "Stroke and match play are calculated very slightly differently, and very occasionally can produce different stroke totals." Pin down the USGA/WHS rules for each (stroke play gives each player their full Playing Handicap; match play gives strokes off the low as the DIFFERENCE of Playing Handicaps, and four-ball applies the allowance first; where the rounding lands), find where our code computes each one (`applyAllowance`, off-the-low, `getMoneyStrokesOnHole`), and build a property test that finds the inputs where the two disagree. Report the findings and options; **no math change without Craig** | M | §5.ce |
| **WARM-UP:** **[beta #7] The group page's Rename field may be dark-on-dark** like the event's was before `bg-white` (same markup, `home/groups/[id]/page.tsx` ~279). Screenshot it, then fix it if so | XS | §5.cw b |

## Done recently

| Item | When |
|---|---|
| **2026-10-13/14:** F-115 the game label (ff57f3b, §5.da/§5.db); F-116 optional dates + round order (1442a97, §5.dc); F-121 per-player money on even teams (05d3de3, §5.dd); the MATCH CARDS as the teams step's one editor (ac752eb, §5.de/§5.dg/§5.dh: playing handicaps, tap-to-swap, names in the legend, captain "C", sizes from step 2 only). Groomed: the done rows of Now and Next were cleared (F-097, the collapse merge, the Event + its follow-ups, F-110, F-108, F-106, F-107, F-037 gaps, F-060, F-071, F-073–F-096, hide-holes, Home by group, B1, F-101 a–d, F-100, F-102, F-070, the gate speed work); their history is in git and FINDINGS | 2026-10-14 |
| **2026-10-13:** bar #11 3-day persona walk measured (2776328); §5.cz; F-120 summary reads the money mode + F-118/F-117 "game type – course" names (661d790); F-119 a–e polish | 2026-10-13 |
| **2026-10-12 session 3:**<br>• §5.cw Event follow-ups (a) (b) (c) (e) built or kept.<br>• §5.cx: the dashboard became the Course & GHIN lookup page, with an any-golfer index lookup; headers and not-found pages go to Home; Money Game and Quick game left it (both are wizard games; the Money Game never paid, F-112); dead auto-press/carryover/skin-value hidden.<br>• F-110 A, F-111 (GHIN add on the group page).<br>• **F-113 [P1 money]** fixed: "Hole by hole" kept on head-to-head games; a read-only live count found none affected.<br>• §5.cy presses on the beta list. | — | 2026-10-12 |
| **2026-10-12 session:**<br>• F-037 Team → Match T0–T4 + polish (§5.co).<br>• F-106 swap preview strokes; F-107 stored singles pairings (§5.cq).<br>• §5.cp late player → a second game.<br>• §5.cr Series first; §5.cs S2 answered; ledger fix with T0 before/after shown.<br>• F-108 no stroke cap (§5.ct); max index 54.0. | — | 2026-10-12 |
| **Event spine slice 1 BUILT** (§5.bu): pure `lib/tournament-standings.ts` (`teamsOf`, `computeStandingsN`, N teams, ties split across every team), `computeStandings` a 2-team wrapper pinned by goldens written from the old function (`tournament-standings.test.ts`, 18; two mutations caught); `/tournament/new`, `/game/new`, `/money-game` write `createdByGhin`/`createdAt`; `tournamentVisibleTo` (owner-less = everyone) not wired, waiting on q5. No UI change, no live row touched | 2026-09-29 |
| **§5.bw session**: full gate; plus-handicap sweep + F-100 ± toggle; F-101 a (card team rows from the engine), b (hub add asks which team), c (legs live, like Standings), d (individual modes past 4, §5.ca skins pot + every-group skin rule + junk pot default); F-069 pin | 2026-09-29 |
| **§5.bv team field cap REMOVED** (Craig: "what if there are 32 people?"): `team-2v2` playersMax = ∞, router's `sidesFieldCap` gone, side ids `sideIdAt` past 26, card lists only its own teams past 6 (+ "N more teams in other groups — see Standings"), hub team editor uses a select past 4 teams, sandbox seed "32 players, 8 foursomes, 16 pairs"; `team-field-32.test.ts` (19, zero-sum × 4 money models × 2 formats × 2 layouts; 9 fail on the old router), `e2e/team-field-cap.spec.ts`. Leftovers = F-101 | 2026-09-28 |
| **F-099 C compact phone step bar**: "Step N of M · Name" + thin bar below `sm:`, full bar from `sm:`; `e2e/f099-step-bar.spec.ts` (no sideways scroll at 390px) | 2026-09-28 |
| **F-098 plus handicaps** (6509439, §5.bv): off-the-low sets the plus player to 0; full handicap gives strokes back on the EASIEST holes (purple ○), one allocator in every engine | 2026-09-28 |
| **F-062 A** (9c70565): review + captain chips explain themselves; "combined HCP" everywhere. **Phase 2 residue** (f3321da). **F-070** (9e1e9ae). **Verify speed** (§5.bu, 2 workers + `verify:quick`). **Event spine slice 1 design APPROVED** | 2026-09-27/28 |
| **F-097 fixed + six option picks built** (§5.bs, seven commits edbe3ec…a9352ac): aligned margin games settle the teams on screen; money amounts follow the question; junk payout under the grid; hub grid single-column on phones; junk footer names the winner; pot shares inline; one merged leg board. Per-commit gate = tsc + unit + touched specs, the ONE full gate at the end (`.claude/verify-2026-09-18-final.log`) was killed for low system memory near its end; RERUN 2026-09-18 (`.claude/verify-2026-09-18-rerun.log`) exit 0 — 2138 unit, 217 e2e, 14.4 min. Branch GREEN at 64dee93 | 2026-09-18 |
| **Phase 3 steps 5–6 BUILT — captains on sides, hide-holes on the team board, router's classic-only list empty** (§5.bq Q5): `GameSide.captainId` (legacy shape refuses a captained pair), hub Teams list marks "C", hub editor offers hide-holes to team games across 2+ foursomes, `classicOnlyNeeds`/"Not built yet" reasons deleted. Goldens `phase3-captains-hide.test.ts` (2 failed first); e2e `phase3-convergence.spec.ts`. Residue: 12-player fields on legs/margin money stay refused (team engine cap 8). Found F-097 (P1 money) on the walk. Verify log `.claude/verify-2026-09-18-p3s56.log` | 2026-09-18 |
| **Phase 3 step 4 BUILT — pot slices on the team engine** (§5.bq Q-E): `potFront`/`potBack`/`potOverall`/`potJunk` shares scaled to the pot, places paid per slice, junk slice replaces `junkPot` under a buy-in pot, `PotSliceBoard` on the leaderboard, router's `potLegs` refusal deleted. Goldens first (11, 6 failed, 3 mutations caught). Judgement calls listed in the spec §3 "As built". New findings F-095, F-096. Verify log `.claude/verify-2026-09-18-p3s4.log` | 2026-09-18 |
| **Phase 3 money convergence steps 1–3 BUILT** (§5.bq/§5.br; spec `.claude/plans/phase3-money-convergence.md`): junk in POINTS everywhere paid per point or as a junk pot; CTP / all-par / hand-tracked bonuses are junk on the team + individual engines (router stops refusing them, wizard grid shared); with 3+ teams `legsPayout` (winner-takes default) / `pointsPayout` (pay-each default) / carry-ties for $/hole. Goldens first every step (§5.z). Verify logs `.claude/verify-2026-09-17-p3s1/p3s2b/p3s3.log`. Next: steps 4–6 (pot slices on the team engine, captains + hide-holes on sides, router's classic-only list empties) | 2026-09-17 |
| **Hub batch F-088 A / F-089 A / F-090 A BUILT** (asked outright first, §5.bp): mode panel headed "How it's played"; phone header stacks actions under the title; `CtpEditor` classic-only (Phase 3 lifts it). Pinned in `e2e/f088-f090-hub.spec.ts`, 4/6 fail on old code. New finding F-091 (settings grid crams on a phone). Verify log `.claude/verify-2026-09-16-hub.log` | 2026-09-16 |
| **Collapse Phase 2 — vocabulary (F-061 + F-081) BUILT** on `ui-simplification-2026-09-15`: `gameKindLabel(game)` is the one game-kind label (list cards via `gameListSubtitle`, hub header, leaderboard header, save-format modal, wizard review); "side" gone from every user-visible string; hub gets a Teams section (pairings + tee group) for shared-foursome games; `structureOf` reads tee groups as the teams when no sides are stored. 3 new findings from the screenshot read (F-088/F-089/F-090). Verify log `.claude/verify-2026-09-16-phase2.log` | 2026-09-16 |
| **Small wizard batch BUILT (ten commits, one per finding)**: F-073 match/stroke-play words · F-074 typed split ("4, 2, 2") · F-075 refusals say "Not built yet: …" never a fake rule · F-076 A Add bonuses leaves CTP 0 · F-080 applied style shown once · F-082 one grey reason line · F-083 manual bonuses behind the reveal · F-084 editable legs · F-085 A partners adjacent in groups · F-086 A no locks on pairs. Each e2e-pinned; verify green (see log). Found F-087 (bonus sections sit between the money question and its amounts) | 2026-09-16 |
| **F-072 BUILT — two-ball formats on the sides engine** (goldens first, §5.z): `team-game.ts` scores a side through the pool's `teamValueOnHole`; `f072-two-ball-sides.test.ts` = 164 hand-arithmetic cases that ALL failed on the old engine (every cell a $0 dead heat), three mutations caught after; two-side/N-side/one-group goldens unmoved; router drops "Two-ball formats" from classic-only and refuses them for a team of one; mode schema, hub summary, e2e row + flipped pins | 2026-09-16 |
| **Self-walk of the collapsed wizard (63 screenshots, `e2e/collapse-walk.spec.ts`)** → F-077 (wrong money in the summary line — FIXED + pinned), F-078…F-084 logged with options; Craig's own walk → F-071…F-076. Lesson saved to memory: walk every step yourself before handing a UI over | 2026-09-16 |
| **Collapse Phase 1 slices 2–4 BUILT (c6c45f2)**: structure step ("How do you want to compete?") + scoring step replace the game picker and the F-042 toggle; money step lists the four models judged by the router, greyed with WHY; sides engine stakes from its schema; Create blocked with reason (+ "Drop the bonuses"); teams step takes the structure's sizes; draft v2; saved formats derive their structure; 13 e2e specs re-pointed via `chooseStructure`/`toScoringStep`/`chooseSolo`/`chooseMoney`, `collapse-routing.spec.ts` = one spec per routing row landing on its container. Found F-069/F-070 | 2026-09-16 |
| **F-063 opt A BUILT (bd2db4d)** — pool card flushes its pending write on pagehide/visibilitychange/unmount and subscribes to its OWN group row with per-cell client merge (`lib/score-merge.ts`, 7 tests); e2e proves a tap right before leaving survives a reload (failed with the fix stashed). Opt C stays its own session | 2026-09-16 |
| **Collapse plan WALKED with Craig → §5.bm** (route by CAPABILITY, never a user-facing container; partners walk together, no tee-sheet question; uneven splits under "Other split…"; F-063 A approved; "team" everywhere) and **slice 1 BUILT (dc88832)**: `lib/game-structure.ts` + 71 table tests, §5.z-proven (two mutations caught) | 2026-09-16 |
| **F-068 [P1 money] FIXED same day it was found** (Craig's 1v1 round → "should we just do it now?"): Stats & money ran the CLASSIC engine on every game, so every sides/individual game netted $0 and vanished; hub recap keyed by side id. One `perPlayerNets` reducer now feeds ledger + recap; `sidesForCompute` exported so the split uses the engine's own sides; 4 tests pinned first (failed on 'A'/'B', pass after); season seed gains a 2v2 + skins game (7 games). Retroactive, derived-only, no backfill | 2026-09-16 |
| **1v1 round feedback intaked as F-064…F-067** (singles allowance rec 100%, card repeats names + unlabelled gross/net, close-out navigation, other-nine subtotal column) — batched for LATER by Craig's call | 2026-09-16 |
| **Collapse DEEP PLAN written (§5.bk/§5.bl)** — four read-only code sweeps (a first attempt lost its session to a connection drop; the sweep reports were recovered from its subagent transcripts into `.claude/plans/collapse-sweeps-2026-09-15.md`), then `.claude/plans/game-structure-collapse-plan.md`: seam inventory by decision, data-model map (discriminator stays `gameMode` absent/present — zero migration), routing table, risk list, live-scoring design-space comparison (→ F-063), ASCII mocks, 5-phase plan. F-060 opt B confirmed BUILT (FINDINGS status was stale; corrected). No app code touched | 2026-09-15 |
| **UI-simplification session (2026-09-15 PM, branch `ui-simplification-2026-09-15`)**: F-060 opt B BUILT (one build trigger, hub ✓ parity); F-015 found ALREADY BUILT (log corrected); F-061 (four names for one game kind) + F-062 (7 CH display styles; 3 legacy surfaces with their OWN math, P1) logged with options; F-062 safe slice fixed; §5.bk (collapse) + §5.bl (best-possible bar, live-scoring research) recorded; GAME_STRUCTURE_DESIGN.md settled; verify green (180 e2e) | 2026-09-15 |
| **`review-session-2026-09-15` MERGED to main + pushed (aa4cd48)** on Craig's call — F-034, F-060, sandbox-owner fix, harness round 2, and the F-023 payload finding all ship on the next deploy | 2026-09-15 |
| **Review session (§5.bj)**: recommendations adopted in order — F-034 opt A BUILT (c4398a2); F-031 opt B deferred; sharing arc reshaped to Accounts/§5c hardening; next build = course-data audit, game-structure design-first in parallel; STATUS.md idea rejected | 2026-09-15 |
| **F-060 intake + opt A BUILT same session** (8ef4ebc): Craig live-stuck on Captains' deal — the tap worked but the result rendered below the fold with zero feedback. Method cards now scroll to the built teams, wear "✓ Built these teams" (demotes to "hand-adjusted since"), get a touch pressed-state; the false "drag nobody at all" copy replaced. Open: opt B (merge rival triggers → structure design), hub parity | 2026-09-15 |
| **Sandbox owner un-broken** (bf847f6): Craig's real `NEXT_PUBLIC_OWNER_GHIN` in .env.local silently un-owned the sandbox's fake Craig — 4 owner-gated e2e went red. Sandbox flag now beats the env var | 2026-09-15 |
| **Harness round 2 COMPLETE (§5.bj)**: FINDINGS archive sweep #2 (18 entries, 1,298→~720 lines, sorted-diff proof); quiet verify (dot reporter, sandbox GHIN-401 silence, CAPTURE_TEXT-gated page dumps — log ~6,000 → a few hundred lines); `e2e/helpers.ts` + verify-fixes.spec split into 7 era files (180 tests before = after); pool/[id]/page.tsx 3,233 → 459 lines + 6 `panels/*` files. Full verify green throughout | 2026-09-15 |
| **F-059 ACTIVATED on production** — Craig set `NEXT_PUBLIC_OWNER_GHIN` in Vercel (and .env.local); verified by live read-only probe: a code-only visitor with no GHIN identity gets the "See your saved games" prompt, zero games. Members are now scoped to their own games on the live app | 2026-09-15 |
| **`audit-sharing-login-2026-09-14` MERGED to main + pushed (f62cc74)** on Craig's call — the audit + F-047…F-059 ship on the next deploy. F-059 stays in legacy fallback until the owner-GHIN env var is set | 2026-09-15 |
| **F-055 + F-056/57/58 + F-059 ALL BUILT** (§5.bh/§5.bi, five commits on `audit-sharing-login-2026-09-14`, verify green ×3, 179 e2e): group management consolidated on /home (create on /home, rename/delete on the group dashboard, /pool/roster = saved players only, GroupsManager deleted); Share visible to scoring-link guests; pool cookie back to 48h (full keeps 30d sliding); QR generated on device (`qrcode` dep, shared `QrImage`); `isAppOwner()` (full access + `NEXT_PUBLIC_OWNER_GHIN`) replaced every credential-keyed owner check PLUS two unchecked surfaces found en route (/dashboard listed every game to any code-holder; /home/feedback showed everyone's notes). Rollout-safe: until the env var is set, full=owner as before | 2026-09-14 |
| **Sharing/login fixes F-047…F-054 ALL BUILT** (Craig: "address these other todos"; recommended options, same branch): full Sign Out (cookie + identity cleared), per-game token actually validated (`shareTokenMatches` wired, friendly refusal screen), 30-day SLIDING access cookie (48h expired mid-week for a weekly game — sliding alone wouldn't fix that, so A+B), invite-gate copy, pool fence → /pool not the wizard, login page greets returners by name, "Viewing as …" identity line on the game hub (F-049 partial: not yet tappable), two-line roster rows at phone width. 9 e2e in `e2e/f047-sharing-fixes.spec.ts`, verify green | 2026-09-14 |
| **Sharing/login/identity AUDIT done** (branch `audit-sharing-login-2026-09-14`): walked all four personas in the sandbox via `e2e/sharing-audit.spec.ts` (21 screenshots, `share-audit-*`), logged **F-047…F-055** with options. Headlines: Sign Out never clears the 48h cookie or localStorage identity (F-047); the per-game share token is shape-checked but never validated — `shareTokenMatches` has no callers (F-048); 48h cookie < weekly cadence (F-051); /pool/roster hides player names at phone width (F-054); group-UI consolidation shaped with its access-gating constraint (F-055). What WORKS: deep links survive the invite gate round-trip; the player share link is genuinely one-tap. No app code changed | 2026-09-14 |
| **Context economy pair MERGED to main (f1e5e8e, Craig-approved)** (9d598e2 + 036ea4c): `pool/new/page.tsx` split into per-step files under `steps/` (777-line orchestrator; verify green, unchanged e2e as proof) and 30 settled findings archived to FINDINGS_ARCHIVE.md with a one-line index (verbatim moves, sorted-line diff proved nothing lost) | 2026-09-14 |
| **MERGED to main + pushed (4c33964)**: `live-feedback-2026-09-10` — feedback box, F-027…F-046 fixes, F-045 junk defaults, F-040 add-player stack. Craig confirmed the §5.bg worked example ("makes sense — keep it") and the merge window (nobody mid-round). The 💬 feedback button is now live | 2026-09-14 |
| **F-045 junk defaults** (e924dbe, §5.bg): fresh classic pool = bonuses off behind "Add bonuses"; junk's pot quarter folds into OVERALL at creation (`foldJunkIntoOverall`, proven failable per §5.z); scorecard CTP / CTP editor / Pot panel / leaderboard junk surfaces all follow the game's junk config; JY Classic Pool format keeps its junk; 3 unit + 5 e2e. NOT built (queued below): the §5.bg money-step redesign (per-player/per-leg dollars, splits editable by player count) | 2026-09-14 |
| **F-040 add-player stack** (a35f7f9, option B): the four copies EXTRACTED into `src/components/add-player-panel.tsx` — name search first, manual second with the "no official GHIN" note, GHIN numbers behind a disclosure with paste-a-list bulk resolve (per-number report); game/new + tournament/new gained name search; e2e on all four surfaces with mocked GHIN routes | 2026-09-14 |
| **F-043 handicap chain** (9143b54): every handicap chip on the wizard (field list, teams step, sides step) opens the index → CH (slope/rating/par named) → allowance → plays-off chain; `explainPlayingHandicap` PINNED to `getPoolPlayingHandicap` by a full-matrix unit test; F-023 honesty folded in; e2e + screenshot. Same commit: F-041 correction — the misfit redirect keyed on `stableford`, registry id is `stableford-ind`, so it never fired; caught by aefa30c's unverified e2e on its first real run | 2026-09-14 |
| **F-046 group formats follow the group** (d412ade): "Save format" on a game with a sourceGroupId offers "Attach to {group}" (default ON); the wizard game step leads with the chosen group's formats under "{Group} plays", library follows deduped; 2 e2e walking Craig's exact repro | 2026-09-14 |
| **aefa30c e2e verified** — the handoff's first action; full gate green (140 e2e) | 2026-09-14 |
| **Quick-fix batch F-035/36/37p/38/39a** (5028c54, 8ab44fd): Groups-step rounding; duplicate side ids on reshape (P1 money); "This makes it a 2 v 2 match"; tees sorted longest-first; "Bill M. & Bill G." | 2026-09-14 |
| **Language fixes F-041/F-042/F-044**: misfit note redirects ("5 players can still score Stableford — as a team Pool"); money toggle asks "Who competes against whom?" (All teams, for a pot / Two teams, head-to-head); pot split says "The usual split for N teams"; 85↔90 note names its driver | 2026-09-14 |
| **F-040…F-046 intaked** from Craig's functionality walkthrough (add-player flow, game taxonomy, money-mode confusion, handicap black box, pot-split opacity, junk defaults, saved-format miss) | 2026-09-14 |
| **F-028…F-033 ALL BUILT** — Craig picked all recommendations (F-030: segmented toggle over swipe; F-032: recap in the close-out panel). Six commits on `live-feedback-2026-09-10` (8018429 dots, d54cfe2 to-par, e2788c4 pts/hole, 60e5fe2 fit hint, a22e359 [Card\|Standings] pill, e038fff who-pays-whom + `gameRollups()`), each with e2e; verify green (136 e2e). Still open from the batch: F-030 opt C (standings strip on the card, §6b); F-031 opt B (bigger card superscript); telling the friend the answers (men's/women's SI factored; 1v1 = Sides/Match; 3p = Nines etc.) | 2026-09-10 |
| **In-app feedback box** BUILT (065956f) — Craig OK'd with "easy to find, doesn't cover things up": header 💬 button (hub + /home), bottom sheet, `feedback_notes` migration WRITTEN BUT NOT APPLIED to live (Craig's step), `src/lib/feedback.ts`, `/home/feedback` read-back, 2 e2e | 2026-09-10 |
| **F-027 code fixes** (ca931fa) — Craig: "fix writers now, query later". Writers trim + fall back to `GHIN #…`; `upsertRosterPlayer` refuses to blank a stored name; group page renders `rosterDisplayName`; unit + e2e | 2026-09-10 |
| **F-027 live query** (Craig-authorized, read-only) — ZERO blank names in live `players` (83 rows, min name length 8): no backfill needed. Found instead: one dangling member id in "Friday Group" (deleted player still referenced) | 2026-09-10 |
| **feedback_notes migration APPLIED to live** (Craig-authorized; dry-run showed exactly the one migration; table verified present + empty) | 2026-09-10 |
| **F-028…F-033 all VERIFIED on screen** (§5.bf pass): screenshots + 3–4 options each recorded in FINDINGS.md; 2 sandbox scenarios added (individual Stableford mid-round + complete); friend's questions answered in FINDINGS intake note | 2026-09-10 |
| Group tap: >8 members loads UNCHECKED — field picked by checking (ddb3e95) | 2026-09-10 |
| Classic verbiage: wizard says "Off the low" / "Full handicap" (1b0b897) | 2026-09-10 |
| §5.av — saved formats are choices in the wizard's game picker (b69b665) | 2026-09-09 |
| §5.au — wizard reorder: field → game → course → tees → money (f08dd22) | 2026-09-10 |

## Waiting on Craig (collect here; he checks everything locally at the end of the beta)

| Item | What's needed |
|---|---|
| **The local/phone walk** | Match cards (§5.de–§5.dh), F-037 (closes the P1), the Event, the long labels (`e2e/screenshots/f116-event-round-moved.png`) |
| **Merge `series-2026-10-12`** | His walk, then merge (bar #10) |
| **The branding/design session (bar #7)** | Theme, icon, name (D2; "GrudgeMatch" floated), and F-114: the event standings on a phone, "very clear and inviting" |
| **Presses: the eight design questions** | In the PRESSES row below; one at a time, before any code |
| **[tag?] rows** | BETA §2: whether each is [beta] or [after-beta] is his call |
| **Course-data correctness audit** | PARKED by him 2026-09-15 ("wait on the course data"); resume on his word |
| **F-037 [beta #6]: a GHIN-app side-by-side of a four-ball match off the low**, to confirm T4's per-match strokes against the reference (§5.ba). Not blocking: same rounding and order as the verified field low | Size S, from §5.ba, T4 |
| **Saved formats keep their pot split** (found on the B1 walk, 2026-10-05): a saved format re-fills the team-count standard ($70/$70/$40/$20 for 2 teams) whatever split it was saved from. Run it back now carries the split when team count matches (`carriedSplitDollars`); the same rule for formats is Craig's call (§5.cm only decided reruns) | Size S, from §5.cm |

## Next few sessions (shaped, ready to build)

In order after the promoted three: F-063 C (bar #5), F-121 uneven (bar #6), presses once answered, then S2.

| Item | Size | Source |
|---|---|---|
| **[beta #5]** **F-063 C — APPROVED 2026-10-01 (§5.ce).** Per-cell score rows `(matchup_id, player_id, hole)` plus a localStorage outbox, dual-read. Investigate first (schema, migration on live Supabase, dual-read and backfill, RLS, realtime), then write the build plan into roadmap Phase C. **Show Craig the migration before it touches live** | M | F-063, §5.ce |
| **[beta #6] F-121, UNEVEN teams (§5.dd, later):** each loser pays the stated $ and the winners share it (3 v 2 at $10: −$30 / +$45 each over three legs); a team pot antes per player (replaces §5.ag). A money change: goldens first, NEW games only, saved games keep per-team. Until then uneven teams ask per team and the label says "a team" | M | §5.dd |
| **[approved, not a bar item: after the bars it doesn't block]** **Event spine S2 — APPROVED 2026-10-01 (§5.ce); questions ANSWERED 2026-10-12 (§5.cs).** Q3's ledger fix is BUILT (9733d48). Next: the convergence slices S2.0–S2.6, which carry Q2 (own tee), Q4 (per-ball 2BB Stableford), Q5 (scale + scramble %), Q7 (per-player Nassau), Q8 (pool skins rules) and Q9 (index stands in), all for NEW rows only (Q1 keeps legacy rows as they are). Q6: split stays legacy until §5.cp is built. Tournament rounds scored through `game-modes/`, goldens first (`.claude/plans/event-spine.md` §3). Investigate first (corpus, every A/B function vs the registry, what disagrees), then write the build plan into roadmap Phase E and build. Any money/points disagreement goes to Craig before switching | L | §5.bu, §5.ce |
| **[beta] PRESSES: a "Press" button mid-match (Craig 2026-10-12, §5.cy).** NOT auto-press. During a head-to-head match, a tap on **Press** starts a new bet from the next hole to the end of that nine (or the 18). It's for the same stake as the leg unless set otherwise, and it settles on its own. Presses exist nowhere in the app today (F-112). Design questions for Craig BEFORE code: (1) which games: classic head-to-head legs, the Team → Match matches (§5.co), 1v1 and 2v2 (all of them?); (2) who may press: only the side that's down, or either; (3) does the other side have to accept, or is a press automatic once tapped; (4) can a press be pressed (and is there a cap); (5) do presses on the front carry to the back; (6) is the stake the leg's $ or chosen at the tap; (7) who may tap: any player on the scorecard, or the organizer only; (8) can a press be undone (a mis-tap). Then: a design note, goldens first (§5.z, zero-sum), the scorecard button, the leaderboard and settle-up lines. Money math, so ask first (§2) | M | F-112, §5.cy |
| **[tag?]** **§5.cp [beta #11 adjacent]: several games on one round sharing its scores** (a late player → a second game for the back nine). Shape it with the Series | L | §5.cp |
| **[tag?] bar #1 candidate:** **§5.bg money-step redesign** (the deeper F-045 ask, deliberately not built with the fold): the classic pool's money step reads as WHAT EACH LEG PAYS PER PLAYER — editable splits that scale with player count, bonuses added by choice, a visible adds-up check (legs + junk = pot). The "Split total: $X vs pot $Y ✓" line exists; the rest is the redesign. Zero-sum stays the tested invariant; worked-example sign-off before merge (money rule §2) | M | §5.bg part 3 |
| **[beta #7]** Merge-audit polish: loss-red leg results on the dark board | S | §5.ak |
| **[beta #7]** Merge-audit polish: "Sides / Match" as a category label | S | merge audit |
| **[beta #7]** Merge-audit polish: the `70, 30` position-split mini-DSL | S | merge audit |
| **[beta #7]** Merge-audit polish: three different renderings of course handicap | S | merge audit |
| **[beta #7]** Leaderboard shows front/back columns for a 9-hole game (redundant, not wrong) | S | roadmap #13 note |
| **[tag?] bar #2 candidate:** F-030 opt C: standings strip ON the scorecard (mini-leaderboard above the grid) — the deeper "captain glancing between shots" fix; composes with the built toggle; slot into the live-scoring session | S | F-030, §6b |
| **[infra] RAISED 2026-10-14 (the gate was killed for low memory 3 times):** **Gate memory:** ~200 Playwright Chrome processes during a full run (2026-10-01; the gate was OOM-killed once). Check that every spec closes its pages and contexts. Low-memory fallback: `PW_WORKERS=1` | S | 2026-10-01 |
| **[beta #6]** F-069 DECIDED §5.bw: keep best-ball default + pin every offered format is computed. Was: a NON-`TeamFormat` string in a sides game still scores as best ball (`teamNetOnHole` default arm, now the one place for both containers after F-072) — refuse vs default is Craig's call; Phase 3 rider | S | F-069 |
| **[beta #2/#5]** Live scoring experience pass (taps, refresh latency, cart-path wifi — measure before/after per §5.bl) | M | §6 item 3 — Craig's named focus, never had its session |
| **[beta #5]** Offline / PWA resilience (`sw.js` exists, caches nothing — cart-path wifi) | M | §6 item 4; core to "continuing" |
| **[tag?]** **1v1 feedback batch (Craig's real round 2026-09-15) — LATER, explicitly not the next session:** F-064 singles allowance rec (100%; sides get no rec today, prefills read as advice) · F-065 1v1 card repeats names + unlabelled gross/net rows · F-066 post-close-out navigation lands oddly (repro walk first; `/dashboard` bounce suspect) · F-067 card's other-nine subtotal column labelled In/Out reads as the wrong total (show Out + In + Tot like a paper card). F-064 opt A is a natural rider on the collapse's scoring step | S×4 | F-064/065/066/067 |
| **[tag?] STALE since 2026-09-29, re-check first:** **NEXT SESSION:** Craig's calls first (F-103 a live skins-pot $; event-spine q5 who sees an owned tournament; merge) → F-103 b card header → F-101 e polish at 144 (`scoreAt`, rendering) → wire the tournament owner filter once q5 is answered | M | 2026-09-29 |

## After beta (tagged, waiting; BETA §1 says these don't move a bar)

| Item | Size | Source |
|---|---|---|
| **[after-beta] A custom Stableford scale in TEAM games.** The wizard's team Stableford is fixed at 5/4/3/2/1/0 (`team-scoring.ts` ~65); modified and custom scales exist only in individual Stableford (`stableford.ts` 31-43). The old quick game offered them for teams too (`game/new` 838-862). It's the only quick-game capability the wizard lacks (F-109 builder check). Craig 2026-10-12: log it. Scoring math, so goldens come first (§5.z) | S | F-109 |
| **[after-beta] Event points rollup (Ryder Cup):** `rollup: 'points'` sums each round's Team → Match team points (§5.co) across the event. It needs the teams fixed across rounds | M | §5.cr |
| **[after-beta]** Phase 2 residue: ~~`isSingleGroupGame` rename + AGENTS.md~~ DONE 2026-09-28 (`isModeEngineGame`); ~~sandbox seed labels "sides"~~ DONE (now "teams"); ~~obsolete one-group snapshot~~ DONE (re-keyed "(foursome)", content unchanged, mutation-proven). LEFT: `teamBuild` provenance still classic-only; the `team-2v2` mode `name` "Teams" is a placeholder Craig may rename (F-088 C) | S | plan §7 Phase 2 |
| **[after-beta]** F-102 leftovers (LOW): legacy tournament pages hide give-back dots; the play page's handicap detail reads the nine from the view, not per hole | S | F-102 |

## Bigger arcs (approved plans, each wants its own fresh session)

| Item | Size | Source |
|---|---|---|
| **(reference; BETA.md is now the filter)** **ROADMAP 2026-10 (DRAFT, awaiting Craig's order + calls):** `.claude/plans/roadmap-2026-10.md`. A: finish what's decided (§5.cb visibility, F-103 b/c, F-101 e, money-format bugs, doc hygiene). B: first-time + return ease (Run it back, wizard fast path, Send after Create, don't ask twice, paste/recent players, guest remembers group, plain words, round-start clutter). C: never lose a score (F-063 C, offline/PWA, live-scoring pass, season ledger). D: professional polish (Geist font, brand assets, front door, one theme, icons, copy diet; needs §5.bv 3 lifted). E: spine S2→S4, flights | L | Craig 2026-10-01 |
| **Accounts / §5c hardening** (reshaped 2026-09-15, §5.bj — the audit + F-047…F-059 delivered the sharing/login polish; this row is what remains): revoke/rotate per-game tokens, real RLS under the settled §5.bi ownership model, and the F-049 remainder (tappable "Viewing as…"). Crossing into real accounts/auth is the §5c/F-002 trigger — pause for Craig there. | M–L | Craig 2026-09-10 + §5.bi/§5.bj |
| **Home screen & Event model — P3 the shared Event spine** (P1 hub + P2 stats/ledger BUILT 2026-08-05, `HOME_V2` ON since 2026-08-12; the plan file is gone — record = session memory + §5.bt). P3 = Pool as an Event with one round over `game_scores`, tournament teams N-way, owner on tournaments; unlocks >2-team tournaments, flights (P4), multi-day pool. Starts as a design conversation + a plan in the repo's `.claude/plans/` | L | Craig 2026-09-27 (step 2 of the next session) |
| **Team Competition engine** — N teams of size K within foursomes (4 pairs combined Stableford etc.). Now = Phase 3 (convergence) of the collapse plan. NOTE: the plan file `tingly-petting-reddy.md` is NOT on disk (plans written outside the repo were lost); memory `project_pool-team-competition-plan` is the durable copy. Plans now live in the repo's `.claude/plans/` | L | approved 2026-08-03 + collapse plan §7 |
| **Flight mode** — handicap flights/divisions competing separately. **Scale target (§5.bw): a member-guest, 72 teams of 2 = 144 players / ~36 foursomes**; a flight = a subset of sides with its own standings | L | folded in as Phase 4 of the Home/Event plan; §5.bq: the Phase 3 pair-balancing (similar combined handicap per pair) is its seed — build that routine so flights can reuse it |

## Known-incomplete corners (fix when the format is actually played)

| Item | Trigger | Source |
|---|---|---|
| Tournament still has its OWN team-score math (engine rows only cover pool 3+ sides); two-side badge path duplicated | touching the tournament scorecard | F-013 "still open" |
| 9-hole scramble/alt-shot team stroke dots use the play page's own calc (only broken: 9-hole + 18-basis) | someone plays that format | roadmap #14, deferred by Craig |
| 2v2 has no pot model (its three money models are all margins); `distributePot` + `positionSplit` would give it nearly free | Craig asks — do NOT add unprompted | §5.ae |
| Vegas + Bingo-Bango-Bongo game modes | Craig asks | memory `project_pool-game-modes` |

## Deferred by decision (don't pick these up without Craig)

| Item | Why deferred | Source |
|---|---|---|
| Security: real RLS, per-visitor tokens, auth | deliberately pre-scale (§5c) | F-002 |
| Route/internal renames (`/pool/*`, `PoolGame`) | breaks shared links for zero benefit | §5.az |
| Golf trainer Layers 2–5 (stats → plans → AI → strategy) | Layer 1 shipped; rest unscheduled | memory `project_golf-trainer` |

## Ideas (brainstorm — unshaped, no commitment)

Raw material. Add freely in-session or when Craig muses; shape into a backlog line only when
it's real. Never build from this section directly.

**"Truly the best" (2026-10-14; Craig: "lets see if we can keep going to make this app truly the best").**
Candidates for after the beta, each tied to the north star. All are [after-beta] until Craig promotes one:
- **Settle up in one tap** (continuing): the close-out's "who pays whom" opens Venmo / Cash App / PayPal
  with the amount and a memo ("Sat Nassau, Hogs v Dawgs") filled in. Netting across a group's season, not
  per game, means fewer transfers.
- **The season ledger as a first-class screen** (continuing): per group, running money and points, head-to-head
  records ("you're 7–3 against Dave"), streaks. The data is already in `/home/stats`; the gap is making it
  the place people go back to between rounds.
- **A shareable round recap**: one image after close-out (winners, money, the best hole, skins) to drop into
  the group chat. It's the app's word of mouth.
- **Live match status out of the app**: "Hogs 2 UP thru 12", pushed (PWA notifications) or as a link
  preview in the group chat, so the other foursome knows without opening a card.
- **A guest joins at the turn, in one tap** (continuing): a QR on the organizer's phone adds the late player
  to a second game for the back nine (§5.cp), without re-sharing anything.
- **Score fixes with a trail** (continuing): "Dave changed hole 7 from 5 to 4 (12:41)" on the card, so a
  corrected score is trusted rather than argued about. It pairs with F-063 C's per-cell rows.
- **"Play it like last Saturday" from anywhere**: Run it back already exists; surface it on Home's group card
  and as the first suggestion when the same group opens New Game.

- **Several games on one round, sharing its scores** (Craig, 2026-10-12, §5.cp): the 2 v 2 matches
  carry on while a 3 v 3 game (teams may differ) covers the back nine, each paying on its own
  sides. It came out of the late-player question. Shape it with Team → Match side games and the
  Series (bar #11). Today each game owns its scorecards.
- **AI caddy** — Craig has ideas, deferred until the base is solid (roadmap #12)
- Season-long money ledger surfaced better ("who owes whom, over a season" — north star's
  "continuing" pillar; partially exists in /home/stats)
- ~~Roadmap #8 match status in the play header, and #9 the match-by-match scorecard~~: both
  already exist (dedup audit 2026-10-01: `play/page.tsx:3139`, tournament round `:1277`)
- **Branding and name** (Craig, 2026-10-01, §5.ci): a brainstorm session near the end of beta.
  "GrudgeMatch" was floated. D2 (icon set, name, colour) waits for it.
- Smart-anything (tee recommender by skill, score predictions) — Craig explicitly cut the tee
  RECOMMENDER down to "the tee they typically play" (built); keep that instinct
- Individual stat tracking (friend, 2026-09-10) — partially exists at /home/stats (money);
  he likely means golf stats (scoring avg, per-hole). Unshaped.
- Export scores to GHIN (friend, 2026-09-10) — score POSTING to GHIN; needs API research
  (is it even open to third parties?) before shaping.
- Uneven-team fairness (Craig, 2026-09-16, §5.bm Q3): when teams are 3+3+2 or 4+2+2, could
  strokes/allowance be adjusted so the short team isn't disadvantaged, or should the app
  RECOMMEND formats that suit uneven sides? "Probably not necessary" — uneven teams just work first.
- Per-group pot-split defaults (from F-044): `POOL_SPLIT_TABLE` is Craig's own history as a
  global table — a group could save its own usual splits instead; feeds the format library.
