# Beta: what "done enough" means, and how work gets there

**CONFIRMED 2026-10-01 (§5.cg), with #11 on the bar.** This file is the filter for every session: work
either moves a bar item, or it waits until after beta.

## 1. The beta bar (exit criteria)

Beta = a stranger's group can set up, play, and settle a game with no help from Craig, and no score or
dollar is ever lost or wrong.

| # | Bar | Measured by | Roadmap |
|---|---|---|---|
| 1 | **First-time organizer** gets from the URL to a shared game in about 2 minutes, with no jargon left unexplained | a persona walk with tap counts recorded | B, D3 |
| 2 | **Invited player** scores in about 3 taps, and the app remembers their group | a persona walk | B6 |
| 3 | **Returning organizer** runs the same game again in 2 taps | a persona walk | B1 |
| 4 | **Every player finds their games and money** without the organizer re-sharing | §5.cb is built, plus an e2e | A1 |
| 5 | **No score is ever lost:** two phones, a dead spot, a sleeping phone | F-063 C, offline, an e2e plus unit tests | C1–C2 |
| 6 | **Money and strokes match GHIN/USGA**, and settle to zero | the stroke vs match play check closed; zero-sum tests | §5.ce |
| 7 | **It looks like a real app:** a font, an icon, a front door, one theme | a screenshot walk | D1–D4 |
| 8 | **Money history survives:** an export or backup exists | the JSON export | C |
| 9 | **No open P1 finding** | FINDINGS.md | n/a |
| 10 | **The full gate is green, and Craig has walked it on a phone and merged it** | `npm run verify`; Craig | n/a |
| 11 | **A multi-day event** (a trip) sets up from a group's preferences and pays cumulative money at the end. *On the bar (§5.cg)* | a persona walk of a 3-day trip | E (Series vs S4, open) |

Not on the bar, so it waits until after beta:
- S3 and flights, and S4 too, unless it's the route chosen for #11;
- the AI caddy and trainer layers;
- Vegas/BBB;
- the 1v1 batch;
- accounts/RLS hardening, unless the bar needs it.

S2 is approved and does go ahead. It is NOT a bar item, so it's scheduled after the bar items it doesn't
block.

## 2. Intake: how a new idea or feedback item is handled (pruning)

1. **Write it down, don't build it.** A mid-session idea, from Craig or discovered, goes to FINDINGS
   (if it's a problem) or BACKLOG Ideas (if it's a possibility). It goes there the moment it comes up.
2. **Tag it against the bar.** Does it move a bar item? Then it's tagged `[beta]` with its bar #. If
   not, it's tagged `[after-beta]`. This tag is Craig's call when it's unclear.
3. **The current session doesn't absorb it** unless Craig says "now". The default answer is "logged
   as F-xxx / backlog, tagged [beta #n]".
4. **A bug that's wrong money, or lost data, jumps the queue** (P1). Everything else waits for grooming.

## 3. The session loop (staying on task)

- **Start:** NEXT_SESSION_PROMPT promotes **at most 3 items**, all `[beta]` unless Craig picked
  otherwise. Work them in order.
- **During:** one item at a time:
  1. investigate;
  2. ask where the answer is Craig's;
  3. build;
  4. run `verify:quick`;
  5. commit.
  New ideas go through §2.
- **End:** groom.
  - Mark items done.
  - Tag what was discovered.
  - Update the bar table's progress (below).
  - Promote the next ≤3.
  - Run the full gate once.

## 4. Progress against the bar

| # | Status | Last moved |
|---|---|---|
| 4 | §5.cb visibility built + e2e (14cd287); F-104 A closes owner-less creates | 2026-10-05 |
| 7 | D1, D3, D4 (light), D5 done; the icon/name and theme wait on branding / §7 q4 | 2026-10-05 |
| 1 | B3 + F-105: Create is the share moment (745688c); B9: Close out / Finish hidden until a score exists (f7fe1ec); hide-holes in the wizard (477b1f9). The persona walk with tap counts is not done yet | 2026-10-05 |
| 3 | B1 Run it back built (97fe68e, d99a8db): hub button on a finished game + "Start from a recent game". It's 1 tap plus Next × 6 rather than 2, because Craig chose to walk the steps (§5.cm). Not yet measured by a persona walk | 2026-10-05 |
| 9 | F-037 BUILT as Team → Match (§5.co, T0–T4 + polish, F-106/F-107). No other open P1. It closes after Craig's phone walk | 2026-10-12 |
| 11 | Series first (§5.cr). The Team → Match roll-up is the per-day piece. The Series itself is not built yet; it's next | 2026-10-12 |
| 6 | The ledger plays the round's real handicap (§5.cs Q3; T0's split round had ~double strokes). F-108: no stroke cap, max index 54.0. The stroke vs match play check is still open | 2026-10-12 |
| others | not yet measured | n/a |

## 5. The one-time backlog comb

This is part of the next session's dedup audit. For every open BACKLOG row and open FINDINGS entry:
1. Decide DONE, PARTLY or OPEN, with evidence.
2. Tag it `[beta #n]`, `[after-beta]` or `[deferred]`.
3. Close what's done.

What remains tagged `[beta]` is the road to beta, and its count is the progress meter.
