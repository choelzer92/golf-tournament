# Wizard redesign: game settings vs money settings

Craig: *"we need to make sure that the options are clear about what they are asking
… lets think about what makes the most UI sense here. This is where we will win and
lose users."* Plus: *"determine the feasibility/ease of separating game settings
from money settings, with all being easily configured and clear."*

## ⚠️ Read this first — the 44 games are evidence about ONE group

Craig, correctly:

> *"i dont want to base the entire app on these 44 games… certain users may want to
> use player index and not course handicap, or adjust their junk values, or possibly
> add other sorts of bonuses. we need to be able to configure this and store
> group/game versions within groups that people use, and have a baseline universal
> default to iterate off"*
>
> *"we shouldnt be super worried about hardcoding defaults, but we should make it so
> users can configure their own stuff per group once, and then have this editable in
> the future, or easily imported"*

**This reframes the whole document.** 44 games from one organizer is a sample of one
social circle — not evidence about golfers. The usage table below is useful for
exactly one thing: proving the settings **must** be configurable, because even
inside a single group the values are bimodal (30 games one recipe, 14 another).

So the design goal is **not** "pick better defaults." It is:

> **A universal baseline → overridden per group → overridden per game.
> Configure once, edit forever, import easily.**

Any setting Craig's group never touches (`handicapBasis`, `positionSplit`) is one
another group will live in. **Nothing gets removed or hard-coded** — things get
*relocated* and *relabeled*, and the per-group layer becomes the thing that makes
the wizard short.

**A correction to my own earlier draft:** I had a section proposing we change the
`strokeMethod` default to `off-the-low` because 43/43 games override it. That was
wrong twice over — it's already the wizard's default
(`pool/new/page.tsx:116`), and the "override" count was an artifact of comparing
against `PoolGame`'s type default rather than the wizard's. Section 5 below is
rewritten accordingly.

---

## 1. What your real games actually say — *about one group*

| Setting | Changed from default | Actual values used |
|---|---|---|
| `strokeMethod` | **43/43 (100%)** | `off-the-low` ×43 |
| `moneyMode` | 14/24 (58%) | match ×14, pot ×10 |
| `potSplit` | **20/44 (45%)** | 4 distinct splits |
| `entryPerPlayer` | 14/44 (31%) | $25 ×30, $30 ×14 |
| `handicapAllowance` | 14/44 (31%) | 100 ×30, 90 ×13, 85 ×1 |
| `ballSelection` | 14/44 (31%) | 1net+1gross ×30, 2-best-net ×14 |
| `junkValues` | 14/44 (32%) | only 2 variants ever |
| `useCaptains` | 6/22 (27%) | — |
| `handicapBasis` | **1/14 (7%)** | course ×13, index ×1 |
| `positionSplit` | **0/44 (0%)** | `[100]` every single time |

