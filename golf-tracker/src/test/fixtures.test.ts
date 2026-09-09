// Tests for the fixtures themselves.
//
// The other suites assert exact strokes and nets, and every one of those numbers
// rests on two fixture properties: slope 113 + rating == par (so Course Handicap
// == Handicap Index) and stroke index == hole number. If either silently breaks,
// every downstream expectation becomes meaningless-but-passing. So verify the
// foundation directly.

import { describe, expect, it } from 'vitest';
import { buildHcapMap, getGameHoles, numHolesForStrokes } from '@/lib/pool-game';
import { allEighteen, backNine, makeGame, parScores, scoresFor, TEST_PARS } from './fixtures';

describe('test course', () => {
  it('is par 72, 36 per nine', () => {
    expect(TEST_PARS).toHaveLength(18);
    expect(TEST_PARS.reduce((a, b) => a + b, 0)).toBe(72);
    expect(TEST_PARS.slice(0, 9).reduce((a, b) => a + b, 0)).toBe(36);
    expect(TEST_PARS.slice(9).reduce((a, b) => a + b, 0)).toBe(36);
  });

  it('has stroke index == hole number (the assumption every stroke test relies on)', () => {
    const holes = getGameHoles(makeGame());
    expect(holes).toHaveLength(18);
    for (const h of holes) expect(h.handicap).toBe(h.number);
  });

  it('gives Course Handicap == Handicap Index (slope 113, rating == par)', () => {
    const game = makeGame({ indexes: [0, 6, 12, 18] });
    const hcaps = buildHcapMap(game);
    expect(hcaps.get('p1')).toBe(0);
    expect(hcaps.get('p2')).toBe(6);
    expect(hcaps.get('p3')).toBe(12);
    expect(hcaps.get('p4')).toBe(18);
  });
});

describe('makeGame', () => {
  it('defaults to one foursome of four', () => {
    const game = makeGame();
    expect(game.players).toHaveLength(4);
    expect(game.teams).toHaveLength(1);
    expect(game.teams[0].matchupId).toBe('m1');
    expect(game.teams[0].playerIds).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('splits into N foursomes on teamCount', () => {
    const game = makeGame({ indexes: Array(8).fill(10), teamCount: 2 });
    expect(game.teams).toHaveLength(2);
    expect(game.teams[0].playerIds).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(game.teams[1].playerIds).toEqual(['p5', 'p6', 'p7', 'p8']);
    expect(game.teams[1].matchupId).toBe('m2');
  });

  it('honors overrides without losing derived players/teams', () => {
    const game = makeGame({ indexes: [5, 5], gameMode: 'skins', entryPerPlayer: 50 });
    expect(game.players).toHaveLength(2);
    expect(game.gameMode).toBe('skins');
    expect(game.entryPerPlayer).toBe(50);
  });

  it('supports a 9-hole game on either handicap basis', () => {
    const casual = makeGame({ holesPlaying: 'back9' });
    expect(getGameHoles(casual).map((h) => h.number)).toEqual(backNine());
    // 18-hole basis keeps the true 18-hole indexes on the played nine...
    expect(getGameHoles(casual)[0].handicap).toBe(10);
    expect(numHolesForStrokes(casual)).toBe(18);

    // ...while the USGA basis re-ranks them 1..9.
    const usga = makeGame({ holesPlaying: 'back9', nineHandicapBasis: '9' });
    expect(getGameHoles(usga).map((h) => h.handicap).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(numHolesForStrokes(usga)).toBe(9);
  });
});

describe('score helpers', () => {
  it('parScores gives every player par on every hole', () => {
    const rows = parScores(['p1', 'p2']);
    expect(rows).toHaveLength(36);
    expect(rows.filter((r) => r.playerId === 'p1')).toHaveLength(18);
    expect(rows.find((r) => r.playerId === 'p1' && r.hole === 2)!.grossScore).toBe(5); // hole 2 is a par 5
  });

  it('scoresFor takes a flat number or a per-hole array', () => {
    expect(scoresFor('p1', 4)).toHaveLength(18);
    expect(scoresFor('p1', 4).every((r) => r.grossScore === 4)).toBe(true);

    const partial = scoresFor('p1', [4, 5, null, 4]);
    expect(partial).toHaveLength(3);              // null skips the hole
    expect(partial.map((r) => r.hole)).toEqual([1, 2, 4]);
  });

  it('aligns a per-hole array to the given hole numbers', () => {
    const rows = scoresFor('p1', [3, 3, 3], backNine());
    expect(rows.map((r) => r.hole)).toEqual([10, 11, 12]);
  });

  it('allEighteen is 1..18', () => {
    expect(allEighteen()).toHaveLength(18);
    expect(allEighteen()[0]).toBe(1);
    expect(allEighteen()[17]).toBe(18);
  });
});
