import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { assertFabsoftAppSession } from './db.js';

describe('assertFabsoftAppSession', () => {
  it('falla si session_user no es fabsoft_app', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ session_user: 'fabsoft_owner', rolsuper: false, rolbypassrls: true }],
      }),
    } as unknown as pg.PoolClient;
    await expect(assertFabsoftAppSession(client)).rejects.toThrow(/fabsoft_app/);
  });

  it('falla si fabsoft_app tiene BYPASSRLS', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ session_user: 'fabsoft_app', rolsuper: false, rolbypassrls: true }],
      }),
    } as unknown as pg.PoolClient;
    await expect(assertFabsoftAppSession(client)).rejects.toThrow(/BYPASSRLS/);
  });

  it('falla si fabsoft_app es superusuario', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ session_user: 'fabsoft_app', rolsuper: true, rolbypassrls: false }],
      }),
    } as unknown as pg.PoolClient;
    await expect(assertFabsoftAppSession(client)).rejects.toThrow(/superusuario/);
  });

  it('acepta fabsoft_app sin superuser ni bypass', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ session_user: 'fabsoft_app', rolsuper: false, rolbypassrls: false }],
      }),
    } as unknown as pg.PoolClient;
    await expect(assertFabsoftAppSession(client)).resolves.toBeUndefined();
  });
});
