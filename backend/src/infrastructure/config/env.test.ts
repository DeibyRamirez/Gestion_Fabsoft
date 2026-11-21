import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('falla si NODE_ENV=production sin APP_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/APP_ENV/);
  });
  it('exige DATABASE_URL y claves JWT en prod', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', APP_ENV: 'prod' })).toThrow();
  });
  it('la API no exige WORKER_DATABASE_URL en prod', () => {
    const env = loadEnv({
      APP_ENV: 'prod',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://fabsoft_app:x@h/db',
      JWT_PRIVATE_KEY: 'pem',
      JWT_PUBLIC_KEYS: '{}',
      API_KEY_PEPPER: 'x'.repeat(32),
      API_KEY_ENV: 'live',
    });
    expect(env.APP_ENV).toBe('prod');
    expect(env).not.toHaveProperty('WORKER_DATABASE_URL');
  });
});
