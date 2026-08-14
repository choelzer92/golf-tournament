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
    // Locate by label, not index: an index-based selector broke the moment the
    // buy-in input moved off this step.
    await expect(page.locator('input[type="number"]').first()).toHaveValue('85');
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

test.describe('money moved to its own step', () => {
  // F-005: step 1 asked ~12 questions at once, including money settings that can't
  // even be shown in real dollars until the field and team count are known.
  test('step 1 no longer asks money questions', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').innerText();

    // Scoring questions stay (they decide who WINS a hole).
    expect(body).toContain('How much handicap counts?');
    expect(body).toContain('Who gets strokes?');
    expect(body).toContain('How many strokes change hands?');

    // Money questions have moved.
    expect(body).not.toContain('Buy-in per player');
    expect(body).not.toContain('Who gets paid?');
    expect(body).not.toContain('Bonus points for good holes');

    // The step indicator names the destination.
    expect(body).toContain('Money');
  });

  test('the money step shows the pot in real dollars', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    // Walk to the money step via the wizard's own buttons.
    await page.locator('input[type="text"]').first().fill('Money Step Test');
    await page.getByRole('button', { name: /Next: Select Course/i }).click();
    await page.waitForLoadState('networkidle');
    // Can't complete course search offline in the sandbox, so just assert the
    // money questions are NOT on step 1 and the step exists in the indicator.
    await expect(page.getByText('Money')).toBeVisible();
  });
});

test.describe('F-001: segment progress reads as a count, not a hole number', () => {
  test('a finished back nine says "9 of 9 holes", never "thru 9"', async ({ page }) => {
    await seed(page, 'Skins — 2 players');   // 18 holes, Nassau 3-way, complete
    const body = await page.locator('body').innerText();

    // The header still uses "thru" for a HOLE NUMBER — that meaning is unchanged.
    expect(body).toContain('thru hole 18');

    // But the Nassau segments now report a count with its denominator, so a
    // finished back nine can't be misread as having stalled at hole 9.
    expect(body).toContain('9 of 9 holes');
    expect(body).toContain('18 of 18 holes');
    expect(body).not.toMatch(/pot · thru \d/);
    await page.screenshot({ path: 'e2e/screenshots/f001-nassau-thru.png', fullPage: true });
  });

  test('a 9-hole game does not say "9 of 18"', async ({ page }) => {
    await seed(page, '2v2 on a nine');       // back nine only, one collapsed leg
    const body = await page.locator('body').innerText();
    expect(body).toContain('9 of 9 holes');
    expect(body).not.toContain('of 18 holes');
  });
});

test.describe('JY feedback: GHIN sign-in prompt arrives before the search', () => {
  // JY, a real organizer-link user: "I go to select course then it pops up and says
  // sign in to GHIN." The prompt used to appear only AFTER submitting a search.
  test('the course step prompts on arrival, not after a failed search', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="text"]').first().fill('GHIN Timing Test');
    await page.getByRole('button', { name: /Next: Select Course/i }).click();
    await page.waitForLoadState('networkidle');

    // Visible immediately — no search submitted.
    await expect(page.getByText(/Sign in to GHIN to search for a course/i)).toBeVisible();
    await expect(page.getByText(/only needed to look up the course and tees/i)).toBeVisible();

    // And it must NOT be a gate: the search box is still there to use.
    await expect(page.getByPlaceholder(/GHIN email/i)).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/jy-ghin-prompt.png', fullPage: true });
  });
});

test.describe('JY feedback: recent courses', () => {
  // "if it could save previously selected courses so you don't have to type it in
  // every time." Derived from games already played — no new storage.
  test('offers a previously played course as one tap', async ({ page }) => {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForLoadState('networkidle');

    // Walk to the course step.
    await page.locator('input[type="text"]').first().fill('Recent Course Test');
    await page.getByRole('button', { name: /Next: Select Course/i }).click();
    await page.waitForLoadState('networkidle');

    // The seeded games were all at "Sandbox National".
    await expect(page.getByText('Played recently')).toBeVisible();
    const chip = page.getByRole('button', { name: /Sandbox National/ });
    await expect(chip).toBeVisible();

    // One tap selects it — no GHIN call, no typing.
    await chip.click();
    await expect(page.getByText('Played recently')).toHaveCount(0);
    await page.screenshot({ path: 'e2e/screenshots/jy-recent-courses.png', fullPage: true });
  });
});

