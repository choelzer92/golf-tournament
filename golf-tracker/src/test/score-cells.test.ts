// F-063 C: per-cell scores + the outbox (BETA bar #5, DECISIONS §5.ce / §5.dn).
//
// The claims under test: (1) the later TAP wins a same-cell conflict, even arriving second; (2) a save
// sends only what changed and never a clear read from absence; (3) a queued tap survives a failed send
// and a reload, coalesces per cell, and leaves only when acknowledged; (4) the sandbox RPC applies the
// rule and audits server-side, idempotently.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  cellsToScores, changedCells, overlayPending, replaceCells, resolveCellWrite, type CellWrite,
} from '@/lib/score-cells';
import { ack, createOutbox, enqueue, OUTBOX_KEY } from '@/lib/score-outbox';
import { createFakeStore, createFakeSupabase } from './fake-supabase';

const T = (min: number) => new Date(Date.UTC(2026, 9, 14, 9, min)).toISOString();
const w = (playerId: string, hole: number, grossScore: number | null, min: number, matchupId = 'm1'): CellWrite =>
  ({ matchupId, playerId, hole, grossScore, tappedAt: T(min) });

describe('the conflict rule (§5.dn A: the later tap wins)', () => {
  it('a newer tap replaces; an older tap arriving later does NOT', () => {
    expect(resolveCellWrite(null, { grossScore: 5, tappedAt: T(1) })).toEqual({ apply: true, audit: { oldScore: null, newScore: 5 } });
    // Phone B corrected 5 → 4 at 9:03; phone A's old 6 from 9:02 comes out of a dead spot at 9:10.
    expect(resolveCellWrite({ grossScore: 4, tappedAt: T(3) }, { grossScore: 6, tappedAt: T(2) })).toEqual({ apply: false, audit: null });
    expect(resolveCellWrite({ grossScore: 4, tappedAt: T(3) }, { grossScore: 6, tappedAt: T(4) })).toEqual({ apply: true, audit: { oldScore: 4, newScore: 6 } });
  });

  it('a resend of the same tap applies but changes nothing (no audit row)', () => {
    expect(resolveCellWrite({ grossScore: 4, tappedAt: T(3) }, { grossScore: 4, tappedAt: T(3) })).toEqual({ apply: true, audit: null });
  });

  it('a clear is a tombstone that an older tap can\'t resurrect', () => {
    expect(resolveCellWrite({ grossScore: null, tappedAt: T(5) }, { grossScore: 4, tappedAt: T(4) }).apply).toBe(false);
  });
});

describe('what a save sends', () => {
  const base = [{ playerId: 'p1', hole: 1, grossScore: 4 }, { playerId: 'p2', hole: 1, grossScore: 5 }];

  it('only new or changed cells', () => {
    const next = [{ playerId: 'p1', hole: 1, grossScore: 4 }, { playerId: 'p2', hole: 1, grossScore: 6 }, { playerId: 'p1', hole: 2, grossScore: 3 }];
    expect(changedCells('m1', base, next, T(1))).toEqual([w('p2', 1, 6, 1), w('p1', 2, 3, 1)]);
  });

  it('never a clear read from absence (another phone\'s tap this one hasn\'t received)', () => {
    expect(changedCells('m1', base, [{ playerId: 'p1', hole: 1, grossScore: 4 }], T(1))).toEqual([]);
  });

  it('split scoring sends only the players this phone owns', () => {
    const next = [{ playerId: 'p1', hole: 1, grossScore: 5 }, { playerId: 'p2', hole: 1, grossScore: 7 }];
    expect(changedCells('m1', base, next, T(1), ['p1'])).toEqual([w('p1', 1, 5, 1)]);
  });

  it('a deliberate replace clears what it knows of (a rebalance emptying a group)', () => {
    expect(replaceCells('m1', base, [], T(1))).toEqual([w('p1', 1, null, 1), w('p2', 1, null, 1)]);
  });
});

describe('reading cells back', () => {
  it('rows become the card the app reads; tombstones drop out', () => {
    expect(cellsToScores([
      { player_id: 'p2', hole: 1, gross_score: 5 }, { player_id: 'p1', hole: 2, gross_score: null }, { player_id: 'p1', hole: 1, gross_score: 4 },
    ])).toEqual([{ playerId: 'p1', hole: 1, grossScore: 4 }, { playerId: 'p2', hole: 1, grossScore: 5 }]);
  });

  it('a queued tap is laid over the server copy, so it never vanishes from the screen', () => {
    const server = [{ playerId: 'p1', hole: 1, grossScore: 4 }];
    expect(overlayPending(server, [w('p1', 1, 5, 1), w('p1', 2, 3, 1)])).toEqual([
      { playerId: 'p1', hole: 1, grossScore: 5 }, { playerId: 'p1', hole: 2, grossScore: 3 },
    ]);
  });
});

