import type { Clock } from '../../src/application/shared/ports.js';

/** Reloj fijo para tests (docs/testing-strategy.md §3). */
export class FixedClock implements Clock {
  constructor(private readonly iso: string) {}

  now(): Date {
    return new Date(this.iso);
  }
}

export const DEFAULT_TEST_INSTANT = '2026-11-01T13:00:00Z';
