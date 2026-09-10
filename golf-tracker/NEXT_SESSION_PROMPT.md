# Next session: Craig's live-app feedback batch (2026-09-10)

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first.

**State:** branch `captains-deal-and-game-rename` carried §5.ay, §5.az, F-022..F-026, §5.av,
and §5.au — Craig was about to merge it at the end of the 2026-09-10 session. Check
`git branch`: if merged, work fresh off `main` on a NEW branch (§5.ab); if not, ask before
building on the unmerged branch.

## The work: four feedback items, all observed on the LIVE app (not branch regressions)

BACKLOG.md "Now" has the full wording. In suggested order:

1. **Group tap selects ALL members** (S–M) — tapping a group chip pre-checks every member;
   at 61 members, picking the 12 playing today means unchecking ~49. The day's field should
   be picked BY checking. Likely shape: above some size, load a group with members
   unchecked (or ask); a 4-man crew probably still wants all-checked. The chips live on the
   wizard's FIELD step (`loadGroup` in `pool/new/page.tsx`) since §5.au.
2. **Bring back classic golf verbiage** (S) — Craig: "i liked the verbiage before just off
   the low, not the basic explanation of what classic golf terms mean." Label the option
   **"Off the low"**, not "Only above the best player". Sweep the wizard's handicap/scoring
   copy for other over-explained classic terms. Golfers know these words; explaining them
   reads wrong. (The explanatory helper text UNDER a control may stay — it's the control
   labels that must use the real terms. If in doubt on a specific string, ask.)
3. **My-groups page: handicaps render but NAMES are blank** (?) — diagnose, then propose.
   Rows render and handicaps show, so `playerIds` resolve — the `name` field specifically is
   lost between the live DB and `/home/groups/[id]`. Suspects: row saved with empty `name`;
   name and handicap read from different sources on that page; a snake/camel mapping miss on
   `name` in that page's hydration path. **Live data: investigate READ-ONLY** (grep the code,
   reproduce in sandbox if possible); never run scripts that write to the live DB.
4. **In-app feedback box** (S–M) — a friend uses the app; give him a small always-reachable
   text box that saves observations to the live DB with who/when/which-game, plus a simple
   way to read entries back in a work session. Feeds FINDINGS.md. Keep it tiny: a text box
   and a list, not a ticket system. NOTE: this WRITES to the live DB — new table, additive
   only; get Craig's OK on the shape before building.

Items 1, 2, and 4 change app behavior/copy — per AGENTS.md, confirm anything with more than
one defensible answer (the group-size threshold in #1, specific strings in #2, the shape of
#4) with Craig before locking it in.

## Traps that keep biting

- A stale `next dev` on port 3200 makes every e2e time out (`netstat -ano | grep :3200`,
  kill the PID, rerun).
- Check `npm run verify`'s own exit code, not a `tail` of its log — a green-looking tail hid
  a real failure this session.
- **Look at the screen** — screenshots caught what code review didn't, again (the group
  chips' select-all behavior reads fine in code).

## Still waiting on Craig (unchanged)

- F-022 on-course GHIN spot-check (now live if merged — §5.ba screenshot protocol if off).
- The Meadows `GetCourseDetails` payload for F-023 part B.
- §7 q4 (dark = live / light = setup).

## End the session by grooming BACKLOG.md

Mark done, add discovered, promote next. That ritual is the method (§5.bc).
