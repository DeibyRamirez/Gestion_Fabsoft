#!/usr/bin/env node
/**
 * Smoke post-deploy: liveness/readiness, documentación, web y login opcional.
 * Uso:
 *   SMOKE_API_URL=https://api.example.com SMOKE_WEB_URL=https://app.example.com pnpm smoke:deploy
 *   SMOKE_ADMIN_EMAIL=... SMOKE_ADMIN_PASSWORD=... pnpm smoke:deploy
 */
const apiBase = (process.env.SMOKE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const webBase = (process.env.SMOKE_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const timeout = AbortSignal.timeout(10_000);
const checks = [];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, status: 'ok' });
  } catch (error) {
    checks.push({ name, status: 'failed', error: String(error?.message ?? error) });
  }
}

const request = (url, init = {}) =>
  fetch(url, { redirect: 'manual', ...init, signal: timeout, headers: { ...init.headers } });

await check('api: liveness', async () => {
  const res = await request(`${apiBase}/api/v1/health`);
  assert(res.status === 200, `status ${res.status}`);
  const body = await res.json();
  assert(body.status === 'ok', `status body ${body.status}`);
});

await check('api: readiness', async () => {
  const res = await request(`${apiBase}/api/v1/health/ready`);
  assert(res.status === 200, `status ${res.status}`);
  const body = await res.json();
  assert(body.status === 'ready' || body.status === 'ok', `status body ${body.status}`);
});

await check('api: documentación', async () => {
  const docs = await request(`${apiBase}/api/v1/docs/`);
  assert(docs.status === 200, `docs status ${docs.status}`);
  const spec = await request(`${apiBase}/api/v1/docs/openapi.json`);
  assert(spec.status === 200, `spec status ${spec.status}`);
});

await check('web: disponible', async () => {
  const res = await request(webBase);
  assert(res.status === 200, `status ${res.status}`);
  const html = await res.text();
  assert(html.includes('FabSoft'), 'HTML sin marca FabSoft');
});

await check('web: cabeceras de seguridad', async () => {
  const res = await request(webBase);
  assert(
    (res.headers.get('strict-transport-security') ?? '').includes('max-age=31536000'),
    'HSTS ausente',
  );
  assert(
    (res.headers.get('content-security-policy') ?? '').includes("default-src 'self'"),
    'CSP ausente',
  );
});

const email = process.env.SMOKE_ADMIN_EMAIL;
const password = process.env.SMOKE_ADMIN_PASSWORD;
if (email && password) {
  await check('api: login y sesión', async () => {
    const login = await request(`${apiBase}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert(login.status === 200, `login status ${login.status}`);
    const session = await login.json();
    assert(typeof session.accessToken === 'string', 'login sin accessToken');
    const me = await request(`${apiBase}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert(me.status === 200, `me status ${me.status}`);
  });
} else {
  checks.push({ name: 'api: login y sesión', status: 'skipped', reason: 'sin credenciales' });
}

const failed = checks.filter((c) => c.status === 'failed');
console.log(JSON.stringify({ smoke: failed.length === 0 ? 'ok' : 'failed', checks }, null, 2));
if (failed.length > 0) process.exit(1);
