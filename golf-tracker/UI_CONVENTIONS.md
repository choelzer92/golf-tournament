# UI conventions

**North star: an intuitive UI that makes starting, tracking, and continuing a
golf game as easy as possible — with more possibilities than any other app on
the market.**

Every rule below serves that sentence. When a rule and the north star conflict,
the north star wins — and then fix the rule.

## The central tension

Those two halves pull against each other, and that tension *is* the product
problem:

> **Maximum possibility, minimum exposed complexity.**

Competitors pick a side. Most apps ship 3 formats that are dead simple; a few
ship deep configurability behind a spreadsheet. The bet here is that you can have
the deep engine *and* a UI a 70-year-old can drive in a parking lot — because
depth costs nothing until it's asked for.

The mechanism that makes that possible, and must be preserved:

- **Defaults carry the weight.** Every setting has one that makes a legal,
  sensible game. "Just the usual" requires touching zero options.
- **Progressive disclosure is structural, not cosmetic.** `showIf` hides an
  option until it's relevant, so a 30-setting mode presents as 6.
- **Reuse collapses the second game to seconds.** Groups, saved formats, and
  rosters exist so configuration is a one-time cost, not a per-round tax.
- **Modes are pluggable and self-describing.** New possibilities arrive without
  new UI, so breadth never taxes the interface.

If a new capability forces a new bespoke screen, that's a design smell — the
possibility is welcome, the exposure isn't.

## The lifecycle is the product

The north star names three verbs, and each has a distinct failure mode:

| Phase | Where | Fails when |
|---|---|---|
| **Start** | `/pool/new` wizard | too many taps; a dead end; an option you can't skip |
| **Track** | scorecard + live leaderboard | slow to enter a score; can't tell where you stand; stale under bad wifi |
| **Continue** | hub, share links, formats, history | lost state; can't rejoin; can't fix a score; last week's game vanishes |

**"Continue" is the most neglected and the most valuable.** Anyone can build
score entry. What keeps a group coming back is that the game survives a phone
sleeping, a guest joining at the turn, a mis-entered score on hole 4, and a
question about who owes whom three weeks later. Bias effort there.

Concretely, that means: wizard state persists · share links work without login ·
scores stay editable · realtime self-heals and polls as backstop · a finished
game reaches the ledger (the whole point of `status:'completed'`).

## Three consequences that decide most arguments

1. **Configurable ≠ complicated.** Depth is fine; *exposed* depth is not. Show an
   option when it becomes relevant, never before.
2. **Every phase is held to the phone-in-sunlight bar,** not just setup. A
   leaderboard read one-handed on a cart is as critical as the wizard.
3. **Consistency IS ease.** The audit that produced this file (`UI_MODE_AUDIT.md`)
   found ~11 issues, and almost none were logic bugs — they were two screens
   disagreeing. Each screen was individually fine. Nothing was "wrong" until you
   compared them. That's exactly the class of bug a written convention prevents
   and a unit test cannot. Breadth makes this worse: every new mode multiplies the
   surfaces that can drift, which is why the §0 rule matters more as the app grows.

---

## 0. The rule that generates most of the others

This app has two parallel presentation axes, built at different times:

| Axis | Result | Renderer |
|---|---|---|
| **team** — N foursomes compete | `PoolResult` (`kind:'team'`) | top-level component in `pool/[id]/leaderboard/page.tsx` |
| **single-group** — `individual` + `team-within-group` | `IndividualResult` | `<IndividualLeaderboard>`, *same file* |
| **tournament** — 2 teams, rounds | `matchup.result` | `tournament/[id]/*` |

`isSingleGroupGame(game)` (`lib/game-modes/result.ts`) is the one branch point.

> **Touch a shared surface → check BOTH sides of that branch.**

This single habit would have caught the majority of the audit findings. When you
add a panel, add it to both axes or write down why it's one-sided.

---

## 1. Money & numbers

**Dollars use one helper. Never inline a currency template literal.**