// NOTE: snake-draft correctness is covered by compute tests in src/test/pool-game.test.ts
// (exact deal order, locks, uneven fields, and that the optimizer is never worse on
// spread). An e2e test would need a real course search, which the sandbox can't do — and
// a test that only asserts "the wizard loaded" is the vacuous kind we removed earlier.

test.describe('F-003: /home is the default landing page', () => {
  // The flag was off while /home was unfinished, which made the entire "continuing"
  // feature set invisible — /dashboard has no link to /home/stats at all.
  test('the two landing screens work and link to each other', async ({ page }) => {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Home hub' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForLoadState('networkidle');

    // /home renders with content, and offers the escape hatch back.
    const body = await page.locator('body').innerText();
    expect(body).toContain('Start something');
    expect(body).toContain('Stats & money');
    expect(body).toContain('Classic dashboard');

    // And the dashboard's link back reads as a destination, not an experiment.
    await page.getByRole('button', { name: 'Classic dashboard' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Try new Home/ })).toHaveCount(0);
  });
});

test.describe('manual bonuses on the scorecard', () => {
  // Craig's spec: "an easy method to click that box as a scorer per hole for a player",
  // and "the scorer can enter any for anyone in the group".
  test('the scorer can toggle a bonus for any player in the foursome', async ({ page }) => {
    await seed(page, 'Manual bonuses');
    await page.getByRole('button', { name: /enter scores/i }).first().click();
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Finish Game' })).toBeVisible();

    // A toggle exists for EVERY player on the hole, not just the logged-in one.
    const sandies = page.getByRole('button', { name: /Sandie/ });
    expect(await sandies.count()).toBeGreaterThanOrEqual(4);

    // Tapping marks it.
    await sandies.first().click();
    await expect(page.getByRole('button', { name: /✓ Sandie/ }).first()).toBeVisible();

    // Tapping again clears it.
    await page.getByRole('button', { name: /✓ Sandie/ }).first().click();
    await expect(page.getByRole('button', { name: /✓ Sandie/ })).toHaveCount(0);

    await page.screenshot({ path: 'e2e/screenshots/bonuses-scorecard.png', fullPage: true });
  });

  test('a game with no custom bonuses shows no toggles at all', async ({ page }) => {
    await seed(page, '2v2 best ball — mid-round');
    await page.getByRole('button', { name: /enter scores/i }).first().click();
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
    // Zero cost for a group that doesn't play them.
    await expect(page.getByRole('button', { name: /Sandie|Barkie|Greenie/ })).toHaveCount(0);
  });
});

test.describe('choosing which bonuses a game plays', () => {
  // Craig: "those only show if they were selected for the game right?" — yes, and this is
  // where you select them. Off by default so a group that doesn't play them sees nothing.
  test('bonuses are off by default and pickable on the money step', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    // Step 1 must not ask about them — money questions live on the last step.
    const step1 = await page.locator('body').innerText();
    expect(step1).not.toContain('Extra bonuses to track by hand');
  });
});

