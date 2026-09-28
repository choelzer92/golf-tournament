// F-070: the leaderboard's Score History works against the sandbox fake. Before, the
// fake had no `.in()` — opening the history threw an unhandled rejection (logged in
// every verify run) and the panel could never show a change.

import { test, expect } from '@playwright/test';
import { BASE, PHONE, resetBackend, seed, goToGame } from './helpers';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

test('F-070: a score entered on the card shows in the leaderboard Score History', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'Classic pool — 2 foursomes, mid-round (thru 6)');

  await goToGame(page, id);
  await page.getByRole('button', { name: 'Enter Scores' }).first().click();
  await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
  await expect(page.getByText('Hole 7', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '4', exact: true }).first().click();
  await page.waitForTimeout(800);                    // past the card's 400ms debounce

  await page.goto(`${BASE}/pool/${id}/leaderboard`);
  await page.waitForURL(/\/leaderboard/);
  await page.getByRole('button', { name: /Score History/ }).click();
  const table = page.locator('table', { has: page.getByRole('columnheader', { name: 'Change' }) });
  await expect(table).toBeVisible();
  await expect(table.getByRole('row').filter({ has: page.getByRole('cell', { name: '7', exact: true }) }).first()).toBeVisible();
  expect(errors.filter((m) => m.includes('is not a function'))).toEqual([]);
});
