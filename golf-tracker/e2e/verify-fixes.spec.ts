// UI verification against the SANDBOX server (in-memory backend).
//
// Purpose: verify the committed UI fixes actually render correctly — the thing
// typecheck and unit tests cannot do. Each test seeds a game state via /sandbox,
// then asserts on what a golfer would actually see.
//
// WHAT THIS PROVES: rendering, labels, vocabulary, flow.
// WHAT IT DOES NOT: persistence, RLS, real realtime, multi-device merge. The
// backend here is a Map. See src/test/fake-supabase.ts.
//
// Requires a sandbox server:  NEXT_PUBLIC_SANDBOX=1 npx next dev --port 3200
// Uses system Chrome (channel: 'chrome') so no browser download is needed.

import { expect, test } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';

// The invite gate wraps the whole app, so grant access before the first paint.
// (The gate reads a plain cookie — see src/lib/invite-gate.ts.)
test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  // The fake backend persists to sessionStorage so seeded games survive page
  // reloads. Clear it per test so each starts from an empty backend.
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => sessionStorage.clear());
});

// Seed a scenario from the sandbox page and follow its "Open" link.
// Returns the seeded game's id so tests can navigate to a specific sub-page.
async function seed(page: import('@playwright/test').Page, label: string): Promise<string> {
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
  await page.waitForLoadState('networkidle');
  // /pool/<id> or /pool/<id>/leaderboard
  const m = new URL(page.url()).pathname.match(/\/pool\/([^/]+)/);
  if (!m) throw new Error(`seed("${label}") did not land on a pool page: ${page.url()}`);
  return m[1];
}

// Navigate within the seeded game. The in-memory store lives in this tab's JS
// heap, so use client-side routing (goto would reload and wipe it).
async function goToGame(page: import('@playwright/test').Page, id: string, sub = '') {
  await page.goto(`${BASE}/pool/${id}${sub}`);
  await page.waitForLoadState('networkidle');
}

test.describe('2v2 side names (the "Team A" bug)', () => {
  test('leaderboard shows real side names, not Team A/B', async ({ page }) => {
    const id = await seed(page, '2v2 best ball — mid-round');
    await goToGame(page, id, '/leaderboard');

    const body = await page.locator('body').innerText();
    // Sides are named after their players.
    expect(body).toContain('Craig & Jym');
    expect(body).toContain('Dave & Rick');
    // The generic labels must NOT appear.
    expect(body).not.toContain('Team A');
    expect(body).not.toContain('Team B');
    await page.screenshot({ path: 'e2e/screenshots/2v2-leaderboard.png', fullPage: true });
  });

  test('SCORECARD shows side names too (was the actual defect)', async ({ page }) => {
    await seed(page, '2v2 best ball — mid-round');
    await page.getByRole('button', { name: /enter scores/i }).first().click();

    // MUST confirm we actually reached the scorecard. Without this the test passes
    // vacuously on the hub (which never contained "Team A" to begin with) — it did
    // exactly that before this guard was added.
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Finish Game' })).toBeVisible();

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Team A');
    expect(body).not.toContain('Team B');
    // And the real side names ARE present.
    expect(body).toMatch(/Craig & Jym|Dave & Rick/);
    await page.screenshot({ path: 'e2e/screenshots/2v2-scorecard.png', fullPage: true });
  });
});

test.describe('9-hole 2v2 leg collapse', () => {
  test('shows ONE leg with a matching caption', async ({ page }) => {
    await seed(page, '2v2 on a nine');
    const body = await page.locator('body').innerText();
    // Custom side names are honored.
    expect(body).toContain('The Hogs');
    // The caption must not promise three legs when only one exists.
    expect(body).not.toContain('Front · Back · Overall');
    expect(body).toContain('Back 9');
    await page.screenshot({ path: 'e2e/screenshots/2v2-nine-leg.png', fullPage: true });
  });
});

test.describe('field-size fix (2-player game)', () => {
  test('a dead heat reads as tied, not as someone leading', async ({ page }) => {
    await seed(page, 'Skins — 2 players');
    const body = await page.locator('body').innerText();
    // Identical rounds => every Nassau segment is a true tie.
    expect(body).toContain('All tied');
    expect(body).not.toMatch(/\(leading, split\)/);
    await page.screenshot({ path: 'e2e/screenshots/skins-2p.png', fullPage: true });
  });
});

