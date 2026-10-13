// EXPLORATORY persona walk for bar #11 (BETA.md): a first-time organizer runs a 3-day trip
// from a group. Start an event, play round 1, add rounds 2 and 3 (two on the same day), close
// them out, settle. Counts taps per phase and screenshots every step (walk-the-UI).
// Run alone: npx playwright test e2e/event-walk.spec.ts  (CAPTURE_TEXT=1 dumps page text)

import { expect, test, type Locator, type Page } from '@playwright/test';
import { BASE, PHONE, grantAndReset, seedCard, signInOrganizer } from './helpers';

const taps: Record<string, number> = {};
let phase = 'setup';
let shot = 0;

async function tap(l: Locator) {
  await l.click();
  taps[phase] = (taps[phase] ?? 0) + 1;
}

async function capture(page: Page, name: string) {
  await page.waitForTimeout(300);
  shot++;
  await page.screenshot({ path: `e2e/screenshots/ewalk-${String(shot).padStart(2, '0')}-${name}.png`, fullPage: true });
  if (process.env.CAPTURE_TEXT === '1') {
    const text = (await page.locator('body').innerText()).replace(/\n{3,}/g, '\n\n');
    console.log(`\n===== ewalk-${shot} ${name} (${phase}: ${taps[phase] ?? 0} taps) =====\n${text}\n`);
  }
}

test.setTimeout(600_000);

test('bar #11: a 3-day trip from a group', async ({ context, page }) => {
  await grantAndReset(context, page);
  await page.setViewportSize(PHONE);
  await seedCard(page, 'Groups — 61-member standing group');
  await signInOrganizer(page);

  await page.goto(`${BASE}/home`);
  await capture(page, 'home');
  await tap(page.getByRole('button', { name: /Tuesday Crew/ }).first());
  await page.waitForURL(/\/home\/groups\//);
  await capture(page, 'group');
  await tap(page.getByRole('button', { name: /Start an event/ }));
  await page.waitForURL(/\/pool\/new/);
  await capture(page, 'wizard-1');

  // Walk the wizard as a first-timer: take each step's Next, screenshot each.
  const create = page.getByRole('button', { name: 'Create & send to players' });
  for (let i = 0; i < 12 && !(await create.isVisible()); i++) {
    // The course step needs a pick; take the "Played recently" chip like a returning group.
    const recent = page.getByRole('button', { name: /Sandbox National/ }).first();
    if (await page.getByText('Select Course').isVisible() && await recent.isVisible()) {
      await tap(recent);
      await capture(page, `wizard-${i + 2}-course-picked`);
    }
    // The teams step needs teams; take the first (recommended-looking) method.
    const even = page.getByRole('button', { name: /Even them out/ });
    if (await page.getByText('No teams yet').isVisible() && await even.isVisible()) {
      await tap(even);
      await capture(page, `wizard-${i + 2}-teams-built`);
    }
    await tap(page.getByRole('button', { name: /^Next/ }).last());
    await capture(page, `wizard-${i + 2}`);
  }
  const name = page.getByLabel('Event name');
  if (await name.isVisible()) { await tap(name); await name.fill('Myrtle Trip'); }
  await capture(page, 'review-event-named');
  await tap(create);
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 20_000 });
  await capture(page, 'r1-created-send-sheet');
  const close = page.getByRole('button', { name: 'Close' });
  if (await close.isVisible()) await tap(close);
  await capture(page, 'r1-hub');

  const hub1 = page.url();
  page.on('dialog', (d) => { console.log('DIALOG', d.message()); void d.accept(); });

  // ROUND 1: both foursomes score all 18 on the organizer's phone (a stand-in for two phones).
  phase = 'r1-score';
  await scoreRound(page, hub1, 1);
  await capture(page, 'r1-hub-after-scores');

  // Close out (if the last Finish Game didn't already), then the event.
  phase = 'r1-close';
  await closeOut(page);
  await capture(page, 'r1-closed');
  await tap(page.getByRole('button', { name: 'Event standings' }).first());
  await page.waitForURL(/\/event\//);
  await capture(page, 'event-after-r1');

  // ROUND 2 (day 2) from the event screen.
  phase = 'r2-setup';
  await tap(page.getByRole('button', { name: /Add round 2/ }).first());
  await page.waitForURL(/\/pool\/new/);
  await capture(page, 'r2-wizard-1');
  const hub2 = await wizardToCreate(page, 'r2');
  phase = 'r2-score';
  await scoreRound(page, hub2, 2);
  phase = 'r2-close';
  await closeOut(page);
  await capture(page, 'r2-closed');

  // ROUND 3, the SAME day as round 2 (a 36-hole day), from round 2's hub.
  phase = 'r3-setup';
  await tap(page.getByRole('button', { name: /Add round 3/ }).first());
  await page.waitForURL(/\/pool\/new/);
  const hub3 = await wizardToCreate(page, 'r3', true);
  phase = 'r3-score';
  await scoreRound(page, hub3, 3);
  phase = 'r3-close';
  await closeOut(page);
  await capture(page, 'r3-closed');

  // SETTLE: the event screen.
  phase = 'settle';
  await tap(page.getByRole('button', { name: 'Event standings' }).first());
  await page.waitForURL(/\/event\//);
  await capture(page, 'event-final');

  // The trip settles: three finished rounds over two dates, Total zero-sum, four payments.
  await expect(page.getByText('3 rounds · 3 finished')).toBeVisible();
  const table = page.getByTestId('event-standings');
  await expect(table.locator('thead th[colspan="2"]')).toHaveCount(1); // day 2 spans rounds 2 + 3
  const totals = await table.locator('tbody tr td:nth-child(2)').allInnerTexts();
  const sum = totals.reduce((a, t) => a + Number(t.replace('−', '-').replace(/[+$]/g, '')), 0);
  expect(totals).toHaveLength(8);
  expect(sum).toBe(0);
  await expect(page.getByTestId('event-settle').locator('li')).toHaveCount(4);
  console.log('TAPS', JSON.stringify(taps));
});

// Walk a copied round's wizard to Create, screenshotting each step; returns the hub URL.
async function wizardToCreate(page: Page, tag: string, sameDay = false): Promise<string> {
  const create = page.getByRole('button', { name: 'Create & send to players' });
  for (let i = 0; i < 12 && !(await create.isVisible()); i++) {
    const even = page.getByRole('button', { name: /Even them out/ });
    if (await page.getByText('No teams yet').isVisible() && await even.isVisible()) await tap(even);
    await tap(page.getByRole('button', { name: /^Next/ }).last());
    await capture(page, `${tag}-wizard-${i + 2}`);
  }
  if (sameDay) {
    // A 36-hole day: the organizer has to change the suggested date back by hand.
    const date = page.getByTestId('event-field').locator('input[type="date"]');
    const v = await date.inputValue();
    const d = new Date(`${v}T12:00:00`); d.setDate(d.getDate() - 1);
    await tap(date);
    await date.fill(d.toISOString().slice(0, 10));
    console.log(`DATE suggested ${v}, set back to ${d.toISOString().slice(0, 10)}`);
    await capture(page, `${tag}-review-same-day`);
  }
  await tap(create);
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 20_000 });
  const close = page.getByRole('button', { name: 'Close' });
  await close.waitFor({ state: 'visible', timeout: 5_000 }).then(() => tap(close)).catch(() => {});
  await capture(page, `${tag}-hub`);
  return page.url();
}

