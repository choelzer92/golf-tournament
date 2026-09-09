// Guards the sandbox seam in src/lib/supabase.ts.
//
// The seam's entire safety argument is "the fake is only reachable when BOTH
// NODE_ENV !== 'production' AND NEXT_PUBLIC_SANDBOX === '1'". An untested guard is
// not a guard, so assert both directions — including that a production build with
// the flag set still refuses to use the fake.
//
// These tests deliberately do NOT use the global src/test/setup.ts mock of
// @/lib/supabase (they need the real module), so they stub createClient instead.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REAL_URL = 'https://example.supabase.co';
const REAL_KEY = 'anon-key';

// Records whether the network-capable client was constructed.
let createClientCalls = 0;

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => {
    createClientCalls += 1;
    return { __real: true, url, key };
  },
}));

// The global setup mocks @/lib/supabase; undo that for this file only.
vi.unmock('@/lib/supabase');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  createClientCalls = 0;
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = REAL_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = REAL_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function loadSeam() {
  // Import the REAL module, bypassing the global mock.
  return await import('../lib/supabase');
}

describe('sandbox seam', () => {
  it('uses the REAL client by default (no flag)', async () => {
    delete process.env.NEXT_PUBLIC_SANDBOX;
    vi.stubEnv('NODE_ENV', 'development');
    const mod = await loadSeam();
    expect(mod.IS_SANDBOX).toBe(false);
    expect(createClientCalls).toBe(1);
    expect((mod.supabase as unknown as { __real?: boolean }).__real).toBe(true);
  });

  it('uses the FAKE when the flag is set in development', async () => {
    process.env.NEXT_PUBLIC_SANDBOX = '1';
    vi.stubEnv('NODE_ENV', 'development');
    const mod = await loadSeam();
    expect(mod.IS_SANDBOX).toBe(true);
    // The network client must never be constructed in sandbox mode.
    expect(createClientCalls).toBe(0);
    expect((mod.supabase as unknown as { __store?: unknown }).__store).toBeDefined();
  });

  // The safety-critical case: flag leaks into a production build.
  it('REFUSES the fake in a production build even with the flag set', async () => {
    process.env.NEXT_PUBLIC_SANDBOX = '1';
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await loadSeam();
    expect(mod.IS_SANDBOX).toBe(false);
    expect(createClientCalls).toBe(1);
    expect((mod.supabase as unknown as { __real?: boolean }).__real).toBe(true);
  });

  it('ignores a flag value other than "1"', async () => {
    process.env.NEXT_PUBLIC_SANDBOX = 'true';
    vi.stubEnv('NODE_ENV', 'development');
    const mod = await loadSeam();
    expect(mod.IS_SANDBOX).toBe(false);
    expect(createClientCalls).toBe(1);
  });
});
