import path from 'node:path';
import { expect, test } from '@playwright/test';

const adminState = path.join(process.cwd(), 'e2e/.auth/admin.json');
const operatorState = path.join(process.cwd(), 'e2e/.auth/operator.json');

test.describe('auth smoke', () => {
  test('admin con sesión llega a /dashboard', async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState });
    const page = await context.newPage();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible();
    await context.storageState({ path: adminState });
    await context.close();
  });

  test('operador en /admin/users es redirigido a su inicio', async ({ browser }) => {
    const context = await browser.newContext({ storageState: operatorState });
    const page = await context.newPage();
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/dashboard/);
    await context.storageState({ path: operatorState });
    await context.close();
  });
});
