# Game-structure simplification — design proposal (v1, 2026-09-15)

**Status: DEEP PLAN WRITTEN 2026-09-15 — `.claude/plans/game-structure-collapse-plan.md`
(seam inventory, data-model map, routing table, risk list, live-scoring design-space
comparison, ASCII mocks, phase plan, 5 questions). Craig walks it before any code.
Sweep evidence: `.claude/plans/collapse-sweeps-2026-09-15.md`.**

**The plan's core:** the collapse is a ROUTING LAYER at game creation. `teams[]` is always
the tee sheet; whether the money teams coincide with it (derived, never asked) plus the
money model choose the container. Storage, both engines, both leaderboards, share links
and live scoring are untouched in Phase 1. Live scoring is evaluated separately (§5.bl):
today two phones on one foursome silently overwrite each other; the recommended best case
is per-cell score rows, with two small interim fixes first — all persistence changes,
Craig's call.

## Craig's answers (2026-09-15)

1. **Wording:** "How do you want to compete?"
2. **Fresh-game default:** fit-based by field size (8+ → foursome-vs-foursome shape,
   4–7 → two teams, 2–3 → everyone for themselves); every fitting option always listed;
   a saved format/group default skips the step (confirmation + Change).
3. **Pool vs sides: COLLAPSE THEM.** When shown the actual differences (teams=foursomes
   + pot vs independent teams + head-to-head), Craig's reaction was "I really don't
   understand the difference" — the strongest evidence the split is implementation
   history, not user-meaningful structure. Step 2 offers "N teams of K"; the money step
   (pot vs head-to-head — already exists as F-042's toggle) and the teams step (do
   teams align with foursomes?) route to the right machinery invisibly.
4. **Phasing:** collapse is the goal AND a recognized risk — "we need to deeply plan
   how this works, and make sure there aren't any other issues that come out of it."
   No interim two-option step (avoids teaching vocabulary that would change, §5.at).

## Why the collapse is risky (the honest list)

The two containers differ in code, not concept: pool teams carry `matchupId`
(partitioned live scoring — §5l depends on it), sides live in `GameSide[]` separate
from tee groups (F-019), and the two money engines (pot split vs pairwise margins,
§5.ae/§5.ad) are both correct and never unified. Every shared surface branches on the
container (the "one rule that prevents most bugs" in AGENTS.md). Collapsing the
QUESTION means routing every seam by the money/teams answers instead of the picker.
The planning session must inventory those seams (UI_MODE_AUDIT grep probes), map both
data models field by field, define the routing rules, and pin the money engines with
tests before anything moves.

## The problem, in Craig's own words

- "How would I run 4v4 if it's not a pool? I'm confused at why I can only choose pools."
- "Once I've chosen a player pool, I should be able to choose how many teams — like two
  different 2v2 best balls between 8 players."
- "A pool is effectively just a 4v4 game… choose your groups, your game style, your
  players, how many teams, and go."
- "I figured out the 2v2 game, but it's not clear to me."

Findings F-033, F-037, F-041, F-042 and F-060 are all symptoms of one conflation: **a
"game mode" bundles three different questions into one picker choice** —

1. **STRUCTURE** — who competes against whom (everyone solo? 2 teams? 4 pairs? foursomes
   vs foursomes?)
2. **SCORING** — how a hole is won (stroke, Stableford, skins, match, quota…)
3. **MONEY** — what it pays (pot, per-leg match, per-point…)

The wizard asks "Which game are you playing?" and the answer secretly decides all three.
That's why 2v2 was unfindable (it's structure, but it lives behind a mode named
"Sides / Match"), why Stableford looked "refused" at 8 players (it's scoring, but the
picker treats it as a structure that maxes at 4), and why the money toggle confused
("who competes against whom" is a structure question asked on the money screen).

## What already exists (this is mostly a REFRAME, not a rebuild)

