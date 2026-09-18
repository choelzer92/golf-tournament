# Backlog

The single queue. Everything worth doing eventually lives HERE; the other files feed it:

- **FINDINGS.md** — observations from critique/audit. When one is worth fixing, it gets a line here.
- **DECISIONS.md** — Craig's calls. When a decision creates work, the work gets a line here.
- **NEXT_SESSION_PROMPT.md** — the ONE item currently promoted from this list, with full context.
- **Ideas** (bottom of this file) — raw brainstorm material, not yet shaped into work.

**The ritual (end of every session):** mark what got done, add what got discovered, promote the
next item into NEXT_SESSION_PROMPT.md. A backlog nobody grooms is a graveyard — this file is only
useful if it's touched every session.

Sizes: **S** = fits in a session's slack · **M** = a focused session · **L** = multi-session arc.

---

## Now (promoted)

| Item | Size | Source |
|---|---|---|
| ~~F-097 [P1] [money]~~ FIXED 2026-09-18 (edbe3ec). ~~Six option picks~~ ALL BUILT 2026-09-18 (§5.bs): F-087 A + F-093 A (ce439ac), F-091 A (0f0d6df), F-092 A (a78f0b3), F-096 A (4baca75), F-095 B (a9352ac). **Branch is code-complete for Phases 1–3; Craig's own wizard walk still wanted before merge (§5.y); merge is his call (§5.ab).** | — | §5.bs |
| **Game-structure COLLAPSE — Phases 1, 2 and 3 (steps 1–6) BUILT on `ui-simplification-2026-09-15`, UNMERGED.** Phase 3 (§5.bq/§5.br): junk points everywhere, CTP/all-par/hand-tracked as junk, 3+-team payout settings, pot slices, captains on sides, hide-holes on the team board, router's classic-only list EMPTY. Remaining refusals are golf or the team engine's 8-player cap (12 players on legs/margin money stay refused — residue). F-097 fixed and all six option picks built 2026-09-18 (§5.bs). Craig's phone walk still wanted (§5.y). Screenshots: `e2e/screenshots/collapse-*.png`, `walk-*.png`, `phase3-*.png`. | L | §5.bk/§5.bm/§5.bq |
| **Course-data correctness audit — PARKED by Craig 2026-09-15 ("wait on the course data")**. Meadows payload banked + CLEAN (F-023); prime suspects now gender-name tee collisions and stale stored games. Resume on his word. | M | Craig 2026-09-10/14 + F-023 |
| Merge-audit polish batch (all four S items below) — fallback slack work | S×4 | merge audit / §5.ak |

## Done recently

| Item | When |
|---|---|
| **F-097 fixed + six option picks built** (§5.bs, seven commits edbe3ec…a9352ac): aligned margin games settle the teams on screen; money amounts follow the question; junk payout under the grid; hub grid single-column on phones; junk footer names the winner; pot shares inline; one merged leg board. Per-commit gate = tsc + unit + touched specs, the ONE full gate at the end (`.claude/verify-2026-09-18-final.log`) was killed for low system memory near its end (unit 2138 green, e2e nearly done) — RERUN IT next session before merge | 2026-09-18 |
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

## Waiting on Craig (not buildable until he acts)

| Item | What's needed |
|---|---|
| **Walk the collapsed wizard on your phone** (sandbox: `NEXT_PUBLIC_SANDBOX=1 npx next dev --port 3200` → /pool/new; or the `collapse-*.png` screenshots) — every setup flow changed; findings go to FINDINGS.md before merge | Craig's eyes on the 8-player pool, four pairs, 1 v 1 and skins flows |
| F-022 on-course verification | Spot-check 90% strokes vs the GHIN app (incl. an off-the-low game); screenshots if anything is off by one |
| ~~F-023 part B payload~~ DONE 2026-09-15 — Craig ran the script; Meadows payload is CLEAN (see F-023). Optional: capture 1–2 more suspect courses the same way before the audit session | — |
| §7 q4 | Confirm dark = live / light = setup is deliberate |
| F-033 answer-back | Send the friend the drafted answer (in the 2026-09-15 session notes): 1v1 = Sides/Match, 3p = Nines etc., SI factored, fixes now live |

## Next few sessions (shaped, ready to build)

