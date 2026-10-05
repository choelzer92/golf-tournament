# Next session: land F-104, then Phase B (first-time ease), the event spine, then Phase A

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

Read `AGENTS.md`, `DECISIONS.md` (whole) and `BETA.md` first. Grep the archive only for the § you
touch: §5.cg–§5.cj for this session's calls, §5.bu/§5.ce for the spine.

## State (2026-10-05)

Branch `gate-speed-2026-09-27`: NOT merged, NOT pushed (§5.ab: never unbidden). Landed since 2026-10-01:
- **Phase D quick polish:** D1 font (e4e2420), D4 (0325a4d), D3 (d7f199c), D5 (33af417), D2 starter
  SVGs removed (aa105b7).
- **Dedup audit + docs** (0254f26).
- **A4:** one money formatter (12ac5b8).
- **§5.cj:** match points drop the "+" (e81b572).
- **§5.cb visibility** (14cd287): owner + players (GHIN or roster id) + source-group members.
  Members see groups read-only; legacy owner-less events are visible to their players only.
  Plan and "Built" notes: `.claude/plans/visibility-5cb.md`.

- **F-104 opt A:** Create Game without a GHIN login opens a login modal first (the commit after
  14cd287). `e2e/helpers.ts` `signInOrganizer` signs a tab in before Create.

On a low-memory day, run gates with `PW_WORKERS=1`. A reaped gate isn't a failure: don't restart it
unasked.

## Step 1: Craig's ask. Go through "Waiting on Craig" (below) ONE question at a time

Use AskUserQuestion, one topic per question. Record each answer in-session: the DECISIONS_ARCHIVE
entry plus the DECISIONS.md index line. Then continue with the list below.

## Then, in order (≤3 promoted per BETA.md §3)

1. **Phase B, first-time ease (bars #1–3):**
   1. B3 Send to players;
   2. B9 hide close-out;
   3. B1 Run it back.

   Details and the rest of the ranking (B4b/c, B7, B2, B5, B6, B8; B4a re-walk only) are in
   `.claude/plans/roadmap-2026-10.md` "Re-ranked".
2. **Event spine S2 (bar #11, a multi-day trip).** Tournament rounds go through `game-modes/`,
   goldens first. Investigate, then write the plan into the roadmap (Phase E), then build. Before
   S3/S4, settle the open question **Series vs S4** with Craig, after S2's investigation.
3. **F-037 opt B (the only open P1, bar #9).** Two separate 2v2s at 8 players: a within-tee-group
   setting. Write the goldens-first plan and **show Craig before building** (§5.ci).

## After those
- **Phase A remainder:**
  - F-103 b.
  - F-103 c, CTP across tee groups: last-write-wins risk in `setCtpWinner` (`play:2144`). Reproduce
    with two tabs, then Craig picks B or C. Wrong money, bar #6.
  - A5 doc hygiene: archive fixed findings, mark F-089/F-090/F-030/F-015 done, F-090 superseded by
    e07ad10.
- **F-063 C (bar #5):** per-cell score rows plus an outbox, roadmap Phase C. Show Craig the live
  migration before it runs.
- **Stroke vs match play handicap check (bar #6):** report only, no math change without Craig.
- **JSON export (bar #8):** partial today (a CLI script plus a tournament button).
- **D6 copy diet:** not started.
- **End of each session:** groom BACKLOG (tag [beta #n] / [after-beta] per the comb), update
  `BETA.md` §4, run the full `npm run verify` once in the background, and rewrite this file.

## Waiting on Craig (don't guess)
- **Home "Your golf":** option B, a Continue card on top, or the 3 most recent.
- **§7 q4 theme direction (D4).** The D5 emoji→icons and the D2 app icon wait on branding too.
  Craig wants to brainstorm names later, near beta ("GrudgeMatch" floated).
- **Hide-holes in the wizard.**
- **Series vs S4** (after S2's investigation).
- **Merging the branch.** Craig walks it on a phone first (bar #10).
- **No-GHIN organizer: DEFERRED (§5.ch).** It waits for §5c security; the map is
  `.claude/plans/no-ghin-organizer.md`.

## Settled this session (don't re-ask)
- **§5.cg:** the beta bar is confirmed, with #11 multi-day ON it.
- **§5.ch:** only GHIN logins organize.
- **§5.ci:** F-104 opt A; legacy events visible to their players plus the app owner; branding later;
  F-037 opt B.
- **§5.cj:**
  - members see their group's whole ledger;
  - outside groups, money counts only games played;
  - groups are read-only to members;
  - a group's creator is NOT a member;
  - match points carry no "+".
- **Known edge (§5.cb notes):** an organizer who didn't play a non-group game they made still sees
  its money, as before.
