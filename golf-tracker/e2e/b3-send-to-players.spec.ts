// B3 + F-105 (§5.cl): Create is the share moment. The wizard has no Share (it only ever sent the
// organizer link), "Create & send to players" lands on the hub with the player-link sheet open,
// and "Send to players" leads the hub until a score exists.

import { expect, test } from '@playwright/test';
import { BASE, EIGHT_PLAYERS, PHONE, chooseSolo, fieldToGameStep, resetBackend, seed, toScoringStep, signInOrganizer } from './helpers';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

test('B3: Create & send to players opens the player link; Send to players leads until a score', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  // F-105: no Share in the wizard header.
  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);

  await fieldToGameStep(page, EIGHT_PLAYERS);
  await toScoringStep(page, 'solo');
  await chooseSolo(page, 'skins');
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
  await page.getByRole('button', { name: 'Next: Groups' }).click();
  await page.getByRole('button', { name: /Next: Review & Create/ }).click();
  await signInOrganizer(page);
  await page.getByRole('button', { name: 'Create & send to players' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 15_000 });

  // The sheet is open on THIS game's player link, and the ?send flag is gone from the URL.
  await expect(page.getByText('Player scoring link')).toBeVisible();
  const link = await page.locator('input[readonly]').first().inputValue();
  const id = new URL(page.url()).pathname.split('/').pop()!;
  expect(link).toContain(`/pool/${id}?key=`);
  await page.screenshot({ path: 'e2e/screenshots/b3-sheet-after-create.png', fullPage: true });

  // Closed, the hub leads with Send to players (filled) and Leaderboard steps back.
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Tee groups' })).toBeVisible();
  const send = page.getByRole('button', { name: 'Send to players' });
  await expect(send).toHaveClass(/bg-green-700/);
  await expect(page.getByRole('button', { name: 'Leaderboard', exact: true })).not.toHaveClass(/bg-green-700/);
  await page.screenshot({ path: 'e2e/screenshots/b3-hub-fresh.png', fullPage: true });
  await send.click();
  await expect(page.getByText('Player scoring link')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // A reload doesn't reopen the sheet.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Tee groups' })).toBeVisible();
  await expect(page.getByText('Player scoring link')).toHaveCount(0);
});

test('B3: once scores exist, Leaderboard leads and Send to players is gone', async ({ page }) => {
  const id = await seed(page, 'Classic pool — 2 foursomes, mid-round (thru 6)');
  await page.goto(`${BASE}/pool/${id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Leaderboard', exact: true })).toHaveClass(/bg-green-700/);
  await expect(page.getByRole('button', { name: 'Send to players' })).toHaveCount(0);
  // Sharing stays one tap away in the header.
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible();
});
