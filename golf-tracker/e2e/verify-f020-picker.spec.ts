// Split out of verify-fixes.spec.ts on 2026-09-15 (§5.bj harness round 2).
// Covers the F-020 era: the game picker annotating fit, a group offering the formats
// it plays (§5.aw), a 1v1 singles match, and the sides step proposing splits.
// Verbatim moves — test titles and assertions unchanged. Shared plumbing: ./helpers.

import { expect, test } from '@playwright/test';
import { BASE, resetBackend, seed, goToGame } from './helpers';

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
    await expect(page.getByText('Which game are you playing?')).toBeVisible();
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
    // Five players: a side game fits (4–8); the 2–4 and 3–4 modes don't.
    expect(body).toMatch(/Sides \/ Match — ✓ 5 players/);
    expect(body).toMatch(/Skins — 1 too many/);
    // Wolf needs EXACTLY four, so it states the requirement rather than a delta — "1 too many"
    // reads as though dropping a player is the fix, and at three the fix is the opposite.
    expect(body).toMatch(/Wolf — needs exactly 4/);
    await page.screenshot({ path: 'e2e/screenshots/f020-annotated.png', fullPage: true });
  });

  test('F-020: picking a game that cannot work explains it HERE, and names one that can', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startWizard(page);
    await buildField(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);

    // Select by VALUE — labels now carry the fit badge.
    await page.locator('select').first().selectOption('wolf');
    const body = await page.locator('body').innerText();

    // The constraint, at the moment of choosing.
    expect(body).toContain('Wolf needs exactly 4 players — you have 5.');
    // With an alternative attached, so it's guidance rather than a dead end (§5.ao).
    expect(body).toMatch(/This one fits 5: Sides \/ Match/);
    // And it does NOT send them back a step — that was the old copy's whole problem.
    expect(body).not.toMatch(/go back/i);
    await page.screenshot({ path: 'e2e/screenshots/f020-wolf-misfit.png', fullPage: true });

    // F-041: "Stableford" names a SCORING SYSTEM, not just the 2–4 player individual mode —
    // and the pool scores any field Stableford. The misfit note must redirect to that, not
    // read as "this app can't play Stableford with 5".
    await page.locator('select').first().selectOption('stableford-ind');
    const body2 = await page.locator('body').innerText();
    expect(body2).toMatch(/5 players can still score Stableford — as a team Pool/);
  });

  // F-019 falsified two strings that claimed a side game is played "within a single group". A side
  // game can now be 8 players across two tee times, so nothing may claim how the field walks.
  test('F-020: no screen claims a side game is played in a single group', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startWizard(page);
    await buildField(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);
    await page.locator('select').first().selectOption('team-2v2');

    const picker = await page.locator('body').innerText();
    expect(picker).not.toMatch(/single group/i);
    // 2–8 since a singles match became reachable (2026-08-27) — the sentence states what the game
    // needs and never how the field walks.
    expect(picker).toContain('For 2–8 players.');

    // And the review step, which said "is played in a single group of 4–4 players".
    await pickCourse(page);
    await page.getByRole('button', { name: 'Next: Groups' }).click();
    await page.getByRole('button', { name: 'Next: Sides' }).click();
    await page.getByRole('button', { name: /Next: Review/ }).click();
    const review = await page.locator('body').innerText();
    expect(review).not.toMatch(/single group/i);
    expect(review).not.toMatch(/go back to field/i);
  });

  // F-036: growing the side count in ONE reshape must mint distinct ids. The builder used to
  // derive each new id from a slice of the OLD sides array, so 2 sides reshaped to 4 produced
  // A, B, C, C — and a player tapped onto "C" joined two money sides at once.
  test('F-036: reshaping 8 players to 2v2v2v2 yields four DISTINCT sides', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startWizard(page);
    await buildField(page, [
      ['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'],
      ['Sam', '6'], ['Tony', '10'], ['Bill', '14'], ['Walt', '18'],
    ]);
    await page.locator('select').first().selectOption('team-2v2');
    await pickCourse(page);
    await page.getByRole('button', { name: 'Next: Groups' }).click();
    await page.getByRole('button', { name: 'Next: Sides' }).click();

    // F-037: the step names the GAME it makes, not just the mechanism — before the reshape
    // it's a 4 v 4 match, and the sentence tracks the data.
    await expect(page.getByText(/This makes it a 4 v 4 match/)).toBeVisible();

    // The field starts on the default two sides; jump straight to four.
    await expect(page.getByText('How do the sides split?')).toBeVisible();
    await page.getByRole('button', { name: /^2 v 2 v 2 v 2/ }).click();
    await expect(page.getByRole('heading', { name: /Sides \(2 vs 2 vs 2 vs 2\)/ })).toBeVisible();
    await expect(page.getByText(/This makes it a 2 v 2 v 2 v 2 game — 4 sides/)).toBeVisible();

    // Each player's row offers exactly A B C D — no letter twice, no letter missing.
    // Match the single-letter side buttons only: the row also carries the F-043
    // handicap-chain chip, which is a button too.
    const firstRow = page.locator('div.divide-y > div').first();
    const letters = await firstRow.getByRole('button', { name: /^[A-Z]$/ }).allInnerTexts();
    expect(letters).toEqual(['A', 'B', 'C', 'D']);
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
    // §5.av: the game picker now NAMES the applied format — it IS the answer to
    // "which game are you playing?" — rather than showing the underlying mode.
    await expect(page.locator('select').first()).toHaveValue('format:f-saturday-nassau');
    // The stakes and the handicap rule now live in F-021's summary line rather than in 15 fields,
    // so read them there — that IS the confirmation the user sees.
    const summary = await page.locator('body').innerText();
    expect(summary).toContain('$10 / $10 / $20');
    expect(summary).toContain('off the low');

    // And the underlying fields still hold the format's values once revealed — the summary is a
    // view of the state, not a substitute for it.
    await page.getByRole('button', { name: 'Change Game' }).click();
    await expect(page.getByLabel('Money', { exact: true })).toHaveValue('legs');
    await expect(page.getByLabel('Front 9 ($)')).toHaveValue('10');
    await expect(page.getByLabel('Back 9 ($)')).toHaveValue('10');
    await expect(page.getByLabel('Overall 18 ($)')).toHaveValue('20');
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
    await expect(page.getByText('Which game are you playing?')).toBeVisible();
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

    await expect(page.getByRole('button', { name: 'Change Game' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change Handicaps' })).toBeVisible();

    // Per-section, not one button reopening all 15 — otherwise it is today's screen plus a tap.
    await page.getByRole('button', { name: 'Change Handicaps' }).click();
    let body = await page.locator('body').innerText();
    expect(body).toContain('How much handicap counts?');
    expect(body).not.toContain('Team format');

    // And the revealed fields really are the same ones, still carrying the format's values.
    await page.getByRole('button', { name: 'Change Game' }).click();
    body = await page.locator('body').innerText();
    expect(body).toContain('Team format');
    await expect(page.getByLabel('Front 9 ($)')).toHaveValue('10');
  });

  test('F-021: editing a value invites a rename, and never rewrites the original', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSaturdayNassau(page);

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
    const picker = page.locator('select').first();
    await expect(picker.locator('optgroup[label="Your saved games"] option')).toHaveCount(4);
    await expect(picker.locator('optgroup[label="Start a new style"] option', { hasText: 'Pool (foursomes' })).toHaveAttribute('value', 'pool');

    // Choosing a format fills everything and lands on the F-021 confirmation, exactly as if
    // it had been applied from the library or the group page.
    await picker.selectOption('format:f-saturday-nassau');
    await expect(page.getByLabel('Game style name')).toHaveValue('Saturday Nassau');
    const body = await page.locator('body').innerText();
    expect(body).toContain('Your saved game style');
    expect(body).toContain('$10 / $10 / $20');
    expect(body).toContain('off the low');
    await page.screenshot({ path: 'e2e/screenshots/5av-picker-format-applied.png', fullPage: true });

    // Choosing a raw mode afterwards configures FRESH: the summary and the borrowed name go,
    // the ordinary form returns.
    await picker.selectOption('skins');
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
    await picker.selectOption('skins');
    await picker.selectOption('format:f-classic-pool');
    await expect(page.getByLabel('Game style name')).toHaveValue('JY Classic Pool');
    // The classic pool's own controls are what follows, not the skins options.
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
    expect(body).toContain('How much handicap counts?');
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
    await expect(page.getByText('Which game are you playing?')).toBeVisible();

    // The mode must say it FITS two players. This is the assertion that fails on the old
    // playersMin: 4.
    const picker = await page.locator('body').innerText();
    expect(picker).toMatch(/Sides \/ Match — ✓ 2 players/);
    // And the mode no longer calls itself "within group" — F-019 falsified that, and at two
    // players a 1v1 has no group to be within (§5.at).
    expect(picker).not.toContain('within group');

    await page.getByPlaceholder('e.g. Saturday Pool').fill('Craig v Jym');
    await page.locator('select').first().selectOption('team-2v2');

    // Forward to the sides step: 1 vs 1, seeded one player each, and no split chooser because
    // 1v1 is the only shape two players can take.
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Set Tees/ }).click();
    await page.getByRole('button', { name: 'Next: Sides' }).click();
    await expect(page.getByRole('heading', { name: /Sides \(1 vs 1\)/ })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toContain('How do the sides split?');
    await page.screenshot({ path: 'e2e/screenshots/oneone-sides.png', fullPage: true });

    // The review step shows each player once — the heading used to repeat the name above its own
    // member list ("Craig" with "Craig" under it), which only showed up on screen.
    await page.getByRole('button', { name: /Next: Review/ }).click();
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
// F-020 option C — the sides step PROPOSES splits instead of picking one
// ---------------------------------------------------------------------------
//
// `defaultSubTeams` special-cases exactly four players and otherwise alternates low/high, so five
// silently became 3 v 2 with nothing on screen admitting a choice had been made — when 3v2,
// 2v2-plus-a-solo and five singles are all legitimate and only the group knows which (§5.ao).
test.describe('F-020: the sides step proposes splits', () => {
  async function toSidesStep(page: import('@playwright/test').Page, players: [string, string][]) {
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
    await page.locator('select').first().selectOption('team-2v2');
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Set Tees/ }).click();
    // Five players need tee groups (F-019), so the path runs through the Groups step.
    const viaGroups = players.length > 4;
    await page.getByRole('button', { name: viaGroups ? 'Next: Groups' : 'Next: Sides' }).click();
    if (viaGroups) await page.getByRole('button', { name: 'Next: Sides' }).click();
  }

  test('F-020: five players are OFFERED the splits, not given one', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await toSidesStep(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);

    await expect(page.getByText('How do the sides split?')).toBeVisible();
    const body = await page.locator('body').innerText();
    // The shapes Craig named for five, all on screen (§5.ao).
    expect(body).toContain('3 v 2');
    expect(body).toContain('2 v 2 v 1');
    expect(body).toContain('1 v 1 v 1 v 1 v 1');

    // A PRE-EXISTING BUG THE SCREENSHOT EXPOSED. The heading hard-coded "(2 vs 2)" for any
    // two-side game — true while two sides meant two pairs, and a lie the moment an uneven split
    // was reachable. Five players seeded 3–2 read "Sides (2 vs 2)" directly above a highlighted
    // "3 v 2" button. It now counts the sides from the data.
    await expect(page.getByRole('heading', { name: /Sides \(3 vs 2\)/ })).toBeVisible();
    expect(body).not.toContain('Sides (2 vs 2)');
    await page.screenshot({ path: 'e2e/screenshots/f020-side-splits.png', fullPage: true });
  });

  test('F-020: choosing 2 v 2 v 1 really makes three sides', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await toSidesStep(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);

    await page.getByRole('button', { name: /2 v 2 v 1/ }).click();
    // The heading counts the sides, so it must now read 2 vs 2 vs 1.
    await expect(page.getByRole('heading', { name: /Sides \(2 vs 2 vs 1\)/ })).toBeVisible();
    // Three assignment buttons per player: A, B, C.
    // The sides-step row is flex-wrap (F-043: the handicap chain panel wraps under it).
    const firstRow = page.locator('div.flex.flex-wrap.items-center', { hasText: 'Craig' }).first();
    await expect(firstRow.getByRole('button', { name: 'C', exact: true })).toBeVisible();

    // And it carries through to the review step — the split is real, not just a label.
    await page.getByRole('button', { name: /Next: Review/ }).click();
    const review = await page.locator('body').innerText();
    expect(review).toContain('Sides (2 vs 2 vs 1)');
  });

  // An ordinary 2v2 must not gain a control: with four players the honest options are 2v2, 2+1+1
  // and four singles — so the chooser DOES appear. Four is the case where §5.ao's "only the group
  // knows" still applies, unlike tee groups where four can only walk one way. This test pins the
  // distinction so nobody "simplifies" it away by copying the Groups step's rule.
  test('F-020: four players still get the choice (2v2 is not the only answer)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await toSidesStep(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16']]);
    await expect(page.getByText('How do the sides split?')).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).toContain('2 v 2');
    expect(body).toContain('1 v 1 v 1 v 1');
    // 2v2 is the seeded default, so it is the one highlighted.
    await expect(page.getByRole('heading', { name: /Sides \(2 vs 2\)/ })).toBeVisible();
  });

  // A custom side name is identity, and the ids are identity too (game-modes/sides.ts) — reshaping
  // must not silently relabel a money row.
  test('F-020: a named side keeps its name across a reshape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await toSidesStep(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);

    await page.getByRole('button', { name: /Name the sides/ }).click();
    await page.getByLabel('Side A').fill('The Hogs');
    // Reshape AFTER naming.
    await page.getByRole('button', { name: /2 v 2 v 1/ }).click();

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
