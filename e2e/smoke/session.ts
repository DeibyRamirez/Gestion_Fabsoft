import path from 'node:path';
import { expect, type Browser, type BrowserContext } from '@playwright/test';

export type RoleSession = {
  file: string;
  email: string;
  password: string;
};

export function storagePathFor(file: string) {
  return path.join(process.cwd(), 'e2e/.auth', file);
}

/** Abre contexto autenticado con login fresco (evita storage caducado en CI). */
export async function openAuthenticatedContext(
  browser: Browser,
  role: RoleSession,
): Promise<{ context: BrowserContext; storagePath: string }> {
  const storagePath = storagePathFor(role.file);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(role.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(role.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 20000 });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible({
    timeout: 30000,
  });
  await context.storageState({ path: storagePath });
  await page.close();
  return { context, storagePath };
}

/** Login fresco para el portal (evita compartir la cookie de refresh rotativa). */
export async function openPortalContext(
  browser: Browser,
  role: RoleSession,
): Promise<{ context: BrowserContext; storagePath: string }> {
  const storagePath = storagePathFor(role.file);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(role.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(role.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/portal$/, { timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'Mis suscripciones', level: 1 })).toBeVisible({
    timeout: 30000,
  });
  await context.storageState({ path: storagePath });
  await page.close();
  return { context, storagePath };
}
