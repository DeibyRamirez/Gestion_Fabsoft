import type { ClientContactView } from './client-contact-view.js';

export const clientContactAuditSnapshot = (c: ClientContactView) => ({
  fullName: c.fullName,
  email: c.email,
  phone: c.phone,
  roleTitle: c.roleTitle,
  isPrimary: c.isPrimary,
  archivedAt: c.archivedAt?.toISOString() ?? null,
});
