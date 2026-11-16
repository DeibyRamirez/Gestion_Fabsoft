import { ListAuditLogs } from '../../application/audit/list-audit-logs/use-case.js';
import { ListClientActivity } from '../../application/clients/list-client-activity/use-case.js';
import type { Infra } from '../infra.js';

export function auditModule(infra: Infra) {
  return {
    listAuditLogs: new ListAuditLogs(infra.userUow),
    listClientActivity: new ListClientActivity(infra.userUow),
  };
}
