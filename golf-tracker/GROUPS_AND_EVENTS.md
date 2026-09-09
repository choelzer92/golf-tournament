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

### A group bundling people + settings + formats is CORRECT

I first wrote this up as a group being "overloaded" — three responsibilities in one
object. Craig corrected that:

> *"When an organizer looks at making a game, they click the group and then make a
> game from that group, and the formats people play are based typically on the group,
> not just random."*

He's right, and the correction matters. A group holding all three answers isn't a
smell — **it's the domain model**:

| Question | Where it lives | Why bundling is right |
|---|---|---|
| *Who plays?* | `playerIds` | — |
| *How do we play?* | `defaults` | a group's stakes and handicap rules are group traits |
| *What games do we play?* | `defaults.formatIds` | **formats belong to a group** — the Warriors' repertoire isn't a global list |

This is how golf is actually organized: a standing group has its people, its stakes,
and its handful of games. So the flow is exactly what Craig described —

```
pick the group  →  create a game from it  →  choose from THAT GROUP'S formats
```

Consequences for the design:

1. **The group picker belongs first**, before the game name. It's the highest-value
   control in the wizard because it answers three questions at once.
2. **The format list shown must be the group's**, not the global registry. A Warriors
   game offers Warriors formats; "something else" is an escape hatch, not the default.
3. **Nothing needs restructuring.** `formatIds[]` already models this. The gap is
   purely that the wizard doesn't lead with it — which is why only 7 of 44 games were
   created from a group.

### Overlap is normal and already works — not a gap

Craig: *"adding someone to a group isnt that big of a deal, a group is just (these
are the people that play in this group). I play in multiple 'groups' here anyways."*

I'd written this up as "the real gap." It isn't. A group is simply the set of people
who play in it, overlap between groups is the normal state of golf, and one person
being in several groups is the expected case — not an edge case to engineer around.

It already works correctly: `playerIds` are references to roster rows, so a player
sits in any number of groups carrying one handicap. Nothing to build.

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
2. **Groups overlap freely, and that's unremarkable.** A group is just the people who
   play in it; being in several is normal. Already true and already correct.
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

### Craig's framing: it's a question in the interview

> *"i think there would be multi day money pools perhaps, but i think thats where the
> selection of one day round, or multi day round comes in to play."*

This is better than treating multi-day as a separate feature to bolt on. It becomes
**one early question in the wizard**, which fits the interview shape he already said
he likes:

```
1  Which group?          Weekend Warriors ▾
2  How long?             ( ● One round )   ( Multi-day )
3  What are you playing?  …from this group's formats
```

Answering "One round" gives today's flow, unchanged. Answering "Multi-day" asks how
many days and then repeats the course/format questions per day — reusing the same
questions rather than inventing a second wizard.

Why this framing is the right one:

- **It's a fork in one interview, not a separate product.** No "tournament vs pool"
  decision forced on the user; they just say how long they're playing.
- **It sets the expectation early**, when it's cheap. Discovering on day 2 that you
  needed a series is the bad outcome.
- **It reuses every downstream question.** Course, field, tees, teams, money are the
  same questions — asked once for a single round, or per day for a series.
- **Most users pick "One round" and never see the rest.** Depth costs nothing until
  asked for, which is the north star's whole mechanism.

Note the asymmetry worth designing around: a trip usually keeps **one roster** for
the whole event but **re-draws teams and changes course each day**. So the series
should ask group/field once, and course/teams/format per day.

### Recommendation

**Option A (Series), surfaced as the "how long?" question.** A thin wrapper needs no
changes to the money engine, composes with all 7 game modes, and keeps each day's
teams independent — which matters precisely because trips re-draw partners daily.

Sequencing: build the "how long?" fork and the series rollup, then let real trip usage
tell us whether the full Event model (Option C) is worth it.

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
