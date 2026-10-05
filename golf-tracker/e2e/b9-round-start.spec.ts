// B9 (roadmap Phase B 9): a brand-new game doesn't open on its own exit. The hub's
// "Close out game" and the card's "Finish Game" stay hidden until a score exists, then appear.

import { expect, test } from '@playwright/test';
import { BASE, EIGHT_PLAYERS, PHONE, chooseSolo, fieldToGameStep, resetBackend, seed, toScoringStep, signInOrganizer } from './helpers';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

test('B9: a fresh game hides Close out and Finish Game until the first score', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  await fieldToGameStep(page, EIGHT_PLAYERS);
  await toScoringStep(page, 'solo');
  await chooseSolo(page, 'skins');
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
  await page.getByRole('button', { name: 'Next: Groups' }).click();
  await page.getByRole('button', { name: /Next: Review & Create/ }).click();
  await signInOrganizer(page);
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/]+$/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  const hubUrl = page.url();

  // The hub, with no scores: no close-out.
  await expect(page.getByRole('heading', { name: 'Tee groups' })).toBeVisible();
  await expect(page.getByText('Close out game')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/b9-hub-fresh.png', fullPage: true });

  // A fresh card: no Finish Game.
  await page.getByRole('button', { name: /enter scores/i }).first().click();
  await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
  await expect(page.getByText('Hole 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish Game' })).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/b9-card-fresh.png', fullPage: true });

  // One score → Finish Game appears.
  await page.getByRole('button', { name: '4', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Finish Game' })).toBeVisible();

  // Back on the hub, Close out is there now.
  await page.goto(hubUrl);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Close out game' })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/b9-hub-scored.png', fullPage: true });
});

test('B9: a completed game still shows Reopen', async ({ page }) => {
  const id = await seed(page, 'Classic pool — 2 foursomes, FULLY scored');
  await page.goto(`${BASE}/pool/${id}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Close out game' }).first().click();
  await expect(page.getByText('Game closed out')).toBeVisible();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Reopen game' })).toBeVisible();
});