```ts
const money = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}$${Math.abs(Math.round(n))}`;
```

- Sign goes **outside** the `$`: `−$12`, never `$-12`. (Real bug: the two
  leaderboard branches disagreed on this in the same file.)
- Minus is U+2212 `−`, not a hyphen. It aligns in tabular figures.
- Money rounds to whole dollars in game UI. Cents appear only in the
  stats/settlement ledger, which is an accounting surface (`toFixed(2)`).
- Tone: `text-green-400` positive · `text-red-400` negative · `text-gray-500`
  zero. Zero is **grey, not green** — flat is not winning.

**Metrics are not money.** Signed point metrics (9s, quota, match points) get a
leading `+`; a raw stroke total (net/gross 72) must never be `+`-prefixed. See
`isStrokeMetric` in the leaderboard.

**Handicaps:** display rounded whole strokes (`Math.round(playingHcap)`), but
never round mid-calculation — round at the end, once. USGA allowance and
off-the-low order matters; the money engine is the source of truth and the
scorecard defers to it (`getMoneyStrokesOnHole`), so dots always match payouts.

---

## 2. Vocabulary — say what the game actually is

The worst offenders in the audit were words, not pixels. A 2v2 game is not a
"foursome," and calling it one makes a golfer distrust the whole screen.

| Concept | Classic pool | Single-group game |
|---|---|---|
| The unit that competes | **foursome** / team | **side** (2v2) or **player** |
| Collection heading | "Foursomes" | "Players" |
| Subtitle | `Pool Money Game · N foursomes` | `{mode.name} · N players` |
| Standings column | "Player" | "Side" for 2v2, "Player" otherwise |

Rules:

- **Never print "foursome" for a single-group game.** It is one group of 2–4.
- **Always pluralize from the count.** `N foursome${n === 1 ? '' : 's'}`. "1
  foursomes" shipped to real users.
- **Name the format in the header.** A pot pool and a head-to-head match pool
  must be distinguishable at a glance; "Thru hole 7" alone isn't enough.
- **Say the rule that's actually in effect.** Junk settles earner-vs-group in
  individual games but *side-vs-side* in 2v2 (`settleJunkForSides` nets the two
  sides and moves only the difference). A shared caption that states one rule is
  lying to half its users.

---

## 3. Names & labels

**The trap:** `name.split(' ')[0]` is everywhere and is correct for *people* —
but a side label is `"Craig & Jym"`, and truncating it yields `"Craig"`, which
silently renames a team after one of its members.

```ts
const displayName = (n: string) => (isWithinGroup ? n : n.split(' ')[0]);
```

- First names for **people** (space is scarce on a phone; surnames rarely
  disambiguate a foursome).
- Full string for **side / team labels**. Never truncate a composed label.
- Custom name always wins, then a derived name, then a generic fallback:
  `sideAName` → `"Craig & Jym"` → `"Side A"`. One helper: `sideNameFrom()`.
- The same label must appear on **every** surface for that entity. A side named
  "Craig & Jym" on the leaderboard cannot be "Team A" on the scorecard.

**Captions must be derived from data, never hardcoded.** A 9-hole 2v2 collapses
to one leg, so a literal `"Front · Back · Overall"` header sat above a lone
"Back 9" row. Build the caption from the legs actually present.

Likewise, **never hardcode a field size.** `winnerNames.length >= 4` broke every
2- and 3-player game (several modes allow `playersMin: 2`) by describing a dead
heat as someone leading. Compare against the real field.

---

## 4. Empty, not-started & partial states

A golfer opens the leaderboard before anyone has scored. That's a normal state,
not an error, and it should read as "waiting," never as "broken" or "$0."

| State | Reads as |
|---|---|
| No scores at all | `No scores yet.` (centred, `text-gray-500`) |
| Segment not begun | `Not started · splits evenly` — say what happens, not "—" |
| Everyone tied | `All tied · splits` (needs real field size, §3) |
| Leg with no winner yet | `TBD` |
| Finished but unscored in-app | `Not scored in the app — no money data.` |
| Nothing to roll up | `No finished games yet.` + how to get there |

Rules:

- **Explain the consequence, not just the absence.** "Not started · splits
  evenly" tells a golfer their ante is safe. "—" makes them wonder.
- **Distinguish "no data" from "zero."** An unplayed back nine is not $0.
- **A partial round is first-class.** Every panel takes `thru`; nothing waits for
  18 holes to render something useful.
- **Stroke dots show before a score is entered.** Which holes you get a shot on
  is known at setup — that's information a golfer wants *on the tee*.

---

## 5. Layout, hierarchy & mobile

**Phone-first, one-handed, in sunlight, on cart-path wifi.** That's the device.

**Surface palette** (already consistent — keep it):

- **Light** (`bg-gray-50` + `bg-green-800` header) = *setup & management*:
  wizard, hub, roster, formats, printables.
- **Dark** (`bg-gray-900` + `bg-gray-800` header) = *live competition*:
  scorecard, leaderboards, scoreboards. Dark = "the game is on."

**Widths:** `max-w-3xl` management (50 uses) · `max-w-4xl` leaderboards (11) ·
`max-w-lg` the scorecard itself (4 — thumb-width, deliberately narrow).

**Panel shell** — every leaderboard block is the same object:

```tsx
<div className="bg-gray-800 rounded-xl overflow-hidden">
  <div className="px-4 py-2 border-b border-gray-700">
    <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Title</p>
  </div>
  {/* body */}
