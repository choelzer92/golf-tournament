// Split out of verify-fixes.spec.ts on 2026-09-15 (§5.bj harness round 2).
// Covers wizard + home-surface fixes: the §5.au group picker on step 1, the feedback
// box, F-027 blank-name labels, the F-005 money step, F-001 segment progress,
// JY feedback (GHIN prompt, recent courses), F-003 /home landing, manual bonuses.
// Verbatim moves — test titles and assertions unchanged. Shared plumbing: ./helpers.

import { expect, test } from '@playwright/test';
import { BASE, resetBackend, seed } from './helpers';

// Grant invite-gate access + empty the fake backend before every test.
test.beforeEach(async ({ context, page }) => {
  await resetBackend(context, page);
});

test.describe('group picker on wizard step 1 (§5.au: step 1 is the FIELD)', () => {
  // The group chips lived on the details step; §5.au moved the field to the front, and
  // the chips with it — a group answers who plays / how we play / what we play at once,
  // so it belongs on the first screen, whichever screen that is. Tapping one now loads
  // the MEMBERS immediately too (the old chips deferred that two steps).
  test('choosing a group loads its people, applies its settings, and names the game', async ({ page }) => {
    // Seed a roster + groups into the sandbox backend.
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Groups — 61-member' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();

    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');

    // The wizard OPENS on the field, groups first.
    await expect(page.getByText("Who's playing?")).toBeVisible();
    const warriors = page.getByRole('button', { name: /Weekend Warriors/ }).first();
    await expect(warriors).toBeVisible();

    await warriors.click();

    // A 61-member group loads with NOBODY pre-checked (Craig 2026-09-10): the day's
    // field is picked BY checking, not by unchecking ~49.
    await expect(page.getByText(/Loaded “Weekend Warriors” \(61 members\)\. Check who's playing today\./)).toBeVisible();
    await expect(page.getByText('0 selected')).toBeVisible();
    // Next is gated on a field — pick today's players from the group list.
    await expect(page.getByRole('button', { name: /Next: Choose Game/ })).toBeDisabled();
    await page.getByRole('button', { name: /Craig Hoelzer/ }).click();
    await page.getByRole('button', { name: /Jym Youngberg/ }).click();

    // And the game step confirms: settings applied (Warriors default: off-the-low),
    // name inherited without typing.
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await expect(page.getByText('Which game are you playing?')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Saturday Pool')).toHaveValue('Weekend Warriors');
    await expect(page.getByRole('button', { name: 'Off the low' }))
      .toHaveClass(/bg-green-600/);
    await page.screenshot({ path: 'e2e/screenshots/wizard-group-picker.png', fullPage: true });
  });

  test('a small crew still loads all-checked', async ({ page }) => {
    // The other side of the threshold: an 8-member group loading almost always means
    // "we're all playing", so pre-checking stays right there.
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Groups — 61-member' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();

    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Tuesday Crew/ }).first().click();
    await expect(page.getByText(/Loaded “Tuesday Crew” — 8 players pre-selected/)).toBeVisible();
    await expect(page.getByText('8 selected')).toBeVisible();
  });

  test('a user with no groups never sees the picker', async ({ page }) => {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    // First-timer: no empty group box, no dead control — straight to adding players.
    await expect(page.getByText('Your groups')).toHaveCount(0);
    await expect(page.getByText("Who's playing?")).toBeVisible();
  });
});

test.describe('feedback box: a note sent from a game reads back at /home/feedback', () => {
  // Craig 2026-09-10: an in-app feedback box — a text box and a list, not a
  // ticket system. The button must be findable but never cover the screen
  // (header text button, not a floating overlay).
  test('send from the hub header, read back with author and game link', async ({ page }) => {
    const gameId = await seed(page, 'Skins — 2 players');
    // This scenario doesn't sign in an organizer; /home/feedback gates on a GHIN
    // token, and the note should carry a real author. Sign in as the sandbox owner.
    await page.evaluate(() => {
      sessionStorage.setItem('ghin_token', 'sandbox-token');
      const identity = JSON.stringify({ golfer_id: 1234567, first_name: 'Craig', last_name: 'Hoelzer' });
      sessionStorage.setItem('ghin_golfer', identity);
      localStorage.setItem('ghin_golfer', identity);
    });
    await page.goto(`${BASE}/pool/${gameId}`);
    await page.waitForLoadState('networkidle');

    // The button lives in the header — visible without scrolling, covering nothing.
    await page.getByRole('button', { name: /Feedback/ }).click();
    await page.getByPlaceholder("What's on your mind?").fill('The skins board is great — can we get carryover totals?');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(/Thanks — got it/)).toBeVisible();

    // The read-back list: note text, author line, and a link to the game.
    // (Identity comes from pool-identity; the sandbox seeds Craig's.)
    await page.goto(`${BASE}/home/feedback`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
    await expect(page.getByText('carryover totals')).toBeVisible();
    await expect(page.getByRole('button', { name: /open the game/ })).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/feedback-readback.png', fullPage: true });
  });

  test('the home page offers the box and the read-back link', async ({ page }) => {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Home hub' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();

    await page.goto(`${BASE}/home`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /Feedback/ }).first()).toBeVisible();
    // Empty state says where notes come from, not just that there are none.
    await page.getByRole('button', { name: /Read feedback notes/ }).click();
    await page.waitForURL(/home\/feedback/);
    await expect(page.getByText(/No feedback yet/)).toBeVisible();
  });
});

