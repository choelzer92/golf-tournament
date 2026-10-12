// The EVENT (a Series, DECISIONS.md §5.cu/§5.cv; bar #11). Myrtle 2026: four rounds over three
// days, 36 holes on Saturday, Sunday live through 9. TOTAL counts finished rounds; PROJECTED
// adds the live one; the settle-up is the whole event's.

import { expect, test, type Page } from '@playwright/test';
import { BASE, PHONE, grantAndReset, seedCard, closeSendSheet, freshGuest } from './helpers';

const EVENT = '/event/s-myrtle-2026';

async function seedEvent(page: Page) {
  await seedCard(page, 'Event — Myrtle 2026');
}

// Walk the wizard's Next buttons to Review, whatever steps this game's shape has.
async function walkToReview(page: Page) {
  const create = page.getByRole('button', { name: 'Create & send to players' });
  for (let i = 0; i < 10 && !(await create.isVisible()); i++) {
    await page.getByRole('button', { name: /^Next/ }).last().click();
  }
  await expect(create).toBeVisible();
}

const dollars = (s: string) => {
  const m = s.replace('−', '-').match(/(-?)\+?\$(\d+)/);
  return m ? (m[1] ? -1 : 1) * Number(m[2]) : 0;
};

test.beforeEach(async ({ context, page }) => {
  await grantAndReset(context, page);
  await page.setViewportSize(PHONE);
  await seedEvent(page);
});

test('§5.cv: the event standings — rounds by date, Total on finished rounds, Projected with the live one', async ({ page }) => {
  await page.goto(`${BASE}${EVENT}`);
  await expect(page.getByRole('heading', { name: 'Myrtle 2026' })).toBeVisible();
  await expect(page.getByText('4 rounds · 3 finished')).toBeVisible();

  const table = page.getByTestId('event-standings');
  await expect(table).toBeVisible();
  // Three dates; Saturday spans two rounds (the 36-hole day), in play order, not save order.
  for (const d of ['Fri, Oct 16', 'Sat, Oct 17', 'Sun, Oct 18']) await expect(table.getByText(d)).toBeVisible();
  await expect(table.locator('thead th[colspan="2"]')).toHaveText('Sat, Oct 17');
  for (const r of ['R1', 'R2', 'R3', 'R4']) await expect(table.getByRole('columnheader', { name: new RegExp(`^${r}`) })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: /R4.*live/ })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Projected' })).toBeVisible();

  // TOTAL is zero-sum and moved real money; Projected differs from it (Sunday's legs).
  const rows = table.locator('tbody tr');
  const n = await rows.count();
  expect(n).toBeGreaterThanOrEqual(8);
  let total = 0, projected = 0, differs = false;
  for (let i = 0; i < n; i++) {
    const cells = rows.nth(i).locator('td');
    // Player | Total | Projected | rounds…
    const t = dollars(await cells.nth(1).innerText());
    const p = dollars(await cells.nth(2).innerText());
    total += t; projected += p;
    if (t !== p) differs = true;
  }
  expect(Math.abs(total)).toBeLessThanOrEqual(n); // whole-dollar rounding only
  expect(Math.abs(projected)).toBeLessThanOrEqual(n);
  expect(differs).toBe(true);

  await expect(page.getByTestId('event-settle').locator('li').first()).toContainText('pays');
  await expect(page.getByText('Total counts finished rounds only.')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add round 5' })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/event-standings.png', fullPage: true });
});

