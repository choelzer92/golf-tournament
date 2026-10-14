// §5.de / §5.dg: the match cards. Step 2 asks only "How do the teams play each other?"; the cards sit
// on the teams step, after course, tees and allowance, so they show the game's own playing handicaps.
// One card per tee group; tap two players to swap them (across teams too); the tee time is set on the
// card.

import { expect, test, type Page } from '@playwright/test';
import {
  BASE, EIGHT_PLAYERS, PHONE, chooseStructure, closeSendSheet, fieldToGameStep, resetBackend, signInOrganizer, toScoringStep,
} from './helpers';

test.beforeEach(async ({ context, page }) => { await resetBackend(context, page); });

async function eightOnStepTwo(page: Page) {
  await page.setViewportSize(PHONE);
  // A recent course to pick (the course step lists it without a GHIN search).
  const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await page.goto(`${BASE}/pool/new`);
  await page.waitForLoadState('networkidle');
  await fieldToGameStep(page, EIGHT_PLAYERS);
  await chooseStructure(page, 'teams:4+4');
}

async function toTeamsStep(page: Page) {
  await toScoringStep(page);
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  await page.getByRole('button', { name: 'Next: Set Tees' }).click();
  await page.getByRole('button', { name: 'Next: Teams' }).click();
  await expect(page.getByRole('heading', { name: 'Set Teams' })).toBeVisible();
}

const answer = (page: Page, name: string) => page.getByRole('radiogroup', { name: 'How do the teams play each other?' })
  .getByRole('radio', { name }).click();

test('§5.dg: whole teams — no cards on step 2; on the teams step they show the same handicaps as the teams', async ({ page }) => {
  await eightOnStepTwo(page);
  await expect(page.getByRole('radio', { name: 'As whole teams — 4 v 4' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('match-cards')).toHaveCount(0);
  await toTeamsStep(page);

  const cards = page.getByTestId('match-cards');
  await expect(cards.getByLabel('Team 1 name')).toHaveValue('Team 1');
  await expect(cards.getByTestId('match-card')).toHaveCount(2);
  // Whole teams: a card is one team, so nothing inside it says "v".
  await expect(cards.getByTestId('card-balance')).toHaveCount(0);
  // §5.dh: the cards are the only team editor — the old list (Move to, + Add team) is gone.
  await expect(page.getByText('Move to')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Add team' })).toHaveCount(0);
  // Each card's chips add up to its team's combined HCP (the game's own playing handicaps, §5.dg).
  for (const n of [1, 2]) {
    const chipText = await cards.getByTestId('match-card').nth(n - 1).getByRole('button').allTextContents();
    const sum = chipText.reduce((s, t) => s + Number(t.trim().split(/\s+/).pop()!.replace('+', '-')), 0);
    await expect(cards.getByTestId('team-totals')).toContainText(`combined HCP ${sum}`);
  }
  // A name typed on the card is the team's name.
  await cards.getByLabel('Team 1 name').fill('Hogs');
  await expect(cards.getByTestId('match-card').filter({ hasText: 'Hogs' })).toHaveCount(1);
  await page.screenshot({ path: 'e2e/screenshots/match-cards-whole.png', fullPage: true });
});

test('§5.de: one on one — two singles to a foursome, each its own line', async ({ page }) => {
  await eightOnStepTwo(page);
  await answer(page, 'One on one — four 1 v 1 matches');
  await toTeamsStep(page);
  const cards = page.getByTestId('match-cards');
  await expect(cards.getByTestId('match-card')).toHaveCount(2);
  await expect(cards.getByTestId('card-single')).toHaveCount(4);
  await page.screenshot({ path: 'e2e/screenshots/match-cards-singles.png', fullPage: true });
});

test('§5.de: pairs — a cross-team swap moves the teams, and the tee time set on a card reaches the hub', async ({ page }) => {
  await eightOnStepTwo(page);
  await answer(page, 'In pairs — two 2 v 2 matches');
  await toTeamsStep(page);

  const cards = page.getByTestId('match-cards');
  await expect(cards.getByTestId('match-card')).toHaveCount(2);
  await expect(cards.getByTestId('card-balance')).toHaveCount(2);
  const totals = cards.getByTestId('team-totals');
  const before = await totals.textContent();

  // Card 1 holds two players from each team. Swap one from each team: the teams change.
  const first = cards.getByTestId('match-card').first();
  const chips = first.getByRole('button', { pressed: false });
  const a = (await chips.nth(0).getAttribute('aria-label'))!;
  const b = (await chips.nth(2).getAttribute('aria-label'))!;
  await chips.nth(0).click();
  await expect(cards.getByText(`Now tap who ${a} swaps with.`)).toBeVisible();
  await first.getByRole('button', { name: b, exact: true }).click();
  await expect(totals).not.toHaveText(before!);
  // A captain swapped away hands the role on, and each Captains-panel slot names a player who is
  // on THAT team (slot i = team i), never one who moved away.
  const slots = (await page.locator('select').evaluateAll((els) => els.map((el) => {
    const sel = el as HTMLSelectElement;
    return sel.options[sel.selectedIndex]?.text ?? '';
  }))).filter((t) => /\(\+?\d+\)$/.test(t)).map((t) => t.split(/\s+/)[0]);
  expect(slots).toHaveLength(2);
  for (const [i, who] of slots.entries()) {
    await expect(cards.getByRole('button', { name: who, exact: true })).toHaveAttribute('data-team', String(i));
  }
  await page.screenshot({ path: 'e2e/screenshots/match-cards-pairs-swapped.png', fullPage: true });

  // The tee time is set on the card.
  await first.getByLabel('Tee time hour').selectOption({ label: '8 AM' });
  await first.getByLabel('Tee time minutes').selectOption('10');

  await page.getByRole('button', { name: 'Next: Groups' }).click();
  await expect(page.getByText(/Each foursome plays a 2 v 2 match between two teams/)).toBeVisible();
  await page.getByRole('button', { name: /Next: Review & Create/ }).click();
  await signInOrganizer(page);
  await page.getByRole('button', { name: 'Create & send to players' }).click();
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 15_000 });
  await closeSendSheet(page);
  await expect(page.getByRole('heading', { name: 'Tee groups' })).toBeVisible();
  await expect(page.getByText('8:10').first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/match-cards-hub.png', fullPage: true });
});
