# Groups and multi-day events — thinking it through

Craig: *"I think group set up makes sense, but i want to think through how the groups
work, how a user could have multiple groups, and what that would look like. Also, if
someone is doing a multi day tournament, how does this work?"*

Design thinking, not a proposal to build. Grounded in what the code does today.

---

## Part 1 — Groups

### What exists today

```ts
interface RosterGroup {
  id: string;
  name: string;
  ownerGhin: number | null;    // null = shared "base" group; else scoped to one organizer
  playerIds: string[];         // -> roster `players` rows
  defaults: GroupDefaults | null;   // every game + money setting, optional
}
```

Facts worth knowing before designing anything:

- **Multiple groups already work.** `ownerGhin` scopes them per organizer, and
  `getGroups()` returns all of a viewer's. Craig's data has 2 (Weekend Warriors,
  Tuesday Crew) plus a saved format.
- **Groups are flat.** No nesting, no parent/child.
- **A group is three things at once:** a *roster subset*, a *settings preset*, and
  (via `formatIds`) *a list of playable formats*.
- **Players are shared, not owned.** `playerIds` point at roster rows, so one player
  appears in many groups with one handicap. That's the right call and shouldn't change.
- **Groups are already the ledger's grouping key** — `gameBelongsToGroup()` uses an
  exact `sourceGroupId` tag, falling back to player-majority overlap for older games.

### The conceptual problem: a group is overloaded

"Weekend Warriors" answers three different questions:

| Question | Today's answer |
|---|---|
| *Who plays?* | `playerIds` |
| *How do we play?* | `defaults` |
| *What games do we play?* | `defaults.formatIds` |

That works while the answers line up 1:1. It strains when they don't:

- One roster, several formats — Warriors play a pot pool most weeks, a 2v2 sometimes.
  **Already handled** by `formatIds[]`.
- Several rosters, one format — "the usual game" played with different people.
  **Already handled**, since formats are separate rows.
- **Overlapping rosters** — Tuesday Crew is 8 of the Warriors' 61. Today that's two
  independent lists, and adding a player to both is manual. This is the real gap.

### What multiple groups should look like

The mental model that fits how people actually organize golf:

```
MY PEOPLE          one roster of everyone you've ever played with (exists: `players`)
   │
   ├── GROUP  "Weekend Warriors"   61 people · usual game: pot pool $25
   │      └── formats: [Pot Pool, 2v2 Best Ball, Skins Day]
   │
   ├── GROUP  "Tuesday Crew"        8 people · usual game: head-to-head match
   │      └── formats: [Match Play]
   │
   └── GROUP  "Buddies Trip 2026"  16 people · multi-day event roster
          └── formats: [Ryder Cup, Best Ball, Scramble]
```

Design principles I'd argue for:

