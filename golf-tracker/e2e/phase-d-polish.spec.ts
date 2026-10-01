// Phase D first-impression polish (roadmap-2026-10, §5.cd lifted §5.bv 3 for these items).

import { expect, test } from '@playwright/test';

import { BASE, goToGame, PHONE, seed } from './helpers';

test('D1: the app renders in Geist, not Arial', async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/`);
  await expect(page.getByLabel('GHIN Email')).toBeVisible(); // the login screen
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family).toMatch(/Geist/);
  expect(family).not.toMatch(/Arial/);
});

test('D4: a phone in system dark mode still gets the light login page', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: PHONE });
  await ctx.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await expect(page.getByLabel('GHIN Email')).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(255, 255, 255)');
  await ctx.close();
});

test('D4: the dark board fills the screen, with no white band below it', async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.setViewportSize(PHONE);
  const id = await seed(page, '2v2 best ball — mid-round');
  await goToGame(page, id, '/leaderboard');
  await expect(page.getByText('Craig & Jym').first()).toBeVisible();
  // Below the content, the board's own dark background, not the white body.
  const bottom = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 2) as HTMLElement;
    let n: HTMLElement | null = el;
    while (n && getComputedStyle(n).backgroundColor === 'rgba(0, 0, 0, 0)') n = n.parentElement;
    return n ? getComputedStyle(n).backgroundColor : 'none';
  });
  expect(bottom).not.toBe('rgb(255, 255, 255)');
  await page.screenshot({ path: 'e2e/screenshots/d4-dark-board-phone.png', fullPage: true });
});
