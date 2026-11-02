import type { HealthResponse } from '@fabsoft/shared';
import type { AppInfoProvider } from './ports.js';

/** Liveness: el proceso responde. No toca la BD (eso es /health/ready, fuera de HT-01). */
export class GetLiveness {
  constructor(private readonly appInfo: AppInfoProvider) {}

  execute(): HealthResponse {
    return { status: 'ok', version: this.appInfo.version() };
  }
}
