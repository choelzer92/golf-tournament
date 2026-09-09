<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# This project

**Goal: an intuitive UI that makes starting, tracking, and continuing a golf game
as easy as possible — with more possibilities than any other app on the market.**

The central tension is **maximum possibility, minimum exposed complexity**.
Configurable ≠ complicated: every option needs a sane default, `showIf` hides it
until relevant, and "just the usual game" must never require touching one. If a
new capability demands a bespoke screen, that's a design smell.

All three verbs matter. **"Continuing" is the most neglected and most valuable** —
state surviving a sleeping phone, a guest joining at the turn, a score fixed after
the fact, and a season-long money ledger. Bias effort there.

## Read these first

- **`DECISIONS.md`** — Craig's decisions, corrections, and preferences *with the
  reasoning*. Read before proposing anything about product direction, process, or
  safety. Append to it in-session whenever he decides something; a decision that
  lives only in a chat transcript is lost. Its §7 lists open questions — don't
  re-ask what's already settled, and don't guess where it says his call.
- **`UI_CONVENTIONS.md`** — money formatting, vocabulary, labels, empty states,
  layout, and the lifecycle rules. Read before changing any screen.
- **`UI_CRITIQUE_PROCESS.md`** — the loop for seeing the UI, recording findings,
  and proposing options. Follow it rather than critiquing ad hoc.
- **`FINDINGS.md`** — the running findings log (observation + options + status).
- **`UI_MODE_AUDIT.md`** — the surface × game-mode audit method and the original
  code sweep. Use its grep probes when hunting for cross-mode drift.

## The one rule that prevents most bugs

Two parallel presentation axes exist: the classic **team** pool (N foursomes) and
**single-group** games (`individual` + `team-within-group`, i.e. 2v2). Both render
from `pool/[id]/leaderboard/page.tsx`, branching on `isSingleGroupGame(game)`
(`lib/game-modes/result.ts`).

> Touching a shared surface? Check **both** sides of that branch.

Most findings in the audit were one axis drifting from the other — each screen
individually fine, only wrong when compared.

## Architecture worth preserving

- **The compute layer is pure.** Nothing in `lib/game-modes/*` or
  `money-games.ts` touches Supabase, fetch, storage, `Date.now()`, or randomness.
  Keep it that way — it's what makes the money math testable.
- **All persistence is contained.** Every Supabase call lives in 5 lib files
  (`pool-game`, `tournament-state`, `roster`, `roster-groups`, `solo-round`).
  Pages never talk to the DB directly. Don't add a call site in `app/`.
- **Adding a game mode = one file + one registry line.** Settings render
  generically from each mode's `FormatSetting[]`; no bespoke settings screens.
- **The money engine is the source of truth for strokes.** The scorecard defers
  to it (`getMoneyStrokesOnHole`) so on-screen dots always match payouts.

## How to work here

**Document first, change on request.** Investigate, analyze, and report freely —
reading, grepping, typecheck/build/tests risk nothing. But changing app code
happens when Craig asks for it, not on your own judgment. Write findings down
(see `UI_MODE_AUDIT.md` for the format) and propose; don't fix on sight.

**Stop and ask** before anything that:
- changes money, handicap, or scoring math
- alters a rule mid-round (e.g. how a scorecard computes team rows)
- is irreversible or touches live data
- has more than one defensible answer

Small mechanical fixes inside already-authorized work (a typo, a missing import)
don't need a check-in — just mention them.

**Never commit or push** unless explicitly asked.

## Working through the todo list

`npm run verify` is the gate: unit tests → typecheck → production build → e2e, all
unattended. **A todo is not done until it exits 0.**

The loop per todo:

1. Mark it `in_progress` (TaskUpdate) so the list shows where you are.
2. Read the todo's description — it carries the constraints and the recommended
   approach, so you don't re-derive them.
3. Implement, following the working rules below (ask before money/handicap/scoring
   math, or where more than one answer is defensible).
4. `npm run verify`.
5. Add an e2e assertion for anything user-visible, tagged with the finding id where
   there is one (`test('F-012: …')`).
6. Commit — one focused commit per todo, so any single change is revertible.
7. Mark it `completed` and move to the next.

**What NOT to do unattended:** anything the todo flags as needing Craig's decision.
Tasks #3 (format ceiling scope) and #4 (bonus type shape) are blocked on him by
design — don't pick a schema and build on it. Skip to the next actionable todo and
say what's waiting.

**Why the branch matters:** work lands on a feature branch, never `main`, so Craig
reviews the whole flow before anything reaches the friends using the live app. Don't
merge or push unless asked.

## Seeing the UI

`NEXT_PUBLIC_SANDBOX=1 npx next dev --port 3200` runs the app against an
in-memory backend (`src/test/fake-supabase.ts`) — no credentials, no network, no
Docker, and structurally unable to reach the live database. `/sandbox` seeds any
game state in one click; `npx playwright test` drives it and writes screenshots to
`e2e/screenshots/`.

Two hard-won rules:

- **Dev-only code must be ABSENT from production builds, not just unreachable.**
  Guarding a render with a flag still shipped the sandbox seed logic into
  production JS. `next.config.ts` `pageExtensions` excludes the route entirely;
  `src/test/no-sandbox-in-build.test.ts` greps the build to prove it.
- **Every e2e test must assert it reached the right screen** (`waitForURL` or a
  positive assertion on something only that screen has). One early test passed
  vacuously on the wrong page — green and meaningless.

## Testing

`npm test` (vitest) covers the **pure compute layer** — every game mode's money
math, handicap strokes, Nassau/junk settlement, both leaderboard axes.
`src/test/fixtures.ts` builds a `PoolGame` in one line; `fixtures.test.ts`
verifies the two assumptions every other assertion rests on (Course Handicap ==
Handicap Index, stroke index == hole number).

Rules that keep this valuable:

- **Never change app code to make it testable.** The compute layer is already
  pure — that's why no production code needed touching to add these tests. If a
  test seems to need a hook in `src/`, the test is wrong.
- **Assert money is zero-sum.** Every mode, every money model. It's the invariant
  that catches real bugs.
- **Exercise `playersMin`, not just a foursome**, and both 9-hole handicap bases.
  Several real bugs lived exactly there.

## Safety

`.env.local` points at the **live** Supabase holding real games — the app is
deployed and publicly reachable. Never run scripts that write to it for testing.

Tests are isolated by two independent mechanisms, both verified:

1. Vitest doesn't load `.env.local` (that's a Next.js behavior), so the
   credentials simply aren't present in a test process.
2. `src/test/setup.ts` stubs `@/lib/supabase` so every persistence method throws,
   hard-fails the run if those env vars ever appear, and makes any network call
   an error.

Anything needing real persistence (e.g. future Playwright work) must use an
injected in-memory store, not the live client.