test('§5.ck: Home — Continue on the live round with its event, and the group card shows the event', async ({ page }) => {
  await page.goto(`${BASE}/home`);
  await expect(page.getByText(/Welcome back, Craig/)).toBeVisible();
  const cont = page.getByRole('region', { name: 'Continue' });
  await expect(cont.getByText('Myrtle 2026 · Sunday 2v2')).toBeVisible();
  const warriors = page.getByTestId('group-card').filter({ hasText: 'Weekend Warriors' });
  await expect(warriors.getByText('Myrtle 2026')).toBeVisible();
  await expect(warriors.getByText('4 rounds · 3 finished')).toBeVisible();
  // The old "Multi-round event" builder is gone from Start something.
  await expect(page.getByRole('button', { name: /Multi-round event/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Start an event/ })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/event-home.png', fullPage: true });

  await cont.getByRole('button', { name: 'Event standings →' }).click();
  await page.waitForURL(new RegExp(`${EVENT}$`));
  await expect(page.getByRole('heading', { name: 'Myrtle 2026' })).toBeVisible();
});

test('§5.cv Q4: "+ Add round 5" from the live round copies it and lands as round 5 of the event', async ({ page }) => {
  await page.goto(`${BASE}/pool/ev-4`);
  const banner = page.getByTestId('event-banner');
  await expect(banner).toContainText('Myrtle 2026 · Round 4 of 4');
  await page.screenshot({ path: 'e2e/screenshots/event-round-hub.png', fullPage: true });
  await banner.getByRole('button', { name: '+ Add round 5' }).click();
  await page.waitForURL(/\/pool\/new$/);
  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();
  await walkToReview(page);

  const field = page.getByTestId('event-field');
  await expect(field.getByLabel('Add to Myrtle 2026 as round 5')).toBeChecked();
  // The day after the last round; a 36-hole day would change it by hand.
  await expect(field.locator('input[type="date"]')).toHaveValue('2026-10-19');
  await page.screenshot({ path: 'e2e/screenshots/event-review-add.png', fullPage: true });
  await page.getByRole('button', { name: 'Create & send to players' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 15_000 });
  await closeSendSheet(page);
  await expect(page.getByTestId('event-banner')).toContainText('Myrtle 2026 · Round 5 of 5');

  await page.getByTestId('event-banner').getByRole('button', { name: 'Event standings' }).click();
  await page.waitForURL(new RegExp(`${EVENT}$`));
  await expect(page.getByText('5 rounds · 3 finished')).toBeVisible();
  await expect(page.getByTestId('event-standings').getByText('Mon, Oct 19')).toBeVisible();

  // §5.cw a: round 5 was set up ahead and has no score, so it reads "Not started", not live,
  // and Home gives it no Continue card (only Sunday's live round has one).
  await expect(page.getByTestId('event-standings').getByRole('columnheader', { name: /R5.*not started/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Rounds' }).getByRole('button', { name: /^Round 5 ·.*Not started/ })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/event-round-not-started.png', fullPage: true });
  await page.goto(`${BASE}/home`);
  await expect(page.getByText(/Welcome back, Craig/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Continue' }).getByText('▶ Continue')).toHaveCount(1);
});

test('§5.cv Q2: a new game (even one copied from a round) starts as no event, and becomes round 1 of a new one at Review', async ({ page }) => {
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('region', { name: 'Start from' }).getByRole('button', { name: /Friday pool/ }).click();
  await walkToReview(page);
  const field = page.getByTestId('event-field');
  await expect(field.getByLabel('No, just this game')).toBeChecked();
  await field.getByLabel('Start a new event: this is round 1').check();
  await field.getByLabel('Event name').fill('Pinehurst 2027');
  await page.screenshot({ path: 'e2e/screenshots/event-review-new.png', fullPage: true });
  await page.getByRole('button', { name: 'Create & send to players' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 15_000 });
  await closeSendSheet(page);
  await expect(page.getByTestId('event-banner')).toContainText('Pinehurst 2027 · Round 1 of 1');
});

test('§5.cv: a guest on a round\'s link can open the event standings, but cannot add a round', async ({ browser, page }) => {
  const store = await page.evaluate(() => sessionStorage.getItem('__sandbox_supabase__') ?? '');
  const { ctx, guest } = await freshGuest(browser, store);
  await ctx.addCookies([{ name: 'golf_access', value: 'pool', url: BASE }]);
  await guest.goto(`${BASE}${EVENT}`);
  await expect(guest.getByRole('heading', { name: 'Myrtle 2026' })).toBeVisible();
  await expect(guest.getByTestId('event-standings')).toBeVisible();
  await expect(guest.getByRole('button', { name: /Add round/ })).toHaveCount(0);
  await expect(guest.getByRole('button', { name: 'Rename' })).toHaveCount(0);
  await ctx.close();
});

test('§5.cw b: the organizer renames the event; every round carries the new name', async ({ page }) => {
  await page.goto(`${BASE}${EVENT}`);
  await expect(page.getByRole('heading', { name: 'Myrtle 2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Event name').fill('Myrtle Beach Boys Trip');
  await page.screenshot({ path: 'e2e/screenshots/event-rename.png', fullPage: true });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Myrtle Beach Boys Trip' })).toBeVisible();

  // Saved on every round, not just the screen: a reload and the first round's hub agree.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Myrtle Beach Boys Trip' })).toBeVisible();
  await page.getByRole('region', { name: 'Rounds' }).getByRole('button', { name: /^Round 1 ·/ }).click();
  await page.waitForURL(/\/pool\/[^/]+$/);
  await expect(page.getByTestId('event-banner')).toContainText('Myrtle Beach Boys Trip · Round 1 of 4');
});

test('§5.cw c: the group page shows the event as one row, its rounds nested under it', async ({ page }) => {
  await page.goto(`${BASE}/home/groups/g-weekend-warriors`);
  await expect(page.getByRole('heading', { name: 'Weekend Warriors' })).toBeVisible();
  const ev = page.getByTestId('recent-event');
  await expect(ev).toHaveCount(1);
  await expect(ev.getByText('Myrtle 2026')).toBeVisible();
  await expect(ev.getByText('4 rounds · 3 finished')).toBeVisible();
  for (const r of ['Round 1 · Friday pool', 'Round 2 · Saturday AM skins', 'Round 3 · Saturday PM pool', 'Round 4 · Sunday 2v2']) {
    await expect(ev.getByRole('button', { name: new RegExp(r) })).toBeVisible();
  }
  await expect(ev.getByRole('button', { name: /Round 4 · Sunday 2v2.*Live/ })).toBeVisible();
  // No round is ALSO listed on its own outside the event row.
  const recent = page.locator('section', { has: page.getByRole('heading', { name: 'Recent games' }) });
  await expect(recent.getByText('Friday pool')).toHaveCount(1);
  await recent.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'e2e/screenshots/event-group-page.png', fullPage: true });

  await ev.getByRole('button', { name: /Round 2 · Saturday AM skins/ }).click();
  await page.waitForURL(/\/pool\/[^/]+$/);
  await expect(page.getByTestId('event-banner')).toContainText('Round 2 of 4');
  await page.goBack();
  await page.getByTestId('recent-event').getByRole('button', { name: /Myrtle 2026/ }).click();
  await page.waitForURL(new RegExp(`${EVENT}$`));
  await expect(page.getByRole('heading', { name: 'Myrtle 2026' })).toBeVisible();
});
