// F-101 d (§5.bw 5, §5.ca): individual modes past 4, across tee groups.
// - The wizard offers everyone-for-themselves at 8, asks who walks together, and starts skins
//   on the skins pot (a $ per skin is paid by every other player: $155 at 32).
// - The board ranks the whole field; a hole the last group hasn't reached is an open skin, shown
//   live with who's low so far, and unpaid.
// - Each group's card says the rest of the field is on Standings.

import { expect, test } from '@playwright/test';
import { BASE, EIGHT_PLAYERS, PHONE, chooseSolo, fieldToGameStep, resetBackend, seed, toScoringStep, signInOrganizer } from './helpers';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

test('F-101 d: eight players play skins as individuals, on two tee groups', async ({ page }) => {
  await page.setViewportSize(PHONE);
  // A course to pick: the "Past games" seed gives the course step its recent-course chip.
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  await fieldToGameStep(page, EIGHT_PLAYERS);
  await expect(page.getByRole('radio', { name: 'Everyone for themselves', exact: true })).toBeEnabled();
  await toScoringStep(page, 'solo');
  // Skins takes the field; Wolf still needs its foursome.
  await expect(page.locator('input[name="solo-mode"][value="skins"]')).toBeEnabled();
  await expect(page.locator('input[name="solo-mode"][value="wolf"]')).toBeDisabled();
  await chooseSolo(page, 'skins');
  // §5.ca: past four, skins starts on the pot.
  await expect(page.getByText('Buy-in ($ / player)')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/f101d-wizard-skins-8.png', fullPage: true });

  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
  await page.getByRole('button', { name: 'Next: Groups' }).click();
  await expect(page.getByText('Who’s playing together?').or(page.getByText("Who's playing together?"))).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/f101d-wizard-groups.png', fullPage: true });
  await page.getByRole('button', { name: /Next: Review & Create/ }).click();
  await signInOrganizer(page);
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/]+$/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Tee groups' })).toBeVisible();
  await expect(page.getByText('Group 2').first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/f101d-hub-8.png', fullPage: true });
});

test('F-101 d + §5.cc: a 32-player skins board, open skins with players played, $ if it ended now', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'F-101 d: Skins, 32 players, 8 foursomes (staggered)');
  await page.goto(`${BASE}/pool/${id}/leaderboard`);
  await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();
  // 32 × $10 on the skins pot.
  await expect(page.getByText('$320 pot')).toBeVisible();
  // The last group is 4 holes in: holes 5–18 aren't decided, so they read live, unpaid.
  // §5.cc: each open hole lists who's low and how many of the 32 have played it.
  await expect(page.getByText('Open skins: each pays once all 32 players have played it')).toBeVisible();
  await expect(page.locator('li', { hasText: /^Hole 5 / })).toContainText('28 of 32 played');
  await expect(page.getByRole('columnheader', { name: 'Leading' })).toBeVisible();
  // A pot skin's $ is provisional mid-round: as if no more skins were won.
  await expect(page.getByText(/if it ended now with no more skins won: \$\d+ a skin \(\$320 ÷ \d+\)/)).toBeVisible();
  // Every player is on the board, from every group.
  const body = await page.locator('body').innerText();
  for (const name of ['Xan', 'Al', 'Ula']) expect(body).toContain(name);
  await page.screenshot({ path: 'e2e/screenshots/f101d-board-32.png', fullPage: true });

  // Group 1's card: its own four, and a pointer to the rest.
  await page.goto(`${BASE}/pool/${id}`);
  await page.getByRole('button', { name: /enter scores/i }).first().click();
  await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
  await expect(page.getByText(/^Hole \d+$/).first()).toBeVisible();
  await expect(page.getByText('28 more players in other groups — see Standings')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/f101d-card-32.png', fullPage: true });
});
