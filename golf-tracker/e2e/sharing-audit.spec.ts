// CAPTURE pass for the sharing/login/identity AUDIT (2026-09-14 session).
//
// Document-first: these tests SEE screens for the four entry personas and
// screenshot them. Assertions are minimal — just enough to prove each capture
// is of the right screen (the vacuous-test lesson). Findings go to FINDINGS.md.
//
// Personas (NEXT_SESSION_PROMPT.md):
//   A. owner via invite code (incl. the expired-48h-cookie return, same screen)
//   B. organizer via legacy ?key= link
//   C. player via per-game token /pool/{id}?key=TOKEN
//   D. returning visitor with an expired 12h GHIN token
// Plus: share panels, sign-out behavior, and the /pool/roster vs /home/groups
// consolidation look.

import { expect, test } from '@playwright/test';

const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';
const PHONE = { width: 390, height: 844 };

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/share-audit-${name}.png`, fullPage: true });
  const text = (await page.locator('body').innerText()).replace(/\n{3,}/g, '\n\n');
  console.log(`\n===== share-audit-${name} =====\n${text}\n`);
}

// Owner-context helpers (cookie granted), copied from verify-fixes.spec.ts.
async function grantAndReset(context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page) {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
}

async function seedCard(page: import('@playwright/test').Page, label: string) {
  const card = page.locator('div.bg-white', { hasText: label });
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded ✓')).toBeVisible();
  return card;
}

async function seedAndOpenGame(page: import('@playwright/test').Page, label: string): Promise<string> {
  const card = await seedCard(page, label);
  await card.getByRole('button', { name: 'Open →' }).click();
  await page.waitForURL(/\/pool\/[^/]+/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  const m = new URL(page.url()).pathname.match(/\/pool\/([^/]+)/);
  if (!m) throw new Error(`seed("${label}") did not land on a pool page: ${page.url()}`);
  return m[1];
}

test.use({ viewport: PHONE });

// ---------------------------------------------------------------------------
// Persona A — first visit / expired 48h cookie: the invite-code screen
// ---------------------------------------------------------------------------
test.describe('persona A: invite code', () => {
  test('cold visit to /pool hits the invite screen; wrong code errors; right code enters', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: PHONE });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/pool`);
    await expect(page.getByText('Enter the invite code')).toBeVisible();
    await shot(page, '01-invite-screen-phone');
    await page.setViewportSize({ width: 1280, height: 800 });
    await shot(page, '02-invite-screen-desktop');
    await page.setViewportSize(PHONE);

    await page.getByPlaceholder('Invite code').fill('wrongcode');
    await page.getByRole('button', { name: 'Enter' }).click();
    await expect(page.getByText('Invalid code. Try again.')).toBeVisible();
    await shot(page, '03-invite-wrong-code');

    await page.getByPlaceholder('Invite code').fill('birdie2026');
    await page.getByRole('button', { name: 'Enter' }).click();
    await page.waitForLoadState('networkidle');
    await shot(page, '04-invite-accepted-landing');
    await ctx.close();
  });

  test('a deep link behind an expired cookie: where do you land after re-entering the code?', async ({ browser, context, page }) => {
    // Owner seeds a live game; the returning friend has the URL but no cookie.
    await grantAndReset(context, page);
    const id = await seedAndOpenGame(page, 'Classic pool — 2 foursomes, mid-round (thru 6)');
    const store = await page.evaluate(() => sessionStorage.getItem('__sandbox_supabase__') ?? '');

    const ctx = await browser.newContext({ viewport: PHONE });
    const friend = await ctx.newPage();
    await friend.goto(`${BASE}/sandbox`);
    await friend.evaluate((d) => sessionStorage.setItem('__sandbox_supabase__', d), store);
    // No cookie set on this context — the sandbox page itself sets one on Seed,
    // but we never seeded here. Clear any that leaked, then open the deep link.
    await ctx.clearCookies();
    await friend.goto(`${BASE}/pool/${id}/leaderboard`);
    await expect(friend.getByText('Enter the invite code')).toBeVisible();
    await shot(friend, '05-expired-cookie-deep-link-gate');

    await friend.getByPlaceholder('Invite code').fill('birdie2026');
    await friend.getByRole('button', { name: 'Enter' }).click();
    await friend.waitForLoadState('networkidle');
    console.log('AFTER CODE, URL =', friend.url());
    await shot(friend, '06-expired-cookie-after-code');
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Persona B — organizer via legacy ?key=poolparty2026
// ---------------------------------------------------------------------------
test.describe('persona B: legacy organizer link', () => {
  test('landing, identity card, and the pool-only fence', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: PHONE });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/pool?key=poolparty2026`);
    await page.waitForLoadState('networkidle');
    await shot(page, '07-organizer-key-landing');

    // Where does the fence put them if they wander?
    await page.goto(`${BASE}/home`);
    await page.waitForLoadState('networkidle');
    console.log('POOL-ONLY VISITOR AT /home ->', page.url());
    await shot(page, '08-organizer-key-fenced-from-home');
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Share panels (owner side of persona C)
// ---------------------------------------------------------------------------
test.describe('share panels', () => {
  test('per-game Share panel copy + QR', async ({ context, page }) => {
    await grantAndReset(context, page);
    const id = await seedAndOpenGame(page, 'Classic pool — 2 foursomes, mid-round (thru 6)');
    await page.goto(`${BASE}/pool/${id}`); // the Share button lives on the hub, not the leaderboard
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Share' }).first().click();
    await expect(page.getByText(/Player scoring link/i)).toBeVisible();
    await page.waitForTimeout(1500); // give the external QR image a beat
    await shot(page, '09-share-panel-game');
  });

  test('global "Share pool games" modal on /pool', async ({ context, page }) => {
    await grantAndReset(context, page);
    await page.goto(`${BASE}/pool`);
    await page.waitForLoadState('networkidle');
    await shot(page, '10-pool-list-no-identity');
    const share = page.getByRole('button', { name: /share/i }).first();
    if (await share.count()) {
      await share.click();
      await page.waitForTimeout(1500);
      await shot(page, '11-share-pool-games-modal');
    } else {
      console.log('NO SHARE BUTTON VISIBLE ON /pool');
    }
  });
});

// ---------------------------------------------------------------------------
// Persona C — player via per-game token
// ---------------------------------------------------------------------------
test.describe('persona C: per-game player token', () => {
  test('player opens the link fresh: landing, who-am-I, scorecard path', async ({ browser, context, page }) => {
    await grantAndReset(context, page);
    const id = await seedAndOpenGame(page, 'Classic pool — 2 foursomes, mid-round (thru 6)');
    await page.goto(`${BASE}/pool/${id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Share' }).first().click();
    await expect(page.getByText(/Player scoring link/i)).toBeVisible();
    const link = await page.locator('input[readonly]').first().inputValue();
    const store = await page.evaluate(() => sessionStorage.getItem('__sandbox_supabase__') ?? '');
    console.log('PLAYER LINK =', link);

    const ctx = await browser.newContext({ viewport: PHONE });
    const guest = await ctx.newPage();
    await guest.goto(`${BASE}/sandbox`);
    await guest.evaluate((d) => sessionStorage.setItem('__sandbox_supabase__', d), store);
    await ctx.clearCookies(); // the link must do ALL the work
    await guest.goto(link);
    await guest.waitForLoadState('networkidle');
    const body = await guest.locator('body').innerText();
    expect(body).not.toContain('Enter the invite code');
    await shot(guest, '12-player-token-landing');

    // The player's job: enter scores for their foursome.
    await guest.getByRole('button', { name: /enter scores/i }).first().click();
    await guest.waitForLoadState('networkidle');
    await shot(guest, '13-player-token-scorecard-entry');
    await ctx.close();
  });

  test('a WRONG but token-shaped key on the same game URL', async ({ browser, context, page }) => {
    await grantAndReset(context, page);
    const id = await seedAndOpenGame(page, 'Classic pool — 2 foursomes, mid-round (thru 6)');
    const store = await page.evaluate(() => sessionStorage.getItem('__sandbox_supabase__') ?? '');

    const ctx = await browser.newContext({ viewport: PHONE });
    const guest = await ctx.newPage();
    await guest.goto(`${BASE}/sandbox`);
    await guest.evaluate((d) => sessionStorage.setItem('__sandbox_supabase__', d), store);
    await ctx.clearCookies();
    await guest.goto(`${BASE}/pool/${id}?key=AAAAAAAAAAAAAAAAAAAAAAAA`);
    await guest.waitForLoadState('networkidle');
    const gated = await guest.getByText('Enter the invite code').count();
    console.log('WRONG TOKEN GATED?', gated > 0 ? 'yes — gate held' : 'NO — gate passed');
    await shot(guest, '14-wrong-token-shaped-key');
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Persona D — returning visitor, valid cookie, missing/expired GHIN token
// ---------------------------------------------------------------------------
test.describe('persona D: expired GHIN token', () => {
  test('/home without a GHIN token bounces to the sign-in page', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: PHONE });
    await ctx.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/home`);
    await page.waitForLoadState('networkidle');
    console.log('NO-GHIN-TOKEN /home ->', page.url());
    await shot(page, '15-ghin-expired-login-page');
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Sign-out behavior
// ---------------------------------------------------------------------------
test.describe('sign-out', () => {
  test('sign out from /home, then walk back into /pool anyway', async ({ context, page }) => {
    await grantAndReset(context, page);
    await seedCard(page, 'Home hub — games + groups populated');
    await page.goto(`${BASE}/home`);
    await page.waitForLoadState('networkidle');
    await shot(page, '16-home-header-signed-in');
    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForTimeout(3000); // let the client-side router.push land
    console.log('AFTER SIGN OUT ->', page.url());
    await shot(page, '17-after-sign-out');

    // The 48h cookie was never cleared — is the app still open?
    await page.goto(`${BASE}/pool`);
    await page.waitForLoadState('networkidle');
    const gated = await page.getByText('Enter the invite code').count();
    console.log('AFTER SIGN OUT, /pool GATED?', gated > 0 ? 'yes' : 'NO — still inside');
    await shot(page, '18-after-sign-out-pool-still-open');
  });
});

// ---------------------------------------------------------------------------
// Group management consolidation look: /pool/roster vs /home/groups/[id]
// ---------------------------------------------------------------------------
test.describe('group management surfaces', () => {
  test('capture both group UIs side by side', async ({ context, page }) => {
    await grantAndReset(context, page);
    await seedCard(page, 'Groups — 61-member standing group + small crew + saved format');
    await page.goto(`${BASE}/pool/roster`);
    await page.waitForLoadState('networkidle');
    await shot(page, '19-pool-roster-groups-manager');

    await page.goto(`${BASE}/home`);
    await page.waitForLoadState('networkidle');
    await shot(page, '20-home-your-groups');
    // Open a group card's dashboard (the card is a clickable div, not an <a>).
    await page.getByText('Weekend Warriors').first().click();
    await page.waitForURL(/\/home\/groups\//, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await shot(page, '21-home-group-dashboard');
  });
});
