export interface IntegrationRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

export interface IntegrationRateLimiter {
  check(integrationId: string, limit: number, now: Date): IntegrationRateLimitResult;
}
