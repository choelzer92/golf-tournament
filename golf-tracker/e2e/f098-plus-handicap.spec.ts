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
  await manualRow(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Index: +2.1')).toBeVisible();
  await expect(page.getByText('Index: 2.1')).toHaveCount(0);
});

// The manual-add row: Name, the "+" chip, HCP, Add.
const manualRow = (page: import('@playwright/test').Page) =>
  page.locator('div.flex', { has: page.getByPlaceholder('Name', { exact: true }) }).last();

test('F-100: the "+" chip makes a typed 2.1 a plus index (the iPhone keypad has no "+")', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(`${BASE}/pool/new`);
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.getByPlaceholder('Name', { exact: true }).fill('Pat');
  await page.getByPlaceholder('HCP').fill('2.1');
  const chip = manualRow(page).getByRole('button', { name: /Plus handicap/ });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await expect(page.getByPlaceholder('HCP')).toHaveValue('+2.1');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  // The whole row fits a phone: Add is on screen, and the page doesn't scroll sideways.
  await expect(manualRow(page).getByRole('button', { name: 'Add', exact: true })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);
  await page.screenshot({ path: 'e2e/screenshots/f100-add-chip.png' });
  await manualRow(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Index: +2.1')).toBeVisible();
});

test('F-100: the hub field editor shows "+2" and the chip flips it, saved at once', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'F-098: a +2 player in a full-handicap pool (thru 6)');
  await goToGame(page, id);
  await expect(page.getByText('(gives 2 back)')).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const box = page.getByLabel('Handicap index').first();
  await expect(box).toHaveValue('+2');
  await page.screenshot({ path: 'e2e/screenshots/f100-hub-editor.png', fullPage: true });
  // Flip it off: Craig becomes a 2, who receives strokes.
  await page.getByRole('button', { name: /Plus handicap/ }).first().click();
  await expect(box).toHaveValue('2');
  await page.reload();
  await expect(page.getByText('(gives 2 back)')).toHaveCount(0);
  // And back on.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByLabel('Handicap index').first()).toHaveValue('2');
  await page.getByRole('button', { name: /Plus handicap/ }).first().click();
  await page.reload();
  await expect(page.getByText('(gives 2 back)')).toBeVisible();
});

test('F-102 d: the hub and the teams sheet write a plus handicap "+2", never "-2"', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'F-098: a +2 player in a full-handicap pool (thru 6)');
  await goToGame(page, id);
  await expect(page.getByText('(gives 2 back)')).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByTitle('Gives 2 back in this game')).toHaveText('(+2)');
  await expect(page.getByText(/\(-2\)|HCP -2/)).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/f102d-hub.png', fullPage: true });

  await goToGame(page, id, '/teams');
  await page.waitForURL(/\/teams/);
  await expect(page.getByTitle('Gives 2 back this game')).toHaveText('+2');
  await page.screenshot({ path: 'e2e/screenshots/f102d-teams.png', fullPage: true });
});
