import type { ClientScope, IntegrationManifest, IntegrationStatus, Scope } from '@fabsoft/shared';

export interface IntegrationView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: IntegrationStatus;
  scopes: Scope[];
  clientScope: ClientScope;
  clientIds: string[];
  manifestVersion: string;
  manifest: IntegrationManifest;
  rateLimitPerMinute: number;
  activeCredentials: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiCredentialView {
  id: string;
  integrationId: string;
  keyPrefix: string;
  label: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}
