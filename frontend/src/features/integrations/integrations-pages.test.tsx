import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiCredentialCreatedDto, ApiCredentialDto, IntegrationDto } from '@fabsoft/shared';
import { IntegrationDetail } from './integration-detail';
import { IntegrationsPage } from './integrations-page';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  replaceManifest: vi.fn(),
  credentials: vi.fn(),
  createCredential: vi.fn(),
  revokeCredential: vi.fn(),
}));

vi.mock('./api', () => ({ integrationsApi: mocks }));

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ token: 't' }),
}));

const integration: IntegrationDto = {
  id: '00000000-0000-4000-8000-000000000401',
  slug: 'erp-contable',
  name: 'ERP contable',
  description: 'Integración de prueba',
  status: 'activa',
  scopes: ['clients:read', 'subscriptions:read'],
  clientScope: 'all',
  clientIds: [],
  manifestVersion: '1.0.0',
  manifest: {
    manifest_schema_version: 1,
    integration: 'erp-contable',
    version: '1.0.0',
    display_name: 'ERP contable',
    description: 'Integración de prueba',
    scopes: ['clients:read', 'subscriptions:read'],
    client_scope: 'all',
    rate_limit_per_minute: 60,
  },
  rateLimitPerMinute: 60,
  activeCredentials: 1,
  lastUsedAt: null,
  createdAt: '2026-11-20T12:00:00.000Z',
  updatedAt: '2026-11-20T12:00:00.000Z',
};

const credential: ApiCredentialDto = {
  id: '00000000-0000-4000-8000-000000000501',
  integrationId: integration.id,
  keyPrefix: 'fsk_test_ab12cd34',
  label: 'Principal',
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: '2026-11-20T12:00:00.000Z',
};

const createdCredential: ApiCredentialCreatedDto = {
  ...credential,
  apiKey: 'fsk_test_ab12cd34_secret-value',
};

const page = { data: [integration], meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 } };
const credentialPage = { data: [credential] };

beforeEach(() => {
  mocks.list.mockReset();
  mocks.get.mockReset();
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.replaceManifest.mockReset();
  mocks.credentials.mockReset();
  mocks.createCredential.mockReset();
  mocks.revokeCredential.mockReset();
  mocks.list.mockResolvedValue(page);
  mocks.get.mockResolvedValue(integration);
  mocks.credentials.mockResolvedValue(credentialPage);
  mocks.create.mockResolvedValue(integration);
  mocks.update.mockResolvedValue(integration);
  mocks.replaceManifest.mockResolvedValue(integration);
  mocks.createCredential.mockResolvedValue(createdCredential);
  mocks.revokeCredential.mockResolvedValue({
    ...credential,
    revokedAt: '2026-11-20T13:00:00.000Z',
  });
});

describe('Integrations pages', () => {
  it('lista integraciones y crea una desde el manifest', async () => {
    render(<IntegrationsPage />);
    expect(await screen.findByText('ERP contable')).toBeInTheDocument();
    expect(screen.getByText(/erp-contable · v1.0.0/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Crear integración' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    const manifest = mocks.create.mock.calls[0]![1] as {
      integration: string;
      client_scope: string;
    };
    expect(manifest.client_scope).toBe('all');
    expect(manifest.integration).toMatch(/^nueva-integracion-/);
  });

  it('muestra el detalle y revela la API key una sola vez', async () => {
    render(<IntegrationDetail integrationId={integration.id} />);
    expect(await screen.findByRole('heading', { name: 'ERP contable' })).toBeInTheDocument();
    expect(screen.getByText(/fsk_test_ab12cd34/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Emitir API key' }));
    await waitFor(() =>
      expect(mocks.createCredential).toHaveBeenCalledWith('t', integration.id, {
        label: null,
        expiresAt: undefined,
      }),
    );
    expect(await screen.findByText('fsk_test_ab12cd34_secret-value')).toBeInTheDocument();
  });
});
