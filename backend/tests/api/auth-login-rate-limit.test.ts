import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/composition/container.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { createApp } from '../../src/interfaces/http/app.js';
import { MemoryStore, memoryInfra } from '../fixtures/memory-infra.js';

const PASS = 'Correcta-Contraseña-1';
const WRONG_PASS = `${PASS}-incorrecta`;

async function setup(overrides: Record<string, string>) {
  const store = new MemoryStore();
  store.addUser({ email: 'admin@fabsoft.test', role: 'admin', password: PASS });
  const env = loadEnv({ APP_ENV: 'test', ...overrides });
  return createApp(buildContainer(env, await memoryInfra(store)));
}

describe('T-AUTH-08 — límites de peticiones del login', () => {
  it('corta por IP al superar el límite por minuto', async () => {
    const app = await setup({
      LOGIN_RATE_LIMIT_PER_MINUTE: '2',
      LOGIN_RATE_LIMIT_PER_EMAIL: '100',
      LOGIN_IP_FAILURE_THRESHOLD: '100',
    });
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@fabsoft.test', password: PASS });
      expect(res.status).toBe(200);
    }
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@fabsoft.test', password: PASS });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('rate_limited');
  });

  it('corta por cuenta al superar el límite por IP+email', async () => {
    const app = await setup({
      LOGIN_RATE_LIMIT_PER_MINUTE: '100',
      LOGIN_RATE_LIMIT_PER_EMAIL: '2',
      LOGIN_IP_FAILURE_THRESHOLD: '100',
    });
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@fabsoft.test', password: WRONG_PASS });
      expect(res.status).toBe(401);
    }
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@fabsoft.test', password: WRONG_PASS });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('rate_limited');
  });
});
