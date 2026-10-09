// F-037 T2 (§5.cn, §5.co): Team → Match. Two teams of 4, a 2 v 2 match in each foursome; the board
// shows the team totals (match points) and one row per match, and each group's card shows ONLY its
// own match. Seed: Hogs win both matches → 2–0, the $40 pot: Hogs +$20, Dawgs −$20.

import { expect, test, type Page } from '@playwright/test';
import { BASE, PHONE, resetBackend, seed } from './helpers';

const SEED = 'F-037: Hogs v Dawgs as two 2 v 2 matches';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

async function openCard(page: Page, id: string, group: number) {
  await page.goto(`${BASE}/pool/${id}`);
  await page.getByRole('button', { name: /enter scores/i }).nth(group - 1).click();
  await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
  await expect(page.getByText(/^Hole \d+$/).first()).toBeVisible();
}

test('F-037: the board shows team match points and one row per match, with the pot to the team', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, SEED);
  await page.goto(`${BASE}/pool/${id}/leaderboard`);
  await page.waitForURL(/\/leaderboard/);
  await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();

  const board = page.getByTestId('match-board');
  await expect(board).toBeVisible();
  const rows = board.getByTestId('match-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Craig & Jym v Dave & Rick');
  await expect(rows.nth(0)).toContainText('Craig & Jym 18 up');
  await expect(rows.nth(1)).toContainText('Sam & Tony v Will & Gary');
  await expect(rows.nth(1)).toContainText('Sam & Tony 18 up');

  const text = await page.locator('body').innerText();
  const standings = text.slice(text.indexOf('STANDINGS'), text.indexOf('MATCHES'));
  expect(standings).toMatch(/The Hogs[\s\S]*\b2\b[\s\S]*\+\$20/);
  expect(standings).toMatch(/The Dawgs[\s\S]*−\$20/);
  await page.screenshot({ path: 'e2e/screenshots/f037-board.png', fullPage: true });
});

test('F-037: each group\'s card shows only its own match, ranked within it', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, SEED);

  await openCard(page, id, 1);
  let body = await page.locator('body').innerText();
  const line = (who: string) => body.split('\n').find((l) => l.trim().startsWith(who)) ?? '';
  expect(line('Craig & Jym')).toContain('1st');
  expect(line('Dave & Rick')).toContain('2nd');
  expect(body).not.toContain('Sam & Tony');
  expect(body).not.toContain('Will & Gary');
  await page.screenshot({ path: 'e2e/screenshots/f037-card-group1.png', fullPage: true });

  await openCard(page, id, 2);
  body = await page.locator('body').innerText();
  expect(line('Sam & Tony')).toContain('1st');
  expect(line('Will & Gary')).toContain('2nd');
  expect(body).not.toContain('Dave & Rick');
});
