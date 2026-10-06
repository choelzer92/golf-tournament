// §5.ck: the wizard offers "Hide holes until all groups finish" — unchecked — only when each team
// is its own foursome. Teams that share foursomes police each other, so it never shows there (§5.bw).

import { expect, test, type Page } from '@playwright/test';
import { BASE, EIGHT_PLAYERS, PHONE, fieldToGameStep, resetBackend, toScoringStep, buildTeams, signInOrganizer, closeSendSheet } from './helpers';

const BOX = 'Hide holes until all groups finish';

test.beforeEach(async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await resetBackend(context, page);
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
});

async function courseTees(page: Page) {
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
}

test('§5.ck: two teams of 4 offer the box unchecked; checking it carries to the hub', async ({ page }) => {
  await fieldToGameStep(page, EIGHT_PLAYERS);
  await toScoringStep(page, 'teams:4+4');
  await courseTees(page);
  await page.getByRole('button', { name: /Next: Teams/ }).click();
  await page.getByRole('button', { name: /Captains’ deal/ }).click();
  await page.getByRole('button', { name: /Next: Review/ }).click();
  const box = page.getByRole('checkbox', { name: new RegExp('^' + BOX) });
  await expect(box).not.toBeChecked();
  await box.check();
  await page.screenshot({ path: 'e2e/screenshots/hide-holes-wizard-checked.png', fullPage: true });
  await signInOrganizer(page);
  await page.getByRole('button', { name: 'Create & send to players' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 15_000 });
  await closeSendSheet(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByRole('checkbox', { name: new RegExp('^' + BOX) })).toBeChecked();
});

test('§5.ck: four pairs across two foursomes never show the box', async ({ page }) => {
  await fieldToGameStep(page, EIGHT_PLAYERS);
  await toScoringStep(page, 'teams:2+2+2+2');
  await courseTees(page);
  await page.getByRole('button', { name: 'Next: Teams' }).click();
  await buildTeams(page, 'even');
  await page.getByRole('button', { name: 'Next: Groups' }).click();
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await expect(page.getByRole('button', { name: 'Create & send to players' })).toBeVisible();
  await expect(page.getByText(BOX)).toHaveCount(0);
});
