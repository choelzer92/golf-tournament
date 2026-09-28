// F-062 option A — one spelling and one explainable chip for a course handicap on the pool
// surfaces. The review step used to print "CHcp 24" over each foursome (the teams step says
// "combined HCP") and every player's number was a dead label; the captain picker's chip too.
// Now they're the F-043 HandicapChip: same number, and a tap shows how it was reached.

import { expect, test } from '@playwright/test';

import { BASE } from './helpers';
test.use({ viewport: { width: 390, height: 844 } });

test('F-062: review and captain chips explain themselves; the team total reads "combined HCP"', async ({ context, page }) => {
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
  await page.getByPlaceholder('e.g. Saturday Pool').fill('Handicap Display Test');
  await page.getByRole('button', { name: 'Next: Scoring' }).click();
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
  await page.getByRole('button', { name: /Next: Teams/ }).click();
  await expect(page.getByRole('heading', { name: 'Set Teams' })).toBeVisible();
  await page.getByRole('button', { name: /Captains. deal/i }).click();

  // The captain picker's chip: the bare number, now tappable, opening the chain.
  const capLabel = page.locator('label', { has: page.locator('select') }).first();
  const capChip = capLabel.getByRole('button', { name: /^\d+$/ });
  await expect(capChip).toBeVisible();
  await capChip.click();
  await expect(capLabel.getByText('Plays off')).toBeVisible();
  await capLabel.screenshot({ path: 'e2e/screenshots/f062-captain-chip.png' });

  // On to the review, however many steps sit between.
  for (let i = 0; i < 4 && !(await page.getByText('Foursomes', { exact: true }).count()); i++) {
    await page.getByRole('button', { name: /^Next: / }).last().click();
  }
  const foursomes = page.locator('div.pt-2', { has: page.getByText('Foursomes', { exact: true }) });
  await expect(foursomes).toBeVisible();
  const text = await foursomes.innerText();
  expect(text).toMatch(/combined HCP \d+/);
  expect(text).not.toMatch(/CHcp/);

  const chip = foursomes.getByRole('button', { name: /^\d+$/ }).first();
  await expect(chip).toHaveAttribute('title', 'How this number is calculated');
  await expect(foursomes.getByText('Plays off')).toHaveCount(0);
  await chip.click();
  await expect(foursomes.getByText('Plays off')).toBeVisible();
  // The row wraps: the name keeps its line and the chain drops under it (no squeeze).
  await expect(foursomes.getByText('Craig', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/f062-review-chip.png', fullPage: true });
});
