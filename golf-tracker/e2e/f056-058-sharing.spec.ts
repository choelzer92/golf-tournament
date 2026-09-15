// Verification for the sharing follow-ups decided in §5.bh (2026-09-14):
// F-056 guests can open the Share panel, F-057 pool cookies expire in 48h,
// F-058 QR codes are generated on device (the token never leaves it).

import { expect, test } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';
const PHONE = { width: 390, height: 844 };

async function grantAndReset(context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page) {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
}

async function seedGameAndShareLink(page: import('@playwright/test').Page) {
  const card = page.locator('div.bg-white', { hasText: 'Classic pool — 2 foursomes, mid-round (thru 6)' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await card.getByRole('button', { name: 'Open →' }).click();
  await page.waitForURL(/\/pool\/[^/]+/, { timeout: 15_000 });
  const id = new URL(page.url()).pathname.match(/\/pool\/([^/]+)/)![1];
  await page.goto(`${BASE}/pool/${id}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Share' }).first().click();
  await expect(page.getByText(/Player scoring link/i)).toBeVisible();
  const link = await page.locator('input[readonly]').first().inputValue();
  const store = await page.evaluate(() => sessionStorage.getItem('__sandbox_supabase__') ?? '');
  return { id, link, store }; // NOTE: leaves the Share panel open on `page`
}

async function freshGuest(browser: import('@playwright/test').Browser, store: string) {
  const ctx = await browser.newContext({ viewport: PHONE });
  const guest = await ctx.newPage();
  await guest.goto(`${BASE}/sandbox`);
  await guest.evaluate((d) => sessionStorage.setItem('__sandbox_supabase__', d), store);
  await ctx.clearCookies();
  return { ctx, guest };
}

test('F-056: a scoring-link guest can open Share, but not Save format or Edit', async ({ browser, context, page }) => {
  await grantAndReset(context, page);
  const { link, store } = await seedGameAndShareLink(page);

  const { ctx, guest } = await freshGuest(browser, store);
  await guest.goto(link);
  await guest.waitForLoadState('networkidle');
  // Prove we're on the game hub as a guest.
  await expect(guest.getByText('Viewing as guest · scoring link')).toBeVisible();

  // The mutating controls stay hidden (the read-only vs mutating line, F-004)…
  await expect(guest.getByRole('button', { name: 'Save format' })).toHaveCount(0);
  await expect(guest.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);

  // …but Share is spreading a link the guest already holds.
  await guest.getByRole('button', { name: 'Share' }).first().click();
  await expect(guest.getByText(/Player scoring link/i)).toBeVisible();
  await ctx.close();
});

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

test('F-058: the game-hub QR is generated locally, not by api.qrserver.com', async ({ context, page }) => {
  await grantAndReset(context, page);
  await seedGameAndShareLink(page); // leaves the Share panel open
  const qr = page.getByAltText('QR code — open this game to enter scores');
  await expect(qr).toBeVisible();
  const src = await qr.getAttribute('src');
  expect(src).not.toContain('qrserver');
  expect(src).toMatch(/^(data:|blob:)/);
});

test('F-058: the organizer-link QR (My Games header) is generated locally too', async ({ context, page }) => {
  await grantAndReset(context, page);
  await page.goto(`${BASE}/pool`);
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();
  await page.getByRole('button', { name: 'Share' }).first().click();
  const qr = page.getByAltText('QR code — create a pool game');
  await expect(qr).toBeVisible();
  const src = await qr.getAttribute('src');
  expect(src).not.toContain('qrserver');
  expect(src).toMatch(/^(data:|blob:)/);
});
