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
  // The fake backend lives in each BROWSER TAB (module state + sessionStorage), not on
  // the server, so tests can't collide through it — proven by
  // e2e/parallel-isolation.spec.ts. The limit is CPU: dev-mode pages are heavy, and on
  // this 8-core machine a 57-test subset measured (warm, 2026-09-27) 4.5 min on 1 worker,
  // 3.6 on 2, 3.6 on 3, 3.8 and flaky on 4 even with one dev server PER worker. So 2 on
  // one server. PW_WORKERS=1 on a low-memory day.
  fullyParallel: true,
  workers: Number(process.env.PW_WORKERS ?? 2),
  reporter: [['list']],
  // Start the sandbox server ourselves so `npx playwright test` is a single
  // unattended command. reuseExistingServer keeps a hand-started dev server (with
  // hot reload) in play when there is one. NEXT_PUBLIC_SANDBOX=1 is what routes the
  // app at the in-memory fake — without it these tests would hit the real
  // database, so it is set here rather than left to the caller's shell.
  webServer: {
    command: 'npx next dev --port 3200',
    url: 'http://localhost:3200/sandbox',
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NEXT_PUBLIC_SANDBOX: '1' },
  },
  use: {
    baseURL: process.env.SANDBOX_URL ?? 'http://localhost:3200',
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
