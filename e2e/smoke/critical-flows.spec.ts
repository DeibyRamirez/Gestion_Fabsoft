import { expect, test } from '@playwright/test';
import { seedUsers } from './seed-users';
import { openAuthenticatedContext } from './session';

const todayInBogota = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

test.describe('HT-07 — alta, suscripción y renovación', () => {
  test.describe.configure({ mode: 'serial' });

  const stamp = Date.now().toString(36);
  const clientName = `Cliente E2E ${stamp}`;
  let subscriptionPath = '';

  test('admin crea cliente y suscripción desde la UI', async ({ browser }) => {
    const { context, storagePath } = await openAuthenticatedContext(browser, seedUsers.admin);
    const page = await context.newPage();

    await page.goto('/clients/new');
    await page.getByLabel('Razón social').fill(clientName);
    await page.getByLabel('Email').fill(`cliente-${stamp}@fabsoft.test`);
    await page.getByRole('button', { name: 'Crear cliente' }).click();
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]+\?created=1$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: clientName, level: 1 })).toBeVisible();
    const createdClientId = new URL(page.url()).pathname.split('/').pop() ?? '';
    expect(createdClientId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByText('Cliente creado.')).toBeVisible();
    await expect(page.getByText(createdClientId).first()).toBeVisible();

    await page.goto('/subscriptions/new');
    const clientOption = page
      .getByLabel('Cliente activo')
      .locator('option')
      .filter({ hasText: clientName });
    await expect(clientOption).toHaveCount(1, { timeout: 15_000 });
    await page.getByLabel('Cliente activo').selectOption({ label: clientName });
    const productOption = page
      .getByLabel('Producto activo')
      .locator('option')
      .filter({ hasText: 'Microsoft 365 Business Standard' });
    await expect(productOption).toHaveCount(1, { timeout: 15_000 });
    await page.getByLabel('Producto activo').selectOption({
      label: 'Microsoft 365 Business Standard',
    });
    await page.getByLabel('Fecha de inicio').fill(todayInBogota());
    await page.getByLabel('Periodicidad').selectOption('monthly');
    await page.getByLabel('Precio (COP)').fill('150000');
    await page.getByRole('button', { name: 'Crear suscripción' }).click();

    await expect(page).toHaveURL(/\/subscriptions\/[0-9a-f-]+$/, { timeout: 15_000 });
    await expect(
      page.getByRole('heading', { name: new RegExp(clientName), level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historial de periodos' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(1);

    subscriptionPath = new URL(page.url()).pathname;
    await context.storageState({ path: storagePath });
    await context.close();
  });

  test('admin inicia y confirma la renovación', async ({ browser }) => {
    const { context, storagePath } = await openAuthenticatedContext(browser, seedUsers.admin);
    const page = await context.newPage();
    await page.goto(subscriptionPath);

    const toast = page.locator('[aria-live="polite"]');

    await page.getByRole('button', { name: 'Activar', exact: true }).click();
    await expect(toast.getByText('Suscripción activada.')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Iniciar renovación' }).click();
    await expect(toast.getByText('Renovación iniciada.')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Renovar', exact: true }).click();
    const renewDialog = page.getByRole('dialog', { name: 'Renovar suscripción' });
    await expect(renewDialog).toBeVisible();
    await renewDialog.getByLabel('Nuevo precio del periodo (COP)').fill('160000');
    await renewDialog.getByRole('button', { name: 'Confirmar renovación' }).click();
    await expect(toast.getByText('Suscripción renovada.')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('tbody tr')).toHaveCount(2, { timeout: 15_000 });

    await context.storageState({ path: storagePath });
    await context.close();
  });
});
