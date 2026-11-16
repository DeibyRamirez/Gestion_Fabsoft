import type { AuditLogListQuery } from '@fabsoft/shared';
import type { AuditLogView } from '../shared/audit-log-view.js';

export interface ListAuditLogsRepository {
  list(query: AuditLogListQuery): Promise<{ items: AuditLogView[]; total: number }>;
}

export interface ListAuditLogsRepos {
  auditLogs: ListAuditLogsRepository;
}
