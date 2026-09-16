// Split out of verify-fixes.spec.ts on 2026-09-15 (§5.bj harness round 2).
// Covers the F-020 era: the game picker annotating fit, a group offering the formats
// it plays (§5.aw), a 1v1 singles match, and the sides step proposing splits.
// Verbatim moves — test titles and assertions unchanged. Shared plumbing: ./helpers.

import { expect, test } from '@playwright/test';
import { BASE, resetBackend, seed, goToGame, toScoringStep, chooseStructure, buildTeams } from './helpers';

// Grant invite-gate access + empty the fake backend before every test.
test.beforeEach(async ({ context, page }) => {
  await resetBackend(context, page);
});

test.describe('F-020: the game picker annotates fit', () => {
  async function startWizard(page: import('@playwright/test').Page) {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForURL(/\/pool\/new/, { timeout: 15_000 });
  }

  // §5.au: the FIELD is step 1 now, so building it happens before any game is picked —
  // which is exactly what lets every F-020 badge say something true on the FIRST pass.
  async function buildField(page: import('@playwright/test').Page, players: [string, string][]) {
    for (const [nm, hcp] of players) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await expect(page.getByText('How do you want to compete?')).toBeVisible();
    await page.getByPlaceholder('e.g. Saturday Pool').fill('Fit Test');
  }

  // From the details step, walk course → tees (the steps after the game now).
  async function pickCourse(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Set Tees/ }).click();
  }

  test('F-020 (§5.au): the picker annotates fit on the FIRST pass — the field now comes first', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startWizard(page);
    await buildField(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);

    const body = await page.locator('body').innerText();
    // Five players (§5.bk): teams fit — 3 + 2 is the usual — and everyone-for-themselves does not,
    // which the step says HERE rather than letting a dead end wait five steps on.
    expect(body).toContain('Two teams, 3 + 2');
    expect(body).toMatch(/Everyone for themselves\s*needs 2–4 players/);
    await expect(page.getByRole('radio', { name: 'Everyone for themselves', exact: true })).toBeDisabled();
    // F-041: "Stableford" names a SCORING SYSTEM, not just the 2–4 player individual mode — the
    // note redirects to teams rather than reading as "this app can't play Stableford with 5".
    expect(body).toMatch(/5 players can still score Stableford — as teams/);
    await page.screenshot({ path: 'e2e/screenshots/f020-annotated.png', fullPage: true });
  });

  test('F-020: picking a game that cannot work explains it HERE, and names one that can', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startWizard(page);
    await buildField(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8']]);
    await toScoringStep(page, 'solo');
    const body = await page.locator('body').innerText();

    // The constraint, at the moment of choosing: Wolf needs EXACTLY four, so it states the
    // requirement rather than a delta — "1 too few" reads as though adding anyone is the fix.
    expect(body).toMatch(/Wolf\s*needs exactly 4/);
    await expect(page.locator('input[name="solo-mode"][value="wolf"]')).toBeDisabled();
    // With the games that DO fit badged alongside, so it's guidance rather than a dead end (§5.ao).
    expect(body).toMatch(/Skins\s*✓ 3 players/);
    expect(body).toMatch(/Nines \/ Split Sixes\s*✓ 3 players/);
    // And it does NOT send them back a step — that was the old copy's whole problem.
    expect(body).not.toMatch(/go back/i);
    await page.screenshot({ path: 'e2e/screenshots/f020-wolf-misfit.png', fullPage: true });
  });

  // F-019 falsified two strings that claimed a side game is played "within a single group". A side
  // game can now be 8 players across two tee times, so nothing may claim how the field walks.
  test('F-020: no screen claims a side game is played in a single group', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startWizard(page);
    await buildField(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);
    await toScoringStep(page, 'teams:2+2+1');

    const picker = await page.locator('body').innerText();
    expect(picker).not.toMatch(/single group/i);

    // And the review step, which said "is played in a single group of 4–4 players".
    await pickCourse(page);
    await page.getByRole('button', { name: 'Next: Teams' }).click();
    await buildTeams(page, 'even');
    await page.getByRole('button', { name: 'Next: Groups' }).click();
    await page.getByRole('button', { name: /Next: Review/ }).click();
    const review = await page.locator('body').innerText();
    expect(review).not.toMatch(/single group/i);
    expect(review).not.toMatch(/go back to field/i);
  });

  // F-036: growing the side count in ONE reshape must mint distinct ids. The old sides editor
  // derived each new id from a slice of the OLD sides array, so 2 sides reshaped to 4 produced
  // A, B, C, C — and a player tapped onto "C" joined two money sides at once. F-071 retired that
  // editor: sides are minted by POSITION when the teams step is left, so the claim to pin is
  // that a reshape (Back to the structure step, another split) still yields distinct sides that
  // each hold their players once.
  test('F-036: reshaping 6 players from three pairs to 2 + 2 + 1 + 1 yields DISTINCT sides', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startWizard(page);
    await buildField(page, [
      ['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6'], ['Tony', '10'],
    ]);
    await toScoringStep(page, 'teams:2+2+2');
    await pickCourse(page);
    await page.getByRole('button', { name: 'Next: Teams' }).click();
    await buildTeams(page, 'list');
    await expect(page.getByLabel('Team 3 name')).toBeVisible();

    // Reshape: back to the structure step, UP to four teams (2 + 2 + 1 + 1, the F-036 direction —
    // growing the count is what minted a letter twice), forward again — the teams step rebuilds
    // for the new count and the old three-pair build is gone (a mis-shaped build would be the
    // F-036 class of bug: players on a team the structure no longer has).
    // teams → tees → course → scoring → structure: four Backs.
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /^← Back$/ }).click();
    await expect(page.getByText('How do you want to compete?')).toBeVisible();
    await toScoringStep(page, 'teams:2+2+1+1');
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Next: Set Tees/ }).click();
    await page.getByRole('button', { name: 'Next: Teams' }).click();
    await expect(page.getByLabel('Team 1 name')).toHaveCount(0);   // nothing carried over
    await buildTeams(page, 'list');
    await expect(page.getByLabel('Team 4 name')).toBeVisible();
    await expect(page.getByLabel('Team 5 name')).toHaveCount(0);
    await page.getByRole('button', { name: 'Next: Groups' }).click();
    await page.getByRole('button', { name: /Next: Review/ }).click();
    // Four DISTINCT sides, each named after its own players ("Straight down the list" is
    // deterministic: Craig+Jym, Dave+Rick, Sam, Tony) — no player on two money sides.
    const review = await page.locator('body').innerText();
    expect(review).toContain('Sides (2 vs 2 vs 1 vs 1)');
    for (const label of ['Craig & Jym', 'Dave & Rick', 'Sam (solo)', 'Tony (solo)']) expect(review).toContain(label);
    expect(review).not.toContain('Craig & Dave');
    expect(review).not.toContain('Jym (solo)');
  });
});

