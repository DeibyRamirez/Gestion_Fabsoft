import type { RenewalRequestStatus, SubscriptionStatus } from '@fabsoft/shared';
import type {
  NewRenewalRequestRecord,
  RenewalRequestCreateRepository,
  RequestableSubscription,
} from '../../../../application/renewal-requests/create-renewal-request/ports.js';
import type { CreatedRenewalRequestView } from '../../../../application/portal/shared/portal-views.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface SubscriptionRow {
  id: string;
  client_id: string;
  product_name: string;
  status: SubscriptionStatus;
}

const toRequestable = (row: SubscriptionRow): RequestableSubscription => ({
  id: row.id,
  clientId: row.client_id,
  productName: row.product_name,
  status: row.status,
});

export class PgRenewalRequestCreateRepository implements RenewalRequestCreateRepository {
  constructor(private readonly tx: Tx) {}

  async findForClient(
    clientId: string,
    subscriptionId: string,
  ): Promise<RequestableSubscription | null> {
    const { rows } = await this.tx.query<SubscriptionRow>(
      `select s.id::text as id, s.client_id::text as client_id,
              p.name as product_name, s.status::text as status
         from app.portal_subscriptions s
         join app.products p on p.id = s.product_id
        where s.client_id = $1 and s.id = $2
        limit 1`,
      [clientId, subscriptionId],
    );
    return rows[0] ? toRequestable(rows[0]) : null;
  }

  async findForStaff(subscriptionId: string): Promise<RequestableSubscription | null> {
    const { rows } = await this.tx.query<SubscriptionRow>(
      `select s.id::text as id, s.client_id::text as client_id,
              p.name as product_name, s.status::text as status
         from app.subscriptions s
         join app.products p on p.id = s.product_id
        where s.id = $1
        limit 1`,
      [subscriptionId],
    );
    return rows[0] ? toRequestable(rows[0]) : null;
  }

  async insert(record: NewRenewalRequestRecord): Promise<CreatedRenewalRequestView> {
    const { rows } = await this.tx.query<{
      id: string;
      subscription_id: string;
      client_id: string;
      comment: string | null;
      status: RenewalRequestStatus;
      created_at: Date;
      updated_at: Date;
    }>(
      `insert into app.renewal_requests
         (subscription_id, client_id, requested_by_user_id, comment)
       values ($1, $2, $3, $4)
       returning id::text as id, subscription_id::text as subscription_id,
                 client_id::text as client_id, comment, status::text as status,
                 created_at, updated_at`,
      [record.subscriptionId, record.clientId, record.requestedByUserId, record.comment],
    );
    const row = rows[0]!;
    return {
      id: row.id,
      subscriptionId: row.subscription_id,
      clientId: row.client_id,
      productName: record.productName,
      comment: row.comment,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      requestedBy: { actorType: 'user', id: record.requestedByUserId },
    };
  }
}
