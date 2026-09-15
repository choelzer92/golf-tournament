// F-034 — choosing a group could "recommend" a STALE game name left over from a
// previous wizard draft (Craig, 2026-09-10: picked Friday group, name box said
// Weekend Warriors). Fix (option A): the wizard tracks which name a GROUP
// auto-filled — that name is replaceable when another group loads; a hand-typed
// name is never touched. The provenance survives the sessionStorage draft, which
// is exactly the reported repro.

import { expect, test } from '@playwright/test';

import { BASE } from './helpers';

async function seedGroups(context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page) {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const card = page.locator('div.bg-white', { hasText: 'Groups — 61-member' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
}

test('F-034: a name auto-filled by one group is replaced by the next group — across a draft reload', async ({ context, page }) => {
  await seedGroups(context, page);

  // Round 1: start a game from Weekend Warriors, which auto-names the draft.
  await page.goto(`${BASE}/pool/new`);
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.getByRole('button', { name: /Weekend Warriors/ }).first().click();
  await expect(page.getByText(/Loaded “Weekend Warriors”/)).toBeVisible();

  // Abandon it: reopen the wizard in the same tab. The draft restores the name.
  await page.goto(`${BASE}/pool/new`);
  await expect(page.getByText("Who's playing?")).toBeVisible();

  // Round 2: pick a DIFFERENT group. The stale auto-fill must give way.
  await page.getByRole('button', { name: /Tuesday Crew/ }).first().click();
  await expect(page.getByText(/Loaded “Tuesday Crew”/)).toBeVisible();
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await expect(page.getByText('Which game are you playing?')).toBeVisible();
  await expect(page.getByPlaceholder('e.g. Saturday Pool')).toHaveValue('Tuesday Crew');
});

test('F-034: a hand-typed name survives switching groups', async ({ context, page }) => {
  await seedGroups(context, page);

  await page.goto(`${BASE}/pool/new`);
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.getByRole('button', { name: /Weekend Warriors/ }).first().click();
  await expect(page.getByText(/Loaded “Weekend Warriors”/)).toBeVisible();
  await page.getByRole('button', { name: /Craig Hoelzer/ }).click();
  await page.getByRole('button', { name: /Jym Youngberg/ }).click();
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await expect(page.getByText('Which game are you playing?')).toBeVisible();

  // The organizer names the game themself — that must never be clobbered.
  const nameBox = page.getByPlaceholder('e.g. Saturday Pool');
  await nameBox.fill("Craig's Grudge Match");

  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.getByRole('button', { name: /Tuesday Crew/ }).first().click();
  await expect(page.getByText(/Loaded “Tuesday Crew”/)).toBeVisible();
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await expect(page.getByPlaceholder('e.g. Saturday Pool')).toHaveValue("Craig's Grudge Match");
});
