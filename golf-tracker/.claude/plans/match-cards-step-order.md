# Match cards on step 2 (§5.de): the step-order plan. Plan first, no code yet.

## What's true today

- Order: field → structure ("How do you want to compete?") → scoring → course → tees → teams → groups
  (only when teams don't fill foursomes) → create.
- The teams are dealt on the **teams** step (after tees), balanced on course handicap. With no course it
  falls back to Handicap Index (`teams-step.tsx:81`), so a deal on step 2 is possible on index alone.
- With matches on, leaving the teams step builds the tee sheet from the matches
  (`teeGroupsFromMatches`), and singles are stored on the tee group (§5.cq).
- Tee times are set on the groups step / the pool's teams step.

## The change

1. **Step 2 (structure).** "Head-to-head matches? No / 1 v 1 / 2 v 2" becomes "How do the teams play each
   other?" (whole teams / pairs / one on one; only the answers the split allows; default first; never a
   bare "No"). Right under it are the **match cards**, one per tee group, for every team split (solo
   games have none):
   - auto-dealt: balanced (captains if the split's default has them), the tee sheet built the way the
     teams step builds it today (`teeGroupsFromMatches` / `proposeTeeGroups` / aligned foursomes);
   - tap a player, then any other player, and they swap (across teams too). Team totals update live;
   - the tee time is a tap on the card's "8:00" (the existing `tee-time-picker`).
   The state the cards edit is the SAME state the later steps read (`sideTeams`/`teams` + `sides`), so
   no second copy.
2. **Teams and groups steps** become confirmations (§5.de): prefilled from the cards. The teams step keeps
   names, captains and rebalance. The groups step stops asking for tee times when the cards set them.
3. **Re-deal rule.** A change that invalidates the cards (field, split, match answer) re-deals them; a
   tapped swap is never silently undone by anything else.

## Open for Craig: Q1 the handicaps on the cards

The cards come before course and tees, so they can't know course handicaps yet.
- **A (rec).** The cards deal and show **Handicap Index**. The teams step shows course handicaps and
  offers Rebalance, but never re-deals on its own. Keeps "decided early".
- **B.** Move course + tees before step 2 (field → course → tees → compete → scoring → money). The cards
  show course handicaps (at 100%; the allowance is still asked later).
- **C.** As A, but if no card was tapped, the teams step quietly re-deals on course handicap.

## Tests

- e2e per answer (whole/pairs/singles), a cross-team swap moving the money teams, a within-team swap
  re-pairing, a tee time set on a card reaching the hub. Tag `§5.de`.
- Existing matches specs (F-037/F-107) keep passing: the stored singles are unchanged.
