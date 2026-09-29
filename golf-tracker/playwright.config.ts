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
// §5.bz: PW_SERVER=prod runs the suite against a production-mode SANDBOX build instead
// (`.next-sandbox`, see next.config.ts) on its own port, so a hand-started dev server on 3200
// is never mistaken for it. It pays one build up front, then every page is served prebuilt:
// the full gate uses it. The default stays `next dev`, which compiles only the routes a
// handful of specs visit (verify:quick with a small pick, or one spec by hand).
const prod = process.env.PW_SERVER === 'prod';
const port = prod ? 3201 : 3200;
// Workers read the base URL from e2e/helpers.ts, which honours SANDBOX_URL.
process.env.SANDBOX_URL ??= `http://localhost:${port}`;

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
  // The prod server measured (2026-09-29, 235 specs): 3 workers 5.6 min clean; 4 workers 5.9 min
  // with two load stalls. Dev: 2, as above.
  workers: Number(process.env.PW_WORKERS ?? (prod ? 3 : 2)),
  // A broken shared helper fails every spec; stop after 10 instead of timing out all of them
  // (a helper break cost a 50-minute run, 2026-09-28). PW_MAX_FAILURES=0 runs everything.
  maxFailures: Number(process.env.PW_MAX_FAILURES ?? 10),
  // Per-test durations land in .claude/e2e-timings.json; `node scripts/e2e-slowest.mjs` lists them.
  // PW_REPORTER picks the console reporter (the gates use `dot`); a --reporter flag would drop the json.
  reporter: [[process.env.PW_REPORTER ?? 'list'], ['json', { outputFile: '.claude/e2e-timings.json' }]],
  // Start the sandbox server ourselves so `npx playwright test` is a single
  // unattended command. reuseExistingServer keeps a hand-started dev server (with
  // hot reload) in play when there is one. NEXT_PUBLIC_SANDBOX=1 is what routes the
  // app at the in-memory fake — without it these tests would hit the real
  // database, so it is set here rather than left to the caller's shell.
  webServer: prod
    ? {
        // Never reuse in prod mode: a leftover server would be serving an OLD build.
        command: `npx next build && npx next start --port ${port}`,
        url: `http://localhost:${port}/sandbox`,
        reuseExistingServer: false,
        timeout: 300_000,
        env: { NEXT_PUBLIC_SANDBOX: '1', SANDBOX_BUILD: '1' },
      }
    : {
        command: `npx next dev --port ${port}`,
        url: `http://localhost:${port}/sandbox`,
        reuseExistingServer: true,
        timeout: 120_000,
        env: { NEXT_PUBLIC_SANDBOX: '1' },
      },
  use: {
    baseURL: process.env.SANDBOX_URL,
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
