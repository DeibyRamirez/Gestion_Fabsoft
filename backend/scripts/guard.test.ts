import { afterEach, describe, expect, it } from 'vitest';
import {
  assertMigratorBootstrapExpectation,
  assertNonProduction,
  assertSeedConfiguration,
  resolveGuardedDatabaseUrl,
  type SessionIdentity,
} from './guard.js';
import { redactDatabaseUrl } from './database-url.js';

const baseEnv = {
  APP_ENV: 'test',
  SEED_ALLOWED_HOSTS: 'localhost',
  SEED_ALLOWED_DATABASES: 'fabsoft_test',
  SEED_EPHEMERAL_MARKER: 'marker-ci',
  SEED_HARNESS_RUN_ID: 'run-test-1',
  SEED_FORBIDDEN_HOSTS: 'staging.example.com,supabase.co',
  SEED_SESSION_ROLE: 'fabsoft_seed_writer',
};

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const snapshot = { ...process.env };
  delete process.env.DATABASE_MIGRATION_URL;
  delete process.env.DATABASE_PROVISION_URL;
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

  it('T-GUARD-01 rechaza host staging (sin excepciones remote/staging)', () => {
    withEnv(
      {
        SEED_DATABASE_URL: 'postgres://fabsoft_seed_writer@my-staging.example/fabsoft_test',
      },
      () => {
        expect(() => assertSeedConfiguration()).toThrow(/staging\/remoto/);
      },
    );
  });

  it('rechaza SEED_FORBIDDEN_HOSTS ausente', () => {
    withEnv(
      {
        SEED_DATABASE_URL: 'postgres://fabsoft_seed_writer@localhost/fabsoft_test',
      },
      () => {
        delete process.env.SEED_FORBIDDEN_HOSTS;
        expect(() => resolveGuardedDatabaseUrl(['SEED_DATABASE_URL'])).toThrow(
          /SEED_FORBIDDEN_HOSTS/,
        );
      },
    );
  });

  it('rechaza SEED_FORBIDDEN_HOSTS solo comas', () => {
    withEnv(
      {
        SEED_DATABASE_URL: 'postgres://fabsoft_seed_writer@localhost/fabsoft_test',
        SEED_FORBIDDEN_HOSTS: ',',
      },
      () => {
        expect(() => resolveGuardedDatabaseUrl(['SEED_DATABASE_URL'])).toThrow(/solo comas/);
      },
    );
  });

  it('rechaza SEED_SESSION_ROLE fabsoft_provisioner', () => {
    withEnv(
      {
        SEED_DATABASE_URL: 'postgres://fabsoft_provisioner@localhost/fabsoft_test',
        SEED_SESSION_ROLE: 'fabsoft_provisioner',
      },
      () => {
        expect(() => assertSeedConfiguration()).toThrow(/no permitido/);
      },
    );
  });

  it('rechaza SEED_FORBIDDEN_HOSTS vacío o guion', () => {
    withEnv(
      {
        SEED_DATABASE_URL: 'postgres://fabsoft_seed_writer@localhost/fabsoft_test',
        SEED_FORBIDDEN_HOSTS: '-',
      },
      () => {
        expect(() => resolveGuardedDatabaseUrl(['SEED_DATABASE_URL'])).toThrow(
          /no puede ser vacío ni "-"/,
        );
      },
    );
    withEnv(
      {
        SEED_DATABASE_URL: 'postgres://fabsoft_seed_writer@localhost/fabsoft_test',
        SEED_FORBIDDEN_HOSTS: '',
      },
      () => {
        expect(() => resolveGuardedDatabaseUrl(['SEED_DATABASE_URL'])).toThrow(
          /no puede ser vacío ni "-"/,
        );
      },
    );
  });

  it('rechaza APP_ENV staging', () => {
    withEnv({ APP_ENV: 'staging' }, () => {
      expect(() => assertNonProduction()).toThrow(/no permitido/);
    });
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
        SEED_DATABASE_URL: 'postgres://fabsoft_seed_writer@localhost/fabsoft_test',
      },
      () => {
        expect(() => resolveGuardedDatabaseUrl(['SEED_DATABASE_URL'])).toThrow(
          /SEED_ALLOWED_HOSTS debe listar/,
        );
      },
    );
  });

  it('rechaza hosts contradictorios entre alias de URL', () => {
    withEnv(
      {
        SEED_DATABASE_URL: 'postgres://fabsoft_owner@localhost:5432/fabsoft_test',
        DATABASE_MIGRATION_URL: 'postgres://fabsoft_owner@127.0.0.1:5432/fabsoft_test',
      },
      () => {
        expect(() => assertSeedConfiguration()).toThrow(/misma instalación/);
      },
    );
  });

  it('exige SEED_HARNESS_RUN_ID', () => {
    withEnv(
      {
        SEED_DATABASE_URL: 'postgres://fabsoft_seed_writer@localhost/fabsoft_test',
        SEED_HARNESS_RUN_ID: '',
      },
      () => {
        delete process.env.SEED_HARNESS_RUN_ID;
        expect(() => assertSeedConfiguration()).toThrow(/SEED_HARNESS_RUN_ID/);
      },
    );
  });

  it('redacta contraseñas en URLs', () => {
    expect(
      redactDatabaseUrl('postgres://fabsoft_app:supersecret@localhost:5432/fabsoft_test'),
    ).toBe('postgres://fabsoft_app@localhost:5432/fabsoft_test');
  });

  it('migrator bootstrap rechaza ADMIN OPTION y CREATEROLE', () => {
    const bad: SessionIdentity = {
      sessionUser: 'fabsoft_migrator',
      currentUser: 'fabsoft_migrator',
      rolsuper: false,
      rolbypassrls: false,
      rolcanlogin: true,
      rolcreaterole: true,
      rolcreatedb: false,
      memberOf: ['fabsoft_app'],
      adminOf: [],
      canSetRoleOwner: false,
      canSetRoleMigrator: false,
    };
    expect(() => assertMigratorBootstrapExpectation(bad)).toThrow(/escalación/);
    const admin: SessionIdentity = { ...bad, rolcreaterole: false, adminOf: ['fabsoft_app'] };
    expect(() => assertMigratorBootstrapExpectation(admin)).toThrow(/ADMIN OPTION/);
  });
});
