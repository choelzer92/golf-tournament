// Verification for the sharing/login/identity fixes (F-047…F-054, audit
// 2026-09-14). Each test is tagged with its finding id so the fix cannot
// silently regress. Capture evidence lives in e2e/sharing-audit.spec.ts.

import { expect, test } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';
const PHONE = { width: 390, height: 844 };

async function grantAndReset(context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page) {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
}

async function seedCard(page: import('@playwright/test').Page, label: string) {
  const card = page.locator('div.bg-white', { hasText: label });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  return card;
}

async function seedAndOpenGame(page: import('@playwright/test').Page, label: string): Promise<string> {
  const card = await seedCard(page, label);
  await card.getByRole('button', { name: 'Open →' }).click();
  await page.waitForURL(/\/pool\/[^/]+/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  const m = new URL(page.url()).pathname.match(/\/pool\/([^/]+)/);
  if (!m) throw new Error(`seed("${label}") did not land on a pool page: ${page.url()}`);
  return m[1];
}

// Seed a game as the owner and hand its share link + backing store to the caller.
async function seedGameAndShareLink(page: import('@playwright/test').Page) {
  const id = await seedAndOpenGame(page, 'Classic pool — 2 foursomes, mid-round (thru 6)');
  await page.goto(`${BASE}/pool/${id}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Share' }).first().click();
  await expect(page.getByText(/Player scoring link/i)).toBeVisible();
  const link = await page.locator('input[readonly]').first().inputValue();
  const store = await page.evaluate(() => sessionStorage.getItem('__sandbox_supabase__') ?? '');
  return { id, link, store };
}

// A "different device": fresh context carrying only the seeded backend data.
async function freshGuest(browser: import('@playwright/test').Browser, store: string) {
  const ctx = await browser.newContext({ viewport: PHONE });
  const guest = await ctx.newPage();
  await guest.goto(`${BASE}/sandbox`);
  await guest.evaluate((d) => sessionStorage.setItem('__sandbox_supabase__', d), store);
  await ctx.clearCookies();
  return { ctx, guest };
}

test('F-050/F-051: the invite gate says the code repeats, and grants a ~30-day sliding cookie', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/pool`);
  // F-050: returning-friend copy.
  await expect(page.getByText('Enter the invite code — the same one works every time')).toBeVisible();

  await page.getByPlaceholder('Invite code').fill('birdie2026');
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();

  // F-051: the cookie must outlive a week (30d nominal; assert > 20d for slack).
  const cookie = (await ctx.cookies()).find((c) => c.name === 'golf_access');
  expect(cookie).toBeTruthy();
  expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 20 * 24 * 3600);
  await ctx.close();
});

test('F-051: an existing cookie is refreshed on every visit (sliding expiry)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: PHONE });
  // A cookie about to expire (2 days out — the OLD lifetime).
  await ctx.addCookies([{
    name: 'golf_access', value: 'full', url: BASE,
    expires: Math.round(Date.now() / 1000 + 2 * 24 * 3600),
  }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/pool`);
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();
  const cookie = (await ctx.cookies()).find((c) => c.name === 'golf_access');
  expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 20 * 24 * 3600);
  await ctx.close();
});

test('F-052: a pool-access visitor who wanders is fenced to My Games, not the wizard', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/pool?key=poolparty2026`);
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();

  await page.goto(`${BASE}/home`);
  await expect(page).toHaveURL(`${BASE}/pool`);
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();
  await ctx.close();
});

test('F-047: Sign Out forgets the cookie and the durable identity', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  await grantAndReset(ctx, page);
  await seedCard(page, 'Home hub — games + groups populated'); // signs in as Craig
  await page.goto(`${BASE}/home`);
  await expect(page.getByText(/Welcome back, Craig/)).toBeVisible();

  await page.getByRole('button', { name: /sign out/i }).click();
  // Lands on the login page — greeted as a STRANGER (identity gone, F-053's flip side).
  await expect(page).toHaveURL(`${BASE}/`);
  await expect(page.getByText('Sign in with your GHIN account to get started')).toBeVisible();

  // The durable identity mirror is gone…
  expect(await page.evaluate(() => localStorage.getItem('ghin_golfer'))).toBeNull();
  // …and so is the access cookie: walking back into /pool hits the gate.
  expect((await ctx.cookies()).find((c) => c.name === 'golf_access')).toBeFalsy();
  await page.goto(`${BASE}/pool`);
  await expect(page.getByText(/Enter the invite code/)).toBeVisible();
  await ctx.close();
});

