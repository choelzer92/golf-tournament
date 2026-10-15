// §5.cw d fix 3 (F-109): /dashboard is the LOOKUPS. Look up any golfer's index on GHIN (by
// name or number, read-only) and any course's tees and holes. Home's copies are gone.

import { expect, test } from '@playwright/test';
import { BASE, PHONE, grantAndReset, manualAddButton } from './helpers';

test.beforeEach(async ({ context, page }) => {
  await grantAndReset(context, page);
  await page.setViewportSize(PHONE);
  await page.evaluate(() => {
    sessionStorage.setItem('ghin_token', 'fake');
    sessionStorage.setItem('ghin_golfer', JSON.stringify({ ghin: 1234567, first_name: 'Craig', last_name: 'Hoelzer', handicap_index: '8.1' }));
  });
  await page.route('**/api/ghin/search-golfer', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ golfers: [
      { ghin: 3333333, first_name: 'Searchy', last_name: 'McSearch', handicap_index: '7.5', club_name: 'Sandbox CC' },
      { ghin: 3333334, first_name: 'Plussy', last_name: 'McSearch', handicap_index: '+1.2', club_name: 'Sandbox CC' },
    ] }),
  }));
  await page.route('**/api/ghin/golfer', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ golfer: { ghin: 4444444, first_name: 'Numbo', last_name: 'Lookup', handicap_index: '12.3', clubs: [{ club_name: 'Mock GC' }] } }),
  }));
  await page.route('**/api/ghin/courses/search', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ courses: [{ CourseID: 77, CourseName: 'Mock National', FacilityName: 'Mock', City: 'Denver', State: 'CO' }] }),
  }));
});

test('F-109: Home links to the lookups; any golfer by name or GHIN #, and nothing is written', async ({ page }) => {
  await page.goto(`${BASE}/home`);
  await page.getByRole('button', { name: 'Course & GHIN lookup' }).click();
  await page.waitForURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Course & GHIN lookup' })).toBeVisible();
  await expect(page.getByText('Handicap Index: 8.1')).toBeVisible();
  // Home's copies are gone: no game lists, no duplicate starters, no import.
  // §5.cx: Money Game and Quick game are wizard games now; only the team tournament stays.
  await expect(page.getByRole('button', { name: 'Team tournament' })).toBeVisible();
  for (const gone of ['Pool Game', 'Import Tournament', 'Solo Round', 'Money Game', 'Quick game']) {
    await expect(page.getByRole('button', { name: gone, exact: true })).toHaveCount(0);
  }

  const lookup = page.getByTestId('golfer-lookup');
  await lookup.getByLabel('Last name').fill('McSearch');
  await lookup.getByRole('button', { name: 'Search' }).click();
  const found = lookup.getByRole('list', { name: 'Golfers found' });
  await expect(found.getByText('Searchy McSearch')).toBeVisible();
  await expect(found.locator('li').filter({ hasText: 'Searchy' })).toContainText('7.5');
  await expect(found.locator('li').filter({ hasText: 'Plussy' })).toContainText('+1.2');

  await lookup.getByLabel('GHIN number').fill('4444444');
  await lookup.getByRole('button', { name: 'Look up' }).click();
  await expect(found.locator('li')).toHaveCount(1);
  await expect(found.locator('li')).toContainText('Numbo Lookup');
  await expect(found.locator('li')).toContainText('12.3');
  await page.screenshot({ path: 'e2e/screenshots/f109-lookups.png', fullPage: true });

  // Read-only: who you are, and your index, are untouched.
  const stored = JSON.parse((await page.evaluate(() => sessionStorage.getItem('ghin_golfer'))) ?? '{}');
  expect(stored.ghin).toBe(1234567);
  await expect(page.getByText('Handicap Index: 8.1')).toBeVisible();

  // The course lookup is still here.
  await page.getByPlaceholder('Course name (e.g. Glenmore)').fill('Mock');
  await page.getByRole('button', { name: 'Search', exact: true }).last().click();
  await expect(page.getByText('Mock National')).toBeVisible();
});

test('F-112: the team tournament no longer offers auto-press (nothing ever scored it)', async ({ page }) => {
  await page.goto(`${BASE}/tournament/new`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Next: Add Players' }).click();
  for (const [n, h] of [['Ann', '5'], ['Bob', '9']]) {
    await page.getByPlaceholder('Name', { exact: true }).fill(n);
    await page.getByPlaceholder('HCP').fill(h);
    await manualAddButton(page).click();
  }
  await page.getByRole('button', { name: 'Next: Schedule Rounds' }).click();
  await page.getByRole('button', { name: '+ Add Round' }).click();
  const format = page.locator('xpath=//label[normalize-space()="Format"]/following-sibling::select');
  for (const f of ['match-play', 'nassau', 'skins']) {
    await format.selectOption(f);
    await expect(page.getByText('Auto-press when 2 down')).toHaveCount(0);
    await expect(page.getByText('Carryovers', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Skin value', { exact: true })).toHaveCount(0);
  }
  // A setting that IS scored still shows: the Stableford scale.
  await format.selectOption('stableford');
  await expect(page.getByText('Point Scale', { exact: true })).toBeVisible();
});
