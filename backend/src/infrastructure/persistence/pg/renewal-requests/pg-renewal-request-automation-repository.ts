import type { RenewalRequestResolution } from '@fabsoft/shared';
import type { RenewalRequestAutomation } from '../../../../application/renewal-requests/shared/renewal-request-automation.js';
import type { Tx } from '../../../db/with-rls-context.js';

export class PgRenewalRequestAutomationRepository implements RenewalRequestAutomation {
  constructor(private readonly tx: Tx) {}

  async resolveOpenForSubscription(
    subscriptionId: string,
    resolution: RenewalRequestResolution,
    resolutionNote: string,
    resolvedBy: string,
  ): Promise<number> {
    const { rows } = await this.tx.query<{ id: string }>(
      `select id::text as id
         from app.renewal_requests
        where subscription_id = $1 and status in ('pendiente_revision','en_progreso')
        for update`,
      [subscriptionId],
    );
    if (rows.length === 0) return 0;

    const ids = rows.map((row) => row.id);
    await this.tx.query(
      `update app.renewal_requests
          set status = 'resuelta',
              resolution = $2::app.renewal_request_resolution,
              resolution_note = $3,
              resolved_at = now(),
              resolved_by = $4,
              updated_at = now()
        where id = any($1::uuid[])`,
      [ids, resolution, resolutionNote, resolvedBy],
    );
    await this.tx.query(
      `update app.tasks
          set status = 'completada',
              outcome = $2,
              completed_at = now(),
              version = version + 1,
              updated_at = now(),
              updated_by = $3
        where renewal_request_id = any($1::uuid[]) and status in ('pendiente','en_progreso')`,
      [ids, resolutionNote, resolvedBy],
    );
    return ids.length;
  }
}
