// Split out of verify-fixes.spec.ts on 2026-09-15 (§5.bj harness round 2).
// Covers the live-feedback era (F-025…F-046): skins review, stroke dots, to-par and
// points-per-hole on points games, small-field fit hints, the card/standings pill,
// who-pays-whom at close-out, the handicap chain, and group formats following the group.
// Verbatim moves — test titles and assertions unchanged. Shared plumbing: ./helpers.

import { expect, test } from '@playwright/test';
import { BASE, resetBackend, seed, goToGame, fieldToGameStep } from './helpers';

// Grant invite-gate access + empty the fake backend before every test.
test.beforeEach(async ({ context, page }) => {
  await resetBackend(context, page);
});

test.describe('F-025/F-026: skins review step', () => {
  async function walkToSkinsReview(page: import('@playwright/test').Page) {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForURL(/pool\/new/, { timeout: 15_000 });

    // §5.au: field → game → course → tees → money.
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16']] as const) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await page.getByPlaceholder('e.g. Saturday Pool').fill('Sunday Skins');
    // Select by VALUE (F-020 appends fit badges to labels).
    await page.locator('select').first().selectOption('skins');
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Set Tees/ }).click();
    await page.getByRole('button', { name: /Next: Money/ }).click();
    // MUST be the review step, not wherever the last click landed.
    await expect(page.getByRole('heading', { name: /Review & create/ })).toBeVisible();
  }

  test('F-025: the review says Players — no Foursomes, no Group, no combined CHcp', async ({ page }) => {
    await walkToSkinsReview(page);
    const body = await page.locator('body').innerText();
    expect(body).toContain('Players');
    expect(body).not.toContain('Foursomes');
    // The single playing group's card (named "Group") and its combined handicap must be gone;
    // each player's own course handicap remains on their row.
    expect(body).not.toMatch(/CHcp \d/);
    await page.screenshot({ path: 'e2e/screenshots/f025-skins-review.png', fullPage: true });
  });

  test('F-026: the review states the stakes for an individual game', async ({ page }) => {
    await walkToSkinsReview(page);
    const body = await page.locator('body').innerText();
    // formatSummaryLine: "Skins · $N a skin · <handicap rule>".
    expect(body).toMatch(/\$\d+ a skin/);
    // §5.ax part 4: the offer to keep the format lives next to the summary.
    await expect(page.getByRole('button', { name: 'Save this format' })).toBeVisible();
  });
});

test.describe('F-029: stroke dots are legible on both surfaces', () => {
  // The friend's report was "make the dots brighter". The worst case was the dark
  // leaderboard: 8px blue-400 on navy. The fix is CSS-only — the dots still render
  // from the engine's strokes, so money can't desync.
  test('F-029: the dark leaderboard renders dots at 11px sky-300, not 8px blue-400', async ({ page }) => {
    const id = await seed(page, 'Stableford (individual) — 4 players, thru 7');
    await goToGame(page, id, '/leaderboard');
    // The 12-handicap gets strokes off the low man, so dots must exist at all.
    const dots = page.locator('span.text-\\[11px\\].text-sky-300');
    await expect(dots.first()).toBeVisible();
    // The old faint classes must be gone from this page entirely.
    await expect(page.locator('span.text-\\[8px\\].text-blue-400')).toHaveCount(0);
    await page.screenshot({ path: 'e2e/screenshots/f029-leaderboard-dots.png', fullPage: true });
  });

  test('F-029: the score-entry card renders its orange dots at text-sm', async ({ page }) => {
    const id = await seed(page, 'Stableford (individual) — 4 players, thru 7');
    await goToGame(page, id);
    await page.getByRole('button', { name: 'Enter Scores' }).click();
    await page.waitForURL(/\/game\/play/);
    await page.waitForLoadState('networkidle');
    const dots = page.locator('span.text-sm.text-orange-600');
    await expect(dots.first()).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/f029-scorecard-dots.png', fullPage: true });
  });
});

test.describe("F-031: a points game still shows each player's gross to par", () => {
  // The friend's report: "I still want to see my score to par when I'm playing
  // Stableford." The standings ranked on pts with Thru and $ only. The new column
  // is derived from gross already in the details grid — no engine change.
  test('F-031: the individual standings table has a To par column with real figures', async ({ page }) => {
    const id = await seed(page, 'Stableford (individual) — 4 players, thru 7');
    await goToGame(page, id, '/leaderboard');
    const standings = page.locator('div.bg-gray-800', { hasText: 'Standings' }).first();
    await expect(standings.getByRole('columnheader', { name: 'To par' })).toBeVisible();
    // Craig (sp1): 3 birdies + 4 pars thru 7 = −3 gross. Rick (sp4): +2 a hole = +14.
    const rowOf = (name: string) => standings.locator('tr', { hasText: name });
    await expect(rowOf('Craig')).toContainText('-3');
    await expect(rowOf('Rick')).toContainText('+14');
    await page.screenshot({ path: 'e2e/screenshots/f031-to-par-column.png', fullPage: true });
  });
});

