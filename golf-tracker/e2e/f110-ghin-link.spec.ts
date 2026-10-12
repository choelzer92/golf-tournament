// F-110: the dashboard's GHIN "Link" fills in YOUR missing index and never replaces who you
// are. It used to overwrite the stored golfer without its GHIN number, so for the rest of the
// session Create asked you to log in, and "Start from" / "Add to event" went empty.

import { expect, test, type Page } from '@playwright/test';
import { BASE, grantAndReset, seedCard, closeSendSheet } from './helpers';

async function loginWithNoIndex(page: Page) {
  // A login whose handicap lookup failed: the identity arrives, the index doesn't.
  await page.evaluate(() => {
    sessionStorage.setItem('ghin_token', 'fake');
    sessionStorage.setItem('ghin_golfer', JSON.stringify({ ghin: 1234567, golfer_id: 1234567, first_name: 'Craig', last_name: 'Hoelzer' }));
  });
  await page.route('**/api/ghin/golfer', async (route) => {
    const n = Number(JSON.parse(route.request().postData() ?? '{}').ghin_number);
    const golfer = n === 1234567
      ? { first_name: 'Craig', last_name: 'Hoelzer', handicap_index: '8.1', ghin: n }
      : { first_name: 'Someone', last_name: 'Else', handicap_index: '20.0', ghin: n };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ golfer }) });
  });
}

test.beforeEach(async ({ context, page }) => {
  await grantAndReset(context, page);
  await seedCard(page, 'Event — Myrtle 2026');
  await loginWithNoIndex(page);
});

test('F-110: Link shows your index and keeps your identity, so Create still works', async ({ page }) => {
  await page.goto(`${BASE}/dashboard`);
  await expect(page.getByRole('heading', { name: 'Golf Tracker' })).toBeVisible();
  await page.getByPlaceholder('Enter GHIN #').fill('1234567');
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.getByText('Handicap Index: 8.1')).toBeVisible();
  const stored = JSON.parse((await page.evaluate(() => sessionStorage.getItem('ghin_golfer'))) ?? '{}');
  expect(stored.ghin).toBe(1234567);
  expect(stored.first_name).toBe('Craig');

  // Create goes through: no "Log in to create the game".
  await page.goto(`${BASE}/pool/ev-4`);
  await page.getByTestId('event-banner').getByRole('button', { name: '+ Add round 5' }).click();
  await page.waitForURL(/\/pool\/new$/);
  const create = page.getByRole('button', { name: 'Create & send to players' });
  for (let i = 0; i < 10 && !(await create.isVisible()); i++) await page.getByRole('button', { name: /^Next/ }).last().click();
  await create.click();
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 15_000 });
  await closeSendSheet(page);
  await expect(page.getByTestId('event-banner')).toContainText('Round 5 of 5');
});

test('F-110: someone else\'s number is refused, and you stay you', async ({ page }) => {
  await page.goto(`${BASE}/dashboard`);
  await page.getByPlaceholder('Enter GHIN #').fill('7654321');
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.getByText('That isn’t your GHIN number.', { exact: false })).toBeVisible();
  await expect(page.getByText('Handicap Index: 20.0')).toHaveCount(0);
  const stored = JSON.parse((await page.evaluate(() => sessionStorage.getItem('ghin_golfer'))) ?? '{}');
  expect(stored.ghin).toBe(1234567);
  expect(stored.first_name).toBe('Craig');
});
