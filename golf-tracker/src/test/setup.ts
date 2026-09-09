// Test-environment safety harness.
//
// `.env.local` points at the LIVE Supabase holding real games (see AGENTS.md).
// Two independent guarantees keep tests away from it:
//
//   1. Vitest does not load `.env.local` — that's a Next.js behavior. So the
//      NEXT_PUBLIC_SUPABASE_* vars are simply absent here, and any attempt to
//      construct a real client throws "supabaseUrl is required" at import time.
//      Credentials are missing, so a write to production is not possible.
//
//   2. This file additionally hard-fails the run if those vars ever DO appear
//      (someone adds a dotenv plugin, exports them in their shell, or CI injects
//      them). Belt and braces — guarantee 1 is passive, this one is active.
//
// It also stubs fetch so ANY network attempt from a test is a loud failure
// rather than silent real traffic.

import { beforeAll, afterEach, vi } from 'vitest';

// `pool-game.ts` and `tournament-state.ts` hold the math we want to test AND a
// handful of persistence functions, so importing either constructs the module-level
// Supabase client. Replace that module wholesale with a stub whose every method
// throws. Two things follow:
//
//   - The compute layer is importable without credentials (which is why the real
//     client can't be built here — see the header comment).
//   - A test that reaches a persistence function fails LOUDLY instead of doing
//     anything real. There is no code path from a test to a live database.
vi.mock('@/lib/supabase', () => {
  const boom = (op: string) => () => {
    throw new Error(
      `Supabase.${op}() called from a test. Pure-compute tests must not touch persistence.`,
    );
  };
  const queryBuilder = {
    select: boom('select'), insert: boom('insert'), upsert: boom('upsert'),
    update: boom('update'), delete: boom('delete'), eq: boom('eq'), single: boom('single'),
  };
  return {
    supabase: {
      from: () => queryBuilder,
      rpc: boom('rpc'),
      channel: boom('channel'),
      removeChannel: boom('removeChannel'),
    },
  };
});

beforeAll(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url || key) {
    throw new Error(
      'REFUSING TO RUN: live Supabase credentials are visible to the test process.\n' +
      'Tests must never be able to reach the production database.\n' +
      'Unset NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY for test runs.',
    );
  }
});

// No test in the pure-compute suite should touch the network. Make it explode.
globalThis.fetch = vi.fn(() => {
  throw new Error('Network access attempted in a pure-compute test. This is a bug in the test.');
}) as never;

afterEach(() => {
  vi.clearAllMocks();
});
