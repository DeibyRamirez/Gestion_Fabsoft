#!/usr/bin/env node
/**
 * DAST smoke de FabSoft: cabeceras, CORS, límites y errores seguros.
 * Uso: DAST_BASE_URL=https://api.fabsoft.example pnpm security:dast
 */
const base = (process.env.DAST_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const allowedOrigin = process.env.DAST_ALLOWED_ORIGIN ?? 'http://localhost:3000';
const timeout = AbortSignal.timeout(8000);
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

const request = (path, init = {}) =>
  fetch(`${base}${path}`, {
    redirect: 'manual',
    ...init,
    signal: timeout,
    headers: { ...init.headers },
  });

await check('health: cabeceras', async () => {
  const res = await request('/api/v1/health');
  const csp = res.headers.get('content-security-policy') ?? '';
  assert(res.status === 200, `health status ${res.status}`);
  assert(
    res.headers.get('strict-transport-security') === 'max-age=31536000; includeSubDomains; preload',
    'HSTS ausente o débil',
  );
  assert(csp.includes("default-src 'none'"), 'CSP default-src no es none');
  assert(csp.includes("frame-ancestors 'none'"), 'CSP sin frame-ancestors none');
  assert(!csp.includes("'unsafe-inline'"), 'CSP de API permite inline');
  assert(res.headers.get('x-content-type-options') === 'nosniff', 'falta nosniff');
  assert(res.headers.get('x-frame-options') === 'DENY', 'falta X-Frame-Options');
  assert(res.headers.get('referrer-policy') === 'no-referrer', 'falta Referrer-Policy');
  assert(res.headers.get('permissions-policy')?.includes('camera=()'), 'falta Permissions-Policy');
  assert(!res.headers.get('x-powered-by'), 'expone X-Powered-By');
});

await check('docs: CSP de Swagger UI', async () => {
  const res = await request('/api/v1/docs/');
  const csp = res.headers.get('content-security-policy') ?? '';
  assert(res.status === 200, `docs status ${res.status}`);
  assert(csp.includes("script-src 'self'"), 'CSP de docs no permite assets locales');
  assert(!csp.includes('unpkg'), 'CSP de docs permite CDN externa');
});

await check('docs: contrato disponible', async () => {
  const res = await request('/api/v1/docs/openapi.json');
  assert(res.status === 200, `openapi.json status ${res.status}`);
  const body = await res.json();
  assert(body.openapi === '3.1.0', 'OpenAPI inesperado');
});

await check('auth: ruta protegida sin credenciales', async () => {
  const res = await request('/api/v1/clients');
  assert(res.status === 401, `clients status ${res.status}`);
  assert(
    (res.headers.get('content-type') ?? '').includes('application/problem+json'),
    'error no es problem+json',
  );
  const body = await res.json();
  assert(body.code === 'unauthenticated', `code ${body.code}`);
});

await check('api key inválida: 401', async () => {
  const res = await request('/api/v1/clients', {
    headers: { 'X-Api-Key': 'fsk_test_invalid_000000000000000000000000' },
  });
  assert(res.status === 401, `api key status ${res.status}`);
});

await check('CORS: no refleja orígenes ajenos', async () => {
  const evil = await request('/api/v1/health', { headers: { Origin: 'https://evil.example' } });
  assert(!evil.headers.get('access-control-allow-origin'), 'refleja origen no autorizado');
  const allowed = await request('/api/v1/clients', {
    method: 'OPTIONS',
    headers: {
      Origin: allowedOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  });
  assert(allowed.status === 204, `preflight status ${allowed.status}`);
  assert(
    allowed.headers.get('access-control-allow-origin') === allowedOrigin,
    'no permite el origen configurado',
  );
});

await check('errores: JSON inválido', async () => {
  const res = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert(res.status === 400, `invalid json status ${res.status}`);
  const body = await res.json();
  assert(body.code === 'validation_error', `code ${body.code}`);
  assert(!JSON.stringify(body).includes('stack'), 'respuesta expone stack');
});

await check('límites: cuerpo mayor a 100 KB', async () => {
  const res = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.test', password: 'x'.repeat(110 * 1024) }),
  });
  assert(res.status === 413, `oversized status ${res.status}`);
  const body = await res.json();
  assert(body.code === 'payload_too_large', `code ${body.code}`);
});

await check('rutas no encontradas', async () => {
  const missing = await request('/api/v1/no-existe');
  assert(missing.status === 404, `not found status ${missing.status}`);
  const body = await missing.json();
  assert(body.code === 'not_found', `code ${body.code}`);
});

const failed = checks.filter((c) => c.status === 'failed');
console.log(JSON.stringify({ dast: failed.length === 0 ? 'ok' : 'failed', checks }, null, 2));
if (failed.length > 0) process.exit(1);
