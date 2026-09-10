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

Craig's feedback batch (2026-09-10): ALL FOUR done on branch `live-feedback-2026-09-10`
(group tap, verbiage, feedback box, F-027 code fixes — see Done). Promoted next:

| Item | Size | Source |
|---|---|---|
| **Friend-feedback batch F-028…F-033** — promoted to NEXT_SESSION_PROMPT.md. Six findings triaged per §5.bf (one by one, not as fact): Stableford per-hole points display (F-028, engine already computes them), brighter stroke dots (F-029), scorecard↔leaderboard round-trip (F-030), to-par while playing Stableford (F-031), payout recap at Finish (F-032 — `settleUp()` exists, the MOMENT doesn't), 1v1/3-player discoverability (F-033 — modes mostly EXIST; verify the 2/3-player wizard walk). His gender-hole-handicap question is ANSWERED (built: `playerHoleStrokeIndex`) — tell him. | M | friend feedback 2026-09-10 |
| **Course-data correctness audit** (Craig 2026-09-10: "important that it works for all courses… The Meadows is a good test. Others too may have them typed in differently"). Extends F-023: GHIN courses aren't uniform — missing 'Total' ratings rows, differently-shaped tee/ratings payloads. Shape: (a) inventory every live game's course for missing/odd ratings via read-only queries; (b) harden the parse for the shapes found; (c) a diagnostic view (or log) that says WHAT the app extracted from a course so a wrong pull is visible, not silent. Part B still wants the real Meadows `GetCourseDetails` payload — or Craig logged in so a session can fetch it via the app's own API route. | M | Craig 2026-09-10 + F-023 |
| **Sharing/login/identity AUDIT** (Craig: "I want to get this polished"). Walk all four personas, screenshot, log findings, propose. Fold the group-management consolidation below into the same walk (same surfaces). | M | Craig 2026-09-10 |
| Merge-audit polish batch (all four S items below) — fallback if the audit runs short | S×4 | merge audit / §5.ak |
| **Consolidate group management on the NEW pages** (Craig 2026-09-10: "I don't know if this saved players and groups page is necessary… the new one should be the standard"). Overlap today: `/pool/roster`'s GroupsManager (dropdown + chips) duplicates `/home/groups/[id]` (dashboard + members + add). Shape: make /home the only group UI, keep /pool/roster for the PLAYER roster only (or fold that in too), rewire the three "Full roster manager"/"Manage" links. Needs a small design pass first — /pool/roster is also where groups are CREATED and where a `pool`-level share-link visitor lands (/home is full-only). | M | Craig 2026-09-10 |

## Done recently

| Item | When |
|---|---|
| **In-app feedback box** BUILT (065956f) — Craig OK'd with "easy to find, doesn't cover things up": header 💬 button (hub + /home), bottom sheet, `feedback_notes` migration WRITTEN BUT NOT APPLIED to live (Craig's step), `src/lib/feedback.ts`, `/home/feedback` read-back, 2 e2e | 2026-09-10 |
| **F-027 code fixes** (ca931fa) — Craig: "fix writers now, query later". Writers trim + fall back to `GHIN #…`; `upsertRosterPlayer` refuses to blank a stored name; group page renders `rosterDisplayName`; unit + e2e | 2026-09-10 |
| **F-027 live query** (Craig-authorized, read-only) — ZERO blank names in live `players` (83 rows, min name length 8): no backfill needed. Found instead: one dangling member id in "Friday Group" (deleted player still referenced) | 2026-09-10 |
| **feedback_notes migration APPLIED to live** (Craig-authorized; dry-run showed exactly the one migration; table verified present + empty) | 2026-09-10 |
| Group tap: >8 members loads UNCHECKED — field picked by checking (ddb3e95) | 2026-09-10 |
| Classic verbiage: wizard says "Off the low" / "Full handicap" (1b0b897) | 2026-09-10 |
| §5.av — saved formats are choices in the wizard's game picker (b69b665) | 2026-09-09 |
| §5.au — wizard reorder: field → game → course → tees → money (f08dd22) | 2026-09-10 |

## Waiting on Craig (not buildable until he acts)

| Item | What's needed |
|---|---|
| F-022 on-course verification | Spot-check 90% strokes vs the GHIN app (incl. an off-the-low game); screenshots if anything is off by one |
| F-023 part B (widen the GHIN ratings parse) | The real `GetCourseDetails` payload for The Meadows (Greenbrier, WV) — search it with the network tab open |
| Branch merge/deploy | The feedback_notes table is LIVE (migration applied 2026-09-10, Craig-authorized) but the 💬 button ships with this branch — notes can't arrive until the branch deploys |
| Branch merge | `live-feedback-2026-09-10` review (§5.ab — his timing; `captains-deal-and-game-rename` merged 2026-09-10) |
| §7 q4 | Confirm dark = live / light = setup is deliberate |

## Next few sessions (shaped, ready to build)

| Item | Size | Source |
|---|---|---|
| Merge-audit polish: loss-red leg results on the dark board | S | §5.ak |
| Merge-audit polish: "Sides / Match" as a category label | S | merge audit |
| Merge-audit polish: the `70, 30` position-split mini-DSL | S | merge audit |
| Merge-audit polish: three different renderings of course handicap | S | merge audit |
| Uncaptured walks: group format sheet (walk 2 stopped there), create-group mid-wizard, format-tap → confirmation | S | NEXT_SESSION_PROMPT history |
| Leaderboard shows front/back columns for a 9-hole game (redundant, not wrong) | S | roadmap #13 note |
| Live scoring experience pass | M | §6 item 3 — Craig's named focus, never had its session |
| Offline / PWA resilience (`sw.js` exists, caches nothing — cart-path wifi) | M | §6 item 4; core to "continuing" |

## Bigger arcs (approved plans, each wants its own fresh session)

| Item | Size | Source |
|---|---|---|
| **Sharing / login / identity polish** (Craig 2026-09-10: "we should add better sharing/logins/everything… I want to get this polished"). START WITH AN AUDIT SESSION (document-first): walk every entry path as each persona — owner via invite code, organizer via legacy `?key=` link, player via per-game token, returning visitor with expired 48h cookie or expired 12h GHIN token — screenshot each, log findings. Known rough edges to check: invite-code screen wording; the 48h cookie expiring mid-week (friends re-enter the code); GHIN re-login prompts; share panel copy/QR; "who am I" clarity for share-link players; sign-out scattering. The EXPERIENCE layer is product work and unblocked; if the shape turns into real accounts/auth, that's the §5c/F-002 trigger — pause for Craig there. Per-game tokens (built) + backups/export are the two §5c items already in scope. | L (audit M, then fixes) | Craig 2026-09-10 |
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
