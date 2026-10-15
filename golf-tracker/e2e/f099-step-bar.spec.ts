// F-099 option C (§5.bv) — the wizard's step bar ran ~630px wide on a 390px phone and dragged
// every step's form sideways. Phones now get "Step N of M · Name" and a thin progress bar; the
// full bar returns from `sm:` up.

import { expect, test } from '@playwright/test';
import { BASE, manualAddButton } from './helpers';

async function toTeesStep(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course chips)' }).first();
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await expect(page.getByText("Who's playing?")).toBeVisible();
  for (let i = 1; i <= 8; i++) {
    await page.getByPlaceholder('Name', { exact: true }).fill(`P${i}`);
    await page.getByPlaceholder('HCP').fill(String(i * 2));
    await manualAddButton(page).click();
  }
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await page.getByPlaceholder('Leave blank to name it by the game and course').fill('Step Bar Test');
  await page.getByRole('button', { name: 'Next: Scoring' }).click();
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
}

test('F-099: on a phone the wizard shows "Step N of M" and never scrolls sideways', async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/pool/new`);
  await expect(page.getByText('Step 1 of 7 · Players')).toBeVisible();
  await toTeesStep(page);
  await expect(page.getByText('Step 5 of 7 · Tees')).toBeVisible();
  // The full bar is present but hidden: "Money" (the last step) isn't on screen.
  await expect(page.getByText('Money', { exact: true })).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'e2e/screenshots/f099-phone-step.png' });
});

test('F-099: from sm: up the full step bar is back', async ({ context, page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await toTeesStep(page);
  await expect(page.getByRole('heading', { name: /Tees/i }).first()).toBeVisible();
  await expect(page.getByText('Money', { exact: true })).toBeVisible();
  await expect(page.getByText(/Step \d+ of \d+/)).toBeHidden();
  await page.screenshot({ path: 'e2e/screenshots/f099-desktop-step.png' });
});
