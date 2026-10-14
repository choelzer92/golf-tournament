// PERSONA WALKS for bars #1, #2 and #3 (BETA.md): tap counts recorded in BETA §4.
// #1 a first-time organizer, URL → a shared game; #2 an invited player scores from the link and
// the app remembers their group; #3 a returning organizer runs the same game again.
// A "tap" is a click; a "type" is one field filled. Screenshots every step (walk-the-UI).
// Run alone: npx playwright test e2e/persona-walks.spec.ts  (CAPTURE_TEXT=1 dumps page text)

import { expect, test, type Locator, type Page } from '@playwright/test';
import { BASE, PHONE, closeSendSheet, freshGuest, manualAddButton } from './helpers';

const EIGHT: [string, string][] = [
  ['Pat Newman', '9'], ['Lou Park', '14'], ['Ben Ortiz', '6'], ['Sid Kahn', '18'],
  ['Al Grant', '11'], ['Moe Diaz', '3'], ['Ray Cole', '22'], ['Ned Fry', '15'],
];

type Count = { taps: number; types: number };
const counts: Record<string, Count> = {};
let walk = 'w1';
let shot = 0;

function bump(kind: keyof Count) {
  counts[walk] ??= { taps: 0, types: 0 };
  counts[walk][kind]++;
}
async function tap(l: Locator) { await l.click(); bump('taps'); }
async function type(l: Locator, v: string) { await l.fill(v); bump('types'); }

async function capture(page: Page, name: string) {
  await page.waitForTimeout(300);
  shot++;
  await page.screenshot({ path: `e2e/screenshots/persona-${walk}-${String(shot).padStart(2, '0')}-${name}.png`, fullPage: true });
  if (process.env.CAPTURE_TEXT === '1') {
    const text = (await page.locator('body').innerText()).replace(/\n{3,}/g, '\n\n');
    const c = counts[walk] ?? { taps: 0, types: 0 };
    console.log(`\n===== ${walk}-${shot} ${name} (${c.taps} taps, ${c.types} types) =====\n${text}\n`);
  }
}

// A stranger, not the app owner (Craig's sandbox identity is the owner): their own GHIN.
async function signInStranger(page: Page) {
  await page.evaluate(() => {
    const g = JSON.stringify({ golfer_id: 7654321, first_name: 'Pat', last_name: 'Newman' });
    sessionStorage.setItem('ghin_golfer', g);
    localStorage.setItem('ghin_golfer', g);
    sessionStorage.setItem('ghin_token', 'sandbox');
  });
}

// The sandbox can't reach GHIN: answer the course search + details routes with one course, so the
// first-timer's real search path runs (the "Played recently" chips need a past game of their own).
async function mockGhinCourses(page: Page) {
  const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4];
  const tee = (id: number, name: string, yards: number, cr: number, slope: number) => ({
    TeeSetRatingId: id, TeeSetRatingName: name, Gender: 'Male', TotalYardage: yards, TotalPar: 72,
    Ratings: [{ RatingType: 'Total', CourseRating: cr, SlopeRating: slope },
      { RatingType: 'Front', CourseRating: cr / 2, SlopeRating: slope }, { RatingType: 'Back', CourseRating: cr / 2, SlopeRating: slope }],
    Holes: pars.map((par, i) => ({ Number: i + 1, Par: par, Length: Math.round(yards / 18), Allocation: ((i * 7) % 18) + 1 })),
  });
  await page.route('**/api/ghin/courses/search', (r) => r.fulfill({ json: { courses: [
    { CourseID: 990001, CourseName: 'Persona Pines', FacilityName: 'Persona Pines GC', City: 'Richmond', State: 'VA' }] } }));
  await page.route('**/api/ghin/courses/details', (r) => r.fulfill({ json: { course: {
    CourseName: 'Persona Pines', CourseCity: 'Richmond', CourseState: 'VA',
    TeeSets: [tee(1, 'Blue', 6600, 71.8, 128), tee(2, 'White', 6200, 70.0, 122)] } } }));
}

test.setTimeout(300_000);
test.use({ viewport: PHONE });

