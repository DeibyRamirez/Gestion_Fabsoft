import path from 'node:path';
import { expect, test } from '@playwright/test';

const adminState = path.join(process.cwd(), 'e2e/.auth/admin.json');

test.describe('HU-11 — alertas', () => {
  test('admin abre la bandeja de alertas', async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState });
    const page = await context.newPage();

    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Alertas', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Sólo mis alertas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actualizar' })).toBeVisible();

    await context.storageState({ path: adminState });
    await context.close();
  });
});
