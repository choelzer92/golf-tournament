# Next session: Craig's feedback batch, then pick from BACKLOG.md

Say this in a fresh session: **"Read NEXT_SESSION_PROMPT.md and follow it."**

---

Read `AGENTS.md` first.

## First: Craig's feedback

Craig said (2026-09-10, mid-session): *"I have some feedback that I'd like to address in the
next session."* **Start by asking him for it.** Capture each item in FINDINGS.md/BACKLOG.md
with his words, decide together what gets built this session, and record any decisions in
DECISIONS.md as usual.

## State: the wizard track is DONE (both halves, this branch, verify green)

Branch `captains-deal-and-game-rename` — still awaiting Craig's review/merge (it now carries
§5.ay, §5.az, F-022..F-026, §5.av, §5.au). Check `git branch`; if merged, branch fresh off
`main` (§5.ab).

- **§5.av (b69b665)** — the game picker leads with a "Your saved games" optgroup; picking a
  format fills everything and lands on the F-021 confirmation; picking a raw mode afterwards
  configures fresh. A classic-pool format (no `gameMode`) clears the mode explicitly — new
  fixture `f-classic-pool` ("JY Classic Pool") pins it.
- **§5.au (f08dd22)** — step order is now **field → game → course → tees → [groups] →
  teams/sides → money**. The group chips moved to the field step and load members
  immediately. Two traps that were real: `formatSeedApplied` became a REF (the field step
  mounts before the parent consumes the format seed), and the group-loaded name courtesy
  needed a functional setState (async group seed saw a stale `''`). Players added before a
  course exists get tees re-resolved when the course lands (`useEffect` on `course`).

Also still true: a stale `next dev` on port 3200 makes every e2e time out (`netstat -ano |
grep :3200`, kill the PID). And check the verify exit code itself, not a `tail` of its log.

## Then: everything else is in BACKLOG.md

The waiting-on-Craig list (GHIN spot-check of F-022, The Meadows `GetCourseDetails` payload
for F-023 part B, branch merge), the shaped next items, and the bigger arcs all live there.
**End the session by grooming it.**

## Rules that keep earning their place

- **The GHIN app outranks the rule book** (§5.ba); §5.bb records the allowance order.
- **Read the history before re-fixing** (`git log -S`).
- **Look at the screen** — the reorder's step indicator and group chips were only checkable
  in screenshots.
- **Both sides of every branch**; classic pool keeps "Foursomes", individual games say
  "Players".
- `npm run verify` must exit 0 before each commit — and read ITS exit code, not the log tail.