</div>
```

**Leaderboard panel order** — money answers first, evidence after:

1. Overall banner (head-to-head only)
2. Standings / per-hole grid
3. Payouts (pots or legs)
4. Per-person money
5. Mode breakdowns (Nassau, junk, Wolf, 2v2 legs)
6. Player Details (per-hole grid + strokes box)
7. Score audit

**Colour meaning is fixed and never decorative:**

| Colour | Means |
|---|---|
| green | ahead / winning / low score / money won |
| red | behind / money owed |
| yellow | **tied** (and tied-low on a hole) |
| blue / red pair | side A / side B — identity, not valence |
| grey | inactive, zero, unscored |

Note the collision: blue/red as *team identity* vs red as *losing*. Keep team
identity to name labels and left borders; keep valence to numbers.

**Defaults:** Player Details **expanded** (post-round, everyone wants gross
immediately); "strokes given" and audit **collapsed**. Track what the user
*collapsed*, so empty set = all open.

**Tables:** sticky first column (`sticky left-0 bg-gray-800`), `min-w` on hole
cells so 18 columns scroll rather than crush, F/B/Tot totals on a tinted cell.

**Save feedback:** the hub saves on every edit with no submit button — so it must
**say so** and flash "Saved ✓". A real organizer didn't trust that his changes
stuck. Silent success is indistinguishable from failure.

---

## 6. Starting a game (`/pool/new`)

- **The step list adapts to the game.** Individual games skip team-building
  entirely; 2v2 replaces "Teams" with "Sides." Never show a step that can't
  apply — see `StepIndicator`.
- **Options render generically from the mode's `FormatSetting[]` schema.** Adding
  a game must not require a bespoke settings screen. Honor `showIf` so only
  relevant options appear, and honor it *identically* in the editor and the
  read-only summary — create and view must agree.
- **Every setting has a default that makes a legal game.** "Next" is always
  available; nothing is a dead end.
- **No GHIN required.** Manual add (name + index) is a first-class path, not a
  fallback — a share-link guest has no login.
- **Persist wizard state.** Phones sleep and browsers reload mid-setup.
- **Reuse beats re-entry.** Groups, saved formats, and rosters exist so the
  second game takes seconds. Seed the wizard from them.
- **Switching mode mid-setup keeps scores** (they're gross, per player) but
  **resets money** to the new game's natural default — and says so, because a
  silent money change is a betrayal.

---

## 6b. Tracking a live game

The scorecard is the most-used screen in the app. It's used standing up, in
sunlight, wearing a glove, between shots.

- **Score entry is one tap.** Tap-a-number, not a stepper or a keyboard. Targets
  stay thumb-sized (`w-9 h-9` minimum); `max-w-lg` keeps them in thumb reach.
- **Current hole is always obvious** and auto-advances sensibly. Hole dots show
  which holes are complete at a glance.
- **Show standing without leaving the card.** A golfer shouldn't navigate to
  learn if they're up. That's what the overview panels are for — and why they
  must be suppressed when meaningless (a "1st of 1" panel is noise).
- **Strokes are visible before scoring** (§4) — shots-received is tee-box info.
- **Never block on the network.** Optimistic local writes, then sync. Realtime is
  primary, a 15s poll is the backstop, and re-subscribe re-syncs. Guest wifi
  killing WebSockets must not stop a round.
- **Nothing is unrecoverable.** Every entry is editable; edits are audited.
- **Wake lock during a round** — the screen shouldn't sleep between shots.

## 6c. Continuing — across the turn, the day, the season

The most under-served phase, and the reason a group comes back:

- **Rejoining is frictionless.** A share link opens *this* game and scores
  without login or invite code. Someone joining at the turn is a normal case.
- **State survives everything.** Phone sleep, reload, browser death mid-wizard.
  Cache-then-fetch on every load so a cold open shows something instantly.
- **Fixing a past score is expected, not exceptional.** A closed-out game can be
  reopened; corrections are normal golf.
- **A finished game must land in history.** `status:'completed'` is what the
  stats & money ledger selects on. A game that never reaches it is invisible
  forever — this was a real bug, not a hypothetical.
- **Money settles across games, not just within one.** Who owes whom, over a
  season, is the question groups actually argue about.
- **Yesterday's setup seeds tomorrow's.** Formats and groups exist so a recurring
  game is never configured twice.

---

## 7. Checklist for a new panel or game mode

- [ ] Renders on **both** sides of `isSingleGroupGame` — or documented why not
- [ ] Uses the shared `money()` helper; sign outside the `$`; zero is grey
- [ ] Field size and hole count derived from the game, never literals
- [ ] Captions/labels derived from data, not hardcoded strings
- [ ] Side labels not first-name-truncated
- [ ] Vocabulary matches the axis (foursome vs side vs player), pluralized
- [ ] Empty / not-started / partial states all say something useful
- [ ] Works at 2, 3, and 4 players; on a front nine, a back nine, and 18
- [ ] Any stated settlement rule is true for *this* mode
- [ ] Money is zero-sum across the group at every moment

---

## Open questions for Craig

Guesses inferred from the code — correct these:

1. **Green = winning, or green = money?** They coincide today. If a mode ever
   pays the loser, which wins?
2. **Blue/red team identity vs red = losing.** Worth a distinct side palette?
3. **Is "sides" the right word** for 2v2, or do golfers in your group say
   "teams"? I standardized on *side* to reserve *team* for foursomes.
4. **Dark = live, light = setup** — deliberate, or accident? I've written it as
   deliberate because it reads well.
5. **How much configurability belongs on the first screen** vs behind "more
   options"? This is the sharpest tension with the north star.
