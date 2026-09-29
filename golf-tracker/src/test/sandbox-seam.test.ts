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

  // §5.bz: the e2e gate's sandbox build is production-mode, opted in at BUILD time.
  it('the sandbox BUILD (both flags) runs on the fake in production mode', async () => {
    process.env.NEXT_PUBLIC_SANDBOX = '1';
    process.env.SANDBOX_BUILD = '1';
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await loadSeam();
    expect(mod.IS_SANDBOX).toBe(true);
    expect(createClientCalls).toBe(0);
  });

  it('the sandbox-build flag alone never selects the fake', async () => {
    delete process.env.NEXT_PUBLIC_SANDBOX;
    process.env.SANDBOX_BUILD = '1';
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await loadSeam();
    expect(mod.IS_SANDBOX).toBe(false);
    expect(createClientCalls).toBe(1);
  });

  it('ignores a flag value other than "1"', async () => {
    process.env.NEXT_PUBLIC_SANDBOX = 'true';
    vi.stubEnv('NODE_ENV', 'development');
    const mod = await loadSeam();
    expect(mod.IS_SANDBOX).toBe(false);
    expect(createClientCalls).toBe(1);
  });
});

// §5.bz: the sandbox build can never be the `.next` that deploys.
describe('next.config: the sandbox build is walled off', () => {
  const loadConfig = async () => (await import('../../next.config')).default;

  it('a normal production build: no sandbox pages, the usual .next', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.SANDBOX_BUILD;
    delete process.env.NEXT_PUBLIC_SANDBOX;
    const cfg = await loadConfig();
    expect(cfg.pageExtensions).not.toContain('sandbox.tsx');
    expect(cfg.distDir).toBeUndefined();
    expect(cfg.env?.SANDBOX_BUILD).toBe('0');   // defined, so it inlines as a constant
  });

  it('the sandbox build writes to .next-sandbox, never .next', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.SANDBOX_BUILD = '1';
    process.env.NEXT_PUBLIC_SANDBOX = '1';
    const cfg = await loadConfig();
    expect(cfg.pageExtensions).toContain('sandbox.tsx');
    expect(cfg.distDir).toBe('.next-sandbox');
  });

  it('refuses a sandbox build that would talk to the real backend', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.SANDBOX_BUILD = '1';
    delete process.env.NEXT_PUBLIC_SANDBOX;
    await expect(loadConfig()).rejects.toThrow(/requires NEXT_PUBLIC_SANDBOX=1/);
  });
});