// ---------------------------------------------------------------------------
// A GROUP'S USUAL GAME IS TWO TAPS (§5.aw)
// ---------------------------------------------------------------------------
//
// Craig: "weekend warriors should be able to choose their saved format easily if they arent trying
// something new, one tap". The machinery was already built — GroupDefaults.formatIds, the group
// page's format picker, two composing session seeds — but NO FIXTURE attached a format to a group,
// so the path had never been seen on screen or covered by a test and read as unbuilt.
//
// These tests exist so it can't go invisible again.
test.describe('a group offers the formats it plays', () => {
  async function openWeekendWarriors(page: import('@playwright/test').Page) {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Groups — 61-member standing group' }).first();
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();
    // This is a `buildDomain` seed: it writes several tables through fire-and-forget `void
    // seedTable(...)` calls, so "Seeded ✓" appears before the rows have landed. Wait for the URL
    // rather than networkidle — a client-side router.push may have no network to settle.
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForURL(/\/home\/groups\//, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Weekend Warriors' })).toBeVisible();
  }

  test('§5.aw: the group lists its formats instead of the empty state', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWeekendWarriors(page);

    const body = await page.locator('body').innerText();
    expect(body).toContain('Saturday Nassau');
    expect(body).toContain('Skins with carryovers');
    // The empty state is what every seeded group showed before — the reason the feature looked
    // unbuilt when it was only un-seeded.
    expect(body).not.toContain('No formats attached yet');
    await page.screenshot({ path: 'e2e/screenshots/ww-formats-listed.png', fullPage: true });
  });

  test('§5.aw: two taps from the group to a correctly pre-filled game', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWeekendWarriors(page);

    // TAP 1 — Casual round opens the picker (rather than going straight in on the group default,
    // which is what happens when a group has no attached formats).
    await page.getByText('Casual round').click();
    await expect(page.getByRole('heading', { name: 'Pick a format' })).toBeVisible();
    // Trying something new is always available — the escape hatch, not a dead end.
    await expect(page.getByText(/New \/ custom format/)).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/ww-format-picker.png', fullPage: true });

    // TAP 2 — the usual game.
    await page.getByRole('button', { name: 'Saturday Nassau' }).click();
    await page.waitForURL(/\/pool\/new/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    // §5.au: the wizard opens on the FIELD, centered on the group. At 61 members nobody is
    // pre-checked (Craig 2026-09-10) — pick today's players, then on to the game step.
    await expect(page.getByText(/Loaded “Weekend Warriors”/)).toBeVisible();
    await page.getByRole('button', { name: /Craig Hoelzer/ }).click();
    await page.getByRole('button', { name: /Jym Youngberg/ }).click();
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();

    // Everything the format stores has been applied: the mode, the Nassau legs, and the handicap
    // rules. This is the assertion that would catch a broken seed composition.
    // Assert on VALUES, not innerText. A <select>'s chosen option and an <input>'s value are not
    // page text — the first draft of this test read innerText and passed only when a stale wizard
    // draft happened to leave the same words visible elsewhere, so it failed once the audit spec
    // ran first. Values are what the format actually set.
    // With a format applied the name is the summary panel's editable TITLE (F-021), not the
    // "What should we call it?" field — that one only exists for a from-scratch game.
    await expect(page.getByLabel('Game style name')).toHaveValue('Saturday Nassau');
    // §5.av / F-080: the F-021 card IS the answer to "which game are you playing?" — the saved-style
    // select hides behind "Pick another style" so the format is named once, not twice.
    await expect(page.getByLabel('Saved game style')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start fresh' })).toBeVisible();
    // The stakes and the handicap rule now live in F-021's summary line rather than in 15 fields,
    // so read them there — that IS the confirmation the user sees.
    const summary = await page.locator('body').innerText();
    expect(summary).toContain('$10 / $10 / $20');
    expect(summary).toContain('off the low');

    // And the underlying fields still hold the format's values once revealed — the summary is a
    // view of the state, not a substitute for it. §5.bk: scoring and handicaps live one step on.
    await toScoringStep(page);
    await page.getByRole('button', { name: 'Change Game' }).click();
    // Two players make this a 1 v 1, so there's no team-format question (a side of one has one
    // ball); the format's hole score and compare-by are what show.
    await expect(page.getByRole('button', { name: 'Strokes' })).toHaveClass(/bg-green-600/);
    await expect(page.getByRole('button', { name: '18-hole total' })).toHaveClass(/bg-green-600/);
    await page.getByRole('button', { name: 'Change Handicaps' }).click();
    await expect(page.getByRole('button', { name: 'Off the low' }))
      .toHaveClass(/bg-green-700|bg-green-600/);
    await page.screenshot({ path: 'e2e/screenshots/ww-wizard-prefilled.png', fullPage: true });
  });

  // F-021 / §5.ax — an applied format CONFIRMS instead of re-asking.
  //
  // These replace a test that asserted the opposite: it pinned the 21-control state so the fix had
  // something to move. Inverted rather than deleted, so the diff shows the change.
  async function openSaturdayNassau(page: import('@playwright/test').Page) {
    await openWeekendWarriors(page);
    await page.getByText('Casual round').click();
    await page.getByRole('button', { name: 'Saturday Nassau' }).click();
    await page.waitForURL(/\/pool\/new/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    // §5.au: the wizard opens on the FIELD, centered on the group (nobody pre-checked at
    // 61 members); the format confirmation these tests measure is the game step, one tap on.
    await expect(page.getByText(/Loaded “Weekend Warriors”/)).toBeVisible();
    await page.getByRole('button', { name: /Craig Hoelzer/ }).click();
    await page.getByRole('button', { name: /Jym Youngberg/ }).click();
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await expect(page.getByText('How do you want to compete?')).toBeVisible();
  }

  const countScreen = (page: import('@playwright/test').Page) => page.evaluate(() => {
    const onScreen = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      controls: [...document.querySelectorAll('button, input, select, textarea')].filter(onScreen).length,
      labels: [...document.querySelectorAll('label')].filter(onScreen).filter((l) => (l.textContent ?? '').trim()).length,
      height: document.body.scrollHeight,
    };
  });

  test('F-021: an applied format shows a summary, not 15 questions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSaturdayNassau(page);

    // WAS 21 controls / 15 labels / 1906px. The point is that it now reads at a glance, and is
    // short enough that Next needs no scrolling on a phone.
    const counts = await countScreen(page);
    expect(counts.controls).toBeLessThan(14);
    expect(counts.labels).toBeLessThan(5);
    expect(counts.height).toBeLessThanOrEqual(900);

    // The summary states what moves money: game, format, stakes, handicap rule (§5.ax part 2).
    const body = await page.locator('body').innerText();
    expect(body).toContain('Your saved game style');
    expect(body).toContain('Sides · best ball');
    expect(body).toContain('$10 / $10 / $20');
    expect(body).toContain('off the low');
    await page.screenshot({ path: 'e2e/screenshots/f021-summary.png', fullPage: true });
  });

  test('F-021: nothing is hidden — each section reopens on its own', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSaturdayNassau(page);
    // §5.bk: the format's game and handicap sections live on the scoring step.
    await toScoringStep(page);

    await expect(page.getByRole('button', { name: 'Change Game' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change Handicaps' })).toBeVisible();

    // Per-section, not one button reopening all 15 — otherwise it is today's screen plus a tap.
    await page.getByRole('button', { name: 'Change Handicaps' }).click();
    let body = await page.locator('body').innerText();
    expect(body).toContain('How much handicap counts?');
    expect(body).not.toContain('How is the hole scored?');

    // And the revealed fields really are the same ones, still carrying the format's values.
    await page.getByRole('button', { name: 'Change Game' }).click();
    body = await page.locator('body').innerText();
    expect(body).toContain('How is the hole scored?');
    // Saturday Nassau scores in strokes and decides by total — the format's values, not defaults.
    // (Two players → a 1 v 1, which has no team-format question to show.)
    await expect(page.getByRole('button', { name: 'Strokes' })).toHaveClass(/bg-green-600/);
    await expect(page.getByRole('button', { name: '18-hole total' })).toHaveClass(/bg-green-600/);
  });

  test('F-021: editing a value invites a rename, and never rewrites the original', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSaturdayNassau(page);
    await toScoringStep(page);

    await page.getByRole('button', { name: 'Change Handicaps' }).click();
    await page.getByRole('button', { name: 'Full handicap' }).click();

    // The summary follows the edit...
    let body = await page.locator('body').innerText();
    expect(body).toContain('full handicap');
    expect(body).not.toContain('off the low');
    // ...and points at the rename rather than dead-ending in a badge.
    expect(body).toMatch(/Changed from your saved Saturday Nassau/);
    await page.screenshot({ path: 'e2e/screenshots/f021-edited.png', fullPage: true });

    // Renaming forks a new style, and the origin stays visible.
    await page.getByLabel('Game style name').fill('Saturday Big Nassau');
    body = await page.locator('body').innerText();
    expect(body).toContain('based on Saturday Nassau');
    expect(body).not.toMatch(/Changed from your saved/);

    // THE SAFETY PROPERTY (§5.ax part 4): the library entry is untouched. Formats attach to groups,
    // so rewriting one would change what the whole group sees next week.
    const rewroteLibrary = await page.evaluate(() =>
      Object.keys(sessionStorage)
        .filter((k) => k.includes('roster_groups'))
        .some((k) => (sessionStorage.getItem(k) ?? '').includes('Saturday Big Nassau')));
    expect(rewroteLibrary).toBe(false);
  });

  // §5.av — a saved format is a CHOICE AT THE GAME STEP, not a detour before it. The library
  // stored whole styles all along, but its only entry point was a button on /pool; the wizard's
  // game picker never offered them, so every round re-answered ~15 questions.
  test('§5.av: the game picker offers saved formats first, and one tap applies everything', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Seed the library (Weekend Warriors + three formats), then open the wizard DIRECTLY —
    // this is the path that does NOT start from a group, the one §5.av exists for.
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Groups — 61-member standing group' }).first();
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    // §5.au: the wizard opens on the field; the game picker is one tap on. Two players in.
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12']] as const) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();

    // Saved styles lead the picker; the raw modes follow under their own heading.
    // §5.bk: the saved styles are their own select on the structure step; the raw game types are
    // the structure rows below it (no container is ever named).
    const picker = page.locator('select').first();
    await expect(picker.locator('optgroup[label="Your saved games"] option')).toHaveCount(4);
    expect(await page.locator('body').innerText()).not.toContain('Pool (foursomes');

    // Choosing a format fills everything and lands on the F-021 confirmation, exactly as if
    // it had been applied from the library or the group page.
    await picker.selectOption('format:f-saturday-nassau');
    await expect(page.getByLabel('Game style name')).toHaveValue('Saturday Nassau');
    const body = await page.locator('body').innerText();
    expect(body).toContain('Your saved game style');
    expect(body).toContain('$10 / $10 / $20');
    expect(body).toContain('off the low');
    // F-080: the card is the confirmation — the select is gone, so the style's name shows once.
    await expect(page.getByLabel('Saved game style')).toHaveCount(0);
    expect(body).not.toContain('Or play a saved game style');
    await page.screenshot({ path: 'e2e/screenshots/5av-picker-format-applied.png', fullPage: true });

    // Starting fresh afterwards configures FRESH: the summary and the borrowed name go,
    // the ordinary form returns.
    await page.getByRole('button', { name: 'Start fresh' }).click();
    const after = await page.locator('body').innerText();
    expect(after).not.toContain('Your saved game style');
    expect(after).toContain('What should we call it?');
    await expect(page.getByLabel('Game style name')).toHaveCount(0);
  });

  test('§5.av: a classic-pool format switches an individual-mode wizard back to classic', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Groups — 61-member standing group' }).first();
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();
    // A format with NO gameMode is a classic team pool. applyGroupDefaults leaves gameMode
    // untouched when absent (right for player-groups), so the picker has to clear it itself —
    // this is the case that would otherwise inherit whatever mode was selected before.
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    // §5.au: walk past the field to reach the game picker.
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12']] as const) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    const picker = page.locator('select').first();
    await chooseStructure(page, 'solo');
    await picker.selectOption('format:f-classic-pool');
    await expect(page.getByLabel('Game style name')).toHaveValue('JY Classic Pool');
    // The format's structure replaces "everyone for themselves", so no skins options follow.
    await expect(page.locator('input[name="structure"][value="solo"]')).not.toBeChecked();
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Skins options');
  });

  test('F-021: a game built from SCRATCH is unchanged — no summary, all questions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForURL(/\/pool\/new/, { timeout: 15_000 });

    // §5.au: walk past the field to the game step.
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12']] as const) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();

    // No format applied: the step is exactly as it always was, including the name field that moves
    // into the summary panel when there IS one.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Your saved game style');
    expect(body).toContain('What should we call it?');
    // And the scoring step asks everything too — nothing collapsed into a summary.
    await toScoringStep(page);
    expect(await page.locator('body').innerText()).toContain('How much handicap counts?');
  });
});

