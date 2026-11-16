import type { AuditLogActorView } from '../../audit/shared/audit-log-view.js';

export interface ClientActivityView {
  id: string;
  occurredAt: Date;
  actor: AuditLogActorView | null;
  action: string;
  resourceType: string;
  resourceId: string;
  summary: string;
}
