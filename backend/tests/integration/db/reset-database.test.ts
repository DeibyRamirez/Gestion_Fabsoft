import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { assertTestDatabaseUrl, resetDatabaseWithPool } from '../../helpers/db.js';

describe('resetDatabase() protección', () => {
  it('rechaza URLs que no terminan en _test', () => {
    expect(() =>
      assertTestDatabaseUrl('postgres://fabsoft_owner@localhost:5432/fabsoft_prod'),
    ).toThrow(/_test/);
  });

  it('no consulta la base cuando la URL es rechazada', async () => {
    const query = vi.fn();
    const pool = { query } as unknown as pg.Pool;
    await expect(
      resetDatabaseWithPool('postgres://fabsoft_owner@localhost:5432/fabsoft_prod', pool),
    ).rejects.toThrow(/_test/);
    expect(query).not.toHaveBeenCalled();
  });
});
