import { expect, test } from '@playwright/test';
import { seedUsers } from './seed-users';
import { openAuthenticatedContext } from './session';

test.describe('HU-10 — tareas', () => {
  test('admin navega al listado y abre el formulario manual', async ({ browser }) => {
    const { context, storagePath } = await openAuthenticatedContext(browser, seedUsers.admin);
    const page = await context.newPage();

    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'Tareas', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nueva tarea' })).toBeVisible();

    await page.getByRole('button', { name: 'Nueva tarea' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva tarea manual', level: 2 })).toBeVisible();
    await expect(page.locator('#task-client')).toBeVisible();

    await context.storageState({ path: storagePath });
    await context.close();
  });
});
