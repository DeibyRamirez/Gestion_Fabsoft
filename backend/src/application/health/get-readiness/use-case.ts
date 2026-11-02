import type { HealthResponse } from '@fabsoft/shared';
import type { AppInfoProvider } from '../get-liveness/ports.js';
import type { DependencyCheck } from './ports.js';

/** Readiness: ok si todas las dependencias responden; `down` en caso contrario (docs/observability.md §3). */
export class GetReadiness {
  constructor(
    private readonly checks: DependencyCheck[],
    private readonly appInfo: AppInfoProvider,
  ) {}

  async execute(): Promise<HealthResponse> {
    const results = await Promise.all(
      this.checks.map(async (c) => [c.name, (await c.check()) ? 'ok' : 'fail'] as const),
    );
    const checks = Object.fromEntries(results) as Record<string, 'ok' | 'fail'>;
    const status = results.every(([, r]) => r === 'ok') ? 'ok' : 'down';
    return { status, version: this.appInfo.version(), checks };
  }
}
