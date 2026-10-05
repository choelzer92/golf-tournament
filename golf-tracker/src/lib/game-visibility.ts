// Who may see a game (§5.cb, §5.ci, §5.cj). Pure: the pages pass in the viewer and the lib
// list functions filter their caches with it.
//
// A pool or tournament is visible to its owner, every player in it (by GHIN or roster id), and every
// member of the group it was made from. A legacy owner-less game just skips the owner check.
// A group's creator who isn't on its roster is not a member (§5.cj). The app owner sees
// everything; that branch stays on the pages (isAppOwner).

export interface Viewer {
  ghin: number | null;
  groupIds: ReadonlySet<string>;   // groups whose roster includes this viewer
  rosterIds: ReadonlySet<string>;  // this viewer's roster entries (a game player's id is one)
}

export interface VisibleGame {
  createdByGhin?: number;
  players: ReadonlyArray<{ id?: string; ghinNumber?: number | null }>;
  sourceGroupId?: string;
}

export function gameVisibleTo(g: VisibleGame, v: Viewer): boolean {
  if (v.ghin == null) return false;
  if (g.createdByGhin === v.ghin) return true;
  // A player matches by GHIN, or by roster id: games built from the roster carry the
  // roster id, and that's how the stats "mine" lens links a player too.
  if (g.players.some((p) => p.ghinNumber === v.ghin || (p.id != null && v.rosterIds.has(p.id)))) return true;
  return g.sourceGroupId != null && v.groupIds.has(g.sourceGroupId);
}

// The groups a GHIN is a member of: any group whose roster ids include one of that GHIN's
// roster ids. Ownership doesn't count (§5.cj).
export function groupIdsForGhin(
  groups: ReadonlyArray<{ id: string; playerIds: ReadonlyArray<string> }>,
  rosterIdsForGhin: ReadonlyArray<string>,
): Set<string> {
  const mine = new Set(rosterIdsForGhin);
  const out = new Set<string>();
  for (const g of groups) if (g.playerIds.some((id) => mine.has(id))) out.add(g.id);
  return out;
}
