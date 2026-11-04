import { expect, test } from '@playwright/test';

test.describe('auth smoke', () => {
  test('admin inicia sesión y llega a /dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@fabsoft.test');
    await page.getByLabel('Contraseña').fill('Admin.dev-2026!');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('operador en /admin/users es redirigido a su inicio', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('operador@fabsoft.test');
    await page.getByLabel('Contraseña').fill('Operador.dev-2026!');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
