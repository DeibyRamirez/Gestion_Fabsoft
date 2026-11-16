import type { AuditLogListQuery } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { AuditLogView } from '../shared/audit-log-view.js';
import type { ListAuditLogsRepos } from './ports.js';

export class ListAuditLogs {
  constructor(private readonly uow: UnitOfWork<ListAuditLogsRepos>) {}

  async execute(
    actor: UserActor,
    query: AuditLogListQuery,
  ): Promise<{ items: AuditLogView[]; total: number }> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ auditLogs }) => auditLogs.list(query));
  }
}
