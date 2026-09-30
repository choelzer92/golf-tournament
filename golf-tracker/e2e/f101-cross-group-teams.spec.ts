// F-101 (§5.bw): teams across foursomes are first-class — Hogs v Dawgs is the reference.
// a: a two-team card takes its team rows from the ENGINE when a team spans groups, so every
//    group's card shows the same totals as the board.
// b: a player added on the hub mid-round is asked which team (no default), so nobody lands on a
//    tee group but no team, out of the money.
// c: during the round the Front / Back / Overall box reads live, like Standings (leader on to par
//    over the holes each team has played, with thru); the settled contested-hole line is what pays.

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

test('F-101 b: a player added on the hub is asked which team, and joins it', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, 'F-101 a: Hogs v Dawgs, 4 v 4 across two foursomes');
  await page.goto(`${BASE}/pool/${id}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByText('Add a player')).toBeVisible();

  // No team chosen yet: nobody can be added, and the panel says why.
  const team = page.getByLabel('Which team?');
  await expect(team).toHaveValue('');
  await expect(page.getByText(/Pick their team first/)).toBeVisible();
  const saved = page.getByRole('button', { name: /Jym Youngberg/ });
  await expect(saved).toBeDisabled();
  await page.screenshot({ path: 'e2e/screenshots/f101b-add-player-ask-team.png', fullPage: true });

  await team.selectOption({ label: 'The Dawgs' });
  await expect(page.getByText(/Pick their team first/)).toHaveCount(0);
  await saved.click();
  await expect(saved).toContainText('In game');
  await page.screenshot({ path: 'e2e/screenshots/f101b-add-player-added.png', fullPage: true });

  // Saved onto the team: after a reload the team editor has nobody unassigned. Without F-101 b
  // it read "Jym not on a team — their scores won't count toward any team".
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByText('+ Add a team')).toBeVisible();
  await expect(page.getByText(/not\s+on a team/)).toHaveCount(0);
});

test('F-101 c: during the round the Front / Back / Overall box reads live, like Standings', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, '§5.bv: 32 players, 8 foursomes, 16 pairs across groups (staggered)');
  await page.goto(`${BASE}/pool/${id}/leaderboard`);
  await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();
  const body = await page.locator('body').innerText();
  // Standings' leader, on to par over its own holes, with Thru.
  const standings = body.slice(body.indexOf('STANDINGS'), body.indexOf('FRONT'));
  const top = standings.match(/\n1\s+(.+?)\s+\d+\s+(-\d+|E|\+\d+)\s+(\d+)/);
  expect(top).toBeTruthy();
  const [, leader, toPar, thru] = top!;
  // The Overall line names the SAME leader. It used to name whoever led on the holes every team
  // had played (Ed & Ula by 5), under a table ranking Rick & Lou first.
  const overall = body.slice(body.indexOf('Overall 18'), body.indexOf('PLAYER DETAILS'));
  expect(overall).toContain(`${leader} ${toPar}`);
  expect(overall).toContain(`thru ${thru}`);
  await expect(page.getByText(/waiting on/)).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/f101c-live-legs.png', fullPage: true });

  // Every group level: the settled line ("… by N"), as before.
  const done = await seed(page, 'F-101 a: Hogs v Dawgs, 4 v 4 across two foursomes');
  await page.goto(`${BASE}/pool/${done}/leaderboard`);
  await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();
  await expect(page.getByText(/The (Hogs|Dawgs) by \d+/).first()).toBeVisible();
});
