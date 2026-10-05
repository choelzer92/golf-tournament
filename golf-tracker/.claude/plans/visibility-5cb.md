# §5.cb visibility: build plan (2026-10-01; Plan-agent draft, open questions below)

**Rule (§5.cb, §5.ci).** A pool or tournament is visible to:
- its owner;
- every player in it (by `players[].ghinNumber`);
- every member of its `sourceGroupId` group.

An owner-less legacy game simply skips the owner check. The app owner (`isAppOwner`) sees all.

## Plan
1. **New pure `src/lib/game-visibility.ts`:**
   - `Viewer { ghin: number | null; groupIds: ReadonlySet<string> }`
   - `gameVisibleTo(g, v)`: if the ghin is null, false. Otherwise true when the viewer is the owner,
     OR one of the players' GHINs, OR the game's source group is one of the viewer's groups.
   - `groupIdsForGhin(ghin, groups, rosterIdsForGhin)`
2. **`roster-groups.ts`:** add `getGroupIdsForGhin(ghin)`. It scans the full group cache against the
   roster ids carrying that GHIN (`getRosterPlayerByGhin`). The roster and groups must be hydrated
   first.
3. **`pool-game.ts`:** add `getPoolGameListVisibleTo(v)`. Keep `getPoolGameListForGhin` (owner
   history, recent courses).
4. **`tournament-state.ts`:** add `getTournamentListVisibleTo(v)`. Retire `tournamentVisibleTo`, or
   have it delegate. Its unit pin (`tournament-standings.test.ts:141`, "owner-less = everyone") FLIPS.
5. **Page wiring.** Keep each page's `isAppOwner()` branch, and swap both lists on these pages:
   - `/home` (`page.tsx:108-129`): add roster and group hydration.
   - `/dashboard` (`:89,97`): add roster and group hydration.
   - `/home/stats` (`:66-90`): already hydrated.
   - `/home/groups/[id]` (`:74-82`): already hydrated.
   - `/pool` (`:28-47`): add hydration.

   Drop the stale "tournaments list globally" comments.
6. **Unit tests, sees:**
   - the owner;
   - a GHIN-matched player;
   - a group member who didn't play;
   - a player in a legacy owner-less tournament.

   **Doesn't see:**
   - someone unrelated;
   - a member of another group;
   - a viewer with a null GHIN;
   - anyone else, for an owner-less game with no group;
   - anyone through a group, when the game's source group was deleted.
7. **e2e.**
   - A new sandbox scenario, built on the home-hub seed plus:
     - Jym (7654321) added to Weekend Warriors;
     - a non-group Craig game with Jym in it;
     - a Tuesday Crew game without Jym;
     - an owner-less tournament with Jym, and one without him.
   - A new spec, signed in as Jym, on /home, /dashboard and /pool.
   - The f059 "unrelated sees nothing" pins stay valid.

## Open (asked 2026-10-01)
- **The stats Overall lens.** It shows every loaded ledger, so widening it shows Jym everyone's money
  in every visible game. Should it be limited to the games he played in? (§5h: money is GROUP-SCOPED.)
- **Do members see the groups they belong to (read-only)?** Today `getGroups()` is owner-scoped, so
  Warriors wouldn't show in Jym's groups list or in the stats group picker.
- **Does a group's owner who isn't a member see its games?**
- **Labels and editing.** Should a game read "shared with you"? Do edit controls stay owner-only?

## Built 2026-10-05
- `src/lib/game-visibility.ts`: `gameVisibleTo` and `groupIdsForGhin`. A player matches by GHIN
  **or roster id**: games built from the roster carry the roster id, which is also how the stats
  "mine" lens links a player.
- `roster.getRosterIdsByGhin`, `roster-groups.getGroupIdsForGhin` / `getViewer` /
  `getViewableGroups` / `canEditGroup`, `pool-formats.getViewablePlayerGroups`.
- `getPoolGameListVisibleTo` and `getTournamentListVisibleTo`. `tournamentVisibleTo` is retired, and
  its "owner-less = everyone" pin flipped into `game-visibility.test.ts`.
- Wired on /home, /dashboard, /pool, /home/stats and /home/groups/[id]. `isAppOwner` still sees
  all. The wizard keeps the owner-scoped `getGroups()`.
- The group page is read-only for members ("You're a member · view only"): no rename/delete,
  start, formats edit or members edit. A non-member, non-owner gets "Group not found".
- **Money (§5.cj) needed no extra filter.** Every visible game is one the viewer owns, played or
  is a group member for. The one case beyond "played or group" is an organizer who didn't play a
  non-group game they made: they still see its ledger, as before.
- Sandbox: `visibility-member` (Jym = rp20, GHIN 7654321). Spec: `e2e/visibility-5cb.spec.ts`.
