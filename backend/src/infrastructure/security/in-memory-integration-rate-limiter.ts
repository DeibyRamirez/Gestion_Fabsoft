import type {
  IntegrationRateLimitResult,
  IntegrationRateLimiter,
} from '../../application/integrations/shared/rate-limit.js';

interface WindowEntry {
  windowStart: number;
  count: number;
}

const WINDOW_MS = 60_000;

/** Ventana fija de 60 s en memoria por integración (una instancia de API, docs/integrations/README). */
export class InMemoryIntegrationRateLimiter implements IntegrationRateLimiter {
  private readonly windows = new Map<string, WindowEntry>();

  check(integrationId: string, limit: number, now: Date): IntegrationRateLimitResult {
    const nowMs = now.getTime();
    let entry = this.windows.get(integrationId);
    if (!entry || nowMs - entry.windowStart >= WINDOW_MS) {
      entry = { windowStart: nowMs, count: 0 };
      this.windows.set(integrationId, entry);
    }
    const resetAt = new Date(entry.windowStart + WINDOW_MS);
    if (entry.count >= limit) {
      return { allowed: false, limit, remaining: 0, resetAt };
    }
    entry.count += 1;
    return { allowed: true, limit, remaining: Math.max(0, limit - entry.count), resetAt };
  }
}
