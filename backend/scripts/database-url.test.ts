import { describe, expect, it } from 'vitest';
import {
  assertSameDatabaseInstallation,
  normalizeDatabaseUrl,
  parseDatabaseTarget,
  redactDatabaseUrl,
} from './database-url.js';

describe('database-url', () => {
  it('rechaza protocolo no postgres', () => {
    expect(() => normalizeDatabaseUrl('mysql://u@localhost/db')).toThrow(/Protocolo no permitido/);
  });

  it('rechaza parámetros no allowlisted (host=, options=)', () => {
    expect(() => normalizeDatabaseUrl('postgres://u@localhost:5432/db?host=evil.example')).toThrow(
      /no permitido/,
    );
    expect(() =>
      normalizeDatabaseUrl('postgres://u@localhost:5432/db?options=-c%20search_path%3Dapp'),
    ).toThrow(/no permitido/);
  });

  it('preserva usuario completo (sin truncar en punto)', () => {
    const t = parseDatabaseTarget('postgres://fabsoft.owner@localhost:5432/fabsoft_test');
    expect(t.user).toBe('fabsoft.owner');
  });

  it('rechaza múltiples segmentos de base en path', () => {
    expect(() => parseDatabaseTarget('postgres://u@localhost:5432/a/b')).toThrow(
      /exactamente un segmento/,
    );
  });

  it('decodifica %2F en nombre de base (un solo segmento lógico)', () => {
    const t = parseDatabaseTarget('postgres://u@localhost:5432/my%2Fdb');
    expect(t.database).toBe('my/db');
  });

  it('assertSameDatabaseInstallation exige host, puerto y base', () => {
    const a = 'postgres://migrator@localhost:5432/fabsoft_test';
    const b = 'postgres://owner@localhost:5432/fabsoft_test';
    expect(() => assertSameDatabaseInstallation(a, b)).not.toThrow();
    expect(() =>
      assertSameDatabaseInstallation(a, 'postgres://owner@localhost:5432/other_db'),
    ).toThrow(/misma instalación/);
  });

  it('redacta contraseña', () => {
    expect(redactDatabaseUrl('postgres://fabsoft_app:secret@localhost:5432/fabsoft_test')).toBe(
      'postgres://fabsoft_app@localhost:5432/fabsoft_test',
    );
  });
});
