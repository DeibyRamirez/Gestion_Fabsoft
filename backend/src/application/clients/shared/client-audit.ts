import type { ClientView } from './client-view.js';

export const clientAuditSnapshot = (c: ClientView) => ({
  legalName: c.legalName,
  taxId: c.taxId,
  status: c.status,
  ownerUserId: c.owner?.id ?? null,
  archivedAt: c.archivedAt?.toISOString() ?? null,
});