import path from 'node:path';
import { expect, test } from '@playwright/test';

const adminState = path.join(process.cwd(), 'e2e/.auth/admin.json');

test.describe('HU-08 — auditoría', () => {
  test('admin consulta un cambio sensible en audit-logs', async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState });
    const page = await context.newPage();
    const name = `Producto auditoría ${Date.now()}`;

    await page.goto('/admin/products');
    await page.getByLabel('Nombre', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Crear producto' }).click();
    await expect(
      page.getByText('Producto creado. Ya está disponible para nuevas suscripciones.'),
    ).toBeVisible();

    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { name: 'Auditoría', level: 1 })).toBeVisible();
    await page.getByLabel('Acción').fill('product.created');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();

    await expect(page.getByText('product.created').first()).toBeVisible();
    await expect(page.getByText('Ver before/after').first()).toBeVisible();

    await context.storageState({ path: adminState });
    await context.close();
  });
});
