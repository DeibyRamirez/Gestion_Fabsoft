import { describe, expect, it } from 'vitest';
import { assertSeedConfiguration } from '../../scripts/guard.js';

describe('seed guard (sin conexión)', () => {
  it('config inválida ⇒ no hay URL resuelta', () => {
    const prev = { ...process.env };
    try {
      delete process.env.APP_ENV;
      expect(() => assertSeedConfiguration()).toThrow();
    } finally {
      process.env = prev;
    }
  });
});
