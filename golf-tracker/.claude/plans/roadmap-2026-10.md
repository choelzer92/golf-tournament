# Roadmap, October 2026: from "it can do anything" to "anyone can start it"

Written 2026-10-01 from two read-only sweeps (an open-work inventory, and a first-time walk of three
personas over the e2e screenshots and code), then spot-checked. **Craig answered the calls on 2026-10-01 (§5.cd).** NEXT: the dedup audit below,
in a fresh session, before anything is built.

## The bar we're building to

Craig: "The way the app will be successful is having the first time set up for players pain free and
intuitive, which would keep them using it."

| Moment | Today (measured) | Target |
|---|---|---|
| Invited player: link to scoring | ~3 taps, no login. **The strongest flow in the app.** | Keep it. Plus: remember "I'm in Group 2" |
| First-time organizer: URL to a shared game | invite code + GHIN login, then ~10 screens, 10–14 decisions, 40+ taps | about 2 minutes: players, course, "the usual", Create, Send |
| Returning organizer: "same game again" | Home, then group, then "Casual round", then a format, then 6+ wizard screens | **2 taps**: Run it back, then Create |

The capability is already there. What's missing is short paths through it. Configurable must not
mean every option gets shown (AGENTS.md).

## Phase A: finish what's decided (small, now)

1. **§5.cb visibility.** A game is visible to its owner, its players (by GHIN) and its source group, for
   pools and tournaments. Build it in the lib list functions, then wire `/home`, `/dashboard`,
   `/home/stats`, `/home/groups/[id]` and `/pool`. This also serves "continuing": the eight Hogs v Dawgs
   players each find the event and their money.
2. **F-103 b** (the skins card shows the classic format line) and **F-103 c** (CTP across tee groups:
   reproduce it with two tabs, then Craig picks B or C). At a member-guest a CTP overwrite is wrong money.
3. **F-101 e scale pass at 144:** `scoreAt`, rendering, the balancer deadline, palettes past 6, "21th".
4. **Money-format bugs seen on the walk:**
   - the stats ledger and group dashboard show winners without "+";
   - the group dashboard shows cents (UI_CONVENTIONS allows cents only in the ledger);
   - match-play holes-won counts carry a "+".