test.describe('F-028: a points game shows points per hole in Player Details', () => {
  // The engine computed perHole points and both grids dropped them — the friend could
  // see his pts total but never where he earned them. The details grid now renders the
  // engine's per-hole POINTS when the game is played in points; gross stays on the
  // scorecard (and in the grid's Gross/Net total columns).
  test('F-028: the details grid renders pts whose Out total matches the standings', async ({ page }) => {
    const id = await seed(page, 'Stableford (individual) — 4 players, thru 7');
    await goToGame(page, id, '/leaderboard');

    const details = page.locator('div.bg-gray-800', { hasText: 'Player Details' }).first();
    // The header says what unit the cells are in.
    await expect(details.getByText('pts per hole')).toBeVisible();

    // The invariant, not a hand-computed figure: all 7 scored holes are on the front
    // nine, so each player's Out (sum of per-hole points) must equal their standings
    // pts. If the grid were still rendering gross, Craig's Out would read 24.
    const standings = page.locator('div.bg-gray-800', { hasText: 'Standings' }).first();
    const ptsText = await standings.locator('tr', { hasText: 'Craig' }).locator('td').nth(2).innerText();
    const pts = Number(ptsText.replace('+', ''));
    expect(Number.isFinite(pts)).toBe(true);

    const craigRow = details.locator('tbody tr', { hasText: 'Craig' });
    // Out is the first bold bg-gray-750 cell in the row (after the nine front holes).
    const outText = await craigRow.locator('td.bg-gray-750').first().innerText();
    expect(Number(outText.replace(/[^\d.-]/g, ''))).toBe(pts);
    expect(Number(outText.replace(/[^\d.-]/g, ''))).not.toBe(24); // the old gross render

    await page.screenshot({ path: 'e2e/screenshots/f028-points-per-hole.png', fullPage: true });
  });
});

test.describe('F-033: a small field is told which games fit it', () => {
  // The friend asked for "1v1 and more 3-player game types" — they exist, but the
  // picker defaults to the foursomes pool and the fit badges only render inside the
  // OPEN dropdown, so he opened this screen and concluded they didn't. A hint line
  // under the picker now lists the fitting modes when the field is ≤3. The default
  // stays Pool (§5.ao: guidance, not validation).
  test('F-033: at 2 players the game step lists the games that fit', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    await fieldToGameStep(page);   // adds 2 players, lands on the game step (Pool selected)
    const hint = page.getByText(/With 2 players you can also play:/);
    await expect(hint).toBeVisible();
    // The 1v1 answer he was missing, by name.
    await expect(hint).toContainText('Sides / Match');
    await page.screenshot({ path: 'e2e/screenshots/f033-fit-hint-2p.png', fullPage: true });

    // Picking a fitting game dismisses the hint — it's about the pool default only.
    await page.locator('select').first().selectOption('skins');
    await expect(hint).toHaveCount(0);
  });

  test('F-033: at 3 players the hint includes Nines; at 4 it is absent', async ({ page }) => {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12'], ['Dave', '8']] as const) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await expect(page.getByText('Which game are you playing?')).toBeVisible();
    const hint = page.getByText(/With 3 players you can also play:/);
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Nines');

    // A fourth player makes the pool sensible — the hint must go away.
    await page.getByRole('button', { name: /Back/ }).first().click();
    await expect(page.getByText("Who's playing?")).toBeVisible();
    await page.getByPlaceholder('Name', { exact: true }).fill('Rick');
    await page.getByPlaceholder('HCP').fill('16');
    await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await expect(page.getByText('Which game are you playing?')).toBeVisible();
    await expect(page.getByText(/you can also play:/)).toHaveCount(0);
  });
});

