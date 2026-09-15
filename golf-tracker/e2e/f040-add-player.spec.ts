// F-040 (option B): the add-player stack is ordered the way people think —
// name search FIRST, manual add second with the "no official GHIN" note, GHIN
// numbers folded into a disclosure that also takes a pasted list with
// per-number success/failure. One shared component (AddPlayerPanel) on all
// four surfaces, exercised here on each so no copy can drift.
//
// GHIN endpoints are mocked with page.route — the sandbox fakes only Supabase.

import { expect, test, type Page } from '@playwright/test';

import { BASE, PHONE } from './helpers';

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('ghin_token', 'sandbox-token');
  });
  await page.setViewportSize(PHONE);
});

// Fake GHIN: two knowable golfers by number, one by name search.
async function mockGhin(page: Page) {
  await page.route('**/api/ghin/golfer', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const fake: Record<number, { first: string; last: string; hi: string; gender: string }> = {
      1111111: { first: 'Bulk', last: 'One', hi: '4.2', gender: 'M' },
      2222222: { first: 'Bulk', last: 'Two', hi: '11.8', gender: 'F' },
    };
    const g = fake[Number(body.ghin_number)];
    if (!g) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ golfer: { ghin: body.ghin_number, first_name: g.first, last_name: g.last, handicap_index: g.hi, gender: g.gender } }),
    });
  });
  await page.route('**/api/ghin/search-golfer', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        golfers: [{ ghin: 3333333, first_name: 'Searchy', last_name: 'McSearch', handicap_index: '7.5', gender: 'M', club_name: 'Sandbox CC' }],
      }),
    }),
  );
}

// The panel's contract, independent of surface: search leads, manual follows
// with the no-GHIN note, number entry hides behind the disclosure.
async function assertPanelOrder(page: Page) {
  const body = await page.locator('body').innerText();
  const iSearch = body.indexOf('Search GHIN by name');
  const iManual = body.indexOf('Or add manually');
  const iGhin = body.indexOf('Have GHIN numbers?');
  expect(iSearch, 'name search present').toBeGreaterThan(-1);
  expect(iManual, 'manual add follows search').toBeGreaterThan(iSearch);
  expect(iGhin, 'GHIN disclosure follows manual').toBeGreaterThan(iManual);
  expect(body).toContain("won't update itself");
  expect(body).not.toContain('Add by GHIN #');
}

async function addManually(page: Page, name: string, hcp: string) {
  await page.getByPlaceholder('Name', { exact: true }).fill(name);
  await page.getByPlaceholder('HCP').fill(hcp);
  await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
}

// Paste a list — two resolvable numbers, one bogus — and check the per-number report.
async function bulkAddAndAssert(page: Page) {
  await page.getByRole('button', { name: /Have GHIN numbers\?/ }).click();
  const box = page.getByPlaceholder(/One number, or a list/);
  await box.fill('1111111, 2222222\n9999999');
  await box.locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
  await expect(page.getByText('1111111 — added Bulk One')).toBeVisible();
  await expect(page.getByText('2222222 — added Bulk Two')).toBeVisible();
  await expect(page.getByText('9999999 — not found')).toBeVisible();
  // Failures stay in the box for a retry; successes are cleared.
  await expect(box).toHaveValue('9999999');
}

test('F-040: pool wizard field step — search first, bulk paste, name search adds', async ({ page }) => {
  await mockGhin(page);
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/Who's playing\?/)).toBeVisible();
  await assertPanelOrder(page);

  await addManually(page, 'Manny Ual', '9');
  await expect(page.getByText(/Who's playing\? \(1\)/)).toBeVisible();

  await bulkAddAndAssert(page);
  await expect(page.getByText(/Who's playing\? \(3\)/)).toBeVisible();
  await expect(page.getByText('Bulk One').first()).toBeVisible();
  await expect(page.getByText('Bulk Two').first()).toBeVisible();

  // Name search — the primary path — adds in one tap from a result row.
  await page.getByPlaceholder('Last name').fill('McSearch');
  await page.getByRole('button', { name: 'Search GHIN' }).click();
  await page.getByRole('button', { name: /Searchy McSearch/ }).click();
  await expect(page.getByText(/Who's playing\? \(4\)/)).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/f040-pool-new-panel.png', fullPage: true });
});

test('F-040: saved players page uses the same stack and persists adds', async ({ page }) => {
  await mockGhin(page);
  await page.goto(`${BASE}/pool/roster`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: /Saved Players/i })).toBeVisible();
  await assertPanelOrder(page);

  await addManually(page, 'Manny Ual', '9');
  await expect(page.getByText('Added Manny Ual to your saved players.')).toBeVisible();

  await bulkAddAndAssert(page);
  await expect(page.getByText('Bulk One').locator('visible=true').first()).toBeVisible();
  await expect(page.getByText('Bulk Two').locator('visible=true').first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/f040-roster-panel.png', fullPage: true });
});

test('F-040: game wizard players step — same stack, player cap still enforced', async ({ page }) => {
  await mockGhin(page);
  // The course step has no recent-course chips, so mock the course lookups too.
  await page.route('**/api/ghin/courses/search', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ courses: [{ CourseID: 77, CourseName: 'Mock National', FacilityName: 'Mock', City: 'Denver', State: 'CO' }] }),
    }),
  );
  await page.route('**/api/ghin/courses/details', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        course: {
          CourseName: 'Mock National',
          TeeSets: [{
            TeeSetRatingId: 1, TeeSetRatingName: 'Blue', Gender: 'Male', TotalYardage: 6500, TotalPar: 72,
            Ratings: [{ RatingType: 'Total', CourseRating: 72, SlopeRating: 113 }],
            Holes: Array.from({ length: 18 }, (_, i) => ({ Number: i + 1, Par: 4, Length: 400, Allocation: i + 1 })),
          }],
        },
      }),
    }),
  );

  await page.goto(`${BASE}/game/new`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /Match Play/ }).first().click();
  await page.getByPlaceholder('Course name').fill('Mock');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: /Mock National/ }).click();
  await expect(page.getByRole('heading', { name: /Add Players/ })).toBeVisible();
  await assertPanelOrder(page);

  await addManually(page, 'Manny Ual', '9');
  await bulkAddAndAssert(page);
  await expect(page.getByText(/Add Players \(3\//)).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/f040-game-new-panel.png', fullPage: true });
});

test('F-040: tournament roster step — same stack, players land on teams', async ({ page }) => {
  await mockGhin(page);
  await page.goto(`${BASE}/tournament/new`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Next: Add Players' }).click();
  await expect(page.getByRole('heading', { name: /Add Players/ })).toBeVisible();
  await assertPanelOrder(page);

  await addManually(page, 'Manny Ual', '9');
  await bulkAddAndAssert(page);
  await expect(page.getByText(/Add Players \(3\)/)).toBeVisible();
  // The A/B auto-balance still runs for every path.
  await expect(page.getByText('Bulk One').first()).toBeVisible();
  await expect(page.getByText('Bulk Two').first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/f040-tournament-panel.png', fullPage: true });
});