(The "changed from default" column compares against `PoolGame`'s type defaults, not
the wizard's — so treat it as "how much variety exists," not "how often someone
fought the UI.")

**What this legitimately tells us — and what it doesn't:**

1. **Even ONE group is bimodal.** 30 games use one recipe, 14 use another —
   different entry, allowance, ball selection, junk, and money mode. If a single
   circle needs two saved setups, a scaling app needs many. **Presets beat forms**,
   and the presets must be user-authored, not shipped by us.
2. **Low-variance settings are still load-bearing.** `handicapBasis` changed once
   and `positionSplit` never — in *this* group. Craig's point stands: another group
   plays entirely off player index, and another splits 70/30. These get
   **relocated, never removed**.
3. **Nothing here justifies changing a shipped default.** The sample is one social
   circle. Defaults stay as the *universal baseline*; per-group config is what
   personalizes them.

---

## 2. Feasibility of splitting game vs money: **easy, and the code is already split**

The concern separates cleanly along an existing line — *what decides who wins a
hole* vs *what decides who pays whom*:

| **Game settings** (scoring) | **Money settings** (settlement) |
|---|---|
| `handicapAllowance` | `moneyMode` (pot / match) |
| `strokeMethod` | `entryPerPlayer` |
| `handicapBasis` | `potSplit` |
| `ballSelection` | `positionSplit` |
| `gameMode` / `modeSettings` | `junkValues` |
| `holesPlaying`, `nineHandicapBasis` | `matchConfig` |

Verified in the engine — these are read by disjoint code paths:

- **Scoring** reads allowance/strokeMethod/basis (`buildHcapMap`, line 520) and
  `ballSelection` (`teamHoleScore`, line 1565).
- **Money** reads `potSplit`/`positionSplit` (`buildLeg`, 1597), `junkValues`
  (`computeJunk`, 1338), `matchConfig` (`computeMatchPayouts`).

`PoolGame` is a flat object, so **no type changes, no migration, no engine
changes** are needed. This is a pure presentation regrouping. **Low risk, high
clarity payoff.**

The one genuine coupling to respect: **money depends on the number of teams**
(`potSplit` fills in from team count), which is why money belongs *after* teams
are built, not before.

---

## 3. The clarity problem is as bad as the quantity problem

Craig's warning — *don't hide things we want to configure* — is the right check.
Hiding a badly-labeled control makes it worse: now it's jargon you can't find.

Current labels, and what they fail to say:

| Label today | Problem | Better |
|---|---|---|
| "Handicap Strokes: Full / Off the low" | Doesn't say what changes | **"Who gets strokes?"** → *Everyone their full handicap* / *Only strokes above the best player* |
| "Handicap Basis: Course / Player index" | Pure jargon; changed 7% of the time | **"Adjust for tee difficulty?"** → *Yes (recommended)* / *No, use raw index* |
| "Position Split: `100`" | Comma-separated percentages, in a text box. Never once changed. | **"Who gets paid?"** → *Winner takes all* / *Top 2 (70/30)* / *Custom* |
| "Team Ball Selection" | "1 Net + 1 Gross (different players)" is insider shorthand | **"Which scores count per hole?"** with a plain-words example |
| "Junk Values (points)" | "Junk" is jargon; "Group Hug" is undefined | **"Bonus points"** → birdie / eagle / albatross / everyone-pars / closest-to-pin |
| "Game Type: Pool / Head-to-head" | Fine, but buried below Game | Keep, promote |

**Rule to adopt:** every option is phrased as a **question a golfer would ask**,
with answers in plain words. No setting shows a value without saying what it does.

---

## 4. Proposed structure

### Step 1 — "What are you playing?" (3 controls, not 20)

```
Game name          [ Saturday Pool         ]
Game               [ Team Pool ▾           ]   ← the mode picker
Scoring            ( Pot split ) ( Head-to-head )
                                            [ Next: Course → ]
```

Everything else moves. Nothing is *hidden* — it's **relocated to where the
question makes sense**.

### Step 2-4 — Course → Field → Tees (unchanged)

### Step 5 — Teams (unchanged)

### Step 6 — "Money" (new dedicated step, replacing today's thin Create step)

This is where money genuinely belongs: the team count is known, so pot splits can
be computed and previewed.

```
HOW MUCH?        Buy-in  [ $25 ] / player      →  8 players = $200 pot
WHO GETS PAID?   ( Winner takes all )  ( Top 2 )  ( Custom )
SPLIT THE POT    Front $50  Back $50  Overall $50  Bonuses $50   [ Adjust ]
BONUS POINTS     Birdie 1 · Eagle 2 · Albatross 3 · All-par 1 · CTP 1   [ Adjust ]
                                            [ Create game ]
```

### Handicap settings → live on the **Tees** step

They're about *how strokes are computed*, which is exactly what the Tees step is
already about. Presented as two plain questions with the **data-corrected
defaults**:

```
Who gets strokes?        ( Full handicap )  ( ●  Only above the best player )
Adjust for tee difficulty?  ( ● Yes )  ( No — raw index )        [ recommended ]
```

### The recurring-game win

Games from a saved group already carry defaults (`GroupDefaults`). For those, both
the handicap block and the money step collapse to **one summary line + Change**:

> *Weekend Warriors usual: $25 · off the low · 90% · winner takes all* — **Change**

7 of 44 games currently come from a group. Making groups this valuable is how that
number goes up, and it's the mechanism behind "config is a one-time cost."

---


---

## 5. The three-layer config model (the actual design)

Craig: *"a baseline universal default to iterate off"* … *"configure their own stuff
per group once, and then have this editable in the future, or easily imported."*

```
   LAYER 1  UNIVERSAL BASELINE      shipped by us; a legal, sensible game
      ↓     (never removed, never group-specific)
   LAYER 2  GROUP DEFAULTS          "Weekend Warriors always plays…"
      ↓     configure ONCE, edit anytime
   LAYER 3  THIS GAME               tweak for today only; never writes back
                                     unless you say "save to group"
```

Each layer overrides the one above, and each is independently editable. The wizard
gets short not because options were hidden, but because **layer 2 already answered
most of the questions.**

### Most of this already exists

| Capability | Status |
|---|---|
| Every setting storable per group | ✅ `GroupDefaults` covers all of them |
| Applying group defaults to a new game | ✅ `applyGroupDefaults()` |
| Named reusable setups | ✅ Format Library (`kind: 'format'`) |
| Duplicate a setup to make a variant | ✅ `duplicateFormat()` |
| Share a setup with other organizers | ✅ `setFormatShared()` (owner = null) |
| Attach several formats to one group | ✅ `formatIds[]` |
| A group's setups editable later | ✅ via `upsertGroup` |

**So this is mostly a surfacing problem, not a building problem.** The mechanism is
built; the wizard just doesn't lead with it. Evidence: only **7 of 44** games were
created from a group.

### The real gaps

1. **No single named baseline.** Defaults are scattered as literals across
   `useState('25')`, `useState('100')`, `DEFAULT_JUNK_VALUES`, `DEFAULT_MATCH_CONFIG`.
   Should be one exported `UNIVERSAL_DEFAULTS: GroupDefaults` that the wizard, the
   group editor, and "reset to baseline" all read. Pure refactor, no behavior change.
2. **No "save these settings to my group" from a finished game.** You can save a
   *format*, but not push tweaks back to the group that spawned the game — so
   layer 2 never learns.
3. **No import/export of a setup.** Craig asked for "easily imported." A
   `GroupDefaults` is already JSON; it needs a share code or paste box. This is also
   the growth mechanism — one organizer's format spreading to another club.
4. **No provenance in the UI.** When a value came from a group, the wizard doesn't
   say so. It should: *"$25 — from Weekend Warriors"* with **Change for today** vs
   **Change for the group**. That distinction is the whole model made visible.
5. **Bonuses aren't extensible.** `PoolJunkValues` is a fixed 5 keys (birdie, eagle,
   albatross, groupHug, ctp). Craig: *"possibly add other sorts of bonuses."*
   Sandies, greenies, barkies, longest drive — all common, none expressible. This is
   the one item needing a real type change: a `Record<string, number>` of named
   bonuses alongside the fixed set, or a migration to an array of
   `{id, label, points}`. Worth designing separately.

