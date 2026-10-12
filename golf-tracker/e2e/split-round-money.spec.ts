// §5.cs Q3 (Craig 2026-10-12): the money games on a SPLIT round are 18-hole bets by default (the
// 18-hole course handicap on the card); the organizer can choose each nine's 9-hole rating instead.
// The choice lives in the tournament's Money Games editor, shown only when a round is split.

import { expect, test } from '@playwright/test';
import { PHONE, resetBackend, seedCard } from './helpers';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

test('§5.cs: a split round offers the money-strokes choice, 18-hole by default, and saves per-nine', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const card = await seedCard(page, 'a tournament with a split round and money games');
  await card.getByRole('button', { name: 'Open →' }).click();
  await page.waitForURL(/\/tournament\/tx-split/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Money Games' })).toBeVisible();

  await page.locator('section', { has: page.getByRole('heading', { name: 'Money Games' }) }).getByRole('button', { name: 'Edit' }).click();
  const choice = page.getByLabel('On split rounds, money strokes use');
  await expect(choice).toHaveValue('18');
  await page.screenshot({ path: 'e2e/screenshots/split-money-choice.png', fullPage: true });
  await choice.selectOption('per-nine');
  await page.getByRole('button', { name: /^Save/ }).first().click();

  // Saved with the tournament: the editor reopens on the choice.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('section', { has: page.getByRole('heading', { name: 'Money Games' }) }).getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('On split rounds, money strokes use')).toHaveValue('per-nine');
});