// Both foursomes, all 18 holes, through the card's pad. Scores vary by round so money moves.
async function scoreRound(page: Page, hub: string, round: number) {
  const cards = await page.getByRole('button', { name: /enter scores/i }).count();
  for (let c = 0; c < cards; c++) {
    if (c > 0) { await page.goto(hub); await page.waitForLoadState('networkidle'); }
    await tap(page.getByRole('button', { name: /enter scores/i }).nth(c));
    await page.waitForURL(/\/game\/play/, { timeout: 20_000 });
    for (let h = 1; h <= 18; h++) {
      await page.getByText(`Hole ${h}`, { exact: true }).waitFor();
      const par = Number((await page.getByText(/^Par \d/).first().innerText()).match(/Par (\d)/)![1]);
      for (let p = 0; p < 4; p++) {
        // Round 2 tilts toward foursome 1 (a stroke better every third hole) so the trip doesn't net to zero.
        const tilt = round === 2 && c === 0 && h % 3 === 0 ? 1 : 0;
        const sc = Math.max(1, par + (((p + 1) * 7 + h * 3 + round * 5 + c * 2) % 4) - 1 - tilt);
        await tap(page.getByRole('button', { name: String(sc), exact: true }).nth(p));
      }
      if (h === 1 && c === 0) await capture(page, `r${round}-card-hole1-scored`);
      if (h < 18) await tap(page.getByRole('button', { name: '›' }));
    }
    await capture(page, `r${round}-card${c + 1}-hole18`);
    await tap(page.getByRole('button', { name: 'Finish Game' }));
    await page.waitForURL((u) => !u.pathname.includes('/game/play'), { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
  }
}

async function closeOut(page: Page) {
  const btn = page.getByRole('button', { name: 'Close out game' }).first();
  if (await btn.isVisible()) {
    await capture(page, `${phase}-before`);
    await tap(btn);
    await page.waitForTimeout(500);
  } else {
    console.log(`CLOSEOUT ${phase}: no Close out button (already completed?)`);
  }
}
