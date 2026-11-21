import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from './headers';

describe('cabeceras de seguridad del frontend', () => {
  it('aplica CSP estricta, HSTS y cabeceras de aislamiento', () => {
    const headers = securityHeaders('https://api.fabsoft.example/api/v1', false);
    const byName = new Map(headers.map(({ key, value }) => [key, value]));

    expect(byName.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
    expect(byName.get('X-Content-Type-Options')).toBe('nosniff');
    expect(byName.get('X-Frame-Options')).toBe('DENY');
    expect(byName.get('Referrer-Policy')).toBe('no-referrer');

    const csp = byName.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self' https://api.fabsoft.example");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('*');
  });

  it('en desarrollo permite HMR sin abrir la CSP a terceros', () => {
    const csp = contentSecurityPolicy('http://localhost:4000/api/v1', true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws://localhost:3000');
    expect(csp).toContain("'self'");
    expect(csp).not.toContain('*');
  });

  it('con URL relativa el API se sirve por el mismo origen (proxy de Vercel)', () => {
    const csp = contentSecurityPolicy('/api/v1', false);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('localhost');
  });
});
