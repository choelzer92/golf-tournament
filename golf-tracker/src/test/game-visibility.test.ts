// §5.cb game visibility (+ §5.ci legacy rule, §5.cj creator-is-not-a-member): both directions.

import { describe, expect, it } from 'vitest';
import { gameVisibleTo, groupIdsForGhin, type Viewer } from '@/lib/game-visibility';

const CRAIG = 1111111;
const JYM = 7654321;
const STRANGER = 9999999;

const viewer = (ghin: number | null, groups: string[] = [], rosterIds: string[] = []): Viewer =>
  ({ ghin, groupIds: new Set(groups), rosterIds: new Set(rosterIds) });
const game = (o: { owner?: number; players?: number[]; group?: string }) => ({
  createdByGhin: o.owner,
  players: (o.players ?? []).map((ghinNumber) => ({ ghinNumber })),
  sourceGroupId: o.group,
});

describe('gameVisibleTo: who sees a game', () => {
  it('the owner sees their game, even one they did not play in', () => {
    expect(gameVisibleTo(game({ owner: CRAIG, players: [JYM] }), viewer(CRAIG))).toBe(true);
  });
  it('a player sees a game they played in, by GHIN', () => {
    expect(gameVisibleTo(game({ owner: CRAIG, players: [CRAIG, JYM] }), viewer(JYM))).toBe(true);
  });
  it('a group member sees the group game they sat out', () => {
    expect(gameVisibleTo(game({ owner: CRAIG, players: [CRAIG], group: 'warriors' }), viewer(JYM, ['warriors']))).toBe(true);
  });
  it('a player sees a legacy owner-less game they played in (§5.ci)', () => {
    expect(gameVisibleTo(game({ players: [JYM] }), viewer(JYM))).toBe(true);
  });
  it('a player is matched by roster id when the game row carries no GHIN', () => {
    const g = { createdByGhin: CRAIG, players: [{ id: 'r-jym' }] };
    expect(gameVisibleTo(g, viewer(JYM, [], ['r-jym']))).toBe(true);
    expect(gameVisibleTo(g, viewer(STRANGER, [], ['r-other']))).toBe(false);
  });
  it('a player with no GHIN on file is matched by nothing', () => {
    const g = { createdByGhin: CRAIG, players: [{ ghinNumber: undefined }, { ghinNumber: null }] };
    expect(gameVisibleTo(g, viewer(JYM))).toBe(false);
  });
});

describe('gameVisibleTo: who does not', () => {
  it('someone unrelated', () => {
    expect(gameVisibleTo(game({ owner: CRAIG, players: [CRAIG, JYM], group: 'warriors' }), viewer(STRANGER))).toBe(false);
  });
  it('a member of a different group', () => {
    expect(gameVisibleTo(game({ owner: CRAIG, players: [CRAIG], group: 'tuesday' }), viewer(JYM, ['warriors']))).toBe(false);
  });
  it('a viewer with no GHIN, even for a game with GHIN-less players', () => {
    expect(gameVisibleTo(game({ owner: CRAIG, players: [JYM], group: 'warriors' }), viewer(null, ['warriors'], ['r-jym']))).toBe(false);
  });
  it('anyone else, for a legacy owner-less game with no group (no longer "everyone", §5.ci)', () => {
    expect(gameVisibleTo(game({ players: [CRAIG] }), viewer(JYM))).toBe(false);
    expect(gameVisibleTo(game({}), viewer(JYM))).toBe(false);
  });
  it('no one through a group whose id the viewer no longer holds (group deleted)', () => {
    expect(gameVisibleTo(game({ owner: CRAIG, group: 'gone' }), viewer(JYM, []))).toBe(false);
  });
});

describe('groupIdsForGhin: membership is by roster id', () => {
  const groups = [
    { id: 'warriors', playerIds: ['r-craig', 'r-jym'] },
    { id: 'tuesday', playerIds: ['r-craig', 'r-bob'] },
    { id: 'craigs-other', playerIds: ['r-jym-2'] },   // Jym on another organizer's roster
  ];
  it('finds every group holding any of the golfer\'s roster ids', () => {
    expect([...groupIdsForGhin(groups, ['r-jym', 'r-jym-2'])].sort()).toEqual(['craigs-other', 'warriors']);
  });
  it('a golfer on no roster is in no group', () => {
    expect(groupIdsForGhin(groups, []).size).toBe(0);
  });
  it('owning a group is not membership (§5.cj): only playerIds count', () => {
    // groupIdsForGhin takes no owner; a creator absent from playerIds gets nothing.
    expect(groupIdsForGhin([{ id: 'mine', playerIds: ['r-bob'] }], ['r-craig']).size).toBe(0);
  });
});
