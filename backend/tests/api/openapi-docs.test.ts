import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/composition/container.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { createApp } from '../../src/interfaces/http/app.js';
import { MemoryStore, memoryInfra } from '../fixtures/memory-infra.js';

describe('GET /api/v1/docs (OpenAPI navegable)', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    app = createApp(
      buildContainer(loadEnv({ APP_ENV: 'test' }), await memoryInfra(new MemoryStore())),
    );
  });

  it('sirve Swagger UI sin autenticación y con assets locales', async () => {
    const redirect = await request(app).get('/api/v1/docs');
    expect(redirect.status).toBe(301);
    expect(redirect.headers['location']).toBe('/api/v1/docs/');

    const page = await request(app).get('/api/v1/docs/');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.text).toContain('swagger-ui');
    expect(page.text).toContain('FabSoft API v1');

    const css = await request(app).get('/api/v1/docs/swagger-ui.css');
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toMatch(/text\/css/);

    const init = await request(app).get('/api/v1/docs/swagger-ui-init.js');
    expect(init.status).toBe(200);
    expect(init.headers['content-type']).toMatch(/javascript/);
    expect(init.text).toContain('FabSoft API');
  });

  it('publica el openapi.json generado desde el contrato', async () => {
    const spec = await request(app).get('/api/v1/docs/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.headers['content-type']).toMatch(/application\/json/);
    expect(spec.headers['cache-control']).toContain('max-age=300');
    expect(spec.body).toMatchObject({
      openapi: '3.1.0',
      info: { title: 'FabSoft API', version: '1.0.0' },
    });
    expect(spec.body.paths['/api/v1/health']).toBeDefined();
  });
});