test.describe('single-group vocabulary', () => {
  test('hub does not say "1 foursomes" for a one-group game', async ({ page }) => {
    await seed(page, '2v2 best ball — mid-round');
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('1 foursomes');
    expect(body).not.toContain('Pool Money Game · 1');
    // Names the mode instead.
    expect(body).toMatch(/2 vs 2/i);
    await page.screenshot({ path: 'e2e/screenshots/hub-2v2.png', fullPage: true });
  });

  test('classic pool still says foursomes, pluralized', async ({ page }) => {
    const id = await seed(page, 'Classic pool — 2 foursomes, mid-round');
    await goToGame(page, id);
    const body = await page.locator('body').innerText();
    expect(body).toContain('2 foursomes');
  });
});

test.describe('money formatting', () => {
  test('a loss never renders as $-N', async ({ page }) => {
    await seed(page, 'Classic pool — 2 foursomes, mid-round');
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/\$-\d/);      // the old team-path bug
    await page.screenshot({ path: 'e2e/screenshots/pool-leaderboard.png', fullPage: true });
  });
});

test.describe('close out a game (the completion bug)', () => {
  test('closing out marks the game completed', async ({ page }) => {
    await seed(page, 'Classic pool — 2 foursomes, FULLY scored');
    const body = await page.locator('body').innerText();
    // The gate should report a fully-scored game.
    expect(body).toContain('Every player is scored on every hole');

    await page.getByRole('button', { name: /close out game/i }).click();
    await expect(page.getByText(/Game closed out/i)).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/closed-out.png', fullPage: true });

    // And the list should show it as completed.
    await page.goto(`${BASE}/pool`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('completed').first()).toBeVisible();
  });
});

test.describe('phone viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });   // iPhone 14 class

  test('leaderboard is usable one-handed', async ({ page }) => {
    const id = await seed(page, '2v2 best ball — mid-round');
    await goToGame(page, id, '/leaderboard');
    await page.screenshot({ path: 'e2e/screenshots/phone-leaderboard.png', fullPage: true });
    // No horizontal overflow of the page itself (tables may scroll internally).
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('scorecard is usable one-handed', async ({ page }) => {
    await seed(page, '2v2 best ball — mid-round');
    await page.getByRole('button', { name: /enter scores/i }).first().click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'e2e/screenshots/phone-scorecard.png', fullPage: true });
  });
});

test.describe('share link on another device', () => {
  // Craig's question: "how do the organizer links / share links work on other
  // people's devices?" Simulate a genuinely fresh device: a NEW browser context
  // with no cookies and no localStorage, opening only the link.
  test('a per-game link opens the game with no login and no invite code', async ({ browser, page }) => {
    // Organizer seeds a game and reads its share link.
    const id = await seed(page, 'Classic pool — 2 foursomes, FULLY scored');
    await goToGame(page, id);
    // The hub header's Share button (not the leaderboard's).
    await page.getByRole('button', { name: 'Share' }).first().click();
    await expect(page.getByText(/Player scoring link/i)).toBeVisible();
    const link = await page.locator('input[readonly]').first().inputValue();
    expect(link).toContain(`/pool/${id}?key=`);
    // It must be a PER-GAME token, not the legacy shared constant.
    expect(link).not.toContain('poolparty2026');

    // A different device: fresh context, no cookies, no storage.
    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    // Carry the seeded in-memory data over (the sandbox store is per-tab).
    await guest.goto(`${BASE}/sandbox`);
    await guest.evaluate((data) => sessionStorage.setItem('__sandbox_supabase__', data),
      await page.evaluate(() => sessionStorage.getItem('__sandbox_supabase__') ?? ''));

    await guest.goto(link);
    await guest.waitForLoadState('networkidle');

    const body = await guest.locator('body').innerText();
    // Must NOT be stopped by the invite gate...
    expect(body).not.toContain('Enter your invite code');
    // ...and must land on the game itself.
    expect(body).toContain('Closeout Test Pool');
    await guest.screenshot({ path: 'e2e/screenshots/guest-share-link.png', fullPage: true });
    await guestCtx.close();
  });
});

