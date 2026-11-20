import { expect, test } from '@playwright/test';
import { seedUsers } from './seed-users';
import { openAuthenticatedContext } from './session';

test.describe('HU-07 — historial de periodos', () => {
  test('admin ve el historial en el detalle de una suscripción', async ({ browser }) => {
    const { context, storagePath } = await openAuthenticatedContext(browser, seedUsers.admin);
    const page = await context.newPage();

    await page.goto('/subscriptions');
    const renewable = page
      .getByRole('row')
      .filter({ hasText: 'Antivirus ESET Protect Entry' })
      .filter({ hasText: 'Distribuidora Andina S.A.S.' })
      .first();
    await renewable.getByRole('link').click();

    await expect(page.getByRole('heading', { name: 'Historial de periodos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Renovar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'No renovar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Corregir vencimiento' })).toBeVisible();
    await expect(page.getByLabel(/Pago del periodo/).first()).toBeVisible();

    await context.storageState({ path: storagePath });
    await context.close();
  });
});
