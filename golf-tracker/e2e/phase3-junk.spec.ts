import { test, expect } from '@playwright/test';
import { resetBackend, seed, goToGame } from './helpers';

// Phase 3 step 1 (§5.bq): junk is counted in POINTS on every engine and paid per point or as a
// junk pot. The money math is pinned in src/test/phase3-junk-vocabulary.test.ts; these pins cover
// what a player SEES.

test.beforeEach(async ({ context, page }) => {
  await resetBackend(context, page);
});

test('a saved team game with the old junk keys shows the points vocabulary and pays per point', async ({ page }) => {
  await seed(page, '2v2 best ball — mid-round');
  await expect(page.getByRole('heading', { name: "How it's played" })).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).toContain('Birdie (pts)');
  expect(body).toContain('Junk pays');
  expect(body).toContain('$ per junk point');
  expect(body).not.toContain('Birdie ($)');
});

test('junk POT: the leaderboard bonus board shows points and names the pot, not $ per player', async ({ page }) => {
  const id = await seed(page, '2v2 best ball — junk POT with birdies (Phase 3)');
  await goToGame(page, id, '/leaderboard');
  await expect(page.getByText('Birdie / Eagle Bonuses')).toBeVisible();
  // The bonus table is the one with a "Bird" column — the Stableford board has its own "Pts".
  const bonus = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Bird' }) });
  await expect(bonus.getByRole('columnheader', { name: 'Pts' })).toBeVisible();
  await expect(bonus.getByRole('columnheader', { name: 'Earned' })).toHaveCount(0);
  await expect(page.getByText(/Junk pot \$20 — the most points takes it/)).toBeVisible();
  // Side A (Craig 3 birdies + Jym) has 3 points to side B's 1: A takes the $20 pot, anted $10 each.
  // Legs are $10 each and A leads every leg thru 9 (front + overall) → +20 legs +10 junk = +30.
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/\+\$30/);
  await page.screenshot({ path: 'e2e/screenshots/phase3-junk-pot-leaderboard.png', fullPage: true });
});

test('junk POT: the hub names the pot and hides the per-point rate', async ({ page }) => {
  await seed(page, '2v2 best ball — junk POT with birdies (Phase 3)');
  await expect(page.getByRole('heading', { name: "How it's played" })).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).toContain('Junk pot ($)');
  expect(body).not.toContain('$ per junk point');
  await page.screenshot({ path: 'e2e/screenshots/phase3-junk-pot-hub.png', fullPage: true });
});
