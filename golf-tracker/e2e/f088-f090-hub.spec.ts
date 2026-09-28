import { test, expect } from '@playwright/test';
import { resetBackend, seed, goToGame, PHONE } from './helpers';

// Grant invite-gate access + empty the fake backend before every test.
test.beforeEach(async ({ context, page }) => {
  await resetBackend(context, page);
});

// F-088 A / F-089 A / F-090 A — three hub findings from the Phase 2 screenshot read, each
// confirmed by Craig 2026-09-16 (§5.bo: asked outright, then built).

test.describe('hub findings F-088 / F-089 / F-090', () => {
  test('F-088: the money panel is headed "How it\'s played", so "Teams" is not a heading twice', async ({ page }) => {
    await seed(page, '2v2 best ball — mid-round');
    await expect(page.getByRole('heading', { name: /2v2/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: "How it's played" })).toBeVisible();
    // The F-081 pairings section is the ONE "Teams" heading left on a team game.
    await expect(page.getByRole('heading', { name: 'Teams', exact: true })).toHaveCount(1);
  });

  test('F-088: a solo mode gets the same fixed heading, not the mode name', async ({ page }) => {
    const id = await seed(page, 'Skins — 2 players, complete');
    await goToGame(page, id);
    await expect(page.getByRole('heading', { name: "How it's played" })).toBeVisible();
  });

  test('F-090: a team game never shows the Closest-to-the-Pin editor (its engine never pays CTP)', async ({ page }) => {
    // The sandbox baseGame carries classic junkValues with ctp: 1 — exactly the legacy shape
    // that used to render four "Hole N — None / Craig / …" rows the team engine ignored.
    await seed(page, '2v2 best ball — mid-round');
    await expect(page.getByRole('heading', { name: "How it's played" })).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Closest to the Pin');
  });

  test('F-090: the classic pool still shows the CTP editor to the organizer', async ({ page }) => {
    const id = await seed(page, 'Classic pool — 2 foursomes, mid-round');
    await goToGame(page, id);
    await expect(page.getByRole('heading', { name: 'Closest to the Pin' })).toBeVisible();
  });

  test('F-089: on desktop the actions share the title row', async ({ page }) => {
    await seed(page, '2v2 best ball — mid-round');
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toBeVisible();
    const t = (await title.boundingBox())!;
    const share = (await page.getByRole('button', { name: 'Share', exact: true }).boundingBox())!;
    expect(share.y).toBeLessThan(t.y + t.height);
  });
});

test.describe('F-089 on a phone', () => {
  test.use({ viewport: PHONE });

  test('the actions drop below the title instead of squeezing it to one word per line', async ({ page }) => {
    await seed(page, '2v2 best ball — mid-round');
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toBeVisible();
    const t = (await title.boundingBox())!;
    const share = (await page.getByRole('button', { name: 'Share', exact: true }).boundingBox())!;
    // Actions start below the title block.
    expect(share.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
    // The title has the full width: at text-xl it fits on one line, not three.
    expect(t.height).toBeLessThan(40);
    await page.screenshot({ path: 'e2e/screenshots/f089-hub-header-phone.png', fullPage: true });
  });
});
