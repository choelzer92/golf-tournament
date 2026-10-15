// B1 Run it back (§5.cm): the format is what a rerun copies for sure; last time's players and
// course are pre-filled and walked, easy to change. The same field keeps its teams (fresh score
// keys — the new game opens with no scores); any change in the field rebuilds them.

import { expect, test } from '@playwright/test';
import { BASE, PHONE, resetBackend, seed, signInOrganizer, closeSendSheet } from './helpers';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

test('B1: Run it back from a closed game — same format, field, course and teams; no old scores', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const oldId = await seed(page, 'Classic pool — 2 foursomes, FULLY scored');
  await page.goto(`${BASE}/pool/${oldId}`);
  await page.waitForLoadState('networkidle');
  // Not offered until the game is closed out.
  await expect(page.getByRole('button', { name: 'Run it back' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close out game' }).first().click();
  await expect(page.getByText('Game closed out')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/b1-hub-closed.png', fullPage: true });
  await page.getByRole('button', { name: 'Run it back' }).click();
  await page.waitForURL(/\/pool\/new$/);

  // Players: last time's eight, pre-filled.
  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(8);
  await expect(page.getByText('Gary Fox').first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/b1-field.png', fullPage: true });
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();

  // The game: last time's, confirmed rather than re-asked.
  await expect(page.getByText('Same game as last time')).toBeVisible();
  await expect(page.getByLabel('Game style name')).toHaveValue('Closeout Test Pool');
  await expect(page.locator('input[name="structure"][value="teams:4+4"]')).toBeChecked();
  await page.screenshot({ path: 'e2e/screenshots/b1-structure.png', fullPage: true });
  await page.getByRole('button', { name: 'Next: Scoring' }).click();
  await expect(page.getByText('How is it scored?')).toBeVisible();
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  // Course: last time's, one tap to keep.
  await page.screenshot({ path: 'e2e/screenshots/b1-course.png', fullPage: true });
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
  await page.screenshot({ path: 'e2e/screenshots/b1-tees.png', fullPage: true });
  await page.getByRole('button', { name: /Next: Teams/ }).click();

  // Teams: last time's pairings are already built.
  await expect(page.getByText('How should teams be built?')).toBeVisible();
  await expect(page.getByRole('button', { name: /Next: Review/ })).toBeEnabled();
  await page.screenshot({ path: 'e2e/screenshots/b1-teams.png', fullPage: true });
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await signInOrganizer(page);
  await page.getByRole('button', { name: 'Create & send to players' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 15_000 });
  await closeSendSheet(page);
  const newId = new URL(page.url()).pathname.split('/').pop()!;
  expect(newId).not.toBe(oldId);
  // A brand-new round: nothing scored (Send to players still leads), nothing to close out.
  await expect(page.getByRole('heading', { name: 'Foursomes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send to players' })).toBeVisible();
  await expect(page.getByText('Close out game')).toHaveCount(0);
  const body = await page.locator('main').innerText();
  // Same team count → last time's pot split (25% each of $200), not the 2-team standard 70/70/40/20.
  expect(body).toMatch(/FRONT 9\W*\$50\W*BACK 9\W*\$50\W*OVERALL 18\W*\$50\W*JUNK\W*\$50/);
  for (const n of ['Craig', 'Jym', 'Dave', 'Rick', 'Sam', 'Tony', 'Will', 'Gary']) expect(body).toContain(n);
  await page.screenshot({ path: 'e2e/screenshots/b1-new-hub.png', fullPage: true });

  // "Start from…" in New Game lists that game; a changed field rebuilds the teams.
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  const startFrom = page.getByRole('region', { name: 'Start from' });
  await expect(startFrom).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/b1-start-from.png', fullPage: true });
  await startFrom.getByRole('button', { name: /Closeout Test Pool/ }).first().click();
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(8);
  await expect(startFrom).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(7);
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await expect(page.getByText('Same game as last time')).toBeVisible();
  await page.getByRole('button', { name: 'Next: Scoring' }).click();
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
  await page.getByRole('button', { name: /Next: Teams/ }).click();
  await expect(page.getByText('How should teams be built?')).toBeVisible();
  // §5.de / §5.df: the changed field got a FRESH balanced deal (the match cards' deal, redone on
  // the playing handicap), not last time's teams.
  await expect(page.getByRole('button', { name: /Even them out/ }).getByText('✓ Built these teams')).toBeVisible();
  await expect(page.getByText(/hand-adjusted since/)).toHaveCount(0);
});

// F-127 A (§5.di): the same rerun, one tap sooner — straight from the finished game's card on Home.
test('F-127: Run it back from Home\'s finished-game card opens the rerun', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const oldId = await seed(page, 'Classic pool — 2 foursomes, FULLY scored');
  await page.goto(`${BASE}/pool/${oldId}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Close out game' }).first().click();
  await expect(page.getByText('Game closed out')).toBeVisible();

  await signInOrganizer(page);
  await page.goto(`${BASE}/home`);
  await page.waitForURL(/\/home$/);
  const card = page.locator('div.bg-white', { hasText: 'Closeout Test Pool' }).filter({ has: page.getByRole('button', { name: 'Run it back' }) }).first();
  await expect(card).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/f127-home-run-it-back.png', fullPage: true });
  await card.getByRole('button', { name: 'Run it back' }).click();
  await page.waitForURL(/\/pool\/new$/);
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(8);
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await expect(page.getByText('Same game as last time')).toBeVisible();
  await expect(page.getByLabel('Game style name')).toHaveValue('Closeout Test Pool');
});
