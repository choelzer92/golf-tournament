import { test, expect } from '@playwright/test';
import { resetBackend, seed, goToGame } from './helpers';

// Phase 3 step 3 (§5.bq/§5.br): with three or more teams, how the losers pay is a setting. It is
// shown only where it can change a payout — a two-team game never sees it. The money math itself is
// pinned in src/test/phase3-multi-team-payout.test.ts.

test.beforeEach(async ({ context, page }) => {
  await resetBackend(context, page);
});

test('a three-team game shows how its points pay, defaulting to pay each team you lost to', async ({ page }) => {
  // The seed opens its leaderboard; the setting rows live on the hub.
  const id = await seed(page, 'Three sides in one group (6 players)');
  await goToGame(page, id);
  await expect(page.getByRole('heading', { name: "How it's played" })).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).toContain('With 3+ teams, points pay');
  expect(body).toContain('Pay each team you lost to');
  await page.screenshot({ path: 'e2e/screenshots/phase3-three-teams-payout-hub.png', fullPage: true });
});

test('a two-team game is never asked how losers pay (the modes coincide)', async ({ page }) => {
  await seed(page, '2v2 best ball — mid-round');
  await expect(page.getByRole('heading', { name: "How it's played" })).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('With 3+ teams');
  // …and not in the hub editor either.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByRole('paragraph').filter({ hasText: /^Teams$/ })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('With 3+ teams');
});
