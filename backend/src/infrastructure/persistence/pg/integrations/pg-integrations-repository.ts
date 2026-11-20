import type {
  ClientScope,
  ClientStatus,
  IntegrationListQuery,
  IntegrationManifest,
  IntegrationStatus,
  Scope,
} from '@fabsoft/shared';
import type {
  ApiCredentialView,
  IntegrationView,
} from '../../../../application/integrations/shared/integration-views.js';
import type {
  ApiKeyAuthRepository,
  ApiKeyAuthRow,
  CreateIntegrationRecord,
  CredentialQuery,
  IntegrationClientQuery,
  IntegrationCreateRepository,
  IntegrationGetRepository,
  IntegrationListRepository,
  IntegrationManifestRepository,
  IntegrationUpdateRepository,
  NewCredentialRecord,
  ReplaceManifestRecord,
  UpdateIntegrationRecord,
} from '../../../../application/integrations/shared/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface IntegrationRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: IntegrationStatus;
  scopes: Scope[];
  client_scope: ClientScope;
  client_ids: string[];
  manifest: IntegrationManifest;
  manifest_version: string;
  rate_limit_per_minute: number;
  active_credentials: number;
  last_used_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface CredentialRow {
  id: string;
  integration_id: string;
  key_prefix: string;
  label: string | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
}

const INTEGRATION_COLUMNS = `i.id::text as id,
  i.slug,
  i.name,
  i.description,
  i.status::text as status,
  i.scopes,
  i.client_scope::text as client_scope,
  coalesce(
    (select array_agg(ic.client_id::text order by ic.client_id)
       from app.integration_clients ic where ic.integration_id = i.id),
    '{}'::text[]
  ) as client_ids,
  i.manifest,
  i.manifest_version,
  i.rate_limit_per_minute,
  (select count(*)::int from app.api_credentials c
    where c.integration_id = i.id and c.revoked_at is null
      and (c.expires_at is null or c.expires_at > now())) as active_credentials,
  i.last_used_at,
  i.created_at,
  i.updated_at`;

const CREDENTIAL_COLUMNS = `id::text as id, integration_id::text as integration_id,
  key_prefix, label, expires_at, revoked_at, last_used_at, created_at`;

const toIntegration = (row: IntegrationRow): IntegrationView => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  status: row.status,
  scopes: row.scopes,
  clientScope: row.client_scope,
  clientIds: row.client_ids,
  manifestVersion: row.manifest_version,
  manifest: row.manifest,
  rateLimitPerMinute: row.rate_limit_per_minute,
  activeCredentials: row.active_credentials,
  lastUsedAt: row.last_used_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toCredential = (row: CredentialRow): ApiCredentialView => ({
  id: row.id,
  integrationId: row.integration_id,
  keyPrefix: row.key_prefix,
  label: row.label,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  lastUsedAt: row.last_used_at,
  createdAt: row.created_at,
});