1. **A group is a starting point, never a constraint.** Picking a group pre-fills the
   field and settings; you can still add a guest or change anything for that game.
   (True today — `applyGroupDefaults` seeds, doesn't lock.)
2. **Groups may overlap freely.** Adding someone to Tuesday Crew must not remove them
   from Warriors. Also true today, but the *UI* doesn't make it obvious.
3. **One group is "usual."** With several groups, most users have a default. A
   `lastUsedGroupId` or an explicit pin removes a tap from every game.
4. **Group membership should be derivable from play.** After a game, "add these 3
   guests to Weekend Warriors?" — the group learns instead of being maintained.
5. **Don't nest groups.** Tuesday Crew ⊂ Warriors is tempting, but nesting brings
   inheritance questions (whose defaults win?) for little gain. Overlapping flat
   lists are simpler and already supported. **A sub-group is better expressed as a
   flight or a tee-time within one event** (see Part 2).

### Gaps to close for multiple groups (in order)

| Gap | Why it matters | Size |
|---|---|---|
| No group picker on the wizard's first step | Groups are the whole point of layer 2, yet only **7 of 44** games used one | small |
| No "usual group" / last-used | With 2+ groups it's a tap every time | small |
| Adding a player to 2 groups is manual | Overlapping rosters are the normal case | small |
| No "save settings back to group" | Layer 2 never learns (also in `WIZARD_REDESIGN.md`) | small |
| No import/export of a group's setup | Craig asked for it; also the growth mechanism | medium |
| No group-level history view | `/home/groups/[id]` exists but shows members, not "our last 10 games" | medium |

---

## Part 2 — Multi-day events

### What exists today: two separate, non-overlapping systems

| | **Pool game** (`PoolGame`) | **Tournament** (`Tournament`) |
|---|---|---|
| Duration | **single round, single day** | **multi-round, multi-day** (`rounds[]`, `dayLabel`) |
| Teams | N foursomes, any count | **exactly two** — `teams: [Team, Team]` |
| Per-round course | one course | **each round has its own** `course` |
| Per-round settings | n/a | each round carries format, allowance, tees |
| Money | pot / match / mode-specific | Nassau + side games |
| Game modes | 7 pluggable modes | none — its own format system |

So the honest answer to *"how does a multi-day tournament work?"*:

- **A Ryder-Cup-style two-team event over several days: already fully supported.**
  Rounds carry their own course, day label, format, and handicap config. That's the
  `Tournament` type, and it works.
- **A multi-day POOL — e.g. a 16-person buddies trip playing a money pool for three
  days — is not supported at all.** `PoolGame` has no concept of a series. You'd
  create three unrelated games and reconcile the money by hand.

That second case is, I'd guess, the more common trip format — and it's the gap.

### Why this matters for the north star

A buddies trip is the **highest-value "continuing" scenario in golf**: multi-day,
running money, standings that build. It's also when people care most about an app
tracking it, and when handing over $40 at the end actually gets argued about.

### Three ways to support a multi-day pool

**Option A — Series: a thin wrapper over existing games**

```ts
interface GameSeries {
  id: string;
  name: string;              // "Buddies Trip 2026"
  gameIds: string[];         // existing PoolGame ids, in order
  sourceGroupId?: string;
  carryStandings: boolean;   // cumulative money/points across days
}
```

Each day stays an independent `PoolGame` — unchanged engine, unchanged scoring. The
series only aggregates. Cheapest by far, and it composes with all 7 game modes: day 1
a pot pool, day 2 a 2v2, day 3 skins.

*Cost:* a new type + a rollup view. *Risk:* low — nothing existing changes.
*Weakness:* no cross-day format like "best 2 of 3 rounds count."

**Option B — Give `PoolGame` rounds, mirroring `Tournament`**

Add `rounds[]` to `PoolGame`. Structurally consistent with tournaments, but it
touches the money engine, the leaderboard, and the completion gate — everything
currently assumes one round of holes. High risk against working money code.

**Option C — The shared Event model (already planned)**

My memory notes an approved-but-unbuilt plan: a common `Event` model spanning pool
and tournament, with flights as a later phase. That's the *correct* long-term
architecture and would make multi-day uniform across both systems. It's also the
largest change, and it would touch code that currently handles real money.

### Recommendation

**A, then C.** A Series wrapper gets multi-day pools working without touching the
money engine, and it doubles as a discovery mechanism: what people actually do with
a series tells you what the Event model should look like before you commit to it.

Two things a Series needs to get right from day one:

1. **Cumulative money is the point.** "Craig is +$65 over three days" is the whole
   reason someone wants this. `stats-ledger.ts` already computes per-player nets
   across games — a series rollup is largely `rollupByPlayer()` scoped to
   `gameIds`, so most of it exists.
2. **Teams change daily.** Trips re-draw partners each day. A series must NOT assume
   fixed teams — which is another argument for A over B, since each day's `PoolGame`
   already owns its own teams.

### And the group connection

A trip roster **is** a group: `Buddies Trip 2026` with 16 players and its formats
attached. So Series and Groups compose naturally —

> pick the group → create a series → each day inherits the group's defaults → money
> rolls up across the trip → the ledger shows the trip as one line.

That's the two halves of this conversation meeting: groups make each day
zero-config, and the series makes the trip a single thing.

---

## Open questions for Craig

1. **Multi-day pool: real need or hypothetical?** Do you and your friends do trips
   where a money pool runs several days? That decides whether Series is next or later.
2. **Cross-day formats?** Is "best 2 of 3 days count" a thing you'd want, or is
   cumulative money enough? Cumulative-only is much simpler.
3. **`teams: [Team, Team]`** — is the two-team limit ever a problem for your
   tournaments? Three-team Ryder Cup formats exist, and this is hard-typed.
4. **Group picker placement:** first thing in the wizard (before the game name), or
   a step of its own? First-thing is fewer taps; its own step fits the interview
   shape you said you liked.
5. **Should a group be able to own its own courses?** A club group plays the same
   2–3 courses; pre-loading them would remove the course-search step entirely.