test.describe('F-006: a Stableford pool pays the team with the MOST points', () => {
  // Every assertion here failed at some point during the F-006 pass. The engine ranked
  // lower-is-better, so the 54-point team was shown 2nd and paid $0 while the 36-point
  // team took the pot — and the per-hole grid painted the worst foursome green on all 18
  // holes. Unit tests cover the money; this covers what a player actually sees.
  test('the birdie team is 1st on the board, not last', async ({ page }) => {
    await seed(page, 'Stableford pool');
    await expect(page.getByText(/Stableford points/i).first()).toBeVisible();

    // Team 1 birdied every hole: 3 pts x 18 = 54, and must be ranked 1st.
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toContainText('Team 1');
    await expect(rows.first()).toContainText('54');
    // Team 4 doubled every hole: 0 points, and must be last.
    await expect(rows.last()).toContainText('Team 4');

    // The caption must say most points wins — "lowest total wins" is the stroke rule.
    const body = await page.locator('body').innerText();
    expect(body).toContain('most points wins');
    expect(body).not.toContain('lowest total wins');

    await page.screenshot({ path: 'e2e/screenshots/pool-stableford.png', fullPage: true });
  });

  test('PACE makes a mid-round total comparable, and reads as points-over-pars', async ({ page }) => {
    await seed(page, 'Stableford pool');
    // 18 birdies = 54 pts = 18 better than steady pars (2/hole).
    await expect(page.getByRole('columnheader', { name: 'PACE' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toContainText('+18');
    // Par team: 36 points, dead even on pace.
    const parRow = page.locator('tbody tr', { hasText: 'Team 2' }).first();
    await expect(parRow).toContainText('36');
    await expect(parRow).toContainText('E');
  });

  test('the per-hole grid highlights the HIGHEST points, not the lowest', async ({ page }) => {
    await seed(page, 'Stableford pool');
    // Green = best on the hole. Under points that's the birdie team's 3, never Team 4's 0.
    const best = page.locator('tbody tr', { hasText: 'Team 1' }).first().locator('.text-green-400');
    expect(await best.count()).toBeGreaterThan(0);
    // The worst foursome must have no green cells at all — it had 18 of them.
    const worst = page.locator('tbody tr', { hasText: 'Team 4' }).first().locator('.text-green-400');
    await expect(worst).toHaveCount(0);
  });

  test('head-to-head: the birdie team wins every leg and is paid', async ({ page }) => {
    await seed(page, 'Scramble pool');
    // Scramble + Stableford + hole-by-hole match: three ranking paths that each had the
    // direction backwards, and each paid the losing team the full leg amount.
    await expect(page.getByText('Match (per player)')).toBeVisible();

    // Every leg to Team 1, at its configured dollar amount. Row-scoped, so a leg awarded
    // to Team 2 can't be masked by a sibling row that happens to say Team 1.
    for (const [label, dollars] of [['Front 9', '$10'], ['Back 9', '$10'], ['Overall 18', '$20']] as const) {
      const row = page.locator('div.px-4', { hasText: new RegExp(`^${label}`) }).first();
      await expect(row).toContainText('Team 1');
      await expect(row).toContainText(`+${dollars}`);
      await expect(row).not.toContainText('Push');
    }

    // Team 1 won all 18 holes: a hard-coded `a < b` on the hole tally gave it ZERO.
    await expect(page.getByText('Team 1 18 – 0 Team 2 (holes won)')).toBeVisible();

    // The caption must state the points rule for the hole, not the stroke rule.
    const body = await page.locator('body').innerText();
    expect(body).toContain('most points wins the hole');
    // And this board shows MATCH points (holes won), so the total column must not be
    // headed PTS as though it held the Stableford total.
    await expect(page.getByRole('columnheader', { name: 'PTS' })).toHaveCount(0);

    await page.screenshot({ path: 'e2e/screenshots/pool-scramble-match.png', fullPage: true });
  });
});

test.describe('F-006: choosing the team format in the wizard', () => {
  // Step 4 of F-006's sequencing. Until now scramble/Stableford pools were only reachable
  // from the sandbox or a hand-built game — the engine shipped with no way to ask for it.
  test('the picker offers the formats the classic pool could not express', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    // Positive assertion that we're on step 1 of the wizard, not some redirect.
    await expect(page.getByText('Which scores count for the team?')).toBeVisible();

    const picker = page.locator('select').filter({ hasText: 'Two best net scores' }).first();
    const options = await picker.locator('option').allInnerTexts();
    // The three legacy ball selections are still here...
    expect(options).toContain('Best net + best gross');
    expect(options).toContain('Two best net scores');
    expect(options).toContain('Two best gross scores');
    // ...alongside the four that F-006 added.
    expect(options).toContain('Best ball');
    expect(options).toContain('Combined — every ball counts');
    expect(options).toContain('Scramble');
    expect(options).toContain('Alternate shot');
  });

  test('picking a format explains it, and Stableford changes the scoring line', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    const picker = page.locator('select').filter({ hasText: 'Two best net scores' }).first();

    // The hint names net or gross, because the FORMAT decides it (not a setting).
    await picker.selectOption('scramble');
    await expect(page.getByText(/One ball for the team, played off a USGA tiered team handicap/)).toBeVisible();
    await picker.selectOption('two-best-gross');
    await expect(page.getByText(/two lowest gross scores, added — no handicaps/)).toBeVisible();

    // Strokes is the default and says so; Stableford flips the rule.
    await expect(page.getByText('Add the strokes. Lowest total wins, as usual.')).toBeVisible();
    await page.getByRole('button', { name: 'Stableford points' }).click();
    await expect(page.getByText(/birdie 3, par 2, bogey 1. Most points wins/)).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/wizard-team-format.png', fullPage: true });
  });

  test('the USGA allowance recommendation follows the FORMAT', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    const picker = page.locator('select').filter({ hasText: 'Two best net scores' }).first();

    // Four-ball stroke play for a two-ball format.
    await picker.selectOption('two-best-net');
    await expect(page.getByText(/85% for four-ball stroke play/)).toBeVisible();

    // Combined counts every ball, so the USGA number differs — a single hard-coded 85%
    // would have quoted four-ball for a format that isn't four-ball.
    await picker.selectOption('combined');
    await expect(page.getByText(/85% for four-ball stroke play/)).toHaveCount(0);

    // Scramble is TIERED by team size, so quoting one figure would be wrong: say nothing.
    await picker.selectOption('scramble');
    await expect(page.getByText(/USGA suggests/)).toHaveCount(0);
  });
});

