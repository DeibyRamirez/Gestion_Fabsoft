import type { AuditLogListQuery } from '@fabsoft/shared';
import type { ListAuditLogsRepository } from '../../../../application/audit/list-audit-logs/ports.js';
import { activitySummary } from '../../../../application/audit/shared/activity-summary.js';
import type {
  AuditLogActorView,
  AuditLogView,
} from '../../../../application/audit/shared/audit-log-view.js';
import type { ListClientActivityRepository } from '../../../../application/clients/list-client-activity/ports.js';
import type { ClientActivityView } from '../../../../application/clients/shared/client-activity-view.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface AuditLogRow {
  id: string;
  occurred_at: Date;
  actor_type: 'user' | 'integration' | 'system';
  actor_user_id: string | null;
  actor_integration_id: string | null;
  actor_name: string | null;
  actor_integration_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  client_id: string | null;
  changes: Record<string, unknown> | null;
  reason: string | null;
  request_id: string | null;
}

const actorOf = (r: AuditLogRow): AuditLogActorView | null => {
  if (r.actor_type === 'system') return null;
  const id = r.actor_type === 'user' ? r.actor_user_id : r.actor_integration_id;
  if (!id) return null;
  const name = (r.actor_type === 'user' ? r.actor_name : r.actor_integration_name) ?? id;
  return { id, name };
};

const toAuditLogView = (r: AuditLogRow): AuditLogView => ({
  id: r.id,
  occurredAt: r.occurred_at,
  actorType: r.actor_type,
  actor: actorOf(r),
  action: r.action,
  resourceType: r.resource_type,
  resourceId: r.resource_id,
  clientId: r.client_id,
  changes: r.changes,
  reason: r.reason,
  requestId: r.request_id,
});

const toClientActivityView = (r: AuditLogRow): ClientActivityView => ({
  id: r.id,
  occurredAt: r.occurred_at,
  actor: actorOf(r),
  action: r.action,
  resourceType: r.resource_type,
  resourceId: r.resource_id,
  summary: activitySummary(r.action),
});

const AUDIT_SELECT = `al.id::text as id,
  al.occurred_at,
  al.actor_type,
  al.actor_user_id,
  al.actor_integration_id,
  u.full_name as actor_name,
  i.name as actor_integration_name,
  al.action,
  al.resource_type,
  al.resource_id,
  al.client_id,
  al.reason,
  al.request_id`;

const AUDIT_JOINS = `left join app.users u on u.id = al.actor_user_id
  left join app.integrations i on i.id = al.actor_integration_id`;

export class PgAuditLogRepository implements ListAuditLogsRepository, ListClientActivityRepository {
  constructor(private readonly tx: Tx) {}

  async list(query: AuditLogListQuery): Promise<{ items: AuditLogView[]; total: number }> {
    const where: string[] = [];
    const values: unknown[] = [];
    const placeholder = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    if (query.actorType) where.push(`al.actor_type = ${placeholder(query.actorType)}`);
    if (query.actorId) {
      const p = placeholder(query.actorId);
      where.push(`(al.actor_user_id = ${p} or al.actor_integration_id = ${p})`);
    }
    if (query.action) where.push(`al.action = ${placeholder(query.action)}`);
    if (query.resourceType) where.push(`al.resource_type = ${placeholder(query.resourceType)}`);
    if (query.resourceId) where.push(`al.resource_id = ${placeholder(query.resourceId)}`);
    if (query.clientId) where.push(`al.client_id = ${placeholder(query.clientId)}`);
    if (query.from) where.push(`al.occurred_at >= ${placeholder(query.from)}::timestamptz`);
    if (query.to) where.push(`al.occurred_at <= ${placeholder(query.to)}::timestamptz`);

    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::bigint as n from app.audit_logs al ${whereSql}`,
      values,
    );

    const limit = placeholder(query.pageSize);
    const offset = placeholder((query.page - 1) * query.pageSize);
    const { rows } = await this.tx.query<AuditLogRow>(
      `select ${AUDIT_SELECT},
              app.audit_log_changes_for_reader(al.id) as changes
         from app.audit_logs al
         ${AUDIT_JOINS}
         ${whereSql}
        order by al.occurred_at desc, al.id desc
        limit ${limit} offset ${offset}`,
      values,
    );

    return { items: rows.map(toAuditLogView), total: Number(count.rows[0]?.n ?? 0) };
  }

  async listForClient(
    clientId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: ClientActivityView[]; total: number }> {
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::bigint as n
         from app.audit_logs al
        where al.client_id = $1`,
      [clientId],
    );
    const { rows } = await this.tx.query<AuditLogRow>(
      `select ${AUDIT_SELECT}
         from app.audit_logs al
         ${AUDIT_JOINS}
        where al.client_id = $1
        order by al.occurred_at desc, al.id desc
        limit $2 offset $3`,
      [clientId, pageSize, (page - 1) * pageSize],
    );

    return { items: rows.map(toClientActivityView), total: Number(count.rows[0]?.n ?? 0) };
  }
}
