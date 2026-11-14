import type { ClientListQuery } from '@fabsoft/shared';
import { normalizeTaxId } from '../../../../domain/clients/tax-id.js';
import type {
  CreateClientOutcome,
  CreateClientRepository,
  NewClient,
} from '../../../../application/clients/create-client/ports.js';
import type { GetClientQuery } from '../../../../application/clients/get-client/ports.js';
import type { ListClientsQuery } from '../../../../application/clients/list-clients/ports.js';
import type { ArchiveClientRepository } from '../../../../application/clients/archive-client/ports.js';
import type { ReactivateClientRepository } from '../../../../application/clients/reactivate-client/ports.js';
import type {
  ClientPatch,
  UpdateClientOutcome,
  UpdateClientRepository,
} from '../../../../application/clients/update-client/ports.js';
import type { ClientView } from '../../../../application/clients/shared/client-view.js';
import type { Tx } from '../../../db/with-rls-context.js';
import { PG, pgCode } from '../shared/pg-errors.js';
import { CLIENT_COLUMNS, type ClientRow, toClientView } from './pg-client-columns.js';

const CLIENT_FROM = `from app.clients c left join app.users u on u.id = c.owner_user_id`;

const SORT: Record<ClientListQuery['sort'], string> = {
  legalName: 'c.legal_name asc, c.id',
  '-legalName': 'c.legal_name desc, c.id',
  createdAt: 'c.created_at asc, c.id',
  '-createdAt': 'c.created_at desc, c.id',
};

async function conflictFromIndex(tx: Tx, normalized: string): Promise<CreateClientOutcome> {
  const { rows } = await tx.query<{ id: string; status: ClientRow['status'] }>(
    `select id, status from app.clients where tax_id_normalized = $1 limit 1`,
    [normalized],
  );
  const row = rows[0];
  if (!row) throw new Error('unique violation sin fila conflictiva');
  return {
    ok: false,
    reason: 'client_tax_id_taken',
    conflict: { existingClientId: row.id, archived: row.status === 'archived' },
  };
}

