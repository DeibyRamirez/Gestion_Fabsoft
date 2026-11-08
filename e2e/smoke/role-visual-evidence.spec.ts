import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const visualOut = process.env.VISUAL_OUT_DIR ?? '/opt/cursor/artifacts/redesign';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

async function shot(page: Page, name: string) {
  if (!process.env.CI && process.env.CAPTURE_VISUAL !== '0') {
    fs.mkdirSync(visualOut, { recursive: true });
    await page.screenshot({ path: path.join(visualOut, name), fullPage: true });
  }
}

test.describe('evidencia visual autenticada (rediseño)', () => {
  test.describe.configure({ mode: 'serial' });

  test('admin: panel y usuarios (desktop)', async ({ page }) => {
    await login(page, 'admin@fabsoft.test', 'Admin.dev-2026!');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Panel' }).first()).toBeVisible();
    await shot(page, '10-dashboard-admin-desktop.png');

    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();
    await shot(page, '11-users-admin-desktop.png');

    await page.goto('/change-password');
    await expect(page.getByRole('heading', { name: 'Cambiar contraseña', level: 1 })).toBeVisible();
    await shot(page, '12-change-password-admin-desktop.png');
  });

  test('admin: panel (móvil)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'admin@fabsoft.test', 'Admin.dev-2026!');
    await expect(page).toHaveURL(/\/dashboard/);
    await shot(page, '13-dashboard-admin-mobile.png');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    await shot(page, '14-nav-admin-mobile.png');
  });

  test('operador: panel y forbidden en /admin/users', async ({ page }) => {
    await login(page, 'operador@fabsoft.test', 'Operador.dev-2026!');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Rol: Operador')).toBeVisible();
    await shot(page, '20-dashboard-operator-desktop.png');

    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/dashboard/);
    await shot(page, '21-operator-forbidden-users-desktop.png');
  });

  test('operador: sin sección Admin en sidebar', async ({ page }) => {
    await login(page, 'operador@fabsoft.test', 'Operador.dev-2026!');
    await expect(page.getByText('Admin', { exact: true })).toHaveCount(0);
  });

  test('cliente: portal (desktop y móvil)', async ({ page }) => {
    await login(page, 'portal@andina.test', 'Cliente.dev-2026!');
    await expect(page).toHaveURL(/\/portal/);
    await expect(page.getByRole('heading', { name: 'Mis suscripciones', level: 1 })).toBeVisible();
    await shot(page, '30-portal-client-desktop.png');

    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, '31-portal-client-mobile.png');
  });

  test('cliente: cambio obligatorio de contraseña', async ({ page }) => {
    await login(page, 'portal@cafetal.test', 'Cliente.dev-2026!');
    await expect(page).toHaveURL(/\/change-password/);
    await expect(page.getByRole('heading', { name: 'Cambiar contraseña', level: 1 })).toBeVisible();
    await shot(page, '32-change-password-mandatory-client-desktop.png');
  });
});