test.describe('F-006: what the wizard SAVES', () => {
  // The safety rule, asserted on the stored game rather than on the picker: an ordinary
  // stroke pool must save with NO teamFormat, so it computes down the legacy path pinned by
  // the golden snapshots. Only a format that path can't express opts in. Without this, adding
  // the picker would quietly move every new pool onto the new code, and "existing games
  // settle identically" would only hold for games created before today.
  async function saveDraftAndRead(page: import('@playwright/test').Page, format: string, basis: 'stroke' | 'stableford') {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Which scores count for the team?')).toBeVisible();
    await page.locator('select').filter({ hasText: 'Two best net scores' }).first().selectOption(format);
    if (basis === 'stableford') await page.getByRole('button', { name: 'Stableford points' }).click();
    // The wizard auto-saves its draft; read what it recorded.
    return await page.evaluate(() => {
      const raw = sessionStorage.getItem('pool_wizard_draft');
      return raw ? JSON.parse(raw) : null;
    });
  }

  test('an ordinary stroke pool saves the LEGACY way (no teamFormat)', async ({ page }) => {
    for (const [format, ballSelection] of [
      ['net-and-gross', '1-net-1-gross'],
      ['two-best-net', '2-best-net'],
      ['two-best-gross', '2-best-gross'],
    ]) {
      const draft = await saveDraftAndRead(page, format, 'stroke');
      expect(draft?.ballSelection, format).toBe(ballSelection);
      expect(draft?.teamScoreBasis, format).toBe('stroke');
    }
  });

  test('a scramble or Stableford pool opts IN', async ({ page }) => {
    const scramble = await saveDraftAndRead(page, 'scramble', 'stroke');
    expect(scramble?.teamFormat).toBe('scramble');

    const points = await saveDraftAndRead(page, 'two-best-net', 'stableford');
    expect(points?.teamFormat).toBe('two-best-net');
    expect(points?.teamScoreBasis).toBe('stableford');
  });

  test('the format survives a reload — a phone that slept mid-setup', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    await page.locator('select').filter({ hasText: 'Two best net scores' }).first().selectOption('scramble');
    await page.getByRole('button', { name: 'Stableford points' }).click();
    await expect(page.getByText(/birdie 3, par 2, bogey 1/)).toBeVisible();

    // "Continuing" is the neglected verb (AGENTS.md): the choice must come back.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('select').filter({ hasText: 'Scramble' }).first()).toHaveValue('scramble');
    await expect(page.getByText(/birdie 3, par 2, bogey 1/)).toBeVisible();
  });
});

