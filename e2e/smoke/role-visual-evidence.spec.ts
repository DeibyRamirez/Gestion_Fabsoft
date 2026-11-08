import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const visualOut = process.env.VISUAL_OUT_DIR ?? '/opt/cursor/artifacts/redesign';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15000 });
}

async function shot(page: Page, name: string) {
  if (!process.env.CI && process.env.CAPTURE_VISUAL !== '0') {
    fs.mkdirSync(visualOut, { recursive: true });
    await page.screenshot({ path: path.join(visualOut, name), fullPage: true });
  }
}

test.describe('evidencia visual autenticada (rediseño)', () => {
  test.describe.configure({ mode: 'serial' });

  test('admin: panel, usuarios y móvil', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, 'admin@fabsoft.test', 'Admin.dev-2026!');
    await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible();
    await shot(page, '10-dashboard-admin-desktop.png');

    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();
    await shot(page, '11-users-admin-desktop.png');

    await page.goto('/change-password');
    await expect(page.getByRole('heading', { name: 'Cambiar contraseña', level: 1 })).toBeVisible();
    await shot(page, '12-change-password-admin-desktop.png');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await shot(page, '13-dashboard-admin-mobile.png');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    await shot(page, '14-nav-admin-mobile.png');
  });

  test('operador: panel, forbidden y sin Admin', async ({ page }) => {
    await login(page, 'operador@fabsoft.test', 'Operador.dev-2026!');
    await expect(page.getByText('Rol: Operador')).toBeVisible();
    await expect(page.getByText('Admin', { exact: true })).toHaveCount(0);
    await shot(page, '20-dashboard-operator-desktop.png');

    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/dashboard/);
    await shot(page, '21-operator-forbidden-users-desktop.png');
  });

  test('cliente: portal (desktop y móvil)', async ({ page }) => {
    await login(page, 'portal@andina.test', 'Cliente.dev-2026!');
    await expect(page.getByRole('heading', { name: 'Mis suscripciones', level: 1 })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
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
