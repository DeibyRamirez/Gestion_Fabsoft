export interface AuditLogActorView {
  id: string;
  name: string;
}

export interface AuditLogView {
  id: string;
  occurredAt: Date;
  actorType: 'user' | 'integration' | 'system';
  actor: AuditLogActorView | null;
  action: string;
  resourceType: string;
  resourceId: string;
  clientId: string | null;
  changes: Record<string, unknown> | null;
  reason: string | null;
  requestId: string | null;
}
