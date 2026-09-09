// EXPLORATORY user walk for the critique loop (UI_CRITIQUE_PROCESS.md steps 1-3).
// Imitates a first-time user across the flows Craig asked about: different
// games/setups, starting from a group, adding players from groups, creating a
// new group. Captures screenshots + rendered text; findings go to FINDINGS.md.
//
// Deliberately tolerant: a step that can't find its control logs and screenshots
// instead of failing, because "I couldn't find the button" IS the finding.

import { test } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
});

async function capture(page: import('@playwright/test').Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `e2e/screenshots/walk-${name}.png`, fullPage: true });
  const text = (await page.locator('body').innerText()).replace(/\n{3,}/g, '\n\n');
  console.log(`\n===== walk-${name} =====\n${text}\n`);
}

async function seed(page: import('@playwright/test').Page, label: string, open = true) {
  await page.goto(`${BASE}/sandbox`);
  const card = page.locator('div.bg-white', { hasText: label });
  await card.getByRole('button', { name: 'Seed' }).click();
  await card.getByText('Seeded ✓').waitFor();
  if (open) {
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForLoadState('networkidle');
  }
}

test('walk 1: cold start — home, empty, then the wizard with NO group', async ({ page }) => {
  await page.goto(`${BASE}/home`);
  // Cold /home with no identity = the GHIN sign-in wall. Capture it (it IS the
  // first-timer's first screen), then seed the minimal identity the same way the
  // other walks do and come back.
  await capture(page, '01-home-cold');
  await seed(page, 'Past games (for recent-course chips)', false);
  await page.goto(`${BASE}/home`);
  await capture(page, '01b-home-with-identity');

  // The primary CTA.
  await page.getByText('New game', { exact: true }).click();
  await page.waitForURL(/\/pool\/new/);
  await capture(page, '02-wizard-step1-cold');

  // Fill the minimum and keep walking like someone who doesn't read.
  await page.getByPlaceholder('e.g. Saturday Pool').fill('Sunday Skins');
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await capture(page, '03-wizard-course');

  const sandboxCourse = page.getByRole('button', { name: /Sandbox National/ }).first();
  if (await sandboxCourse.count()) {
    await sandboxCourse.click();
  } else {
    // What does a user with no recent courses see?
    await capture(page, '03b-wizard-course-empty');
  }
  await page.getByRole('button', { name: /Next: Add Players/ }).click();
  await capture(page, '04-wizard-players-empty');

  // Add four by hand.
  for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16']] as const) {
    await page.getByPlaceholder('Name', { exact: true }).fill(nm);
    await page.getByPlaceholder('HCP').fill(hcp);
    await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
  }
  await capture(page, '05-wizard-players-four');

  // Go back to step 1 to pick skins (the F-020 annotated picker).
  await page.getByRole('button', { name: /Back/ }).first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Back/ }).first().click();
  await page.getByText('Which game are you playing?').waitFor();
  await capture(page, '06-wizard-picker-annotated');
  {
    // Option labels carry the F-020 fit annotation ("Skins — ✓ 4 players"), so
    // match by prefix rather than exact label.
    const sel = page.locator('select').first();
    const opts = await sel.locator('option').allInnerTexts();
    console.log('PICKER OPTIONS:', JSON.stringify(opts));
    const skins = opts.find((o) => /^skins/i.test(o.trim()));
    if (skins) await sel.selectOption({ label: skins });
  }
  await capture(page, '07-wizard-picked-skins');

  // Walk forward to money/review.
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  await page.getByRole('button', { name: /Next: Add Players/ }).click();
  const nextBtns = page.getByRole('button', { name: /^Next: / });
  for (let i = 0; i < 4; i++) {
    if (!(await nextBtns.count())) break;
    const first = nextBtns.first();
    const label = await first.innerText();
    if (await first.isDisabled()) {
      console.log(`NEXT DISABLED at "${label}" — capturing and stopping`);
      await capture(page, `08-wizard-next-disabled-${i}`);
      break;
    }
    await first.click();
    await page.waitForTimeout(300);
    await capture(page, `08-wizard-after-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
    if (/review|create/i.test(label)) break;
  }

  const create = page.getByRole('button', { name: /Create Game/ });
  if (await create.count()) {
    await create.click();
    await page.waitForURL(/\/pool\/[^/]+$/, { timeout: 10_000 }).catch(() => {});
    await capture(page, '09-game-hub-after-create');
  }
});

test('walk 2: the group path — group page, one-tap format, confirmation', async ({ page }) => {
  await seed(page, 'Groups — 61-member standing group');
  await capture(page, '10-groups-landing');

  // Open the small crew (more realistic than the 61-member monster).
  const crew = page.getByText(/crew/i).first();
  if (await crew.count()) {
    await crew.click();
    await page.waitForTimeout(400);
  }
  await capture(page, '11-group-page');

  // The §5.aw one-tap: a listed format.
  const format = page.getByText(/Nassau|format/i).first();
  if (await format.count()) {
    await format.click();
    await page.waitForTimeout(600);
    await capture(page, '12-after-format-tap');
  }
});

test('walk 3: add players FROM a group inside the wizard', async ({ page }) => {
  await seed(page, 'Groups — 61-member standing group', false);
  await page.goto(`${BASE}/pool/new`);
  await page.getByPlaceholder('e.g. Saturday Pool').fill('From The Group');
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  const sandboxCourse = page.getByRole('button', { name: /Sandbox National/ }).first();
  if (await sandboxCourse.count()) await sandboxCourse.click();
  await page.getByRole('button', { name: /Next: Add Players/ }).click();
  await capture(page, '13-wizard-players-with-groups-available');

  // Whatever affordance exists for pulling a saved group in, use it.
  const groupBtn = page.getByRole('button', { name: /group/i }).first();
  if (await groupBtn.count()) {
    await groupBtn.click();
    await page.waitForTimeout(400);
    await capture(page, '14-wizard-group-picker-open');
    // Pick the first group offered.
    const firstGroup = page.locator('button', { hasText: /crew|warriors/i }).first();
    if (await firstGroup.count()) {
      await firstGroup.click();
      await page.waitForTimeout(400);
      await capture(page, '15-wizard-after-group-applied');
    }
  } else {
    console.log('NO GROUP AFFORDANCE FOUND on Add Players step');
  }
});

test('walk 4: classic pool with teams — captains, deal, teams step', async ({ page }) => {
  await seed(page, 'Past games (for recent-course chips)', false);
  await page.goto(`${BASE}/pool/new`);
  await page.getByPlaceholder('e.g. Saturday Pool').fill('Saturday Pool');
  await page.getByRole('button', { name: /Next: Select Course/ }).click();
  const sandboxCourse = page.getByRole('button', { name: /Sandbox National/ }).first();
  if (await sandboxCourse.count()) await sandboxCourse.click();
  await page.getByRole('button', { name: /Next: Add Players/ }).click();
  const eight: [string, string][] = [
    ['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'],
    ['Sam', '6'], ['Pete', '14'], ['Tony', '10'], ['Gil', '18'],
  ];
  for (const [nm, hcp] of eight) {
    await page.getByPlaceholder('Name', { exact: true }).fill(nm);
    await page.getByPlaceholder('HCP').fill(hcp);
    await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
  }
  await capture(page, '16-pool-eight-players');

  // Forward through tees to the Teams step. Next is DISABLED on the teams step
  // until teams are built, so build with the captains' deal when we see it.
  for (let i = 0; i < 4; i++) {
    const deal = page.getByRole('button', { name: /Captains. deal/i });
    if (await deal.count()) {
      await capture(page, '17-pool-teams-step-before-build');
      await deal.click();
      await page.waitForTimeout(400);
      await capture(page, '18-pool-after-captains-deal');
      break;
    }
    const next = page.getByRole('button', { name: /^Next: / }).first();
    if (!(await next.count())) break;
    const label = await next.innerText();
    if (await next.isDisabled()) {
      console.log(`NEXT DISABLED at "${label}" — capturing and stopping`);
      await capture(page, `17-pool-next-disabled-${i}`);
      break;
    }
    await next.click();
    await page.waitForTimeout(300);
    await capture(page, `17-pool-step-${i}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
  }
});

