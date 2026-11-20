import { expect, test } from '@playwright/test';

const apiBase = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';
const webBase = process.env.PLAYWRIGHT_WEB_URL ?? 'http://localhost:3000';
const allowedOrigin = process.env.CORS_ALLOWED_ORIGINS?.split(',')[0] ?? 'http://localhost:3000';

test.describe('HT-06 — DAST smoke', () => {
  test('cabeceras de seguridad del frontend', async ({ request }) => {
    const page = await request.get(webBase);
    expect(page.status()).toBe(200);
    expect(page.headers()['strict-transport-security']).toContain('max-age=31536000');
    expect(page.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(page.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(page.headers()['x-content-type-options']).toBe('nosniff');
    expect(page.headers()['x-frame-options']).toBe('DENY');
    expect(page.headers()['x-powered-by']).toBeUndefined();
  });

  test('cabeceras, CORS y límites de la API', async ({ request }) => {
    const health = await request.get(`${apiBase}/api/v1/health`);
    expect(health.status()).toBe(200);
    expect(health.headers()['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
    expect(health.headers()['content-security-policy']).toContain("default-src 'none'");
    expect(health.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(health.headers()['x-content-type-options']).toBe('nosniff');
    expect(health.headers()['x-frame-options']).toBe('DENY');
    expect(health.headers()['referrer-policy']).toBe('no-referrer');
    expect(health.headers()['x-powered-by']).toBeUndefined();

    const docs = await request.get(`${apiBase}/api/v1/docs/`);
    expect(docs.status()).toBe(200);
    expect(docs.headers()['content-security-policy']).toContain("script-src 'self'");

    const evil = await request.get(`${apiBase}/api/v1/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(evil.headers()['access-control-allow-origin']).toBeUndefined();

    const preflight = await request.fetch(`${apiBase}/api/v1/clients`, {
      method: 'OPTIONS',
      headers: {
        Origin: allowedOrigin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    expect(preflight.status()).toBe(204);
    expect(preflight.headers()['access-control-allow-origin']).toBe(allowedOrigin);

    const unauthorized = await request.get(`${apiBase}/api/v1/clients`);
    expect(unauthorized.status()).toBe(401);

    const oversized = await request.post(`${apiBase}/api/v1/auth/login`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ email: 'a@b.test', password: 'x'.repeat(110 * 1024) }),
    });
    expect(oversized.status()).toBe(413);
    expect((await oversized.json()).code).toBe('payload_too_large');
  });
});