test('F-053: a returner with an expired GHIN session is greeted by name', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: PHONE });
  await ctx.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  const page = await ctx.newPage();
  // A durable identity from a past visit, but NO ghin_token (session expired).
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.setItem('ghin_golfer', JSON.stringify({ golfer_id: 1234567, first_name: 'Craig', last_name: 'Hoelzer' }));
  });
  await page.goto(`${BASE}/home`);
  // Bounced to the login page — which recognizes them.
  await expect(page).toHaveURL(`${BASE}/`);
  await expect(page.getByText(/Welcome back, Craig — your GHIN session expired/)).toBeVisible();
  await ctx.close();
});

test('F-048: a fabricated token-shaped key is refused by the game page', async ({ browser, context, page }) => {
  await grantAndReset(context, page);
  const { id, store } = await seedGameAndShareLink(page);

  const { ctx, guest } = await freshGuest(browser, store);
  await guest.goto(`${BASE}/pool/${id}?key=AAAAAAAAAAAAAAAAAAAAAAAA`);
  await expect(guest.getByText(/This link isn't valid for this game/)).toBeVisible();
  // And none of the game is exposed.
  await expect(guest.getByRole('button', { name: /enter scores/i })).toHaveCount(0);
  await ctx.close();
});

test('F-048/F-049: the REAL scoring link still opens, and says who you are', async ({ browser, context, page }) => {
  await grantAndReset(context, page);
  const { link, store } = await seedGameAndShareLink(page);

  const { ctx, guest } = await freshGuest(browser, store);
  await guest.goto(link);
  await guest.waitForLoadState('networkidle');
  // Prove we reached the game, not the gate or the refusal screen.
  await expect(guest.getByRole('button', { name: /enter scores/i }).first()).toBeVisible();
  // F-049: the header names the viewer — a guest on a scoring link.
  await expect(guest.getByText('Viewing as guest · scoring link')).toBeVisible();
  await ctx.close();
});

test('F-049: an identified viewer sees their own name on the game hub', async ({ context, page }) => {
  await grantAndReset(context, page);
  const { id } = await seedGameAndShareLink(page);
  await page.evaluate(() =>
    localStorage.setItem('ghin_golfer', JSON.stringify({ golfer_id: 1234567, first_name: 'Craig', last_name: 'Hoelzer' })));
  await page.goto(`${BASE}/pool/${id}`);
  await expect(page.getByText('Viewing as Craig Hoelzer')).toBeVisible();
});

test('F-054: at phone width every saved-player row shows its NAME and Remove', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  await grantAndReset(ctx, page);
  await seedCard(page, 'Groups — 61-member standing group + small crew + saved format');
  await page.goto(`${BASE}/pool/roster`);
  // Retitled from "Saved Players & Groups" when group management moved to /home (F-055).
  await expect(page.getByRole('heading', { name: /Saved Players/i })).toBeVisible();

  // The first row's name must be INSIDE the viewport, not overflowed out of it.
  const name = page.locator('li', { hasText: 'Index' }).first().locator('span.font-medium').first();
  await expect(name).toBeVisible();
  const box = await name.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
  expect((await name.innerText()).trim().length).toBeGreaterThan(2);

  // Remove is fully visible too (it was clipped to "R").
  const remove = page.getByRole('button', { name: 'Remove' }).first();
  await expect(remove).toBeVisible();
  const rbox = await remove.boundingBox();
  expect(rbox!.x + rbox!.width).toBeLessThanOrEqual(PHONE.width);
  await ctx.close();
});
