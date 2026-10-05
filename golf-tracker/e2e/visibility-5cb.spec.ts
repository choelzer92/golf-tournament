// §5.cb (+ §5.ci, §5.cj): every player finds their games without the organizer re-sharing.
// Signed in as Jym, a Weekend Warriors member who isn't in Tuesday Crew (the
// 'visibility-member' seed). The F-059 spec pins the other side: someone in none of it
// sees nothing.

import { expect, test } from '@playwright/test';

import { BASE, grantAndReset, PHONE } from './helpers';

const VISIBLE = ['Warriors — Week 1', 'Warriors — Saturday 2v2', 'Craig & Jym — Thursday', 'Old Trip — with Jym'];
const HIDDEN = ['Tuesday Crew — Skins Day', 'Tuesday Crew — Real Skins', 'Untagged Saturday', 'Old Trip — without Jym'];

test.beforeEach(async ({ context, page }) => {
  await grantAndReset(context, page);
  await page.setViewportSize(PHONE);
  // seed() expects a pool page; this one lands on /home (the f059 pattern).
  const card = page.locator('div.bg-white', { hasText: 'Visibility — Jym, a Warriors member' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/home`);
});

test('§5.cb: home lists his group games, a game he played, and the old event he was in', async ({ page }) => {
  await expect(page.getByText(/Welcome back, Jym/)).toBeVisible();
  await page.getByRole('button', { name: /Your golf/ }).click();
  for (const name of VISIBLE) await expect(page.getByText(name).first()).toBeVisible();
  for (const name of HIDDEN) await expect(page.getByText(name)).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/5cb-home-member.png', fullPage: true });
});

test('§5.cj: he sees his group (read-only), not one he isn\'t in', async ({ page }) => {
  await expect(page.getByText('Weekend Warriors').first()).toBeVisible();
  await expect(page.getByText('Tuesday Crew')).toHaveCount(0);

  await page.goto(`${BASE}/home/groups/g-weekend-warriors`);
  await expect(page.getByRole('heading', { name: 'Weekend Warriors' })).toBeVisible();
  await expect(page.getByText('You’re a member · view only')).toBeVisible();
  for (const name of ['Rename', 'Delete']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(page.getByText('Start something with this group')).toHaveCount(0);
  await expect(page.getByText('Add players')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Import from library' })).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/5cb-group-readonly.png', fullPage: true });

  await page.goto(`${BASE}/home/groups/g-tuesday-crew`);
  await expect(page.getByRole('heading', { name: 'Group not found' })).toBeVisible();
});

test('§5.cb: /pool and /dashboard follow the same rule', async ({ page }) => {
  await page.goto(`${BASE}/pool`);
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();
  await expect(page.getByText('Craig & Jym — Thursday')).toBeVisible();
  await expect(page.getByText('Warriors — Week 1')).toBeVisible();
  await expect(page.getByText('Tuesday Crew — Skins Day')).toHaveCount(0);

  await page.goto(`${BASE}/dashboard`);
  await expect(page.getByText('Craig & Jym — Thursday')).toBeVisible();
  await expect(page.getByText('Old Trip — with Jym')).toBeVisible();
  await expect(page.getByText('Old Trip — without Jym')).toHaveCount(0);
  await expect(page.getByText('Untagged Saturday')).toHaveCount(0);
});

test('§5.cj: stats show the Warriors ledger, nothing from Tuesday Crew', async ({ page }) => {
  await page.goto(`${BASE}/home/stats?group=g-weekend-warriors`);
  await expect(page.getByRole('heading', { name: 'Stats & money' })).toBeVisible();
  await expect(page.getByRole('combobox')).toContainText('Weekend Warriors');
  await expect(page.getByRole('combobox')).not.toContainText('Tuesday Crew');
  await page.screenshot({ path: 'e2e/screenshots/5cb-stats-member.png', fullPage: true });
});
