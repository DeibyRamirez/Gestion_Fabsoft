/**
 * P0 — login con email inexistente: 401 + una fila auth.login_failed (Postgres real).
 */
import request from 'supertest';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProblemSchema } from '@fabsoft/shared';
import { createFactories, type FactoryUser } from '../fixtures/factories.js';
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
    let admin: FactoryUser;

    beforeAll(async () => {
      await buildTestApp();
    });

    beforeEach(async () => {
      factories.reseed();
      await resetDatabase();
      admin = await factories.adminUser();
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

    it('T-SEC-04: neutraliza payloads de inyección SQL en email y contraseña', async () => {
      const app = await buildTestApp();

      for (const payload of [
        "' OR '1'='1",
        "'; DROP TABLE app.users; --",
        '" OR 1=1 --',
        "admin@fabsoft.test' --",
      ]) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', '203.0.113.99')
          .send({ email: admin.email, password: payload });
        expect(res.status).toBe(401);
        expect(ProblemSchema.parse(res.body).code).toBe('invalid_credentials');
      }

      const badEmail = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '203.0.113.99')
        .send({ email: "admin@fabsoft.test' OR '1'='1", password: admin.password });
      expect(badEmail.status).toBe(400);

      const db = new pg.Client({ connectionString: provisionUrl });
      await db.connect();
      try {
        const table = await db.query<{ name: string | null }>(
          `select to_regclass('app.users')::text as name`,
        );
        expect(table.rows[0]!.name).toBe('app.users');
        const users = await db.query<{ n: number }>(`select count(*)::int as n from app.users`);
        expect(users.rows[0]!.n).toBeGreaterThanOrEqual(1);
      } finally {
        await db.end();
      }
    });
  },
);
