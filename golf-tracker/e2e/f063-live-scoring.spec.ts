// F-063 option A (approved §5.bm Q4): the pool scorecard flushes its pending write when the
// card is left, so a tap made within the 400ms debounce is not silently dropped.
//
// The second half of option A (own-group subscription + per-cell merge) is exercised by
// src/test/score-merge.test.ts; the sandbox's fake backend lives in one tab's sessionStorage,
// so two "phones" on one foursome can't be driven end-to-end here.

import { test, expect } from '@playwright/test';
import { BASE, PHONE, goToGame, resetBackend, seed } from './helpers';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

async function openFirstCard(page: import('@playwright/test').Page, id: string) {
  await goToGame(page, id);
  await page.getByRole('button', { name: 'Enter Scores' }).first().click();
  await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
  // Mid-round seed (thru 6): the card opens on the first unscored hole.
  await expect(page.getByText('Hole 7', { exact: true })).toBeVisible();
}

test('F-063: a score tapped right before leaving the card is saved (pagehide flush)', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'Classic pool — 2 foursomes, mid-round (thru 6)');
  await openFirstCard(page, id);

  // First player's row: nothing selected yet on hole 7.
  const four = page.getByRole('button', { name: '4', exact: true }).first();
  await expect(four).not.toHaveClass(/bg-green-700/);

  // Tap, then leave IMMEDIATELY — well inside the 400ms debounce. `goto` is a full
  // navigation, so the in-memory caches are wiped and only what reached the (fake)
  // backend survives. Before the fix the timer was cancelled on unmount and this tap
  // was lost.
  await four.click();
  await page.goto(`${BASE}/pool/${id}`);
  await page.waitForLoadState('networkidle');

  await openFirstCard(page, id);
  await expect(page.getByRole('button', { name: '4', exact: true }).first()).toHaveClass(/bg-green-700/);
});
