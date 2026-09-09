import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Test config for the PURE compute layer (lib/game-modes/*, money-games, pool-game
// math). Nothing here touches Supabase, the network, or a browser — see
// AGENTS.md. `@/` mirrors the tsconfig path alias so tests import exactly what
// the app imports.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Hard-fails the run if live Supabase credentials are ever visible, and makes
    // any network attempt an explicit error. See src/test/setup.ts.
    setupFiles: ['./src/test/setup.ts'],
  },
});
