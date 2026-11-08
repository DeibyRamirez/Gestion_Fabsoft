import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { openAuthenticatedContext } from './session';
import { seedUsers } from './seed-users';

const visualOut = process.env.VISUAL_OUT_DIR ?? '/opt/cursor/artifacts/redesign';
const adminState = path.join(process.cwd(), 'e2e/.auth/admin.json');
const operatorState = path.join(process.cwd(), 'e2e/.auth/operator.json');

async function shot(page: Page, name: string) {
  if (!process.env.CI && process.env.CAPTURE_VISUAL !== '0') {
    fs.mkdirSync(visualOut, { recursive: true });
    await page.screenshot({ path: path.join(visualOut, name), fullPage: true });
  }
}

async function expectDashboardReady(page: Page) {
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible({
    timeout: 15000,
  });
}

test.describe('estados borde y accesibilidad (rediseño)', () => {
  test.describe.configure({ mode: 'serial' });

  test('sin sesión: / redirige a login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });

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
    await page.getByLabel('Email').fill(seedUsers.inactive.email);
    await page.getByLabel('Contraseña').fill(seedUsers.inactive.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Credenciales inválidas.' }),
    ).toBeVisible();
    await shot(page, '08-login-inactive-user-error-desktop.png');
  });

  test('operador: panel móvil', async ({ browser }) => {
    const { context, storagePath } = await openAuthenticatedContext(browser, seedUsers.operator);
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await expectDashboardReady(page);
    await shot(page, '22-dashboard-operator-mobile.png');
    await context.storageState({ path: storagePath });
    await context.close();
  });

  test.describe('sesión admin (un solo contexto; cookie refresh rotativa)', () => {
    let adminContext: BrowserContext;

    test.beforeAll(async ({ browser }) => {
      adminContext = await browser.newContext({ storageState: adminState });
      const page = await adminContext.newPage();
      await page.goto('/dashboard');
      await expectDashboardReady(page);
      await adminContext.storageState({ path: adminState });
      await page.close();
    });

    test.afterAll(async () => {
      if (adminContext) {
        await adminContext.storageState({ path: adminState });
        await adminContext.close();
      }
    });

    test('carga y API no disponible', async () => {
      const page = await adminContext.newPage();
      let release!: () => void;
      const gate = new Promise<void>((res) => {
        release = res;
      });
      await page.route('**/api/v1/health', async (route) => {
        await gate;
        await route.continue();
      });
      await page.goto('/dashboard');
      await expectDashboardReady(page);
      await expect(page.getByText('Comprobando…')).toBeVisible({ timeout: 5000 });
      await shot(page, '16-dashboard-api-loading-admin-desktop.png');
      release();
      await expect(page.getByText('Versión', { exact: false })).toBeVisible({ timeout: 15000 });

      await page.unroute('**/api/v1/health');
      await page.route('**/api/v1/health', (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
      );
      await page.goto('/dashboard');
      await expectDashboardReady(page);
      await expect(page.getByText('No disponible')).toBeVisible({ timeout: 15000 });
      await shot(page, '15-dashboard-api-unreachable-admin-desktop.png');
      await page.close();
    });

    test('FabSoft logo: foco visible con Tab en escritorio', async () => {
      const page = await adminContext.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/dashboard');
      await expectDashboardReady(page);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
      await page.keyboard.press('Tab');
      const logo = page.locator('aside a').filter({ hasText: 'FabSoft' });
      await expect(logo).toBeFocused();
      const hasFocusIndicator = await logo.evaluate((el) => {
        const s = getComputedStyle(el);
        return (
          s.outlineWidth !== '0px' ||
          (s.boxShadow !== 'none' && s.boxShadow.replace(/,\s*none/g, '').trim() !== '')
        );
      });
      expect(hasFocusIndicator).toBe(true);
      await page.close();
    });

    test('escritorio: un solo botón Cerrar sesión visible', async () => {
      const page = await adminContext.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/dashboard');
      await expectDashboardReady(page);
      await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(1);
      await page.close();
    });

    test('admin usuarios: estado Cargando visible', async () => {
      const page = await adminContext.newPage();
      let release!: () => void;
      const gate = new Promise<void>((res) => {
        release = res;
      });
      await page.route('**/api/v1/users*', async (route) => {
        await gate;
        await route.continue();
      });
      await page.goto('/admin/users');
      await expect(page.getByText('Cargando usuarios…')).toBeVisible();
      release();
      await expect(page.getByRole('table')).toBeVisible({ timeout: 15000 });
      await page.close();
    });
  });
});
