// In-memory stand-in for the Supabase client — DEV/TEST ONLY.
//
// WHY THIS EXISTS
// The app's persistence surface is tiny and fully contained: 6 tables reached
// through 4 operations, from 5 import sites (all `import { supabase } from
// './supabase'`). That makes it a clean seam to swap, which lets the real UI run
// against a Map instead of Postgres — no Docker, no network, no credentials.
//
// The isolation is STRUCTURAL, not configurational: when the sandbox flag is set,
// the network-capable client is never constructed. Compare an env-var override
// pointed at a dead host, which only works if process management is also correct.
//
// WHAT THIS CANNOT PROVE — always state this alongside any sandbox result:
//   - RLS policies / auth rules (none are modelled)
//   - the real `merge_game_scores` RPC semantics. That's SQL doing concurrent
//     multi-device write reconciliation; see mergeGameScores() below, which
//     THROWS rather than pretending. Multi-device scoring cannot be validated here.
//   - Postgres constraints, type coercion, or error shapes
//   - genuine realtime delivery, reconnection, or ordering across clients
// It is a UI harness: rendering, layout, vocabulary, and flow. Nothing more.
//
// DESIGN RULE: unimplemented methods THROW. A silent empty result would render as
// plausible-but-wrong UI, which is worse than a crash.

type Row = Record<string, unknown>;

// table name -> primary key column. Mirrors supabase/migrations/.
const PRIMARY_KEYS: Record<string, string> = {
  pool_games: 'id',
  tournaments: 'id',
  game_scores: 'matchup_id',
  players: 'id',
  roster_groups: 'id',
  solo_rounds: 'id',
  score_audit: '__append__',   // append-only log, no upsert key
};

type ChangeHandler = (payload: { new: Row | null; old: Row | null; eventType: string }) => void;

interface Subscriber {
  table: string;
  filterCol: string | null;
  filterVal: string | null;
  handler: ChangeHandler;
}

export interface FakeStore {
  tables: Map<string, Map<string, Row>>;
  appendLog: Map<string, Row[]>;
  subscribers: Subscriber[];
  /** Every operation performed, for assertions/debugging. */
  ops: { op: string; table: string; key?: string }[];
}

// The app's own caches are module-level Maps, wiped on every full page load — so a
// fake store held only in memory would vanish the moment you navigate. Persisting
// to sessionStorage makes the sandbox behave like a real backend across reloads,
// which is what lets a seeded game survive navigation. Scoped to the tab and
// cleared when it closes.
const PERSIST_KEY = '__sandbox_supabase__';

function loadPersisted(): { tables: Map<string, Map<string, Row>>; appendLog: Map<string, Row[]> } | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tables: [string, [string, Row][]][]; appendLog: [string, Row[]][] };
    return {
      tables: new Map(parsed.tables.map(([t, rows]) => [t, new Map(rows)])),
      appendLog: new Map(parsed.appendLog),
    };
  } catch {
    return null;
  }
}

function persist(store: FakeStore) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PERSIST_KEY, JSON.stringify({
      tables: [...store.tables].map(([t, rows]) => [t, [...rows]]),
      appendLog: [...store.appendLog],
    }));
  } catch {
    // Quota exceeded or unavailable — the sandbox still works in-memory.
  }
}

export function createFakeStore(): FakeStore {
  const restored = loadPersisted();
  return {
    tables: restored?.tables ?? new Map(),
    appendLog: restored?.appendLog ?? new Map(),
    subscribers: [],
    ops: [],
  };
}

function tableOf(store: FakeStore, name: string): Map<string, Row> {
  let t = store.tables.get(name);
  if (!t) { t = new Map(); store.tables.set(name, t); }
  return t;
}

// Notify realtime subscribers of a row change. Payload shape matches what the app
// reads: `payload.new.data` (see subscribeToPoolGame).
function emit(store: FakeStore, table: string, row: Row, eventType: string) {
  const pk = PRIMARY_KEYS[table] ?? 'id';
  for (const sub of store.subscribers) {
    if (sub.table !== table) continue;
    if (sub.filterCol && String(row[sub.filterCol ?? pk]) !== sub.filterVal) continue;
    // Async, like a real socket — so a caller's setState isn't re-entrant.
    setTimeout(() => sub.handler({ new: row, old: null, eventType }), 0);
  }
}

