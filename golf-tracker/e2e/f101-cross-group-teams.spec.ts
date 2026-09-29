// F-101 (§5.bw): teams across foursomes are first-class — Hogs v Dawgs is the reference.
// a: a two-team card takes its team rows from the ENGINE when a team spans groups, so every
//    group's card shows the same totals as the board.

import { expect, test, type Page } from '@playwright/test';
import { BASE, PHONE, resetBackend, seed } from './helpers';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

async function cardRow(page: Page, id: string, group: number, team: string): Promise<string> {
  await page.goto(`${BASE}/pool/${id}`);
  await page.getByRole('button', { name: /enter scores/i }).nth(group - 1).click();
  await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Finish Game' })).toBeVisible();
  const body = await page.locator('body').innerText();
  return body.split('\n').find((l) => l.trim().startsWith(team)) ?? '';
}

test('F-101 a: both groups\' cards show the board\'s team totals when teams span foursomes', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'F-101 a: Hogs v Dawgs, 4 v 4 across two foursomes');

  await page.goto(`${BASE}/pool/${id}/leaderboard`);
  await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();
  const board = await page.locator('body').innerText();
  const standings = board.slice(board.indexOf('STANDINGS'), board.indexOf('FRONT'));
  const boardDawgs = standings.match(/The Dawgs\s+(\d+)/)?.[1];
  const boardHogs = standings.match(/The Hogs\s+(\d+)/)?.[1];
  expect(boardDawgs && boardHogs).toBeTruthy();

  // Group 1 holds the Dawgs' two WORST players: a card adding only its own members would show a
  // bigger Dawgs number and a match-play "UP" badge instead of the board's rank.
  const g1 = await cardRow(page, id, 1, 'The Dawgs');
  expect(g1).toContain(boardDawgs!);
  expect(g1).toContain('2nd');
  await page.screenshot({ path: 'e2e/screenshots/f101a-card-group1.png', fullPage: true });

  const g2 = await cardRow(page, id, 2, 'The Hogs');
  expect(g2).toContain(boardHogs!);
  expect(g2).toContain('1st');
});
