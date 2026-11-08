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
  fs.mkdirSync(visualOut, { recursive: true });
  await page.screenshot({ path: path.join(visualOut, name), fullPage: true });
}

test.describe('handoff QA — captura consolidada (local)', () => {
  test.skip(!!process.env.CI, 'Capturas locales; CI usa specs atómicos sin rate-limit de login.');
  test.describe.configure({ mode: 'serial' });

  test('público: login', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await shot(page, '01-login-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, '05-login-mobile.png');
  });

  test('admin: recorrido desktop y móvil', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, 'admin@fabsoft.test', 'Admin.dev-2026!');
    await page.goto('/dashboard');
    await shot(page, '10-dashboard-admin-desktop.png');

    let releaseHealth!: () => void;
    const healthGate = new Promise<void>((res) => {
      releaseHealth = res;
    });
    await page.route('**/api/v1/health', async (route) => {
      await healthGate;
      await route.continue();
    });
    await page.goto('/dashboard');
    await expect(page.getByText('Comprobando…')).toBeVisible({ timeout: 5000 });
    await shot(page, '16-dashboard-api-loading-admin-desktop.png');
    releaseHealth();
    await expect(page.getByText('Versión', { exact: false })).toBeVisible({ timeout: 15000 });

    await page.unroute('**/api/v1/health');
    await page.route('**/api/v1/health', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    await page.goto('/dashboard');
    await expect(page.getByText('No disponible')).toBeVisible({ timeout: 15000 });
    await shot(page, '15-dashboard-api-unreachable-admin-desktop.png');
    await page.unroute('**/api/v1/health');
    await page.goto('/admin/users');
    await shot(page, '11-users-admin-desktop.png');
    await page.goto('/change-password');
    await shot(page, '12-change-password-admin-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await shot(page, '13-dashboard-admin-mobile.png');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await shot(page, '14-nav-admin-mobile.png');
  });

  test('operador: desktop forbidden', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, 'operador@fabsoft.test', 'Operador.dev-2026!');
    await shot(page, '20-dashboard-operator-desktop.png');
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/dashboard/);
    await shot(page, '21-operator-forbidden-users-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await shot(page, '22-dashboard-operator-mobile.png');
  });

  test('cliente: portal', async ({ page }) => {
    await login(page, 'portal@andina.test', 'Cliente.dev-2026!');
    await page.setViewportSize({ width: 1280, height: 800 });
    await shot(page, '30-portal-client-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, '31-portal-client-mobile.png');
  });

  test('cliente: cambio obligatorio', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, 'portal@cafetal.test', 'Cliente.dev-2026!');
    await shot(page, '32-change-password-mandatory-client-desktop.png');
  });

  test('sin sesión: change-password', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/change-password');
    await shot(page, '02-change-password-unauth-desktop.png');
  });
});