// ---------------------------------------------------------------------------
// A 1 v 1 SINGLES MATCH (Craig, 2026-08-27)
// ---------------------------------------------------------------------------
//
// Craig, going through the flow: "what would i do for a 1 v 1 match?" — and the honest answer was
// nothing. The engine always handled it (a side of one is just a side of one, and the pairwise
// settlement treats it like any other), but `playersMin: 4` refused it in the wizard, so a singles
// Nassau — the most common two-player bet in golf — was inexpressible.
test.describe('a 1 v 1 singles match', () => {
  test('1v1: the board names the players and settles a real Nassau', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, '1 v 1 singles match');
    await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();

    const body = await page.locator('body').innerText();
    // Named after the players, with no "(solo)" suffix: in a 1v1 every row is one player, so the
    // suffix distinguishes nothing and reads like a bug report.
    expect(body).toMatch(/1\s+Jym\s+53/);
    expect(body).toMatch(/2\s+Craig\s+57/);
    expect(body).not.toContain('(solo)');
    expect(body).not.toContain('Side A');

    // The Nassau: three legs settling separately, which is the whole point.
    expect(body).toContain('Craig by 4');      // front
    expect(body).toMatch(/Jym by 8/);          // back
    // Zero-sum on screen.
    const money = [...body.matchAll(/([+−-])\$(\d+)/g)]
      .map(([, sign, n]) => (sign === '+' ? 1 : -1) * Number(n));
    expect(money.length).toBeGreaterThanOrEqual(2);
    expect(money.reduce((s, x) => s + x, 0)).toBe(0);

    await page.screenshot({ path: 'e2e/screenshots/oneone-board.png', fullPage: true });
  });

  test('1v1: the wizard offers Sides at two players and builds 1 vs 1', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForURL(/\/pool\/new/, { timeout: 15_000 });

    // §5.au: the field first — so the picker's fit badge is live on the FIRST pass.
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12']]) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await expect(page.getByText('How do you want to compete?')).toBeVisible();

    // Two players are OFFERED a 1 v 1 (§5.bk) — this is the row that didn't exist on the old
    // playersMin: 4.
    const picker = await page.locator('body').innerText();
    expect(picker).toContain('1 v 1');
    // And nothing calls it "within group" — F-019 falsified that, and at two players a 1v1 has
    // no group to be within (§5.at).
    expect(picker).not.toContain('within group');

    await page.getByPlaceholder('e.g. Saturday Pool').fill('Craig v Jym');
    await toScoringStep(page, 'teams:1+1');

    // F-079: a 1 v 1 has no teams to build — the structure decided membership — so tees go
    // straight to money with the two sides already made.
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Set Tees/ }).click();
    await expect(page.getByRole('button', { name: 'Next: Teams' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Next: Money' }).click();

    // The review step shows each player once — the heading used to repeat the name above its own
    // member list ("Craig" with "Craig" under it), which only showed up on screen.
    await expect(page.getByRole('heading', { name: /Review & create/ })).toBeVisible();
    const review = await page.locator('body').innerText();
    expect(review).toContain('Sides (1 vs 1)');
    expect(review).toMatch(/\$10 front/);
    expect((review.match(/Craig/g) ?? []).length).toBe(2);  // the game name + one row
    await page.screenshot({ path: 'e2e/screenshots/oneone-review.png', fullPage: true });
  });

  // A solo side AGAINST a pair keeps its "(solo)" marker — there it distinguishes something.
  test('1v1: a solo against a pair still says (solo)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const id = await seed(page, 'Three sides playing a POT (uneven 3/2/1)');
    await goToGame(page, id, '/leaderboard');
    await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();
    expect(await page.locator('body').innerText()).toContain('(solo)');
  });
});