test.describe('F-004: guest sees scores + info, not organizer controls', () => {
  // Craig's spec: "The share a game link should just allow someone to enter scores
  // for their foursome if they want, or to view the leaderboard." Plus his
  // correction: players in a money game SHOULD see the settings and how teams were
  // built — the line is read-only vs mutating, not organizer vs guest.
  test('a pool-access visitor can score and read, but not mutate', async ({ browser, page }) => {
    const id = await seed(page, 'Classic pool — 2 foursomes, FULLY scored');
    await goToGame(page, id);
    await page.getByRole('button', { name: 'Share' }).first().click();
    const link = await page.locator('input[readonly]').first().inputValue();
    const store = await page.evaluate(() => sessionStorage.getItem('__sandbox_supabase__') ?? '');

    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await guest.goto(`${BASE}/sandbox`);
    await guest.evaluate((d) => sessionStorage.setItem('__sandbox_supabase__', d), store);
    await guest.goto(link);
    await guest.waitForLoadState('networkidle');

    const body = await guest.locator('body').innerText();

    // CAN do their two jobs.
    await expect(guest.getByRole('button', { name: /enter scores/i }).first()).toBeVisible();
    await expect(guest.getByRole('button', { name: /leaderboard/i }).first()).toBeVisible();

    // CAN see the information a player in a money game is entitled to.
    expect(body).toContain('Pot');                        // money structure
    expect(body).toContain('Full handicap');              // how strokes are set
    expect(body).toContain('HOW THESE TEAMS WERE BUILT');  // team construction

    // CANNOT mutate the game for everyone.
    expect(body).not.toContain('Close out game');
    expect(body).not.toContain('Save format');
    expect(body).not.toContain('Refresh from GHIN');
    expect(body).not.toContain('Closest to the Pin');
    await expect(guest.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);

    await guest.screenshot({ path: 'e2e/screenshots/guest-scoped.png', fullPage: true });
    await guestCtx.close();
  });

  test('the ORGANIZER still sees every control', async ({ page }) => {
    const id = await seed(page, 'Classic pool — 2 foursomes, FULLY scored');
    await goToGame(page, id);
    const body = await page.locator('body').innerText();
    expect(body).toContain('Close out game');
    expect(body).toContain('Closest to the Pin');
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  });
});

test.describe('USGA allowance recommendation', () => {
  // Craig: "showing the usga recommendations per different formats would be good for
  // allowances". Advisory only — never forced, since groups deliberately play 100%.
  test('suggests the format allowance and applies it in one tap', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');

    // Default 100% -> a suggestion is offered for four-ball stroke play.
    await expect(page.getByText(/USGA suggests 85%/)).toBeVisible();
    const apply = page.getByRole('button', { name: 'Use 85%' });
    await expect(apply).toBeVisible();

    await apply.click();
    // The field takes the value, and the note flips to confirmed.
    await expect(page.locator('input[type="number"]').nth(1)).toHaveValue('85');
    await expect(page.getByText(/✓ USGA suggests 85%/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use 85%' })).toHaveCount(0);

    // And the stroke consequence updates with it.
    await expect(page.getByText(/an 18 handicap plays off 15/)).toBeVisible();
  });

  test('the recommendation changes with the format', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    // Head-to-head is four-ball MATCH play -> 90%.
    await page.getByRole('button', { name: 'Two teams, head-to-head' }).click();
    await expect(page.getByText(/USGA suggests 90% for four-ball match play/)).toBeVisible();
  });
});

test.describe('group picker on wizard step 1', () => {
  // The picker existed but was buried on step 3 (Build Field) behind a "Groups"
  // dropdown + Load button — which is why only 7 of 44 real games carried a
  // sourceGroupId. A group answers who plays / how we play / what we play at once,
  // so it belongs first.
  test('choosing a group applies its settings and names the game', async ({ page }) => {
    // Seed a roster + groups into the sandbox backend.
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Groups — 61-member' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();

    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');

    // The question is asked FIRST, above the game name.
    await expect(page.getByText("Who's playing?")).toBeVisible();
    const warriors = page.getByRole('button', { name: /Weekend Warriors/ });
    await expect(warriors).toBeVisible();

    await warriors.click();

    // Its saved settings land (Warriors default: off-the-low, 100%).
    await expect(page.getByText(/Using this group's usual setup/)).toBeVisible();
    // And the game gets a sensible name without typing.
    await expect(page.locator('input[type="text"]').first()).toHaveValue('Weekend Warriors');
    await page.screenshot({ path: 'e2e/screenshots/wizard-group-picker.png', fullPage: true });
  });

  test('"Someone else" leaves the wizard ungrouped', async ({ page }) => {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Groups — 61-member' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();

    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Weekend Warriors/ }).click();
    await expect(page.getByText(/Using this group's usual setup/)).toBeVisible();

    await page.getByRole('button', { name: 'Someone else' }).click();
    await expect(page.getByText(/Using this group's usual setup/)).toHaveCount(0);
  });

  test('a user with no groups never sees the picker', async ({ page }) => {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    // First-timer: no empty dropdown, no dead control.
    await expect(page.getByText("Who's playing?")).toHaveCount(0);
    await expect(page.getByText('What should we call it?')).toBeVisible();
  });
});
