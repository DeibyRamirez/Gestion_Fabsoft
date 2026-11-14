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

/** Abre contexto con cache en disco; si el refresh falló, hace un login único y actualiza el JSON. */
export async function openAuthenticatedContext(
  browser: Browser,
  role: RoleSession,
): Promise<{ context: BrowserContext; storagePath: string }> {
  const storagePath = storagePathFor(role.file);
  const context = await browser.newContext({ storageState: storagePath });
  const page = await context.newPage();
  await page.goto('/dashboard');
  if (/\/login/.test(page.url())) {
    await page.getByLabel('Email').fill(role.email);
    await page.getByLabel('Contraseña').fill(role.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).not.toHaveURL(/\/login$/, { timeout: 20000 });
    await context.storageState({ path: storagePath });
  }
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible({
    timeout: 15000,
  });
  await page.close();
  return { context, storagePath };
}
