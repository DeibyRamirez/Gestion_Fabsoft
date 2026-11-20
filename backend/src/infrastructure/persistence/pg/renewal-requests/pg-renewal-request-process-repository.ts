import type {
  RenewalRequestFollowUp,
  RenewalRequestProcessContext,
  RenewalRequestProcessRepository,
} from '../../../../application/renewal-requests/process-created/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface ContextRow {
  request_id: string;
  subscription_id: string;
  client_id: string;
  client_legal_name: string;
  product_name: string;
  comment: string | null;
  assignee_user_id: string | null;
  admin_ids: string[];
}

export class PgRenewalRequestProcessRepository implements RenewalRequestProcessRepository {
  constructor(private readonly tx: Tx) {}

  async findContext(requestId: string): Promise<RenewalRequestProcessContext | null> {
    const { rows } = await this.tx.query<ContextRow>(
      `select rr.id::text as request_id,
              rr.subscription_id::text as subscription_id,
              rr.client_id::text as client_id,
              c.legal_name as client_legal_name,
              p.name as product_name,
              rr.comment,
              coalesce(
                (select u.id::text from app.users u
                  where u.id = s.owner_user_id
                    and u.role in ('admin', 'operator') and u.status = 'activo'),
                (select u.id::text from app.users u
                  where u.id = c.owner_user_id
                    and u.role in ('admin', 'operator') and u.status = 'activo')
              ) as assignee_user_id,
              array(
                select u.id::text from app.users u
                 where u.role = 'admin' and u.status = 'activo'
                 order by u.created_at, u.id
              ) as admin_ids
         from app.renewal_requests rr
         join app.subscriptions s on s.id = rr.subscription_id
         join app.clients c on c.id = rr.client_id
         join app.products p on p.id = s.product_id
        where rr.id = $1
        limit 1`,
      [requestId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      requestId: row.request_id,
      subscriptionId: row.subscription_id,
      clientId: row.client_id,
      clientLegalName: row.client_legal_name,
      productName: row.product_name,
      comment: row.comment,
      assigneeUserId: row.assignee_user_id,
      adminIds: row.admin_ids,
    };
  }

  async createFollowUp(
    context: RenewalRequestProcessContext,
    dueDate: string,
  ): Promise<RenewalRequestFollowUp> {
    const assigneeUserId = context.assigneeUserId ?? context.adminIds[0] ?? null;
    const title = `Revisar solicitud de renovación · ${context.clientLegalName}`.slice(0, 200);
    const notes = (
      context.comment
        ? `Solicitud creada desde el portal. Comentario: ${context.comment}`
        : 'Solicitud creada desde el portal.'
    ).slice(0, 5000);

    const inserted = await this.tx.query<{ id: string }>(
      `insert into app.tasks
         (task_type, client_id, subscription_id, renewal_request_id, assignee_user_id,
          priority, due_date, status, title, notes, dedupe_key)
       values ('review_renewal_request', $1, $2, $3, $4, 'high', $5::date, 'pendiente',
               $6, $7, $8)
       on conflict do nothing
       returning id::text as id`,
      [
        context.clientId,
        context.subscriptionId,
        context.requestId,
        assigneeUserId,
        dueDate,
        title,
        notes,
        `request:${context.requestId}`,
      ],
    );
    const taskId =
      inserted.rows[0]?.id ??
      (
        await this.tx.query<{ id: string }>(
          `select id::text as id from app.tasks where renewal_request_id = $1 limit 1`,
          [context.requestId],
        )
      ).rows[0]?.id ??
      null;

    const recipients = assigneeUserId ? [assigneeUserId] : context.adminIds;
    if (recipients.length === 0) return { taskId, notifications: 0 };

    let notifications = 0;
    for (const channel of ['in_app', 'email'] as const) {
      for (const recipientUserId of recipients) {
        const { rowCount } = await this.tx.query(
          `insert into app.notifications
             (notification_type, subscription_id, task_id, renewal_request_id, channel,
              recipient_user_id, scheduled_for, status, dedupe_key)
           values ('renewal_request_created', $1, $2, $3, $4, $5, now(), 'pendiente', $6)
           on conflict (dedupe_key) do nothing`,
          [
            context.subscriptionId,
            taskId,
            context.requestId,
            channel,
            recipientUserId,
            `rr:${context.requestId}:${channel}:${recipientUserId}`,
          ],
        );
        notifications += rowCount ?? 0;
      }
    }
    return { taskId, notifications };
  }
}
