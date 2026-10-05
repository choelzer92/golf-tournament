// §5.bv — no field cap on team games. Craig 2026-09-28: "what if there are 32 people?"
// Thirty-two players as 16 pairs, each pair split across two of eight foursomes. The leaderboard
// carries every team; a foursome's card lists only the teams with someone in it (16 rows on
// every card would bury the scores); the hub's team editor picks from a list, not 16 circles.

import { expect, test } from '@playwright/test';
import { BASE, PHONE, resetBackend, seed, goToGame, addPlayers, toScoringStep, chooseMoney, signInOrganizer, closeSendSheet } from './helpers';

const SEED = '§5.bv: 32 players, 8 foursomes, 16 pairs across groups (staggered)';

test.beforeEach(async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await resetBackend(context, page);
});

test('§5.bv: 32 players / 16 pairs — standings carry all 16 teams', async ({ page }) => {
  const id = await seed(page, SEED);
  await goToGame(page, id, '/leaderboard');
  await page.waitForURL(/\/leaderboard/);
  await expect(page.getByText('Big Field Pairs')).toBeVisible();
  await expect(page.getByText(/16 pairs · \$\/point · 8 groups/)).toBeVisible();
  // Rank 16 exists: the 16th team made the board.
  const standings = page.locator('table', { has: page.getByText('To par') }).first();
  await expect(standings.locator('tbody tr')).toHaveCount(16);
  // Partners in different foursomes appear as one team: Craig (group 1) with Ike (group 5).
  await expect(standings.getByText('Craig & Ike')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/cap-32-leaderboard.png', fullPage: true });
});

test('§5.bv: a foursome\'s card shows its own four teams, and says where the other twelve are', async ({ page }) => {
  const id = await seed(page, SEED);
  await goToGame(page, id);
  await expect(page.getByText('Group 8').first()).toBeVisible();
  await page.getByRole('button', { name: 'Enter Scores' }).first().click();
  await page.waitForURL(/\/game\/play/);
  // Group 1 is Craig, Jym, Dave, Rick — partners Ike, Jo, Kip, Lou in group 5.
  await expect(page.getByText('Craig & Ike').first()).toBeVisible();
  await expect(page.getByText('Rick & Lou').first()).toBeVisible();
  await expect(page.getByText('12 more teams in other groups — see Standings')).toBeVisible();
  // A team with nobody in this group is not on this card.
  await expect(page.getByText('Sam & Mo')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/cap-32-card.png', fullPage: true });
});

test('§5.bv: the hub team editor uses a list past four teams', async ({ page }) => {
  const id = await seed(page, SEED);
  await page.goto(`${BASE}/pool/${id}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByText('Teams options')).toBeVisible();
  const craig = page.getByLabel("Craig Hoelzer's team");
  await expect(craig).toHaveValue('a');
  await expect(page.getByLabel("Xan Test's team")).toHaveValue('p');
  await page.screenshot({ path: 'e2e/screenshots/cap-32-editor.png', fullPage: true });
});

test('§5.bv: twelve players as three teams of 4 on head-to-head legs is no longer refused', async ({ page, context }) => {
  // Refused until §5.bv: classic holds two teams on legs, and the team engine stopped at 8.
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
  await page.goto(`${BASE}/sandbox`);
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  void context;
  await page.goto(`${BASE}/pool/new`);
  const twelve: [string, string][] = Array.from({ length: 12 }, (_, i) => [`G${i + 1}`, String(i * 2)]);
  await addPlayers(page, twelve);
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await page.getByPlaceholder('e.g. Saturday Pool').fill('Twelve On Legs');
  await toScoringStep(page, 'teams:4+4+4');
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
  await page.getByRole('button', { name: /Next: Teams/ }).click();
  await expect(page.getByRole('heading', { name: 'Set Teams' })).toBeVisible();
  await page.getByRole('button', { name: 'No captains' }).click();
  await page.getByRole('button', { name: /Straight down the list/ }).click();
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await expect(page.getByRole('heading', { name: "What's it worth?" })).toBeVisible();
  await expect(page.locator('input[name="money-model"][value="legs"]')).toBeEnabled();
  expect(await page.locator('body').innerText()).not.toMatch(/top out at/);
  await chooseMoney(page, 'legs');
  await page.screenshot({ path: 'e2e/screenshots/cap-12-legs-money.png', fullPage: true });
  await signInOrganizer(page);
  await page.getByRole('button', { name: 'Create & send to players' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/]+$/, { timeout: 15_000 });
  await closeSendSheet(page);
  await expect(page.getByText(/3 teams of 4/)).toBeVisible();
});
