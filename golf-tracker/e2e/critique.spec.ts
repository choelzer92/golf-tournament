// CAPTURE pass for the critique loop (UI_CRITIQUE_PROCESS.md step 2).
//
// These tests exist to SEE screens, not to assert correctness. They seed a state,
// screenshot it at phone + desktop, and print the rendered text so it can be read
// and critiqued. Findings go to FINDINGS.md; fixes are proposed, not applied.
//
// Assertions here are deliberately minimal — just enough to prove the screen
// actually rendered (per the vacuous-test lesson: a capture of the wrong page is
// worse than no capture).

import { expect, test } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
});

async function seedAndOpen(page: import('@playwright/test').Page, label: string) {
  await page.goto(`${BASE}/sandbox`);
  const card = page.locator('div.bg-white', { hasText: label });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await card.getByRole('button', { name: 'Open →' }).click();
  await page.waitForLoadState('networkidle');
}

async function capture(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });
  const text = (await page.locator('body').innerText()).replace(/\n{3,}/g, '\n\n');
  console.log(`\n===== ${name} =====\n${text}\n`);
}

test.describe('continuing — the neglected phase', () => {
  test('capture /home/stats with a real season of money', async ({ page }) => {
    await seedAndOpen(page, 'Season ledger');
    // Prove we're on stats with data, not the empty state.
    await expect(page.getByRole('heading', { name: /Stats & money/i })).toBeVisible();
    await expect(page.getByText(/No finished games yet/i)).toHaveCount(0);
    await capture(page, 'stats-overall');

    // Each lens is a different rollup — capture all four.
    for (const lens of ['By group', 'By game', 'By player']) {
      await page.getByRole('button', { name: lens, exact: true }).click();
      await page.waitForTimeout(300);
      await capture(page, `stats-${lens.toLowerCase().replace(/\s+/g, '-')}`);
    }
  });

  test('capture /home/stats on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAndOpen(page, 'Season ledger');
    await expect(page.getByRole('heading', { name: /Stats & money/i })).toBeVisible();
    await capture(page, 'phone-stats');
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`horizontal overflow: ${overflow}px`);
  });

  test('capture a 61-member group', async ({ page }) => {
    await seedAndOpen(page, 'Groups — 61-member');
    await expect(page.getByText(/Weekend Warriors/i).first()).toBeVisible();
    await capture(page, 'group-large');
  });

  test('capture a 61-member group on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAndOpen(page, 'Groups — 61-member');
    await expect(page.getByText(/Weekend Warriors/i).first()).toBeVisible();
    await capture(page, 'phone-group-large');
  });

  test('capture the home hub', async ({ page }) => {
    await seedAndOpen(page, 'Home hub');
    await capture(page, 'home-hub');
  });
});
