import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
} from '../helpers/db.js';
import { createFactories } from '../fixtures/factories.js';

assertDbTestsRequired();

describe.skipIf(!dbTestsConfigured())('factories deterministas (semilla 42)', () => {
  afterAll(async () => {
    await closeTestPools();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function snapshot() {
    const f = createFactories({ seed: 42 });
    f.reseed();
    const client = await f.client();
    const contact = await f.contact(client, { isPrimary: true });
    const product = await f.product();
    const sub = await f.subscription(client, product);
    const extraPeriod = await f.period(sub);
    const admin = await f.adminUser();
    const operator = await f.operatorUser();
    const portal = await f.clientUser(client);
    const renewal = await f.renewalRequest(sub, { requestedByUserId: portal.id });
    return JSON.stringify({
      client,
      contact,
      product,
      sub,
      extraPeriod,
      admin: { ...admin, password: admin.password },
      operator: { ...operator, password: operator.password },
      portal: { ...portal, password: portal.password },
      renewal,
    });
  }

  it('genera el mismo conjunto dos veces con semilla 42', async () => {
    const a = await snapshot();
    await resetDatabase();
    const b = await snapshot();
    expect(a).toBe(b);
  });
});
