// A4 (roadmap 2026-10): money reads the same everywhere. Winners carry "+", and only the
// stats ledger shows cents (UI_CONVENTIONS §1). The group dashboard showed "$12.50" for a winner.

import { expect, test } from '@playwright/test';

import { BASE, grantAndReset, PHONE, seedCard } from './helpers';

test('A4: the group dashboard money is whole dollars, with "+" on winners', async ({ context, page }) => {
  await grantAndReset(context, page);
  await page.setViewportSize(PHONE);
  await seedCard(page, 'Home hub — games + groups populated');
  await page.goto(`${BASE}/home`);
  await page.getByText('Weekend Warriors').first().click();
  await page.waitForURL(/\/home\/groups\//, { timeout: 15_000 });
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Money' }) });
  await expect(section).toBeVisible();
  const amounts = await section.locator('span.font-semibold').allInnerTexts();
  expect(amounts.length).toBeGreaterThan(0);
  for (const a of amounts) expect(a).toMatch(/^([+−]\$[1-9]\d*|\$0)$/);
  expect(amounts.some((a) => a.startsWith('+'))).toBe(true);
  await page.screenshot({ path: 'e2e/screenshots/a4-group-money-phone.png', fullPage: true });
});

test('A4: the stats ledger keeps cents and puts "+" on winners', async ({ context, page }) => {
  await grantAndReset(context, page);
  await seedCard(page, 'Home hub — games + groups populated');
  await page.goto(`${BASE}/home/stats`);
  await expect(page.getByText(/\+\$\d+\.\d\d/).first()).toBeVisible();
  await expect(page.getByText(/−\$\d+\.\d\d/).first()).toBeVisible();
});
