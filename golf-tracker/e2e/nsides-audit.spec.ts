// AUDIT pass for "did N sides make the ordinary 2v2 worse?" (NEXT_SESSION_PROMPT.md).
//
// These tests exist to SEE and COUNT, not to assert correctness. They walk the
// ordinary two-guys-against-two-guys setup end to end on a phone viewport,
// screenshot every screen, and print the number of visible controls per screen so
// "minimum exposed complexity" can be measured rather than asserted.
//
// Assertions are deliberately minimal — just enough to prove the screen actually
// rendered, per the vacuous-test lesson in AGENTS.md.

import { expect, test, type Page } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';
const PHONE = { width: 390, height: 844 };

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
});

async function seedAndOpen(page: Page, label: string) {
  await page.goto(`${BASE}/sandbox`);
  const card = page.locator('div.bg-white', { hasText: label });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await card.getByRole('button', { name: 'Open →' }).click();
  await page.waitForLoadState('networkidle');
}

// What a golfer actually SEES on this screen: every control that is on the page and
// not hidden, plus the visible field labels. Counting the DOM alone overstates it
// (hidden inputs) and understates the cost of a label-per-row layout.
async function countScreen(page: Page, name: string) {
  const counts = await page.evaluate(() => {
    const onScreen = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const ctrls = [...document.querySelectorAll('button, input, select, textarea')].filter(onScreen);
    const labels = [...document.querySelectorAll('label')]
      .filter(onScreen)
      .map((l) => (l.textContent ?? '').trim())
      .filter(Boolean);
    return {
      buttons: ctrls.filter((c) => c.tagName === 'BUTTON').length,
      fields: ctrls.filter((c) => c.tagName !== 'BUTTON').length,
      labels,
      scrollHeight: document.body.scrollHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  await page.screenshot({ path: `e2e/screenshots/audit-${name}.png`, fullPage: true });
  console.log(
    `\n##### ${name} #####\n` +
    `controls: ${counts.buttons} buttons + ${counts.fields} fields = ${counts.buttons + counts.fields}\n` +
    `page height: ${counts.scrollHeight}px   h-overflow: ${counts.overflow}px\n` +
    `labels (${counts.labels.length}): ${counts.labels.join(' | ')}\n`,
  );
  const body = (await page.locator('body').innerText()).replace(/\n{3,}/g, '\n\n');
  console.log(`----- ${name} text -----\n${body}\n`);
  return counts;
}

// Walk the wizard to the Details step with a course already available as a chip,
// so no GHIN call is ever needed.
async function openWizard(page: Page) {
  await page.setViewportSize(PHONE);
  await seedAndOpen(page, 'Past games (for recent-course chips)');
  await page.waitForURL(/\/pool\/new/);
  await expect(page.getByText('What are you playing?')).toBeVisible();
}

test.describe('the ORDINARY 2v2 — two guys against two guys, best ball, usual money', () => {
  test('walk it from empty state to playing, counting taps and options', async ({ page }) => {
    const taps: string[] = [];
    const tap = async (what: string, fn: () => Promise<void>) => { taps.push(what); await fn(); };

    await openWizard(page);

    // --- Step 1: Details, BEFORE picking the game -------------------------------
    await countScreen(page, '01-details-default-pool');

    await tap('type game name', async () => {
      await page.getByPlaceholder('e.g. Saturday Pool').fill('Saturday 2v2');
    });

    // Pick the side game. This is the mode that was renamed from "2 vs 2 (within
    // group)" to "Sides (within group)" to "Sides / Match" (F-019 + 1v1). Select by VALUE so a
    // future rename can't break this, and because F-020 appends a fit badge to the labels.
    const gamePicker = page.locator('select').first();
    console.log(`\nGAME PICKER OPTIONS: ${(await gamePicker.locator('option').allInnerTexts()).join(' | ')}\n`);
    await tap('choose the side game', async () => {
      await gamePicker.selectOption('team-2v2');
    });

    // --- Step 1: Details, AFTER picking the side game --------------------------
    // This is the F-014 measurement: how many controls does an ordinary 2v2 show?
    const details = await countScreen(page, '02-details-side-game');

    // Side names left this screen entirely (F-014). They were six static settings keys, of which
    // the wizard hid four and showed two always-blank boxes; they now live in the Sides editor,
    // one field per side that exists. So step 1 asks about NO names at all.
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
      await expect(page.getByLabel(`Side ${letter} name`)).toHaveCount(0);
    }

    await tap('Next: Select Course', async () => {
      await page.getByRole('button', { name: /Next: Select Course/ }).click();
    });

    // --- Step 2: Course --------------------------------------------------------
    await countScreen(page, '03-course');
    await tap('pick a recent course chip', async () => {
      await page.getByRole('button', { name: /Sandbox National|Pebble|Bay Hill/ }).first().click();
    });
    await countScreen(page, '04-course-picked');
    await tap('Next: Add Players', async () => {
      await page.getByRole('button', { name: /Next: Add Players/ }).click();
    });

    // --- Step 3: Field ---------------------------------------------------------
    await countScreen(page, '05-field-empty');
    // Four players, added the way a group with no GHIN would: name + handicap.
    const four = [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16']];
    for (const [nm, hcp] of four) {
      await tap(`add ${nm}`, async () => {
        await page.getByPlaceholder('Name', { exact: true }).fill(nm);
        await page.getByPlaceholder('HCP').fill(hcp);
        // The manual-add "Add" sits next to the HCP box; the GHIN-# one is above.
        await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
      });
    }
    await countScreen(page, '06-field-four');
    // §5.al: in a SIDE game these buttons say "Sides", matching the step they lead to. They
    // used to say "Set Teams" then "Teams" on the way to a step labelled "Sides".
    await expect(page.getByRole('button', { name: 'Next: Set Sides' })).toBeVisible();
    await tap('Next: Set Sides', async () => {
      await page.getByRole('button', { name: 'Next: Set Sides' }).click();
    });

    // --- Step 4: Tees ----------------------------------------------------------
    await countScreen(page, '07-tees');
    await tap('Next: Sides', async () => {
      await page.getByRole('button', { name: 'Next: Sides' }).click();
    });

    // --- Step 5: Sides ---------------------------------------------------------
    // The step the N-sides work changed: it gained "+ Add a side", and F-014 moved the name
    // fields here behind a closed disclosure.
    const sides = await countScreen(page, '08-sides');
    const sidesHeading = await page.getByRole('heading', { level: 2 }).innerText();
    console.log(`\nSIDES STEP heading says: ${sidesHeading}\n`);
    expect(sidesHeading).toMatch(/Sides/);

    // Names are available but CLOSED, so an ordinary 2v2 never sees a name field. That's the
    // "minimum exposed complexity" half of the north star: the capability costs nothing until
    // it's asked for.
    await expect(page.getByRole('button', { name: /Name the sides/ })).toBeVisible();
    await expect(page.getByLabel('Side A')).toHaveCount(0);
    await page.getByRole('button', { name: /Name the sides/ }).click();
    // Opened: exactly two fields for a two-side game, not six.
    await expect(page.getByLabel('Side A')).toBeVisible();
    await expect(page.getByLabel('Side B')).toBeVisible();
    await expect(page.getByLabel('Side C')).toHaveCount(0);
    await countScreen(page, '08b-sides-names-open');
    await page.getByRole('button', { name: /Name the sides/ }).click();   // close again

    await tap('Next: Review & Create', async () => {
      await page.getByRole('button', { name: /Next: Review/ }).click();
    });

    // --- Step 6: Money / review ------------------------------------------------
    await countScreen(page, '09-review');
    await tap('Create', async () => {
      await page.getByRole('button', { name: /Create/ }).last().click();
    });

    // --- The hub ---------------------------------------------------------------
    await page.waitForURL(/\/pool\/[0-9a-f-]+$/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await countScreen(page, '10-hub-two-sides');

    console.log(`\n===== TAP COUNT for the ordinary 2v2: ${taps.length} =====`);
    taps.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    console.log(
      `\nDETAILS step (step 1) after picking the side game: ` +
      `${details.buttons + details.fields} controls, ${details.labels.length} labels\n` +
      `SIDES step: ${sides.buttons + sides.fields} controls\n`,
    );
  });
});

test.describe('the hub settings panel — where F-014 suspects the real exposure is', () => {
  // F-014 step 2: count the hub's settings panel at TWO sides and at THREE.
  test('two sides: how many settings does the hub show?', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seedAndOpen(page, '2v2 best ball — mid-round');
    await page.waitForURL(/\/pool\/[0-9a-f-]+$/);
    await countScreen(page, '11-hub-2side-collapsed');

    // Open whatever discloses the settings editor.
    const opener = page.getByRole('button', { name: /Settings|Game settings|Format|Edit/ }).first();
    if (await opener.count()) {
      await opener.click();
      await page.waitForTimeout(400);
    }
    await countScreen(page, '12-hub-2side-settings');
    for (const letter of ['C', 'D', 'E', 'F']) {
      await expect(page.getByLabel(`Side ${letter} name`)).toHaveCount(0);
    }
  });

  test('three sides: how many settings does the hub show?', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seedAndOpen(page, 'Three sides in one group');
    // This seed opens the leaderboard; the hub is one hop up.
    await page.waitForURL(/\/pool\/[0-9a-f-]+\/leaderboard/);
    await countScreen(page, '13-leaderboard-3side');
    await page.goto(page.url().replace('/leaderboard', ''));
    await page.waitForLoadState('networkidle');
    await countScreen(page, '14-hub-3side-collapsed');

    const opener = page.getByRole('button', { name: /Settings|Game settings|Format|Edit/ }).first();
    if (await opener.count()) {
      await opener.click();
      await page.waitForTimeout(400);
    }
    const s3 = await countScreen(page, '15-hub-3side-settings');
    console.log(`\nHUB at 3 sides: ${s3.buttons + s3.fields} controls, ${s3.labels.length} labels\n`);
  });
});

test.describe('the 3-side game on the surfaces that matter', () => {
  test('capture the scorecard for a 3-side game', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seedAndOpen(page, 'Three sides in one group');
    await page.waitForURL(/leaderboard/);
    await page.goto(page.url().replace('/leaderboard', ''));
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Enter Scores' }).click();
    await page.waitForURL(/\/game\/play/);
    await page.waitForLoadState('networkidle');
    await countScreen(page, '16-scorecard-3side');
    // F-013 claims the card now draws ONE ROW PER SIDE from the engine.
    const body = await page.locator('body').innerText();
    for (const side of ['Craig & Jym', 'Dave & Rick', 'Sam & Tony']) {
      console.log(`card mentions "${side}": ${body.includes(side)}`);
    }
  });

  test('capture the pot board for three uneven sides', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seedAndOpen(page, 'Three sides playing a POT');
    await page.waitForURL(/leaderboard/);
    await countScreen(page, '17-pot-3side-uneven');
  });
});
