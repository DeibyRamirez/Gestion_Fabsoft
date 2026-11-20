import { expect, test } from '@playwright/test';
import { seedUsers } from './seed-users';
import { openAuthenticatedContext } from './session';

test.describe('HU-11 — alertas', () => {
  test('admin abre la bandeja de alertas', async ({ browser }) => {
    const { context, storagePath } = await openAuthenticatedContext(browser, seedUsers.admin);
    const page = await context.newPage();

    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Alertas', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Sólo mis alertas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actualizar' })).toBeVisible();

    await context.storageState({ path: storagePath });
    await context.close();
  });
});
