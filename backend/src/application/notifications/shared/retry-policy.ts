/** Esperas base tras el intento 1, 2, 3 y 4 (docs/notifications.md §5). */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000] as const;

export interface RetryDecision {
  failed: boolean;
  nextAttemptAt: Date | null;
}

/** Calcula el siguiente intento; al llegar a `maxAttempts` la alerta pasa a failed. */
export function decideRetry(
  attempts: number,
  maxAttempts: number,
  now: Date,
  retryAfterMs?: number,
  random: () => number = Math.random,
): RetryDecision {
  if (attempts >= maxAttempts) return { failed: true, nextAttemptAt: null };
  const base = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]!;
  const jitter = 0.8 + random() * 0.4;
  const delay = Math.max(Math.round(base * jitter), retryAfterMs ?? 0);
  return { failed: false, nextAttemptAt: new Date(now.getTime() + delay) };
}

export function truncateError(message: string): string {
  return message.length > 2000 ? message.slice(0, 2000) : message;
}
