import path from 'node:path';
import { expect, test } from '@playwright/test';

const adminState = path.join(process.cwd(), 'e2e/.auth/admin.json');

test.describe('HU-03 — clientes', () => {
  test('admin navega al listado de clientes', async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState });
    const page = await context.newPage();
    await page.goto('/clients');
    await expect(page).toHaveURL(/\/clients/);
    await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nuevo cliente' })).toBeVisible();
    await context.close();
  });
});