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
| **Course-data correctness audit — THE NEXT BUILD SESSION (§5.bj)**. Extends F-023: (a) inventory live games' courses for missing/odd ratings via read-only queries; (b) harden the parse; (c) a diagnostic view that says WHAT the app extracted. Unblocker: `scripts/fetch-course-payload.mjs` (Craig runs with his GHIN creds, read-only — works for ANY course, not just the Meadows). F-038 (tee order) fixed; the default-TEE question (tips as default?) belongs to this audit. | M | Craig 2026-09-10/14 + F-023 + §5.bj |
| **Game-structure simplification — design-first, runs in parallel with build work (§5.bj)** (Craig 2026-09-14: "a pool is effectively just a 4v4 game… choose your groups, game style, players, how many teams, and go"). Structure-first wizard question, modes as shortcuts — the UI framing for the Team Competition engine (§5g). First deliverable is a DESIGN DOC + mock walk, not code. Feeds/absorbs: F-037 (pairings axis), F-042 (move money-toggle after teams), F-060 opt B (merge the rival build triggers), F-005's group-defaults-as-confirmations. | L (design first) | F-041 + Craig 2026-09-14 + §5.bj |
| Merge-audit polish batch (all four S items below) — fallback slack work | S×4 | merge audit / §5.ak |

## Done recently

| Item | When |
|---|---|
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
| F-022 on-course verification | Spot-check 90% strokes vs the GHIN app (incl. an off-the-low game); screenshots if anything is off by one |
| F-023 part B (widen the GHIN ratings parse) | Run `GHIN_USER=… GHIN_PASS=… node scripts/fetch-course-payload.mjs "The Meadows" WV` (read-only; works for any course/state) — or the network-tab route |
| §7 q4 | Confirm dark = live / light = setup is deliberate |
| F-033 answer-back | Send the friend the drafted answer (in the 2026-09-15 session notes): 1v1 = Sides/Match, 3p = Nines etc., SI factored, fixes now live |

## Next few sessions (shaped, ready to build)

| Item | Size | Source |
|---|---|---|
| **§5.bg money-step redesign** (the deeper F-045 ask, deliberately not built with the fold): the classic pool's money step reads as WHAT EACH LEG PAYS PER PLAYER — editable splits that scale with player count, bonuses added by choice, a visible adds-up check (legs + junk = pot). The "Split total: $X vs pot $Y ✓" line exists; the rest is the redesign. Zero-sum stays the tested invariant; worked-example sign-off before merge (money rule §2) | M | §5.bg part 3 |
| Merge-audit polish: loss-red leg results on the dark board | S | §5.ak |
| Merge-audit polish: "Sides / Match" as a category label | S | merge audit |
| Merge-audit polish: the `70, 30` position-split mini-DSL | S | merge audit |
| Merge-audit polish: three different renderings of course handicap | S | merge audit |
| Leaderboard shows front/back columns for a 9-hole game (redundant, not wrong) | S | roadmap #13 note |
| F-030 opt C: standings strip ON the scorecard (mini-leaderboard above the grid) — the deeper "captain glancing between shots" fix; composes with the built toggle; slot into the live-scoring session | S | F-030, §6b |
| F-060 follow-through: hub edit-teams parity for the build-method feedback (opt B — merging the rival triggers — lives with the structure design) | S | F-060 |
| Live scoring experience pass | M | §6 item 3 — Craig's named focus, never had its session |
| Offline / PWA resilience (`sw.js` exists, caches nothing — cart-path wifi) | M | §6 item 4; core to "continuing" |
| **Backups / JSON export** — the OTHER §5c item Craig kept in scope (per-game tokens, the first, are done); still not built. One "download everything as JSON" per table is the floor; matters more as friends' real money history accumulates | S–M | DECISIONS §3 / §5c |

## Bigger arcs (approved plans, each wants its own fresh session)

| Item | Size | Source |
|---|---|---|
| **Accounts / §5c hardening** (reshaped 2026-09-15, §5.bj — the audit + F-047…F-059 delivered the sharing/login polish; this row is what remains): revoke/rotate per-game tokens, real RLS under the settled §5.bi ownership model, and the F-049 remainder (tappable "Viewing as…"). Crossing into real accounts/auth is the §5c/F-002 trigger — pause for Craig there. | M–L | Craig 2026-09-10 + §5.bi/§5.bj |
| **Home screen & Event model** — P1 flag-gated read-only /home → stats/ledger → shared Event → flights | L | approved plan `.claude/plans/adaptive-squishing-locket.md` |
| **Team Competition engine** — N teams of size K within foursomes (4 pairs combined Stableford etc.) | L | approved 2026-08-03, plan `.claude/plans/tingly-petting-reddy.md` + memory `project_pool-team-competition-plan` |
| **Flight mode** — handicap flights/divisions competing separately | L | folded in as Phase 4 of the Home/Event plan |

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
- Per-group pot-split defaults (from F-044): `POOL_SPLIT_TABLE` is Craig's own history as a
  global table — a group could save its own usual splits instead; feeds the format library.
