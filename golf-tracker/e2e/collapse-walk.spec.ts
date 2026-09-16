// UI_CRITIQUE_PROCESS capture set for the collapsed wizard (§5.bk): EVERY step of every main
// flow, so the critique reads the screens a golfer sees, not just the new ones. Screenshots land
// in e2e/screenshots/walk-<flow>-<nn>-<step>.png (gitignored, regenerable). Assertions are
// minimal (right screen reached) — this file's job is to capture, not to test.

import { test, expect, type Page } from '@playwright/test';
import {
  BASE, PHONE, EIGHT_PLAYERS, FOUR_PLAYERS, TWO_PLAYERS, resetBackend,
  addPlayers, toScoringStep, chooseSolo, chooseMoney, buildTeams,
} from './helpers';

let shot = 0;
async function cap(page: Page, flow: string, step: string) {
  shot += 1;
  await page.screenshot({ path: `e2e/screenshots/walk-${flow}-${String(shot).padStart(2, '0')}-${step}.png`, fullPage: true });
}

test.beforeEach(async ({ context, page }) => {
  shot = 0;
  await page.setViewportSize(PHONE);
  await resetBackend(context, page);
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
});

async function field(page: Page, flow: string, players: [string, string][], name: string) {
  await addPlayers(page, players);
  await cap(page, flow, 'field');
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await expect(page.getByText('How do you want to compete?')).toBeVisible();
  await page.getByPlaceholder('e.g. Saturday Pool').fill(name);
}

async function courseTees(page: Page, flow: string) {
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await cap(page, flow, 'course');
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
  await cap(page, flow, 'tees');
}

async function createAndHub(page: Page, flow: string) {
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/]+$/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await cap(page, flow, 'hub');
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  await cap(page, flow, 'leaderboard');
}

test('walk A: 8 players → two teams of 4 → pot (the Warriors)', async ({ page }) => {
  const f = 'A-pool';
  await field(page, f, EIGHT_PLAYERS, 'Saturday Pool');
  await cap(page, f, 'structure');
  await page.getByRole('button', { name: /Other split/ }).click();
  await cap(page, f, 'structure-other');
  await toScoringStep(page, 'teams:4+4');
  await cap(page, f, 'scoring');
  await courseTees(page, f);
  await page.getByRole('button', { name: /Next: Teams/ }).click();
  await cap(page, f, 'teams-before');
  await page.getByRole('button', { name: /Captains’ deal/ }).click();
  await cap(page, f, 'teams-built');
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await cap(page, f, 'money');
  await page.getByRole('button', { name: /\+ Add bonuses/ }).click();
  await cap(page, f, 'money-bonuses');
  await chooseMoney(page, 'legs');
  await cap(page, f, 'money-legs');
  await chooseMoney(page, 'pot');
  await createAndHub(page, f);
});

test('walk B: 8 players → four pairs → legs', async ({ page }) => {
  const f = 'B-pairs';
  await field(page, f, EIGHT_PLAYERS, 'Four Pairs');
  await toScoringStep(page, 'teams:2+2+2+2');
  await cap(page, f, 'scoring');
  await page.getByLabel('Which scores count for the team?').focus();
  await courseTees(page, f);
  // F-071: one teams step for every split — pairs build with the same method list as the pool.
  await page.getByRole('button', { name: 'Next: Teams' }).click();
  await cap(page, f, 'teams-before');
  await buildTeams(page, 'even');
  await cap(page, f, 'teams-built');
  await page.getByRole('button', { name: 'Next: Groups' }).click();
  await cap(page, f, 'groups');
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await cap(page, f, 'money');
  await chooseMoney(page, 'per-point');
  await cap(page, f, 'money-per-point');
  await chooseMoney(page, 'pot');
  await cap(page, f, 'money-pot');
  await chooseMoney(page, 'legs');
  await createAndHub(page, f);
});

test('walk C: 4 players → everyone for themselves → skins', async ({ page }) => {
  const f = 'C-skins';
  await field(page, f, FOUR_PLAYERS, 'Sunday Skins');
  await cap(page, f, 'structure');
  await toScoringStep(page, 'solo');
  await cap(page, f, 'scoring-default');
  await chooseSolo(page, 'skins');
  await cap(page, f, 'scoring-skins');
  await courseTees(page, f);
  await page.getByRole('button', { name: /Next: Money/ }).click();
  await cap(page, f, 'review');
  await createAndHub(page, f);
});

test('walk D: 2 players → 1 v 1', async ({ page }) => {
  const f = 'D-1v1';
  await field(page, f, TWO_PLAYERS, 'Craig v Jym');
  await cap(page, f, 'structure');
  await toScoringStep(page, 'teams:1+1');
  await cap(page, f, 'scoring');
  await courseTees(page, f);
  // F-079: nothing to build in a 1 v 1 — tees go straight to money.
  await page.getByRole('button', { name: 'Next: Money' }).click();
  await cap(page, f, 'money');
  await createAndHub(page, f);
});

test('walk E: 5 players → 3 + 2 (teams that are their own groups)', async ({ page }) => {
  const f = 'E-five';
  await field(page, f, [...FOUR_PLAYERS, ['Sam', '6']], 'Five');
  await cap(page, f, 'structure');
  await toScoringStep(page, 'teams:3+2');
  await cap(page, f, 'scoring');
  await courseTees(page, f);
  await page.getByRole('button', { name: /Next: Teams/ }).click();
  await cap(page, f, 'teams-before');
  await page.getByRole('button', { name: /Even them out/ }).click();
  await cap(page, f, 'teams-built');
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await cap(page, f, 'money');
});

test('walk F: 4 players → two pairs (the 2v2 in one foursome)', async ({ page }) => {
  const f = 'F-2v2';
  await field(page, f, FOUR_PLAYERS, 'Saturday 2v2');
  await toScoringStep(page, 'teams:2+2');
  await cap(page, f, 'scoring');
  await courseTees(page, f);
  await page.getByRole('button', { name: 'Next: Teams' }).click();
  await cap(page, f, 'teams-before');
  await buildTeams(page, 'even');
  await cap(page, f, 'teams-built');
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await cap(page, f, 'money');
  await createAndHub(page, f);
});

test('walk G: a saved format (Saturday Nassau) from the picker with 4 players', async ({ page }) => {
  test.setTimeout(90_000);   // two seeds + the whole wizard
  const f = 'G-format';
  const card = page.locator('div.bg-white', { hasText: 'Groups — 61-member standing group' }).first();
  await page.goto(`${BASE}/sandbox`);
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  await addPlayers(page, FOUR_PLAYERS);
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await cap(page, f, 'structure-before');
  await page.locator('select').first().selectOption('format:f-saturday-nassau');
  await cap(page, f, 'structure-format');
  await page.getByRole('button', { name: 'Next: Scoring' }).click();
  await cap(page, f, 'scoring-format');
  await page.getByRole('button', { name: 'Change Game' }).click();
  await cap(page, f, 'scoring-format-open');
});
