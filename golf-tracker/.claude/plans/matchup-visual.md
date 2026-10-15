# The matchup visual — design note (§5.da, F-115 step 2). For Craig to pick; NO code yet.

## The ask

§5.da: step 2's match question is **option A**, "How do the teams play each other?" (whole teams /
pairs / one on one). Craig wants it **decided early**, "because this information would help inform how
matchups should be decided", with "a clear visual that can be moved around in the wizard". The visual
drives the **pairings** (who plays whom) and the **tee groups** (who walks together).

## What's true today (so the note doesn't invent constraints)

- Wizard order (§5.au): field → structure ("How do you want to compete?") → scoring → course → tees →
  teams → groups (only when teams don't fill foursomes) → money/Review.
- The match question sits on **structure** as "Head-to-head matches? No / 1 v 1 / 2 v 2", and only when
  every team is bigger than the match (`matchSizesFor`, `matches.ts:455`). A 2v2's only option is 1 v 1.
- With matches on, the app BUILDS the tee sheet from the matches (§5.co: a foursome per 2 v 2, two
  singles per foursome) and stores singles pairings on the tee group (§5.cq). An edit that breaks a
  pairing is refused with the reason, never silently re-paired.
- The field is known at step 2 (field first), so the visual can show **real names**, not slots.

## The question, reworded (option A, same for all three layouts)

    How do the teams play each other?
    ( • ) As whole teams — 4 v 4          ← default, always first
    (   ) In pairs — two 2 v 2 matches
    (   ) One on one — four 1 v 1 matches

Only the answers the split allows are listed (a 2v2 shows "As whole teams — 2 v 2" and "One on one — two
1 v 1 matches"). It never shows a bare "No".

## Three layouts

### A. Match cards (the tee sheet IS the matchups) — recommended

Each card is one tee group, and it says who plays whom. The team colours run down the sides. **Tap a
player, then tap another, and they swap** (tap-to-swap, not drag: drag is unreliable one-handed on a
phone). A swap across teams changes the teams, and a swap within a team changes the pairing. The team
handicap totals update live.

    How do the teams play each other?   [Whole teams] [Pairs ✓] [One on one]

    ┌ Group 1 · 8:00 ─────────────────────────┐
    │ ▌Hogs  Craig 8.2 & Jym 14.0             │
    │        v                                │
    │ ▐Dawgs Dave 9.1 & Tony 13.5     even    │
    └─────────────────────────────────────────┘
    ┌ Group 2 · 8:10 ─────────────────────────┐
    │ ▌Hogs  Bill 3.4 & Sam 21.0              │
    │        v                                │
    │ ▐Dawgs Rick 6.0 & Al 18.2    Hogs +0.2  │
    └─────────────────────────────────────────┘
    Hogs 46.6 · Dawgs 46.8      [Rebalance]

- Where: on the **structure step**, right under the question, so the answer is visible the moment it's
  picked. The later teams/groups steps become confirmations (they're already decided).
- Whole teams: the cards are the foursomes, with no "v" line inside them, and the header reads "Hogs v
  Dawgs".
- Pros: one picture answers teams, matches and tee groups together, and it's exactly what the hub shows
  afterwards (§5.cq C), so the organizer sees the same thing twice. Cons: the structure step gets taller.

### B. Two-column ladder

Team A on the left and Team B on the right, each ranked by handicap. Brackets show who plays whom. ↑↓
moves a player within a column (re-pairing), and ⇄ swaps a row across.

    Hogs              Dawgs
    Bill   3.4  ┐  ┌  Rick  6.0
    Craig  8.2  ┘  └  Dave  9.1      ← pair 1 v pair 1
    Jym   14.0  ┐  ┌  Tony 13.5
    Sam   21.0  ┘  └  Al   18.2      ← pair 2 v pair 2

- Pros: compact; the handicap balance of each match is easy to read. Cons: the tee groups are implied,
  not shown, so a second visual is still needed for them. The brackets are fiddly at 390px.

### C. Pick the question early, edit on the teams step

Ask option A on the structure step (text only), and put a visual like A's on the existing **teams**
step, which already deals and rebalances.

- Pros: smallest change, and step 2 stays short. Cons: the visual comes after course and tees, so "decided
  early" is met only for the question, not for seeing it.

## Recommendation

**A**, on the structure step: one picture for teams, matches and tee groups, the same picture the hub
shows afterwards, and tap-to-swap works on a phone. The auto-deal (balanced, captains if on) fills it,
so "just the usual game" never needs a tap.

## Questions for Craig

1. A, B or C?
2. Should a swap across teams be allowed on this card, or only within a team (the teams step keeps
   cross-team moves)?
3. Should the tee times on the cards be editable here, or later (today they're set on the groups step)?
