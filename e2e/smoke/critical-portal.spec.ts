import { expect, test } from '@playwright/test';
import { seedUsers } from './seed-users';
import { openPortalContext } from './session';

const apiBase = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';

const todayInBogota = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

test.describe('HT-07 — portal del cliente', () => {
  test('cliente consulta su suscripción y registra una solicitud', async ({ browser, request }) => {
    const { context, storagePath } = await openPortalContext(browser, seedUsers.client);
    const page = await context.newPage();
    const stamp = Date.now().toString(36);
    const comment = `Solicitud E2E ${stamp}`;
    const productName = `Producto Portal E2E ${stamp}`;

    const login = await request.post(`${apiBase}/api/v1/auth/login`, {
      data: { email: seedUsers.admin.email, password: seedUsers.admin.password },
    });
    expect(login.status()).toBe(200);
    const { accessToken } = (await login.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const clients = await request.get(`${apiBase}/api/v1/clients?pageSize=100&status=activo`, {
      headers: auth,
    });
    const andina = (
      (await clients.json()) as { data: Array<{ id: string; legalName: string }> }
    ).data.find((client) => client.legalName.startsWith('Distribuidora Andina'));
    expect(andina).toBeTruthy();

    const product = await request.post(`${apiBase}/api/v1/products`, {
      headers: { ...auth, 'Idempotency-Key': `portal-product-${stamp}` },
      data: { name: productName, productType: 'own' },
    });
    expect(product.status()).toBe(201);
    const productId = ((await product.json()) as { id: string }).id;

    const subscription = await request.post(`${apiBase}/api/v1/subscriptions`, {
      headers: { ...auth, 'Idempotency-Key': `portal-subscription-${stamp}` },
      data: {
        clientId: andina!.id,
        productId,
        startDate: todayInBogota(),
        billingCycle: 'monthly',
        priceAmount: '100000.00',
        visibleInPortal: true,
      },
    });
    expect(subscription.status()).toBe(201);

    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: 'Mis suscripciones', level: 1 })).toBeVisible();
    await expect(page.getByText(productName)).toBeVisible();

    const requestLink = page.getByRole('link', { name: 'Solicitar renovación' }).first();
    await expect(requestLink).toBeVisible({ timeout: 15_000 });
    await requestLink.click();

    await expect(page.getByRole('heading', { name: 'Solicitar renovación' })).toBeVisible();
    await page.locator('#renewal-comment').fill(comment);
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(
      page.getByText('Ya tienes una solicitud de renovación abierta para esta suscripción.'),
    ).toBeVisible({ timeout: 15_000 });

    await page.goto('/portal/requests');
    await expect(page.getByRole('heading', { name: 'Mis solicitudes', level: 1 })).toBeVisible();
    await expect(page.getByText(comment)).toBeVisible();

    await context.storageState({ path: storagePath });
    await context.close();
  });
});
