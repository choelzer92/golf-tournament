# Scaling the harness to the whole app

**The honest starting point:** the app has **31 routes**. The harness currently
seeds and verifies **2** (`/pool/[id]`, `/pool/[id]/leaderboard`). Groups, stats,
the wizard, tournaments, solo rounds, the roster, and every printable are
unverified.

The good news is that this is a **data-coverage problem, not an architecture
problem** — and that's worth establishing before doing more work.

---

## Why it generalizes

Every page in the app reads through the same 5 lib files, which touch the same 6
tables — all of which `src/test/fake-supabase.ts` already implements:

| Table | Feeds | Fake support |
|---|---|---|
| `pool_games` | pool hub, leaderboard, scorecards, teams | ✅ seeded |
| `game_scores` | every scoring surface | ✅ seeded |
| `players` | roster, wizard field step, groups | ✅ implemented, **not seeded** |
| `roster_groups` | Groups tab, saved formats, wizard seeding | ✅ implemented, **not seeded** |
| `tournaments` | all 10 tournament routes | ✅ implemented, **not seeded** |
| `solo_rounds` | solo shot log + summary | ✅ implemented, **not seeded** |

So extending coverage means **writing fixture builders, not changing the harness**.
`/home/stats` needs `buildGameLedgers` fed with *completed* pool games and
tournaments; `/home/groups/[id]` needs `players` + `roster_groups`. Both already
work through the fake — nothing new to build underneath.

**This is a direct consequence of the architecture worth preserving** (see
`AGENTS.md`): persistence is contained in 5 files, and the compute layer is pure.
Had pages talked to Supabase directly, none of this would scale.

---

## What "scaling" actually requires

Three things, in order. Each is independently useful.

### 1. Fixture builders per domain (the unlock)

One file per domain, mirroring `src/test/fixtures.ts`:

- `fixtures/roster.ts` — players + groups, incl. a realistic 60-member standing
  group (Craig's "Weekend Warriors" is 61, and list UIs behave differently at
  scale than at 4)
- `fixtures/tournament.ts` — a multi-round event with matchups, bonuses, side
  games; states: setup / mid-round / all-rounds-complete
- `fixtures/ledger.ts` — several **completed** games across weeks so `/home/stats`
  and the settle-up math have something real to roll up
- `fixtures/solo.ts` — a shot-logged round

**Why this is the unlock:** `/home/stats` is currently impossible to critique
because it renders an empty state without completed games — which is exactly the
bug we fixed. Seeded ledger data is the only way to see whether that screen is any
good.

### 2. A scenario matrix, not a scenario list

Six hand-written scenarios don't scale to 31 routes. The dimensions that actually
change behavior:

| Dimension | Values |
|---|---|
| Game type | classic pool · 2v2 · individual modes · Wolf · tournament · solo |
| Progress | not started · mid-round · complete · closed out |
| Field size | 2 · 3 · 4 · 8 · 20+ players |
| Holes | 18 · front 9 · back 9 |
| Money | pot · match · Nassau · per-point · none |
| Viewer | owner (`full`) · share-link guest (`pool`) |
| Viewport | phone 390px · desktop |

Generate scenarios from combinations rather than enumerating them. **Viewer role
matters most and is completely unverified today** — a share-link guest sees a
different app (`isPoolAllowedPath`), and every test so far has run as owner.

### 3. Per-route critique passes

Run the `UI_CRITIQUE_PROCESS.md` loop over routes in priority order, appending to
`FINDINGS.md`. Suggested order, by north-star weight:

| Priority | Route(s) | Phase | Why |
|---|---|---|---|
| 1 | `/pool/new` (wizard) | start | The parking-lot critical path Craig named next |
| 2 | `/game/play` | track | Most-used screen in the app |
| 3 | `/home/stats`, `/home/groups/[id]`, `/home` | continue | The neglected phase; stats was fully broken until yesterday |
| 4 | `/pool`, `/pool/[id]` | continue | Re-entry: finding and resuming a game |
| 5 | `/pool/formats`, `/pool/roster` | start | Reuse — what makes the 2nd game fast |
| 6 | tournament routes (10) | all | Largest unverified surface |
| 7 | `/solo/*` | track | Flag-gated, smaller audience |
| 8 | printables (`scorecards`, `teams`) | start | Print CSS, hard to verify headlessly |

---

## Groups and stats specifically

You asked about these two, and they're the sharpest example of why coverage
matters:

**`/home/stats`** is the payoff surface for the whole "continuing" thesis —
who-owes-whom across a season. It was **structurally dead until yesterday**
(nothing ever set `status:'completed'`, so `buildGameLedgers` always got an empty
array). It has therefore *never been looked at with real data in it*. The greedy
settle-up algorithm, the four lenses, the by-group inference — all unexercised.
That's the single biggest blind spot in the app.

**`/home/groups/[id]`** is the reuse mechanism that makes "minimum exposed
complexity" work — a saved group means the second game takes seconds. If adding a
member to a 60-person roster is slow or confusing, the north star's whole
"configuration is a one-time cost" claim fails.

Both are behind `HOME_V2 = false`, reachable only via the dashboard's "Try new
Home" button. Worth deciding whether that flag flips, but they should be verified
either way.

---

## What this does NOT fix

Stated plainly so the plan isn't oversold:

- **Persistence, RLS, realtime, multi-device merge** remain unverifiable here. The
  backend is a `Map`. `merge_game_scores` deliberately throws.
- **Print CSS** (`/pool/[id]/scorecards`) barely survives headless verification;
  it needs a real print preview.
- **Touch ergonomics, sunlight legibility, real-device rendering** need your eyes
  on a phone. I can measure tap targets and overflow; I can't feel a glove.
- **Taste.** I can flag convention violations and friction. What *your* golfers
  want is yours to judge — findings say so where it's taste.

---

## Suggested first step

Build `fixtures/ledger.ts` + `fixtures/roster.ts` and run the critique loop over
`/home/stats` and `/home/groups/[id]`. Rationale: it's the "continuing" phase
(Craig's stated priority and the weakest), it's the surface that was dead until
yesterday, and it proves the harness generalizes beyond pool games before we
invest in the other 29 routes.
