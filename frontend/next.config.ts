import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import { securityHeaders } from './src/shared/security/headers';

const nextConfig = (phase: string): NextConfig => ({
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
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
