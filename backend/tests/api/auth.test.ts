import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MeSchema,
  ProblemSchema,
  TokenResponseSchema,
  UserCreatedSchema,
  UserPageSchema,
} from '@fabsoft/shared';
import { buildContainer } from '../../src/composition/container.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { createApp } from '../../src/interfaces/http/app.js';
import { MemoryStore, memoryInfra } from '../fixtures/memory-infra.js';

const PASS = 'Correcta-Contraseña-1';
const CLIENT_ID = '00000000-0000-4000-8000-00000000c001';

async function setup() {
  const store = new MemoryStore();
  const admin = store.addUser({ email: 'admin@fabsoft.test', role: 'admin', password: PASS });
  const operator = store.addUser({ email: 'op@fabsoft.test', role: 'operator', password: PASS });
  const client = store.addUser({
    email: 'cli@acme.test',
    role: 'client',
    clientId: CLIENT_ID,
    password: PASS,
  });
  const app = createApp(buildContainer(loadEnv({ APP_ENV: 'test' }), await memoryInfra(store)));
  return { store, admin, operator, client, app };
}

type Ctx = Awaited<ReturnType<typeof setup>>;
const login = (ctx: Ctx, email: string, password = PASS) =>
  request(ctx.app).post('/api/v1/auth/login').send({ email, password });
const cookieOf = (res: request.Response) =>
  String((res.headers['set-cookie'] as unknown as string[])[0]).split(';')[0]!;

