# UI mode audit — harness + findings

A repeatable way to sweep the whole codebase for **subtle UI differences between
game types/setups**, plus the findings from the first pass (2026-08-10).

The app has grown two mostly-parallel presentation axes that were built at
different times, so drift between them is the default failure mode:

| Axis | Result type | Renderer | Entry |
|---|---|---|---|
| **team** (classic pool: N foursomes compete) | `PoolResult` (`kind:'team'`) | the top-level component in `pool/[id]/leaderboard/page.tsx` | `computePoolResult` |
| **single-group** (`individual` + `team-within-group`) | `IndividualResult` | `<IndividualLeaderboard>` in the *same* file | `mode.compute()` |
| **tournament** (2 teams, rounds/matchups) | `matchup.result` | `tournament/[id]/*` | `computeMatchPlayResult` / `computeStrokePlayResult` |

`isSingleGroupGame(game)` (`src/lib/game-modes/result.ts`) is the single branch
point. **Every** UI surface that renders a game must be checked on both sides of
it — that's what this audit does.

---

## The harness: surface × mode matrix

Walk each **surface** (row) against each **setup** (column) and record what
renders. Anything that differs without a *deliberate* reason is a finding.

### Setups to test (columns)

1. Classic pool, `moneyMode: 'pot'`, 4 foursomes
2. Classic pool, `moneyMode: 'match'`, exactly 2 foursomes ("4v4")
3. Classic pool, 9-hole (`holesPlaying: 'front9' | 'back9'`)
4. `team-2v2`, format `best-ball` (per-player entry)
5. `team-2v2`, format `scramble` / `alternate-shot` (one-ball entry)
6. `team-2v2`, `result: 'match'` vs `'total'`
7. `team-2v2` on a nine (leg collapse path)
8. Individual: `nines`, `skins`, `stableford-individual`, `quota`, `low-total`
9. Individual with **2 or 3 players** (several modes allow `playersMin: 2`)
10. `wolf` (decision input + `holesWon` expandable rows)
11. Nassau money model on (`nassauLegs`), junk layer on (`junkLines`)
12. Tournament round; tournament side game
13. Solo round

### Surfaces to check (rows)

- `/pool` list item — `src/app/pool/page.tsx`
- `/pool/[id]` header + "Foursomes" section — `src/app/pool/[id]/page.tsx`
- `/pool/[id]` `GameSettingsEditor` / `MoneySummary` / `FoursomeCard`
- `/pool/[id]/leaderboard` — **both** branches
- `/pool/[id]/teams`, `/pool/[id]/scorecards`
- `/game/play` — header, team labels, `PoolOverviewPanel`, Finish Game
- `/home`, `/home/stats`, `/dashboard`
- `/tournament/[id]` + `scoreboard` / `money` / `recap`

### Grep probes that reliably surface drift

```bash
# 1. Every branch on game category — each is a spot where the two axes can diverge
grep -rn "isSingleGroupGame\|isIndividualGame\|team-within-group\|category ===" src

# 2. Hardcoded player/team counts (should be derived from the game)
grep -rn "length >= 4\|length === 4\|=== 2 &&\|foursome" src --include=*.tsx

# 3. Money formatting — must be ONE helper, not per-file template literals
grep -rn '\$\${Math\|Math.round(.*net)\|Math.abs(Math.round' src --include=*.tsx

# 4. Name truncation — .split(' ')[0] is wrong for SIDE names ("Craig & Jym")
grep -rn "split(' ')\[0\]" src --include=*.tsx

# 5. Status writes — the lifecycle is only correct if these exist
grep -rn "status = 'completed'\|status: 'completed'" src

# 6. Hardcoded leg/nine captions vs the nine-collapse logic
grep -rn "Front · Back\|Front 9\|Overall 18" src
```

---

## Findings, first pass

Severity: **P1** = wrong data / dead feature · **P2** = visibly inconsistent ·
**P3** = cosmetic.