test('bars #1–#3: first-time organizer, invited player, returning organizer', async ({ browser, page }) => {
  walk = 'w1'; shot = 0;
  await page.goto(`${BASE}/sandbox`);
  await page.context().addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.reload();
  await mockGhinCourses(page);
  await page.context().clearCookies();
  await page.goto(`${BASE}/`);
  await capture(page, 'url');
  await type(page.getByRole('textbox').first(), 'birdie2026');
  await tap(page.getByRole('button', { name: 'Enter' }));
  await page.waitForTimeout(1000);
  await capture(page, 'after-code');
  // GHIN sign-in: the sandbox can't reach GHIN, so count the form (email, password, Sign in) and
  // stand in for it with the sandbox identity.
  if (await page.getByLabel('GHIN Email').isVisible()) {
    bump('types'); bump('types'); bump('taps');
    await signInStranger(page);
    await page.goto(`${BASE}/home`);
  }
  await page.waitForLoadState('networkidle');
  await capture(page, 'home');
  // F-124: nothing played yet, so not "Welcome back".
  await expect(page.getByText('Welcome, Pat Newman')).toBeVisible();
  await tap(page.getByText('New game', { exact: true }));
  await page.waitForURL(/\/pool\/new/);
  await capture(page, 'wizard-field');
  // Eight friends by hand: name, handicap, Add.
  for (const [nm, hcp] of EIGHT) {
    await type(page.getByPlaceholder('Name', { exact: true }), nm);
    await type(page.getByPlaceholder('HCP'), hcp);
    await tap(manualAddButton(page));
  }
  await capture(page, 'wizard-field-8');
  for (let i = 0; i < 10; i++) {
    const create = page.getByRole('button', { name: 'Create & send to players' });
    if (await create.isVisible()) break;
    // F-122: step 2's Next stays disabled, unexplained, until the game is named.
    const nameBox = page.getByPlaceholder('e.g. Saturday Pool');
    if (await nameBox.isVisible() && (await nameBox.inputValue()) === '') await type(nameBox, 'Saturday game');
    const courseBox = page.getByPlaceholder('Course name');
    if (await courseBox.isVisible() && !(await page.getByText('Persona Pines').isVisible())) {
      // A first-timer has no recent courses: type the name, Search, pick the result.
      await type(courseBox, 'Persona Pines');
      await tap(page.getByRole('button', { name: 'Search', exact: true }));
      await capture(page, `course-results-${i}`);
      await tap(page.getByRole('button', { name: /Persona Pines/ }).first());
      await capture(page, `course-picked-${i}`);
    }
    const next = page.getByRole('button', { name: /^Next/ }).last();
    if (!(await next.isEnabled())) { await capture(page, `stuck-${i}`); break; }
    await tap(next);
    await capture(page, `wizard-step-${i + 2}`);
  }
  await tap(page.getByRole('button', { name: 'Create & send to players' }));
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 20_000 });
  await expect(page.getByText('Player scoring link')).toBeVisible();
  await capture(page, 'created-send-sheet');
  const link = await page.locator('input[readonly]').first().inputValue();
  // Sending it is one more tap (Copy or the share sheet); the game is then shared.
  bump('taps');
  console.log('W1', JSON.stringify(counts.w1));

  // ——— #2: an invited player opens the link on their own phone and scores ———
  walk = 'w2'; shot = 0;
  const store = await page.evaluate(() => sessionStorage.getItem('__sandbox_supabase__')!);
  const { ctx, guest } = await freshGuest(browser, store);
  await guest.goto(link);
  await guest.waitForLoadState('networkidle');
  await capture(guest, 'link-opened');
  for (let i = 0; i < 6 && !guest.url().includes('/game/play'); i++) {
    const enter = guest.getByRole('button', { name: /enter scores/i }).first();
    const me = guest.getByRole('button', { name: /Lou Park/ }).first();
    if (await enter.isVisible()) await tap(enter);
    else if (await me.isVisible()) await tap(me);
    else { await capture(guest, `stuck-${i}`); break; }
    await guest.waitForTimeout(800);
    await capture(guest, `step-${i}`);
  }
  if (guest.url().includes('/game/play')) {
    await guest.getByText('Hole 1', { exact: true }).waitFor();
    await tap(guest.getByRole('button', { name: '4', exact: true }).first());
    await capture(guest, 'first-score');
  }
  // Bar #2: link → Enter Scores → a score is 2 taps.
  await expect(guest.getByText('Net: 4 (0)')).toBeVisible();
  expect(counts.w2.taps).toBeLessThanOrEqual(3);
  // Remembered? Open the bare app URL next day, no link.
  await guest.goto(`${BASE}/`);
  await guest.waitForLoadState('networkidle');
  await capture(guest, 'reopen-bare-url');
  // The link again: does it open straight to their card?
  await guest.goto(link);
  await guest.waitForLoadState('networkidle');
  await capture(guest, 'reopen-link');
  await ctx.close();

  // ——— #3: next week, the organizer runs the same game again ———
  walk = 'w3'; shot = 0;
  // (Last week's round, not counted: a score on this tab's store, then the organizer closes out.)
  const hub = page.url();
  await page.goto(hub);
  await closeSendSheet(page);
  await page.getByRole('button', { name: /enter scores/i }).first().click();
  await page.getByText('Hole 1', { exact: true }).waitFor();
  await page.getByRole('button', { name: '4', exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.goto(hub);
  await page.waitForLoadState('networkidle');
  const closeOut = page.getByRole('button', { name: 'Close out game' }).first();
  page.on('dialog', (d) => void d.accept());
  await closeOut.click();
  await expect(page.getByText('Game closed out')).toBeVisible();
  await page.goto(`${BASE}/home`);
  await page.waitForLoadState('networkidle');
  await capture(page, 'home');
  await expect(page.getByText('Welcome back, Pat Newman')).toBeVisible();
  const create = page.getByRole('button', { name: 'Create & send to players' });
  const runBack = page.getByRole('button', { name: /Run it back/ }).first();
  if (await runBack.isVisible()) await tap(runBack);
  else {
    await tap(page.getByRole('button', { name: /Saturday game/ }).first());
    await page.waitForLoadState('networkidle');
    await capture(page, 'old-hub');
    await tap(page.getByRole('button', { name: /Run it back/ }).first());
  }
  await page.waitForURL(/\/pool\/new/);
  for (let i = 0; i < 10 && !(await create.isVisible()); i++) {
    await capture(page, `wizard-${i + 1}`);
    await tap(page.getByRole('button', { name: /^Next/ }).last());
  }
  await capture(page, 'review');
  await tap(create);
  await page.waitForURL(/\/pool\/(?!new$)[^/?]+$/, { timeout: 20_000 });
  await capture(page, 'created');
  await expect(page.getByText('Player scoring link')).toBeVisible();
  console.log('COUNTS', JSON.stringify(counts));
});
