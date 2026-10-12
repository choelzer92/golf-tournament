// F-037 T2 (§5.cn, §5.co): Team → Match. Two teams of 4, a 2 v 2 match in each foursome; the board
// shows the team totals (match points) and one row per match, and each group's card shows ONLY its
// own match. Seed: Hogs win both matches → 2–0, the $40 pot: Hogs +$20, Dawgs −$20.

import { expect, test, type Page } from '@playwright/test';
import {
  BASE, EIGHT_PLAYERS, PHONE, buildTeams, chooseStructure, closeSendSheet, fieldToGameStep, resetBackend, seed, signInOrganizer, toScoringStep,
} from './helpers';

const SEED = 'F-037: Hogs v Dawgs as two 2 v 2 matches';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

async function openCard(page: Page, id: string, group: number) {
  await page.goto(`${BASE}/pool/${id}`);
  await page.getByRole('button', { name: /enter scores/i }).nth(group - 1).click();
  await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
  await expect(page.getByText(/^Hole \d+$/).first()).toBeVisible();
}

test('F-037: the board shows team match points and one row per match, with the pot to the team', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, SEED);
  await page.goto(`${BASE}/pool/${id}/leaderboard`);
  await page.waitForURL(/\/leaderboard/);
  await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();

  const board = page.getByTestId('match-board');
  await expect(board).toBeVisible();
  const rows = board.getByTestId('match-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Craig & Jym v Dave & Rick');
  await expect(rows.nth(0)).toContainText('Craig & Jym 18 up');
  await expect(rows.nth(1)).toContainText('Sam & Tony v Will & Gary');
  await expect(rows.nth(1)).toContainText('Sam & Tony 18 up');

  const text = await page.locator('body').innerText();
  const standings = text.slice(text.indexOf('STANDINGS'), text.indexOf('MATCHES'));
  expect(standings).toMatch(/The Hogs[\s\S]*\b2\b[\s\S]*\+\$20/);
  expect(standings).toMatch(/The Dawgs[\s\S]*−\$20/);
  await page.screenshot({ path: 'e2e/screenshots/f037-board.png', fullPage: true });
});

test('F-037: each group\'s card shows only its own match, ranked within it', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, SEED);

  await openCard(page, id, 1);
  let body = await page.locator('body').innerText();
  const line = (who: string) => body.split('\n').find((l) => l.trim().startsWith(who)) ?? '';
  expect(line('Craig & Jym')).toContain('1st');
  expect(line('Dave & Rick')).toContain('2nd');
  expect(body).not.toContain('Sam & Tony');
  expect(body).not.toContain('Will & Gary');
  await page.screenshot({ path: 'e2e/screenshots/f037-card-group1.png', fullPage: true });

  await openCard(page, id, 2);
  body = await page.locator('body').innerText();
  expect(line('Sam & Tony')).toContain('1st');
  expect(line('Will & Gary')).toContain('2nd');
  expect(body).not.toContain('Dave & Rick');
});

test('F-037: eight players pick 2 teams of 4 with 2 v 2 matches, and Create builds two matches', async ({ page }) => {
  await page.setViewportSize(PHONE);
  // A recent course to pick (the course step lists it without a GHIN search).
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  await fieldToGameStep(page, EIGHT_PLAYERS);
  await chooseStructure(page, 'teams:4+4');

  // §5.co Q5: the question shows once there are 2+ teams, off by default.
  const matches = page.getByRole('radiogroup', { name: 'Head-to-head matches' });
  await expect(matches).toBeVisible();
  await expect(matches.getByRole('radio', { name: 'No' })).toHaveAttribute('aria-checked', 'true');
  await matches.getByRole('radio', { name: '2 v 2' }).click();
  await expect(matches.getByRole('radio', { name: '2 v 2' })).toHaveAttribute('aria-checked', 'true');
  // The chosen split now describes matches, not "each team plays as its own foursome".
  await expect(page.getByText('Teams split into 2 v 2 matches, one per foursome')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/f037-wizard-compete.png', fullPage: true });

  await toScoringStep(page);
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: 'Next: Set Tees' }).click();
  await page.getByRole('button', { name: 'Next: Teams' }).click();
  await buildTeams(page, 'list');
  await page.getByRole('button', { name: 'Next: Groups' }).click();

  // §5.co Q6: the tee sheet was built FROM the matches — one 2 v 2 per foursome.
  await expect(page.getByText(/Each foursome plays a 2 v 2 match between two teams/)).toBeVisible();
  // The tee sheet pairs, so nothing blocks Next (an unpairable one would name the group and why).
  await expect(page.getByText(/needs the same number of players/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Next: Review & Create/ })).toBeEnabled();
  await page.screenshot({ path: 'e2e/screenshots/f037-wizard-groups.png', fullPage: true });
  await page.getByRole('button', { name: /Next: Review & Create/ }).click();

  // §5.co follow-up: switching matches on makes the pot the money default; the match questions
  // sit with the stakes.
  await expect(page.locator('input[name="money-model"][value="pot"]')).toBeChecked();
  await expect(page.getByText('A match counts')).toBeVisible();
  // Four-ball is the matches default: best ball, hole by hole — not the classic pool's net + gross.
  await expect(page.getByText(/best ball/i).first()).toBeVisible();
  await expect(page.getByText(/best net \+ best gross/)).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/f037-wizard-money.png', fullPage: true });
  await signInOrganizer(page);
  await page.getByRole('button', { name: 'Create & send to players' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 15_000 });
  await closeSendSheet(page);
  await expect(page.getByRole('heading', { name: 'Tee groups' })).toBeVisible();
  await expect(page.getByText(/2 teams of 4 · pot · 2 matches/).first()).toBeVisible();

  const id = new URL(page.url()).pathname.split('/').pop()!;
  await page.goto(`${BASE}/pool/${id}/leaderboard`);
  await page.waitForURL(/\/leaderboard/);
  // The label is read from the STORED tee sheet through `matchesOf`, so "2 matches" proves the
  // created game pairs. Before any score the board keeps its usual empty state.
  await expect(page.getByText('2 teams of 4 · pot · 2 matches')).toBeVisible();
  await expect(page.getByText('No scores yet.')).toBeVisible();
});

