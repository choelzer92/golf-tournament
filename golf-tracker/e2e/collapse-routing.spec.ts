// §5.bk / §5.bm — the collapsed wizard: structure → scoring → … → money, routed by capability.
//
// One spec per routing row (plan §4.7): each builds a game through the NEW steps and asserts it
// landed on the container the router promised — a positive assertion on something only that
// container renders. Screenshots feed the UI critique loop (UI_CRITIQUE_PROCESS.md).

import { test, expect, type Page } from '@playwright/test';
import {
  BASE, PHONE, EIGHT_PLAYERS, FOUR_PLAYERS, TWO_PLAYERS, resetBackend,
  addPlayers, toScoringStep, chooseSolo, chooseMoney, buildTeams,
} from './helpers';

test.beforeEach(async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await resetBackend(context, page);
  // A course to pick: the "Past games" seed gives the course step its recent-course chip.
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
});

async function startWizard(page: Page, players: [string, string][], name: string) {
  await addPlayers(page, players);
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await expect(page.getByText('How do you want to compete?')).toBeVisible();
  await page.getByPlaceholder('e.g. Saturday Pool').fill(name);
}

async function courseAndTees(page: Page) {
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: /Next: Set Tees/ }).click();
}

test('structure step: 8 players see the §6 mock — teams of 4 first and recommended, singles greyed', async ({ page }) => {
  await startWizard(page, EIGHT_PLAYERS, 'Structure Walk');
  const body = await page.locator('body').innerText();
  expect(body).toContain('Two teams of 4');
  expect(body).toContain('Four pairs');
  expect(body).toContain('Everyone for themselves');
  expect(body).toContain('needs 2–4 players');
  expect(body).toContain('Other split…');
  // The recommendation is pre-selected (§5.bk), never forced.
  await expect(page.locator('input[name="structure"][value="teams:4+4"]')).toBeChecked();
  // F-041: the scoring lives on for a field the individual modes can't hold.
  expect(body).toMatch(/8 players can still score Stableford — as teams/);
  await page.screenshot({ path: 'e2e/screenshots/collapse-01-structure-8.png', fullPage: true });

  await page.getByRole('button', { name: /Other split/ }).click();
  await expect(page.getByText('Three teams, 3 + 3 + 2')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/collapse-02-structure-8-other.png', fullPage: true });
});

test('routing row: two teams of 4, pot → the classic pool (hub shows its foursomes and pot legs)', async ({ page }) => {
  await startWizard(page, EIGHT_PLAYERS, 'Classic Pot');
  await toScoringStep(page, 'teams:4+4');
  // Today's pool by default: best net + best gross, strokes, 18-hole total.
  await expect(page.getByLabel('Which scores count for the team?')).toHaveValue('net-and-gross');
  await expect(page.getByRole('button', { name: 'Strokes' })).toHaveClass(/bg-green-600/);
  await expect(page.getByRole('button', { name: '18-hole total' })).toHaveClass(/bg-green-600/);
  await expect(page.getByText(/USGA suggests 85% for four-ball stroke play/)).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/collapse-03-scoring-teams.png', fullPage: true });

  await courseAndTees(page);
  await page.getByRole('button', { name: /Next: Teams/ }).click();
  await expect(page.getByRole('heading', { name: 'Set Teams' })).toBeVisible();
  await page.getByRole('button', { name: 'No captains' }).click();
  await page.getByRole('button', { name: /Straight down the list/ }).click();
  await page.getByRole('button', { name: /Next: Review/ }).click();

  // The money step, routed: pot and head-to-head legs available, margin money greyed with WHY.
  await expect(page.getByRole('heading', { name: "What's it worth?" })).toBeVisible();
  await expect(page.locator('input[name="money-model"][value="pot"]')).toBeChecked();
  await expect(page.locator('input[name="money-model"][value="legs"]')).toBeEnabled();
  // Best net + best gross is a two-ball format only the classic pool computes, so margin money
  // is refused HERE, with the reason — capability routing (§5.bm Q1) made visible.
  await expect(page.locator('input[name="money-model"][value="per-point"]')).toBeDisabled();
  await expect(page.getByText(/Two-ball formats can't ride on \$ per hole or \$ per point yet/).first()).toBeVisible();
  await expect(page.getByText('Buy-in per player ($)')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/collapse-04-money-classic.png', fullPage: true });

  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/]+$/, { timeout: 15_000 });
  // Only the classic pool's hub says this.
  await expect(page.getByText(/Pool · 2 foursomes/)).toBeVisible();
});

test('routing row: two teams of 4, $ per point → the sides engine even though teams are foursomes', async ({ page }) => {
  await startWizard(page, EIGHT_PLAYERS, 'Aligned Margin');
  await toScoringStep(page, 'teams:4+4');
  // Best ball is a format both engines compute, so every money model stays open.
  await page.getByLabel('Which scores count for the team?').selectOption('best-ball');
  await courseAndTees(page);
  await page.getByRole('button', { name: /Next: Teams/ }).click();
  await page.getByRole('button', { name: 'No captains' }).click();
  await page.getByRole('button', { name: /Straight down the list/ }).click();
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await chooseMoney(page, 'per-point');
  // The sides engine's stakes appear; the classic pot fields go.
  await expect(page.getByText('$ per point', { exact: true })).toBeVisible();
  await expect(page.getByText('Buy-in per player ($)')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/collapse-05-money-aligned-per-point.png', fullPage: true });
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/]+$/, { timeout: 15_000 });
  await expect(page.getByText(/Sides \/ Match · 8 players/)).toBeVisible();
});

test('routing row: four pairs, fixed legs → the sides engine with two tee times, partners together', async ({ page }) => {
  await startWizard(page, EIGHT_PLAYERS, 'Four Pairs');
  await toScoringStep(page, 'teams:2+2+2+2');
  // Shared-foursome defaults: best ball, Stableford, hole by hole; two-ball formats say why not.
  await expect(page.getByLabel('Which scores count for the team?')).toHaveValue('best-ball');
  await expect(page.getByRole('button', { name: 'Hole by hole' })).toHaveClass(/bg-green-600/);
  await expect(page.locator('option[value="two-best-net"]')).toBeDisabled();
  await courseAndTees(page);
  // F-071: the SAME teams step as the pool — the method list, not letter buttons — and the
  // structure step's answer is not asked again (F-078: no shape chooser here).
  await page.getByRole('button', { name: 'Next: Teams' }).click();
  await expect(page.getByRole('heading', { name: 'Set Teams' })).toBeVisible();
  await expect(page.getByText('Four pairs. Partners walk together — who tees off with whom comes next.')).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('How do the sides split?');
  // No tee times on money teams — the tee sheet is the next step's question.
  await expect(page.getByText('Tee time')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/collapse-06a-teams-four-pairs-before.png', fullPage: true });
  await buildTeams(page, 'list');   // Craig+Jym, Dave+Rick, Sam+Tony, Will+Gary — deterministic
  await expect(page.getByLabel('Team 4 name')).toBeVisible();
  await expect(page.getByLabel('Team 5 name')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/collapse-06b-teams-four-pairs-built.png', fullPage: true });
  await page.getByRole('button', { name: 'Next: Groups' }).click();
  // Partners walk together (§5.bm Q2): the first two pairs share group 1, whole.
  await expect(page.getByRole('heading', { name: /playing together/ })).toBeVisible();
  const group1 = page.locator('div.bg-white', { hasText: 'Group 1' }).first();
  for (const nm of ['Craig', 'Jym', 'Dave', 'Rick']) await expect(group1.getByText(nm)).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).toContain('Group 2');
  await page.screenshot({ path: 'e2e/screenshots/collapse-06-groups-four-pairs.png', fullPage: true });
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await expect(page.getByText('Sides (2 vs 2 vs 2 vs 2)')).toBeVisible();
  await expect(page.locator('input[name="money-model"][value="legs"]')).toBeChecked();
  await expect(page.getByText(/Front 9 \(\$\)/)).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/collapse-07-money-sides.png', fullPage: true });
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/]+$/, { timeout: 15_000 });
  await expect(page.getByText(/Sides \/ Match · 8 players · 2 groups/)).toBeVisible();
});

