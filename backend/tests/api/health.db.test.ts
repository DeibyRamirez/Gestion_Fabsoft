import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
} from '../helpers/db.js';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import { expectMatchesOperation } from '../helpers/openapi.js';

assertDbTestsRequired();

describe.skipIf(!dbTestsConfigured())('GET /api/v1/health/ready (Postgres)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  it('responde 200 y cumple getReadiness', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expectMatchesOperation(res, 'getReadiness');
  });
});
