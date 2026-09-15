// Split out of verify-fixes.spec.ts on 2026-09-15 (§5.bj harness round 2).
// Covers the F-006 era: generalized team formats (Stableford pool, wizard save shapes,
// scorecard, guest scramble scoring, one-ball/F-012 divergence guards, three sides,
// side-game pots) and F-013 (three-side scorecard).
// Verbatim moves — test titles and assertions unchanged. Shared plumbing: ./helpers.

import { expect, test } from '@playwright/test';
import { BASE, resetBackend, seed, goToGame, fieldToGameStep } from './helpers';

// Grant invite-gate access + empty the fake backend before every test.
test.beforeEach(async ({ context, page }) => {
  await resetBackend(context, page);
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
    await fieldToGameStep(page);
    // Positive assertion that we're on the game step of the wizard, not some redirect.
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
    await fieldToGameStep(page);
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
    await fieldToGameStep(page);
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
    await fieldToGameStep(page);
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
    await fieldToGameStep(page);
    await page.locator('select').filter({ hasText: 'Two best net scores' }).first().selectOption('scramble');
    await page.getByRole('button', { name: 'Stableford points' }).click();
    await expect(page.getByText(/birdie 3, par 2, bogey 1/)).toBeVisible();

    // "Continuing" is the neglected verb (AGENTS.md): the choice must come back.
    // The wizard reopens on the field (players are per-game and deliberately not
    // restored), but the CONFIG survives — walk back to the game step and check.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await fieldToGameStep(page);
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