| Piece | State |
|---|---|
| Field asked first (§5.au) | BUILT |
| N sides of any size, engine + storage + leaderboard (F-006) | BUILT |
| Side-shape chooser: 8 → [4,4], [2,2,2,2] etc. (F-020) | BUILT |
| Playing groups independent of sides (F-019) | BUILT |
| Classic pool container (foursome vs foursome, matchups) | BUILT |
| Individual modes (skins, Stableford, quota, Nines, Wolf…) | BUILT |
| Saved formats / group defaults as shortcuts (§5.av–aw) | BUILT |
| N teams of size K *within* foursomes (§5g Team Competition engine) | approved plan, NOT built |
| Independent pairings (two separate 2v2s in one game) (F-037) | not designed |

## The proposed flow

Today: `Field → Game (mode picker, defaults Pool) → Course → Tees → structure step → Money`

Proposed: **the structure question comes right after the field, sized to the field**, and
the game picker becomes a *scoring* picker filtered to what fits.

```
Step 1 — Who's playing?              (unchanged: groups lead, then the field)

Step 2 — How do you want to compete?          [8 players selected]
  ┌────────────────────────────────────────────────────┐
  │ ◉ Two teams of 4          e.g. 4 v 4 best ball     │
  │ ○ Four pairs              e.g. 2v2v2v2, all compete│
  │ ○ Foursome vs foursome    the classic pool         │
  │ ○ Everyone for themselves skins, Stableford, quota │
  │ ○ Two separate 2v2 matches       (phase 3 — F-037) │
  └────────────────────────────────────────────────────┘
  The options and their examples are GENERATED from the
  player count (the F-020 shape math already does this).
  A saved format or group default SKIPS this step — it
  arrives answered, shown as a confirmation line.

Step 3 — How is it scored?           (the old picker, now filtered:
  structure = teams  → best ball / combined / scramble / alt-shot,
                       stroke or Stableford basis
  structure = solo   → skins / Stableford / quota / Nines / Wolf / low total
  structure = pool   → 1-net-1-gross etc., the classic settings)

Steps 4–6 — Course → Tees → (teams/groups as today) → What's it worth?
  The money step loses the "Who competes against whom?" toggle —
  structure already answered it in step 2. Money only asks amounts.
```

**Modes become shortcuts, not gates.** "Wolf" or "JY Classic Pool" in a format list jumps
straight through steps 2–3 with both answered. Craig's sentence — *"choose your groups,
your game style, your players, how many teams, and go"* — becomes literally the step order.

## Phasing (each independently shippable)

- **Phase 1 — the reframe.** Wizard-only: insert the structure step, filter the scoring
  picker by structure, remove the money-step toggle (F-042's "move after teams" idea,
  resolved by moving it *before*). Everything maps onto EXISTING modes — `team-2v2`
  carries teams-structures, the classic pool carries pool-structure, individual modes
  carry solo. No engine or storage change; e2e asserts every old flow still reachable.
- **Phase 2 — the §5g engine.** "Four pairs, combined Stableford, all compete" for
  N-teams-of-K *within* the pool container (the approved Team Competition plan slots in
  here as the structure options it always wanted to be).
- **Phase 3 — pairings (F-037).** "Two separate 2v2 matches" — one game, one share link,
  one recap, two independent settlements. Needs the settlement-partition design.

## Questions for Craig (react to any/all)

1. **Step-2 wording.** "How do you want to compete?" vs "Teams or every man for
   himself?" vs something in your group's vocabulary?
2. **Defaults per field size.** 8 players → default "Foursome vs foursome" (your usual)
   or "Two teams of 4"? 4 players → default 2v2 or solo? (Your real games say pool at 8+,
   but a saved group/format usually decides this anyway.)
3. **Does the classic pool stay a distinct structure option** ("Foursome vs foursome")
   or is it presented as "Two teams of 4 (in separate foursomes)"? Distinct is honest —
   its money/matchup machinery differs — but "a pool is just a 4v4 game" argues for
   merging the LANGUAGE even if the machinery stays.
4. **Phase 1 alone worth shipping?** It changes no capability, only findability. My
   read: yes — every confusion report this month was findability, not capability.
