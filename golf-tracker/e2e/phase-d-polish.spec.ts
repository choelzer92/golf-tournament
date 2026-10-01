// Phase D first-impression polish (roadmap-2026-10, §5.cd lifted §5.bv 3 for these items).

import { expect, test } from '@playwright/test';

import { BASE } from './helpers';

test('D1: the app renders in Geist, not Arial', async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/`);
  await expect(page.getByLabel('GHIN Email')).toBeVisible(); // the login screen
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family).toMatch(/Geist/);
  expect(family).not.toMatch(/Arial/);
});