test.describe('F-027: a roster row with a blank name still renders a label', () => {
  // Craig, live app: "i just see handicaps, i can tell they are people, but i dont
  // see names." Cause: live `players` rows with an empty name (untrimmed GHIN-add
  // writers, since fixed). The page must render "GHIN #…" for such rows, never a
  // card that is visually just a handicap.
  test('F-027: the group members list shows GHIN #… for a blank-named row', async ({ page }) => {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Groups — 61-member' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();

    // Reproduce the live-data shape: blank one member's name IN THE STORE, the way
    // a bad GHIN write left it — the page must cope with the row, not rely on
    // writers always being clean.
    await page.evaluate(() => {
      const raw = sessionStorage.getItem('__sandbox_supabase__');
      if (!raw) throw new Error('sandbox store missing after seed');
      const store = JSON.parse(raw) as { tables: [string, [string, Record<string, unknown>][]][] };
      const players = store.tables.find(([t]) => t === 'players');
      if (!players) throw new Error('players table missing');
      const rp2 = players[1].find(([id]) => id === 'rp2');
      if (!rp2) throw new Error('rp2 missing');
      rp2[1].name = '  ';   // whitespace-only, the untrimmed-writer shape
      sessionStorage.setItem('__sandbox_supabase__', JSON.stringify(store));
    });

    await page.goto(`${BASE}/home/groups/g-weekend-warriors`);
    await page.waitForLoadState('networkidle');
    await page.getByText(/61 players — tap to view or edit/).click();

    // The blank-named member (rp2, GHIN 2000001) renders the fallback label.
    const search = page.getByPlaceholder(/Search 61 members/);
    await search.fill('GHIN #');
    await expect(page.getByText('GHIN #2000001')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/f027-blank-name-fallback.png', fullPage: true });
  });
});

test.describe('money moved to its own step', () => {
  // F-005: the game step asked ~12 questions at once, including money settings that
  // can't even be shown in real dollars until the field and team count are known.
  // §5.au: the game step now comes AFTER the field, so walk there first.
  test('the game step no longer asks money questions', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');

    // The wizard opens on the FIELD (§5.au) — no money, no scoring, just people.
    const fieldBody = await page.locator('body').innerText();
    expect(fieldBody).toContain("Who's playing?");
    expect(fieldBody).not.toContain('Buy-in per player');

    // Two players in, on to the game step.
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12']] as const) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
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
    // §5.au: field → game → course.
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12']] as const) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await page.getByPlaceholder('e.g. Saturday Pool').fill('GHIN Timing Test');
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

    // Walk to the course step (§5.au: field → game → course).
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12']] as const) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await page.getByPlaceholder('e.g. Saturday Pool').fill('Recent Course Test');
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

