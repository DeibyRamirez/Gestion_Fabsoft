import { assertTestDatabaseUrl } from './db.js';

/** Variables de entorno para tests de API/integración (JWT efímero; DATABASE_URL = TEST_DATABASE_URL). */
export function testEnvSource(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL es obligatorio para tests de API/integración');
  }
  assertTestDatabaseUrl(testUrl);

  if (extra.DATABASE_URL && extra.DATABASE_URL !== testUrl) {
    throw new Error('DATABASE_URL explícita debe coincidir con TEST_DATABASE_URL en tests');
  }

  const source: NodeJS.ProcessEnv = {
    ...process.env,
    ...extra,
    APP_ENV: 'test',
    DATABASE_URL: testUrl,
  };
  delete source.JWT_PRIVATE_KEY;
  delete source.JWT_PUBLIC_KEYS;
  return source;
}
