// CAPTURE pass for the critique loop (UI_CRITIQUE_PROCESS.md step 2).
//
// These tests exist to SEE screens, not to assert correctness. They seed a state,
// screenshot it at phone + desktop, and print the rendered text so it can be read
// and critiqued. Findings go to FINDINGS.md; fixes are proposed, not applied.
//
// Assertions here are deliberately minimal — just enough to prove the screen
// actually rendered (per the vacuous-test lesson: a capture of the wrong page is
// worse than no capture).

import { expect, test } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
});

async function seedAndOpen(page: import('@playwright/test').Page, label: string) {
  await page.goto(`${BASE}/sandbox`);
  const card = page.locator('div.bg-white', { hasText: label });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  await card.getByRole('button', { name: 'Open →' }).click();
  await page.waitForLoadState('networkidle');
}

async function capture(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });
  const text = (await page.locator('body').innerText()).replace(/\n{3,}/g, '\n\n');
  console.log(`\n===== ${name} =====\n${text}\n`);
}

test.describe('continuing — the neglected phase', () => {
  test('capture /home/stats with a real season of money', async ({ page }) => {
    await seedAndOpen(page, 'Season ledger');
    // Prove we're on stats with data, not the empty state.
    await expect(page.getByRole('heading', { name: /Stats & money/i })).toBeVisible();
    await expect(page.getByText(/No finished games yet/i)).toHaveCount(0);
    await capture(page, 'stats-mine');

    // Each lens is a different rollup.
    for (const lens of ['By group', 'By game']) {
      await page.getByRole('button', { name: lens, exact: true }).click();
      await page.waitForTimeout(300);
      await capture(page, `stats-${lens.toLowerCase().replace(/\s+/g, '-')}`);
    }
  });

  // F-007 guard, at the UI level: the money a group reads off this screen must
  // balance. Before the fix, four players owed money that appeared in NO transfer,
  // because settleUp() matches debtors to creditors and silently drops unmatched debt.
  test('F-007: the season ledger balances and settles fully', async ({ page }) => {
    await seedAndOpen(page, 'Season ledger');
    await expect(page.getByRole('heading', { name: /Stats & money/i })).toBeVisible();

    // Field-wide standings now live ONLY inside a group (the F-009 privacy rule), so
    // switch there to check the money balances across a field.
    await page.getByRole('button', { name: 'By group', exact: true }).click();
    await page.selectOption('select', { label: 'Weekend Warriors' });
    await page.waitForTimeout(300);

    // Scope to the STANDINGS section only. The Settle-up list below it is all
    // positive amounts, so scraping the whole page can never balance — an earlier
    // version of this test did exactly that and failed on its own arithmetic.
    const text = await page.locator('body').innerText();
    const standings = text.slice(
      text.indexOf('STANDINGS'),
      text.indexOf('SETTLE UP') > -1 ? text.indexOf('SETTLE UP') : undefined,
    );

    // Signed dollar figures (− is U+2212, per UI_CONVENTIONS.md).
    const nets = [...standings.matchAll(/(−|-)?\$([\d,]+\.\d{2})/g)]
      .map((m) => (m[1] ? -1 : 1) * parseFloat(m[2].replace(/,/g, '')));
    expect(nets.length).toBeGreaterThan(0);

    // Money owed must equal money due — a quarter of the pot used to vanish.
    const owed = nets.filter((n) => n < 0).reduce((s, n) => s + n, 0);
    const due = nets.filter((n) => n > 0).reduce((s, n) => s + n, 0);
    expect(Math.abs(owed + due)).toBeLessThan(0.05);

    expect(text).toContain('SETTLE UP');
    expect(text).toMatch(/pays/);
  });

  test('capture /home/stats on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAndOpen(page, 'Season ledger');
    await expect(page.getByRole('heading', { name: /Stats & money/i })).toBeVisible();
    await capture(page, 'phone-stats');
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`horizontal overflow: ${overflow}px`);
  });

  // F-009 guard: the privacy boundary. "My money" must show the VIEWER's total across
  // groups and nobody else's. The old Overall lens showed every player's money across
  // every game the viewer could load, leaking one group's results to another.
  test('F-009: My money shows only the viewer, across groups', async ({ page }) => {
    await seedAndOpen(page, 'Season ledger');
    await expect(page.getByRole('heading', { name: /Stats & money/i })).toBeVisible();

    const text = await page.locator('body').innerText();

    // The viewer's own total, and where it came from.
    expect(text).toContain('YOUR TOTAL');
    expect(text).toContain('WHERE IT CAME FROM');
    expect(text).toContain('Weekend Warriors');
    expect(text).toContain('Tuesday Crew');

    // No field-wide standings here — that only exists inside a group.
    expect(text).not.toContain('SETTLE UP');
    // And no other player's name in the cross-group view.
    expect(text).not.toContain('Jym Youngberg');

    // The old lenses are gone.
    expect(text).not.toContain('By player');
    await page.screenshot({ path: 'e2e/screenshots/f009-my-money.png', fullPage: true });
  });

  // The other half of the rule: inside a group, you DO see everyone — from that
  // group's games only.
  test('F-009: a group view shows every member, scoped to that group', async ({ page }) => {
    await seedAndOpen(page, 'Season ledger');
    await page.getByRole('button', { name: 'By group', exact: true }).click();
    await page.selectOption('select', { label: 'Weekend Warriors' });
    await page.waitForTimeout(300);

    const text = await page.locator('body').innerText();
    // innerText reflects CSS text-transform, so the heading arrives uppercased.
    expect(text.toLowerCase()).toContain('weekend warriors — standings');
    // Field-wide money, and a settlement, exist here.
    expect(text).toContain('SETTLE UP');
    await page.screenshot({ path: 'e2e/screenshots/f009-group-scoped.png', fullPage: true });
  });

  // F-008 guard: formats share the roster_groups table (kind:'format') and have no
  // players by design, so one in this picker is a dead option.
  test('F-008: the group picker excludes saved formats', async ({ page }) => {
    await seedAndOpen(page, 'Season ledger');
    await page.getByRole('button', { name: 'By group', exact: true }).click();
    const options = await page.locator('select option').allInnerTexts();
    expect(options.join(' | ')).toContain('Weekend Warriors');
    expect(options.join(' | ')).toContain('Tuesday Crew');
    // The seeded fixture includes a format named "2v2 Best Ball (Stableford)".
    expect(options.join(' | ')).not.toContain('Best Ball (Stableford)');
  });

  test('capture a 61-member group', async ({ page }) => {
    await seedAndOpen(page, 'Groups — 61-member');
    await expect(page.getByText(/Weekend Warriors/i).first()).toBeVisible();
    await capture(page, 'group-large');
  });

  // F-010 guard: at 61 members this page was a 5,249px phone scroll of 61 cards, each
  // with a full-width Remove, with recent games and money absent. Craig: "make it a group
  // dashboard, and also remove should ask for confirmation."
  test('F-010: the group page leads with the dashboard, members collapsed', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAndOpen(page, 'Groups — 61-member');
    await expect(page.getByText(/Weekend Warriors/i).first()).toBeVisible();

    const text = await page.locator('body').innerText();

    // What a group is FOR comes first.
    expect(text).toContain('Start something with this group');
    // Members are summarised, not enumerated.
    expect(text).toMatch(/61 players — tap to view or edit/);

    // The page is no longer a wall of scroll.
    const height = await page.evaluate(() => document.body.scrollHeight);
    console.log(`group page phone height: ${height}px (was 5249px)`);
    expect(height).toBeLessThan(2000);

    // Only ONE Remove is on screen (formats), not 61.
    const removes = await page.getByRole('button', { name: 'Remove' }).count();
    expect(removes).toBeLessThan(5);

    await page.screenshot({ path: 'e2e/screenshots/f010-group-dashboard.png', fullPage: true });
  });

  test('F-010: members expand with a search box', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAndOpen(page, 'Groups — 61-member');
    await page.getByText(/61 players — tap to view or edit/).click();

    // A filter over the members already IN the group — previously only the add-player
    // search existed, so finding someone among 61 meant scrolling.
    const search = page.getByPlaceholder(/Search 61 members/);
    await expect(search).toBeVisible();
    await search.fill('Tanaka');
    const text = await page.locator('body').innerText();
    expect(text).toContain('Tanaka');
    expect(text).not.toContain('Abe Hoelzer');
  });

  test('capture a 61-member group on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAndOpen(page, 'Groups — 61-member');
    await expect(page.getByText(/Weekend Warriors/i).first()).toBeVisible();
    await capture(page, 'phone-group-large');
  });

  test('capture the home hub', async ({ page }) => {
    await seedAndOpen(page, 'Home hub');
    await capture(page, 'home-hub');
  });
});

