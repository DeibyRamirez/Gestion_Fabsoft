import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import { securityHeaders } from './src/shared/security/headers';

/** Proxy same-origin hacia la API (evita cookies SameSite=Strict entre sitios distintos). */
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/+$/, '');

const nextConfig = (phase: string): NextConfig => ({
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiProxyTarget}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders(undefined, phase === PHASE_DEVELOPMENT_SERVER).map(
          ({ key, value }) => ({ key, value }),
        ),
      },
    ];
  },
});

export default nextConfig;
