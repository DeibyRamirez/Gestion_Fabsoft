import { expect, test } from '@playwright/test';
import { seedUsers } from './seed-users';
import { openAuthenticatedContext, openPortalContext } from './session';

test.describe('HT-07 — roles', () => {
  test('operador no accede a administración', async ({ browser }) => {
    const { context, storagePath } = await openAuthenticatedContext(browser, seedUsers.operator);
    const page = await context.newPage();

    await page.goto('/admin/integrations');
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

    await context.storageState({ path: storagePath });
    await context.close();
  });

  test('cliente sólo accede al portal', async ({ browser }) => {
    const { context, storagePath } = await openPortalContext(browser, seedUsers.client);
    const page = await context.newPage();

    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: /tus suscripciones/i, level: 1 })).toBeVisible();

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/portal$/, { timeout: 15_000 });

    await page.goto('/admin/integrations');
    await expect(page).toHaveURL(/\/portal$/, { timeout: 15_000 });

    await context.storageState({ path: storagePath });
    await context.close();
  });
});
