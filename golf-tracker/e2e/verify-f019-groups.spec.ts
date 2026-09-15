// Split out of verify-fixes.spec.ts on 2026-09-15 (§5.bj harness round 2).
// Covers the F-019 era: playing groups independent of sides — two-group side games,
// scorecard/leaderboard agreement across groups, a fifth player joining a scored
// group, and the wizard building real playing groups.
// Verbatim moves — test titles and assertions unchanged. Shared plumbing: ./helpers.

import { expect, test } from '@playwright/test';
import { BASE, resetBackend, seed, goToGame } from './helpers';

// Grant invite-gate access + empty the fake backend before every test.
test.beforeEach(async ({ context, page }) => {
  await resetBackend(context, page);
});

test.describe('F-019: a side game with two playing groups', () => {
  test('F-019: the money reads BOTH groups — a partner in the other foursome counts', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const id = await seed(page, 'F-019: 8 players, TWO tee times, four sides');
    await page.goto(`${BASE}/pool/${id}/leaderboard`);
    await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();

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
    await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();

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
    await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();

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
    await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();
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
    await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();
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
    await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();
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
    await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();
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
    await expect(page.getByRole('main').getByText('STANDINGS')).toBeVisible();
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

    // §5.au: field → game → course → tees.
    for (const [nm, hcp] of players) {
      await page.getByPlaceholder('Name', { exact: true }).fill(nm);
      await page.getByPlaceholder('HCP').fill(hcp);
      await page.getByPlaceholder('HCP').locator('xpath=following-sibling::button[normalize-space()="Add"]').click();
    }
    await page.getByRole('button', { name: /Next: Choose Game/ }).click();
    await page.getByPlaceholder('e.g. Saturday Pool').fill('Groups Test');
    // Select by VALUE, not label: F-020 appends a fit badge to option labels once a field
    // exists, so a label match is fragile even where it happens to work today.
    await page.locator('select').first().selectOption('team-2v2');
    await page.getByRole('button', { name: /Next: Select Course/ }).click();
    await page.getByRole('button', { name: /Sandbox National/ }).first().click();
  }

  const EIGHT: [string, string][] = [
    ['Craig', '4'], ['Jym', '12'], ['Dave', '8'], ['Rick', '16'],
    ['Sam', '6'], ['Tony', '14'], ['Will', '10'], ['Gary', '2'],
  ];

  test('F-019: eight players are asked how they split, and get two tee times', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startSideGame(page, EIGHT);

    // The tees step promises GROUPS for an 8-player side game, not Sides.
    await page.getByRole('button', { name: 'Next: Set Tees' }).click();
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
    await page.getByRole('button', { name: 'Next: Set Tees' }).click();
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
    await page.getByRole('button', { name: 'Next: Set Tees' }).click();

    // Still says Sides, as it always did (§5.al).
    await expect(page.getByRole('button', { name: 'Next: Sides' })).toBeVisible();
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
    await page.getByRole('button', { name: 'Next: Set Tees' }).click();
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

// ---------------------------------------------------------------------------
// F-025 / F-026 — an INDIVIDUAL game's review step (skins)
// ---------------------------------------------------------------------------
//
// F-025: individual games fell through to the classic-pool review block and printed
// "Foursomes" over a card named "Group" with a meaningless combined CHcp. F-026: the
// review step showed no stakes at all for an individual game — the money lives in
// step 1's mode settings and was never repeated on the "is this right?" screen.
