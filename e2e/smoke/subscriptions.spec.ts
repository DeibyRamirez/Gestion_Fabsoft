import { expect, test } from '@playwright/test';
import { seedUsers } from './seed-users';
import { openAuthenticatedContext } from './session';

test.describe('HU-06 — suscripciones', () => {
  test('admin navega al listado y al alta', async ({ browser }) => {
    const { context, storagePath } = await openAuthenticatedContext(browser, seedUsers.admin);
    const page = await context.newPage();

    await page.goto('/subscriptions');
    await expect(page.getByRole('heading', { name: 'Suscripciones', level: 1 })).toBeVisible();

    await page.getByRole('link', { name: 'Nueva suscripción' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva suscripción', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Cliente activo')).toBeVisible();
    await expect(page.getByLabel('Producto activo')).toBeVisible();

    await context.storageState({ path: storagePath });
    await context.close();
  });
});