| Item | Size | Source |
|---|---|---|
| **Verify speed + context (Craig, 2026-09-18: "these tests seem to take a really long time … we may need to adjust something about our process … and context usage")**. Facts: `npm run verify` = tsc → `next build` → 2119 unit (20s) → 214 Playwright tests on ONE worker against a fresh dev server (19–25 min; a cold hub compile timed out once at 15s and forced a full rerun). Options, Craig's pick: **A** parallel workers — `fullyParallel`/`workers: 4` if `fake-supabase` is per browser context (its comment says "one shared in-memory store per server"; verify that first), else one server per worker on ports 3200+N; **B** a two-tier gate — `verify:quick` (tsc + unit + the specs touching changed files) per step, the full gate once before handoff; **C** trim the gate — `next build` only for the no-sandbox-in-build test (or make that test build-free), keep the dev server WARM between runs instead of `rm -rf .next`; **D** context — never poll a running gate more than every ~5 min; end the turn and let the completion notification re-invoke; delegate log reading. Recommend A + B + D together. | M | Craig 2026-09-18 |
| **§5.bg money-step redesign** (the deeper F-045 ask, deliberately not built with the fold): the classic pool's money step reads as WHAT EACH LEG PAYS PER PLAYER — editable splits that scale with player count, bonuses added by choice, a visible adds-up check (legs + junk = pot). The "Split total: $X vs pot $Y ✓" line exists; the rest is the redesign. Zero-sum stays the tested invariant; worked-example sign-off before merge (money rule §2) | M | §5.bg part 3 |
| Merge-audit polish: loss-red leg results on the dark board | S | §5.ak |
| Merge-audit polish: "Sides / Match" as a category label | S | merge audit |
| Merge-audit polish: the `70, 30` position-split mini-DSL | S | merge audit |
| Merge-audit polish: three different renderings of course handicap | S | merge audit |
| Leaderboard shows front/back columns for a 9-hole game (redundant, not wrong) | S | roadmap #13 note |
| F-030 opt C: standings strip ON the scorecard (mini-leaderboard above the grid) — the deeper "captain glancing between shots" fix; composes with the built toggle; slot into the live-scoring session | S | F-030, §6b |
| ~~F-060 follow-through~~ DONE 2026-09-15 (877c9ea) — opt B + hub parity both built; the collapse plan keeps the method list as the teams step for any N × K | — | F-060 |
| **F-063 opt C: per-cell score rows** — `(matchup_id, player_id, hole)` table, idempotent upserts, localStorage outbox, dual-read transition, sandbox fake gains the table first; retires the merge RPC. Makes `matchupId` a fetch key, not a correctness boundary — de-risks the whole sides family. Own session; persistence → Craig | M | F-063 / plan §5.3 |
| ~~F-071 ONE teams step for every split (opt A)~~ DONE 2026-09-16 — `TeamsStep` money-teams mode, sides derived on leaving, partner-aware groups reshape (`packTeamsIntoShape`), `SubTeamsStep` deleted; F-078 + F-079 fell out; two judgement calls for Craig in FINDINGS F-071 status (empty-until-tapped, captains off for pairs) | — | F-071 |
| ~~F-085 partners adjacent in the groups step~~ DONE 2026-09-16 (opt A, c7ae51d) — option confirmed (§5.bo) | — | F-085 |
| ~~F-086 no locks panel on pairs~~ DONE 2026-09-16 (opt A, 9f606cc) — option confirmed (§5.bo) | — | F-086 |
| ~~F-073 match-play / stroke-play words~~ DONE 2026-09-16 (6728a25) | — | F-073 |
| ~~F-074 typed split under "Other split…"~~ DONE 2026-09-16 (ec47f98) | — | F-074 |
| ~~F-075 refusals name the engine gap~~ DONE 2026-09-16 (6728a25) | — | F-075 |
| ~~F-076 Add bonuses leaves CTP 0~~ DONE 2026-09-16 (opt A, f55c550) — confirmed (§5.bo); opt B (per-bonus toggles) rides with Phase 3 | — | F-076 |
| ~~F-078 hide the sides step's shape chooser~~ DONE 2026-09-16 with F-071 A (the step is gone) | — | F-078 |
| ~~F-079 skip the teams step for a 1 v 1~~ DONE 2026-09-16 with F-071 A (tees → Money) | — | F-079 |
| ~~F-084 editable head-to-head legs~~ DONE 2026-09-16 (2b7f5c8) | — | F-084 |
| ~~F-082 one grey reason line~~ DONE 2026-09-16 (6728a25) | — | F-082 |
| ~~F-080 applied style shown once~~ DONE 2026-09-16 (b4b6461) | — | F-080 |
| ~~F-083 manual bonuses behind the reveal~~ DONE 2026-09-16 (f427809) | — | F-083 |
| ~~F-087 money step: bonus sections sit between the money question and its amounts — reorder (opt A)~~ DONE 2026-09-18 (§5.bs, ce439ac) | — | F-087 |
| ~~F-088 hub says "Teams" twice~~ DONE 2026-09-16 (opt A, 340cd60, §5.bp) | — | F-088 |
| ~~F-089 phone header wraps the title~~ DONE 2026-09-16 (opt A, c60ae11, §5.bp) | — | F-089 |
| ~~F-090 CTP editor on a team game~~ DONE 2026-09-16 (opt A, 3965d25, §5.bp); Phase 3 lifts the gate | — | F-090 |
| ~~F-094 `legs` at 3+ teams hybrid rule~~ DECIDED §5.br + BUILT 2026-09-17 (step 3: winner-take-all default, pay-each explicit) | — | F-094 |
| ~~F-096 team money step stacks the pot's share fields as four full-width rows — opt A one inline row (the classic pot-dollars layout); rides with F-087/F-093; Craig's pick~~ DONE 2026-09-18 (§5.bs) | — | F-096 |
| ~~F-095 sliced team pot lists front/back/overall twice (leg board + Pot board) — opt B one merged board (margin + $ per row, Junk fourth); Craig's pick~~ DONE 2026-09-18 (§5.bs) | — | F-095 |
| ~~F-093 team money step asks "Junk pays" above the bonus grid — opt A move junk-payout fields under the grid; do with F-087~~ DONE 2026-09-18 (§5.bs) | — | F-093 |
| ~~F-092 junk bonus board under a junk pot doesn't name who took the pot — opt A footer names the winner(s); Craig's pick~~ DONE 2026-09-18 (§5.bs) | — | F-092 |
| ~~F-091 hub "How it's played" grid crams label+value on a phone ("CompareMatch (hole by hole)") — opt A single-column rows below `sm`; Craig's pick~~ DONE 2026-09-18 (§5.bs) | — | F-091 |
| Phase 2 residue: `isSingleGroupGame` still named for what it used to mean (AGENTS.md's one rule cites it — rename both together); `teamBuild` provenance still classic-only; sandbox seed labels still say "sides" (dev-only, e2e `seed()` looks them up); the `team-2v2` mode `name` "Teams" is a placeholder Craig may rename (F-088 C) | S | plan §7 Phase 2 |
| F-069: a NON-`TeamFormat` string in a sides game still scores as best ball (`teamNetOnHole` default arm, now the one place for both containers after F-072) — refuse vs default is Craig's call; Phase 3 rider | S | F-069 |
| F-070: sandbox fake gains `.in()`/`.order()`/`.limit()` so the audit history renders in e2e (unhandled rejection in every verify log today) | S | F-070 |
| Live scoring experience pass (taps, refresh latency, cart-path wifi — measure before/after per §5.bl) | M | §6 item 3 — Craig's named focus, never had its session |
| Offline / PWA resilience (`sw.js` exists, caches nothing — cart-path wifi) | M | §6 item 4; core to "continuing" |
| **1v1 feedback batch (Craig's real round 2026-09-15) — LATER, explicitly not the next session:** F-064 singles allowance rec (100%; sides get no rec today, prefills read as advice) · F-065 1v1 card repeats names + unlabelled gross/net rows · F-066 post-close-out navigation lands oddly (repro walk first; `/dashboard` bounce suspect) · F-067 card's other-nine subtotal column labelled In/Out reads as the wrong total (show Out + In + Tot like a paper card). F-064 opt A is a natural rider on the collapse's scoring step | S×4 | F-064/065/066/067 |
| **Backups / JSON export** — the OTHER §5c item Craig kept in scope (per-game tokens, the first, are done); still not built. One "download everything as JSON" per table is the floor; matters more as friends' real money history accumulates | S–M | DECISIONS §3 / §5c |

## Bigger arcs (approved plans, each wants its own fresh session)

| Item | Size | Source |
|---|---|---|
| **Accounts / §5c hardening** (reshaped 2026-09-15, §5.bj — the audit + F-047…F-059 delivered the sharing/login polish; this row is what remains): revoke/rotate per-game tokens, real RLS under the settled §5.bi ownership model, and the F-049 remainder (tappable "Viewing as…"). Crossing into real accounts/auth is the §5c/F-002 trigger — pause for Craig there. | M–L | Craig 2026-09-10 + §5.bi/§5.bj |
| **Home screen & Event model** — P1 flag-gated read-only /home → stats/ledger → shared Event → flights | L | approved plan `.claude/plans/adaptive-squishing-locket.md` |
| **Team Competition engine** — N teams of size K within foursomes (4 pairs combined Stableford etc.). Now = Phase 3 (convergence) of the collapse plan. NOTE: the plan file `tingly-petting-reddy.md` is NOT on disk (plans written outside the repo were lost); memory `project_pool-team-competition-plan` is the durable copy. Plans now live in the repo's `.claude/plans/` | L | approved 2026-08-03 + collapse plan §7 |
| **Team engine field cap (8 players)** — the last engine reason a money option is greyed: 3 teams of 4 on head-to-head legs / $ per hole / $ per point (classic holds two teams; `team-2v2` playersMax 8). Lifting it = the team engine over N foursomes (it already reads every matchup); check `sidesFieldCap` users, the 1-worker leaderboard, and the scorecard's team rows | M | Phase 3 step 6 residue |
| **Flight mode** — handicap flights/divisions competing separately | L | folded in as Phase 4 of the Home/Event plan; §5.bq: the Phase 3 pair-balancing (similar combined handicap per pair) is its seed — build that routine so flights can reuse it |

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

- **AI caddy** — Craig has ideas, deferred until the base is solid (roadmap #12)
- Season-long money ledger surfaced better ("who owes whom, over a season" — north star's
  "continuing" pillar; partially exists in /home/stats)
- Match status in the play-page header for tournament games ("Bernstein +2 thru 7") — roadmap #8,
  may already partially exist; verify before building
- Match-by-match scorecard view on round detail (needs per-matchup score persistence) — roadmap #9
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
