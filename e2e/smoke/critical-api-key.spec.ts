import { expect, test } from '@playwright/test';
import { seedUsers } from './seed-users';
import { openAuthenticatedContext } from './session';

const apiBase = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';

test.describe('HT-07 — API key de integración', () => {
  test('admin crea una integración, emite una API key y la usa', async ({ browser, request }) => {
    const { context, storagePath } = await openAuthenticatedContext(browser, seedUsers.admin);
    const page = await context.newPage();
    const stamp = Date.now().toString(36);
    const slug = `e2e-api-${stamp}`;
    const displayName = `Integración E2E ${stamp}`;
    const manifest = {
      manifest_schema_version: 1,
      integration: slug,
      version: '1.0.0',
      display_name: displayName,
      scopes: ['subscriptions:read'],
      client_scope: 'all',
      rate_limit_per_minute: 60,
    };

    await page.goto('/admin/integrations');
    await expect(page.getByRole('heading', { name: 'Integraciones', level: 1 })).toBeVisible();
    await page.locator('#integration-manifest').fill(JSON.stringify(manifest, null, 2));
    await page.getByRole('button', { name: 'Crear integración' }).click();
    await expect(page.getByRole('link', { name: displayName })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('link', { name: displayName }).click();

    await expect(page.getByRole('heading', { name: displayName, level: 1 })).toBeVisible();
    await page.locator('#credential-label').fill('E2E');
    await page.getByRole('button', { name: 'Emitir API key' }).click();
    await expect(page.getByText('API key creada')).toBeVisible({ timeout: 15_000 });

    const secret = await page
      .locator('code')
      .filter({ hasText: /^fsk_(test|live)_.+_.{16,}$/ })
      .first()
      .innerText();
    expect(secret).toMatch(/^fsk_(test|live)_/);

    const subscriptions = await request.get(`${apiBase}/api/v1/subscriptions?pageSize=5`, {
      headers: { 'X-Api-Key': secret },
    });
    expect(subscriptions.status()).toBe(200);
    const pageBody = (await subscriptions.json()) as { data: unknown[] };
    expect(pageBody.data.length).toBeGreaterThan(0);

    const forbidden = await request.get(`${apiBase}/api/v1/clients`, {
      headers: { 'X-Api-Key': secret },
    });
    expect(forbidden.status()).toBe(403);

    await context.storageState({ path: storagePath });
    await context.close();
  });
});
