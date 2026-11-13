/**
 * P0 — login con email inexistente: 401 + una fila auth.login_failed (Postgres real).
 */
import request from 'supertest';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProblemSchema } from '@fabsoft/shared';
import { createFactories } from '../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  provisionUrl,
  resetDatabase,
} from '../helpers/db.js';
import { buildTestApp, closeTestApp } from '../helpers/app.js';

assertDbTestsRequired();

describe.skipIf(!dbTestsConfigured())(
  'POST /api/v1/auth/login — email inexistente (api-db)',
  () => {
    const factories = createFactories();

    beforeAll(async () => {
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

    it('devuelve 401 invalid_credentials y escribe exactamente 1 auth.login_failed', async () => {
      const app = await buildTestApp();
      const email = `nadie-${Date.now()}@fabsoft.test`;

      const res = await request(app).post('/api/v1/auth/login').send({
        email,
        password: 'Cualquier-Contraseña-1',
      });

      expect(res.status).toBe(401);
      expect(ProblemSchema.parse(res.body).code).toBe('invalid_credentials');

      const db = new pg.Client({ connectionString: provisionUrl });
      await db.connect();
      try {
        const { rows } = await db.query<{ n: number }>(
          `select count(*)::int as n from app.audit_logs where action = 'auth.login_failed'`,
        );
        expect(rows[0]!.n).toBe(1);
        const row = await db.query<{
          resource_id: string;
          actor_type: string;
        }>(
          `select resource_id, actor_type::text as actor_type
         from app.audit_logs where action = 'auth.login_failed'`,
        );
        expect(row.rowCount).toBe(1);
        expect(row.rows[0]!.resource_id).toBe('unknown');
        expect(row.rows[0]!.actor_type).toBe('system');
      } finally {
        await db.end();
      }
    });

    it('cinco logins fallidos ⇒ cinco filas auth.login_failed', async () => {
      const app = await buildTestApp();
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: `fallo-${i}@fabsoft.test`, password: 'x' });
        expect(res.status).toBe(401);
      }
      const db = new pg.Client({ connectionString: provisionUrl });
      await db.connect();
      try {
        const { rows } = await db.query<{ n: number }>(
          `select count(*)::int as n from app.audit_logs where action = 'auth.login_failed'`,
        );
        expect(rows[0]!.n).toBe(5);
      } finally {
        await db.end();
      }
    });
  },
);
