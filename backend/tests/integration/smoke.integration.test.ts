import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
  withAppContext,
} from '../helpers/db.js';
import { createFactories } from '../fixtures/factories.js';

assertDbTestsRequired();

describe.skipIf(!dbTestsConfigured())('smoke integración RLS', () => {
  const factories = createFactories({ seed: 42 });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestPools();
  });

  it('inserta con propietario y lee con fabsoft_app sujeto a RLS', async () => {
    const admin = await factories.adminUser();
    const client = await factories.client();
    await factories.contact(client, { isPrimary: true });

    const visible = await withAppContext(
      { userId: admin.id, role: 'admin', clientId: null },
      async (c) => {
        const { rows } = await c.query<{ legal_name: string }>(
          `select legal_name from app.clients where id = $1`,
          [client.id],
        );
        return rows[0]?.legal_name ?? null;
      },
    );

    expect(visible).toBe(client.legalName);

    const hidden = await withAppContext(
      { userId: admin.id, role: 'operator', clientId: null },
      async (c) => {
        const { rows } = await c.query<{ n: number }>(
          `select count(*)::int as n from app.client_contacts where client_id = $1`,
          [client.id],
        );
        return rows[0]!.n;
      },
    );
    expect(hidden).toBe(1);
  });

  it('usuario client de un tenant no ve filas de otro cliente', async () => {
    const clientA = await factories.client();
    const clientB = await factories.client();
    const portalA = await factories.clientUser(clientA);

    const rowsForOther = await withAppContext(
      { userId: portalA.id, role: 'client', clientId: clientA.id },
      async (c) => {
        const { rows } = await c.query<{ n: number }>(
          `select count(*)::int as n from app.clients where id = $1`,
          [clientB.id],
        );
        return rows[0]!.n;
      },
    );

    expect(rowsForOther).toBe(0);
  });
});
