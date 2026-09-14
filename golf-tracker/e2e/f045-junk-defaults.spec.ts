// F-045 (§5.bg): a fresh classic pool plays NO bonuses. Junk starts at $0/off
// behind an "Add bonuses" affordance, its pot quarter folds into OVERALL
// (front/back keep their table weights), and every junk/CTP surface follows the
// game's junk config instead of assuming the Warriors' game. Saved formats keep
// whatever they saved — the historical table survives as "JY Classic Pool".

import { expect, test, type Page } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';
const PHONE = { width: 390, height: 844 };

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
});

async function seedCard(page: Page, label: string) {
  await page.goto(`${BASE}/sandbox`);
  const card = page.locator('div.bg-white', { hasText: label }).first();
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
}

// A pot-split / bonus-grid input sits right after its label.
function fieldInput(page: Page, label: string) {
  return page.locator(`xpath=//label[normalize-space()="${label}"]/following-sibling::input`);
}

// Walk a CLASSIC pool (no mode selected) with two foursomes to the money step.
async function walkToClassicMoneyStep(page: Page) {
  await page.setViewportSize(PHONE);
  await seedCard(page, 'Past games (for recent-course chips)');
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/Who's playing\?/)).toBeVisible();

  const eight = [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'],
                 ['Al', '2'], ['Bob', '10'], ['Cal', '14'], ['Dan', '20']] as const;
  for (const [nm, hcp] of eight) {
    await page.getByPlaceholder('Name', { exact: true }).fill(nm);
    await page.getByPlaceholder('HCP').fill(hcp);
    await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
  }
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await page.getByPlaceholder('e.g. Saturday Pool').fill('No Bonus Pool');
  // Classic pool is the default — no mode selection.
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
  await page.getByRole('button', { name: /Next: Teams/ }).click();
  await buildTeamsAndContinue(page);
}