describe('the outbox', () => {
  it('coalesces per cell to the latest tap, and an ack keeps a cell re-tapped in flight', () => {
    const q = enqueue(enqueue([], [w('p1', 1, 4, 1)]), [w('p1', 1, 5, 2), w('p1', 2, 3, 2)]);
    expect(q).toEqual([w('p1', 1, 5, 2), w('p1', 2, 3, 2)]);
    const retapped = enqueue(q, [w('p1', 1, 6, 3)]);
    // The batch sent held p1/1 = 5 @2; the server acks it, but the cell was re-tapped to 6 @3.
    expect(ack(retapped, q)).toEqual([w('p1', 1, 6, 3)]);
  });

  function memoryStorage() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
  }

  it('a dead spot keeps every tap, retries, and sends once the signal is back', async () => {
    const storage = memoryStorage();
    let online = false;
    const sent: CellWrite[][] = [];
    const timers: (() => void)[] = [];
    const box = createOutbox({
      storage,
      send: async (cells) => { if (!online) return false; sent.push(cells); return true; },
      schedule: (fn) => { timers.push(fn); },
    });
    box.push([w('p1', 1, 4, 1)]);
    box.push([w('p1', 1, 5, 2), w('p2', 1, 6, 2)]);
    await Promise.resolve(); await Promise.resolve();
    expect(sent).toEqual([]);
    expect(box.pending()).toHaveLength(2);
    expect(timers.length).toBeGreaterThan(0);   // a retry is scheduled, not given up
    online = true;
    timers.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toEqual([[w('p1', 1, 5, 2), w('p2', 1, 6, 2)]]);   // coalesced: p1/1 sent once, as 5
    expect(box.pending()).toEqual([]);
  });

  it('a killed tab loses nothing: the next page load finds the queue and drains it', async () => {
    const storage = memoryStorage();
    const first = createOutbox({ storage, send: async () => false, schedule: () => {} });
    first.push([w('p1', 7, 4, 1)]);
    expect(JSON.parse(storage.m.get(OUTBOX_KEY)!)).toEqual([w('p1', 7, 4, 1)]);
    // The tab dies here. A fresh page load builds a new outbox over the same storage.
    const sent: CellWrite[][] = [];
    const second = createOutbox({ storage, send: async (c) => { sent.push(c); return true; }, schedule: () => {} });
    await second.drain();
    expect(sent).toEqual([[w('p1', 7, 4, 1)]]);
    expect(second.pending()).toEqual([]);
  });

  it('a send that throws is treated as a failure, never as delivered', async () => {
    const box = createOutbox({ send: async () => { throw new Error('5xx'); }, schedule: () => {} });
    box.push([w('p1', 1, 4, 1)]);
    await new Promise((r) => setTimeout(r, 0));
    expect(box.pending()).toEqual([w('p1', 1, 4, 1)]);
  });
});

describe('the sandbox upsert_score_cells (mirrors the SQL rule)', () => {
  // The fake persists to sessionStorage (so a seeded game survives navigation); start each test empty.
  beforeEach(() => { if (typeof sessionStorage !== 'undefined') sessionStorage.clear(); });
  type FakeClient = ReturnType<typeof createFakeSupabase>;
  const rows = async (sb: FakeClient) => ((await sb.from('score_cells').select('*').eq('matchup_id', 'm1')) as { data: Record<string, unknown>[] }).data;
  const audit = async (sb: FakeClient) => ((await sb.from('score_audit').select('*')) as { data: Record<string, unknown>[] }).data;

  it('two phones, one card: neither erases the other; the later tap wins the shared cell; audit is server-side', async () => {
    const sb = createFakeSupabase(createFakeStore());
    // Phone A scores holes 1–2 for p1; phone B scores hole 1 for p2 and corrects p1/1 later.
    await sb.rpc('upsert_score_cells', { p_cells: [w('p1', 1, 5, 1), w('p1', 2, 4, 1)] });
    await sb.rpc('upsert_score_cells', { p_cells: [w('p2', 1, 6, 2), w('p1', 1, 4, 3)] });
    // Phone A's stale p1/1 = 5 (tapped 9:01) is resent from a dead spot: it must not win.
    await sb.rpc('upsert_score_cells', { p_cells: [w('p1', 1, 5, 1)] });
    const card = cellsToScores((await rows(sb)) as never);
    expect(card).toEqual([
      { playerId: 'p1', hole: 1, grossScore: 4 }, { playerId: 'p2', hole: 1, grossScore: 6 }, { playerId: 'p1', hole: 2, grossScore: 4 },
    ].sort((a, b) => a.hole - b.hole || a.playerId.localeCompare(b.playerId)));
    expect((await audit(sb)).map((a) => [a.player_id, a.hole, a.old_score, a.new_score])).toEqual([
      ['p1', 1, null, 5], ['p1', 2, null, 4], ['p2', 1, null, 6], ['p1', 1, 5, 4],
    ]);
  });

  it('idempotent: resending a batch writes no new audit rows', async () => {
    const sb = createFakeSupabase(createFakeStore());
    const batch = [w('p1', 1, 5, 1)];
    await sb.rpc('upsert_score_cells', { p_cells: batch });
    await sb.rpc('upsert_score_cells', { p_cells: batch });
    expect(await audit(sb)).toHaveLength(1);
    expect(await rows(sb)).toHaveLength(1);
  });

  it('score_cells can only be written through the RPC', async () => {
    const sb = createFakeSupabase(createFakeStore());
    await expect(Promise.resolve(sb.from('score_cells').upsert({ matchup_id: 'm1' }))).rejects.toThrow(/upsert_score_cells/);
  });
});
