// PRESSES (§5.dj/§5.dk): the scorer taps Press for the side 2 down, the press shows on the card and
// on the leaderboard as its own bet, and it can be removed, leaving a "removed" note. Seed: a 2 v 2
// in one foursome, $20 a team a leg ($10 a player), Craig & Jym 2 down after 2.

import { expect, test, type Page } from '@playwright/test';
import { BASE, PHONE, resetBackend, seed } from './helpers';

const SEED = 'Presses: 2 v 2 match play, 2 down after 2 (Press button)';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

async function openCard(page: Page, id: string) {
  await page.goto(`${BASE}/pool/${id}`);
  await page.getByRole('button', { name: /enter scores/i }).first().click();
  await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
  await expect(page.getByText(/^Hole \d+$/).first()).toBeVisible();
}

test('presses: tap Press at 2 down, see it on the card and the board, then remove it', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, SEED);
  await openCard(page, id);

  // The card offers the trailing side the press, naming the bet (§5.dk).
  const panel = page.getByRole('region', { name: 'Presses' });
  const press = panel.getByRole('button', { name: /Press · Craig & Jym: press the front 9, from hole 3/ });
  await expect(press).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/presses-1-offer.png', fullPage: true });

  await press.click();
  // The offer is gone (one press per bet per side) and the press is listed, all square, unplayed.
  await expect(press).toHaveCount(0);
  await expect(panel.getByText('Press 3–9')).toBeVisible();
  await expect(panel.getByText(/front 9 · \$10 a player/)).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/presses-2-pressed.png', fullPage: true });

  // The leaderboard lists it as its own bet, under the legs.
  await page.goto(`${BASE}/pool/${id}/leaderboard`);
  await page.waitForURL(/\/leaderboard/);
  const board = page.getByTestId('press-board');
  await expect(board.getByTestId('press-row')).toHaveCount(1);
  await expect(board).toContainText('Press 3–9');
  await expect(board).toContainText('$10 a player');
  await page.screenshot({ path: 'e2e/screenshots/presses-3-board.png', fullPage: true });

  // Remove it from the card: it asks first, then leaves a note and offers the press again.
  await openCard(page, id);
  const panel2 = page.getByRole('region', { name: 'Presses' });
  await panel2.getByRole('button', { name: 'Remove', exact: true }).click();
  await panel2.getByRole('button', { name: 'Remove press' }).click();
  await expect(panel2.getByText('Press 3–9')).toHaveCount(0);
  await expect(panel2.getByText(/Press from hole 3 removed/)).toBeVisible();
  await expect(panel2.getByRole('button', { name: /press the front 9/ })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/presses-4-removed.png', fullPage: true });

  await page.goto(`${BASE}/pool/${id}/leaderboard`);
  await page.waitForURL(/\/leaderboard/);
  await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();
  await expect(page.getByTestId('press-board')).toHaveCount(0);
});