test('routing row: four pairs + closest-to-pin is refused with the reason, not silently dropped', async ({ page }) => {
  await startWizard(page, EIGHT_PLAYERS, 'Refused');
  await toScoringStep(page, 'teams:2+2+2+2');
  await courseAndTees(page);
  await page.getByRole('button', { name: 'Next: Teams' }).click();
  await buildTeams(page, 'even');
  await page.getByRole('button', { name: 'Next: Groups' }).click();
  await page.getByRole('button', { name: /Next: Review/ }).click();
  // Shared-foursome teams never see the classic bonus grid — the note says why.
  await expect(page.getByRole('button', { name: /\+ Add bonuses/ })).toHaveCount(0);
  await expect(page.getByText(/Closest-to-pin and hand-tracked bonuses need each team in its own foursome/)).toBeVisible();
  // F-077: a per-side pot's summary quotes the per-side buy-in the stakes field shows ($20 default),
  // never the classic per-player buy-in.
  await chooseMoney(page, 'pot');
  await expect(page.getByLabel('Buy-in ($ / side)')).toHaveValue('20');
  expect(await page.locator('body').innerText()).toContain('$20 buy-in pot');
});

test('routing row: everyone for themselves (4) → skins, the individual mode', async ({ page }) => {
  await startWizard(page, FOUR_PLAYERS, 'Sunday Skins');
  // Four players: two pairs is the usual; singles are one tap away.
  await expect(page.locator('input[name="structure"][value="teams:2+2"]')).toBeChecked();
  await page.screenshot({ path: 'e2e/screenshots/collapse-08-structure-4.png', fullPage: true });
  await toScoringStep(page, 'solo');
  await expect(page.getByText('Which game?')).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/Skins\s*✓ 4 players/);
  await chooseSolo(page, 'skins');
  await expect(page.getByText('Skins options')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/collapse-09-scoring-solo.png', fullPage: true });
  await courseAndTees(page);
  await page.getByRole('button', { name: /Next: Money/ }).click();
  await expect(page.getByRole('heading', { name: /Review & create/ })).toBeVisible();
  await expect(page.locator('input[name="money-model"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/]+$/, { timeout: 15_000 });
  await expect(page.getByText(/Skins · 4 players/)).toBeVisible();
});

test('routing row: 1 v 1 → a singles match on the sides engine, 100% allowance suggested (F-064)', async ({ page }) => {
  await startWizard(page, TWO_PLAYERS, 'Craig v Jym');
  await toScoringStep(page, 'teams:1+1');
  // Singles: no team-format question; hole by hole; the USGA singles number.
  await expect(page.getByLabel('Which scores count for the team?')).toHaveCount(0);
  await expect(page.getByText(/USGA suggests 100% for singles match play/)).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/collapse-10-scoring-1v1.png', fullPage: true });
  await courseAndTees(page);
  // F-079: a 1 v 1 has nothing to build — the structure decided membership — so tees go
  // straight to money, and the review still shows the two sides.
  await expect(page.getByRole('button', { name: 'Next: Teams' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next: Money' }).click();
  await expect(page.getByRole('heading', { name: /Review & create/ })).toBeVisible();
  // F-077: the summary must quote THIS game's money — the legs — not a skin value left over from
  // the everyone-for-themselves pick two players default to.
  const review = await page.locator('body').innerText();
  expect(review).toContain('Sides (1 vs 1)');
  expect(review).toContain('$10 / $10 / $10 front·back·overall');
  expect(review).not.toMatch(/a skin/);
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/]+$/, { timeout: 15_000 });
  await expect(page.getByText(/Sides \/ Match · 2 players/)).toBeVisible();
});

test('structure step: 5 players are offered 3 + 2 (recommended), 2 + 2 + 1 and singles', async ({ page }) => {
  await startWizard(page, [...FOUR_PLAYERS, ['Sam', '6']], 'Five');
  await expect(page.locator('input[name="structure"][value="teams:3+2"]')).toBeChecked();
  await page.getByRole('button', { name: /Other split/ }).click();
  const body = await page.locator('body').innerText();
  expect(body).toContain('Two teams, 3 + 2');
  expect(body).toContain('Three teams, 2 + 2 + 1');
  expect(body).toContain('Everyone for themselves');
  await page.screenshot({ path: 'e2e/screenshots/collapse-11-structure-5.png', fullPage: true });
});
