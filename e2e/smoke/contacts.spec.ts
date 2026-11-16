import path from 'node:path';
import { expect, test } from '@playwright/test';

const adminState = path.join(process.cwd(), 'e2e/.auth/admin.json');

test.describe('HU-04 — contactos', () => {
  test('admin agrega un contacto al cliente', async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState });
    const page = await context.newPage();
    await page.goto('/clients');
    await page.getByRole('link', { name: 'Distribuidora Andina S.A.S.' }).click();
    await expect(page.getByRole('heading', { name: 'Contactos' })).toBeVisible();

    const email = `contacto-${Date.now()}@fabsoft.test`;
    await page.locator('#fullName').fill('Contacto E2E');
    await page.locator('#contactEmail').fill(email);
    await page.getByRole('button', { name: 'Agregar contacto' }).click();

    await expect(page.getByText('Contacto agregado.')).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await context.close();
  });
});
