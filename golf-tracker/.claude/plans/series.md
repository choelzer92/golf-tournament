# Series: a multi-day trip (bar #11), design note

Status: ALL QUESTIONS ANSWERED 2026-10-12 (§5.cu, §5.cv). On screen it's an **Event**; code says Series. Decided: §5.cr (the shape), §5.cf (seeded from the group, cumulative money
first), §5.cm (Run it back), §5.ck (Home by group). The questions marked **ASK** are Craig's call.

## 1. What a Series is

`Series { id, name, gameIds, sourceGroupId, rollup: 'money' | 'points' }`.
**DECIDED Q1 (§5.cu):** the member is a GAME, i.e. a round, never "a day". A day can hold two rounds
(36 holes), and one round can carry two games (§5.cp); each counts once. Columns are rounds,
grouped under their date, in an explicit `seq` order.
- Each round is an ORDINARY pool game. It can be any mode, N-way, and its teams can change daily.
- No engine change. Each day settles on its own engine, exactly as today.
- Cumulative money = per player, the sum of each day's `perPlayerNets` (the F-068 split,
  `stats-ledger.ts:336`). `rollupByPlayer` (l.199) already sums a set of `GameLedger`s, and
  `settleUp` (l.373) already turns rollups into who-pays-whom. The rollup is a filter plus
  existing functions. It's zero-sum because each day is.
- A player who sits a day out simply has no net that day. Their total is over the days they played.

## 2. Storage: **DECIDED A (§5.cu)**, `series {id, name, rollup, seq}` stamped on each game

| | A. Stamp it on the games (recommended) | B. A roster_groups row, `kind:'series'` | C. A new `series` table |
|---|---|---|---|
| Where | `PoolGame.series = {id, name, rollup}` inside each day's `data` blob | `defaults = {kind:'series', gameIds, rollup}` | `series(id, data jsonb)` |
| Migration | none | none | yes, on the live DB |
| Risk | lowest: no new row kind | every `kind !== 'format'` filter must exclude it, or a trip shows up as a player group (Home, the wizard, visibility) | a live schema change |
| Empty trip before day 1? | no. Creating a trip creates day 1 | yes | yes |
| Rename | rewrite each day's stamp | one row | one row |

With A, a Series is "the games that share `series.id`". Its order is by play date. Its visibility is
the union of its days' visibility (§5.cb): you see the trip if you can see a day.

## 3. Creating a trip from a group (§5.cf)

- **Q2 DECIDED: both.** "Start an event" on the group page (seeded from the group), AND an optional
  "Part of an event?" on the wizard's Review (No / New event: name / Add to: <event> · R<n>).
- Day 1 is the ordinary wizard: the group seed (players + the group's usual format) is what makes it
  "from the group's preferences". The course step lists the group's courses, most-played first
  (§5.cf 3; check it's built, BACKLOG).
- Review asks for the trip name ("Myrtle 2026") and stamps the game.
- **Q3 DECIDED:** "Start an event" REPLACES Home's legacy "Multi-round event" for new play;
  existing tournaments stay reachable and unchanged.

## 4. Adding a round (§5.cm)

- "Add a round" on any round's hub; it asks the date (default: the next day; same day for a 36-hole day) (organizer only). It's Run it back plus the series stamp: format
  locked in, players + course pre-filled (the course is most likely to change), today's GHIN index,
  same field keeps its teams + Rebalance. Round N+1 is just a new game in the series, `seq` = N+1.
- **Q4 DECIDED:** "+ Add round N" is on the event screen AND on every round hub of an event
  (organizer only, live or finished). Never on an ordinary game.

## 5. The rollup screen

`/series/[id]` (or a section on each day's hub, linking to it):
- a header with the trip name, days played, and the group;
- the table: player | Fri R1 | Sat R1 | Sat R2 | Sun R1 | **Total**, richest first (rounds under their date);
- settle up: one who-pays-whom list for the whole trip (`settleUp` over the totals). Per §5.cf,
  each day settles and the TRIP pays the sum at the end;
- each day links to its hub.
- **Q5 DECIDED:** TOTAL = finished rounds only (settle-up uses it). The live round's column and a
  second total are labelled **Projected**.

## 6. Home (§5.ck)

§5.ck isn't built yet (BACKLOG). With a Series, a group card's "latest game" becomes "the latest
trip" when its newest game is in a trip, and the Continue card on top links to the live day and its
trip. **Q6 DECIDED:** build §5.ck in this branch, with events in it from the start.

## 7. Points later (Ryder Cup)

`rollup: 'points'`: each day's Team → Match team points (§5.co) are summed per TEAM across days. That
needs the teams to stay fixed across the trip, which money doesn't. It isn't built now, and the
design doesn't block it: `rollup` is a field, and the rollup screen switches its columns on it.

## 8. Build order, after the answers

1. Goldens: a pure `seriesRollup(dayLedgers)`, 3 days with different fields and modes; per-player
   totals equal the sum of the day nets; zero-sum; a sat-out day; settle-up is balanced. Prove it can
   fail (§5.z).
2. Storage + the stamp on save; the sandbox seed `series-3-day`.
3. Next day.
4. The rollup screen.
5. Entry points (the group page / Home).
6. e2e: the 3-day trip persona walk (bar #11's measure).
