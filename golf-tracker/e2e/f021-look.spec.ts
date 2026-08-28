import { expect, test } from '@playwright/test';
const BASE = process.env.SANDBOX_URL ?? 'http://localhost:3200';
test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'golf_access', value: 'full', url: BASE }]);
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => sessionStorage.clear());
});
test('F-021 look', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/sandbox`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const card = page.locator('div.bg-white', { hasText: 'Groups — 61-member standing group' }).first();
  await card.getByRole('button', { name: 'Seed' }).click();
  await expect(card.getByText('Seeded')).toBeVisible();
  await card.getByRole('button', { name: 'Open' }).click();
  await page.waitForURL(/\/home\/groups\//, { timeout: 15000 });
  await page.getByText('Casual round').click();
  await page.getByRole('button', { name: 'Saturday Nassau' }).click();
  await page.waitForURL(/\/pool\/new/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  const counts = await page.evaluate(() => {
    const on = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      controls: [...document.querySelectorAll('button, input, select, textarea')].filter(on).length,
      labels: [...document.querySelectorAll('label')].filter(on).filter(l => (l.textContent ?? '').trim()).length,
      height: document.body.scrollHeight,
    };
  });
  console.log('=== AFTER F-021 ===', JSON.stringify(counts));
  console.log(await page.locator('body').innerText());
  await page.screenshot({ path: 'e2e/screenshots/f021-summary.png', fullPage: true });

  // Now edit a value and see the rename affordance.
  await page.getByRole('button', { name: 'Change Handicaps' }).click();
  await page.getByRole('button', { name: 'Everyone, in full' }).click();
  await page.waitForTimeout(200);
  console.log('=== AFTER AN EDIT ===');
  const b = await page.locator('body').innerText();
  console.log(b.slice(0, 700));
  await page.screenshot({ path: 'e2e/screenshots/f021-edited.png', fullPage: true });
});
