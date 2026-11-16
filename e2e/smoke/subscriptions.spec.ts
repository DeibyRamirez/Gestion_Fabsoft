import path from 'node:path';
import { expect, test } from '@playwright/test';

const adminState = path.join(process.cwd(), 'e2e/.auth/admin.json');

test.describe('HU-06 — suscripciones', () => {
  test('admin navega al listado y al alta', async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState });
    const page = await context.newPage();

    await page.goto('/subscriptions');
    await expect(page.getByRole('heading', { name: 'Suscripciones', level: 1 })).toBeVisible();

    await page.getByRole('link', { name: 'Nueva suscripción' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva suscripción', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Cliente activo')).toBeVisible();
    await expect(page.getByLabel('Producto activo')).toBeVisible();

    await context.storageState({ path: adminState });
    await context.close();
  });
});
