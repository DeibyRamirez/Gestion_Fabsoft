import type {
  RenewalRequestListQuery,
  RenewalRequestResolution,
  RenewalRequestStatus,
} from '@fabsoft/shared';
import type {
  GetRenewalRequestQuery,
  ListRenewalRequestsQuery,
  RenewalRequestView,
} from '../../../../application/renewal-requests/list-renewal-requests/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface RenewalRequestRow {
  id: string;
  subscription_id: string;
  client_id: string;
  requested_by_user_id: string | null;
  requested_by_user_name: string | null;
  requested_by_integration_id: string | null;
  requested_by_integration_name: string | null;
  comment: string | null;
  status: RenewalRequestStatus;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  resolution: RenewalRequestResolution | null;
  resolution_note: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = `r.id::text as id, r.subscription_id::text as subscription_id,
  r.client_id::text as client_id,
  r.requested_by_user_id::text as requested_by_user_id,
  ru.full_name as requested_by_user_name,
  r.requested_by_integration_id::text as requested_by_integration_id,
  i.name as requested_by_integration_name,
  r.comment, r.status::text as status,
  r.assigned_user_id::text as assigned_user_id,
  au.full_name as assigned_user_name,
  r.resolution::text as resolution, r.resolution_note,
  r.resolved_at, r.created_at, r.updated_at`;

const JOINS = `from app.renewal_requests r
  left join app.users ru on ru.id = r.requested_by_user_id
  left join app.integrations i on i.id = r.requested_by_integration_id
  left join app.users au on au.id = r.assigned_user_id`;

const toView = (row: RenewalRequestRow): RenewalRequestView => {
  const requestedBy = row.requested_by_user_id
    ? {
        actorType: 'user' as const,
        id: row.requested_by_user_id,
        ...(row.requested_by_user_name ? { name: row.requested_by_user_name } : {}),
      }
    : {
        actorType: 'integration' as const,
        id: row.requested_by_integration_id!,
        ...(row.requested_by_integration_name ? { name: row.requested_by_integration_name } : {}),
      };

  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    clientId: row.client_id,
    requestedBy,
    comment: row.comment,
    status: row.status,
    assignedUser:
      row.assigned_user_id && row.assigned_user_name
        ? { id: row.assigned_user_id, fullName: row.assigned_user_name }
        : null,
    resolution: row.resolution,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export class PgListRenewalRequestsQuery
  implements ListRenewalRequestsQuery, GetRenewalRequestQuery
{
  constructor(private readonly tx: Tx) {}

  async findById(id: string): Promise<RenewalRequestView | null> {
    const { rows } = await this.tx.query<RenewalRequestRow>(
      `select ${COLUMNS} ${JOINS} where r.id = $1 limit 1`,
      [id],
    );
    return rows[0] ? toView(rows[0]) : null;
  }

  async list(query: RenewalRequestListQuery) {
    const where: string[] = [];
    const values: unknown[] = [];
    if (query.status?.length) {
      values.push(query.status);
      where.push(`r.status = any($${values.length}::app.renewal_request_status[])`);
    }
    if (query.clientId) {
      values.push(query.clientId);
      where.push(`r.client_id = $${values.length}`);
    }
    if (query.subscriptionId) {
      values.push(query.subscriptionId);
      where.push(`r.subscription_id = $${values.length}`);
    }
    if (query.assignedUserId) {
      values.push(query.assignedUserId);
      where.push(`r.assigned_user_id = $${values.length}`);
    }

    const filter = where.length ? `where ${where.join(' and ')}` : '';
    const order = query.sort === 'createdAt' ? 'asc' : 'desc';
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::bigint as n ${JOINS} ${filter}`,
      values,
    );
    const { rows } = await this.tx.query<RenewalRequestRow>(
      `select ${COLUMNS} ${JOINS} ${filter}
        order by r.created_at ${order}, r.id
        limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return { items: rows.map(toView), total: Number(count.rows[0]?.n ?? 0) };
  }
}
