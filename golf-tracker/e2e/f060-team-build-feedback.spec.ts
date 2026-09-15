// F-060 — the team-build method cards didn't read as actions: on a phone the
// built teams rendered below the fold and the tap gave no feedback, so Craig
// (2026-09-15) read "Captains' deal" as broken. The fix: tapping a method marks
// the used card "✓ Built these teams", scrolls to the result, and the "drag
// nobody" copy now describes the Move-to menus that actually exist.

import { expect, test } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';
test.use({ viewport: { width: 390, height: 844 } });

test('F-060: Captains’ deal marks its card as the one that built the teams', async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course chips)' }).first();
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();

  await page.goto(`${BASE}/pool/new`);
  await expect(page.getByText("Who's playing?")).toBeVisible();
  const eight: [string, string][] = [
    ['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'],
    ['Sam', '6'], ['Pete', '14'], ['Tony', '10'], ['Gil', '18'],
  ];
  for (const [nm, hcp] of eight) {
    await page.getByPlaceholder('Name', { exact: true }).fill(nm);
    await page.getByPlaceholder('HCP').fill(hcp);
    await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
  }
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await page.getByPlaceholder('e.g. Saturday Pool').fill('Deal Feedback Test');
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
  await page.getByRole('button', { name: /Next: Teams/ }).click();
  await expect(page.getByRole('heading', { name: 'Set Teams' })).toBeVisible();

  // The honest copy (no dragging exists on this screen).
  await expect(page.getByText(/Or build nothing — put each player on a team by hand/)).toBeVisible();

  // No method has built anything yet.
  await expect(page.getByText('✓ Built these teams')).toHaveCount(0);

  const deal = page.getByRole('button', { name: /Captains. deal/i });
  await deal.click();

  // The used card says so, the others don't, and the teams exist.
  await expect(deal.getByText('✓ Built these teams')).toBeVisible();
  await expect(page.getByText('✓ Built these teams')).toHaveCount(1);
  await expect(page.getByText(/combined HCP/i).first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/f060-deal-feedback.png', fullPage: true });

  // Hand-moving a player afterwards demotes the claim honestly.
  await page.locator('select', { hasText: 'Team' }).first().selectOption({ index: 1 });
  await expect(page.getByText(/hand-adjusted since/)).toBeVisible();
});
