// F-111: the group page adds someone NEW by GHIN (name search, numbers) or by hand, in one
// step: saved to the roster and added to the group. It used to list saved players only.

import { expect, test } from '@playwright/test';
import { BASE, PHONE, grantAndReset, seedCard } from './helpers';

test.beforeEach(async ({ context, page }) => {
  await grantAndReset(context, page);
  await page.setViewportSize(PHONE);
  await seedCard(page, 'Event — Myrtle 2026');
  await page.route('**/api/ghin/search-golfer', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ golfers: [{ ghin: 3333333, first_name: 'Searchy', last_name: 'McSearch', handicap_index: '7.5', gender: 'M', club_name: 'Sandbox CC' }] }),
  }));
  await page.route('**/api/ghin/golfer', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ golfer: { ghin: 4444444, first_name: 'Numbo', last_name: 'Lookup', handicap_index: '12.3', gender: 'M' } }),
  }));
});

test('F-111: find a new player on GHIN from the group page; one tap saves and adds them', async ({ page }) => {
  await page.goto(`${BASE}/home/groups/g-weekend-warriors`);
  await expect(page.getByRole('heading', { name: 'Weekend Warriors' })).toBeVisible();
  const before = Number((await page.getByRole('heading', { name: /^Members \(\d+\)$/ }).innerText()).match(/\d+/)![0]);

  await page.getByRole('button', { name: /Someone new: find on GHIN/ }).click();
  await page.getByPlaceholder('Last name').fill('McSearch');
  await page.getByRole('button', { name: 'Search GHIN' }).click();
  await expect(page.getByRole('button', { name: /Searchy McSearch/ })).toContainText('7.5');
  await page.screenshot({ path: 'e2e/screenshots/f111-group-ghin-search.png', fullPage: true });
  await page.getByRole('button', { name: /Searchy McSearch/ }).click();
  await expect(page.getByRole('heading', { name: `Members (${before + 1})` })).toBeVisible();

  // By number too.
  await page.getByRole('button', { name: /Have GHIN numbers\?/ }).click();
  const box = page.getByPlaceholder(/One number, or a list/);
  await box.fill('4444444');
  await box.locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
  await expect(page.getByText('4444444 — added Numbo Lookup')).toBeVisible();
  await expect(page.getByRole('heading', { name: `Members (${before + 2})` })).toBeVisible();

  // Saved, not just on screen: a reload keeps both members.
  await page.reload();
  await expect(page.getByRole('heading', { name: `Members (${before + 2})` })).toBeVisible();
});
