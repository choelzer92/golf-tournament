import { test, expect } from '@playwright/test';
import { resetBackend, seed, goToGame } from './helpers';

// Phase 3 step 4 (§5.bq Q-E): a team-engine pot can be sliced front / back / overall / junk, like
// the classic pool's. The money math is pinned in src/test/phase3-pot-slices.test.ts; this pins
// what a player SEES — the slice board, the money column, and the settings that describe it.

test.beforeEach(async ({ context, page }) => {
  await resetBackend(context, page);
});

test('Q-E: a sliced pairs pot shows each slice, who took it, and A +40 / B −10 / C −10 / D −20', async ({ page }) => {
  const id = await seed(page, 'Four pairs — POT sliced front / back / overall / junk (Phase 3 step 4)');
  await page.waitForURL(/\/leaderboard$/);
  const body = page.locator('body');
  // F-095 B: ONE leg board carries margin and dollars per row, with Junk as a fourth row.
  await expect(page.getByText('Front · Back · Overall · Junk')).toBeVisible();
  await expect(page.getByText('$20 pot')).toHaveCount(4);
  const text = await body.innerText();
  expect((text.match(/\$80 pot/g) ?? []).length).toBeGreaterThanOrEqual(2);   // standings footer + board caption
  // Front, overall and junk to Craig & Jym; the back is tied and split.
  expect((text.match(/\$20 → Craig & Jym/g) ?? []).length).toBe(3);
  expect(text).toMatch(/\$20 → Dave & Rick, Sam & Tony tied — split/);
  expect(text).toContain('Craig & Jym · 3 pts');
  expect(text).not.toContain('slices');
  // The money column carries the settlement, zero-sum.
  expect(text).toContain('+$40');
  expect(text).toContain('−$20');
  expect((text.match(/−\$10/g) ?? []).length).toBeGreaterThanOrEqual(2);
  // The junk board names the slice, not a separate ante.
  expect(text).toContain('Junk pot $20 (a slice of the buy-in)');
  await page.screenshot({ path: 'e2e/screenshots/phase3-pot-slices-leaderboard.png', fullPage: true });

  // The hub describes the shares and never asks for a separate junk pot under a buy-in pot.
  await goToGame(page, id);
  await expect(page.getByRole('heading', { name: "How it's played" })).toBeVisible();
  const hub = await body.innerText();
  expect(hub).toContain('Front 9 share of pot');
  expect(hub).toContain('Junk share of pot');
  expect(hub).toContain('Places paid (%)');
  expect(hub).not.toContain('Junk pot ($)');
  await page.screenshot({ path: 'e2e/screenshots/phase3-pot-slices-hub.png', fullPage: true });
});

test('an unsliced pot (one prize on the overall) shows no slice board — nothing saved changes', async ({ page }) => {
  await seed(page, 'Three sides playing a POT (uneven 3/2/1)');
  await page.waitForURL(/\/leaderboard$/);
  await expect(page.getByText('$60 pot')).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).not.toContain('slices');
  expect(text).not.toContain('not started — split');
});
