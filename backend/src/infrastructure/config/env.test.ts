import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('falla si NODE_ENV=production sin APP_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/APP_ENV/);
  });
  it('exige DATABASE_URL, WORKER_DATABASE_URL y claves JWT en prod', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', APP_ENV: 'prod' })).toThrow();
  });
  it('WORKER_DATABASE_URL debe usar fabsoft_worker', () => {
    expect(() => loadEnv({ WORKER_DATABASE_URL: 'postgres://fabsoft_app:x@h/db' })).toThrow(
      /fabsoft_worker/,
    );
    expect(loadEnv({ WORKER_DATABASE_URL: 'postgres://fabsoft_worker:x@h/db' }).APP_ENV).toBe(
      'dev',
    );
  });
});
