import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/composition/container.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { createApp } from '../../src/interfaces/http/app.js';
import { MemoryStore, memoryInfra } from '../fixtures/memory-infra.js';

describe('HT-06 — cabeceras y límites de seguridad', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    app = createApp(
      buildContainer(
        loadEnv({ APP_ENV: 'test', CORS_ALLOWED_ORIGINS: 'http://localhost:3000' }),
        await memoryInfra(new MemoryStore()),
      ),
    );
  });

  it('aplica CSP estricta, HSTS y cabeceras de aislamiento a la API', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);

    expect(res.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("script-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['content-security-policy']).not.toContain("'unsafe-inline'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('relaja solo la CSP de Swagger UI para sus assets locales', async () => {
    const res = await request(app).get('/api/v1/docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['content-security-policy']).not.toContain('https://unpkg.com');
  });

  it('rechaza cuerpos mayores a 100 KB con problem+json 413', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'a@b.test', password: 'x'.repeat(110 * 1024) });

    expect(res.status).toBe(413);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.code).toBe('payload_too_large');
  });

  it('no refleja orígenes CORS no autorizados', async () => {
    const evil = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();

    const allowed = await request(app)
      .options('/api/v1/clients')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
});
