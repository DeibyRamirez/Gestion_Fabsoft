import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { openAuthenticatedContext, storagePathFor } from './session';
import { seedUsers } from './seed-users';

const visualOut = process.env.VISUAL_OUT_DIR ?? '/opt/cursor/artifacts/redesign';

function shotPath(page: import('@playwright/test').Page, name: string) {
  if (!process.env.CI && process.env.CAPTURE_VISUAL !== '0') {
    return async () => {
      fs.mkdirSync(visualOut, { recursive: true });
      await page.screenshot({ path: path.join(visualOut, name), fullPage: true });
    };
  }
  return async () => {};
}

test.describe('evidencia visual autenticada (rediseño)', () => {
  test.describe.configure({ mode: 'serial' });

  test('admin: panel, usuarios y móvil', async ({ browser }) => {
    const { context, storagePath } = await openAuthenticatedContext(browser, seedUsers.admin);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible();
    await shotPath(page, '10-dashboard-admin-desktop.png')();

    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();
    await shotPath(page, '11-users-admin-desktop.png')();

    await page.goto('/change-password');
    await expect(page.getByRole('heading', { name: 'Cambiar contraseña', level: 1 })).toBeVisible();
    await shotPath(page, '12-change-password-admin-desktop.png')();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await shotPath(page, '13-dashboard-admin-mobile.png')();
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    await shotPath(page, '14-nav-admin-mobile.png')();
    await context.storageState({ path: storagePath });
    await context.close();
  });

  test('operador: panel, forbidden y sin Admin', async ({ browser }) => {
    const { context, storagePath } = await openAuthenticatedContext(browser, seedUsers.operator);
    const page = await context.newPage();
    await page.goto('/dashboard');
    await expect(page.getByText('Rol: Operador')).toBeVisible();
    await expect(page.getByText('Admin', { exact: true })).toHaveCount(0);
    await shotPath(page, '20-dashboard-operator-desktop.png')();

    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/dashboard/);
    await shotPath(page, '21-operator-forbidden-users-desktop.png')();
    await context.storageState({ path: storagePath });
    await context.close();
  });

  test('cliente: portal (desktop y móvil)', async ({ browser }) => {
    const storagePath = storagePathFor(seedUsers.client.file);
    const context = await browser.newContext({ storageState: storagePath });
    const page = await context.newPage();
    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: 'Mis suscripciones', level: 1 })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await shotPath(page, '30-portal-client-desktop.png')();

    await page.setViewportSize({ width: 390, height: 844 });
    await shotPath(page, '31-portal-client-mobile.png')();
    await context.storageState({ path: storagePath });
    await context.close();
  });

  test('cliente: cambio obligatorio de contraseña', async ({ browser }) => {
    const storagePath = storagePathFor(seedUsers.clientMustChange.file);
    const context = await browser.newContext({ storageState: storagePath });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/change-password');
    await expect(page.getByRole('heading', { name: 'Cambiar contraseña', level: 1 })).toBeVisible();
    await shotPath(page, '32-change-password-mandatory-client-desktop.png')();
    await context.storageState({ path: storagePath });
    await context.close();
  });
});