### P1 — `Finish Game` never completes a game, so `/home/stats` is always empty

`src/lib/stats-ledger.ts:169-170` selects the ledger's input by status:

```ts
const finishedPools    = poolGames.filter((g) => g.status === 'completed');
const finishedTourneys = tournaments.filter((t) => t.status === 'completed');
```

But **nothing in the codebase ever assigns `'completed'` to a `PoolGame.status`
or a `Tournament.status`.** The only write of that literal anywhere is
`round.status = 'completed'` (`src/app/game/play/page.tsx:2103`) — a *round*
inside a tournament, not the tournament itself:

```bash
$ grep -rn "status = 'completed'\|status: 'completed'" src
src/app/game/play/page.tsx:2103:              round.status = 'completed';
```

Both objects are created `status: 'active'` (`pool/new/page.tsx:336`,
`tournament/new/page.tsx:160`) and stay there forever. Consequences:

- `buildGameLedgers` always gets two empty arrays → `/home/stats` renders the
  "No finished games yet" empty state permanently. Same for the per-group ledger
  deep-link from `/home/groups/[id]`.
- The `completed` styling branches (`opacity-75`, the grey status pill) in
  `pool/page.tsx:116-122`, `home/page.tsx:245`, `dashboard/page.tsx:359-365` are
  unreachable dead code.
- `home/page.tsx:72-73` sorts finished games last — never fires.

For the **pool** path, `Finish Game` doesn't even try. It saves scores and
navigates away (`play/page.tsx:1886-1893`):

```ts
if (poolCtx) {
  saveGameScores(poolCtx.matchupId, scores);
  sessionStorage.removeItem('game_setup');
  sessionStorage.removeItem('game_pool_context');
  router.push(`/pool/${poolCtx.poolGameId}`);
  return;
}
```

Note this is also correct-by-design in one sense: one foursome finishing must not
complete a multi-foursome pool. So the fix is a real decision, not a one-liner:

