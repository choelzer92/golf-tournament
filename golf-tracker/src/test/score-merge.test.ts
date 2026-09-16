// F-063 option A: two phones on one foursome converge cell by cell (see lib/score-merge.ts).

import { describe, expect, it } from 'vitest';
import { mergeScoreCells, scoreCellKey } from '@/lib/score-merge';
import type { GameScore } from '@/lib/game-state';

const cell = (playerId: string, hole: number, grossScore: number): GameScore => ({ playerId, hole, grossScore });
const none = new Set<string>();

describe('mergeScoreCells', () => {
  it('takes cells the other phone entered that this one lacks', () => {
    const local = [cell('p1', 1, 4)];
    const remote = [cell('p1', 1, 4), cell('p2', 1, 5)];
    const r = mergeScoreCells(local, remote, none);
    expect(r.changed).toBe(true);
    expect(r.merged).toEqual([cell('p1', 1, 4), cell('p2', 1, 5)]);
  });

  it('is a no-op when the rows already agree — so the save effect is not re-triggered', () => {
    const local = [cell('p1', 1, 4), cell('p2', 1, 5)];
    const r = mergeScoreCells(local, [cell('p2', 1, 5), cell('p1', 1, 4)], none);
    expect(r.changed).toBe(false);
    expect(r.merged).toEqual(local);
  });

  it('a DIRTY local cell wins over a stale remote value', () => {
    const local = [cell('p1', 3, 3)];                    // just tapped a birdie
    const remote = [cell('p1', 3, 5)];                   // the other phone's older row
    const dirty = new Set([scoreCellKey('p1', 3)]);
    const r = mergeScoreCells(local, remote, dirty);
    expect(r.merged).toEqual([cell('p1', 3, 3)]);
    expect(r.changed).toBe(false);
    expect(r.confirmed).toEqual([]);
  });

  it('a clean local cell takes the remote correction (a score fixed after the fact)', () => {
    const r = mergeScoreCells([cell('p1', 3, 5)], [cell('p1', 3, 4)], none);
    expect(r.merged).toEqual([cell('p1', 3, 4)]);
    expect(r.changed).toBe(true);
  });

  it('confirms a dirty cell once the server echoes the same value', () => {
    const dirty = new Set([scoreCellKey('p1', 3), scoreCellKey('p1', 4)]);
    const r = mergeScoreCells([cell('p1', 3, 3), cell('p1', 4, 4)], [cell('p1', 3, 3)], dirty);
    expect(r.confirmed).toEqual([scoreCellKey('p1', 3)]);   // hole 4 not echoed yet → still dirty
    expect(r.changed).toBe(false);
  });

  it('never drops a local cell the server lacks (§5.ap: never lose a score)', () => {
    const r = mergeScoreCells([cell('p1', 1, 4), cell('p1', 2, 4)], [cell('p1', 1, 4)], none);
    expect(r.merged).toEqual([cell('p1', 1, 4), cell('p1', 2, 4)]);
    expect(r.changed).toBe(false);
  });

  it('two phones scoring DIFFERENT players end up with both players', () => {
    // Phone A scored p1/p2, phone B scored p3/p4; each receives the other's whole row.
    const a = [cell('p1', 1, 4), cell('p2', 1, 5)];
    const b = [cell('p3', 1, 3), cell('p4', 1, 6)];
    const onA = mergeScoreCells(a, b, none).merged;
    const onB = mergeScoreCells(b, a, none).merged;
    const key = (s: GameScore) => scoreCellKey(s.playerId, s.hole);
    expect(onA.map(key).sort()).toEqual(onB.map(key).sort());
    expect(onA).toHaveLength(4);
  });
});
