import { afterEach, describe, expect, it } from 'vitest';
import {
  assertNonProduction,
  assertSeedConfiguration,
  resolveGuardedDatabaseUrl,
} from './guard.js';
import { redactDatabaseUrl } from './database-url.js';

const baseEnv = {
  APP_ENV: 'test',
  SEED_ALLOWED_HOSTS: 'localhost',
  SEED_ALLOWED_DATABASES: 'fabsoft_test',
  SEED_EPHEMERAL_MARKER: 'marker-ci',
};

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const snapshot = { ...process.env };
  Object.assign(process.env, baseEnv, overrides);
  try {
    fn();
  } finally {
    process.env = snapshot;
  }
}

afterEach(() => {
  for (const k of Object.keys(baseEnv)) delete process.env[k];
});

describe('guard fail-closed', () => {
  it('rechaza APP_ENV ausente antes de cualquier URL', () => {
    const snapshot = { ...process.env };
    Object.assign(process.env, baseEnv);
    delete process.env.APP_ENV;
    try {
      expect(() => assertNonProduction()).toThrow(/APP_ENV es obligatorio/);
    } finally {
      process.env = snapshot;
    }
  });

  it('no construye destino si el host no está en SEED_ALLOWED_HOSTS', () => {
    withEnv(
      {
        SEED_DATABASE_URL: 'postgres://fabsoft_owner:secret@evil.example/fabsoft_test',
        SEED_ALLOWED_HOSTS: 'localhost',
      },
      () => {
        expect(() => assertSeedConfiguration()).toThrow(/Host no autorizado/);
      },
    );
  });

  it('rechaza lista vacía de hosts permitidos', () => {
    withEnv(
      {
        SEED_ALLOWED_HOSTS: '',
        SEED_DATABASE_URL: 'postgres://fabsoft_owner@localhost/fabsoft_test',
      },
      () => {
        expect(() => resolveGuardedDatabaseUrl(['SEED_DATABASE_URL'])).toThrow(
          /SEED_ALLOWED_HOSTS debe listar/,
        );
      },
    );
  });

  it('redacta contraseñas en URLs', () => {
    expect(
      redactDatabaseUrl('postgres://fabsoft_app:supersecret@localhost:5432/fabsoft_test'),
    ).toBe('postgres://fabsoft_app@localhost:5432/fabsoft_test');
  });
});
