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
    // Names the mode instead. Renamed twice as the mode widened: "2 vs 2 (within group)" →
    // "Sides (within group)" when F-006 generalized the side count, then → "Sides / Match" when
    // F-019 gave it real playing groups and 1v1 became reachable (§5.at — a capability change
    // dates every string that described the old limit).
    expect(body).toMatch(/Sides \/ Match/i);
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

  test('F-024: the Per Person strip sums to zero', async ({ page }) => {
    const id = await seed(page, 'Classic pool — 2 foursomes, mid-round');
    await goToGame(page, id, '/leaderboard');
    // Positive assertion that we're on the strip, not just any page. NOTE: the
    // heading renders through a CSS `uppercase` class, so innerText says
    // "PER PERSON" — match case-insensitively.
    await expect(page.getByText('Per Person', { exact: false })).toBeVisible();
    const body = await page.locator('body').innerText();
    // Every "Name: ±$N" entry on the strip. Math.round(±12.5) used to round the
    // two signs apart (+$13 / −$12), so the zero-sum engine displayed +$4.
    const strip = body.match(/Per Person[\s\S]*/i);
    expect(strip).not.toBeNull();
    const entries = [...strip![0].matchAll(/([+−])\$(\d+)/g)];
    expect(entries.length).toBeGreaterThan(0);
    const sum = entries.reduce((s, m) => s + (m[1] === '+' ? 1 : -1) * Number(m[2]), 0);
    expect(sum).toBe(0);
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

// NOTE: captains'-deal correctness is covered by compute tests in src/test/pool-game.test.ts
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

test.describe('F-006: one ball means one score — the hub will not create divergence', () => {
  // Craig's rule: a scramble has one ball, so there should be one score per team. A PoolGame
  // has a single format for all 18 holes, so there's no declared exception. That makes a
  // mid-round switch TO a one-ball format illegal on a game that already has per-player
  // scores — it would leave four different numbers on a hole that can only have one, and the
  // payout then depended on the order of playerIds (+$75 vs −$75 on a reorder).
  test('a game with per-player scores cannot switch to scramble', async ({ page }) => {
    const id = await seed(page, 'Classic pool — 2 foursomes, mid-round');
    await goToGame(page, id);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();

    const picker = page.locator('select').filter({ hasText: 'Two best net scores' }).first();
    await expect(picker).toBeVisible();

    // The one-ball options are disabled and say why.
    await expect(picker.locator('option[value="scramble"]')).toBeDisabled();
    await expect(picker.locator('option[value="alternate-shot"]')).toBeDisabled();
    await expect(page.getByText(/Scramble and alternate shot enter ONE score/)).toBeVisible();

    // The multi-ball formats stay switchable — this game can still become Stableford or
    // best-ball, which per-player entry handles correctly.
    await expect(picker.locator('option[value="best-ball"]')).not.toBeDisabled();
    await expect(picker.locator('option[value="combined"]')).not.toBeDisabled();

    await page.screenshot({ path: 'e2e/screenshots/hub-oneball-locked.png', fullPage: true });
  });

  test('a game ALREADY playing scramble can still change its other settings', async ({ page }) => {
    // The lock is about switching TO one ball, not about scramble games being frozen.
    const id = await seed(page, 'Scramble pool');
    await goToGame(page, id);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();

    const picker = page.locator('select').filter({ hasText: 'Scramble' }).first();
    await expect(picker).toHaveValue('scramble');
    // Its own format is not flagged, because the scores it holds ARE one-ball scores.
    await expect(page.getByText(/Scramble and alternate shot enter ONE score/)).toHaveCount(0);
  });
});

test.describe('F-012: the same rule, in the 2v2 editor', () => {
  // The pool's format picker got the one-ball lock in the F-006 pass. The 2v2 branch of the
  // same settings editor returns BEFORE that code, so a scored 2v2 game could still be
  // switched to scramble — re-creating the divergent per-member scores the rule exists to
  // prevent. Probed at a $54 swing on a scratch foursome before the fix.
  test('a scored 2v2 game cannot switch to a one-ball format', async ({ page }) => {
    await seed(page, '2v2 best ball — mid-round');
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();

    // Assert we're on the 2v2 editor, not the classic pool one — this page renders two
    // different settings panels and an early version of this test could pass on the wrong one.
    await expect(page.getByText('Sides / Match options')).toBeVisible();

    const picker = page.locator('select').filter({ hasText: 'Best ball (low net counts)' }).first();
    await expect(picker).toBeVisible();
    await expect(picker).toHaveValue('best-ball');

    // The one-ball formats are locked and say why.
    await expect(picker.locator('option[value="scramble"]')).toBeDisabled();
    await expect(picker.locator('option[value="alternate-shot"]')).toBeDisabled();
    await expect(picker.locator('option[value="scramble"]')).toContainText('needs a fresh game');

    // Per-player-entry formats stay switchable: this game's scores are valid for them.
    await expect(picker.locator('option[value="combined"]')).not.toBeDisabled();

    // The reason must be VISIBLE on the page, not only inside the closed dropdown. Caught by
    // looking at the screenshot: the first version of this fix disabled the options silently,
    // so the 2v2 editor refused a tap with no explanation while the classic pool's picker
    // explained itself — the same rule reading two different ways on two screens.
    await expect(page.getByText(/Scramble and alternate shot enter ONE score/)).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/hub-2v2-oneball-locked.png', fullPage: true });
  });

  // The OTHER door: re-tapping the side a player is already on used to filter-then-push them
  // to the end of subTeams, which silently changed which member's score a one-ball side read.
  // Nothing on screen moved; the money did.
  test('re-tapping a side a player is already on changes nothing on screen', async ({ page }) => {
    await seed(page, '2v2 best ball — mid-round');
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await expect(page.getByText('Sides', { exact: true })).toBeVisible();

    const before = await page.locator('body').innerText();
    // Craig is on side A already (subTeams.a = [sp1, sp2]); tap A again.
    const firstRow = page.locator('div.divide-y > div').filter({ hasText: 'Craig' }).first();
    await firstRow.getByRole('button', { name: 'A', exact: true }).click();
    await page.waitForTimeout(300);

    expect(await page.locator('body').innerText()).toBe(before);
    await page.screenshot({ path: 'e2e/screenshots/hub-2v2-side-retap.png', fullPage: true });
  });
});

test.describe('F-006: three sides in one group', () => {
  // The N-sides half of F-006. Two sides is still the default; this proves the third is real
  // on screen, not just in the engine.
  test('the leaderboard shows all three sides, ranked, with money', async ({ page }) => {
    const id = await seed(page, 'Three sides in one group');
    await page.waitForURL(new RegExp(`/pool/${id}/leaderboard`));

    // All three sides present and named after their players.
    const body = await page.locator('body').innerText();
    expect(body).toContain('Craig & Jym');
    expect(body).toContain('Dave & Rick');
    expect(body).toContain('Sam & Tony');

    // Three standings rows, and the money sums to zero (pairwise round-robin, DECISIONS 5.ae).
    const rows = page.locator('table tbody tr');
    expect(await rows.count()).toBeGreaterThanOrEqual(3);

    await page.screenshot({ path: 'e2e/screenshots/three-sides-leaderboard.png', fullPage: true });
  });

  test('the board shows the TO PAR figure it ranks on', async ({ page }) => {
    await seed(page, 'Three sides in one group');
    // DECISIONS 5.af: a side game under 'total' scoring ranks on score to par, and used to
    // display only the raw total — so the order looked wrong with nothing explaining it.
    await expect(page.getByRole('columnheader', { name: 'To par' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Thru' })).toBeVisible();
  });

  test('side C, thru fewer holes, is not paid for playing less golf', async ({ page }) => {
    await seed(page, 'Three sides in one group');
    const body = await page.locator('body').innerText();
    // The seed has side C twelve holes in while A and B are done, and C playing WORSE.
    // On raw totals C's lower total would have ranked it first; on to-par it is last.
    const cRow = page.locator('tr', { hasText: 'Sam & Tony' }).first();
    await expect(cRow).toBeVisible();
    // C is last of the three, and owes money rather than collecting it.
    expect(body).toContain('Sam & Tony');
    const cText = await cRow.innerText();
    expect(cText).toMatch(/−\$/);   // a loss, using the app's minus sign
  });

  // Both of these were found by LOOKING at three-sides-leaderboard.png, not by reading code.
  test('a bad to-par is drawn red, not the same grey as a good one', async ({ page }) => {
    await seed(page, 'Three sides in one group');
    // Side A is -4 (good), side C is +18 (bad). They rendered identically until this fix, so
    // being 18 over par read as unremarkable. Colour keys on the BASIS: under strokes lower is
    // better, so a positive to-par is red.
    const aRow = page.locator('tr', { hasText: 'Craig & Jym' }).first();
    const cRow = page.locator('tr', { hasText: 'Sam & Tony' }).first();
    await expect(aRow.locator('span.text-green-400')).toHaveCount(1);
    await expect(cRow.locator('span.text-red-400')).toHaveCount(1);
  });

  // F-014 moved names out of the generic settings bag and into the Sides editor, one field per
  // side that exists. The INTENT of this test is unchanged — naming side C must reach the board —
  // only the control moved.
  test('a third side can be NAMED, and unused name boxes stay hidden', async ({ page }) => {
    const id = await seed(page, 'Three sides in one group');
    await page.goto(`${BASE}/pool/${id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await expect(page.getByText('Sides / Match options')).toBeVisible();

    // The names are no longer settings, so the settings editor must not offer them at all.
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
      await expect(page.getByLabel(`Side ${letter} name`)).toHaveCount(0);
    }

    // They live behind a disclosure in the Sides editor, closed by default — almost nobody
    // names their sides, so "just the usual game" never sees these fields.
    await page.getByRole('button', { name: /Name the sides/ }).click();
    // Exactly three fields, for the three sides this game HAS. No box for a side that
    // doesn't exist, which is what the old six-static-keys arrangement couldn't express.
    await expect(page.getByLabel('Side A')).toBeVisible();
    await expect(page.getByLabel('Side C')).toBeVisible();
    await expect(page.getByLabel('Side D')).toHaveCount(0);

    // Naming side C actually reaches the leaderboard.
    await page.getByLabel('Side C').fill('The Cats');
    await page.getByLabel('Side C').blur();
    await page.goto(`${BASE}/pool/${id}/leaderboard`);
    // Appears in BOTH the standings row and the player-details side tag — that consistency is
    // the point (a name that reached one surface and not the other is the F-006 "Team A" bug).
    await expect(page.getByRole('cell', { name: 'The Cats', exact: true })).toBeVisible();
    expect(await page.getByText('The Cats').count()).toBe(2);
    await page.screenshot({ path: 'e2e/screenshots/three-sides-named.png', fullPage: true });
  });

  test('the hub can add and remove a side', async ({ page }) => {
    const id = await seed(page, 'Three sides in one group');
    await page.goto(`${BASE}/pool/${id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await expect(page.getByText('Sides / Match options')).toBeVisible();

    // Three side buttons per player row, and the controls to change that.
    await expect(page.getByRole('button', { name: 'Remove side C' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add a side' })).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/three-sides-hub.png', fullPage: true });

    // Adding a fourth side gives every player a D button to tap.
    await page.getByRole('button', { name: '+ Add a side' }).click();
    await expect(page.getByRole('button', { name: 'Remove side D' })).toBeVisible();
  });
});

test.describe('F-006: a side game can play a POT', () => {
  // DECISIONS 5.ag. The side game only had margin money models until now.
  test('the board shows the pot and pays the best side', async ({ page }) => {
    await seed(page, 'Three sides playing a POT');
    const body = await page.locator('body').innerText();

    // Three sides of 3 / 2 / 1 at $20 a SIDE = $60, not 6 x $20 = $120. That's the whole
    // point of the per-side ante: the solo player has the same stake as the trio.
    expect(body).toContain('$60 pot');

    // Somebody is paid and somebody pays — a pot board where no money moved would pass a
    // zero-sum check trivially.
    expect(body).toMatch(/\+\$/);
    expect(body).toMatch(/−\$/);

    await page.screenshot({ path: 'e2e/screenshots/three-sides-pot.png', fullPage: true });
  });

  test('the buy-in and split fields appear only for a pot game', async ({ page }) => {
    const id = await seed(page, 'Three sides playing a POT');
    await page.goto(`${BASE}/pool/${id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await expect(page.getByLabel('Buy-in ($ / side)')).toBeVisible();
    await expect(page.getByLabel('Pot split (%)')).toBeVisible();
    // The margin models' fields are hidden while a pot is selected.
    await expect(page.getByLabel('$ per point')).toHaveCount(0);

    // Switching to a margin model hides the pot fields again (showIf, both directions).
    await page.getByLabel('Money', { exact: true }).selectOption('per-point');
    await expect(page.getByLabel('Buy-in ($ / side)')).toHaveCount(0);
    await expect(page.getByLabel('$ per point')).toBeVisible();
  });
});

test.describe('F-013: the scorecard with three sides', () => {
  // DECISIONS 5.ah. The card used to be able to express only two sides, so a 3+ side game
  // showed no team row at all. It now draws one row per side FROM THE ENGINE, so the card and
  // the money cannot disagree.
  test('draws a row per side, with rank + margin in the game own unit', async ({ page }) => {
    const id = await seed(page, 'Three sides in one group');
    await page.goto(`${BASE}/pool/${id}`);
    await page.getByRole('button', { name: /enter scores/i }).first().click();
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Finish Game' })).toBeVisible();

    const body = await page.locator('body').innerText();
    // All three sides have a row, named as the leaderboard names them.
    expect(body).toContain('Craig & Jym');
    expect(body).toContain('Dave & Rick');
    expect(body).toContain('Sam & Tony');
    // Rank + margin, not a two-side "2 UP" badge. This is a stroke game, so the unit is to-par.
    expect(body).toMatch(/1st · /);
    expect(body).not.toMatch(/\d+ UP/);
    // And the header says how many sides are playing — it read "Stroke Play · Best Ball · Full
    // Handicap" for a three-side game, true but silent about the surprising part.
    expect(body).toContain('3 sides');

    await page.screenshot({ path: 'e2e/screenshots/three-sides-scorecard.png', fullPage: true });
  });

  test('every player can still enter a score, including on the third side', async ({ page }) => {
    const id = await seed(page, 'Three sides in one group');
    await page.goto(`${BASE}/pool/${id}`);
    await page.getByRole('button', { name: /enter scores/i }).first().click();
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
    // Six players on three sides — all six must be scoreable, or the third side can't play.
    for (const name of ['Craig', 'Jym', 'Dave', 'Rick', 'Sam', 'Tony']) {
      await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
    }
  });

  test('a TWO-side game keeps its familiar UP/DN badge', async ({ page }) => {
    // The engine rows are for 3+ only; two sides must be untouched.
    await seed(page, '2v2 best ball — mid-round');
    await page.getByRole('button', { name: /enter scores/i }).first().click();
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/UP|DN|AS|ahead|back/);
    expect(body).not.toMatch(/1st · /);
  });
});

// F-016 / F-016b — DECISIONS.md §5.ai. A leg is judged over the holes EVERY side played, and
// close-out asks whether a leg nobody finished should pay at all. Craig's call:
// "if someone clicks finish game, and all legs are not complete, it should prompt the user."
test.describe('F-016b: close-out asks about legs nobody finished', () => {
  test('the prompt names only the SHORT legs, and the money follows the answer', async ({ page }) => {
    const id = await seed(page, 'side C walked in at 12');
    await page.goto(`${BASE}/pool/${id}/leaderboard`);
    await page.waitForLoadState('networkidle');
    const before = await page.locator('body').innerText();
    // All three legs pay while the game is open: A collects front + back + overall.
    expect(before).toContain('+$80');

    await page.goto(`${BASE}/pool/${id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Close out game' }).first().click();

    const prompt = page.locator('div.p-4.border-b.bg-amber-50');
    await expect(prompt).toBeVisible();
    const askText = await prompt.innerText();
    // The two short legs are named, with how many holes everyone actually played...
    expect(askText).toContain('Back 9');
    expect(askText).toContain('3 of 9 holes');
    expect(askText).toContain('Overall 18');
    expect(askText).toContain('12 of 18 holes');
    // ...and the front nine, which every side finished, is NOT asked about.
    expect(askText).not.toContain('Front 9');
    // Only ONE close-out button while asking — two would read as a way to skip the question.
    expect(await page.getByRole('button', { name: 'Close out game' }).count()).toBe(1);

    await page.getByRole('button', { name: 'Close out game' }).click();
    await expect(page.getByText('Game closed out')).toBeVisible();
    // The hub says the game has voided legs, so the smaller money isn't mistaken for a bug.
    expect(await page.locator('body').innerText()).toMatch(/legs pay nothing/);

    // Only the completed front nine settles: $10 from each of two losers.
    await page.goto(`${BASE}/pool/${id}/leaderboard`);
    await page.waitForLoadState('networkidle');
    const after = await page.locator('body').innerText();
    expect(after).toContain('+$20');
    expect(after).not.toContain('+$80');
    // And the board explains WHY, rather than silently showing a smaller number.
    expect(after).toContain('pays nothing — unfinished');
  });

  test('unticking a leg pays it on the holes everyone played', async ({ page }) => {
    const id = await seed(page, 'side C walked in at 12');
    await page.goto(`${BASE}/pool/${id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Close out game' }).first().click();
    // Untick BOTH, so every leg pays as it did before — the "settle it on what we played" answer.
    const prompt = page.locator('div.p-4.border-b.bg-amber-50');
    for (const box of await prompt.locator('input[type="checkbox"]').all()) await box.uncheck();
    await page.getByRole('button', { name: 'Close out game' }).click();
    await expect(page.getByText('Game closed out')).toBeVisible();
    // No void was recorded, so the hub says nothing about voided legs.
    expect(await page.locator('body').innerText()).not.toMatch(/legs pay nothing/);

    await page.goto(`${BASE}/pool/${id}/leaderboard`);
    await page.waitForLoadState('networkidle');
    expect(await page.locator('body').innerText()).toContain('+$80');
  });

  test('a fully-scored game is asked nothing', async ({ page }) => {
    const id = await seed(page, 'Classic pool — 2 foursomes, FULLY scored');
    await page.goto(`${BASE}/pool/${id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Close out game' }).first().click();
    // Straight to completed, no prompt in the way.
    await expect(page.getByText('Game closed out')).toBeVisible();
  });
});

// F-015 — the hub's READ-ONLY money panel is what every player sees without tapping Edit. On a
// plain 2v2 six of its eleven rows were empty "Side A name".."Side F name" labels. Fixed
// generically: a read-only summary never prints a row whose value is blank.
test.describe('F-015: a read-only summary prints no empty rows', () => {
  test('an UNNAMED side shows no name row at all', async ({ page }) => {
    const id = await seed(page, '2v2 best ball — mid-round');
    await page.goto(`${BASE}/pool/${id}`);
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').innerText();

    // The panel still shows the settings that HAVE values.
    expect(body).toContain('Team format');
    expect(body).toContain('Front 9 ($)');
    // But not one of the six side-name labels, since this game named no sides.
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(body, `Side ${letter} name must not appear unnamed`).not.toContain(`Side ${letter} name`);
    }
  });

  // F-014 migration, end to end: a game SAVED with the old `sideAName`/`sideBName` settings must
  // still show its names everywhere, with no migration step. This is the compatibility claim the
  // whole change rests on, so it's asserted on real screens rather than only in a unit test.
  test('a game saved with the LEGACY name settings keeps its names', async ({ page }) => {
    // This seed sets sideAName 'The Hogs' / sideBName 'The Dawgs' — the pre-F-014 shape.
    const id = await seed(page, '2v2 on a nine — complete');

    // The leaderboard names the sides from the migrated values.
    await page.goto(`${BASE}/pool/${id}/leaderboard`);
    await page.waitForLoadState('networkidle');
    const board = await page.locator('body').innerText();
    expect(board).toContain('The Hogs');
    expect(board).toContain('The Dawgs');

    // And the Sides editor shows them as editable values, not as empty boxes over a stale
    // setting — proving they were absorbed onto the sides rather than merely displayed.
    await page.goto(`${BASE}/pool/${id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    // The disclosure opens ITSELF when a side already has a name, so an existing game's names
    // are never hidden from whoever is editing them.
    await expect(page.getByLabel('Side A')).toHaveValue('The Hogs');
    await expect(page.getByLabel('Side B')).toHaveValue('The Dawgs');

    // The old settings rows are gone from the read-only panel entirely.
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(await page.getByLabel(`Side ${letter} name`).count()).toBe(0);
    }
  });
});

// F-018 — the last screen before money changes hands used to say only "Players 6 · Group size
// 4-8 · Foursomes" over one flat list of names: not how many sides, not who was with whom, not
// the stakes. Confirming the pairings is the whole job of a review step.
//
// Also covers F-014's payoff (side C is nameable in the wizard now) and §5.al (say "side", not
// "foursome", in a side game).
test.describe('F-018: the wizard review step confirms the sides', () => {
  async function buildSideGame(page: import('@playwright/test').Page, opts: {
    players: [string, string][]; thirdSide?: boolean; nameC?: string;
  }) {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForURL(/\/pool\/new/, { timeout: 15_000 });

    await page.getByPlaceholder('e.g. Saturday Pool').fill('Review Test');
    // Select by VALUE, not label: F-020 appends a fit badge to option labels once a field
    // exists, so a label match is fragile even where it happens to work today.
    await page.locator('select').first().selectOption('team-2v2');
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Add Players/ }).click();
    for (const [nm, hcp] of opts.players) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    // F-019: a side game with MORE THAN FOUR players now picks its playing groups first (they
    // can't all walk together), so the path to the Sides step runs through the Groups step. At
    // four or fewer it goes straight there, exactly as before.
    //
    // §5.al: either way a side game says "Sides"/"Groups" on the way, never "Teams".
    const viaGroups = opts.players.length > 4;
    await page.getByRole('button', { name: viaGroups ? 'Next: Set Groups' : 'Next: Set Sides' }).click();
    await page.getByRole('button', { name: viaGroups ? 'Next: Groups' : 'Next: Sides' }).click();
    if (viaGroups) {
      // Accept the proposed groups untouched — this helper is about the SIDES steps.
      await page.getByRole('button', { name: 'Next: Sides' }).click();
    }
    if (opts.thirdSide) {
      await page.getByRole('button', { name: '+ Add a side' }).click();
      for (const nm of [opts.players[4][0], opts.players[5][0]]) {
        const row = page.locator('div.flex.items-center.justify-between', { hasText: nm }).first();
        await row.getByRole('button', { name: 'C', exact: true }).click();
      }
    }
    if (opts.nameC) {
      await page.getByRole('button', { name: /Name the sides/ }).click();
      await page.getByLabel('Side C').fill(opts.nameC);
    }
    await page.getByRole('button', { name: /Next: Review/ }).click();
  }

  test('a 2v2 review shows both sides, their members, and the stakes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await buildSideGame(page, { players: [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16']] });
    const body = await page.locator('body').innerText();

    expect(body).toContain('Sides (2 vs 2)');
    // Named exactly as the leaderboard will name them — same resolver.
    expect(body).toMatch(/Craig & \w+/);
    // The stakes in words, so the review confirms what's being played for.
    expect(body).toContain('$10 front / $10 back / $10 overall');
    // "Foursomes" is the wrong word for this mode (§5.al).
    expect(body).not.toContain('Foursomes');
    // And the heading isn't a raw HTML entity (it read "Review &amp; create").
    expect(body).toContain('Review & create');
    expect(body).not.toContain('&amp;');
  });

  test('a 3-side review names all three, including one named in the wizard', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await buildSideGame(page, {
      players: [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6'], ['Tony', '14']],
      thirdSide: true,
      nameC: 'The Cats',
    });
    const body = await page.locator('body').innerText();

    expect(body).toContain('Sides (2 vs 2 vs 2)');
    // F-014's payoff: before, side C could never be named anywhere in the wizard.
    expect(body).toContain('The Cats');
    // At 3+ sides each leg is collected from EVERY side behind (§5.aj), which is not obvious
    // from the numbers alone — so the summary says it.
    expect(body).toContain('every side behind');
    await page.screenshot({ path: 'e2e/screenshots/f018-review-three-sides.png', fullPage: true });
  });
});

// ---------------------------------------------------------------------------
// F-019 — playing groups and sides are INDEPENDENT axes (DECISIONS.md §5.an)
// ---------------------------------------------------------------------------
//
// A side game used to force every player into ONE playing group, so at eight players it claimed
// "1 foursome" of eight, printed one card for all of them, and — the part the code review missed —
// settled four sides off FOUR players' scores, each side's group-2 partner silently absent.
//
// These tests drive the two-tee-time seed, which is the ordinary real-world case: eight guys, two
// tee times, playing sides across them.
test.describe('F-019: a side game with two playing groups', () => {
  test('F-019: the money reads BOTH groups — a partner in the other foursome counts', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const id = await seed(page, 'F-019: 8 players, TWO tee times, four sides');
    await page.goto(`${BASE}/pool/${id}/leaderboard`);
    await expect(page.getByText('STANDINGS')).toBeVisible();

    const body = await page.locator('body').innerText();
    // All four sides on the board, by their names.
    for (const side of ['The Hogs', 'The Dawgs', 'The Cats', 'The Rats']) {
      expect(body).toContain(side);
    }

    // THE ASSERTION THAT WOULD HAVE CAUGHT THE BUG. Each side pairs a group-1 player with a
    // group-2 player, and the seed gives group 2 the low ball for two of the four sides. Reading
    // group 1 alone made every side's total its group-1 member's card, so The Hogs led on Craig's
    // 68 alone. With both groups read, The Dawgs win on their group-2 partner's 59.
    //
    // Scoped to the STANDINGS block: the player-details grid further down lists raw per-player
    // gross/net totals, and matching against the whole page picks those up instead (the first
    // draft of this test did exactly that and failed for the wrong reason).
    const standings = body.slice(body.indexOf('STANDINGS'), body.indexOf('FRONT'));
    // The winning side, and its winning number, in the same row.
    expect(standings).toMatch(/1\s+The Dawgs\s+59/);
    // The Hogs are SECOND now — under the old behaviour they led.
    expect(standings).toMatch(/2\s+The Hogs/);

    // Zero-sum, on screen: the dollar column must cancel. This is the invariant AGENTS.md asks
    // for, asserted where a golfer would read it rather than only in the compute layer.
    const money = [...body.matchAll(/([+−-])\$(\d+)/g)]
      .map(([, sign, n]) => (sign === '+' ? 1 : -1) * Number(n));
    expect(money.length).toBeGreaterThanOrEqual(4);
    expect(money.reduce((s, x) => s + x, 0)).toBe(0);

    await page.screenshot({ path: 'e2e/screenshots/f019-two-groups-leaderboard.png', fullPage: true });
  });

  test('F-019: the player grid lists EVERY group, not just the first', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const id = await seed(page, 'F-019: 8 players, TWO tee times, four sides');
    await page.goto(`${BASE}/pool/${id}/leaderboard`);
    await expect(page.getByText('PLAYER DETAILS')).toBeVisible();

    const body = await page.locator('body').innerText();
    // Group 1 (was the only group shown) AND group 2 (was missing entirely) — eight names under a
    // board that settles eight players.
    for (const name of ['Craig', 'Jym', 'Dave', 'Rick', 'Sam', 'Tony', 'Will', 'Gary']) {
      expect(body).toContain(name);
    }
  });

  test('F-019: the teams sheet prints a box per tee time', async ({ page }) => {
    const id = await seed(page, 'F-019: 8 players, TWO tee times, four sides');
    await page.goto(`${BASE}/pool/${id}/teams`);
    await expect(page.getByText('Two Tee Times', { exact: false }).first()).toBeVisible();

    const body = await page.locator('body').innerText();
    expect(body).toContain('Group 1');
    expect(body).toContain('Group 2');
    // The two tee times, which a single-group game could not express.
    expect(body).toContain('8:10');
    expect(body).toContain('8:20');
    await page.screenshot({ path: 'e2e/screenshots/f019-teams-two-groups.png', fullPage: true });
  });

  // Craig's actual question — "Shouldnt we break down the teams sheet by tee time/teams?" — was
  // about BOTH axes. The groups were already there; the SIDES were not, so the sheet that gets
  // sent out showed who walks together and nothing about who plays whom.
  test('F-019: the teams sheet carries the SIDES as well as the tee groups', async ({ page }) => {
    const id = await seed(page, 'F-019: 8 players, TWO tee times, four sides');
    await page.goto(`${BASE}/pool/${id}/teams`);
    await expect(page.getByText('Two Tee Times', { exact: false }).first()).toBeVisible();

    const body = await page.locator('body').innerText();
    // A Sides block, naming all four.
    expect(body).toContain('Sides');
    for (const side of ['The Hogs', 'The Dawgs', 'The Cats', 'The Rats']) {
      expect(body).toContain(side);
    }
    // And it says the surprising part out loud, because the sheet is read without the app.
    expect(body).toMatch(/partners may be in different groups/i);
    // Each side names which group its members walk with, so a crossing side is legible.
    expect(body).toMatch(/Craig[\s\S]{0,30}\(Group 1\)/);

    // §5.al / UI_CONVENTIONS §2: a side game never prints "foursome", and the captain key is
    // absent when no captain is set (the old footer always claimed "(C) = captain").
    expect(body).toContain('8 players · 2 groups');
    expect(body).not.toContain('foursome');
    expect(body).not.toContain('(C) = captain');
  });

  test('F-019: a 3-player group is never called a foursome', async ({ page }) => {
    const id = await seed(page, 'F-019: 7 players as 4 + 3');
    await page.goto(`${BASE}/pool/${id}/teams`);
    await expect(page.getByText('Foursome And A Threesome', { exact: false }).first()).toBeVisible();
    const sheet = await page.locator('body').innerText();
    expect(sheet).toContain('7 players · 2 groups');
    expect(sheet).not.toContain('foursome');
    // The guest on nobody's side is named rather than silently absent from the money.
    expect(sheet).toMatch(/Playing along, not on a side:[\s\S]{0,30}Will/);
    await page.screenshot({ path: 'e2e/screenshots/f019-teams-threesome.png', fullPage: true });

    // The printable scorecards say it too — one card per group, and no "per foursome" caption on
    // the threesome's card.
    await page.goto(`${BASE}/pool/${id}/scorecards`);
    const cards = await page.locator('body').innerText();
    expect(cards).toContain('2 groups');
    expect(cards).toContain('Group 1');
    expect(cards).toContain('Group 2');
  });

  // The classic pool must keep saying "foursome" — the vocabulary rule is per-axis, not a global
  // find-and-replace (§5.al: the pool keeps "team" and "foursome" unchanged).
  test('F-019: a classic pool of foursomes still says foursomes', async ({ page }) => {
    const id = await seed(page, 'Classic pool — 2 foursomes, mid-round');
    await page.goto(`${BASE}/pool/${id}/teams`);
    const sheet = await page.locator('body').innerText();
    expect(sheet).toContain('2 foursomes');
    // And no Sides block, because a pool has none.
    expect(sheet).not.toMatch(/partners may be in different groups/i);
  });

  test('F-019: a threesome and a guest on nobody\'s side', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const id = await seed(page, 'F-019: 7 players as 4 + 3');
    await page.goto(`${BASE}/pool/${id}/leaderboard`);
    await expect(page.getByText('STANDINGS')).toBeVisible();

    const body = await page.locator('body').innerText();
    // Will is in a playing group but on NO side: he must appear as a player...
    expect(body).toContain('Will');
    // ...and the money must still be zero-sum across the three sides that do exist.
    const money = [...body.matchAll(/([+−-])\$(\d+)/g)]
      .map(([, sign, n]) => (sign === '+' ? 1 : -1) * Number(n));
    expect(money.reduce((s, x) => s + x, 0)).toBe(0);
    await page.screenshot({ path: 'e2e/screenshots/f019-threesome-guest.png', fullPage: true });
  });

  // The regression direction that matters most: every side game in the live database has one
  // group, and must look and settle exactly as it did.
  test('F-019: an ordinary ONE-group 2v2 is unchanged', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const id = await seed(page, 'F-019 control: 4 players, ONE group');
    await page.goto(`${BASE}/pool/${id}/leaderboard`);
    await expect(page.getByText('STANDINGS')).toBeVisible();

    const body = await page.locator('body').innerText();
    expect(body).toContain('Craig & Rick');
    expect(body).toContain('Jym & Dave');
    // The pinned figures from one-group-golden: A wins the front by 4, the back by 6, overall 10.
    expect(body).toMatch(/Craig & Rick by 4/);
    expect(body).toMatch(/Craig & Rick by 10/);
    const money = [...body.matchAll(/([+−-])\$(\d+)/g)]
      .map(([, sign, n]) => (sign === '+' ? 1 : -1) * Number(n));
    expect(money.reduce((s, x) => s + x, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// F-019 — the SCORECARD's side totals also span every group
// ---------------------------------------------------------------------------
//
// Separate describe because it drives the scorecard rather than a read-only sheet. §5.ah made the
// card read side totals FROM THE ENGINE so the card and the money can never disagree — but it
// handed the engine only its OWN group's scores. With two tee times that made each side's total
// its in-my-group member alone, so a card in group 1 and the leaderboard showed different numbers
// for the same side. The card must assemble every group's rows, as PoolOverviewPanel does.
test.describe('F-019: the scorecard agrees with the leaderboard across groups', () => {
  test('F-019: side totals on the card match the board when partners are split', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const id = await seed(page, 'F-019: 8 players, TWO tee times, four sides');

    // What the BOARD says each side scored — the engine's answer, over both groups.
    await page.goto(`${BASE}/pool/${id}/leaderboard`);
    await expect(page.getByText('STANDINGS')).toBeVisible();
    const boardBody = await page.locator('body').innerText();
    const standings = boardBody.slice(boardBody.indexOf('STANDINGS'), boardBody.indexOf('FRONT'));
    const boardDawgs = standings.match(/The Dawgs\s+(\d+)/)?.[1];
    expect(boardDawgs).toBeTruthy();

    // Now the CARD for group 1. The Dawgs' low ball belongs to their group-2 member, so a card
    // that reads only group 1 must show a different (worse) figure — this is the disagreement.
    await page.goto(`${BASE}/pool/${id}`);
    await page.getByRole('button', { name: /enter scores/i }).first().click();
    await page.waitForURL(/\/game\/play/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Finish Game' })).toBeVisible();

    const cardBody = await page.locator('body').innerText();
    // The card names all four sides (it reads them from the engine).
    expect(cardBody).toContain('The Dawgs');
    // And its figure for the Dawgs is the SAME number the board showed. The card's side row reads
    // "The Dawgs <per-hole cells> <IN> <TOT><rank>", so match the total anywhere in that row.
    const dawgsRow = cardBody.split('\n').find((l) => l.includes('The Dawgs')) ?? '';
    expect(dawgsRow).toContain(boardDawgs!);
    // A card reading only its OWN group would show The Hogs leading (Craig's 68) — assert the
    // card's own ranking agrees with the board's instead.
    expect(dawgsRow).toContain('1st');

    await page.screenshot({ path: 'e2e/screenshots/f019-scorecard-two-groups.png', fullPage: true });
  });
});

// ---------------------------------------------------------------------------
// F-020 — the player count RECOMMENDS games instead of refusing them late
// ---------------------------------------------------------------------------
//
// Every mode declares playersMin/playersMax, and the app used them only to scold, five steps after
// the game was picked: "Wolf is played in a single group of 4–4 players — you have 5. Go back to
// Field." It held the constraint and spent it on a rejection (§5.ao).
//
// Craig chose option D, built as two pieces; this is B — annotate the picker live.
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

  async function buildField(page: import('@playwright/test').Page, players: [string, string][]) {
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Add Players/ }).click();
    for (const [nm, hcp] of players) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
  }

  // Back to step 1 — the move the whole feature relies on being normal.
  async function backToPicker(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /Back/ }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /Back/ }).first().click();
    await expect(page.getByText('Which game are you playing?')).toBeVisible();
  }

  // THE REGRESSION GUARD. The picker comes BEFORE the field, so on a first pass there is nothing
  // to judge — and marking every game with a cross before anyone has been added would be noise at
  // exactly the wrong moment.
  test('F-020: says NOTHING about fit before there is a field', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startWizard(page);
    await page.getByPlaceholder('e.g. Saturday Pool').fill('Fit Test');

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('✓');
    expect(body).not.toMatch(/too many/);
    expect(body).not.toMatch(/needs \d+ more/);
    expect(body).not.toMatch(/needs exactly/);
    // And no misfit banner, obviously — there's no field to misfit.
    expect(body).not.toMatch(/you have 0/);
    await page.screenshot({ path: 'e2e/screenshots/f020-first-pass.png', fullPage: true });
  });

  test('F-020: with a field, every game says how it fits', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startWizard(page);
    await page.getByPlaceholder('e.g. Saturday Pool').fill('Fit Test');
    await buildField(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);
    await backToPicker(page);

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
    await page.getByPlaceholder('e.g. Saturday Pool').fill('Fit Test');
    await buildField(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);
    await backToPicker(page);

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
  });

  // F-019 falsified two strings that claimed a side game is played "within a single group". A side
  // game can now be 8 players across two tee times, so nothing may claim how the field walks.
  test('F-020: no screen claims a side game is played in a single group', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startWizard(page);
    await page.getByPlaceholder('e.g. Saturday Pool').fill('Fit Test');
    await page.locator('select').first().selectOption('team-2v2');

    const picker = await page.locator('body').innerText();
    expect(picker).not.toMatch(/single group/i);
    // 2–8 since a singles match became reachable (2026-08-27) — the sentence states what the game
    // needs and never how the field walks.
    expect(picker).toContain('For 2–8 players.');

    // And the review step, which said "is played in a single group of 4–4 players".
    await buildField(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);
    await page.getByRole('button', { name: 'Next: Set Groups' }).click();
    await page.getByRole('button', { name: 'Next: Groups' }).click();
    await page.getByRole('button', { name: 'Next: Sides' }).click();
    await page.getByRole('button', { name: /Next: Review/ }).click();
    const review = await page.locator('body').innerText();
    expect(review).not.toMatch(/single group/i);
    expect(review).not.toMatch(/go back to field/i);
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

    // Everything the format stores has been applied: the mode, the Nassau legs, and the handicap
    // rules. This is the assertion that would catch a broken seed composition.
    // Assert on VALUES, not innerText. A <select>'s chosen option and an <input>'s value are not
    // page text — the first draft of this test read innerText and passed only when a stale wizard
    // draft happened to leave the same words visible elsewhere, so it failed once the audit spec
    // ran first. Values are what the format actually set.
    // With a format applied the name is the summary panel's editable TITLE (F-021), not the
    // "What should we call it?" field — that one only exists for a from-scratch game.
    await expect(page.getByLabel('Game style name')).toHaveValue('Saturday Nassau');
    await expect(page.locator('select').first()).toHaveValue('team-2v2');
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
    await expect(page.getByRole('button', { name: 'Only above the best player' }))
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
    await page.getByRole('button', { name: 'Everyone, in full' }).click();

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
    await expect(page.getByText('STANDINGS')).toBeVisible();

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

    await page.getByPlaceholder('e.g. Saturday Pool').fill('Craig v Jym');
    await page.locator('select').first().selectOption('team-2v2');
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Add Players/ }).click();
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12']]) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }

    // Back to the picker: the mode must now say it FITS two players. This is the assertion that
    // fails on the old playersMin: 4.
    await page.getByRole('button', { name: /Back/ }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /Back/ }).first().click();
    await expect(page.getByText('Which game are you playing?')).toBeVisible();
    const picker = await page.locator('body').innerText();
    expect(picker).toMatch(/Sides \/ Match — ✓ 2 players/);
    // And the mode no longer calls itself "within group" — F-019 falsified that, and at two
    // players a 1v1 has no group to be within (§5.at).
    expect(picker).not.toContain('within group');

    // Forward to the sides step: 1 vs 1, seeded one player each, and no split chooser because
    // 1v1 is the only shape two players can take.
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Next: Add Players/ }).click();
    await page.getByRole('button', { name: 'Next: Set Sides' }).click();
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
    await expect(page.getByText('STANDINGS')).toBeVisible();
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

    await page.getByPlaceholder('e.g. Saturday Pool').fill('Split Test');
    await page.locator('select').first().selectOption('team-2v2');
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Add Players/ }).click();
    for (const [nm, hcp] of players) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    // Five players need tee groups (F-019), so the path runs through the Groups step.
    const viaGroups = players.length > 4;
    await page.getByRole('button', { name: viaGroups ? 'Next: Set Groups' : 'Next: Set Sides' }).click();
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
    const firstRow = page.locator('div.flex.items-center.justify-between', { hasText: 'Craig' }).first();
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
test.describe('F-019: a fifth player in a scored group', () => {
  test('F-019: the hub prompts, and keeping one group changes nothing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, 'F-019: a 5th player joined a SCORED group of 4');

    // The prompt names the problem in plain words, and promises the scores are safe.
    await expect(page.getByText('5 players in Group 1')).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/More than four can.t play as one group/);
    expect(body).toMatch(/scores already entered\s*are kept either way/i);
    await page.screenshot({ path: 'e2e/screenshots/f019-fifth-player-prompt.png', fullPage: true });

    // Keeping is offered FIRST and does nothing but dismiss.
    await page.getByRole('button', { name: 'Keep one group' }).click();
    await expect(page.getByText('5 players in Group 1')).toBeHidden();
    const after = await page.locator('body').innerText();
    // Still one group, still five players.
    expect(after).toContain('Group 1');
    expect(after).not.toContain('Group 2');
  });

  test('F-019: splitting 3 + 2 CARRIES the scores already entered', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const id = await seed(page, 'F-019: a 5th player joined a SCORED group of 4');

    // What the board says BEFORE the split — the money must be identical after, because splitting
    // changes the tee sheet and not the sides.
    await goToGame(page, id, '/leaderboard');
    await expect(page.getByText('STANDINGS')).toBeVisible();
    const before = await page.locator('body').innerText();
    const beforeStandings = before.slice(before.indexOf('STANDINGS'), before.indexOf('FRONT'));
    expect(beforeStandings).toMatch(/thru|7/);

    // Split into 3 + 2.
    await goToGame(page, id);
    await page.getByRole('button', { name: 'Split into groups' }).click();
    await page.getByRole('button', { name: /3 \+ 2/ }).click();

    // Two groups now.
    await expect(page.getByText('Group 2')).toBeVisible();
    const hub = await page.locator('body').innerText();
    expect(hub).toContain('Group 1');
    expect(hub).toContain('Group 2');
    // And the prompt is gone, because nothing is oversized any more.
    expect(hub).not.toContain('players in Group 1');

    // THE ASSERTION THAT MATTERS: the scores travelled with the players. A split that lost them
    // would show an unscored game here.
    await goToGame(page, id, '/leaderboard');
    await expect(page.getByText('STANDINGS')).toBeVisible();
    const after = await page.locator('body').innerText();
    const afterStandings = after.slice(after.indexOf('STANDINGS'), after.indexOf('FRONT'));
    // Both sides still ranked off seven holes of real scores.
    expect(afterStandings).toContain('The Hogs');
    expect(afterStandings).toContain('The Dawgs');
    expect(after).not.toContain('No scores yet');
    // The money is unchanged: the sides never moved, only the tee sheet did.
    const moneyOf = (s: string) => [...s.matchAll(/([+−-])\$(\d+)/g)]
      .map(([, sign, n]) => (sign === '+' ? 1 : -1) * Number(n)).sort((a, b) => a - b);
    expect(moneyOf(afterStandings)).toEqual(moneyOf(beforeStandings));
    await page.screenshot({ path: 'e2e/screenshots/f019-after-split.png', fullPage: true });
  });

  // The case where the group COUNT SHRINKS — 5 + 1 + 1 re-dealt as 4 + 3 drops the third slot.
  // This is the harder re-deal: players move between slots in both directions at once.
  //
  // HONEST NOTE ON WHAT THIS DOES AND DOESN'T PROVE. It was written to catch a surviving mutation
  // (deleting the clear-unused-slots loop), and it does NOT — deleting that loop still passes.
  // Reading the call sites showed why: every reader keys off `game.teams`, so an abandoned
  // matchup's rows are unreachable, and the clear is defensive rather than load-bearing. Grep told
  // me where the ids came from; only reading them said what it meant (the §5.an lesson again).
  //
  // What it DOES prove is worth keeping: that a re-deal which moves players across three slots
  // preserves every score and every dollar.
  test('F-019: splitting to FEWER groups preserves every score', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const id = await seed(page, 'F-019: 7 players as 5 + 1 + 1');

    await goToGame(page, id, '/leaderboard');
    await expect(page.getByText('STANDINGS')).toBeVisible();
    const before = await page.locator('body').innerText();
    const beforeStandings = before.slice(before.indexOf('STANDINGS'), before.indexOf('FRONT'));

    await goToGame(page, id);
    await page.getByRole('button', { name: 'Split into groups' }).click();
    await page.getByRole('button', { name: /4 \+ 3/ }).click();

    // Three slots became two.
    await expect(page.getByText('Group 2')).toBeVisible();
    const hub = await page.locator('body').innerText();
    expect(hub).not.toContain('Group 3');

    // Every player is still scored exactly once. A duplicated row would move a side's total, so
    // compare the money: the sides never changed, so it must be identical.
    await goToGame(page, id, '/leaderboard');
    await expect(page.getByText('STANDINGS')).toBeVisible();
    const after = await page.locator('body').innerText();
    const afterStandings = after.slice(after.indexOf('STANDINGS'), after.indexOf('FRONT'));
    const moneyOf = (s: string) => [...s.matchAll(/([+−-])\$(\d+)/g)]
      .map(([, sign, n]) => (sign === '+' ? 1 : -1) * Number(n)).sort((a, b) => a - b);
    expect(moneyOf(afterStandings)).toEqual(moneyOf(beforeStandings));
    // And still zero-sum, the invariant a double-count breaks first.
    expect(moneyOf(afterStandings).reduce((s, x) => s + x, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// F-019 — the wizard asks WHO WALKS WITH WHOM before it asks about sides
// ---------------------------------------------------------------------------
//
// The engine can settle two groups, but until now nothing in the UI could CREATE one: the tees
// step auto-built a single "Group" holding the whole field. A side game with more than four
// players now gets a Groups step first — and, critically, one with four or fewer does NOT, so the
// ordinary 2v2 gains no taps.
test.describe('F-019: the wizard builds real playing groups', () => {
  async function startSideGame(page: import('@playwright/test').Page, players: [string, string][]) {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForURL(/\/pool\/new/, { timeout: 15_000 });

    await page.getByPlaceholder('e.g. Saturday Pool').fill('Groups Test');
    // Select by VALUE, not label: F-020 appends a fit badge to option labels once a field
    // exists, so a label match is fragile even where it happens to work today.
    await page.locator('select').first().selectOption('team-2v2');
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Add Players/ }).click();
    for (const [nm, hcp] of players) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
  }

  const EIGHT: [string, string][] = [
    ['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'],
    ['Sam', '6'], ['Tony', '14'], ['Will', '10'], ['Gary', '2'],
  ];

  test('F-019: eight players are asked how they split, and get two tee times', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startSideGame(page, EIGHT);

    // The field step now promises GROUPS for an 8-player side game, not Sides.
    await page.getByRole('button', { name: 'Next: Set Groups' }).click();
    await page.getByRole('button', { name: 'Next: Groups' }).click();

    // The Groups step: it says why it is asking, and offers the shapes that fit eight.
    await expect(page.getByRole('heading', { name: /playing together/ })).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).toContain('4 + 4');
    expect(body).toContain('3 + 3 + 2');
    // It never offers a shape golf does not play (§5.ao / groupShapesFor's `typical` rule).
    expect(body).not.toContain('2 + 2 + 2 + 2');
    // And it names the independence explicitly, since that is the surprising part.
    expect(body).toMatch(/partner can be in the other group/i);

    // Two groups, each with its own tee time input.
    expect(body).toContain('Group 1');
    expect(body).toContain('Group 2');
    const times = page.locator('input[type="time"]');
    await expect(times).toHaveCount(2);
    await times.nth(0).fill('08:10');
    await times.nth(1).fill('08:20');

    await page.screenshot({ path: 'e2e/screenshots/f019-wizard-groups.png', fullPage: true });

    // On to the sides, then create — and the saved game must hold TWO teams with those tee times.
    await page.getByRole('button', { name: 'Next: Sides' }).click();
    await expect(page.getByRole('button', { name: /Next: Review/ })).toBeVisible();
    await page.getByRole('button', { name: /Next: Review/ }).click();
    await page.getByRole('button', { name: /Create Game/i }).click();
    await page.waitForURL(/\/pool\/[^/]+$/, { timeout: 15_000 });

    // The teams sheet must show two groups with those tee times — the sheet Craig was looking at.
    // Navigate by CLICKING, not page.goto: the fake backend lives in this tab's JS heap for a
    // wizard-built game (it was never seeded into sessionStorage), so a reload would wipe it and
    // the sheet would render empty. This is the trap the seed() helper documents at the top.
    await page.getByRole('button', { name: 'Teams', exact: true }).click();
    await page.waitForURL(/\/teams/, { timeout: 15_000 });
    const sheet = await page.locator('body').innerText();
    expect(sheet).toContain('8:10');
    expect(sheet).toContain('8:20');
    expect(sheet).toContain('Group 1');
    expect(sheet).toContain('Group 2');
  });

  test('F-019: choosing 3 + 3 + 2 gives three groups', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startSideGame(page, EIGHT);
    await page.getByRole('button', { name: 'Next: Set Groups' }).click();
    await page.getByRole('button', { name: 'Next: Groups' }).click();

    await page.getByRole('button', { name: /3 \+ 3 \+ 2/ }).click();
    const body = await page.locator('body').innerText();
    expect(body).toContain('Group 3');
    await expect(page.locator('input[type="time"]')).toHaveCount(3);
  });

  // THE REGRESSION GUARD THAT MATTERS. An ordinary 2v2 must not gain a step: four players walk
  // together, there is nothing to ask, and asking would be the exposed complexity the north star
  // argues against.
  test('F-019: an ordinary 2v2 is NOT asked about groups', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startSideGame(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16']]);

    // Still says Sides, as it always did (§5.al).
    await expect(page.getByRole('button', { name: 'Next: Set Sides' })).toBeVisible();
    await page.getByRole('button', { name: 'Next: Set Sides' }).click();
    await page.getByRole('button', { name: 'Next: Sides' }).click();

    // Lands straight on the Sides step — no Groups step, no tee-time inputs.
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/playing together/i);
    expect(body).not.toContain('Group 1');
    await expect(page.getByRole('button', { name: /Next: Review/ })).toBeVisible();
  });

  test('F-019: five players get 3 + 2 without being asked (only one shape fits)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startSideGame(page, [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'], ['Sam', '6']]);
    await page.getByRole('button', { name: 'Next: Set Groups' }).click();
    await page.getByRole('button', { name: 'Next: Groups' }).click();

    await expect(page.getByRole('heading', { name: /playing together/ })).toBeVisible();
    const body = await page.locator('body').innerText();
    // Two groups exist...
    expect(body).toContain('Group 1');
    expect(body).toContain('Group 2');
    // ...but no shape CHOICE is offered, because 3+2 is the only thing that fits five under the
    // tee rules. groupShapeIsObvious(5, TEE) is true — see group-shapes.test.ts.
    expect(body).not.toContain('How do they split?');
  });
});
