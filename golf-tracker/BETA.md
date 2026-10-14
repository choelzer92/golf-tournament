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
| 2/3 | §5.ck Home-by-group BUILT 2026-10-12: live Continue on top, each group's latest game or event, then Other games | 2026-10-12 |
| 4 | §5.cb visibility built + e2e (14cd287); F-104 A closes owner-less creates; F-110: the GHIN Link no longer wipes who you are (293b06d) | 2026-10-12 |
| 7 | D1, D3, D4 (light), D5 done; the icon/name and theme wait on branding / §7 q4 | 2026-10-05 |
| 1 | B3 + F-105: Create is the share moment (745688c); B9: Close out / Finish hidden until a score exists (f7fe1ec); hide-holes in the wizard (477b1f9); F-111 the group page adds new players by GHIN (7436d39); game headers go to Home. **F-115 (2026-10-13):** every game reads its bet, teams, format and play ("$30 Nassau ($10/$10/$10) · 4v4 · best ball · match play"); **Match cards BUILT on the teams step (§5.de/§5.dg):** who plays whom, tap to swap, tee time on the card. The persona walk with tap counts is not done yet | 2026-10-13 |
| 3 | B1 Run it back built (97fe68e, d99a8db): hub button on a finished game + "Start from a recent game". It's 1 tap plus Next × 6 rather than 2, because Craig chose to walk the steps (§5.cm). Not yet measured by a persona walk | 2026-10-05 |
| 9 | F-037 BUILT as Team → Match (§5.co, T0–T4 + polish, F-106/F-107). No other open P1. It closes after Craig's phone walk | 2026-10-12 |
| 11 | The EVENT is BUILT (§5.cu/§5.cv/§5.cw). **The 3-day persona walk is MEASURED (2026-10-13, `e2e/event-walk.spec.ts`):** 12 taps group → round 1, 9–10 per added round, 1 to settle; it settles zero-sum. Its findings F-117 to F-120 are built. **F-116 built (§5.dc):** rounds run in set-up order and can be moved; dates are optional. Open: F-114 (standings on a phone → design session). Craig's phone walk remains | 2026-10-13 |
| 6 | The ledger plays the round's real handicap (§5.cs Q3). F-108: no stroke cap, max index 54.0. **F-113 [P1] fixed:** the wizard dropped "Hole by hole" on head-to-head games (none live affected). F-112: dead legacy settings hidden. Presses added as [beta] (§5.cy). **Stroke vs match play checked 2026-10-14** (`.claude/plans/stroke-vs-match-play.md`, `stroke-vs-match-play.test.ts`): our two totals are identical (round each, then the difference); the 2024 team-match reading would move 1 stroke for ~¼ of players at 85–95%. Needs a GHIN-app check (G1/G3), then Craig picks A or B | 2026-10-14 |
| 1 | **Persona walk MEASURED 2026-10-14** (`e2e/persona-walks.spec.ts`): a stranger, 8 friends, no group, every default: **21 taps + 21 typed fields** URL → shared game (16 of the typed fields are the 8 names + handicaps), ~2½–3 min est. Not yet ~2: F-126 (B5 paste names, promoted) and the jargon in F-125 (B7). F-122 (a blank name blocks Next) is Craig's call; F-124 fixed | 2026-10-14 |
| 2 | **Persona walk MEASURED 2026-10-14:** link → Enter Scores → a score = **2 taps** (meets ~3). **"Remembers their group" FAILS** (F-123): the bare URL is a GHIN-login dead end and the link reopens the hub, not their card → B6, one question for Craig | 2026-10-14 |
| 3 | **Persona walk MEASURED 2026-10-14:** Home → last week's game → Run it back → Next × 6 → Create = **9 taps**, as §5.cm accepted (1 + Next × 6, plus Home→game and Create). F-127 would save one | 2026-10-14 |
| 8 | **Investigated 2026-10-14** (`.claude/plans/json-export.md`): the shape is Craig's (Q1–Q6). The backup script now pages past the 1000-row cap that cut `score_audit` short and adds `feedback_notes` (F-128); it needs one re-run | 2026-10-14 |
| others | not yet measured | n/a |

## 5. The one-time backlog comb

This is part of the next session's dedup audit. For every open BACKLOG row and open FINDINGS entry:
1. Decide DONE, PARTLY or OPEN, with evidence.
2. Tag it `[beta #n]`, `[after-beta]` or `[deferred]`.
3. Close what's done.

What remains tagged `[beta]` is the road to beta, and its count is the progress meter.
