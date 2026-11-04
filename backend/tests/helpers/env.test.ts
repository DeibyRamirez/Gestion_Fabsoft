import { afterEach, describe, expect, it } from 'vitest';
import { testEnvSource } from './env.js';

describe('testEnvSource', () => {
  const prevTest = process.env.TEST_DATABASE_URL;
  const prevDb = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.TEST_DATABASE_URL = prevTest;
    process.env.DATABASE_URL = prevDb;
  });

  it('fuerza DATABASE_URL=TEST_DATABASE_URL', () => {
    process.env.TEST_DATABASE_URL =
      'postgres://fabsoft_app@localhost:54329/fabsoft_test?sslmode=disable';
    process.env.DATABASE_URL = 'postgres://fabsoft_owner@localhost:54320/fabsoft?sslmode=disable';
    const src = testEnvSource();
    expect(src.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
    expect(src.DATABASE_URL).not.toContain('fabsoft_owner');
  });

  it('rechaza TEST_DATABASE_URL sin sufijo _test', () => {
    process.env.TEST_DATABASE_URL =
      'postgres://fabsoft_app@localhost:5432/fabsoft_prod?sslmode=disable';
    expect(() => testEnvSource()).toThrow(/_test/);
  });

  it('rechaza DATABASE_URL explícita distinta de TEST_DATABASE_URL', () => {
    process.env.TEST_DATABASE_URL =
      'postgres://fabsoft_app@localhost:54329/fabsoft_test?sslmode=disable';
    expect(() =>
      testEnvSource({
        DATABASE_URL: 'postgres://fabsoft_app@localhost:54329/fabsoft_other_test?sslmode=disable',
      }),
    ).toThrow(/coincidir/);
  });
});
