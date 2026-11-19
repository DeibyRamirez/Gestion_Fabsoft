import { describe, expect, it } from 'vitest';
import { loadWorkerEnv } from './worker-env.js';

describe('loadWorkerEnv', () => {
  it('exige WORKER_DATABASE_URL', () => {
    expect(() => loadWorkerEnv({})).toThrow();
  });

  it('WORKER_DATABASE_URL debe usar fabsoft_worker', () => {
    expect(() => loadWorkerEnv({ WORKER_DATABASE_URL: 'postgres://fabsoft_app:x@h/db' })).toThrow(
      /fabsoft_worker/,
    );
  });

  it('por defecto usa log y lote de 50', () => {
    const env = loadWorkerEnv({
      WORKER_DATABASE_URL: 'postgres://fabsoft_worker:x@localhost:54320/fabsoft',
    });
    expect(env.CORREO_CANAL).toBe('log');
    expect(env.WORKER_BATCH_SIZE).toBe(50);
    expect(env.WORKER_RUN_ON_START).toBe(true);
  });

  it('con CORREO_CANAL=resend exige API key y remitente', () => {
    const base = {
      WORKER_DATABASE_URL: 'postgres://fabsoft_worker:x@localhost:54320/fabsoft',
      CORREO_CANAL: 'resend',
    };
    expect(() => loadWorkerEnv(base)).toThrow(/RESEND_API_KEY/);
    expect(() => loadWorkerEnv({ ...base, RESEND_API_KEY: 're_test' })).toThrow(/CORREO_DESDE/);
    expect(
      loadWorkerEnv({
        ...base,
        RESEND_API_KEY: 're_test',
        CORREO_DESDE: 'FabSoft <alertas@fabsoft.test>',
      }).CORREO_CANAL,
    ).toBe('resend');
  });

  it('WORKER_RUN_ON_START=false se interpreta como false', () => {
    const env = loadWorkerEnv({
      WORKER_DATABASE_URL: 'postgres://fabsoft_worker:x@localhost:54320/fabsoft',
      WORKER_RUN_ON_START: 'false',
    });
    expect(env.WORKER_RUN_ON_START).toBe(false);
  });
});
