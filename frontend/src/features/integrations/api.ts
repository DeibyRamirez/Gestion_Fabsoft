import type {
  ApiCredentialCreatedDto,
  ApiCredentialCreateInput,
  ApiCredentialDto,
  IntegrationDto,
  IntegrationManifest,
  IntegrationPage,
  IntegrationUpdateInput,
} from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';

export const integrationsApi = {
  list: (token: string | null) =>
    apiFetch<IntegrationPage>('/integrations?pageSize=100', { token }),

  get: (token: string | null, id: string) =>
    apiFetch<IntegrationDto>(`/integrations/${id}`, { token }),

  create: (token: string | null, manifest: IntegrationManifest) =>
    apiFetch<IntegrationDto>('/integrations', {
      method: 'POST',
      token,
      body: JSON.stringify({ manifest }),
    }),

  update: (token: string | null, id: string, input: IntegrationUpdateInput) =>
    apiFetch<IntegrationDto>(`/integrations/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(input),
    }),

  replaceManifest: (token: string | null, id: string, manifest: IntegrationManifest) =>
    apiFetch<IntegrationDto>(`/integrations/${id}/manifest`, {
      method: 'PUT',
      token,
      body: JSON.stringify(manifest),
    }),

  credentials: (token: string | null, id: string) =>
    apiFetch<{ data: ApiCredentialDto[] }>(`/integrations/${id}/credentials`, { token }),

  createCredential: (token: string | null, id: string, input: ApiCredentialCreateInput) =>
    apiFetch<ApiCredentialCreatedDto>(`/integrations/${id}/credentials`, {
      method: 'POST',
      token,
      body: JSON.stringify(input),
    }),

  revokeCredential: (token: string | null, id: string, credentialId: string) =>
    apiFetch<ApiCredentialDto>(`/integrations/${id}/credentials/${credentialId}/revoke`, {
      method: 'POST',
      token,
    }),
};
