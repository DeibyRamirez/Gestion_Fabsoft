import path from 'node:path';
import { expect, test } from '@playwright/test';

const adminState = path.join(process.cwd(), 'e2e/.auth/admin.json');

test.describe('HU-05 — catálogo de productos', () => {
  test('admin crea y desactiva un producto sin precio ni periodicidad', async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState });
    const page = await context.newPage();
    const name = `Producto E2E ${Date.now()}`;

    await page.goto('/admin/products');
    await expect(page.getByRole('heading', { name: 'Productos', level: 1 })).toBeVisible();
    await expect(page.getByText('El catálogo no guarda precio ni periodicidad.')).toBeVisible();
    await expect(page.getByLabel(/Precio/i)).toHaveCount(0);

    await page.getByLabel('Nombre', { exact: true }).fill(name);
    await page.getByLabel('Tipo').selectOption('own');
    await page.getByRole('button', { name: 'Crear producto' }).click();

    await expect(
      page.getByText('Producto creado. Ya está disponible para nuevas suscripciones.'),
    ).toBeVisible();
    await expect(page.getByRole('cell', { name })).toBeVisible();

    page.on('dialog', (dialog) => void dialog.accept());
    const row = page.getByRole('row', { name: new RegExp(name) });
    await row.getByRole('button', { name: 'Desactivar' }).click();

    await expect(
      page.getByText(
        'Producto desactivado. No se ofrece para nuevas suscripciones; las existentes no cambian.',
      ),
    ).toBeVisible();
    await expect(row.getByText('Inactivo')).toBeVisible();

    await context.close();
  });
});
