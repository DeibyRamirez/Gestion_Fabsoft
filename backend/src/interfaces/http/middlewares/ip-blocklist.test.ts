import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ipBlocklist } from './ip-blocklist.js';

describe('ipBlocklist', () => {
  function appWith(options: Parameters<typeof ipBlocklist>[0]) {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.post('/login', ipBlocklist(options), (req, res) => {
      res.status(req.body?.ok ? 200 : 401).json({});
    });
    return app;
  }

  it('bloquea la IP tras N fallos y la libera al expirar', async () => {
    let now = Date.parse('2026-11-19T12:00:00Z');
    const app = appWith({
      threshold: 3,
      windowMs: 60_000,
      blockMs: 120_000,
      now: () => now,
      log: () => undefined,
    });
    const fail = () =>
      request(app).post('/login').set('X-Forwarded-For', '203.0.113.10').send({ ok: false });

    for (let i = 0; i < 3; i++) expect((await fail()).status).toBe(401);

    const blocked = await fail();
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBe('120');
    expect(blocked.body.code).toBe('rate_limited');

    now += 121_000;
    const allowed = await request(app)
      .post('/login')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ ok: true });
    expect(allowed.status).toBe(200);
  });

  it('un login exitoso limpia el contador de fallos de esa IP', async () => {
    const now = Date.parse('2026-11-19T12:00:00Z');
    const app = appWith({
      threshold: 3,
      windowMs: 60_000,
      blockMs: 60_000,
      now: () => now,
      log: () => undefined,
    });
    const send = (ok: boolean) =>
      request(app).post('/login').set('X-Forwarded-For', '198.51.100.7').send({ ok });

    expect((await send(false)).status).toBe(401);
    expect((await send(false)).status).toBe(401);
    expect((await send(true)).status).toBe(200);
    expect((await send(false)).status).toBe(401);
    expect((await send(false)).status).toBe(401);
    expect((await send(false)).status).toBe(401);
  });

  it('no bloquea otras IPs', async () => {
    const now = Date.parse('2026-11-19T12:00:00Z');
    const app = appWith({
      threshold: 1,
      windowMs: 60_000,
      blockMs: 60_000,
      now: () => now,
      log: () => undefined,
    });
    const send = (ip: string) =>
      request(app).post('/login').set('X-Forwarded-For', ip).send({ ok: false });

    expect((await send('203.0.113.20')).status).toBe(401);
    expect((await send('203.0.113.20')).status).toBe(429);
    expect((await send('203.0.113.21')).status).toBe(401);
  });

  it('registra el bloqueo una sola vez', async () => {
    const now = Date.parse('2026-11-19T12:00:00Z');
    const logs: Record<string, unknown>[] = [];
    const app = appWith({
      threshold: 1,
      windowMs: 60_000,
      blockMs: 60_000,
      now: () => now,
      log: (entry) => logs.push(entry),
    });
    const send = () =>
      request(app).post('/login').set('X-Forwarded-For', '203.0.113.30').send({ ok: false });

    expect((await send()).status).toBe(401);
    expect((await send()).status).toBe(429);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ msg: 'auth.ip_blocked', ip: '203.0.113.30' });
  });
});
