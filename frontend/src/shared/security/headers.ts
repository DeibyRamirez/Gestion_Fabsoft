export type SecurityHeader = { key: string; value: string };

const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

/** Origen del API; `null` cuando la URL es relativa (mismo origen vía proxy de Vercel). */
function apiOrigin(apiBaseUrl: string | undefined): string | null {
  try {
    return new URL(apiBaseUrl ?? DEFAULT_API_BASE_URL).origin;
  } catch {
    return apiBaseUrl?.startsWith('/') ? null : new URL(DEFAULT_API_BASE_URL).origin;
  }
}

/** CSP del frontend: mismo origen + API configurada, sin CDNs ni terceros. */
export function contentSecurityPolicy(
  apiBaseUrl: string | undefined = process.env.NEXT_PUBLIC_API_BASE_URL,
  isDev = process.env.NODE_ENV !== 'production',
): string {
  const origin = apiOrigin(apiBaseUrl);
  const connect = [
    "'self'",
    ...(origin ? [origin] : []),
    ...(isDev ? ['ws://localhost:3000'] : []),
  ].join(' ');
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'" + (isDev ? " 'unsafe-eval'" : ''),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    "media-src 'none'",
  ].join('; ');
}

export function securityHeaders(
  apiBaseUrl: string | undefined = process.env.NEXT_PUBLIC_API_BASE_URL,
  isDev = process.env.NODE_ENV !== 'production',
): SecurityHeader[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(apiBaseUrl, isDev) },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
  ];
}
