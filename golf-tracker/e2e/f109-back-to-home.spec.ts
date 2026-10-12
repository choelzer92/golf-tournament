// F-109 (§5.cw d, fix 2): you open a game from Home, so its header goes back to Home, not the
// classic dashboard. A game that isn't found lands on Home too.

import { expect, test } from '@playwright/test';
import { BASE, PHONE, grantAndReset, seedCard } from './helpers';

test.beforeEach(async ({ context, page }) => {
  await grantAndReset(context, page);
  await page.setViewportSize(PHONE);
  await seedCard(page, 'Event — Myrtle 2026');
});

test('F-109: the game hub header goes back to Home', async ({ page }) => {
  await page.goto(`${BASE}/pool/ev-4`);
  await expect(page.getByTestId('event-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);
  await page.locator('header').getByRole('button', { name: 'Home', exact: true }).click();
  await page.waitForURL(/\/home$/);
  await expect(page.getByText(/Welcome back, Craig/)).toBeVisible();
});

test('F-109: a game that is not found lands on Home', async ({ page }) => {
  await page.goto(`${BASE}/pool/no-such-game`);
  await page.waitForURL(/\/home$/);
  await expect(page.getByText(/Welcome back, Craig/)).toBeVisible();
});
