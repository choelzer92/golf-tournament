// Shared e2e helpers — the seed/access plumbing that was duplicated across
// 6+ spec files, extracted 2026-09-15 (§5.bj harness round 2). Playwright only
// treats *.spec.ts as tests, so this module is safe to import from any spec.
//
// Everything here targets the SANDBOX server (in-memory backend):
//   NEXT_PUBLIC_SANDBOX=1 npx next dev --port 3200

import { expect } from '@playwright/test';

type Page = import('@playwright/test').Page;
type BrowserContext = import('@playwright/test').BrowserContext;
type Browser = import('@playwright/test').Browser;

export const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';
export const PHONE = { width: 390, height: 844 };

// The invite gate wraps the whole app, so grant access before the first paint.
// (The gate reads a plain cookie — see src/lib/invite-gate.ts.) Clears the fake
// backend (sessionStorage) so each test starts empty, then reloads.
export async function grantAndReset(context: BrowserContext, page: Page) {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
}

// The beforeEach used by the verify-* files (split out of verify-fixes.spec.ts):
// same as grantAndReset but without the reload — their seed() reloads itself.
export async function resetBackend(context: BrowserContext, page: Page) {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => sessionStorage.clear());
}

// Seed a scenario card on /sandbox (assumes the page is already there).
export async function seedCard(page: Page, label: string) {
  const card = page.locator('div.bg-white', { hasText: label });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  return card;
}

// Seed a scenario and follow its "Open →" link; returns the game id.
export async function seedAndOpenGame(page: Page, label: string): Promise<string> {
  const card = await seedCard(page, label);
  await card.getByRole('button', { name: 'Open →' }).click();
  await page.waitForURL(/\/pool\/[^/]+/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  const m = new URL(page.url()).pathname.match(/\/pool\/([^/]+)/);
  if (!m) throw new Error(`seed("${label}") did not land on a pool page: ${page.url()}`);
  return m[1];
}

// A "different device": fresh context carrying only the seeded backend data.
export async function freshGuest(browser: Browser, store: string) {
  const ctx = await browser.newContext({ viewport: PHONE });
  const guest = await ctx.newPage();
  await guest.goto(`${BASE}/sandbox`);
  await guest.evaluate((d) => sessionStorage.setItem('__sandbox_supabase__', d), store);
  await ctx.clearCookies();
  return { ctx, guest };
}

// ——— The verify-fixes.spec.ts trio (its split files all share these) ———

// Seed a scenario from the sandbox page and follow its "Open" link.
// Returns the seeded game's id so tests can navigate to a specific sub-page.
export async function seed(page: Page, label: string): Promise<string> {
  await page.goto(`${BASE}/sandbox`);
  // Start from an empty backend every time. The fake persists to sessionStorage so
  // seeded games survive navigation, which means a previous test in this file can
  // leave a dirty store behind.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const card = page.locator('div.bg-white', { hasText: label });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await card.getByRole('button', { name: 'Open →' }).click();
  // Wait for the URL, not networkidle. "Open" is a client-side router.push, so there may
  // be no network activity to settle — networkidle could resolve while the URL was still
  // /sandbox, which made the FIRST test in a describe block fail about 1 run in 3 with a
  // successfully-seeded game it had simply never navigated to.
  await page.waitForURL(/\/pool\/[^/]+/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  // /pool/<id> or /pool/<id>/leaderboard
  const m = new URL(page.url()).pathname.match(/\/pool\/([^/]+)/);
  if (!m) throw new Error(`seed("${label}") did not land on a pool page: ${page.url()}`);
  return m[1];
}

// Navigate within the seeded game. The in-memory store lives in this tab's JS
// heap, so use client-side routing (goto would reload and wipe it).
export async function goToGame(page: Page, id: string, sub = '') {
  await page.goto(`${BASE}/pool/${id}${sub}`);
  await page.waitForLoadState('networkidle');
}

// §5.au: the wizard opens on the FIELD. Add a minimal two players and advance to the
// game step — for tests whose subject is the game step itself, not the walk there.
export const TWO_PLAYERS: [string, string][] = [['Craig', '4'], ['Jym', '12']];
export const FOUR_PLAYERS: [string, string][] = [...TWO_PLAYERS, ['Dave', '8'], ['Rick', '16']];
export const EIGHT_PLAYERS: [string, string][] = [
  ...FOUR_PLAYERS, ['Sam', '6'], ['Tony', '14'], ['Will', '10'], ['Gary', '2'],
];

/** Add players by hand on the field step (name + HCP + Add). */
export async function addPlayers(page: Page, players: [string, string][]) {
  for (const [nm, hcp] of players) {
    await page.getByPlaceholder('Name', { exact: true }).fill(nm);
    await page.getByPlaceholder('HCP').fill(hcp);
    await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
  }
}

/** Field → the structure step ("How do you want to compete?", §5.bk). Two players by default. */
export async function fieldToGameStep(page: Page, players: [string, string][] = TWO_PLAYERS) {
  await addPlayers(page, players);
  await page.getByRole('button', { name: /Next: Choose Game/ }).click();
  await expect(page.getByText('How do you want to compete?')).toBeVisible();
}

// ——— §5.bk collapse: the structure + scoring steps replaced the game picker ———
// Select by VALUE where one exists (structure ids are `teams:4+4`, `teams:2+2`, `solo`; mode ids
// are the registry ids), so a relabel can't break a spec.

/** Pick a structure on step 2 by its option id ('teams:4+4', 'solo') or its visible label. */
export async function chooseStructure(page: Page, idOrLabel: string) {
  const byValue = page.locator(`input[name="structure"][value="${idOrLabel}"]`);
  const byLabel = page.getByRole('radio', { name: idOrLabel, exact: true });
  // Uneven shapes sit under "Other split…" (§5.bm Q3) — open it when the row isn't showing.
  if ((await byValue.count()) === 0 && (await byLabel.count()) === 0) {
    const other = page.getByRole('button', { name: /Other split/ });
    if (await other.count()) await other.click();
  }
  if (await byValue.count()) await byValue.check();
  else await byLabel.check();
}

/** Structure step → scoring step, optionally choosing a structure first. Asserts arrival.
 *  Names the game when nothing has (the step requires a name, as the old game step did). */
export async function toScoringStep(page: Page, structure?: string) {
  if (structure) await chooseStructure(page, structure);
  const nameBox = page.getByPlaceholder('e.g. Saturday Pool');
  if ((await nameBox.count()) && (await nameBox.inputValue()).trim() === '') await nameBox.fill('Test Game');
  await page.getByRole('button', { name: 'Next: Scoring' }).click();
  await expect(page.getByText('How is it scored?')).toBeVisible();
}

/** On the scoring step of an everyone-for-themselves game: pick the individual mode by registry id. */
export async function chooseSolo(page: Page, modeId: string) {
  await page.locator(`input[name="solo-mode"][value="${modeId}"]`).check();
}

/** F-071: ONE teams step for every split. On it, build the teams with one of the three methods
 *  (the step opens empty — like the pool always has — until a method is tapped). */
export async function buildTeams(page: Page, method: 'even' | 'deal' | 'list' = 'even') {
  await expect(page.getByText('How should teams be built?')).toBeVisible();
  const label = method === 'even' ? /Even them out/ : method === 'deal' ? /Captains’ deal/ : /Straight down the list/;
  await page.getByRole('button', { name: label }).click();
}

/** On the money step: pick a money model by id ('pot' | 'legs' | 'per-hole' | 'per-point'). */
export async function chooseMoney(page: Page, model: string) {
  await page.locator(`input[name="money-model"][value="${model}"]`).check();
}
