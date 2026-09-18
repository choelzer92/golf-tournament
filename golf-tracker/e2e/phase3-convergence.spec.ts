import { test, expect, type Page } from '@playwright/test';
import { BASE, PHONE, EIGHT_PLAYERS, resetBackend, addPlayers, toScoringStep, buildTeams, chooseMoney } from './helpers';

// Phase 3 steps 5–6 (§5.bq Q5; spec §4–§5): captains ride on shared-foursome teams into the saved
// game, the hub offers "hide holes until all groups finish" to a team game across foursomes, and
// the money step never greys an option for an engine reason. Math and routing are pinned in
// src/test/phase3-captains-hide.test.ts; this pins what the organizer sees.

test.beforeEach(async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await resetBackend(context, page);
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
});

async function startWizard(page: Page, players: [string, string][], name: string) {
  await addPlayers(page, players);
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await expect(page.getByText('How do you want to compete?')).toBeVisible();
  await page.getByPlaceholder('e.g. Saturday Pool').fill(name);
}

async function courseAndTees(page: Page) {
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
}

test('step 5: captains chosen for 4 + 2 + 2 teams (the pairs share a foursome) reach the hub, which also offers hide-holes', async ({ page }) => {
  // Teams that each fill their own tee group keep their captain on the foursome card as the classic
  // pool always has; it is the SHARED-foursome team whose captain used to be dropped (§5.bq Q5).
  await startWizard(page, EIGHT_PLAYERS, 'Captained Four Two Two');
  await page.getByRole('button', { name: /Other split/ }).click();
  await page.getByLabel('Team sizes').fill('4, 2, 2');
  await expect(page.locator('input[name="structure"][value="custom"]')).toBeChecked();
  await toScoringStep(page);
  await courseAndTees(page);
  await page.getByRole('button', { name: 'Next: Teams' }).click();
  await expect(page.getByRole('heading', { name: 'Set Teams' })).toBeVisible();
  // Teams bigger than a pair default to captains (F-071 judgement call); the deal marks them "C".
  await expect(page.getByRole('button', { name: 'Use captains' })).toHaveClass(/bg-green/);
  await buildTeams(page, 'list');
  await expect(page.getByTitle('Captain').first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/phase3-step5-teams-captains.png', fullPage: true });
  await page.getByRole('button', { name: 'Next: Groups' }).click();
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await expect(page.getByText('How is the money played?')).toBeVisible();
  // Step 6: with captains on and every money model, nothing is greyed.
  for (const m of ['legs', 'per-hole', 'per-point', 'pot']) {
    await expect(page.locator(`input[name="money-model"][value="${m}"]`)).toBeEnabled();
  }
  expect(await page.locator('body').innerText()).not.toContain('Not built yet');
  await chooseMoney(page, 'per-point');
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/]+$/, { timeout: 15_000 });
  await expect(page.getByText(/4 \+ 2 \+ 2 · \$\/point · 2 groups/)).toBeVisible();
  // The hub's Teams list marks each captain.
  const teams = page.locator('section', { has: page.getByRole('heading', { name: 'Teams' }) });
  await expect(teams.getByTitle('Captain')).toHaveCount(3);
  await page.screenshot({ path: 'e2e/screenshots/phase3-step5-hub-captains.png', fullPage: true });
  // …and the editor offers hide-holes to a team game across two foursomes.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByText('Hide holes until all groups finish')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/phase3-step5-hub-hide-holes.png', fullPage: true });
});

test('step 6: 2 + 2 + 1 with every bonus on — pot, legs, $/hole and $/point all open', async ({ page }) => {
  await startWizard(page, EIGHT_PLAYERS.slice(0, 5), 'Two Two One');
  await toScoringStep(page, 'teams:2+2+1');
  await courseAndTees(page);
  await page.getByRole('button', { name: 'Next: Teams' }).click();
  await buildTeams(page, 'list');
  await page.getByRole('button', { name: 'Next: Groups' }).click();
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await expect(page.getByText('How is the money played?')).toBeVisible();
  await page.getByRole('button', { name: /\+ Add bonuses/ }).click();
  for (const m of ['legs', 'per-hole', 'per-point', 'pot']) {
    await expect(page.locator(`input[name="money-model"][value="${m}"]`)).toBeEnabled();
  }
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('Not built yet');
  expect(body).not.toContain('need each team in its own foursome');
  await page.screenshot({ path: 'e2e/screenshots/phase3-step6-money-221.png', fullPage: true });
});
