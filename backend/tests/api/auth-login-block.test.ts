import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/composition/container.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { createApp } from '../../src/interfaces/http/app.js';
import { MemoryStore, memoryInfra } from '../fixtures/memory-infra.js';

const PASS = 'Correcta-Contraseña-1';

async function setup() {
  const store = new MemoryStore();
  store.addUser({ email: 'admin@fabsoft.test', role: 'admin', password: PASS });
  const env = loadEnv({
    APP_ENV: 'test',
    LOGIN_RATE_LIMIT_PER_MINUTE: '100',
    LOGIN_RATE_LIMIT_PER_EMAIL: '100',
    LOGIN_IP_FAILURE_THRESHOLD: '3',
    LOGIN_IP_FAILURE_WINDOW_MINUTES: '15',
    LOGIN_IP_BLOCK_MINUTES: '5',
  });
  const app = createApp(buildContainer(env, await memoryInfra(store)));
  return { store, app };
}

const login = (app: ReturnType<typeof createApp>, email: string, password: string, ip: string) =>
  request(app).post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ email, password });

describe('T-AUTH-07 — bloqueo temporal de IP en login', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('bloquea la IP tras 3 fallos y devuelve 429 con Retry-After', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await login(ctx.app, `nadie-${i}@fabsoft.test`, 'mala', '203.0.113.50');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('invalid_credentials');
    }

    const blocked = await login(ctx.app, 'nadie-4@fabsoft.test', 'mala', '203.0.113.50');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.code).toBe('rate_limited');
    expect(ctx.store.audit.filter((a) => a.action === 'auth.login_failed')).toHaveLength(3);
  });

  it('un login correcto limpia los fallos y otra IP no queda bloqueada', async () => {
    expect((await login(ctx.app, 'nadie-a@fabsoft.test', 'mala', '203.0.113.51')).status).toBe(401);
    expect((await login(ctx.app, 'nadie-b@fabsoft.test', 'mala', '203.0.113.51')).status).toBe(401);
    expect((await login(ctx.app, 'admin@fabsoft.test', PASS, '203.0.113.51')).status).toBe(200);

    expect((await login(ctx.app, 'nadie-c@fabsoft.test', 'mala', '203.0.113.51')).status).toBe(401);
    expect((await login(ctx.app, 'nadie-d@fabsoft.test', 'mala', '203.0.113.51')).status).toBe(401);
    expect((await login(ctx.app, 'admin@fabsoft.test', PASS, '203.0.113.51')).status).toBe(200);

    expect((await login(ctx.app, 'nadie-e@fabsoft.test', 'mala', '203.0.113.52')).status).toBe(401);
  });
});
