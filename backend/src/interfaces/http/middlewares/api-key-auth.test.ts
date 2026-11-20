import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AuthenticateApiKey } from '../../../application/integrations/authenticate-api-key/use-case.js';
import { errorHandler } from './error-handler.js';
import { authenticateApiKey, requireScope } from './authenticate.js';

const apiKeys = {
  generate: () => ({ apiKey: '', keyPrefix: '', keyHash: '' }),
  verify: (secret: string, hash: string) => hash === `h:${secret}`,
};

function app(scopes: ('clients:read' | 'subscriptions:read')[] = ['clients:read']) {
  const useCase = new AuthenticateApiKey(
    {
      run: async (_rid, work) =>
        work({
          apiKeyAuth: {
            findByPrefix: async () => ({
              credentialId: 'cred-1',
              integrationId: 'int-1',
              keyHash: 'h:secret',
              expiresAt: null,
              revokedAt: null,
              integrationStatus: 'activa',
              scopes,
              clientScope: 'own',
              rateLimitPerMinute: 60,
            }),
            updateLastUsed: async () => undefined,
          },
        }),
    },
    apiKeys,
    { now: () => new Date('2026-11-20T12:00:00Z') },
  );
  const server = express();
  server.use((_req, res, next) => {
    res.locals['requestId'] = 'test-request';
    next();
  });
  server.get('/probe', authenticateApiKey(useCase), requireScope('clients:read'), (_req, res) =>
    res.json({ ok: true }),
  );
  server.use(errorHandler(() => undefined));
  return server;
}

describe('middleware API key', () => {
  it('401 sin API key', async () => {
    expect((await request(app()).get('/probe')).status).toBe(401);
  });

  it('200 con key válida y scope', async () => {
    const res = await request(app()).get('/probe').set('X-Api-Key', 'fsk_test_ab12cd34_secret');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('403 si falta el scope', async () => {
    const res = await request(app(['subscriptions:read']))
      .get('/probe')
      .set('X-Api-Key', 'fsk_test_ab12cd34_secret');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('insufficient_scope');
  });

  it('400 si se envían Bearer y API key a la vez', async () => {
    const res = await request(app())
      .get('/probe')
      .set('X-Api-Key', 'fsk_test_ab12cd34_secret')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ambiguous_credentials');
  });
});
