// TEMPORARY looking-glass for F-019. Not an assertion suite — it seeds the new
// two-group scenarios and screenshots every surface so the defects can be seen
// before anything is changed. Delete once the real assertions land.

import { expect, test, type Page } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';
const PHONE = { width: 390, height: 844 };

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
});

async function seed(page: Page, label: string): Promise<string> {
  await page.goto(`${BASE}/sandbox`);
  // `div.bg-white` + hasText matches the outer card AND its inner wrappers, so scope to the
  // card that actually holds the Seed button, and take the first (outermost) match.
  const card = page.locator('div.bg-white', { hasText: label }).first();
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await card.getByRole('button', { name: /Open/ }).click();
  await page.waitForURL(/\/pool\//, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  const m = page.url().match(/\/pool\/([^/?]+)/);
  return m ? m[1] : '';
}

test('F-019 BEFORE: 8 players, two tee times, four crossing sides', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'F-019: 8 players, TWO tee times, four sides');
  expect(id).not.toBe('');

  // Leaderboard — the seed lands here.
  await expect(page.locator('body')).toContainText(/Hogs|Dawgs/);
  await page.screenshot({ path: 'e2e/screenshots/f019-before-leaderboard.png', fullPage: true });

  // The hub: what does it claim about foursomes?
  await page.goto(`${BASE}/pool/${id}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'e2e/screenshots/f019-before-hub.png', fullPage: true });

  // Teams sheet — Craig was looking at this one.
  await page.goto(`${BASE}/pool/${id}/teams`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'e2e/screenshots/f019-before-teams.png', fullPage: true });
  const teamsText = await page.locator('body').innerText();

  // Scorecards.
  await page.goto(`${BASE}/pool/${id}/scorecards`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'e2e/screenshots/f019-before-scorecards.png', fullPage: true });
  const cardsText = await page.locator('body').innerText();

  // Print what the sheets SAY, so the defect is in the test log too.
  console.log('=== TEAMS SHEET ===\n' + teamsText);
  console.log('=== SCORECARDS ===\n' + cardsText.slice(0, 600));
});

test('F-019 BEFORE: 7 players as 4+3 with a sideless guest', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'F-019: 7 players as 4 + 3');
  expect(id).not.toBe('');
  await page.screenshot({ path: 'e2e/screenshots/f019-before-teams-7p.png', fullPage: true });
  console.log('=== TEAMS SHEET 7P ===\n' + await page.locator('body').innerText());

  await page.goto(`${BASE}/pool/${id}/leaderboard`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'e2e/screenshots/f019-before-leaderboard-7p.png', fullPage: true });
  console.log('=== LEADERBOARD 7P ===\n' + await page.locator('body').innerText());
});

test('F-019 CONTROL: the ordinary one-group 2v2', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'F-019 control: 4 players, ONE group');
  expect(id).not.toBe('');
  await page.screenshot({ path: 'e2e/screenshots/f019-control-teams.png', fullPage: true });
  console.log('=== CONTROL TEAMS ===\n' + await page.locator('body').innerText());
  await page.goto(`${BASE}/pool/${id}/leaderboard`);
  await page.waitForLoadState('networkidle');
  console.log('=== CONTROL LEADERBOARD ===\n' + await page.locator('body').innerText());
});
