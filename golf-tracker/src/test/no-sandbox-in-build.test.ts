// Guards against dev-only sandbox code reaching a production build.
//
// This existed as a real defect: guarding the sandbox page's RENDER with a runtime
// flag was not enough — Next still compiled the route and shipped its seed logic
// (fixture player names, savePoolGame calls) into production JS as
// unreachable-but-present code. The fix is next.config.ts's pageExtensions, which
// only recognises `.sandbox.tsx` outside production, so the route does not exist
// in a production build at all.
//
// Runs against an EXISTING .next build if one is present; skips otherwise (so it
// never slows the unit suite down by building). Run `npm run build` first to make
// it meaningful — CI should do build-then-test.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BUILD_DIR = '.next';

// Every .js file in the build output (the code that actually ships/executes).
function buildJsFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) buildJsFiles(p, acc);
    else if (entry.endsWith('.js')) acc.push(p);
  }
  return acc;
}

const hasBuild = existsSync(join(BUILD_DIR, 'server'));

describe.skipIf(!hasBuild)('production build contains no sandbox code', () => {
  const files = [
    ...buildJsFiles(join(BUILD_DIR, 'static')),
    ...buildJsFiles(join(BUILD_DIR, 'server')),
  ];

  it('has a build to inspect', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // Distinctive strings from the fake client and the seed page. If any appears in
  // shipped JS, dev-only code leaked.
  const FORBIDDEN = [
    'createFakeSupabase',
    'intentionally NOT implemented',   // fake's merge_game_scores guard
    'refusing to wipe a table',         // fake's delete guard
    '__sandbox_supabase__',             // fake's sessionStorage key
    'Sandbox National',                 // seed fixture course
    'Closeout Test Pool',               // seed scenario
    'seed a game state',                // sandbox page heading
  ];

  for (const needle of FORBIDDEN) {
    it(`does not ship "${needle}"`, () => {
      const hits = files.filter((f) => readFileSync(f, 'utf8').includes(needle));
      expect(hits, `found in: ${hits.slice(0, 3).join(', ')}`).toEqual([]);
    });
  }

  it('does not emit a /sandbox route', () => {
    const appDir = join(BUILD_DIR, 'server', 'app');
    if (!existsSync(appDir)) return;
    const entries = readdirSync(appDir).filter((e) => e.toLowerCase().includes('sandbox'));
    expect(entries).toEqual([]);
  });
});
