import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { AuditLogView } from '../../audit/shared/audit-log-view.js';
import type { ListAuditLogsRepos } from '../../audit/list-audit-logs/ports.js';

export class GetDashboardActivity {
  constructor(private readonly uow: UnitOfWork<ListAuditLogsRepos>) {}

  async execute(actor: UserActor, limit: number): Promise<AuditLogView[]> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, async ({ auditLogs }) => {
      const result = await auditLogs.list({ page: 1, pageSize: limit });
      return result.items;
    });
  }
}
