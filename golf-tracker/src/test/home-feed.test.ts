// Home by group (§5.ck) with events in it (§5.cv Q6). Pure grouping over list items.

import { describe, expect, it } from 'vitest';
import { buildHomeFeed } from '@/lib/home-feed';
import type { PoolGameListItem } from '@/lib/pool-game';
import type { TournamentListItem } from '@/lib/tournament-state';

const g = (id: string, createdAt: string, extra: Partial<PoolGameListItem> = {}): PoolGameListItem => ({
  id, name: id, status: 'completed', teamCount: 1, playerCount: 4, createdAt,
  groupSizes: [4], sideSizes: [], ...extra,
});
const ev = (seq: number, date: string) => ({ id: 's-trip', name: seq === 3 ? 'Trip (renamed)' : 'Trip', rollup: 'money' as const, seq, date });
const t: TournamentListItem = { id: 't1', name: 'Old cup', status: 'active', teamAName: 'A', teamBName: 'B', teamAPoints: 1, teamBPoints: 2, sourceGroupId: 'g1' };

describe('buildHomeFeed', () => {
  const games = [
    g('w-old', '2026-06-01T00:00:00Z', { sourceGroupId: 'g1' }),
    g('r1', '2026-10-16T00:00:00Z', { sourceGroupId: 'g1', series: ev(1, '2026-10-16') }),
    g('r3', '2026-10-15T00:00:00Z', { sourceGroupId: 'g1', series: ev(3, '2026-10-17'), status: 'active' }),
    g('r2', '2026-10-17T00:00:00Z', { sourceGroupId: 'g1', series: ev(2, '2026-10-17') }),
    g('hidden-group', '2026-09-01T00:00:00Z', { sourceGroupId: 'g-not-mine' }),
    g('loose', '2026-08-01T00:00:00Z'),
  ];
  const feed = buildHomeFeed(games, [t], new Set(['g1', 'g-empty']));

  it('every live game is a Continue card, carrying its event', () => {
    expect(feed.live.map((l) => l.game.id)).toEqual(['r3']);
    expect(feed.live[0].event?.id).toBe('s-trip');
    expect(feed.liveTournaments.map((x) => x.id)).toEqual(['t1']);
  });

  it("a group's latest item is its event, collapsed, in play order, with the latest name", () => {
    const latest = feed.latestByGroup.get('g1')!;
    expect(latest.kind).toBe('event');
    if (latest.kind !== 'event') return;
    expect(latest.rounds.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(latest.name).toBe('Trip (renamed)');
    expect(latest.live).toBe(true);
  });

  it('a group with nothing played has no latest item', () => {
    expect(feed.latestByGroup.has('g-empty')).toBe(false);
  });

  it("other games = outside any group you can see, newest first; a group's own history stays on its page", () => {
    expect(feed.other.map((i) => i.key)).toEqual(['pool:hidden-group', 'pool:loose']);
    expect(feed.other.some((i) => i.key === 'pool:w-old')).toBe(false);
  });
});

describe('§5.cw a: a live round with no score yet is NOT STARTED', () => {
  const games = [
    g('r1', '2026-10-16T00:00:00Z', { sourceGroupId: 'g1', series: ev(1, '2026-10-16') }),
    g('r2', '2026-10-16T01:00:00Z', { sourceGroupId: 'g1', series: ev(2, '2026-10-17'), status: 'active' }),
    g('solo', '2026-10-16T02:00:00Z', { status: 'active' }),
  ];

  it('gets no Continue card and does not make its event live', () => {
    const feed = buildHomeFeed(games, [], new Set(['g1']), new Set(['r2']));
    expect(feed.live.map((l) => l.game.id)).toEqual(['solo']);
    const latest = feed.latestByGroup.get('g1')!;
    expect(latest.kind === 'event' && latest.live).toBe(false);
  });

  it('the first score makes it live again', () => {
    const feed = buildHomeFeed(games, [], new Set(['g1']));
    expect(feed.live.map((l) => l.game.id)).toEqual(['solo', 'r2']);
    const latest = feed.latestByGroup.get('g1')!;
    expect(latest.kind === 'event' && latest.live).toBe(true);
  });
});
