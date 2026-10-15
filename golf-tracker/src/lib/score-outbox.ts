// THE SCORE OUTBOX (F-063 option C, BETA bar #5: "no score is ever lost: two phones, a dead spot,
// a sleeping phone").
//
// Every tap is queued here before it is sent, and leaves only when the server acknowledges it. The
// queue lives in localStorage, so it survives a reload, a killed tab and a phone that slept through
// a dead spot; whichever page the app next opens on drains it (tournament-state.ts starts it).
// Coalesced per cell: a cell tapped five times in a dead spot is sent once, as its latest tap.
//
// The queue operations are pure (`enqueue`, `ack`, `pendingFor`); `createOutbox` is the thin shell
// with injected storage, sender and timer, so this file never touches Supabase (AGENTS.md) and the
// tests drive it without a browser.

import { cellKey, type CellWrite } from './score-cells';

/** Add writes, keeping only the latest tap per cell (an equal tap time takes the newer write). */
export function enqueue(queue: CellWrite[], writes: CellWrite[]): CellWrite[] {
  const by = new Map(queue.map((c) => [cellKey(c), c]));
  for (const w of writes) {
    const k = cellKey(w);
    const had = by.get(k);
    if (!had || Date.parse(w.tappedAt) >= Date.parse(had.tappedAt)) by.set(k, w);
  }
  return [...by.values()];
}

/**
 * Remove what the server acknowledged. A cell re-tapped while its send was in flight has a newer
 * tap time than the one sent, so it stays queued and goes out next.
 */
export function ack(queue: CellWrite[], sent: CellWrite[]): CellWrite[] {
  const done = new Map(sent.map((c) => [cellKey(c), c.tappedAt]));
  return queue.filter((c) => done.get(cellKey(c)) !== c.tappedAt);
}

export function pendingFor(queue: CellWrite[], matchupId: string): CellWrite[] {
  return queue.filter((c) => c.matchupId === matchupId);
}

export interface OutboxDeps {
  /** Where the queue lives (localStorage in the app). Absent = memory only. */
  storage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null;
  /** Send a batch; resolves true when the server took all of it. Never throws to the caller. */
  send: (cells: CellWrite[]) => Promise<boolean>;
  /** Timer for retries (setTimeout in the app). */
  schedule: (fn: () => void, ms: number) => void;
  /** Called after the queue changes (an ack, or a new tap), e.g. to refresh a "saving" badge. */
  onChange?: () => void;
}

export const OUTBOX_KEY = 'golf-score-outbox-v1';
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;

export function createOutbox(deps: OutboxDeps) {
  let memory: CellWrite[] = [];
  const read = (): CellWrite[] => {
    if (!deps.storage) return memory;
    try {
      const raw = deps.storage.getItem(OUTBOX_KEY);
      return raw ? (JSON.parse(raw) as CellWrite[]) : [];
    } catch {
      return memory;
    }
  };
  const write = (q: CellWrite[]) => {
    memory = q;
    if (!deps.storage) return;
    try { deps.storage.setItem(OUTBOX_KEY, JSON.stringify(q)); } catch { /* quota: memory still holds it */ }
  };

  let inFlight = false;
  let retryMs = RETRY_MIN_MS;
  let retryQueued = false;

  async function drain(): Promise<void> {
    if (inFlight) return;
    const batch = read();
    if (batch.length === 0) { retryMs = RETRY_MIN_MS; return; }
    inFlight = true;
    let ok = false;
    try { ok = await deps.send(batch); } catch { ok = false; }
    inFlight = false;
    if (ok) {
      write(ack(read(), batch));
      retryMs = RETRY_MIN_MS;
      deps.onChange?.();
      // Taps made while this batch was in flight go out now.
      if (read().length > 0) void drain();
      return;
    }
    // Offline or a server error: keep everything and try again, backing off to 30s.
    if (!retryQueued) {
      retryQueued = true;
      deps.schedule(() => { retryQueued = false; void drain(); }, retryMs);
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    }
  }

  return {
    /** Queue these writes (persisted first) and try to send them. */
    push(writes: CellWrite[]) {
      if (writes.length === 0) return;
      write(enqueue(read(), writes));
      deps.onChange?.();
      void drain();
    },
    drain,
    pending: (matchupId?: string) => (matchupId ? pendingFor(read(), matchupId) : read()),
  };
}
