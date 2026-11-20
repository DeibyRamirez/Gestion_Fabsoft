import type { RenewalRequestView } from '../../../../application/renewal-requests/list-renewal-requests/ports.js';
import type {
  RenewalRequestUpdateParams,
  RenewalRequestUpdateRepository,
} from '../../../../application/renewal-requests/update-renewal-request/ports.js';
import type {
  RenewalRequestResolveRepository,
  ResolveRenewalRequestParams,
} from '../../../../application/renewal-requests/resolve-renewal-request/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';
import {
  RENEWAL_REQUEST_COLUMNS,
  RENEWAL_REQUEST_JOINS,
  toRenewalRequestView,
  type RenewalRequestRow,
} from './pg-renewal-request-list-repository.js';

export class PgRenewalRequestMutationRepository
  implements RenewalRequestUpdateRepository, RenewalRequestResolveRepository
{
  constructor(private readonly tx: Tx) {}

  private async findById(id: string): Promise<RenewalRequestView | null> {
    const { rows } = await this.tx.query<RenewalRequestRow>(
      `select ${RENEWAL_REQUEST_COLUMNS} ${RENEWAL_REQUEST_JOINS} where r.id = $1 limit 1`,
      [id],
    );
    return rows[0] ? toRenewalRequestView(rows[0]) : null;
  }

  async loadForUpdate(id: string): Promise<RenewalRequestView | null> {
    const { rows } = await this.tx.query<RenewalRequestRow>(
      `select ${RENEWAL_REQUEST_COLUMNS} ${RENEWAL_REQUEST_JOINS}
        where r.id = $1
        for update of r`,
      [id],
    );
    return rows[0] ? toRenewalRequestView(rows[0]) : null;
  }

  async findAssignableUser(id: string): Promise<{ id: string; fullName: string } | null> {
    const { rows } = await this.tx.query<{ id: string; full_name: string }>(
      `select id::text as id, full_name
         from app.users
        where id = $1 and status = 'activo' and role in ('admin', 'operator')
        limit 1`,
      [id],
    );
    const row = rows[0];
    return row ? { id: row.id, fullName: row.full_name } : null;
  }

  async update(id: string, params: RenewalRequestUpdateParams): Promise<RenewalRequestView | null> {
    const values: unknown[] = [id];
    const set: string[] = ['updated_at = now()'];
    if (params.status !== undefined) {
      values.push(params.status);
      set.push(`status = $${values.length}::app.renewal_request_status`);
    }
    if (params.assignedUserId !== undefined) {
      values.push(params.assignedUserId);
      set.push(`assigned_user_id = $${values.length}`);
    }

    const { rowCount } = await this.tx.query(
      `update app.renewal_requests set ${set.join(', ')} where id = $1`,
      values,
    );
    if (rowCount !== 1) return null;

    if (params.assignedUserId !== undefined) {
      await this.tx.query(
        `update app.tasks
            set assignee_user_id = $2, version = version + 1, updated_at = now()
          where renewal_request_id = $1 and status in ('pendiente','en_progreso')`,
        [id, params.assignedUserId],
      );
    }
    return this.findById(id);
  }

  async hasConfirmedRenewalAfter(subscriptionId: string, since: Date): Promise<boolean> {
    const { rows } = await this.tx.query<{ confirmed: boolean }>(
      `select exists(
         select 1
           from app.subscription_periods
          where subscription_id = $1
            and renewal_outcome = 'renovada'
            and confirmed_at is not null
            and confirmed_at >= $2
       ) as confirmed`,
      [subscriptionId, since],
    );
    return rows[0]?.confirmed ?? false;
  }

  async resolve(
    id: string,
    params: ResolveRenewalRequestParams,
  ): Promise<RenewalRequestView | null> {
    const { rowCount } = await this.tx.query(
      `update app.renewal_requests
          set status = 'resuelta',
              resolution = $2::app.renewal_request_resolution,
              resolution_note = $3,
              resolved_at = $4,
              resolved_by = $5,
              updated_at = now()
        where id = $1 and status in ('pendiente_revision','en_progreso')`,
      [id, params.resolution, params.resolutionNote, params.resolvedAt, params.resolvedBy],
    );
    if (rowCount !== 1) return null;

    await this.tx.query(
      `update app.tasks
          set status = 'completada',
              outcome = $2,
              completed_at = $3,
              version = version + 1,
              updated_at = now(),
              updated_by = $4
        where renewal_request_id = $1 and status in ('pendiente','en_progreso')`,
      [
        id,
        params.resolutionNote ?? `Solicitud resuelta: ${params.resolution}`,
        params.resolvedAt,
        params.resolvedBy,
      ],
    );
    return this.findById(id);
  }
}
