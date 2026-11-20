import { expect, test } from '@playwright/test';
import { seedUsers } from './seed-users';
import { openAuthenticatedContext } from './session';

test.describe('HT-07 — alertas', () => {
  test('admin revisa las alertas programadas', async ({ browser }) => {
    const { context, storagePath } = await openAuthenticatedContext(browser, seedUsers.admin);
    const page = await context.newPage();

    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Alertas', level: 1 })).toBeVisible();
    await page.getByLabel('Sólo mis alertas').uncheck();

    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('tbody tr').first()).toContainText(/vence|Nueva solicitud/);

    await context.storageState({ path: storagePath });
    await context.close();
  });
});