5. **Doc hygiene:**
   - close the stale rows (F-089/F-090/F-030/F-015/F-037 marked open but done; BACKLOG Now rows 22 and 26;
     the Team Competition row absorbed by Phase 3; GAME_STRUCTURE_DESIGN's answered questions);
   - archive the FIXED findings;
   - regenerate the stale step-bar screenshots.

## Phase B: the first-time and the return (the ease goal; mostly flow, not restyle)

Ranked by tap savings times how often it happens.

1. **Run it back.** "Same game again" on a finished game and on recent-game rows. It clones the format,
   field, course and tees, then opens straight on Review & Create, with "Edit" beside each section.
   This is the 2-tap return; it reuses the draft and format-library seeding that already exists. **M.**
2. **Wizard fast path.** After Players: "The usual: {last format} at {last course} → Review." The
   Scoring step collapses to a one-line summary plus "Customize", which is `showIf` applied to a whole
   step. **M.**
3. **Send to players is the first thing after Create.** Today the filled button is "Leaderboard" and
   Share is a small header link. Make "Send to players" the primary hub action until scores exist, and
   open the share sheet right after Create. **S.**
4. **Don't ask twice.**
   - Sides re-asks the split already chosen on Compete: derive it, and put the 7-way list behind
     "Change split".
   - Teams blocks Next until you pick a build method: pre-build balanced teams.
   - Drop the contradictory "No captains" vs "Captains' deal" pair. **S–M.**
5. **Adding players**, the biggest tap cost. Recent players and group members first, then a "paste
   names" box. Remove the duplicate selected list. **M.**
6. **The guest remembers who they are.** Ask "Which group are you in?" once, remember it, and open
   straight to that card next time. Hide "My Games" from guests. **S–M.**
7. **Plain words.** Plain labels or an info tip for M, CHcp, "Off the low", "How many strokes change
   hands", "Decide by", and "Casual round" for a money game (Craig's own open thread). Hub stakes read
   "$10", not "Front 9 ($) 10". **S.**
8. **Round-start clutter.** Hide "Finish Game" and "Close out" until scores exist. **S.**

Measure each one: re-walk the three personas and record the tap counts in the table above.

## Phase C: continuing that never loses a score

1. **F-063 option C: APPROVED 2026-10-01 (§5.ce).** Per-cell score rows plus a localStorage outbox, so
   "two phones, one foursome" and lost taps are solved for good. Investigate, then write the build
   plan here, then build. Show Craig the live migration first. **M.**
2. **Offline / PWA.** `sw.js` caches nothing today, and a cart path has no signal. **M.**
3. **The live-scoring pass** (measure first), which Craig asked for and never got a session. **M.**
4. **Season ledger** on top of P2's stats and §5.cb's visibility.

## Phase D: feel professional (needs Craig to lift §5.bv 3 for these items)

These are not a restyle. They're the first-impression basics a new player judges in 5 seconds:

1. **Typography.** `globals.css` sets `font-family: Arial`, overriding the Geist font `layout.tsx`
   already loads, so every screen renders in Arial. One line. **S.**
2. **Brand assets.** The favicon is the Next.js default, `public/` still holds the starter SVGs, the
   manifest has only an SVG icon (no PNG / apple-touch icon), and there's no install prompt. Ship a real
   icon set, a name and colour, and an "Add to Home Screen" nudge after the first game. **S–M.**
3. **The front door.** The invite gate is a bare box with no logo and no word about what the app is, and
   cold loads start on a blank frame (`InviteGate` returns null while checking). Give it a branded
   page with a one-line pitch and a skeleton instead of blank. **S.**
4. **One theme.**
   - Setup is light, Standings is dark, and the dark board stops partway down the page with white below it.
   - Either make dark mean "live" everywhere, top to bottom (§7 q4, still open), or pick one theme.
   - Also check phones in system dark mode: the login page sets no background. **M.**
5. **A real icon set** instead of emoji (💬 🎤), and **one selected-toggle style** (Net reads as an
   outline while every other toggle is solid). **S.**
6. **Copy diet.** Helper text sits under almost every control; keep one line, and move the rest
   behind an info tip. **S–M.**

## Phase E: the platform (each piece is approved separately)

- **Event spine S2: APPROVED 2026-10-01 (§5.ce).** Tournament rounds through `game-modes/`, which
  retires the second engine (F-013, F-062 B). Investigate, then write the build plan here, then build.
- **S3:** N-way tournaments.
- **S4:** a pool is an Event with one round, so multi-day is "add a round" and the pool/tournament
  vocabulary goes away (§5.cb 4).
- **Then flights**, for the member-guest at 144.

## Handicap check (§5.ce)

- **Stroke vs match play investigation.** Craig: they are "calculated very slightly differently, and
  very occasionally can produce different stroke totals". Pin down the USGA rules, find the code paths,
  and run a property test for the inputs where they disagree. Report only.

## Not now (parked or deferred by Craig)

- The course-data audit.
- Accounts / §5c hardening (token rotation, RLS).
- The 2v2 pot model, Vegas and BBB.
- The 1v1 batch F-064/F-065/F-067 ("later").

## Everything else open, and where it goes (cross-check 2026-10-01)

Every open BACKLOG row, the spine plan's leftovers, and this session's own work, each with a home. The
dedup audit checks these too.

**Event spine** (`.claude/plans/event-spine.md`):
- **Slice 1:** BUILT (7b53913). Its unwired piece, `tournamentVisibleTo`, becomes part of §5.cb
  visibility (A1), widened to owner + players + group.
- **S2:** APPROVED (Phase E).
- **S3 (N-way tournaments) and S4 (pool = Event):** Phase E, each approved separately.
- **Open:** q2 (legacy owner-less tournaments, still visible to everyone) and q3 (groups app-wide for
  tournaments); ask with S2. q4 (F-098) is done.
- **Also ask with S2:** GROUPS_AND_EVENTS.md's 5 open questions.

**This session (2026-10-01):**
- **Code:**
  - Event spine slice 1 (7b53913) and the §5.cc skins live view (3f9c591) are committed on
    `gate-speed-2026-09-27`, and the full gate is green.
  - Not merged: that's Craig's call.
- **Docs:**
  - BACKLOG, DECISIONS, the ARCHIVE (§5.cb–§5.ce), FINDINGS and NEXT_SESSION_PROMPT are modified
    and **uncommitted**.
  - This plan file is untracked.
- **Unbuilt follow-ons:** F-103 b and F-103 c (A2).

**BACKLOG rows not named above, by phase:**

| Row | Goes to |
|---|---|
| §5.bg money-step redesign (what each leg pays per player, adds-up check) | **B**: first-time ease (money is the hardest step) |
| Merge-audit polish ×4: loss-red on the dark board, the "Sides / Match" label, the `70, 30` split mini-DSL, three course-handicap renderings | **D**: consistency |
| 9-hole game shows redundant front/back columns | **D** |
| Phase 2 residue: `teamBuild` provenance classic-only; the 2v2 mode name "Teams" (F-088 C, Craig may rename) | **A** (doc/code hygiene); ask Craig about the name |
| [P3] "Hide holes until all groups finish" is hub-only | **B**: the wizard question is Craig's |
| F-030 opt C: a standings strip on the scorecard | **C**: with the live-scoring pass |
| Live-scoring pass; offline / PWA | **C** (already listed) |
| Backups / JSON export (the remaining §5c item Craig kept) | **C**: protects the money history |
| F-102 leftovers (LOW): legacy tournament give-back dots; the play page's nine from the view | **E**: they go away with S2 |
| Test-process speed leftovers (text checks to unit, faster seeding) + **gate memory**: ~200 Chrome processes during a run (pages/contexts not closed) | **Infra**, a slack item |
| 1v1 batch F-064 to F-067 | Later (Craig) |
| Accounts / §5c hardening; route renames; trainer Layers 2–5 | Deferred by Craig |
| Team Competition engine row | Absorbed by collapse Phase 3, so close the row (A5) |
| Flights | **E** |
| Known-incomplete corners (tournament team math, 9-hole scramble dots, 2v2 pot, Vegas/BBB) | Fix on their trigger; the tournament math goes with S2 |
| Ideas section | Stays raw; nothing to build from it |

## Dedup audit (the next session's whole job before building)

Craig (§5.cd): "didnt we already do some of the stuff in the plan? … start a new session where we
ensure that this is actually all work that is to be completed."

For EVERY numbered item in Phases A–D, check it against the code (grep and read the named file),
`git log --oneline -200`, FINDINGS.md (and FINDINGS_ARCHIVE), DECISIONS_ARCHIVE and BACKLOG Done.
Mark each one **DONE** (with commit or file:line evidence), **PARTLY** (what exists, and what's
missing), **OPEN**, or **DECIDED AGAINST** (§ number). Write the verdicts into the table below, and
delete or reword items that turn out done. Things the sweeps may have missed:
- the format library and wizard seeding (could already cover part of "Run it back" or "The usual");
- `ShareGameButton` / the Share panel (§ pool sharing);
- F-091/F-092/F-096 wizard picks (Sides/Teams defaults);
- any earlier jargon or label passes.
An Explore agent per phase keeps the context small. Then re-rank what's left and show Craig.

| Item | Verdict | Evidence |
|---|---|---|
| (fill in) | | |

## Craig's calls

**Answered 2026-10-01 (§5.cd):**
- §5.bv 3 is lifted for the Phase D items only.
- Order: quick polish, then B, then A, but after the dedup audit.
- §5.cb is built next.
- A no-GHIN organizer is wanted but tricky ("a lot of the app relies on ghin numbers"). Map every GHIN
  dependency and propose options before building.

**Still open:**

1. **Home "Your golf"** (Craig leans to the 3 most recent; option B, a Continue card on top, was offered). Collapsed by default was Craig's 2026-08-05 call ("groups are the focus"). A
   first-timer and a returning organizer both look for last week's game first. Keep it collapsed, or open
   it with the 3 most recent?
2. **"Two 2v2 matches, one per foursome"**, the classic Saturday: is it a first-class choice on Compete?
   Today four pairs default to a 4-way all-vs-all (from the walk; verify before deciding).
3. **Still waiting from before:** merge the branch, §7 q4 (theme, see D4), and hide-holes in the wizard.
   (F-022 and F-033 were closed, and S2 and F-063 C approved, on 2026-10-01 under §5.ce.)
