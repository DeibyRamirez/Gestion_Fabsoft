import { describe, expect, it } from 'vitest';
import { decideRetry, truncateError } from './retry-policy.js';

const now = new Date('2026-11-17T12:00:00Z');
const noJitter = () => 0.5;

describe('decideRetry', () => {
  it('aplica backoff creciente', () => {
    expect(decideRetry(1, 5, now, undefined, noJitter).nextAttemptAt?.toISOString()).toBe(
      '2026-11-17T12:01:00.000Z',
    );
    expect(decideRetry(2, 5, now, undefined, noJitter).nextAttemptAt?.toISOString()).toBe(
      '2026-11-17T12:05:00.000Z',
    );
    expect(decideRetry(3, 5, now, undefined, noJitter).nextAttemptAt?.toISOString()).toBe(
      '2026-11-17T12:30:00.000Z',
    );
    expect(decideRetry(4, 5, now, undefined, noJitter).nextAttemptAt?.toISOString()).toBe(
      '2026-11-17T14:00:00.000Z',
    );
  });

  it('respeta Retry-After mayor y falla al llegar al máximo', () => {
    expect(decideRetry(1, 5, now, 10 * 60_000, noJitter).nextAttemptAt?.toISOString()).toBe(
      '2026-11-17T12:10:00.000Z',
    );
    expect(decideRetry(5, 5, now, undefined, noJitter)).toEqual({
      failed: true,
      nextAttemptAt: null,
    });
  });

  it('trunca last_error a 2000 caracteres', () => {
    expect(truncateError('x'.repeat(2500))).toHaveLength(2000);
  });
});
