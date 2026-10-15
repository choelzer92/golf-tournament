// Home, organized by group (DECISIONS.md §5.ck), with events in it (§5.cv Q6). Pure: it sorts
// list items the caller already loaded.
//
//   1. LIVE: every live game gets a Continue card at the very top, whatever its group. A live
//      round of an event says which event. A live game with no score yet (a round set up a day
//      ahead) is NOT STARTED: no Continue card, and it doesn't make its event live (§5.cw a).
//   2. BY GROUP: each group the viewer can see shows its latest item inline: an event (its
//      rounds collapsed into one) or a single game.
//   3. OTHER: everything made outside a visible group, newest first, events collapsed.

import type { PoolGameListItem } from './pool-game';
import type { TournamentListItem } from './tournament-state';
import type { SeriesStamp } from './series';

export type FeedItem =
  | { kind: 'game'; key: string; game: PoolGameListItem; at: string }
  | { kind: 'event'; key: string; seriesId: string; name: string; rounds: PoolGameListItem[]; live: boolean; at: string }
  | { kind: 'tournament'; key: string; tournament: TournamentListItem; at: string };

export interface HomeFeed {
  /** Live games, newest first. Each carries its event when it's a round of one. */
  live: { game: PoolGameListItem; event?: SeriesStamp }[];
  liveTournaments: TournamentListItem[];
  /** groupId → that group's latest item. Groups with nothing played are absent. */
  latestByGroup: Map<string, FeedItem>;
  other: FeedItem[];
}

// A latest-first ordering over items that may have no timestamp (legacy tournaments carry
// none; they sort after dated items, as the old Home list did).
const newestFirst = (a: FeedItem, b: FeedItem) => b.at.localeCompare(a.at);

export function buildHomeFeed(
  games: PoolGameListItem[],
  tournaments: TournamentListItem[],
  visibleGroupIds: Set<string>,
  unstarted: Set<string> = new Set(),
): HomeFeed {
  const live = games
    .filter((g) => g.status === 'active' && !unstarted.has(g.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((g) => ({ game: g, event: g.series }));

  // Collapse each event's rounds into one item. The event belongs to the group of its first
  // round (an event is started from a group, §5.cv Q2), and is as recent as its newest round.
  const items: { item: FeedItem; groupId?: string }[] = [];
  const events = new Map<string, PoolGameListItem[]>();
  for (const g of games) {
    if (g.series) events.set(g.series.id, [...(events.get(g.series.id) ?? []), g]);
    else items.push({ item: { kind: 'game', key: `pool:${g.id}`, game: g, at: g.createdAt }, groupId: g.sourceGroupId });
  }
  for (const [seriesId, rs] of events) {
    const rounds = [...rs].sort((a, b) => a.series!.seq - b.series!.seq);  // set-up order (§5.dc)
    const latest = rounds.reduce((a, b) => (b.series!.seq > a.series!.seq ? b : a));
    items.push({
      item: {
        kind: 'event',
        key: `event:${seriesId}`,
        seriesId,
        name: latest.series!.name,
        rounds,
        live: rounds.some((r) => r.status === 'active' && !unstarted.has(r.id)),
        at: rounds.map((r) => r.createdAt).sort().pop()!,
      },
      groupId: rounds[0].sourceGroupId,
    });
  }
  for (const t of tournaments) {
    items.push({ item: { kind: 'tournament', key: `tournament:${t.id}`, tournament: t, at: '' }, groupId: t.sourceGroupId });
  }

  const latestByGroup = new Map<string, FeedItem>();
  const other: FeedItem[] = [];
  for (const { item, groupId } of items) {
    if (groupId && visibleGroupIds.has(groupId)) {
      const cur = latestByGroup.get(groupId);
      if (!cur || newestFirst(item, cur) < 0) latestByGroup.set(groupId, item);
    } else {
      other.push(item);
    }
  }
  other.sort(newestFirst);

  return { live, liveTournaments: tournaments.filter((t) => t.status === 'active'), latestByGroup, other };
}