describe('HU-01 auth y roles', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('login válido devuelve TokenResponse y cookie fs_rt HttpOnly/Strict', async () => {
    const res = await login(ctx, 'ADMIN@fabsoft.test');
    expect(res.status).toBe(200);
    const body = TokenResponseSchema.parse(res.body);
    expect(body.user.role).toBe('admin');
    const cookie = String((res.headers['set-cookie'] as unknown as string[])[0]);
    expect(cookie).toMatch(/fs_rt=.+HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('credenciales inválidas, email inexistente y usuario desactivado responden igual (401 invalid_credentials)', async () => {
    ctx.store.users.get(ctx.operator.id)!.status = 'disabled';
    for (const [email, pw] of [
      ['admin@fabsoft.test', 'mala'],
      ['nadie@x.co', PASS],
      ['op@fabsoft.test', PASS],
    ] as const) {
      const res = await login(ctx, email, pw);
      expect(res.status).toBe(401);
      expect(ProblemSchema.parse(res.body).code).toBe('invalid_credentials');
    }
    expect(ctx.store.audit.filter((a) => a.action === 'auth.login_failed')).toHaveLength(3);
  });

  it('operador recibe 403 en gestión de usuarios; cliente también', async () => {
    for (const email of ['op@fabsoft.test', 'cli@acme.test']) {
      const { body } = await login(ctx, email);
      const res = await request(ctx.app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${body.accessToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('forbidden');
    }
  });

  it('admin lista y crea usuarios (contraseña temporal una vez, cambio obligatorio)', async () => {
    const { body } = await login(ctx, 'admin@fabsoft.test');
    const auth = { Authorization: `Bearer ${body.accessToken}` };
    const list = await request(ctx.app).get('/api/v1/users?role=admin,operator').set(auth);
    expect(UserPageSchema.parse(list.body).meta.total).toBe(2);
    const created = await request(ctx.app)
      .post('/api/v1/users')
      .set(auth)
      .send({ email: 'nuevo@fabsoft.test', fullName: 'Nuevo', role: 'operator' });
    expect(created.status).toBe(201);
    const user = UserCreatedSchema.parse(created.body);
    expect(user.mustChangePassword).toBe(true);
    const dup = await request(ctx.app)
      .post('/api/v1/users')
      .set(auth)
      .send({ email: 'nuevo@fabsoft.test', fullName: 'Nuevo', role: 'operator' });
    expect(dup.status).toBe(409);
    const badClient = await request(ctx.app)
      .post('/api/v1/users')
      .set(auth)
      .send({ email: 'c@x.co', fullName: 'Cli', role: 'client' });
    expect(badClient.status).toBe(400);

    // Con contraseña temporal sólo puede ver /me y cambiarla
    const tmp = await login(ctx, 'nuevo@fabsoft.test', user.temporaryPassword);
    const tmpAuth = { Authorization: `Bearer ${tmp.body.accessToken}` };
    expect(
      MeSchema.parse((await request(ctx.app).get('/api/v1/auth/me').set(tmpAuth)).body)
        .mustChangePassword,
    ).toBe(true);
    const change = await request(ctx.app)
      .post('/api/v1/auth/change-password')
      .set(tmpAuth)
      .send({ currentPassword: user.temporaryPassword, newPassword: 'Nueva-Contraseña-Segura' });
    expect(change.status).toBe(204);
    expect((await login(ctx, 'nuevo@fabsoft.test', 'Nueva-Contraseña-Segura')).status).toBe(200);
  });

  it('con contraseña temporal las rutas protegidas responden 403 hasta cambiarla', async () => {
    ctx.store.users.get(ctx.admin.id)!.mustChangePassword = true;
    const { body } = await login(ctx, 'admin@fabsoft.test');
    expect(body.user.mustChangePassword).toBe(true);
    const auth = { Authorization: `Bearer ${body.accessToken}` };
    for (const path of ['/api/v1/users', `/api/v1/users/${ctx.operator.id}`]) {
      const res = await request(ctx.app).get(path).set(auth);
      expect(res.status).toBe(403);
      expect(ProblemSchema.parse(res.body).code).toBe('password_change_required');
    }
    const blockedCreate = await request(ctx.app)
      .post('/api/v1/users')
      .set(auth)
      .send({ email: 'x@fabsoft.test', fullName: 'X', role: 'operator' });
    expect(blockedCreate.status).toBe(403);
    expect((await request(ctx.app).get('/api/v1/auth/me').set(auth)).status).toBe(200);

    const change = await request(ctx.app)
      .post('/api/v1/auth/change-password')
      .set(auth)
      .send({ currentPassword: PASS, newPassword: 'Admin-Contraseña-Nueva' });
    expect(change.status).toBe(204);
    for (const path of ['/api/v1/users', `/api/v1/users/${ctx.operator.id}`]) {
      expect((await request(ctx.app).get(path).set(auth)).status).toBe(200);
    }
  });

  it('un admin no puede quitarse el rol a sí mismo (422)', async () => {
    const { body } = await login(ctx, 'admin@fabsoft.test');
    const res = await request(ctx.app)
      .patch(`/api/v1/users/${ctx.admin.id}`)
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({ role: 'operator' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('invalid_state_transition');
  });

  it('T-AUTH-03: usuario desactivado ⇒ 401 aunque su JWT siga vigente, y sus refresh quedan revocados', async () => {
    const op = await login(ctx, 'op@fabsoft.test');
    const adm = await login(ctx, 'admin@fabsoft.test');
    const res = await request(ctx.app)
      .patch(`/api/v1/users/${ctx.operator.id}`)
      .set('Authorization', `Bearer ${adm.body.accessToken}`)
      .send({ status: 'disabled' });
    expect(res.status).toBe(200);
    const me = await request(ctx.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${op.body.accessToken}`);
    expect(me.status).toBe(401);
    expect(
      ctx.store.tokens
        .filter((t) => t.userId === ctx.operator.id)
        .every((t) => t.revokedReason === 'user_disabled'),
    ).toBe(true);
  });

  it('T-AUTH-01/02: refresh rota y la reutilización revoca la familia', async () => {
    const first = await login(ctx, 'op@fabsoft.test');
    const oldCookie = cookieOf(first);
    const refresh = (cookie: string) =>
      request(ctx.app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .set('X-Requested-With', 'fabsoft-web');
    const rotated = await refresh(oldCookie);
    expect(rotated.status).toBe(200);
    const newCookie = cookieOf(rotated);
    expect(newCookie).not.toBe(oldCookie);
    expect((await refresh(oldCookie)).status).toBe(401); // reutilización
    expect((await refresh(newCookie)).status).toBe(401); // familia revocada
    expect(ctx.store.audit.some((a) => a.action === 'auth.refresh_reuse_detected')).toBe(true);
  });

  it('refresh sin X-Requested-With ⇒ 403; logout revoca la sesión', async () => {
    const first = await login(ctx, 'op@fabsoft.test');
    const cookie = cookieOf(first);
    expect((await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(
      403,
    );
    expect((await request(ctx.app).post('/api/v1/auth/logout').set('Cookie', cookie)).status).toBe(
      204,
    );
    const again = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('X-Requested-With', 'fabsoft-web');
    expect(again.status).toBe(401);
  });

  it('T-API-02: Authorization + X-Api-Key ⇒ 400 ambiguous_credentials; token manipulado ⇒ 401', async () => {
    const { body } = await login(ctx, 'admin@fabsoft.test');
    const both = await request(ctx.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .set('X-Api-Key', 'fsk_test_x');
    expect(both.status).toBe(400);
    expect(both.body.code).toBe('ambiguous_credentials');
    const tampered = await request(ctx.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}x`);
    expect(tampered.status).toBe(401);
  });

  it('la respuesta nunca expone passwordHash', async () => {
    const { body } = await login(ctx, 'admin@fabsoft.test');
    const res = await request(ctx.app)
      .get(`/api/v1/users/${ctx.client.id}`)
      .set('Authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
  });

  it('cambiar contraseña revoca las demás sesiones y conserva la actual', async () => {
    const current = await login(ctx, 'op@fabsoft.test');
    const other = await login(ctx, 'op@fabsoft.test');
    const refresh = (cookie: string) =>
      request(ctx.app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .set('X-Requested-With', 'fabsoft-web');
    const res = await request(ctx.app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${current.body.accessToken}`)
      .set('Cookie', cookieOf(current))
      .send({ currentPassword: PASS, newPassword: 'Otra-Contraseña-Segura' });
    expect(res.status).toBe(204);
    expect((await refresh(cookieOf(other))).status).toBe(401);
    expect((await refresh(cookieOf(current))).status).toBe(200);
    expect(ctx.store.tokens.some((t) => t.revokedReason === 'password_changed')).toBe(true);
  });

  it('reset de contraseña por un admin revoca todas las sesiones del usuario', async () => {
    const a = await login(ctx, 'op@fabsoft.test');
    const b = await login(ctx, 'op@fabsoft.test');
    const adm = await login(ctx, 'admin@fabsoft.test');
    const res = await request(ctx.app)
      .post(`/api/v1/users/${ctx.operator.id}/reset-password`)
      .set('Authorization', `Bearer ${adm.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(16);
    for (const s of [a, b]) {
      const r = await request(ctx.app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieOf(s))
        .set('X-Requested-With', 'fabsoft-web');
      expect(r.status).toBe(401);
    }
    expect(ctx.store.users.get(ctx.operator.id)!.mustChangePassword).toBe(true);
    expect(ctx.store.audit.some((e) => e.action === 'user.password_reset')).toBe(true);
  });
});