---

## 6. Keep the interview — it's the right shape

Craig: *"i do like the process of setting up a game, and having the questions asked
to you regarding what you want to do."*

That settles a design question I'd left open. The step-by-step interview **stays** —
it should NOT collapse into one dense form. The fix isn't fewer steps; it's that
**each step asks one clear question**, and questions layer 2 has already answered
are shown as confirmations rather than blank fields.

Today's step 1 breaks the interview by asking ~12 questions at once. Compare:

**Now (one screen, 20 controls):**
> Game Name · Game · Game Type · Entry $ · Handicap Allowance % · Handicap Strokes ·
> Handicap Basis · Position Split · Junk×5 · Team Ball Selection

**Proposed (one question per screen, most pre-answered):**
```
1  What are you playing?        Team Pool ▾            (from group: Weekend Warriors)
2  Where?                       course search
3  Who's playing?               roster / group members
4  Which tees?                  per-player tees
   └ How are strokes figured?   ✓ Off the low · course handicap · 90%   [Change]
5  How are teams built?         captains + balance      [Change]
6  What's it worth?             $25 · winner takes all · $50 per leg    [Change]
                                                        [ Create game ]
```

Every `[Change]` opens the full control set for that question — nothing is
unreachable, and a first-time user with no group sees the questions expanded by
default instead of a summary.

**The principle:** a group's saved setup turns *questions* into *confirmations*.
That's how you get both halves of the north star — every option still configurable,
almost none of them asked twice.

---

## 7. Sequencing

| # | Change | Risk | Payoff |
|---|---|---|---|
| 1 | One exported `UNIVERSAL_DEFAULTS` | trivial | one place to reason about the baseline |
| 2 | Relabel options as plain questions (§3) | low | the clarity win; no logic change |
| 3 | Raise tap targets to 44px | trivial | 8 controls are ≤38px today |
| 4 | Show provenance + Change-for-today / Change-for-group | medium | makes the 3-layer model visible |
| 5 | Split money into its own step, after teams | medium | correct information order |
| 6 | Group defaults → summary-with-Change on each step | medium | **the interview payoff** |
| 7 | "Save these settings to my group" from a game | low | layer 2 finally learns |
| 8 | Import/export a setup (share code) | medium | growth mechanism |
| 9 | Extensible bonuses (sandies, greenies, …) | **needs design** | removes a real ceiling |

1-3 are safe and independently valuable. 4-7 deliver the interview. 8-9 are the
scale features — 9 needs a type decision before any code.

**Open question for Craig:** for a first-time user with **no group**, should the
wizard (a) expand every question inline, (b) offer "quick start" with baseline
defaults and one Review screen, or (c) walk them through building a group *first* so
layer 2 exists from the start? (c) is the most opinionated and possibly the best
onboarding, but it puts setup before their first game.
