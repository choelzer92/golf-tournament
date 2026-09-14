// Verification for the sharing follow-ups decided in §5.bh (2026-09-14):
// F-056 guests can open the Share panel, F-057 pool cookies expire in 48h,
// F-058 QR codes are generated on device (the token never leaves it).

import { expect, test } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';
const PHONE = { width: 390, height: 844 };

test('F-057: a pool-scope grant expires in ~48h, not 30 days', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/pool?key=poolparty2026`);
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();

  const cookie = (await ctx.cookies()).find((c) => c.name === 'golf_access');
  expect(cookie).toBeTruthy();
  expect(cookie!.value).toBe('pool');
  const now = Date.now() / 1000;
  // ≤48h (plus a little slack), and clearly NOT the 30-day full-access lifetime.
  expect(cookie!.expires).toBeLessThanOrEqual(now + 49 * 3600);
  expect(cookie!.expires).toBeGreaterThan(now + 40 * 3600);
  await ctx.close();
});
