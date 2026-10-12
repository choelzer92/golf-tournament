# Next session: the Event's persona walk (bar #11), Craig's Event calls, then S2 convergence

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

Read `AGENTS.md`, `DECISIONS.md` (whole) and `BETA.md` first. Grep the archive only for the § you
touch: §5.cu/§5.cv for the Event, §5.cs for S2.

## State (2026-10-12, second session)

Branch **`series-2026-10-12`** (off main at d6adf75). It is NOT merged or pushed; merging is Craig's
call (§5.ab). Gate log: `.claude/verify-2026-10-12-series.log`.

The **Event** (a Series in code, §5.cu/§5.cv) is built:
- **Storage:** each game carries `series {id, name, rollup, seq, date}` in its existing data
  blob. No migration. An event is the set of games sharing the id.
- **Unit:** the member is a ROUND, never "a day" (Craig: there can be more than one round a day).
- **Rollup:** pure `lib/series.ts`. TOTAL = finished rounds. A live round is **Projected** and
  never enters the settle-up. Goldens: `src/test/series-golden.test.ts`.
- **Entry points:**
  - "Start an event" on Home and on the group page (it replaced the legacy "Multi-round event");
  - "Part of an event?" on the wizard's Review;
  - "+ Add round N" on the event screen and on every round hub (organizer only).
- **The screen:** `/event/[id]` shows the standings (Total, Projected, then rounds grouped under
  their date), the settle-up and the rounds.
- **§5.ck Home-by-group** is built too, in pure `lib/home-feed.ts`: live Continue cards on top,
  each group's latest game or event, then Other games.
- **e2e:** `e2e/series-event.spec.ts`. The f059 and 5cb specs were adapted to the new Home.

## Step 1: Craig's calls on the Event (ask ONE at a time)

They're in BACKLOG "[beta #11] Event follow-ups":
- (a) a round created ahead reads "live" before any score;
- (b) no rename yet;
- (c) the group page lists an event's rounds one by one;
- (d) the classic `/dashboard` still offers the legacy builder;
- (e) guests on a round's link may open the event standings (I allowed `/event/` in the gate).
  Confirm (e) first; it's an access change.

## Step 2: the 3-day persona walk (bar #11's measure)

From a group: start an event, play round 1, add rounds 2 and 3 (one on the same day), close them
out, and settle. Record the tap counts, and screenshot and critique every step (§ walk-the-UI).

## Step 3: S2 convergence (S2.0–S2.6)

Plan: `.claude/plans/spine-s2.md` §6 and §7; the answers are in §5.cs (NEW rows only; legacy keeps
computing, Q1). Run both corpus harnesses before and after every slice.

## Then
- The persona walks with tap counts (bars #1–#3).
- F-063 C (bar #5), the stroke vs match play check (bar #6), the JSON export (bar #8).
- Saved formats keeping their pot split (Craig's call; ask).
- GHIN-app side-by-sides: a four-ball match off the low (T4); a CH ≥ 37 player (F-108).
- **End of each session:** groom BACKLOG, update `BETA.md` §4, run the full `npm run verify` once,
  and rewrite this file.

## Waiting on Craig (don't guess)
- The Event follow-ups (Step 1).
- Merging `series-2026-10-12`.
- Saved formats carrying the pot split.
- His phone walk of F-037 (which closes the P1).
- The branding/design session: theme, icon, name.
- The no-GHIN organizer: DEFERRED (§5.ch).

## Settled (don't re-ask)
§5.cu (stamp per game; the unit is a round), §5.cv (it's called "Event"; both entry points; it
replaces the legacy builder; Add round on the event + round hubs; Projected; Home built with it).
Earlier: see DECISIONS.md.