test.describe('start — the wizard (the scale path)', () => {
  // Craig: "the wizard is more important since that is what people will use if i
  // actually can scale the app." This is the parking-lot critical path: a golfer
  // with their group waiting, on a phone, one hand.
  //
  // Capture every step at phone width and count the taps.
  test('walk /pool/new at phone width, counting taps', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');

    // Step 1 — Details (game name, mode, money)
    await expect(page.getByText(/Details/i).first()).toBeVisible();
    await capture(page, 'wizard-1-details-phone');

    // How many interactive controls are on screen before anything is chosen?
    const controls = await page.evaluate(() => ({
      buttons: document.querySelectorAll('button').length,
      inputs: document.querySelectorAll('input, select, textarea').length,
    }));
    console.log(`STEP 1 controls: ${controls.buttons} buttons, ${controls.inputs} inputs`);

    // Tap targets under 44px are a known mobile-ergonomics problem.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .map((b) => ({ t: (b.textContent ?? '').trim().slice(0, 24), h: Math.round(b.getBoundingClientRect().height) }))
        .filter((x) => x.h > 0 && x.h < 44));
    console.log(`STEP 1 tap targets under 44px: ${small.length}`);
    if (small.length) console.log(JSON.stringify(small.slice(0, 12)));
  });

  test('capture the wizard at desktop width', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    await capture(page, 'wizard-1-details-desktop');
  });
});
