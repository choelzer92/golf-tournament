# UI critique process

A repeatable loop for **looking at the app, recording what's wrong, and turning
each finding into options you can choose from** — without anything getting fixed
on a whim or lost between sessions.

Built because the sandbox harness (`src/test/fake-supabase.ts`) made it possible
to actually see the UI. The first pass immediately found something no unit test
would have caught (the Nassau "thru 9" label), which is the whole argument for
having a process rather than doing it ad hoc.

---

## The loop

```
1. SEED      one-click state via /sandbox
2. CAPTURE   screenshot at phone + desktop viewport
3. CRITIQUE  compare against UI_CONVENTIONS.md + the north star
4. RECORD    append a finding to FINDINGS.md (never fix in this step)
5. OPTION    write 2-3 concrete fix options per finding, with tradeoffs
6. DECIDE    Craig picks; only then does code change
7. VERIFY    add an e2e assertion so the finding cannot silently return
```

Steps 1–5 are mine to run freely: no app code changes, nothing at risk. Step 6 is
yours. Step 7 is what makes the fix permanent.

**The discipline that matters: separate observation from repair.** A finding
recorded is worth more than a finding fixed, because the record is what lets you
weigh 15 problems against each other instead of accepting whichever one I
happened to touch first.

---

## Running it

```bash
# 1. start the sandbox (in-memory backend, cannot reach the real DB)
NEXT_PUBLIC_SANDBOX=1 npx next dev --port 3200

# 2. capture a screen set
npx playwright test e2e/critique.spec.ts

# 3. screenshots land in e2e/screenshots/ (gitignored — they're regenerable)
```

Add a scenario to `src/app/sandbox/page.sandbox.tsx` when a state can't be reached
yet. Add a capture to `e2e/critique.spec.ts` when a screen isn't covered.

---

## What to critique against

In priority order. A finding should always name which one it violates.

1. **The north star** — easy to *start, track, continue*; more possibilities than
   any app on the market; **maximum possibility, minimum exposed complexity**.
2. **`UI_CONVENTIONS.md`** — money format, vocabulary, name truncation, empty
   states, colour meaning, panel order.
3. **The golfer's context** — phone, one hand, sunlight, glove, cart-path wifi,
   group waiting. If a screen needs two hands or a second look, that's a finding.
4. **Cross-mode consistency** — both sides of `isSingleGroupGame`, 2/3/4 players,
   front/back/18 holes.

### Questions that reliably surface findings

- **Tap count.** How many taps from launch to first score entered? Each one needs
  to justify itself.
- **Can I tell what's happening without reading?** Glanceable beats legible.
- **What does a first-timer not understand?** Jargon, unexplained defaults,
  options with no visible consequence.
- **What's on screen that didn't need to be?** Exposed complexity is the north
  star's enemy.
- **What happens when it's empty / partial / offline / one-handed?**
- **Would a golfer trust this number?** Money especially — ambiguity reads as a
  bug even when the math is right.

---

## Recording a finding

Append to `FINDINGS.md`. One entry, this shape:

```markdown
### F-012 — Wizard step 3 buries the tee selection  [P2] [start]

**Screen:** /pool/new step 'tees' · `e2e/screenshots/wizard-tees-phone.png`
**Violates:** north star (minimum exposed complexity); UI_CONVENTIONS §6

**Observed:** Every player gets a full tee dropdown listing 5 tees, even though
94% of games have everyone on one tee. The common case costs 4 taps.

**Why it matters:** This is the parking-lot path with the group waiting — the
single most time-pressured screen in the app.

**Options**
- **A. One tee for the group, "per-player" as an opt-in link.** 4 taps → 1.
  Cost: a second screen for mixed-tee games (rarer, and already slower).
- **B. Default every player to the group's modal tee, keep dropdowns visible.**
  Smaller change, no new screen. Doesn't reduce visible complexity.
- **C. Leave it.** Correct for mixed fields, which the app explicitly supports.

**Recommendation:** A — it matches "minimum exposed complexity" and the rare case
degrades gracefully.

**Status:** open
```

Fields that earn their place:

- **ID** (`F-###`) so it can be referenced in a commit or a conversation.
- **Severity** — `P1` wrong data or money · `P2` visibly confusing or slow ·
  `P3` cosmetic. Same scale as `UI_MODE_AUDIT.md`.
- **Phase tag** — `[start]` `[track]` `[continue]`, from the north star's three
  verbs. Lets you see which phase is weakest. (`continue` is the historically
  neglected one.)
- **Screenshot path** — so the claim is checkable, not just asserted.
- **Options with costs** — a finding without options is a complaint. Always
  include the "leave it" option; sometimes it's right.
- **Status** — `open` → `chosen: B` → `fixed (commit abc123)` → `verified (e2e)`.

### Rules

- **Never fix while critiquing.** Record it and move on, even for one-liners.
- **One finding per entry.** "The wizard is confusing" is not a finding.
- **Cite the violated principle.** If it doesn't violate one, it may be taste —
  say so explicitly and let Craig judge.
- **Recommend, don't decide.** Always say which option I'd pick and why.
- **A screenshot is evidence.** No screenshot, no finding.

---

## Verifying a fix (step 7)

Every fixed finding gets an e2e assertion in `e2e/verify-fixes.spec.ts`, tagged
with its ID:

```ts
test('F-012: tee step defaults to one tee for the group', async ({ page }) => { … });
```

That converts a one-time fix into a permanent guarantee. It's how the 11 fixes
from the first audit stopped being "verified once."

**A hard-won caveat on e2e tests:** one of the first verification tests passed
*vacuously* — it never left the hub page, so `not.toContain('Team A')` was true
about a screen that never said it. It went green and meant nothing. So:

> **Every e2e test must assert it reached the right screen first**
> (`waitForURL`, or a positive assertion on something only that screen has),
> and should assert what SHOULD be present, not only what shouldn't.

A test that can pass without exercising anything is worse than no test.

---

## Limits of this process

State these whenever reporting results:

- The backend is a `Map`. This proves **rendering, labels, vocabulary, flow** —
  not persistence, RLS, realtime delivery, or multi-device merge.
- Screenshots are a headless Chrome render. Real-device rendering, touch
  ergonomics, and sunlight legibility are **not** covered. Some findings will
  need your eyes on an actual phone.
- I can spot convention violations and friction. I can't tell you what *your*
  golfers want. Where a finding is taste, it says so and defers.
