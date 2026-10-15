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

// F-063 C (§5.ce, BETA bar #5): a DEAD SPOT. The sandbox's score write fails while the flag is set,
// as a lost signal does. The tap must stay on the card through a reload (it's in the outbox, not
// only in memory), and reach the backend once the signal is back.
test('F-063 C: a score tapped in a dead spot survives a reload and is sent when the signal returns', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'Classic pool — 2 foursomes, mid-round (thru 6)');
  await openFirstCard(page, id);
  await page.evaluate(() => sessionStorage.setItem('__sandbox_offline__', '1'));

  await page.getByRole('button', { name: '4', exact: true }).first().click();
  // Past the 400ms debounce, so the write has been tried and refused.
  await page.waitForTimeout(800);
  const stored = () => page.evaluate(() => {
    const raw = sessionStorage.getItem('__sandbox_supabase__');
    const tables = raw ? (JSON.parse(raw).tables as [string, [string, { hole: number; gross_score: number | null }][]][]) : [];
    const cells = tables.find(([t]) => t === 'score_cells')?.[1] ?? [];
    return cells.filter(([, r]) => r.hole === 7).length;
  });
  const queued = () => page.evaluate(() => JSON.parse(localStorage.getItem('golf-score-outbox-v1') ?? '[]').length as number);
  expect(await stored()).toBe(0);
  expect(await queued()).toBe(1);

  // The phone sleeps / the tab is reloaded while still in the dead spot: the tap is still on the card.
  await page.reload();
  await expect(page.getByText('Hole 7', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '4', exact: true }).first()).toHaveClass(/bg-green-700/);
  expect(await stored()).toBe(0);

  // Signal back: the outbox drains, and the score is on the backend.
  await page.evaluate(() => { sessionStorage.removeItem('__sandbox_offline__'); window.dispatchEvent(new Event('online')); });
  await expect.poll(stored, { timeout: 10_000 }).toBe(1);
  await expect.poll(queued).toBe(0);
});
