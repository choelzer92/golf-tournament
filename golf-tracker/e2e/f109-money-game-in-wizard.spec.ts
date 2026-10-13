// F-109 builder check (§5.cw d): the old /money-game setup, built through the wizard. Team A v
// Team B of 4, two best net, hole by hole, 90%, a $10 Nassau per player, and birdie 1 pt / eagle
// 2 pts at $5 a point. (The old builder only NAMED those dollars; it never paid them, F-112.)

import { test, expect, type Page } from '@playwright/test';
import {
  BASE, PHONE, EIGHT_PLAYERS, resetBackend, addPlayers, toScoringStep, chooseMoney, buildTeams,
  signInOrganizer, closeSendSheet,
} from './helpers';

test.beforeEach(async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await resetBackend(context, page);
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
});

const labelled = (page: Page, label: string) =>
  page.locator(`xpath=//label[normalize-space()="${label}"]/following-sibling::input`);

test('F-109: the old Money Game is a wizard game — 2 best net, match play, Nassau legs, birdie/eagle junk', async ({ page }) => {
  await addPlayers(page, EIGHT_PLAYERS);
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await page.getByPlaceholder('e.g. Saturday Pool').fill('Money Game');
  await toScoringStep(page, 'teams:4+4');
  await page.getByLabel('Which scores count for the team?').selectOption('two-best-net');
  await page.getByRole('button', { name: 'Hole by hole (match play)' }).click();
  await page.locator('xpath=//label[normalize-space()="How much handicap counts?"]/following-sibling::input').fill('90');
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
  await page.getByRole('button', { name: /Next: Teams/ }).click();
  await buildTeams(page, 'list');
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await expect(page.getByRole('heading', { name: "What's it worth?" })).toBeVisible();

  await chooseMoney(page, 'legs');
  for (const l of ['Front 9', 'Back 9', 'Overall']) await expect(labelled(page, l)).toHaveValue('10');
  await labelled(page, 'Junk / pt').fill('5');
  await page.getByRole('button', { name: /\+ Add bonuses/ }).click();
  await labelled(page, 'Birdie').fill('1');
  await labelled(page, 'Eagle').fill('2');
  expect(await page.locator('body').innerText()).not.toContain('Not built yet');
  await page.screenshot({ path: 'e2e/screenshots/f109-money-game-in-wizard.png', fullPage: true });

  await signInOrganizer(page);
  await page.getByRole('button', { name: 'Create & send to players' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/]+$/, { timeout: 15_000 });
  await closeSendSheet(page);
  await expect(page.getByRole('heading', { name: 'Head-to-Head Match' })).toBeVisible();
  const hub = await page.locator('body').innerText();
  expect(hub).toContain('90% handicap');
  expect(hub).toContain('$10');
  expect(hub).toContain('$5');
  // What was SAVED is the Money Game's shape (the classic hub doesn't print the team format).
  const saved = await page.evaluate(() => {
    const store = JSON.parse(sessionStorage.getItem('__sandbox_supabase__') ?? '{"tables":[]}') as { tables: [string, [string, { data: Record<string, unknown> }][]][] };
    const rows = store.tables.find(([t]) => t === 'pool_games')?.[1] ?? [];
    return rows.map(([, r]) => r.data).find((d) => d?.name === 'Money Game') ?? null;
  });
  expect(saved).toMatchObject({
    ballSelection: '2-best-net',
    moneyMode: 'match',
    handicapAllowance: 90,
    junkValues: { birdie: 1, eagle: 2 },
    // F-113: "Hole by hole (match play)" must reach the saved game, or the legs settle on totals.
    matchConfig: { legDollars: { front: 10, back: 10, overall: 10 }, junkPerPoint: 5, scoring: 'holes' },
  });
});