- **Pool:** mark `status:'completed'` when *every* team's `matchupId` has a full
  set of scores (or add an explicit organizer "Close out game" action on the hub
  — there's already a `CtpEditor` "finalize surface" there to hang it off).
- **Tournament:** set `t.status = 'completed'` when
  `rounds.every(r => r.status === 'completed')` — the recap page already computes
  exactly that predicate at `tournament/[id]/recap/page.tsx:222`.

Worth deciding explicitly: whether the money/stats rollup should require
"completed" at all, or just score-complete. `hasMoney` already tolerates
partially-scored games.

### P1 — 2v2 side names are replaced by "Team A"/"Team B" on the scorecard

`teamNames` in `src/app/game/play/page.tsx:33` defaults to
`{ A: 'Team A', B: 'Team B' }` and is **only** populated from a tournament
(lines 60, 63, inside `if (ctxRaw)`). The pool context block (lines 68-76) never
sets it.

For 2v2 `scramble`/`alternate-shot`, `pool/[id]/page.tsx:182-195` tags each
player with `.team = 'A'|'B'` and sets `teamMode`, so the play page renders side
labels at lines 818, 885, 1119, 1497, 1554-1555 — as **"Team A" / "Team B"**,
while the leaderboard for the same game shows **"Craig & Jym"** (from
`sideAName`/`sideBName`, falling back to joined first names in
`team-game.ts:88-98`). This is the clearest instance of the naming difference you
noticed. Fix: populate `teamNames` from `game.subTeams` + the mode's `nameFor()`
in the pool branch.

### P1 — mid-round pot payouts are not zero-sum (found by the test suite, 2026-08-10)

**Not yet fixed. Found by `src/test/pool-game.test.ts`, which asserts the current
(wrong) behavior so a fix shows up as a deliberate test change.**

In a classic **pot-mode** pool, the live leaderboard shows more money lost than
won until all 18 holes are in. Two scratch foursomes, $25 each ($200 pot, four
$50 sub-pots), thru 6 holes:

| Leg | Sub-pot | Paid out |
|---|---|---|
| front | $50 | $50 |
| back | $50 | **$0** — nine not started |
| overall | $50 | $50 |
| junk | $50 | $50 |

Each team's `entryPaid` is deducted **in full** from the first hole
(`entryPaid = playerCount × entryPerPlayer`, `pool-game.ts:1673`), but the back-9
sub-pot has no eligible teams yet, so `buildLeg` distributes nothing. Result:

```
t1: gross=150  entry=100  net=+50
t2: gross=0    entry=100  net=−100
                          ────────
                     SUM = −$50   ← a phantom $50 loss
```

The missing amount is exactly the un-started leg's sub-pot. It self-corrects once
the back nine is scored, so the **final** settlement is right — this is a live
display problem, and it's the surface golfers stare at all afternoon. It also
directly contradicts the invariant every individual mode holds ("money is
zero-sum at every moment").

**The fix already exists elsewhere in the codebase.** `settleNassau`
(`game-modes/types.ts`) hit the same problem and solved it: an un-started segment
is treated as a dead heat, so its pot splits evenly and returns everyone's ante,
keeping the board zero-sum at every moment. `buildLeg` should do the same — when
no team has played a leg, either split its sub-pot evenly or hold back the
corresponding share of `entryPaid`.

Worth deciding deliberately, since it's money display: split-evenly matches the
Nassau precedent, but pro-rating `entryPaid` against started legs may read more
honestly ("you've only anted for what's being played").

### P3 — Nassau "Back 9 · thru 9" reads like hole 9, not "9 holes played"

**Found by looking at the rendered UI (2026-08-11), `e2e/screenshots/skins-2p.png`.
Not yet fixed.**

On a completed 18-hole round the Nassau board shows:

```
Front 9   $10 pot · thru 9     All tied · splits
Back 9    $10 pot · thru 9     ← reads as "thru hole 9" on the BACK nine
Total     $20 pot · thru 18
```

`settleNassau` sets `thru: segThru` where `segThru` is *holes played within the
segment* (`types.ts:257`), so a finished back nine is correctly 9-of-9 — but the
label "thru 9" collides with the app's dominant use of "thru" meaning *hole
number* (the header on the same screen says "thru hole 18"). A golfer reads "Back
9 · thru 9" as the back nine having stopped at hole 9.

Fix options: label it `9 of 9 holes`, or convert to a hole number per segment
(back-nine 9-played → "thru 18"). The second matches the header's vocabulary.

### P2 — 2v2 best-ball/combined shows no side information during play at all

Only the one-ball formats get `.team` tagging (`pool/[id]/page.tsx:183-195`).
`best-ball` and `combined` fall through to `teamMode: 'two-best-balls'` with
untagged players, so while scoring a 2v2 best-ball round the scorecard gives
**no indication of who is on which side**. The leaderboard then reveals sides.

### P2 — "1 foursomes" in the hub header, and a "Foursomes" section for a 2v2

`src/app/pool/[id]/page.tsx:231`:

```tsx
<p className="text-xs text-green-200">Pool Money Game · {game.teams.length} foursomes</p>
```

Single-group games are built as exactly one team named `'Group'`
(`pool/new/page.tsx:466-471`), so this reads **"Pool Money Game · 1 foursomes"** —
unpluralized *and* mislabeled (it's not a pool money game, it's a 2v2/skins
game). The `/pool` list item at `pool/page.tsx:130` pluralizes correctly, so the
two screens disagree. The section heading below (`page.tsx:304`) likewise says
**"Foursomes"** over a single card titled "Group".

`EditFoursomes` already handles this properly via `isSingleGroup`
(`page.tsx:1332-1333`) to hide captains/balance/swap — the header and heading
just never got the same treatment.

### P2 — negative money renders as `$-12` on the team path, `−$12` on the single-group path

Single-group uses one helper (`leaderboard/page.tsx:775`):

```ts
const money = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}$${Math.abs(Math.round(n))}`;  // "−$12"
```

The classic path inlines its own at lines 360 and 493:

```tsx
{payout.net > 0 ? '+' : ''}${Math.round(payout.net)}   // "$-12"  ← sign inside the amount
{p.amount   > 0 ? '+' : ''}${Math.round(p.amount)}     // "$-12"
```

Two different renderings of a loss in one file. Hoist the `money()` helper.

### P2 — `Front · Back · Overall` caption over a single row on a 9-hole 2v2

`team-game.ts:225-232` deliberately collapses a nine to **one** leg (the
front+overall double-pay fix). The leaderboard caption is hardcoded
(`leaderboard/page.tsx:889`):

```tsx
<p className="...">Front · Back · Overall</p>
```

so a `back9` 2v2 shows the header "Front · Back · Overall" above a lone
"Back 9" row. The classic path *does* handle the analogous case — it relabels the
overall leg to "Front 9"/"Back 9" and filters the dead legs
(`leaderboard/page.tsx:288-297`). Derive the caption from `result.teamLegs`.

### P2 — Nassau "all tied" detection hardcodes a 4-player group

`leaderboard/page.tsx:937`:

```ts
const allSplit = leg.winnerNames.length >= 4;
```

`skins`, `quota`, `stableford-individual` and `low-total` all declare
`playersMin: 2`. In a 2- or 3-player game a total tie yields `winnerNames.length`
of 2 or 3, so instead of "All tied · splits" the board reads
"Alice & Bob (leading, split)" — describing a dead heat as someone leading.
Compare against the standings length, not `4`.

### P2 — junk caption states the wrong settlement rule for 2v2

`JunkBonusBoard` footer (`leaderboard/page.tsx:1174-1176`):

> Already included in the money column — each earner collects from the rest of the group.

True for individual modes (`settleJunkFromSettings`). For 2v2, junk is settled
**side vs side** — `settleJunkForSides` (`game-modes/settings.ts:188-208`) nets
each side's total and moves only the *difference* between the two sides, so a
birdie by your partner pays you nothing. The board is shared by both paths and
tells 2v2 players the wrong rule.

### P3 — 2v2 Player Details grid doesn't show which side each player is on

`IndividualPlayerGrid` lists all four players flat with no side grouping or
label, while every other panel on that page is side-oriented. The classic path's
equivalent grid is grouped by team with a captain marker
(`leaderboard/page.tsx:335-430`).

### P3 — score-change audit trail is missing from single-group games

`<ScoreHistory>` is rendered only in the classic branch
(`leaderboard/page.tsx:500`). A 2v2/skins/Wolf game has no way to see score
edits, though the underlying `fetchScoreAudit(matchupIds)` works identically.

### P3 — header subtitle differs

Single-group: `{mode.name} · thru hole N`. Classic: `Thru hole N` only — the
format/money mode is never named, so you can't tell a pot pool from a match pool
from the leaderboard header.

### P3 — no head-to-head banner for 2v2 match play

The classic 2-foursome hole-match path gets a large score banner
(`leaderboard/page.tsx:167-195`, gated on `isHoleMatch`). 2v2 `result:'match'` is
the same shape of contest and gets no banner, only the leg rows.

---

## Notes / non-findings

- `displayName` skipping first-name truncation for within-group games
  (`leaderboard/page.tsx:786`) is **correct** — "Craig & Jym" must not become
  "Craig". Documented in-place.
- `HOME_V2` is `false` (`src/lib/flags.ts:8`), so `/home` isn't the default
  landing page, but it is still reachable: `dashboard/page.tsx:216` renders a
  "Try new Home" button. The empty-stats bug above is therefore user-visible today.
