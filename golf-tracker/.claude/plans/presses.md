# Presses: design note (§5.dj)

Status 2026-10-14 (4th session): **WIRED** on both axes (§5 below), Q1–Q4 answered (§5.dk). Wiring tests:
`src/test/presses-wired.test.ts` (team engine, Team → Match, classic match; zero-sum; ledger == board; mutation-checked).
e2e: `e2e/presses.spec.ts` (tap Press, see it on card + board, remove it).

**Readings made while wiring (for Craig's batch, each changes money only where noted):**
- **Team → Match press stake = the leg's PER-PLAYER share** (stored per-team leg ÷ team size, §5.dd). A 4 v 4 at $5 a
  player a leg ($20 stored): a singles press pays $5 player to player; a 2 v 2 press $5 to each of the two. The other
  reading, the full $20 per match press, would make a singles press 4× the player's leg.
- **Uneven Team → Match teams don't press** (no per-player amount exists until §5.dd's uneven rule). Hidden in setup.
- **Pressing defaults to the button** (§5.cy's original ask); auto is the other choice.
- **Auto presses can be removed too** (§5.dj "removable any time"): the removal is stored, so the press doesn't
  re-derive.
- **The hub can turn presses on or off mid-round**, like every other money setting there (no new lock).

- Rules: `src/lib/game-modes/presses.ts` (pure, unused by the app).
- Goldens: `src/test/presses-golden.test.ts`, 16 tests. Mutation-checked: a 3-down trigger, more than one
  press per bet, counting unplayed holes, letting the leader press a press, and denying a collapsed leader
  the leg's press each fail them. A 2,000-case random sweep checks the module
  against an independent forward-simulation oracle and checks zero-sum.

## 1. What a press is (settled, §5.dj)

A press is a new bet, at the leg's stake, from the next hole to the end of its nine, starting all square.
The bet it presses stays live. It is not double or nothing.

- **Turned on:** a setup toggle, off by default. When it's on, the group picks **Auto** or **Press button**.
- **Trigger:** 2 down, in both modes. One down through 3 is never a press.
- **Re-presses:** unlimited, each starting all square.
- **Who taps:** the scorer, and the press starts at once (no accept step).
- **Removing:** any time, with a "press removed" note.
- **Where:** every head-to-head match.

## 2. Rules the module adds (my reading; tell me if any is wrong)

1. **Only the side that's losing presses (§5.dk).** The leg can be pressed once by EACH side: a leader who
   collapses to 2 down in the front is losing it now, and may press it. A press can be pressed only by the side
   that made it, when it is 2 down in it, so the leader never presses a press. One press per bet per side, so
   one bad hole at 4 down never opens a press on every live bet at once.
2. **2 down after the last hole of the nine presses nothing,** because no hole is left. 2 down after 8 presses
   hole 9 alone.
3. **A press counts holes both sides have posted, like its leg** (§5.ai). A short leg's close-out question
   covers its presses too: voiding the leg voids its presses.
4. **Button mode: a tap stands once made.** If a score is corrected later so the bet was never 2 down, the
   press still stands, because it was a bet made. The scorer can still remove it. Removing a press removes its
   re-presses too.
5. **Auto mode is re-derived from the scores.** A corrected score re-runs the presses, which is right for
   "a score fixed after the fact" (nothing is stored to drift).
6. **The button names the bet it presses:** "Press the front 9" or "Press the press (from 5)". One tap never
   presses two bets.

## 3. The goldens (stake $10 per bet unless noted; A = side a wins the hole, B = side b, - = halved)

| # | Holes 1–9 | Bets | Side a nets |
|---|---|---|---|
| G1 | - B - B A - A - A | front +1 · press 5–9 +3 (b, 2 down in a's press, can't press it) | **+$20** |
| G2 | B B - - - - B A A | front −1 · press 3–9 +1 | **$0** (press won, leg lost) |
| G3 | B B B B A A A A A | front +1 · a's 3–9 +3 · a's press of it 5–9 +5 | +$15 at $5 |
| G3b | A A - - B B B B - | front −2 · b's press 3–9 −4 · a (collapsed to 2 down) presses 9, halved | −$20 |
| G4 | - - - - - - - B B | front −2 (no hole left to press) | −$10 |
| G5 | B - - - - - - - - | front −1 (1 down is never a press) | −$10 |
| G6 | back nine A A then halves | back +2 · b's press 12–18 all square | +$10 |
| G7 | B B then halves | front press 3–9 only; the overall is untouched unless overall presses are on | n/a |
| G8 | B B A, then not played | front −1 thru 3 · press +1 thru 1, both marked unfinished | n/a |

Button-mode goldens (B1–B5): the button shows to the side 2 down and names the bet. Not pressing at 2 down
leaves the button there at 3 down. A removed press pays nothing and takes its re-presses with it. A tap
survives a score correction. **Auto and button give the same bets when every offer is tapped the moment it
shows.**

## 4. Questions for Craig (each changes the code)

**Q1: answered B (§5.dk).** Can the overall be pressed? Your worry: "someone may want to press a front 9 and
then not realize they are pressing the overall too." The module never ties the two together (G7). The
options:

- **A. Nines only.** Presses exist on the front and the back, and the overall is never pressed. Simplest,
  with nothing to misread.
- **B. A second toggle, "The overall can be pressed too"** (off by default, shown only when presses are on).
  An overall press is its own line, runs to 18, and has its own button ("Press the overall"). Pressing a
  nine never presses the overall. *My recommendation: it's the common betting-guide version, and it's
  explicit.*
- **C. Ask on each press.** A press on the front asks "Press the overall too?" with No preselected. In auto
  mode this can't ask, so it falls back to A or B there.

**Q2: answered (§5.dk):** only the side that's losing presses, as in ordinary play. Its own press can be
re-pressed when it's 2 down in it; a collapsed leader may press the leg. Every bet runs on to the end of its
nine regardless of the others.

**Q3: answered A, match play only (§5.dk).** "2 down" is natural in match play (holes). In a stroke-play Nassau, down means
strokes.

- **A. Presses only on hole-by-hole (match play) legs.** The toggle hides on stroke play. *Recommended:
  it's where every source describes presses.*
- **B. Also stroke play, 2 strokes down.** One double bogey can trigger it on hole 1.

**Q4: answered A, between its players (§5.dk). Team → Match games (several matches inside one team game).** Each match is head-to-head. A press in
one match:

- **A. Is paid between that match's players, at the leg stake, on top of the team result.** *Recommended:
  a press is a bet between the players who made it.*
- **B. Counts as an extra point for the team on that nine** (it would change who wins the team's nine).

## 5. Wiring plan (after the answers; goldens first, both axes)

1. **Engine** (`team-game.ts`): expose the per-hole `holeWinner[]` for a two-side match (it already exists at
   the per-hole loop). Feed `autoPresses`/`tappedPresses` per leg. Add each press's line to `teamLegs`, and
   add `betsNet` to `moneyNet` under the legs model.
2. **Matches games** (`matches.ts`): the same, per match, from the match's sub-compute (per Q4).
3. **Classic pool, 2 teams in match mode** (`pool-game.ts`): a per-hole sequence from
   `computeLegHoleMatch`'s inputs, presses added to `computeMatchPayouts`. Per AGENTS.md, check both
   sides of `isModeEngineGame`.
4. **Settings:** `presses` (toggle, off) and `pressMode` (auto | button) in `SETTINGS` with `showIf
   moneyModel=legs` (+ match play per Q3, + 2 sides). Add them to the wizard's `SIDES_STAKES_KEYS`
   allow-list. A saved format and Run it back carry them.
5. **Storage:** button taps go in `game.presses: PressTap[]` (jsonb, no migration), written through
   `pool-game.ts` only.
6. **UI:** the Press button on the scorecard's match row. Each press as its own line under its leg on the
   leaderboard ("Press 5–9: Hogs 3 up"). Settle-up stays net per player, and the money card lists the bets.
7. **Tests:** the goldens wired through both engines, zero-sum per press, the ledger matching the scorecard,
   and an e2e of tapping Press and removing it (`test('presses: ...')`).
