import path from 'node:path';
import { expect, test } from '@playwright/test';

const adminState = path.join(process.cwd(), 'e2e/.auth/admin.json');

test.describe('HU-07 — historial de periodos', () => {
  test('admin ve el historial en el detalle de una suscripción', async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState });
    const page = await context.newPage();

    await page.goto('/subscriptions');
    const renewable = page
      .getByRole('row')
      .filter({ hasText: /active|in_renewal|expired/ })
      .first();
    await renewable.getByRole('link').click();

    await expect(page.getByRole('heading', { name: 'Historial de periodos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Renovar' })).toBeVisible();

    await context.storageState({ path: adminState });
    await context.close();
  });
});
