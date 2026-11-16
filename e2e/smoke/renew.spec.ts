import { expect, test } from '@playwright/test';
import { openAuthenticatedContext } from './session';
import { seedUsers } from './seed-users';

test.describe('HU-07 — historial de periodos', () => {
  test('admin ve el historial en el detalle de una suscripción', async ({ browser }) => {
    const { context } = await openAuthenticatedContext(browser, seedUsers.admin);
    const page = await context.newPage();

    await page.goto('/subscriptions');
    await page.locator('table a').first().click();

    await expect(page.getByRole('heading', { name: 'Historial de periodos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Renovar' })).toBeVisible();

    await context.close();
  });
});
