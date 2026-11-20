import type { RenewalRequestStatus, SubscriptionStatus } from '@fabsoft/shared';
import type {
  CreatedIntegrationRenewalRequestView,
  IntegrationRenewalRequestRecord,
  IntegrationRenewalRequestRepository,
  IntegrationRequestableSubscription,
} from '../../../../application/integrations/public-api/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

export class PgIntegrationRenewalRequestRepository implements IntegrationRenewalRequestRepository {
  constructor(private readonly tx: Tx) {}

  async findForIntegration(
    integrationId: string,
    subscriptionId: string,
  ): Promise<IntegrationRequestableSubscription | null> {
    const { rows } = await this.tx.query<{
      id: string;
      client_id: string;
      status: SubscriptionStatus;
    }>(
      `select s.id::text as id, s.client_id::text as client_id, s.status::text as status
         from app.integration_subscriptions s
        where s.id = $1
          and exists (
            select 1 from app.integrations i
             where i.id = $2 and i.status = 'activa'
          )
        limit 1`,
      [subscriptionId, integrationId],
    );
    const row = rows[0];
    return row ? { id: row.id, clientId: row.client_id, status: row.status } : null;
  }

  async insert(
    record: IntegrationRenewalRequestRecord,
  ): Promise<CreatedIntegrationRenewalRequestView> {
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
         (subscription_id, client_id, requested_by_integration_id, comment)
       values ($1, $2, $3, $4)
       returning id::text as id, subscription_id::text as subscription_id,
                 client_id::text as client_id, comment, status::text as status,
                 created_at, updated_at`,
      [record.subscriptionId, record.clientId, record.requestedByIntegrationId, record.comment],
    );
    const row = rows[0]!;
    return {
      id: row.id,
      subscriptionId: row.subscription_id,
      clientId: row.client_id,
      comment: row.comment,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      requestedBy: { actorType: 'integration', id: record.requestedByIntegrationId },
    };
  }
}
