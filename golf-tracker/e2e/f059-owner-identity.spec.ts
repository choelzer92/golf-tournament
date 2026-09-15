// F-059 (§5.bi): ownership is IDENTITY, not the invite code. The sandbox server
// runs with the owner GHIN configured (1234567 — the fake Craig; see
// getOwnerGhin in lib/invite-gate.ts), so these tests exercise both sides:
// the owner sees everything, a code-holding member sees exactly their own,
// and a code-holder with no identity gets a login prompt, never everyone's data.

import { expect, test } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';

async function grantAndReset(context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page) {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
}

// Seed the season: games + groups all created by Craig (GHIN 1234567), signed in.
async function seedSeason(page: import('@playwright/test').Page) {
  const card = page.locator('div.bg-white', { hasText: 'Home hub — games + groups populated' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
}

test('F-059: the app owner (full access + owner GHIN) still sees everything', async ({ context, page }) => {
  await grantAndReset(context, page);
  await seedSeason(page);

  await page.goto(`${BASE}/home`);
  await expect(page.getByText(/Welcome back, Craig/)).toBeVisible();
  // All groups, all games, and the owner-only feedback read-back link.
  await expect(page.getByText('Weekend Warriors')).toBeVisible();
  await page.getByRole('button', { name: /Your golf/ }).click();
  await expect(page.getByText('Warriors — Week 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read feedback notes →' })).toBeVisible();
});

test('F-059: a code-holding MEMBER sees exactly their own — not everyone\'s', async ({ context, page }) => {
  await grantAndReset(context, page);
  await seedSeason(page); // signs in as Craig…

  // …then become Jym: same full-access cookie, different GHIN identity.
  await page.evaluate(() => {
    const jym = JSON.stringify({ golfer_id: 7654321, first_name: 'Jym', last_name: 'Youngberg' });
    sessionStorage.setItem('ghin_golfer', jym);
    localStorage.setItem('ghin_golfer', jym);
  });

  await page.goto(`${BASE}/home`);
  await expect(page.getByText(/Welcome back, Jym/)).toBeVisible();
  // Craig's groups and games are NOT Jym's to see.
  await expect(page.getByText('Weekend Warriors')).toHaveCount(0);
  await page.getByRole('button', { name: /Your golf/ }).click();
  await expect(page.getByText('Warriors — Week 1')).toHaveCount(0);
  // The owner-only feedback read-back hides, and the page itself refuses.
  await expect(page.getByRole('button', { name: 'Read feedback notes →' })).toHaveCount(0);
  await page.goto(`${BASE}/home/feedback`);
  await expect(page).toHaveURL(`${BASE}/`);

  // The classic dashboard is scoped the same way (it had NO check before).
  await page.goto(`${BASE}/dashboard`);
  await expect(page.getByText('Warriors — Week 1')).toHaveCount(0);
});

test('F-059: a code-holder with NO identity gets a login prompt, never everyone\'s games', async ({ browser, context, page }) => {
  await grantAndReset(context, page);
  await seedSeason(page);
  const store = await page.evaluate(() => sessionStorage.getItem('__sandbox_supabase__') ?? '');

  // A device that typed the invite code but never logged into GHIN.
  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(`${BASE}/sandbox`);
  await guest.evaluate((d) => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('__sandbox_supabase__', d);
  }, store);
  await ctx.clearCookies();
  await ctx.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);

  await guest.goto(`${BASE}/pool`);
  // The /pool prompt pattern: never a false-empty list, never everyone's data.
  await expect(guest.getByText('See your saved games')).toBeVisible();
  await expect(guest.getByText('Warriors — Week 1')).toHaveCount(0);
  await ctx.close();
});
