# Backlog comb, 2026-10-01 (raw agent output; merged into roadmap-2026-10.md's Dedup audit table when it's complete)

Key results:
- **F-037 [P1]** (two separate 2v2s at 8 players) is the only open P1 blocking bar #9. It is PARTLY
  done: the "Two pairs, 2 v 2" label exists, but there's no pairings axis. This is the same thing as
  the open "who plays whom" question.
- **Open P1 remainders:** F-062 B (legacy CH math) and F-063 C.
- **Stale entries:**
  - F-015, F-022, F-033, F-060, F-061, F-068, F-070 to F-088 and F-091 to F-100 should be archived.
  - F-089 and F-090 have FINDINGS status "open" but are done (c60ae11, 3965d25).
  - F-064 A is built.
  - On BACKLOG: "Sides / Match" label (b8f9c79), Team Competition row (f163242), F-069 (1ee5679), the
    ROADMAP draft row, and probably the "2v2 has no pot" corner (974d0c2).
- **Tags:**
  - `[beta #1]`: §5.bg money step, the `70, 30` DSL, F-065, F-103 b.
  - `[beta #2]`: F-049.
  - `[beta #5]`: F-063 C, the live-scoring pass, offline/PWA (sw.js caches the shell, not data).
  - `[beta #6]`: stroke vs match, CH renderings / F-062 B, F-064 B, F-102 h, F-103 c.
  - `[beta #7]`: polish loss-red, F-039 colour, F-066 close-out landing, §7 q4.
  - `[beta #8]`: JSON export (only the tournament page has one, at :370).
  - `[beta #9]`: F-037.
  - `[beta #10]`: test-process leftovers, gate memory.
  - `[beta #11]`: Event P3 / multi-day.
  - `[after-beta]`: S2, the 9-hole F/B columns, F-030 C, Phase 2 residue, hide-holes in the wizard,
    F-102 leftovers, flights, tournament team math, F-013, F-067, F-101 e.
  - `[deferred]`: the course-data audit / F-023 B, §5c / F-002, Vegas/BBB, 9-hole scramble dots, renames,
    the trainer.

## Phase A (agent 2026-10-01)

Every Phase A item is OPEN except the A5 doc rows.

**A1, §5.cb:**
- `getPoolGameListForGhin` is owner-only (`pool-game.ts:2559`).
- `getTournamentList` is unscoped (`tournament-state.ts:353`).
- `tournamentVisibleTo` (:372) is owner-only and called only by a test.
- Every page uses the owner list.

**A2:**
- F-103 b: `play/page.tsx:812-860` has no mode guard.
- F-103 c: the risk is REAL. `setCtpWinner` (`play:2144`) merges against the local cache, then
  `savePoolGame` upserts the whole row, so the last write wins. The hub has the same pattern
  (`settings-editor.tsx:574`). The comment at `play:2146` claims a protection it doesn't give.

**A3:**
- `scoreAt` is a linear find (`context.ts:90`).
- The balancer deadline is `Date.now()+800` (`pool-game.ts:1118,1153,1233`).
- Palettes are mod 6 (`play:1420/1809`, `leaderboard:809`).
- "21th" comes from `team-game.ts:798` only.

**A4:**
- `home/stats/page.tsx:44` has no "+".
- `home/groups/[id]/page.tsx:333` has no "+", uses cents, and uses an inline template. Use a shared
  helper there.
- Match-play holes-won get a "+" from `fmtMetric` (`leaderboard:895`, `team-game.ts:811`, 'match pts').

**A5:**
- F-089 (c60ae11), F-030 B (a22e359) and F-015 are done.
- F-090 was SUPERSEDED by e07ad10.
- F-037 is partly done; A (fit hint) and B (pairings axis) are open.
- BACKLOG row 22 is done; row 26 is stale.
- The Team Competition row is done (f163242).
- The GAME_STRUCTURE_DESIGN questions at :132 are unmarked.
- 54 fixed findings are still in the live file.
- The step-bar screenshots were not checked.

**Legacy owner-less tournaments** are visible to everyone (spine q2); §5.cb needs that answered.

## Phase B (agent 2026-10-01)

No Phase B item has been built, and none was decided against.

| Item | Verdict | Evidence and notes |
|---|---|---|
| B1 Run it back | OPEN | The parts exist: `formatFromGame` (`pool-formats.ts:48`) and the format seed (`pool/new:415`). The draft skips players and teams (`pool/new:410`). |
| B2 The usual | PARTLY | Scoring already collapses when a format is applied (`scoring-step.tsx:59,115`; F-021). Missing: "last format at last course → Review" after Players. |
| B3 Send to players first | OPEN | Create runs `router.push` (`pool/new:701`). The primary button is Leaderboard (`[id]:369`). Share is a small header link (`[id]:328`). |
| B4a Sides re-asks split | PROBABLY STALE | Pre-F-071: the Teams step now reads `teamSizes` (`teams-step:87`), and "Other split…" exists. Maybe "How do they split?" (`playing-groups-step:118`). Re-walk it. |
| B4b Teams blocks Next | OPEN | `canProceed` needs no one unassigned (`teams-step:326`). There's no pre-build. |
| B4c No captains vs Captains' deal | OPEN | The toggle is at `teams-step:341`; the method stays listed (:416). |
| B5 Adding players | PARTLY | Group members already come first. Missing: recents (the roster is alphabetical, `field-step:369`) and pasting names (GHIN numbers only, `add-player-panel:67`). The duplicate field list is still at `field-step:478`. |
| B6 Guest remembers group | OPEN | Guests see My Games (`[id]:350`). The nearest thing is the F-049 guest line. |
| B7 Plain words | OPEN | Sites: `scoring-step:264,334,351`; `settings-editor:662`; `summary-cards:74`; `home/groups/[id]:297` ("Casual round"); `field-step:491` (M = gender pill); `money-panels:27-33` (stakes print the label plus the raw number). CHcp only shows on game/play and tournament. |
| B8 Group courses by frequency | PARTLY | "Played recently" is `getRecentCourses` (`pool-game:2522`): the organizer's own games, newest first, at most 5. It isn't per group and isn't by frequency. |
| B9 Hide Finish / Close out | OPEN | `GameCloseOut` always renders (`[id]:497`, `money-panels:205`). It already has `fullyScored`, but no "any score" check. "Finish Game" is at `play:1913`. |

**Correction to the roadmap's line 186:** F-091/F-092/F-096 are hub layout, junk-pot naming and pot
inputs, not Sides/Teams defaults.