// The Teams step starts with no teams — build them (any method) before Next.
async function buildTeamsAndContinue(page: Page) {
  await expect(page.getByRole('heading', { name: 'Set Teams' })).toBeVisible();
  await page.getByRole('button', { name: 'No captains' }).click();
  await page.getByRole('button', { name: /Straight down the list/ }).click();
  await page.getByRole('button', { name: /Next: Review/ }).click();
  // MUST be the classic money step, not wherever the last click landed.
  await expect(page.getByRole('heading', { name: /What's it worth\?/ })).toBeVisible();
}

test.describe('F-045: bonuses are OFF on a fresh classic pool', () => {
  test('F-045: the money step offers Add bonuses; junk is folded into Overall until then', async ({ page }) => {
    await walkToClassicMoneyStep(page);

    // Bonuses hidden behind the affordance — no grid, no junk pot leg.
    await expect(page.getByRole('button', { name: /\+ Add bonuses/ })).toBeVisible();
    let body = await page.locator('body').innerText();
    expect(body).not.toContain('Bonus points for good holes');

    // 2 foursomes: the standard table is 70/70/40/20 — junk's $20 folds into
    // Overall, front/back keep their weights, and the total still matches the pot.
    await expect(fieldInput(page, 'Front 9')).toHaveValue('70');
    await expect(fieldInput(page, 'Back 9')).toHaveValue('70');
    await expect(fieldInput(page, 'Overall')).toHaveValue('60');
    await expect(fieldInput(page, 'Junk')).toHaveCount(0);
    expect(body).toContain('Split total: $200 vs pot $200');
    await page.screenshot({ path: 'e2e/screenshots/f045-money-step-no-bonuses.png', fullPage: true });

    // Adding bonuses reveals the grid with the classic values and unfolds the split.
    await page.getByRole('button', { name: /\+ Add bonuses/ }).click();
    await expect(page.getByText('Bonus points for good holes')).toBeVisible();
    await expect(fieldInput(page, 'Birdie')).toHaveValue('1');
    await expect(fieldInput(page, 'Eagle')).toHaveValue('2');
    await expect(fieldInput(page, 'Overall')).toHaveValue('40');
    await expect(fieldInput(page, 'Junk')).toHaveValue('20');
    await page.screenshot({ path: 'e2e/screenshots/f045-money-step-bonuses-added.png', fullPage: true });

    // And removing them folds the split straight back.
    await page.getByRole('button', { name: 'Remove bonuses' }).click();
    body = await page.locator('body').innerText();
    expect(body).not.toContain('Bonus points for good holes');
    await expect(fieldInput(page, 'Overall')).toHaveValue('60');
    await expect(fieldInput(page, 'Junk')).toHaveCount(0);
  });

  test('F-045: a created junk-off game folds the pot on its own page', async ({ page }) => {
    await walkToClassicMoneyStep(page);
    await page.getByRole('button', { name: 'Create Game' }).click();
    // Creating opens the new game's page (client-side navigation — assert the
    // URL rather than waiting for a load event). MUST be this game.
    await expect(page).toHaveURL(/\/pool\/(?!new$)[a-z0-9-]+$/i, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'No Bonus Pool' })).toBeVisible();

    // The game page's Pot panel follows the fold: 70/70/60 and no $0 junk leg.
    const potPanel = page.locator('div.bg-white', { has: page.getByRole('heading', { name: 'Pot', exact: true }) }).first();
    await expect(potPanel.getByText('Front 9')).toBeVisible();
    await expect(potPanel.getByText('$60')).toBeVisible();
    await expect(potPanel.getByText('Junk')).toHaveCount(0);
    // And with no bonuses there's no Closest-to-the-Pin editor to fill in.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Closest to the Pin');
    await page.screenshot({ path: 'e2e/screenshots/f045-pool-page-junk-off.png', fullPage: true });
  });

  test('F-045: junk-off leaderboard shows no junk pot row, no Junk Breakdown; scorecard shows no CTP on a par 3', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seedCard(page, 'Classic pool — NO bonuses (junk off)');
    const card = page.locator('div.bg-white', { hasText: 'Classic pool — NO bonuses' }).first();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForURL(/\/pool\/[a-z0-9-]+\/leaderboard/i, { timeout: 15_000 });
    await expect(page.getByText('No Bonus Pool (seeded)')).toBeVisible();

    const pots = page.locator('div.bg-gray-800', { hasText: 'Pots' }).first();
    await expect(pots.getByText('Overall')).toBeVisible();
    await expect(pots.getByText('Junk', { exact: true })).toHaveCount(0);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Junk Breakdown');
    await page.screenshot({ path: 'e2e/screenshots/f045-leaderboard-junk-off.png', fullPage: true });

    // The scorecard on a PAR 3 must not offer CTP for this game.
    await page.goto(page.url().replace('/leaderboard', ''));
    await page.getByRole('button', { name: 'Enter Scores' }).first().click();
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
    await walkToPar3(page);
    await expect(page.getByText(/Closest to the pin/)).toHaveCount(0);
    await page.screenshot({ path: 'e2e/screenshots/f045-scorecard-no-ctp.png', fullPage: true });
  });

  test('F-045 control: a junk-ON game still offers CTP on a par 3 (the assertion is not vacuous)', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seedCard(page, 'Classic pool — 2 foursomes, mid-round (thru 6)');
    const card = page.locator('div.bg-white', { hasText: 'Classic pool — 2 foursomes, mid-round' }).first();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForURL(/\/pool\/[a-z0-9-]+\/leaderboard/i, { timeout: 15_000 });
    // Junk surfaces stay for a game that plays bonuses.
    await expect(page.getByText('Junk Breakdown')).toBeVisible();

    await page.goto(page.url().replace('/leaderboard', ''));
    await page.getByRole('button', { name: 'Enter Scores' }).first().click();
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
    await walkToPar3(page);
    await expect(page.getByText(/Closest to the pin/)).toBeVisible();
  });
});

// Advance the scorecard to the next par 3 (the sandbox course has one within
// any 4-hole stretch: holes 3, 7, 12, 16).
async function walkToPar3(page: Page) {
  for (let i = 0; i < 6; i++) {
    const header = await page.getByText(/Par \d/).first().innerText();
    if (/Par 3\b/.test(header)) return;
    await page.getByRole('button', { name: '›' }).click();
  }
  throw new Error('no par 3 reached within 6 holes');
}

test.describe('F-045: a saved format keeps its junk', () => {
  test("F-045: JY Classic Pool restores with the bonus grid open and a junk leg in the split", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seedCard(page, 'Groups — 61-member standing group');
    await seedCard(page, 'Past games (for recent-course chips)');
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12']] as const) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await page.locator('select').first().selectOption('format:f-classic-pool');
    await expect(page.getByLabel('Game style name')).toHaveValue('JY Classic Pool');
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Set Tees/ }).click();
    await page.getByRole('button', { name: /Next: Teams/ }).click();
    await buildTeamsAndContinue(page);

    // The Warriors' game keeps its bonuses: grid open with the saved values,
    // junk leg present in the split — no extra tap to get the usual game.
    await expect(page.getByText('Bonus points for good holes')).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ Add bonuses/ })).toHaveCount(0);
    await expect(fieldInput(page, 'Birdie')).toHaveValue('1');
    await expect(fieldInput(page, 'Albatross')).toHaveValue('3');
    await expect(fieldInput(page, 'Junk')).toHaveCount(1);
    await page.screenshot({ path: 'e2e/screenshots/f045-format-keeps-junk.png', fullPage: true });
  });
});
