import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase } from '../test/fake-supabase';

// SANDBOX SEAM (dev only) — see src/test/fake-supabase.ts.
//
// With NEXT_PUBLIC_SANDBOX=1 in a non-production build, the app runs against an
// in-memory fake instead of Supabase, so the real UI can be driven with no
// credentials, no network, and no Docker. That fake is a UI harness only: it
// cannot prove persistence, RLS, or multi-device merge behaviour.
//
// BOTH conditions are required, so a production build can never take this branch
// even if the env var leaks in — NODE_ENV is 'production' there. `useSandbox` is
// then a compile-time false, so the bundler dead-code-eliminates the fake branch
// and the fake does not reach the shipped bundle (asserted by the build check in
// src/test/sandbox-seam.test.ts's sibling npm script — see AGENTS.md).
//
// The production path (createClient) is byte-for-byte what it was before.
const useSandbox =
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_SANDBOX === '1';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function makeClient(): SupabaseClient {
  if (useSandbox) {
    // Cast: the fake implements only the narrow slice of the client this app
    // actually calls (6 tables, select/upsert/insert/delete, rpc, channel) and
    // throws loudly on anything else, so consumers keep full real typing.
    return createFakeSupabase() as unknown as SupabaseClient;
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = makeClient();

/** True when running against the in-memory fake. Drives the sandbox banner. */
export const IS_SANDBOX = useSandbox;
