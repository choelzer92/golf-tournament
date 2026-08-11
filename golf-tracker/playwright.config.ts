import { defineConfig } from '@playwright/test';

// E2E config for UI verification against the SANDBOX server.
//
// `channel: 'chrome'` drives the system Chrome install rather than a
// Playwright-managed build, so no ~130 MB browser download is needed.
//
// Start the sandbox server first:
//   NEXT_PUBLIC_SANDBOX=1 npx next dev --port 3200
// It uses an in-memory backend and cannot reach a real database
// (see src/lib/supabase.ts and src/test/fake-supabase.ts).
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,        // one shared in-memory store per server
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.SANDBOX_URL ?? 'http://localhost:3200',
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
