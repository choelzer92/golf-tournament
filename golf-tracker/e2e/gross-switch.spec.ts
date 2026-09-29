// §5.by: a gross game is a Net | Gross switch on every format, in the wizard and on the hub.
// Gross is a 0% allowance: it hides only the settings that decide how many strokes someone gets
// (allowance %, full vs off the low, basis), and Net brings the last percentage back.

import { expect, test } from '@playwright/test';
import { BASE, PHONE, fieldToGameStep, goToGame, resetBackend, seed, toScoringStep } from './helpers';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

test('§5.by: the wizard\'s Gross hides the stroke settings, Net brings them back', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  await fieldToGameStep(page);
  await toScoringStep(page);
  await expect(page.getByText('How much handicap counts?')).toBeVisible();
  const switcher = page.getByRole('radiogroup', { name: 'Net or gross' });
  await expect(switcher.getByRole('radio', { name: 'Net' })).toHaveAttribute('aria-checked', 'true');

  await switcher.getByRole('radio', { name: 'Gross' }).click();
  await expect(switcher.getByRole('radio', { name: 'Gross' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('How much handicap counts?')).toHaveCount(0);
  await expect(page.getByText('Who gets strokes?')).toHaveCount(0);
  await expect(page.getByText(/Nobody gets strokes/)).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/gross-wizard.png', fullPage: true });

  await switcher.getByRole('radio', { name: 'Net' }).click();
  await expect(page.getByText('How much handicap counts?')).toBeVisible();
  await expect(page.getByText('Who gets strokes?')).toBeVisible();
});

test('§5.by: the hub\'s Gross saves 0%, reads "gross", and Net restores the percentage', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'F-098: a +2 player in a full-handicap pool (thru 6)');
  await goToGame(page, id);
  await expect(page.getByText('(gives 2 back)')).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByText('Handicap allowance (%)')).toBeVisible();

  const switcher = page.getByRole('radiogroup', { name: 'Net or gross' });
  await switcher.getByRole('radio', { name: 'Gross' }).click();
  await expect(page.getByText('Handicap allowance (%)')).toHaveCount(0);
  await expect(page.getByText('Handicap strokes', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Handicap basis', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/gross-hub-editor.png', fullPage: true });

  // Saved: after a reload the summary says gross and the plus player gives nothing back.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/· gross/).first()).toBeVisible();
  await expect(page.getByText('(gives 2 back)')).toHaveCount(0);
  await expect(page.getByText(/low man|Off the low:/)).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/gross-hub.png', fullPage: true });

  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.getByRole('radiogroup', { name: 'Net or gross' }).getByRole('radio', { name: 'Net' }).click();
  await expect(page.getByText('Handicap allowance (%)')).toBeVisible();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('(gives 2 back)')).toBeVisible();
  await expect(page.getByText(/· 100% (hcap|handicap)/).first()).toBeVisible();
  await expect(page.getByText(/low man/)).toBeVisible();
});
