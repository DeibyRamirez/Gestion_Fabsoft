import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@fabsoft/shared';
import { buildContainer } from '../../src/composition/container.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { createApp } from '../../src/interfaces/http/app.js';
import { MemoryStore, memoryInfra } from '../fixtures/memory-infra.js';

describe('GET /api/v1/health', async () => {
  const store = new MemoryStore();
  const app = createApp(
    buildContainer(loadEnv({ APP_VERSION: 'test', APP_ENV: 'test' }), await memoryInfra(store)),
  );

  it('responde 200 con el esquema Health', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(res.body)).toEqual({ status: 'ok', version: 'test' });
  });

  it('404 problem+json en rutas desconocidas', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('not_found');
  });

  it('GET /health/ready: 200 con BD arriba y 503 con BD caída', async () => {
    store.dbUp = true;
    const ok = await request(app).get('/api/v1/health/ready');
    expect(ok.status).toBe(200);
    expect(HealthResponseSchema.parse(ok.body)).toEqual({
      status: 'ok',
      version: 'test',
      checks: { database: 'ok' },
    });
    store.dbUp = false;
    const down = await request(app).get('/api/v1/health/ready');
    expect(down.status).toBe(503);
    expect(down.body).toMatchObject({ status: 'down', checks: { database: 'fail' } });
  });
});
