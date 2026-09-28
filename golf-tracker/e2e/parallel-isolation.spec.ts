// Proof that parallel workers cannot collide (verify speed, option A).
//
// The sandbox store lives in the BROWSER TAB (module state + sessionStorage, see
// src/test/fake-supabase.ts), not on the dev server — so every Playwright context has
// its own backend and one server can take N workers. These two tests seed DIFFERENT
// games at the same time (parallel mode puts them on separate workers), hold the store
// open long enough to overlap, and each asserts it sees ONLY its own game.
//
// The control test proves the detector is not vacuous: two games seeded into ONE tab
// both show up, so a store shared across tests would fail the pair.

import { test, expect, type Page } from '@playwright/test';
import { BASE, resetBackend, seedCard } from './helpers';

test.describe.configure({ mode: 'parallel' });

async function gameNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem('__sandbox_supabase__');
    if (!raw) return [];
    const { tables } = JSON.parse(raw) as { tables: [string, [string, { data?: { name?: string } }][]][] };
    const pool = tables.find(([t]) => t === 'pool_games');
    return pool ? pool[1].map(([, row]) => String(row.data?.name)).sort() : [];
  });
}

async function seedHoldAndCheck(page: Page, label: string, own: string) {
  await expect(page.getByRole('heading', { name: /sandbox/i }).first()).toBeVisible();
  await seedCard(page, label);
  // Hold across the other test's seed, re-reading after a reload each time.
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(750);
    await page.goto(`${BASE}/sandbox`);
    expect(await gameNames(page)).toEqual([own]);
  }
}

test('parallel isolation: worker A sees only its own seeded game', async ({ context, page }) => {
  await resetBackend(context, page);
  await seedHoldAndCheck(page, 'Classic pool — 2 foursomes, mid-round (thru 6)', 'Saturday Pool');
});

test('parallel isolation: worker B sees only its own seeded game', async ({ context, page }) => {
  await resetBackend(context, page);
  await seedHoldAndCheck(page, 'Skins — 2 players, complete', 'Two-Man Skins');
});

test('parallel isolation control: one shared store DOES show both games', async ({ context, page }) => {
  await resetBackend(context, page);
  await seedCard(page, 'Classic pool — 2 foursomes, mid-round (thru 6)');
  await seedCard(page, 'Skins — 2 players, complete');
  await page.goto(`${BASE}/sandbox`);
  expect(await gameNames(page)).toEqual(['Saturday Pool', 'Two-Man Skins']);
});