test.describe('F-030: one segmented pill toggles card and standings on both screens', () => {
  // Mechanically the round-trip was already 1 tap with state preserved — the finding
  // was affordance: both directions were small corner text links, visually identical
  // to "Back". One [Card | Standings] pill now sits in BOTH headers, same look, so the
  // two screens read as views of one game. Craig's pick over swipe (gesture conflicts
  // with prev/next hole) 2026-09-10.
  test('F-030: the pill round-trips card → standings → card and keeps the hole', async ({ page }) => {
    const id = await seed(page, 'Stableford (individual) — 4 players, thru 7');
    await goToGame(page, id);
    await page.getByRole('button', { name: 'Enter Scores' }).click();
    await page.waitForURL(/\/game\/play/);
    await page.waitForLoadState('networkidle');

    // The card header has the pill, with Card active.
    const cardTabs = page.getByRole('tablist', { name: 'Card or standings' });
    await expect(cardTabs).toBeVisible();
    await expect(cardTabs.getByRole('tab', { name: 'Card' })).toHaveAttribute('aria-selected', 'true');

    // The card opens on the first unscored hole (8, thru 7). Walk two on, then
    // over to standings via the pill.
    await expect(page.getByText('Hole 8', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '›' }).click();
    await page.getByRole('button', { name: '›' }).click();
    await expect(page.getByText('Hole 10', { exact: true })).toBeVisible();
    await cardTabs.getByRole('tab', { name: 'Standings' }).click();
    await page.waitForURL(/\/leaderboard/);

    // The board header has the same pill, with Standings active.
    const boardTabs = page.getByRole('tablist', { name: 'Card or standings' });
    await expect(boardTabs.getByRole('tab', { name: 'Standings' })).toHaveAttribute('aria-selected', 'true');
    await page.screenshot({ path: 'e2e/screenshots/f030-toggle-board.png', fullPage: true });

    // And back. The card remounts and resumes at the FIRST UNSCORED hole (8) — that's
    // the designed "continuing" behavior (play/page.tsx "Jump to first unscored hole on
    // resume"), not a preserved cursor; browsing to 10 without scoring doesn't stick.
    await boardTabs.getByRole('tab', { name: 'Card' }).click();
    await page.waitForURL(/\/game\/play/);
    await expect(page.getByText('Hole 8', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/f030-toggle-card.png', fullPage: true });
  });
});

test.describe('F-032: closing out a game shows who pays whom', () => {
  // "Need a 'summary' type view after you click 'finish' — player A owes player C x.
  // No Venmo, nothing crazy." Close-out used to flip the status and say only "Final".
  // The panel now grows a Who-pays-whom list from settleUp() over THIS game's nets,
  // and it stays there on any later view of the completed game.
  test('F-032: the close-out panel grows a Who pays whom list, and it persists', async ({ page }) => {
    const id = await seed(page, 'Stableford (individual) — 4 players, FULLY scored');
    await goToGame(page, id);

    // Before closing out: no recap (the game isn't final yet).
    await expect(page.getByText('Who pays whom')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close out game' }).click();

    // The moment it closes, the transfers appear.
    await expect(page.getByText('Game closed out')).toBeVisible();
    await expect(page.getByText('Who pays whom')).toBeVisible();
    const body = await page.locator('body').innerText();
    // The list is "X pays Y $N" lines. Every player is a first name from the seed.
    expect(body).toMatch(/\b(Craig|Jym|Dave|Rick) pays (Craig|Jym|Dave|Rick) \$\d+/);
    await page.screenshot({ path: 'e2e/screenshots/f032-who-pays-whom.png', fullPage: true });

    // The amounts settle the leaderboard's nets: every "pays" amount is positive,
    // and the biggest debtor appears (the 16-index Rick, per the seeded scores).
    expect(body).toMatch(/Rick pays/);

    // Reload — the recap is part of the completed game's page, not a one-time toast.
    await goToGame(page, id);
    await expect(page.getByText('Who pays whom')).toBeVisible();

    // Reopening the game removes it (the game is no longer final).
    await page.getByRole('button', { name: 'Reopen game' }).click();
    await expect(page.getByText('Who pays whom')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// F-043 — handicap arithmetic was a black box: no screen showed the chain from
// index → course handicap → allowance → the rounded number on the chip, so
// verifying against the GHIN app (§5.ba — the reference) meant trusting us.
// Every handicap chip is now a disclosure; the chain it opens is pinned to
// getPoolPlayingHandicap by unit test (src/test/handicap-chain.test.ts).
// ---------------------------------------------------------------------------
test.describe('F-043: the handicap chip shows its work', () => {
  test('F-043: tapping a CHcp chip on the sides step opens the index → CH → plays-off chain', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Seed past games so the wizard's course step offers Sandbox National.
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Past games (for recent-course' });
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();
    await card.getByRole('button', { name: 'Open →' }).click();
    await page.waitForURL(/\/pool\/new/, { timeout: 15_000 });

    // field → game → course → tees → sides (§5.au).
    for (const [nm, hcp] of [['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16']] as const) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await page.getByPlaceholder('e.g. Saturday Pool').fill('Chain Test');
    await page.locator('select').first().selectOption('team-2v2');
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
    await page.getByRole('button', { name: /Next: Set Tees/ }).click();
    await page.getByRole('button', { name: 'Next: Sides' }).click();
    // Assert the right screen before touching anything on it.
    await expect(page.getByRole('heading', { name: /Sides \(/ })).toBeVisible();

    // The chain is hidden until asked for.
    await expect(page.getByText('Handicap index')).toHaveCount(0);

    await page.getByRole('button', { name: 'CHcp 4', exact: true }).click();
    await expect(page.getByText('Handicap index')).toBeVisible();
    // Sandbox National is slope 113 with rating == par, so CH == index — and the
    // chain names the numbers it used rather than asking to be trusted.
    await expect(page.getByText(/slope 113, rating 72, par 72/)).toBeVisible();
    await expect(page.getByText('Plays off')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/f043-handicap-chain.png', fullPage: true });

    // Tap again to close.
    await page.getByRole('button', { name: 'CHcp 4', exact: true }).click();
    await expect(page.getByText('Handicap index')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// F-046 — "I saved this format, but still had to import from library. I saved it
// as friday game in the friday group." Two dropped threads, both covered here:
// (a) "Save format" on a game that came FROM a group never attached the format
//     to that group — attachment was a separate step on /home/groups/[id];
// (b) the wizard's game step listed every saved format flat, so the group chosen
//     one step earlier couldn't lead with its own usual games.
// ---------------------------------------------------------------------------
test.describe("F-046: a group's formats follow the group", () => {
  async function seedGroups(page: import('@playwright/test').Page) {
    await page.goto(`${BASE}/sandbox`);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const card = page.locator('div.bg-white', { hasText: 'Groups — 61-member standing group' }).first();
    await card.getByRole('button', { name: 'Seed' }).click();
    await expect(card.getByText('Seeded ✓')).toBeVisible();
  }

  // Walk the field step with Weekend Warriors chosen, onto the game step.
  async function groupToGameStep(page: import('@playwright/test').Page) {
    await page.goto(`${BASE}/pool/new`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText("Who's playing?")).toBeVisible();
    await page.getByRole('button', { name: /Weekend Warriors/ }).first().click();
    await expect(page.getByText(/Loaded “Weekend Warriors”/)).toBeVisible();
    await page.getByRole('button', { name: /Craig Hoelzer/ }).click();
    await page.getByRole('button', { name: /Jym Youngberg/ }).click();
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await expect(page.getByText('Which game are you playing?')).toBeVisible();
  }

  test("F-046: the game step leads with the chosen group's usual games, labeled as the group's", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedGroups(page);
    await groupToGameStep(page);

    const picker = page.locator('select').first();
    // The group's three attached formats lead, under the group's own name…
    await expect(picker.locator('optgroup[label="Weekend Warriors plays"] option')).toHaveCount(3);
    await expect(picker.locator('optgroup[label="Weekend Warriors plays"] option', { hasText: 'Saturday Nassau' })).toHaveCount(1);
    // …the rest of the library stays reachable, deduped, under its own heading…
    await expect(picker.locator('optgroup[label="Other saved games"] option', { hasText: 'JY Classic Pool' })).toHaveCount(1);
    await expect(picker.locator('optgroup[label="Other saved games"] option', { hasText: 'Saturday Nassau' })).toHaveCount(0);
    // …and picking the group's usual applies it like any saved format (F-021 confirmation).
    await picker.selectOption('format:f-saturday-nassau');
    await expect(page.getByLabel('Game style name')).toHaveValue('Saturday Nassau');
    await page.screenshot({ path: 'e2e/screenshots/f046-group-formats-lead.png', fullPage: true });
  });

  test('F-046: Save format on a group\'s game attaches to the group, and the next round offers it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedGroups(page);

    // lg-1 is a completed Weekend Warriors game (sourceGroupId: g-weekend-warriors).
    await page.goto(`${BASE}/pool/lg-1`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Save format' }).click();

    // The modal knows where the game came from, and the attach is on by default —
    // "I saved it in the friday group" is what saving from a group's game means.
    const modal = page.locator('div.fixed');
    await expect(modal.getByText('Attach to Weekend Warriors')).toBeVisible();
    await modal.locator('input:not([type="checkbox"])').fill('Friday game');
    await modal.getByRole('button', { name: 'Save format' }).click();
    await expect(modal.getByText('Saved ✓')).toBeVisible();

    // The thread holds: start the group's next round, and the new format is one of
    // the group's usual games at the moment of choosing.
    await groupToGameStep(page);
    const picker = page.locator('select').first();
    await expect(picker.locator('optgroup[label="Weekend Warriors plays"] option', { hasText: 'Friday game' })).toHaveCount(1);
  });
});