test('walk 5: roster — create a NEW group, save players', async ({ page }) => {
  await page.goto(`${BASE}/pool/roster`);
  await capture(page, '19-roster-cold');

  // Try to create a group from an empty roster — what does a first-timer see?
  const newGroup = page.getByRole('button', { name: /new group|add group|create group|\+ group/i }).first();
  if (await newGroup.count()) {
    await newGroup.click();
    await page.waitForTimeout(400);
    await capture(page, '20-roster-new-group');
  } else {
    console.log('NO CREATE-GROUP AFFORDANCE FOUND on roster');
  }
});

test('walk 6: continue — reopen a mid-round game and enter a score', async ({ page }) => {
  await seed(page, 'Classic pool — 2 foursomes, mid-round (thru 6)');
  await capture(page, '21-hub-mid-round');

  // The most important tap on the hub: get back to scoring.
  const scoreBtn = page.getByRole('button', { name: /enter scores|score|continue/i }).first();
  const scoreLink = page.getByRole('link', { name: /enter scores|score|continue/i }).first();
  if (await scoreBtn.count()) {
    await scoreBtn.click();
  } else if (await scoreLink.count()) {
    await scoreLink.click();
  } else {
    console.log('NO OBVIOUS SCORE ENTRY AFFORDANCE on the hub');
  }
  await page.waitForTimeout(800);
  await capture(page, '22-scoring-screen');
});
