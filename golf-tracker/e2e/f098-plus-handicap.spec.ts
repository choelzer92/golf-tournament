// F-098 (§5.bv): a plus handicap works on every surface. On a full handicap it GIVES strokes
// back on the easiest holes — shown as an open ○ where received strokes show a dot — and a
// plus index reads "+2", never "-2". Typing "+2.1" by hand keeps the sign.

import { expect, test } from '@playwright/test';
import { BASE, PHONE, resetBackend, seed, goToGame } from './helpers';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

test('F-098: a +2 player gives two strokes back — hub, leaderboard and field editor say so', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'F-098: a +2 player in a full-handicap pool (thru 6)');

  await goToGame(page, id);
  await expect(page.getByText('Plus Pool').first()).toBeVisible();
  // The hub's foursome card: "(gives 2 back)", not "(-2 strokes)".
  await expect(page.getByText('(gives 2 back)')).toBeVisible();
  await expect(page.getByText(/-2 strokes/)).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/f098-hub.png', fullPage: true });

  // The leaderboard's player grid: two open circles on Craig's row, and his handicap as "+2".
  await goToGame(page, id, '/leaderboard');
  await page.waitForURL(/\/leaderboard/);
  const row = page.locator('tr', { hasText: 'Craig' }).filter({ hasText: '(+2)' }).first();
  await expect(row).toBeVisible();
  await expect(row.getByTitle('Gives a stroke back')).toHaveCount(2);
  await page.screenshot({ path: 'e2e/screenshots/f098-leaderboard.png', fullPage: true });
});

test('F-098: "+2.1" typed into the add-player box is a plus index, shown as +2.1', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(`${BASE}/pool/new`);
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.getByPlaceholder('Name', { exact: true }).fill('Pat');
  await page.getByPlaceholder('HCP').fill('+2.1');
  await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
  await expect(page.getByText('Index: +2.1')).toBeVisible();
  await expect(page.getByText('Index: 2.1')).toHaveCount(0);
});
