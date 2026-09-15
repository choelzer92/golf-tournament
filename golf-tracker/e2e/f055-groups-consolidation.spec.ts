// F-055 (§5.bh, option A): group management consolidates on /home — create on
// the home screen, rename/delete on the group's own dashboard, and /pool/roster
// is demoted to saved PLAYERS only (its second group manager is deleted).

import { expect, test } from '@playwright/test';

import { BASE, grantAndReset, seedCard } from './helpers';

test('F-055: create a group on /home, rename and delete it on its dashboard', async ({ context, page }) => {
  await grantAndReset(context, page);
  await seedCard(page, 'Home hub — games + groups populated'); // signs in as Craig

  // CREATE on /home — the affordance the old "Manage → /pool/roster" button replaced.
  await page.goto(`${BASE}/home`);
  await expect(page.getByRole('heading', { name: 'Your groups' })).toBeVisible();
  await page.getByRole('button', { name: '+ New group' }).click();
  await page.getByPlaceholder(/Group name/).fill('Sunday Skins Crew');
  await page.getByRole('button', { name: 'Create' }).click();

  // Lands on the new group's dashboard, ready to add members.
  await expect(page).toHaveURL(/\/home\/groups\//);
  await expect(page.getByRole('heading', { name: 'Sunday Skins Crew' })).toBeVisible();

  // RENAME, inline in the header — the dashboard shape (F-010) is preserved.
  await page.getByRole('button', { name: 'Rename' }).click();
  const nameInput = page.locator('header input');
  await expect(nameInput).toHaveValue('Sunday Skins Crew');
  await nameInput.fill('Sunday Skins Club');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sunday Skins Club' })).toBeVisible();

  // DELETE (confirmed) returns to /home, where the group is gone.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(`${BASE}/home`);
  await expect(page.getByText('Sunday Skins Club')).toHaveCount(0);
});

test('F-055: /pool/roster is saved players only — no second group manager', async ({ context, page }) => {
  await grantAndReset(context, page);
  await seedCard(page, 'Home hub — games + groups populated');

  await page.goto(`${BASE}/pool/roster`);
  await expect(page.getByRole('heading', { name: 'Saved Players' })).toBeVisible();
  // The old GroupsManager's distinctive controls are gone…
  await expect(page.getByText('Select a group…')).toHaveCount(0);
  await expect(page.getByPlaceholder('New group name…')).toHaveCount(0);
  // …and the page says where groups live now.
  await expect(page.getByText(/managed from the Home screen/)).toBeVisible();
});