export class PgIntegrationsRepository
  implements
    IntegrationListRepository,
    IntegrationGetRepository,
    IntegrationClientQuery,
    IntegrationCreateRepository,
    IntegrationUpdateRepository,
    IntegrationManifestRepository,
    CredentialQuery,
    ApiKeyAuthRepository
{
  constructor(private readonly tx: Tx) {}

  async list(query: IntegrationListQuery) {
    const where: string[] = [];
    const values: unknown[] = [];
    if (query.status) {
      values.push(query.status);
      where.push(`i.status = $${values.length}::app.integration_status`);
    }
    const filter = where.length ? `where ${where.join(' and ')}` : '';
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::bigint as n from app.integrations i ${filter}`,
      values,
    );
    const { rows } = await this.tx.query<IntegrationRow>(
      `select ${INTEGRATION_COLUMNS}
         from app.integrations i
         ${filter}
        order by i.name asc, i.id
        limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return { items: rows.map(toIntegration), total: Number(count.rows[0]?.n ?? 0) };
  }

  async findById(id: string): Promise<IntegrationView | null> {
    const { rows } = await this.tx.query<IntegrationRow>(
      `select ${INTEGRATION_COLUMNS} from app.integrations i where i.id = $1 limit 1`,
      [id],
    );
    return rows[0] ? toIntegration(rows[0]) : null;
  }

  async findClientStatuses(ids: string[]): Promise<Map<string, ClientStatus>> {
    if (ids.length === 0) return new Map();
    const { rows } = await this.tx.query<{ id: string; status: ClientStatus }>(
      `select id::text as id, status::text as status from app.clients where id = any($1::uuid[])`,
      [ids],
    );
    return new Map(rows.map((row) => [row.id, row.status]));
  }

  async insert(record: CreateIntegrationRecord): Promise<IntegrationView> {
    const manifest = record.manifest;
    const { rows } = await this.tx.query<{ id: string }>(
      `insert into app.integrations
         (slug, name, description, status, scopes, client_scope, manifest, manifest_version,
          rate_limit_per_minute, created_by)
       values ($1, $2, $3, 'activa', $4::text[], $5::app.client_scope, $6::jsonb, $7, $8, $9)
       returning id::text as id`,
      [
        manifest.integration,
        manifest.display_name,
        manifest.description ?? null,
        manifest.scopes,
        manifest.client_scope,
        JSON.stringify(manifest),
        manifest.version,
        manifest.rate_limit_per_minute,
        record.createdBy,
      ],
    );
    const id = rows[0]!.id;
    await this.replaceClients(id, manifest, record.createdBy);
    const integration = await this.findById(id);
    if (!integration) throw new Error('Integración recién creada no encontrada');
    return integration;
  }

  private async replaceClients(
    integrationId: string,
    manifest: IntegrationManifest,
    createdBy: string,
  ): Promise<void> {
    await this.tx.query(`delete from app.integration_clients where integration_id = $1`, [
      integrationId,
    ]);
    if (manifest.client_scope !== 'own' || !manifest.client_ids?.length) return;
    await this.tx.query(
      `insert into app.integration_clients (integration_id, client_id, created_by)
       select $1, x, $3 from unnest($2::uuid[]) as x
       on conflict do nothing`,
      [integrationId, manifest.client_ids, createdBy],
    );
  }

  async update(record: UpdateIntegrationRecord): Promise<IntegrationView | null> {
    const sets: string[] = ['updated_at = now()', `updated_by = $2`];
    const values: unknown[] = [record.id, record.updatedBy];
    if (record.patch.name !== undefined) {
      values.push(record.patch.name);
      sets.push(`name = $${values.length}`);
    }
    if (record.patch.description !== undefined) {
      values.push(record.patch.description);
      sets.push(`description = $${values.length}`);
    }
    if (record.patch.status !== undefined) {
      values.push(record.patch.status);
      sets.push(`status = $${values.length}::app.integration_status`);
    }
    const { rowCount } = await this.tx.query(
      `update app.integrations set ${sets.join(', ')} where id = $1`,
      values,
    );
    if (!rowCount) return null;
    return this.findById(record.id);
  }

  async replaceManifest(record: ReplaceManifestRecord): Promise<IntegrationView | null> {
    const manifest = record.manifest;
    const { rowCount } = await this.tx.query(
      `update app.integrations
          set name = $2, description = $3, scopes = $4::text[],
              client_scope = $5::app.client_scope, manifest = $6::jsonb,
              manifest_version = $7, rate_limit_per_minute = $8,
              updated_at = now(), updated_by = $9
        where id = $1`,
      [
        record.id,
        manifest.display_name,
        manifest.description ?? null,
        manifest.scopes,
        manifest.client_scope,
        JSON.stringify(manifest),
        manifest.version,
        manifest.rate_limit_per_minute,
        record.updatedBy,
      ],
    );
    if (!rowCount) return null;
    await this.replaceClients(record.id, manifest, record.updatedBy);
    return this.findById(record.id);
  }

  async listCredentials(integrationId: string): Promise<ApiCredentialView[]> {
    const { rows } = await this.tx.query<CredentialRow>(
      `select ${CREDENTIAL_COLUMNS} from app.api_credentials
        where integration_id = $1
        order by created_at desc, id`,
      [integrationId],
    );
    return rows.map(toCredential);
  }

  async countActive(integrationId: string, at: Date): Promise<number> {
    const { rows } = await this.tx.query<{ n: string }>(
      `select count(*)::bigint as n from app.api_credentials
        where integration_id = $1 and revoked_at is null
          and (expires_at is null or expires_at > $2)`,
      [integrationId, at],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async insertCredential(record: NewCredentialRecord): Promise<ApiCredentialView> {
    const { rows } = await this.tx.query<CredentialRow>(
      `insert into app.api_credentials
         (integration_id, key_prefix, key_hash, label, expires_at, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning ${CREDENTIAL_COLUMNS}`,
      [
        record.integrationId,
        record.keyPrefix,
        record.keyHash,
        record.label,
        record.expiresAt,
        record.createdBy,
      ],
    );
    return toCredential(rows[0]!);
  }

  async revoke(
    integrationId: string,
    credentialId: string,
    revokedBy: string,
    at: Date,
  ): Promise<ApiCredentialView | null> {
    const { rows } = await this.tx.query<CredentialRow>(
      `update app.api_credentials
          set revoked_at = $4, revoked_by = $3
        where integration_id = $1 and id = $2 and revoked_at is null
        returning ${CREDENTIAL_COLUMNS}`,
      [integrationId, credentialId, revokedBy, at],
    );
    return rows[0] ? toCredential(rows[0]) : null;
  }

  async findByPrefix(keyPrefix: string): Promise<ApiKeyAuthRow | null> {
    const { rows } = await this.tx.query<{
      credential_id: string;
      integration_id: string;
      key_hash: string;
      expires_at: Date | null;
      revoked_at: Date | null;
      status: IntegrationStatus;
      scopes: Scope[];
      client_scope: ClientScope;
      rate_limit_per_minute: number;
    }>(
      `select c.id::text as credential_id, c.integration_id::text as integration_id,
              c.key_hash, c.expires_at, c.revoked_at, i.status::text as status,
              i.scopes, i.client_scope::text as client_scope, i.rate_limit_per_minute
         from app.api_credentials c
         join app.integrations i on i.id = c.integration_id
        where c.key_prefix = $1
        limit 1`,
      [keyPrefix],
    );
    const row = rows[0];
    return row
      ? {
          credentialId: row.credential_id,
          integrationId: row.integration_id,
          keyHash: row.key_hash,
          expiresAt: row.expires_at,
          revokedAt: row.revoked_at,
          integrationStatus: row.status,
          scopes: row.scopes,
          clientScope: row.client_scope,
          rateLimitPerMinute: row.rate_limit_per_minute,
        }
      : null;
  }

  async updateLastUsed(
    credentialId: string,
    integrationId: string,
    at: Date,
    ip: string | null,
  ): Promise<void> {
    await this.tx.query(
      `update app.api_credentials set last_used_at = $2, last_used_ip = $3 where id = $1`,
      [credentialId, at, ip],
    );
    await this.tx.query(`update app.integrations set last_used_at = $2 where id = $1`, [
      integrationId,
      at,
    ]);
  }
}
