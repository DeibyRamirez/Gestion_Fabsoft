import path from 'node:path';
import { expect, test } from '@playwright/test';

const adminState = path.join(process.cwd(), 'e2e/.auth/admin.json');

test.describe('HU-10 — tareas', () => {
  test('admin navega al listado y abre el formulario manual', async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState });
    const page = await context.newPage();

    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'Tareas', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nueva tarea' })).toBeVisible();

    await page.getByRole('button', { name: 'Nueva tarea' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva tarea manual', level: 2 })).toBeVisible();
    await expect(page.getByLabel('Cliente')).toBeVisible();

    await context.storageState({ path: adminState });
    await context.close();
  });
});
