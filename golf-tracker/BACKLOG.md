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

Craig's feedback batch (2026-09-10), his words:

| Item | Size | Source |
|---|---|---|
| **Group tap selects ALL members** — "when i click a group, all players are checked. this makes it very tough to select 12 out of 61 or so players that are playing on a given day." Likely fix: a large group should load with members UNCHECKED (or ask), so the day's field is picked BY checking, not by unchecking ~49. Small groups (a 4-man crew) probably still want all-checked. | S–M | Craig 2026-09-10 |
| **Bring back the classic golf verbiage** — "i liked the verbiage before just off the low, not the basic explanation of what classic golf terms mean." The plain-language labels/explanations (e.g. "Only above the best player") should say **"Off the low"** etc. — golfers know the terms; explaining them reads as condescending. Sweep the wizard's handicap/scoring copy for other over-explained terms while there. | S | Craig 2026-09-10 |
| **My-groups page shows no players** — "when i look at my group on the my groups page, players dont show up. Lets investigate this later." NOT yet diagnosed. Note for the investigator: today's §5.au work did not touch `/home/groups/[id]` or `roster-groups.ts`, but check whether it reproduces on `main` before assuming pre-existing. | ? | Craig 2026-09-10 |

## Done recently

| Item | When |
|---|---|
| §5.av — saved formats are choices in the wizard's game picker (b69b665) | 2026-09-09 |
| §5.au — wizard reorder: field → game → course → tees → money (f08dd22) | 2026-09-10 |

## Waiting on Craig (not buildable until he acts)

| Item | What's needed |
|---|---|
| F-022 on-course verification | Spot-check 90% strokes vs the GHIN app (incl. an off-the-low game); screenshots if anything is off by one |
| F-023 part B (widen the GHIN ratings parse) | The real `GetCourseDetails` payload for The Meadows (Greenbrier, WV) — search it with the network tab open |
| Branch merge | `captains-deal-and-game-rename` review (§5.ab — his timing) |
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