// A thenable query builder. The app uses these chains and no others:
//   .select('*') | .select('data').eq(col, val).single() | .select('id, data')
//   .upsert(row) | .insert(rows) | .delete().eq(col, val)
function makeQuery(store: FakeStore, table: string) {
  let mode: 'select' | 'upsert' | 'insert' | 'delete' | null = null;
  let payload: Row | Row[] | null = null;
  let filterCol: string | null = null;
  let filterVal: unknown = null;
  let wantSingle = false;

  const exec = (): { data: unknown; error: null | { message: string } } => {
    const t = tableOf(store, table);
    const pk = PRIMARY_KEYS[table] ?? 'id';

    if (mode === 'select') {
      let rows = [...t.values()];
      if (filterCol !== null) rows = rows.filter((r) => String(r[filterCol!]) === String(filterVal));
      store.ops.push({ op: 'select', table });
      if (wantSingle) {
        return rows.length > 0
          ? { data: rows[0], error: null }
          // Real PostgREST returns an error for .single() with no rows; the app
          // only destructures `data`, so null is the behaviour that matters.
          : { data: null, error: { message: 'No rows found' } };
      }
      return { data: rows, error: null };
    }

    if (mode === 'upsert') {
      const rows = Array.isArray(payload) ? payload : [payload!];
      for (const row of rows) {
        const key = String(row[pk]);
        t.set(key, { ...row });
        store.ops.push({ op: 'upsert', table, key });
        emit(store, table, { ...row }, 'UPDATE');
      }
      persist(store);
      return { data: rows, error: null };
    }

    if (mode === 'insert') {
      const rows = Array.isArray(payload) ? payload : [payload!];
      const log = store.appendLog.get(table) ?? [];
      log.push(...rows.map((r) => ({ ...r })));
      store.appendLog.set(table, log);
      store.ops.push({ op: 'insert', table });
      persist(store);
      return { data: rows, error: null };
    }

    if (mode === 'delete') {
      if (filterCol === null) throw new Error(`fake-supabase: delete on "${table}" without .eq() — refusing to wipe a table`);
      for (const [key, row] of [...t.entries()]) {
        if (String(row[filterCol]) === String(filterVal)) {
          t.delete(key);
          store.ops.push({ op: 'delete', table, key });
        }
      }
      persist(store);
      return { data: null, error: null };
    }

    throw new Error(`fake-supabase: query on "${table}" with no operation`);
  };

  const builder = {
    select(_cols?: string) { mode = 'select'; return builder; },
    upsert(rows: Row | Row[]) { mode = 'upsert'; payload = rows; return builder; },
    insert(rows: Row | Row[]) { mode = 'insert'; payload = rows; return builder; },
    delete() { mode = 'delete'; return builder; },
    update(rows: Row) { mode = 'upsert'; payload = rows; return builder; },
    eq(col: string, val: unknown) { filterCol = col; filterVal = val; return builder; },
    single() { wantSingle = true; return builder; },
    maybeSingle() { wantSingle = true; return builder; },
    // Thenable: `await q`, `q.then()`, and `q.then(undefined, onErr)` all work.
    then(onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
      try {
        return Promise.resolve(exec()).then(onOk, onErr);
      } catch (e) {
        return onErr ? Promise.resolve(onErr(e)) : Promise.reject(e);
      }
    },
    catch(onErr: (e: unknown) => unknown) { return builder.then(undefined, onErr); },
  };
  return builder;
}

function makeChannel(store: FakeStore, _name: string) {
  const pending: Subscriber[] = [];
  const channel = {
    on(
      _event: string,
      opts: { table?: string; filter?: string },
      handler: ChangeHandler,
    ) {
      // filter looks like "id=eq.<value>"
      let filterCol: string | null = null;
      let filterVal: string | null = null;
      if (opts.filter) {
        const m = opts.filter.match(/^([a-z_]+)=eq\.(.*)$/);
        if (m) { filterCol = m[1]; filterVal = m[2]; }
      }
      pending.push({ table: opts.table ?? '', filterCol, filterVal, handler });
      return channel;
    },
    subscribe(cb?: (status: string) => void) {
      store.subscribers.push(...pending);
      if (cb) setTimeout(() => cb('SUBSCRIBED'), 0);
      return channel;
    },
    unsubscribe() {
      for (const p of pending) {
        const i = store.subscribers.indexOf(p);
        if (i >= 0) store.subscribers.splice(i, 1);
      }
      return Promise.resolve('ok');
    },
  };
  return channel;
}

// The RPC the app uses for concurrent multi-device score merging. Faking it as a
// naive overwrite would make multi-device scoring LOOK verified while hiding the
// exact conflict-resolution this RPC exists to perform. Throw instead.
function mergeGameScores(): never {
  throw new Error(
    'fake-supabase: merge_game_scores() is intentionally NOT implemented.\n' +
    'It is real SQL performing concurrent multi-device write reconciliation, and a\n' +
    'naive in-memory overwrite would give false confidence. Multi-device scoring\n' +
    'must be verified against a real Supabase instance.',
  );
}

export function createFakeSupabase(store: FakeStore = createFakeStore()) {
  return {
    __store: store,
    from(table: string) {
      if (!(table in PRIMARY_KEYS)) {
        throw new Error(`fake-supabase: unknown table "${table}". Add it to PRIMARY_KEYS.`);
      }
      return makeQuery(store, table);
    },
    rpc(name: string, _args?: unknown) {
      if (name === 'merge_game_scores') return mergeGameScores();
      throw new Error(`fake-supabase: rpc("${name}") is not implemented.`);
    },
    channel(name: string) { return makeChannel(store, name); },
    removeChannel() { return Promise.resolve('ok'); },
  };
}
