// Phase D first-impression polish (roadmap-2026-10, §5.cd lifted §5.bv 3 for these items).

import { expect, test } from '@playwright/test';

import { BASE, fieldToGameStep, goToGame, PHONE, resetBackend, seed, toScoringStep } from './helpers';

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

test('D3: the front door says what the app is', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(`${BASE}/`);
  await expect(page.getByPlaceholder('Invite code')).toBeVisible(); // the gate, not a page behind it
  await expect(page.getByText('score it hole by hole, and settle the money')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/d3-front-door-phone.png', fullPage: true });
});

test('D5: the selected Net looks like every other selected toggle', async ({ context, page }) => {
  await resetBackend(context, page);
  await page.setViewportSize(PHONE);
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  await fieldToGameStep(page);
  await toScoringStep(page);
  const net = page.getByRole('radiogroup', { name: 'Net or gross' }).getByRole('radio', { name: 'Net' });
  await expect(net).toHaveAttribute('aria-checked', 'true');
  const full = page.getByRole('button', { name: 'Off the low', exact: true }); // the default stroke method
  const bg = (l: typeof net) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg(net)).toBe(await bg(full));
  await page.screenshot({ path: 'e2e/screenshots/d5-toggles-phone.png', fullPage: true });
});
