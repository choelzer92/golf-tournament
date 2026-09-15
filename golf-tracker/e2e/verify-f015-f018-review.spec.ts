// Split out of verify-fixes.spec.ts on 2026-09-15 (§5.bj harness round 2).
// Covers close-out and review-step fixes: F-016b (legs nobody finished), F-015 (no
// empty rows in read-only summaries), F-018 (review step confirms the sides).
// Verbatim moves — test titles and assertions unchanged. Shared plumbing: ./helpers.

import { expect, test } from '@playwright/test';
import { BASE, resetBackend, seed } from './helpers';

// Grant invite-gate access + empty the fake backend before every test.
test.beforeEach(async ({ context, page }) => {
  await resetBackend(context, page);
});

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

    // §5.au: field → game → course → tees → [groups] → sides.
    for (const [nm, hcp] of opts.players) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await page.getByPlaceholder('e.g. Saturday Pool').fill('Review Test');
    // Select by VALUE, not label: F-020 appends a fit badge to option labels once a field
    // exists, so a label match is fragile even where it happens to work today.
    await page.locator('select').first().selectOption('team-2v2');
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Set Tees/ }).click();
    // F-019: a side game with MORE THAN FOUR players picks its playing groups first (they
    // can't all walk together), so the path to the Sides step runs through the Groups step.
    // At four or fewer it goes straight there. §5.al: a side game says "Sides"/"Groups" on
    // the way, never "Teams".
    const viaGroups = opts.players.length > 4;
    await page.getByRole('button', { name: viaGroups ? 'Next: Groups' : 'Next: Sides' }).click();
    if (viaGroups) {
      // Accept the proposed groups untouched — this helper is about the SIDES steps.
      await page.getByRole('button', { name: 'Next: Sides' }).click();
    }
    if (opts.thirdSide) {
      await page.getByRole('button', { name: '+ Add a side' }).click();
      for (const nm of [opts.players[4][0], opts.players[5][0]]) {
        // The sides-step row is flex-wrap (F-043: the handicap chain panel wraps under it).
        const row = page.locator('div.flex.flex-wrap.items-center', { hasText: nm }).first();
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