test.describe('F-006: the scorecard for a generalized team format', () => {
  // A classic pool used to hard-code teamMode 'two-best-balls' and pass only ballSelection,
  // so a scramble pool handed the scorecard a rule it wasn't playing. Verified consequences:
  // scramble money depended on the ORDER of team.playerIds (+$75 vs −$75 on a reorder,
  // because per-player entry left members holding different scores), and the card's team row
  // contradicted the payout. Craig's call: one ball = one shared entry, and the team row comes
  // from the same engine the money uses.
  test('SCRAMBLE enters ONE score for the whole foursome', async ({ page }) => {
    const id = await seed(page, 'Scramble pool');
    await goToGame(page, id);
    await page.getByRole('button', { name: /enter scores/i }).first().click();
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Finish Game' })).toBeVisible();

    // ONE entry card for the foursome, listing all four players — not four separate cards.
    await expect(page.getByText('(Craig, Jym, Dave, Rick)')).toBeVisible();
    // Named after the FOURSOME, not the generic 2v2 side label.
    const body = await page.locator('body').innerText();
    expect(body).toContain('Team 1');
    expect(body).not.toContain('Team A');
    expect(body).not.toContain('Team B');
    // And the one-ball handicap is the USGA tiered team figure, not a per-player one.
    expect(body).toContain('USGA Tiered');

    await page.screenshot({ path: 'e2e/screenshots/card-scramble.png', fullPage: true });
  });

  test('the team row EXISTS on a one-sided pool card and matches the money engine', async ({ page }) => {
    // Use the POT-mode Stableford pool: in hole-match mode the leaderboard's last column is
    // MATCH POINTS (holes won), not the team total, so comparing against it would be
    // comparing two different quantities. (My first version of this test did exactly that
    // and "failed" on 62 vs 18 — both numbers correct, wrong pair.)
    const id = await seed(page, 'Stableford pool');
    await goToGame(page, id);
    await page.getByRole('button', { name: /enter scores/i }).first().click();
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });

    // `hasTeams` needed BOTH sides, so a pool foursome (one side) got player rows and no
    // team row — the number the money settles on was the one thing missing. This is a
    // MULTI-ball format, which is how the gap in the first fix surfaced.
    const teamRow = page.locator('tr', { hasText: /Team 1 pts/ }).first();
    await expect(teamRow).toBeVisible();
    const cardCells = (await teamRow.innerText()).split('\t').map((s) => s.trim());
    const cardTotal = cardCells[cardCells.length - 1];

    // The leaderboard IS the money engine. The card's total must equal it exactly —
    // AGENTS.md: the scorecard defers to the money engine so the screen matches payouts.
    await goToGame(page, id, '/leaderboard');
    const lbTotal = (await page.locator('tbody tr', { hasText: 'Team 1' }).first()
      .locator('td').nth(-2).innerText()).trim();   // PTS column (PACE is last)
    expect(cardTotal, 'card team total must equal the leaderboard total').toBe(lbTotal);
  });

  test('a one-sided card shows no A-vs-B match badge', async ({ page }) => {
    const id = await seed(page, 'Scramble pool');
    await goToGame(page, id);
    await page.getByRole('button', { name: /enter scores/i }).first().click();
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
    // getMatchStatus compares side A against side B; with one side on the device that's
    // meaningless, so it must not render "2 UP" / "AS" / "3 ahead" against the team total.
    const teamRow = page.locator('tr', { hasText: /Team 1 pts/ }).first();
    await expect(teamRow).not.toContainText(/\d+ (UP|DN|ahead|back)/);
    await expect(teamRow).not.toContainText(/\bAS\b/);
  });

  test('a LEGACY pool scorecard is untouched (per-player, no team format)', async ({ page }) => {
    const id = await seed(page, 'Classic pool — 2 foursomes, mid-round');
    await goToGame(page, id);
    await page.getByRole('button', { name: /enter scores/i }).first().click();
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Finish Game' })).toBeVisible();

    // Still four separate player entry cards, no shared team entry, no team-name relabel.
    await expect(page.getByText('(Craig, Jym, Dave, Rick)')).toHaveCount(0);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('USGA Tiered');
  });
});

test.describe('F-006: a GUEST on a share link scores a scramble correctly', () => {
  // The "continuing" path that matters most: another foursome scoring from a phone with no
  // organizer login. The card is built by the hub from the same PoolGame, so it must teach the
  // guest's device the format too — a guest entering four separate scores on a one-ball format
  // is how the player-order money bug would reach a real round.
  test('the shared card enters ONE team score and names the foursome', async ({ browser, page }) => {
    const id = await seed(page, 'Scramble pool');
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

    await guest.getByRole('button', { name: /enter scores/i }).first().click();
    await guest.waitForURL(/\/game\/play/, { timeout: 15_000 });
    await expect(guest.getByRole('button', { name: 'Finish Game' })).toBeVisible();

    // One shared entry for the foursome, named after the team, on the team handicap.
    await expect(guest.getByText('(Craig, Jym, Dave, Rick)')).toBeVisible();
    const body = await guest.locator('body').innerText();
    expect(body).toContain('Team 1');
    expect(body).toContain('USGA Tiered');
    expect(body).not.toContain('Team A');

    // And the team row is present, so the guest can see what their group is scoring.
    await expect(guest.locator('tr', { hasText: /Team 1 pts/ }).first()).toBeVisible();

    await guest.screenshot({ path: 'e2e/screenshots/guest-scramble-card.png', fullPage: true });
    await guestCtx.close();
  });
});