test('F-037: no matches question for everyone-for-themselves', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  await fieldToGameStep(page, EIGHT_PLAYERS);
  await chooseStructure(page, 'solo');
  await expect(page.getByText('How do you want to compete?')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Head-to-head matches' })).toHaveCount(0);
});

test('F-037 / §5.cp: Add player is refused in a matches game, with the reason', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, SEED);
  await page.goto(`${BASE}/pool/${id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Tee groups' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByTestId('add-player-matches')).toContainText('head-to-head matches');
  await page.screenshot({ path: 'e2e/screenshots/f037-hub-add-refused.png', fullPage: true });
});

test('F-107 / §5.cq: every tee-group card says who plays whom', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const id = await seed(page, SEED);
  await page.goto(`${BASE}/pool/${id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Tee groups' })).toBeVisible();
  const lines = page.getByTestId('group-match-line');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toHaveText('Group 1: Craig & Jym v Dave & Rick');
  await expect(lines.nth(1)).toHaveText('Group 2: Sam & Tony v Will & Gary');
  await page.screenshot({ path: 'e2e/screenshots/f107-hub-pairings.png', fullPage: true });
});

test('F-107 / §5.cq: singles are paired on the groups step and the pairing is saved with the game', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  await fieldToGameStep(page, EIGHT_PLAYERS);
  await chooseStructure(page, 'teams:4+4');
  await page.getByRole('radiogroup', { name: 'Head-to-head matches' }).getByRole('radio', { name: '1 v 1' }).click();
  await expect(page.getByText('Teams split into singles matches, two to a foursome')).toBeVisible();
  await toScoringStep(page);
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: 'Next: Set Tees' }).click();
  await page.getByRole('button', { name: 'Next: Teams' }).click();
  await buildTeams(page, 'list');
  await page.getByRole('button', { name: 'Next: Groups' }).click();

  // Two singles per foursome, each named on its card.
  const wizardLines = page.getByTestId('group-match-line');
  await expect(wizardLines).toHaveCount(4);
  const shown = await wizardLines.allInnerTexts();
  expect(shown.every((l) => / v /.test(l) && !l.includes('&'))).toBe(true);
  await expect(page.getByRole('button', { name: /Next: Review & Create/ })).toBeEnabled();
  await page.screenshot({ path: 'e2e/screenshots/f107-wizard-singles.png', fullPage: true });
  await page.getByRole('button', { name: /Next: Review & Create/ }).click();
  await signInOrganizer(page);
  await page.getByRole('button', { name: 'Create & send to players' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 15_000 });
  await closeSendSheet(page);
  await expect(page.getByRole('heading', { name: 'Tee groups' })).toBeVisible();

  // The SAME pairings on the hub: stored with the game, not re-derived from list order.
  const hub = await page.getByTestId('group-match-line').allInnerTexts();
  expect(hub.join(' · ')).toBe(`Group 1: ${shown[0]} · ${shown[1]} · Group 2: ${shown[2]} · ${shown[3]}`);
  await expect(page.getByText(/· 4 matches/).first()).toBeVisible();
});
