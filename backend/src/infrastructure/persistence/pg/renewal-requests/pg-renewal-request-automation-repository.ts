import type { RenewalRequestAutomation } from '../../../../application/renewal-requests/shared/renewal-request-automation.js';
import type { Tx } from '../../../db/with-rls-context.js';

export class PgRenewalRequestAutomationRepository implements RenewalRequestAutomation {
  constructor(private readonly tx: Tx) {}

  async resolveOpenForSubscription(
    subscriptionId: string,
    resolutionNote: string,
    resolvedBy: string,
  ): Promise<number> {
    const { rowCount } = await this.tx.query(
      `update app.renewal_requests
          set status = 'resolved', resolution = 'renewed', resolution_note = $2,
              resolved_at = now(), resolved_by = $3
        where subscription_id = $1 and status in ('pending_review','in_progress')`,
      [subscriptionId, resolutionNote, resolvedBy],
    );
    return rowCount ?? 0;
  }
}