export class PgListClientsQuery implements ListClientsQuery {
  constructor(private readonly tx: Tx) {}
  async list(q: ClientListQuery): Promise<{ items: ClientView[]; total: number }> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (q.q) {
      const term = `%${q.q.replace(/[%_\\]/g, '\\$&')}%`;
      values.push(term);
      where.push(`(c.legal_name ilike $${values.length} or coalesce(c.tax_id, '') ilike $${values.length})`);
    }
    if (q.status.length) {
      values.push(q.status);
      where.push(`c.status = any($${values.length}::app.client_status[])`);
    }
    if (q.taxId) {
      values.push(normalizeTaxId(q.taxId));
      where.push(`c.tax_id_normalized = $${values.length}`);
    }
    if (q.ownerUserId) {
      values.push(q.ownerUserId);
      where.push(`c.owner_user_id = $${values.length}`);
    }
    const filter = where.length ? `where ${where.join(' and ')}` : '';
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::text as n from app.clients c ${filter}`,
      values,
    );
    const { rows } = await this.tx.query<ClientRow>(
      `select ${CLIENT_COLUMNS} ${CLIENT_FROM} ${filter} order by ${SORT[q.sort]} limit $${
        values.length + 1
      } offset $${values.length + 2}`,
      [...values, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { items: rows.map(toClientView), total: Number(count.rows[0]?.n ?? 0) };
  }
}

export class PgGetClientQuery implements GetClientQuery {
  constructor(private readonly tx: Tx) {}
  async findById(id: string): Promise<ClientView | null> {
    const { rows } = await this.tx.query<ClientRow>(
      `select ${CLIENT_COLUMNS} ${CLIENT_FROM} where c.id = $1`,
      [id],
    );
    return rows[0] ? toClientView(rows[0]) : null;
  }
}

export class PgCreateClientRepository implements CreateClientRepository {
  constructor(private readonly tx: Tx) {}
  async findByTaxIdNormalized(normalized: string) {
    const { rows } = await this.tx.query<{ id: string; status: ClientRow['status'] }>(
      `select id, status from app.clients where tax_id_normalized = $1 limit 1`,
      [normalized],
    );
    return rows[0] ?? null;
  }
  async insert(u: NewClient): Promise<CreateClientOutcome> {
    if (u.taxId) {
      const normalized = normalizeTaxId(u.taxId);
      const existing = await this.findByTaxIdNormalized(normalized);
      if (existing) {
        return {
          ok: false,
          reason: 'client_tax_id_taken',
          conflict: { existingClientId: existing.id, archived: existing.status === 'archived' },
        };
      }
    }
    try {
      const { rows } = await this.tx.query<ClientRow>(
        `insert into app.clients (legal_name, tax_id, email, phone, owner_user_id, status, created_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $7)
         returning id, legal_name, tax_id, status, email, phone, owner_user_id, archived_at, created_at, updated_at,
           null::uuid as owner_id, null::text as owner_full_name`,
        [
          u.legalName,
          u.taxId,
          u.email,
          u.phone,
          u.ownerUserId,
          u.status,
          u.createdBy,
        ],
      );
      const detail = await new PgGetClientQuery(this.tx).findById(rows[0]!.id);
      return { ok: true, client: detail ?? toClientView(rows[0]!) };
    } catch (err) {
      if (pgCode(err) === PG.uniqueViolation && u.taxId) {
        return conflictFromIndex(this.tx, normalizeTaxId(u.taxId));
      }
      throw err;
    }
  }
}

export class PgUpdateClientRepository implements UpdateClientRepository {
  constructor(private readonly tx: Tx) {}
  async loadForUpdate(id: string): Promise<ClientView | null> {
    const { rows } = await this.tx.query<ClientRow>(
      `select ${CLIENT_COLUMNS} ${CLIENT_FROM} where c.id = $1 for update of c`,
      [id],
    );
    return rows[0] ? toClientView(rows[0]) : null;
  }
  async findByTaxIdNormalized(normalized: string, excludeId: string) {
    const { rows } = await this.tx.query<{ id: string; status: ClientRow['status'] }>(
      `select id, status from app.clients where tax_id_normalized = $1 and id <> $2 limit 1`,
      [normalized, excludeId],
    );
    return rows[0] ?? null;
  }
  async save(id: string, p: ClientPatch): Promise<UpdateClientOutcome> {
    if (p.taxId) {
      const normalized = normalizeTaxId(p.taxId);
      const existing = await this.findByTaxIdNormalized(normalized, id);
      if (existing) {
        return {
          ok: false,
          reason: 'client_tax_id_taken',
          conflict: { existingClientId: existing.id, archived: existing.status === 'archived' },
        };
      }
    }
    try {
      const { rows } = await this.tx.query<ClientRow>(
        `update app.clients set
           legal_name = coalesce($2, legal_name),
           tax_id = case when $3::boolean then $4 else tax_id end,
           email = case when $5::boolean then $6 else email end,
           phone = case when $7::boolean then $8 else phone end,
           owner_user_id = case when $9::boolean then $10 else owner_user_id end,
           status = coalesce($11, status),
           updated_by = $12
         where id = $1
         returning id, legal_name, tax_id, status, email, phone, owner_user_id, archived_at, created_at, updated_at,
           null::uuid as owner_id, null::text as owner_full_name`,
        [
          id,
          p.legalName ?? null,
          p.taxId !== undefined,
          p.taxId ?? null,
          p.email !== undefined,
          p.email ?? null,
          p.phone !== undefined,
          p.phone ?? null,
          p.ownerUserId !== undefined,
          p.ownerUserId ?? null,
          p.status ?? null,
          p.updatedBy,
        ],
      );
      if (!rows[0]) throw new Error('update de cliente sin fila');
      const detail = await new PgGetClientQuery(this.tx).findById(id);
      return { ok: true, client: detail ?? toClientView(rows[0]) };
    } catch (err) {
      if (pgCode(err) === PG.uniqueViolation && p.taxId !== undefined && p.taxId) {
        const outcome = await conflictFromIndex(this.tx, normalizeTaxId(p.taxId));
        return outcome.ok
          ? outcome
          : { ok: false, reason: 'client_tax_id_taken', conflict: outcome.conflict };
      }
      throw err;
    }
  }
}

export class PgArchiveClientRepository implements ArchiveClientRepository {
  constructor(private readonly tx: Tx) {}
  loadForUpdate = (id: string) => new PgUpdateClientRepository(this.tx).loadForUpdate(id);
  async archive(id: string, archivedAt: Date, updatedBy: string): Promise<ClientView> {
    await this.tx.query(
      `update app.clients set status = 'archived', archived_at = $2, updated_by = $3 where id = $1`,
      [id, archivedAt, updatedBy],
    );
    const detail = await new PgGetClientQuery(this.tx).findById(id);
    if (!detail) throw new Error('cliente no encontrado tras archivar');
    return detail;
  }
}

export class PgReactivateClientRepository implements ReactivateClientRepository {
  constructor(private readonly tx: Tx) {}
  loadForUpdate = (id: string) => new PgUpdateClientRepository(this.tx).loadForUpdate(id);
  async reactivate(id: string, updatedBy: string): Promise<ClientView> {
    await this.tx.query(
      `update app.clients set status = 'active', archived_at = null, updated_by = $2 where id = $1`,
      [id, updatedBy],
    );
    const detail = await new PgGetClientQuery(this.tx).findById(id);
    if (!detail) throw new Error('cliente no encontrado tras reactivar');
    return detail;
  }
}