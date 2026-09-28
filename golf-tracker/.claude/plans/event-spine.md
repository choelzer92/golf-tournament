# Event spine (Home/Event plan, Phase 3): DESIGN, awaiting Craig's approval

Status: **slice 1 APPROVED 2026-09-27 (§5.bu), not built yet.** Legacy owner-less
tournaments stay visible to everyone (§4 option A). S2 onward each still need their own
OK (§2): they touch persistence and scoring. P1 (`/home` hub) and P2
(`/home/stats` ledger) are already built, and `HOME_V2` has been on since 2026-08-12 (§5.bt).

## 1. What exists today (survey 2026-09-27)

| | **PoolGame** (`lib/pool-game.ts:163`) | **Tournament** (`lib/tournament-state.ts:194`) |
|---|---|---|
| Teams | `teams: PoolTeam[]`, any N; `sides?: GameSide[]` N-way inside a foursome | `teams: [Team, Team]` with literal ids `'team-a'`/`'team-b'` |
| Rounds | exactly one (implicit) | `rounds: TournamentRound[]`, each with its own course, format and matchups |
| Scores | `game_scores` keyed by `PoolTeam.matchupId` | `game_scores` keyed by `RoundMatchup.gameId`, the same table and helpers; merge RPC for split scoring |
| Engine | `computePoolResult` + `game-modes/*` (registry, N sides) | `live-scoring.ts` A/B functions. **Imports nothing from `game-modes/`** |
| Owner | `createdByGhin`; list filtered by `getPoolGameListForGhin` | **none, and no `createdAt`**. `/home`, `/dashboard` and `/home/stats` list every tournament to everyone |
| Row | `pool_games {id, data jsonb, updated_at}` | `tournaments {id, data jsonb, updated_at}` |
| Versioning | none; additive optional fields + read adapters (`sidesOfGame`, `formatOfGame`) | none; `sanitizeTournament` repairs on read |

**The surprise:** the pool is already the modern shape (N teams, the mode registry, an owner).
The tournament is the legacy one: two teams hard-coded through ~70 sites in
`tournament-state.ts`, ~53 in `live-scoring.ts`, ~40 across `money-games.ts`/`money-game.ts`,
and every tournament page (`game/play` alone has 104). So the spine is **"a tournament becomes
N pool-shaped rounds"**, not "a pool becomes a tournament."

Duplicated math between the two engines: the scramble/alt-shot team handicap
(`live-scoring.ts:232` ≈ `pool-game.ts:1631`), Stableford points (three copies), team-hole
formats (`getTeamNetForHole` ≈ `teamNetOnHole`), course-handicap / 9-hole logic, junk
(`computeJunkForMatchup`), and stroke allocation. Stroke allocation already disagrees → **F-098**.

## 2. Target shape (where the slices lead; not all of it gets built)

```
Event { id, name, createdByGhin, createdAt, sourceGroupId?, roster: Player[],
        rounds: EventRound[] }                       // pool = an Event with one round
EventRound { course, holesPlaying, teams: PoolTeam[] (N, per round), gameMode,
             modeSettings, money…, matchups keyed into game_scores }
```

`game_scores` is shared already, so the scores never move. One engine, `game-modes/`, scores
every round. The event rolls rounds up (points or money) with a pure `computeStandings(event)`
that returns a per-team map instead of `teamAPoints`/`teamBPoints`.

## 3. (a) The smallest reversible first slice: recommended

**Slice 1: tournament owner + an N-way read adapter. No stored shape changes, and Pool is
untouched.**

1. **Owner, writers first (§5.be).** `Tournament.createdByGhin?` and `createdAt?` are set when a
   tournament is created (`/tournament/new`, `/game/new`, `/money-game`). Readers filter only
   when the field is present. An owner-less legacy row keeps today's visibility, so nothing
   the friends see changes.
2. **`teamsOf(tournament): Team[]`** plus **`computeStandingsN(tournament): Map<teamId, points>`**
   in pure lib code. The existing `computeStandings` becomes a 2-team wrapper over it, pinned by
   goldens taken from today's output first (§5.z, mutation-proven). Pages keep calling the old
   function, so no UI moves.
3. Unit tests, and zero-sum/total-conservation checks on points. No e2e is needed because
   nothing on screen changes.

Why this slice: it is purely additive (optional fields, a new pure function and a wrapper),
reverting it is one commit, and live rows are never rewritten. It also opens both follow-ons:
the owner scopes `/home` and the ledger (the §5.h group-scoped money rule), and the adapter
is the seam that N-way tournament writes go through later.

**Slices after it, each approved separately:**
- **S2**: tournament rounds are scored through `game-modes/` (engine convergence), goldens
  first. Every tournament A/B function is compared against the registry on a corpus of
  sandbox + exported live tournaments (read-only from `backups/`) until they agree. F-098
  gets decided before or during this.
- **S3**: N-way tournament writes behind a flag. `/tournament/new` offers 3+ teams, the
  tournament pages render from `teamsOf`, and `RoundMatchup.teamAPlayerIds/teamBPlayerIds`
  gets a `sides` adapter the way `subTeams` → `sides` did.
- **S4**: the Event type. A pool is created as an Event with one round, behind a read adapter
  (`eventOf(poolGame)`), and multi-day pool is "add a round." This is the "How long? One
  round / Multi-day" wizard question from `GROUPS_AND_EVENTS.md`.
- **P4**: flights on the event's roster (the course/club workflow).

## 4. (b) Migration story for the live rows

- **No backfill in any slice.** Following the precedent (`subTeams`→`sides`,
  `ballSelection`→`teamFormat`), old shapes are read through pure adapters, and writers only
  write the new optional fields. A live row is never rewritten just to change its shape.
- **The owner of a legacy tournament** is the one real choice. Options: **A** owner-less rows
  stay visible to everyone, as today (safest, and the default in slice 1); **B** owner-less
  rows are visible to the app owner only (`isAppOwner()`, §5.bi); **C** a one-off, separately
  approved backfill (§5.be) that sets `createdByGhin` from the players in each tournament.
  → **Craig's call.**
- Before any slice that writes a new shape, `scripts/export-backup.mjs` takes a read-only
  snapshot of both tables into `backups/`. That makes it reversible even for data.
- `importTournament`/`exportTournament` JSON keeps accepting the 2-team shape forever, through
  the adapter.

## 5. (c) Which pool-only pieces go app-wide

| Piece | Today | Recommendation |
|---|---|---|
| **Roster** (`players`) | already shared; `/tournament/new` pulls from it | stays app-wide as is |
| **Groups** (`roster_groups`) | tournaments carry `sourceGroupId`, but `GroupDefaults` is typed entirely from pool fields | **go app-wide in S1/S3**: a tournament created from a group is listed under it and its money counts in that group's ledger (§5.h) |
| **Formats** (`kind:'format'`) | pool-only | **stay per-round.** A format describes one round, and after S4 every event round IS a pool round, so formats go app-wide for free with no separate work |

## 6. Questions for Craig (asked outright, §5.bo)

1. Approve **slice 1** as scoped (owner + N-way read adapter, no UI change)?
2. Legacy owner-less tournaments: **A** everyone sees them (today) / **B** app owner only /
   **C** backfill?
3. Groups app-wide for tournaments, and formats riding along with S4: agree?
4. F-098 (plus handicaps): does anyone in the circle carry a plus index? Is option A OK
   to schedule with S2?
