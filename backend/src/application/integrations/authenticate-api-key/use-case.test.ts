import { describe, expect, it, vi } from 'vitest';
import { AuthenticateApiKey } from './use-case.js';
import { parseApiKey } from '../shared/api-key.js';
import type { ApiKeyAuthRow } from '../shared/ports.js';

const now = new Date('2026-11-20T12:00:00Z');
const apiKeys = {
  generate: () => ({ apiKey: '', keyPrefix: '', keyHash: '' }),
  verify: (secret: string, hash: string) => hash === `h:${secret}`,
};

const row: ApiKeyAuthRow = {
  credentialId: 'cred-1',
  integrationId: 'int-1',
  keyHash: 'h:secret',
  expiresAt: null,
  revokedAt: null,
  integrationStatus: 'activa',
  scopes: ['clients:read'],
  clientScope: 'own',
  rateLimitPerMinute: 60,
};

function useCase(overrides: Partial<ApiKeyAuthRow> = {}) {
  const updateLastUsed = vi.fn(async () => undefined);
  const uc = new AuthenticateApiKey(
    {
      run: async (_rid, work) =>
        work({
          apiKeyAuth: {
            findByPrefix: async () => ({ ...row, ...overrides }),
            updateLastUsed,
          },
        }),
    },
    apiKeys,
    { now: () => now },
  );
  return { uc, updateLastUsed };
}

describe('AuthenticateApiKey', () => {
  it('parsea el prefijo y el secreto', () => {
    expect(parseApiKey('fsk_test_ab12cd34_secret-part')).toEqual({
      keyPrefix: 'fsk_test_ab12cd34',
      secret: 'secret-part',
    });
    expect(parseApiKey('bad')).toBeNull();
  });

  it('autentica una key válida y actualiza last_used', async () => {
    const { uc, updateLastUsed } = useCase();
    await expect(
      uc.execute('fsk_test_ab12cd34_secret', 'req-1', undefined, '1.2.3.4'),
    ).resolves.toMatchObject({
      actorType: 'integration',
      integrationId: 'int-1',
      scopes: ['clients:read'],
    });
    expect(updateLastUsed).toHaveBeenCalledWith('cred-1', 'int-1', now, '1.2.3.4');
  });

  it('rechaza key revocada, expirada o de integración deshabilitada', async () => {
    await expect(
      useCase({ revokedAt: now }).uc.execute('fsk_test_ab12cd34_secret', 'r'),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      useCase({ expiresAt: new Date('2026-11-20T11:59:59Z') }).uc.execute(
        'fsk_test_ab12cd34_secret',
        'r',
      ),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      useCase({ integrationStatus: 'deshabilitada' }).uc.execute('fsk_test_ab12cd34_secret', 'r'),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rechaza hash inválido o formato inválido', async () => {
    await expect(
      useCase({ keyHash: 'otro' }).uc.execute('fsk_test_ab12cd34_secret', 'r'),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(useCase().uc.execute('bad', 'r')).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});
