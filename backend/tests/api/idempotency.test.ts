import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/composition/container.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { createApp } from '../../src/interfaces/http/app.js';
import { canonicalJson } from '../../src/interfaces/http/middlewares/idempotency.js';
import { MemoryStore, memoryInfra } from '../fixtures/memory-infra.js';

const PASS = 'Correcta-Contraseña-1';
const body = { email: 'nuevo@fabsoft.test', fullName: 'Nuevo', role: 'operator' };

/** Espera a que el middleware persista la respuesta (se hace en 'finish'). */
const settle = () => new Promise((r) => setTimeout(r, 10));

describe('T-API-05 Idempotency-Key en POST /users', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let store: MemoryStore;
  let auth: Record<string, string>;

  beforeEach(async () => {
    store = new MemoryStore();
    store.addUser({ email: 'admin@fabsoft.test', role: 'admin', password: PASS });
    app = createApp(buildContainer(loadEnv({ APP_ENV: 'test' }), await memoryInfra(store)));
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@fabsoft.test', password: PASS });
    auth = { Authorization: `Bearer ${res.body.accessToken}` };
  });

  it('replay devuelve la misma respuesta con Idempotency-Replayed y no crea otro usuario', async () => {
    const first = await request(app)
      .post('/api/v1/users')
      .set(auth)
      .set('Idempotency-Key', 'key-00000001')
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.temporaryPassword).toBeTruthy();
    await settle();
    const replay = await request(app)
      .post('/api/v1/users')
      .set(auth)
      .set('Idempotency-Key', 'key-00000001')
      .send({ role: 'operator', fullName: 'Nuevo', email: 'nuevo@fabsoft.test' }); // mismo cuerpo, otro orden
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.temporaryPassword).toBeUndefined(); // nunca se persiste
    expect([...store.users.values()].filter((u) => u.email === body.email)).toHaveLength(1);
    expect(JSON.stringify([...store.idem.values()])).not.toContain(first.body.temporaryPassword);
  });

  it('misma clave con cuerpo distinto ⇒ 422 idempotency_key_reused', async () => {
    await request(app)
      .post('/api/v1/users')
      .set(auth)
      .set('Idempotency-Key', 'key-00000002')
      .send(body);
    await settle();
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth)
      .set('Idempotency-Key', 'key-00000002')
      .send({ ...body, fullName: 'Otro' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('idempotency_key_reused');
  });

  it('petición original en curso ⇒ 409 idempotency_in_progress', async () => {
    const [actorId] = [...store.users.keys()];
    const { createHash } = await import('node:crypto');
    store.idem.set(`${actorId}|key-00000003`, {
      method: 'POST',
      path: '/api/v1/users',
      requestHash: createHash('sha256').update(canonicalJson(body)).digest('hex'),
      responseStatus: null,
      responseBody: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth)
      .set('Idempotency-Key', 'key-00000003')
      .send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('idempotency_in_progress');
  });

  it('clave inválida ⇒ 400; sin clave ⇒ sin idempotencia (duplicado ⇒ 409 duplicate_email)', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/users')
          .set(auth)
          .set('Idempotency-Key', 'corta')
          .send(body)
      ).status,
    ).toBe(400);
    expect((await request(app).post('/api/v1/users').set(auth).send(body)).status).toBe(201);
    const dup = await request(app).post('/api/v1/users').set(auth).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('duplicate_email');
  });

  it('respuestas 4xx también se reproducen (misma clave ⇒ mismo 409)', async () => {
    await request(app).post('/api/v1/users').set(auth).send(body);
    const a = await request(app)
      .post('/api/v1/users')
      .set(auth)
      .set('Idempotency-Key', 'key-00000005')
      .send(body);
    await settle();
    const b = await request(app)
      .post('/api/v1/users')
      .set(auth)
      .set('Idempotency-Key', 'key-00000005')
      .send(body);
    expect([a.status, b.status]).toEqual([409, 409]);
    expect(b.headers['idempotency-replayed']).toBe('true');
  });
});
