import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const visualOut = process.env.VISUAL_OUT_DIR ?? '/opt/cursor/artifacts/redesign';
const adminStatePath = path.join(process.cwd(), 'e2e/.auth/admin.json');

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

async function ensureAdminStorage(browser: {
  newContext: () => Promise<import('@playwright/test').BrowserContext>;
}) {
  fs.mkdirSync(path.dirname(adminStatePath), { recursive: true });
  if (fs.existsSync(adminStatePath)) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, 'admin@fabsoft.test', 'Admin.dev-2026!');
  await context.storageState({ path: adminStatePath });
  await context.close();
}

test.describe('estados borde y accesibilidad (rediseño)', () => {
  test.describe.configure({ mode: 'serial' });

  test('login: teclado — skip link y foco en primer campo', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Saltar al contenido' });
    await expect(skip).toBeFocused();
    await shot(page, '06-login-skip-link-focus-desktop.png');

    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Email')).toBeFocused();
    const focusRing = await page.getByLabel('Email').evaluate((el) => {
      const s = getComputedStyle(el);
      return { outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle };
    });
    expect(focusRing.outlineWidth).not.toBe('0px');
    await shot(page, '07-login-email-focus-desktop.png');
  });

  test('login: usuario inactivo muestra error genérico (401)', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('inactivo@fabsoft.test');
    await page.getByLabel('Contraseña').fill('Inactivo.dev-2026!');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Credenciales inválidas.' }),
    ).toBeVisible();
    await shot(page, '08-login-inactive-user-error-desktop.png');
  });

  test.describe('admin panel — estados API (una sesión)', () => {
    test.beforeAll(async ({ browser }) => {
      fs.rmSync(adminStatePath, { force: true });
      await ensureAdminStorage(browser);
    });

    test('carga y API no disponible', async ({ browser }) => {
      const context = await browser.newContext({ storageState: adminStatePath });
      const page = await context.newPage();

      let release!: () => void;
      const gate = new Promise<void>((res) => {
        release = res;
      });
      await page.route('**/api/v1/health', async (route) => {
        await gate;
        await route.continue();
      });
      await page.goto('/dashboard');
      await expect(page.getByText('Comprobando…')).toBeVisible({ timeout: 5000 });
      await shot(page, '16-dashboard-api-loading-admin-desktop.png');
      release();
      await expect(page.getByText('Versión', { exact: false })).toBeVisible({ timeout: 15000 });

      await page.unroute('**/api/v1/health');
      await page.route('**/api/v1/health', (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
      );
      await page.goto('/dashboard');
      await expect(page.getByText('No disponible')).toBeVisible({ timeout: 15000 });
      await shot(page, '15-dashboard-api-unreachable-admin-desktop.png');
      await context.close();
    });
  });

  test('operador: panel móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'operador@fabsoft.test', 'Operador.dev-2026!');
    await expect(page).toHaveURL(/\/dashboard/);
    await shot(page, '22-dashboard-operator-mobile.png');
  });
});
