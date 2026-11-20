import type {
  ClientScope,
  ClientStatus,
  IntegrationListQuery,
  IntegrationManifest,
  IntegrationStatus,
  Scope,
} from '@fabsoft/shared';
import type { ApiCredentialView, IntegrationView } from './integration-views.js';

export interface IntegrationListRepository {
  list(query: IntegrationListQuery): Promise<{ items: IntegrationView[]; total: number }>;
}

export interface IntegrationGetRepository {
  findById(id: string): Promise<IntegrationView | null>;
}

export interface IntegrationClientQuery {
  findClientStatuses(ids: string[]): Promise<Map<string, ClientStatus>>;
}

export interface CreateIntegrationRecord {
  manifest: IntegrationManifest;
  createdBy: string;
}

export interface IntegrationCreateRepository {
  insert(record: CreateIntegrationRecord): Promise<IntegrationView>;
}

export interface IntegrationPatch {
  name?: string | undefined;
  description?: string | null | undefined;
  status?: IntegrationStatus | undefined;
}

export interface UpdateIntegrationRecord {
  id: string;
  patch: IntegrationPatch;
  updatedBy: string;
}

export interface IntegrationUpdateRepository {
  update(record: UpdateIntegrationRecord): Promise<IntegrationView | null>;
}

export interface ReplaceManifestRecord {
  id: string;
  manifest: IntegrationManifest;
  updatedBy: string;
}

export interface IntegrationManifestRepository {
  replaceManifest(record: ReplaceManifestRecord): Promise<IntegrationView | null>;
}

export interface NewCredentialRecord {
  integrationId: string;
  keyPrefix: string;
  keyHash: string;
  label: string | null;
  expiresAt: Date | null;
  createdBy: string;
}

export interface CredentialQuery {
  listCredentials(integrationId: string): Promise<ApiCredentialView[]>;
  countActive(integrationId: string, at: Date): Promise<number>;
  insertCredential(record: NewCredentialRecord): Promise<ApiCredentialView>;
  revoke(
    integrationId: string,
    credentialId: string,
    revokedBy: string,
    at: Date,
  ): Promise<ApiCredentialView | null>;
}

export interface ApiKeyAuthRow {
  credentialId: string;
  integrationId: string;
  keyHash: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  integrationStatus: IntegrationStatus;
  scopes: Scope[];
  clientScope: ClientScope;
  rateLimitPerMinute: number;
}

export interface ApiKeyAuthRepository {
  findByPrefix(keyPrefix: string): Promise<ApiKeyAuthRow | null>;
  updateLastUsed(
    credentialId: string,
    integrationId: string,
    at: Date,
    ip: string | null,
  ): Promise<void>;
}
