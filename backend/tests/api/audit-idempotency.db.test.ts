/**
 * Idempotencia auditoría HTTP: client_request_id vs request_id servidor.
 */
import request from 'supertest';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFactories } from '../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  provisionUrl,
  resetDatabase,
} from '../helpers/db.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../helpers/app.js';

assertDbTestsRequired();

const clientHdr = `client-req-${Date.now()}-idem`;

describe.skipIf(!dbTestsConfigured())('audit idempotency (api-db)', () => {
  let factories: ReturnType<typeof createFactories>;

  beforeAll(async () => {
    factories = createFactories({ tokens: await getTestAccessTokens() });
    await buildTestApp();
  });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
    await factories.adminUser();
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  it('tres PATCH con mismo X-Request-Id ⇒ tres filas (request_id servidor distinto)', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const product = await factories.product();
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .patch(`/api/v1/products/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Request-Id', clientHdr)
        .send({ description: `v${i}` });
      expect(res.status).toBe(200);
    }
    const db = new pg.Client({ connectionString: provisionUrl });
    await db.connect();
    try {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from app.audit_logs
         where client_request_id = $1 and action = 'product.updated' and resource_id = $2`,
        [clientHdr, product.id],
      );
      expect(rows[0]!.n).toBe(3);
    } finally {
      await db.end();
    }
  });
});