// ---------------------------------------------------------------------------
// F-020 option C — the wizard PROPOSES splits instead of picking one
// ---------------------------------------------------------------------------
//
// `defaultSubTeams` special-cases exactly four players and otherwise alternates low/high, so five
// silently became 3 v 2 with nothing on screen admitting a choice had been made — when 3v2,
// 2v2-plus-a-solo and five singles are all legitimate and only the group knows which (§5.ao).
// §5.bk moved the question to the structure step; F-071 retired the sides step's second copy of
// it (F-078). The claims below are the same, asked where the wizard now asks them.
test.describe('F-020: the wizard proposes splits', () => {
  async function toTeamsStep(page: import('@playwright/test').Page, players: [string, string][]) {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
    await card.getByRole('button', { name: 'Seed' }).click();
    // Wait for the seed to land before clicking Open — without this the click can fire while the
    // button is still absent, and the test times out two steps later looking like a wizard bug.
    await expect(card.getByText('Seeded ✓')).toBeVisible();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForURL(/\/pool\/new/, { timeout: 15_000 });

    // §5.au: field → game → course → tees → [groups] → sides.
    for (const [nm, hcp] of players) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await page.getByPlaceholder('e.g. Saturday Pool').fill('Split Test');
    // §5.bk: the split is chosen on the structure step; five players take 2 + 2 + 1 here (3 + 2
    // is two teams that are their own groups, which builds with the foursome builder instead).
    await toScoringStep(page, players.length === 5 ? 'teams:2+2+1' : 'teams:2+2');
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Set Tees/ }).click();
    // F-071: one teams step for every split; five players then need tee groups (F-019).
    await page.getByRole('button', { name: 'Next: Teams' }).click();
    await expect(page.getByRole('heading', { name: 'Set Teams' })).toBeVisible();
  }

  test('F-020: five players are OFFERED the splits, not given one', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // §5.bk moved the question to the structure step: the shapes Craig named for five are all
    // on screen (§5.ao), the usual pre-selected, none applied silently.
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']] as const) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await expect(page.getByText('How do you want to compete?')).toBeVisible();
    await page.getByRole('button', { name: /Other split/ }).click();

    const body = await page.locator('body').innerText();
    expect(body).toContain('Two teams, 3 + 2');
    expect(body).toContain('Three teams, 2 + 2 + 1');
    expect(body).toContain('Four teams, 2 + 1 + 1 + 1');
    // The recommendation is 3 + 2 (§5.bk: 4–7 → two teams) — checked, with the others beside it.
    await expect(page.locator('input[name="structure"][value="teams:3+2"]')).toBeChecked();
    await page.screenshot({ path: 'e2e/screenshots/f020-side-splits.png', fullPage: true });
  });

  test('F-020: choosing 2 v 2 v 1 really makes three sides', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await toTeamsStep(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);

    // F-078: the structure step's answer is NOT asked again here.
    expect(await page.locator('body').innerText()).not.toContain('How do the sides split?');
    // The build follows the structure's sizes: three cards, the third a single.
    await buildTeams(page, 'list');
    await expect(page.getByLabel('Team 3 name')).toBeVisible();
    await expect(page.getByLabel('Team 4 name')).toHaveCount(0);
    const team3 = page.locator('div.bg-white', { has: page.getByLabel('Team 3 name') });
    await expect(team3.getByText('1 player', { exact: false })).toBeVisible();

    // And it carries through to the review step — the split is real, not just a label.
    await page.getByRole('button', { name: 'Next: Groups' }).click();
    await page.getByRole('button', { name: /Next: Review/ }).click();
    const review = await page.locator('body').innerText();
    expect(review).toContain('Sides (2 vs 2 vs 1)');
  });

  // An ordinary 2v2 must not gain a control, but four players DO have a choice: 2v2, 2+1+1 and
  // four singles are all honest answers (§5.ao's "only the group knows"), unlike tee groups where
  // four can only walk one way. The choice lives on the structure step (§5.bk) and nowhere else
  // (F-078) — this pins both halves.
  test('F-020: four players still get the choice (2v2 is not the only answer), asked ONCE', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    // The recent-course chips (Sandbox National) come from this seed.
    const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForURL(/\/pool\/new/, { timeout: 15_000 });
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16']] as const) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await expect(page.getByText('How do you want to compete?')).toBeVisible();
    // 2v2 is the recommendation, so it is the one checked; singles sit beside it, 2 + 1 + 1 under
    // "Other split…".
    await expect(page.locator('input[name="structure"][value="teams:2+2"]')).toBeChecked();
    await expect(page.getByText('Everyone for themselves')).toBeVisible();
    await page.getByRole('button', { name: /Other split/ }).click();
    expect(await page.locator('body').innerText()).toContain('Three teams, 2 + 1 + 1');
    // Forward: the teams step does not ask the same question a second time.
    await page.getByPlaceholder('e.g. Saturday Pool').fill('Split Test');
    await toScoringStep(page);
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Set Tees/ }).click();
    await page.getByRole('button', { name: 'Next: Teams' }).click();
    await expect(page.getByRole('heading', { name: 'Set Teams' })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toContain('How do the sides split?');
  });

  // A custom team name is identity (game-modes/sides.ts) and reaches the review — F-014's payoff,
  // now typed on the team card itself (F-071). The old "survives a reshape on the sides step"
  // claim retired with that step: a reshape is a structure change, which rebuilds the teams.
  test('F-020: a team named on the teams step is named on the review', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await toTeamsStep(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);
    await buildTeams(page, 'even');
    // The placeholder promises what the board will say if the box stays blank.
    await expect(page.getByLabel('Team 1 name')).toHaveAttribute('placeholder', /&/);
    await page.getByLabel('Team 1 name').fill('The Hogs');

    await page.getByRole('button', { name: 'Next: Groups' }).click();
    await page.getByRole('button', { name: /Next: Review/ }).click();
    const review = await page.locator('body').innerText();
    expect(review).toContain('The Hogs');
  });
});

// ---------------------------------------------------------------------------
// F-019 — a group that outgrew its tee slot: PROMPT, defaulting to keep
// ---------------------------------------------------------------------------
//
// Craig's call: adding a 5th to an already-scored group of four must PROMPT, pre-set to keep, and
// never silently re-split a round being scored. Scores are untouched whichever way it goes.
